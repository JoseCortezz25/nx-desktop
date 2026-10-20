//! Project store persistence (issue #22).
//!
//! A versioned JSON record per project, mapped to/from the domain so the IPC
//! DTOs and the domain stay untouched. The store calls these helpers while it
//! holds its short lock; the file is small and the call is synchronous.

use serde::{Deserialize, Serialize};

use super::domain::{ApprovalMode, HookApprovalStatus, HookDecision, Project, ProjectId};
use crate::persistence::{JsonPersistence, PersistenceError};

const FORMAT_VERSION: u32 = 1;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectsFile {
    version: u32,
    projects: Vec<PersistedProject>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedProject {
    id: String,
    name: String,
    workspace_folders: Vec<String>,
    approval_mode: PersistedApprovalMode,
    hook_decisions: Vec<PersistedHookDecision>,
    conversation_ids: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum PersistedApprovalMode {
    AskAlways,
    AutoApprove,
    FullAccess,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedHookDecision {
    hook_id: String,
    approval_status: PersistedHookApprovalStatus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum PersistedHookApprovalStatus {
    Pending,
    Approved,
    Rejected,
}

/// Loads the persisted project catalog, or `None` when the file is absent.
pub(super) fn load(
    persistence: &JsonPersistence,
) -> Result<Option<Vec<Project>>, PersistenceError> {
    let Some(file) = persistence.load::<ProjectsFile>()? else {
        return Ok(None);
    };
    if file.version != FORMAT_VERSION {
        return Err(PersistenceError::UnsupportedVersion {
            found: file.version,
            expected: FORMAT_VERSION,
        });
    }
    let projects = file
        .projects
        .into_iter()
        .map(to_domain)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Some(projects))
}

/// Writes the full project catalog.
pub(super) fn save(
    persistence: &JsonPersistence,
    projects: &[Project],
) -> Result<(), PersistenceError> {
    persistence.save(&ProjectsFile {
        version: FORMAT_VERSION,
        projects: projects.iter().map(from_domain).collect(),
    })
}

fn to_domain(record: PersistedProject) -> Result<Project, PersistenceError> {
    Ok(Project {
        id: ProjectId::new(record.id).map_err(|_| PersistenceError::InvalidData {
            field: "projects[].id",
        })?,
        name: record.name,
        workspace_folders: record.workspace_folders,
        approval_mode: match record.approval_mode {
            PersistedApprovalMode::AskAlways => ApprovalMode::AskAlways,
            PersistedApprovalMode::AutoApprove => ApprovalMode::AutoApprove,
            PersistedApprovalMode::FullAccess => ApprovalMode::FullAccess,
        },
        hook_decisions: record
            .hook_decisions
            .into_iter()
            .map(|decision| HookDecision {
                hook_id: decision.hook_id,
                approval_status: match decision.approval_status {
                    PersistedHookApprovalStatus::Pending => HookApprovalStatus::Pending,
                    PersistedHookApprovalStatus::Approved => HookApprovalStatus::Approved,
                    PersistedHookApprovalStatus::Rejected => HookApprovalStatus::Rejected,
                },
            })
            .collect(),
        conversation_ids: record.conversation_ids,
    })
}

fn from_domain(project: &Project) -> PersistedProject {
    PersistedProject {
        id: project.id.as_str().to_owned(),
        name: project.name.clone(),
        workspace_folders: project.workspace_folders.clone(),
        approval_mode: match project.approval_mode {
            ApprovalMode::AskAlways => PersistedApprovalMode::AskAlways,
            ApprovalMode::AutoApprove => PersistedApprovalMode::AutoApprove,
            ApprovalMode::FullAccess => PersistedApprovalMode::FullAccess,
        },
        hook_decisions: project
            .hook_decisions
            .iter()
            .map(|decision| PersistedHookDecision {
                hook_id: decision.hook_id.clone(),
                approval_status: match decision.approval_status {
                    HookApprovalStatus::Pending => PersistedHookApprovalStatus::Pending,
                    HookApprovalStatus::Approved => PersistedHookApprovalStatus::Approved,
                    HookApprovalStatus::Rejected => PersistedHookApprovalStatus::Rejected,
                },
            })
            .collect(),
        conversation_ids: project.conversation_ids.clone(),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;

    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("nx-projects-{name}-{}.json", std::process::id()))
    }

    fn project() -> Project {
        Project {
            id: ProjectId::new("proj-design-system").expect("fixture id"),
            name: "Design system".to_owned(),
            workspace_folders: vec!["/workspace/design-system".to_owned()],
            approval_mode: ApprovalMode::AutoApprove,
            hook_decisions: vec![HookDecision {
                hook_id: "hook-lint-on-write".to_owned(),
                approval_status: HookApprovalStatus::Rejected,
            }],
            conversation_ids: vec!["conv-composer-chain".to_owned()],
        }
    }

    #[test]
    fn round_trips_the_project_catalog() {
        let path = temp_file("round-trip");
        let persistence = JsonPersistence::new(&path);
        save(&persistence, &[project()]).expect("catalog saves");
        assert_eq!(
            load(&persistence).expect("catalog loads"),
            Some(vec![project()])
        );
        fs::remove_file(&path).expect("scratch cleanup");
    }

    #[test]
    fn a_missing_file_loads_as_none() {
        let path = temp_file("missing");
        let _ = fs::remove_file(&path);
        assert_eq!(
            load(&JsonPersistence::new(&path)).expect("missing is not an error"),
            None
        );
    }

    #[test]
    fn an_unsupported_version_is_rejected() {
        let path = temp_file("version");
        let persistence = JsonPersistence::new(&path);
        persistence
            .save(&serde_json::json!({ "version": 2, "projects": [] }))
            .expect("fixture document");
        assert!(matches!(
            load(&persistence),
            Err(PersistenceError::UnsupportedVersion {
                found: 2,
                expected: 1
            })
        ));
        fs::remove_file(&path).expect("scratch cleanup");
    }

    #[test]
    fn an_invalid_project_id_is_rejected() {
        let path = temp_file("invalid");
        let persistence = JsonPersistence::new(&path);
        persistence
            .save(&serde_json::json!({
                "version": 1,
                "projects": [{
                    "id": "  ",
                    "name": "Invalid",
                    "workspaceFolders": [],
                    "approvalMode": "ask_always",
                    "hookDecisions": [],
                    "conversationIds": []
                }]
            }))
            .expect("fixture document");
        assert!(matches!(
            load(&persistence),
            Err(PersistenceError::InvalidData {
                field: "projects[].id"
            })
        ));
        fs::remove_file(&path).expect("scratch cleanup");
    }
}
