//! Project catalog use cases (issue #18).
//!
//! Owns the persisted project list, the per-project branch map and the
//! workspace-root authority check behind `create_project`: every folder a new
//! project authorizes is canonicalized through the shared `path_policy` before
//! it becomes a root. The store is synchronous and guarded by a
//! `std::sync::Mutex` with short lock scopes (clone under lock, drop the
//! guard, then compute), so no guard is ever held across `.await` by
//! construction — there is no async I/O in this issue.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use super::domain::{
    ApprovalMode, HookApprovalStatus, HookDecision, MAX_FOLDERS, Project, ProjectError, ProjectId,
    ProjectName,
};
use crate::security::path_policy::{MAX_PATH_LEN, canonicalize_or_normalize_root};

struct ProjectStoreInner {
    projects: Vec<Project>,
    created_count: u32,
    /// Seeded per-project branch lists; real `git` discovery is a later
    /// ticket, so this map is authority data, not a repository read.
    branches: HashMap<String, Vec<String>>,
}

/// Long-lived owner of the project catalog.
pub struct ProjectStore {
    inner: Mutex<ProjectStoreInner>,
}

impl ProjectStore {
    /// Builds the store seeded from the frozen #16 fixture rows so service
    /// output matches the pinned wire shapes.
    pub fn seeded() -> Self {
        Self {
            inner: Mutex::new(ProjectStoreInner {
                projects: seed_projects(),
                created_count: 0,
                branches: seed_branches(),
            }),
        }
    }

    /// Builds a store from an explicit project list (tests pin the
    /// single-project catalog the creation fixture models).
    pub fn from_projects(projects: Vec<Project>) -> Self {
        Self {
            inner: Mutex::new(ProjectStoreInner {
                projects,
                created_count: 0,
                branches: seed_branches(),
            }),
        }
    }

    /// Every persisted project, seed order preserved.
    pub fn list_projects(&self) -> Vec<Project> {
        // Short lock scope: clone under the guard, then drop it.
        self.inner
            .lock()
            .map(|inner| inner.projects.clone())
            .unwrap_or_default()
    }

    /// Whether the catalog holds this project id (Authority tier probe).
    pub fn contains(&self, id: &ProjectId) -> bool {
        self.inner
            .lock()
            .map(|inner| inner.projects.iter().any(|project| project.id == *id))
            .unwrap_or(false)
    }

    /// The authorized workspace roots of one project, in project order.
    ///
    /// Short lock scope: the folder list is cloned under the guard. #21 resolves
    /// every file path against these roots before reading or spawning anything.
    pub fn workspace_roots(&self, id: &ProjectId) -> Result<Vec<String>, ProjectError> {
        self.inner
            .lock()
            .map_err(|_| ProjectError::UnknownProject {
                project_id: id.as_str().to_owned(),
            })?
            .projects
            .iter()
            .find(|project| project.id == *id)
            .map(|project| project.workspace_folders.clone())
            .ok_or_else(|| ProjectError::UnknownProject {
                project_id: id.as_str().to_owned(),
            })
    }

    /// Persists one project: validates Limits (folder count and sizes),
    /// canonicalizes each folder through the path policy (Authority tier —
    /// folders become authorized workspace roots), assigns the next
    /// deterministic counter id and project-scoped defaults.
    pub fn create_project(
        &self,
        name: &ProjectName,
        folders: &[String],
    ) -> Result<(Project, Vec<Project>), ProjectError> {
        validate_folders(folders)?;
        let mut roots = Vec::with_capacity(folders.len());
        for folder in folders {
            let path = Path::new(folder);
            // A relative folder is never authority: reject it instead of
            // resolving it against the process working directory.
            canonicalize_or_normalize_root(path).map_err(|_| {
                ProjectError::FolderNotAuthorized {
                    folder: folder.clone(),
                }
            })?;
            roots.push(folder.clone());
        }

        let mut inner = self
            .inner
            .lock()
            .map_err(|_| ProjectError::UnknownProject {
                project_id: String::new(),
            })?;
        inner.created_count += 1;
        let project = Project {
            // Static format string over a counter: infallible by construction.
            id: ProjectId::new(format!("proj-created-{}", inner.created_count))
                .unwrap_or_else(|_| unreachable_project_id(inner.created_count)),
            name: name.as_str().to_owned(),
            workspace_folders: roots,
            // The issue specifies no default, so new projects start at the
            // most restrictive approval level.
            approval_mode: ApprovalMode::AskAlways,
            hook_decisions: Vec::new(),
            conversation_ids: Vec::new(),
        };
        inner.projects.push(project.clone());
        Ok((project, inner.projects.clone()))
    }

    /// Persists one project's approval policy (Invariants tier: the project
    /// must be known) and returns the updated catalog.
    pub fn set_approval_mode(
        &self,
        id: &ProjectId,
        mode: ApprovalMode,
    ) -> Result<Vec<Project>, ProjectError> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| ProjectError::UnknownProject {
                project_id: id.as_str().to_owned(),
            })?;
        let project = inner
            .projects
            .iter_mut()
            .find(|project| project.id == *id)
            .ok_or_else(|| ProjectError::UnknownProject {
                project_id: id.as_str().to_owned(),
            })?;
        project.approval_mode = mode;
        Ok(inner.projects.clone())
    }

    /// The workspace branches of one project (Invariants tier: the project
    /// must be known), repository order preserved.
    pub fn list_branches(&self, id: &ProjectId) -> Result<Vec<String>, ProjectError> {
        let inner = self
            .inner
            .lock()
            .map_err(|_| ProjectError::UnknownProject {
                project_id: id.as_str().to_owned(),
            })?;
        if !inner.projects.iter().any(|project| project.id == *id) {
            return Err(ProjectError::UnknownProject {
                project_id: id.as_str().to_owned(),
            });
        }
        Ok(inner.branches.get(id.as_str()).cloned().unwrap_or_default())
    }

    /// Records a created conversation on its owning project (Invariants tier).
    pub fn attach_conversation(
        &self,
        id: &ProjectId,
        conversation_id: &str,
    ) -> Result<(), ProjectError> {
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| ProjectError::UnknownProject {
                project_id: id.as_str().to_owned(),
            })?;
        let project = inner
            .projects
            .iter_mut()
            .find(|project| project.id == *id)
            .ok_or_else(|| ProjectError::UnknownProject {
                project_id: id.as_str().to_owned(),
            })?;
        project.conversation_ids.push(conversation_id.to_owned());
        Ok(())
    }

    /// Removes one conversation id from its project; the rollback companion
    /// for a failed post-creation attach.
    pub fn detach_conversation(&self, id: &ProjectId, conversation_id: &str) {
        if let Ok(mut inner) = self.inner.lock()
            && let Some(project) = inner.projects.iter_mut().find(|p| p.id == *id)
        {
            project.conversation_ids.retain(|c| c != conversation_id);
        }
    }
}

/// Fallback id when the deterministic counter format is rejected. The format
/// string is static and the counter is numeric, so this is unreachable; it
/// exists because `.expect()` is banned on all paths in this module.
fn unreachable_project_id(count: u32) -> ProjectId {
    ProjectId::new(format!("proj-fallback-{count}")).unwrap_or_else(|_| {
        // Double fallback over a static literal, which the constructor
        // accepts: non-empty and far below the length limit.
        ProjectId::new("proj-fallback")
            .unwrap_or_else(|_| panic!("static fallback project id must satisfy the Limits tier"))
    })
}

/// Validates the folder list at the Limits tier (count, emptiness, sizes).
/// Authority (canonicalization) happens in `create_project` itself.
fn validate_folders(folders: &[String]) -> Result<(), ProjectError> {
    if folders.is_empty() {
        return Err(ProjectError::NoFolders);
    }
    if folders.len() > MAX_FOLDERS {
        return Err(ProjectError::TooManyFolders { len: folders.len() });
    }
    for folder in folders {
        if folder.trim().is_empty() {
            return Err(ProjectError::EmptyFolder);
        }
        if folder.len() > MAX_PATH_LEN {
            return Err(ProjectError::FolderTooLong { len: folder.len() });
        }
    }
    Ok(())
}

/// The frozen #16 fixture projects (`projects-list-projects.json`).
fn seed_projects() -> Vec<Project> {
    vec![
        Project {
            // Static fixture ids: known-good literals, non-empty and short.
            id: ProjectId::new("proj-design-system").expect("fixture project id"),
            name: "Design system".to_owned(),
            workspace_folders: vec!["/workspace/design-system".to_owned()],
            approval_mode: ApprovalMode::AskAlways,
            hook_decisions: Vec::new(),
            conversation_ids: vec![
                "conv-composer-chain".to_owned(),
                "conv-diff-review".to_owned(),
            ],
        },
        Project {
            id: ProjectId::new("proj-api-client").expect("fixture project id"),
            name: "API client".to_owned(),
            workspace_folders: vec![
                "/workspace/api-client".to_owned(),
                "/workspace/shared-contracts".to_owned(),
            ],
            approval_mode: ApprovalMode::AutoApprove,
            hook_decisions: vec![HookDecision {
                hook_id: "hook-lint-on-write".to_owned(),
                approval_status: HookApprovalStatus::Rejected,
            }],
            conversation_ids: vec!["conv-hooks-review".to_owned()],
        },
    ]
}

/// The frozen #16 per-project branch lists
/// (`projects-list-workspace-branches.json` plus the mock workspace
/// repository's second project entry).
fn seed_branches() -> HashMap<String, Vec<String>> {
    HashMap::from([
        (
            "proj-design-system".to_owned(),
            vec![
                "main".to_owned(),
                "feat/context-bar".to_owned(),
                "fix/chip-contrast".to_owned(),
            ],
        ),
        (
            "proj-api-client".to_owned(),
            vec!["develop".to_owned(), "release/2.0".to_owned()],
        ),
    ])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> ProjectStore {
        ProjectStore::seeded()
    }

    #[test]
    fn lists_both_fixture_projects() {
        let ids: Vec<String> = store()
            .list_projects()
            .iter()
            .map(|project| project.id.as_str().to_owned())
            .collect();
        assert_eq!(
            ids,
            vec![
                "proj-design-system".to_owned(),
                "proj-api-client".to_owned()
            ]
        );
    }

    #[test]
    fn creates_a_project_with_counter_id_and_defaults() {
        let store = store();
        let name = ProjectName::new("Docs site").expect("name");
        let (project, projects) = store
            .create_project(&name, &["/workspace/docs-site".to_owned()])
            .expect("creation succeeds");
        assert_eq!(project.id.as_str(), "proj-created-1");
        assert_eq!(project.approval_mode, ApprovalMode::AskAlways);
        assert!(project.hook_decisions.is_empty());
        assert!(project.conversation_ids.is_empty());
        assert_eq!(projects.len(), 3);
    }

    #[test]
    fn rejects_creation_without_folders() {
        let store = store();
        let name = ProjectName::new("Docs site").expect("name");
        assert_eq!(
            store.create_project(&name, &[]).expect_err("no folders"),
            ProjectError::NoFolders
        );
    }

    #[test]
    fn rejects_a_relative_folder_as_unauthorized() {
        let store = store();
        let name = ProjectName::new("Docs site").expect("name");
        assert_eq!(
            store
                .create_project(&name, &["workspace/docs-site".to_owned()])
                .expect_err("relative folder"),
            ProjectError::FolderNotAuthorized {
                folder: "workspace/docs-site".to_owned(),
            }
        );
    }

    #[test]
    fn sets_the_approval_mode_of_a_known_project() {
        let store = store();
        let id = ProjectId::new("proj-design-system").expect("id");
        let projects = store
            .set_approval_mode(&id, ApprovalMode::FullAccess)
            .expect("known project");
        assert_eq!(projects[0].approval_mode, ApprovalMode::FullAccess);
        assert_eq!(projects[1].approval_mode, ApprovalMode::AutoApprove);
    }

    #[test]
    fn rejects_the_approval_mode_of_an_unknown_project() {
        let store = store();
        let id = ProjectId::new("proj-ghost").expect("id");
        assert_eq!(
            store
                .set_approval_mode(&id, ApprovalMode::FullAccess)
                .expect_err("unknown project"),
            ProjectError::UnknownProject {
                project_id: "proj-ghost".to_owned(),
            }
        );
    }

    #[test]
    fn lists_the_seeded_branches_of_a_known_project() {
        let store = store();
        let id = ProjectId::new("proj-design-system").expect("id");
        assert_eq!(
            store.list_branches(&id).expect("known project"),
            vec![
                "main".to_owned(),
                "feat/context-bar".to_owned(),
                "fix/chip-contrast".to_owned()
            ]
        );
    }

    #[test]
    fn rejects_branches_of_an_unknown_project() {
        let store = store();
        let id = ProjectId::new("proj-ghost").expect("id");
        assert_eq!(
            store.list_branches(&id).expect_err("unknown project"),
            ProjectError::UnknownProject {
                project_id: "proj-ghost".to_owned(),
            }
        );
    }

    #[test]
    fn attaches_a_conversation_to_its_project() {
        let store = store();
        let id = ProjectId::new("proj-design-system").expect("id");
        store
            .attach_conversation(&id, "conv-created-1")
            .expect("known project");
        let project = store
            .list_projects()
            .into_iter()
            .find(|project| project.id == id)
            .expect("project persists");
        assert!(
            project
                .conversation_ids
                .contains(&"conv-created-1".to_owned())
        );
    }

    #[test]
    fn returns_the_workspace_roots_of_a_known_project() {
        let store = store();
        let id = ProjectId::new("proj-api-client").expect("id");
        assert_eq!(
            store.workspace_roots(&id).expect("known project"),
            vec![
                "/workspace/api-client".to_owned(),
                "/workspace/shared-contracts".to_owned()
            ]
        );
    }

    #[test]
    fn rejects_workspace_roots_of_an_unknown_project() {
        let store = store();
        let id = ProjectId::new("proj-ghost").expect("id");
        assert_eq!(
            store.workspace_roots(&id).expect_err("unknown project"),
            ProjectError::UnknownProject {
                project_id: "proj-ghost".to_owned(),
            }
        );
    }
}
