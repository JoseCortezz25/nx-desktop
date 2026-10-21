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
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use super::domain::{
    ApprovalMode, HookApprovalStatus, HookDecision, MAX_FOLDERS, PickedWorkspaceFolder, Project,
    ProjectError, ProjectId, ProjectName,
};
use super::persistence as project_persistence;
use crate::persistence::{JsonPersistence, PersistenceError};
use crate::security::path_policy::{MAX_PATH_LEN, WorkspaceRootError, canonicalize_existing_root};

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
    /// Durable catalog, or `None` for the in-memory test store.
    persistence: Option<JsonPersistence>,
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
            persistence: None,
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
            persistence: None,
        }
    }

    /// Builds a store backed by the durable catalog at `path`.
    ///
    /// A missing file starts from the fixture seed; every mutation is written
    /// back. A corrupt file or an unsupported version fails startup instead of
    /// silently replacing user data.
    pub fn with_persistence(path: PathBuf) -> Result<Self, PersistenceError> {
        let persistence = JsonPersistence::new(path);
        let projects = project_persistence::load(&persistence)?.unwrap_or_else(seed_projects);
        let created_count = next_created_count(&projects);
        Ok(Self {
            inner: Mutex::new(ProjectStoreInner {
                projects,
                created_count,
                branches: seed_branches(),
            }),
            persistence: Some(persistence),
        })
    }

    /// Writes the catalog through the optional durable store.
    fn persist(&self, projects: &[Project]) -> Result<(), ProjectError> {
        match &self.persistence {
            Some(persistence) => project_persistence::save(persistence, projects)
                .map_err(|_| ProjectError::PersistenceFailed),
            None => Ok(()),
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

    /// One project snapshot, or `None` when the id is unknown.
    ///
    /// Short lock scope: the project is cloned under the guard and the guard is
    /// dropped before the caller awaits anything.
    pub fn project(&self, id: &ProjectId) -> Option<Project> {
        self.inner
            .lock()
            .ok()?
            .projects
            .iter()
            .find(|project| project.id == *id)
            .cloned()
    }

    /// Records or updates one project-scoped hook decision (Invariants tier:
    /// the project must be known; the caller validates the hook).
    ///
    /// Upsert by `hook_id`: a repeated decision never duplicates the row, which
    /// keeps `ProjectDto.hookDecisions` stable across reviews.
    pub fn set_hook_decision(
        &self,
        id: &ProjectId,
        hook_id: &str,
        approval_status: HookApprovalStatus,
    ) -> Result<Project, ProjectError> {
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
        let previous = project.hook_decisions.clone();
        match project
            .hook_decisions
            .iter_mut()
            .find(|decision| decision.hook_id == hook_id)
        {
            Some(decision) => decision.approval_status = approval_status,
            None => project.hook_decisions.push(HookDecision {
                hook_id: hook_id.to_owned(),
                approval_status,
            }),
        }
        let updated = project.clone();
        if let Err(error) = self.persist(&inner.projects) {
            // Roll back to the pre-call snapshot so memory never diverges from disk.
            if let Some(project) = inner.projects.iter_mut().find(|project| project.id == *id) {
                project.hook_decisions = previous;
            }
            return Err(error);
        }
        Ok(updated)
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
    /// folders become authorized workspace roots; missing, non-directory and
    /// duplicate folders are refused), assigns the next deterministic counter
    /// id and project-scoped defaults. The canonical paths are what is stored.
    pub fn create_project(
        &self,
        name: &ProjectName,
        folders: &[String],
    ) -> Result<(Project, Vec<Project>), ProjectError> {
        validate_folders(folders)?;
        let roots = canonicalize_new_roots(folders)?;

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
        if let Err(error) = self.persist(&inner.projects) {
            inner.projects.pop();
            inner.created_count = inner.created_count.saturating_sub(1);
            return Err(error);
        }
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
        let previous = {
            let project = inner
                .projects
                .iter_mut()
                .find(|project| project.id == *id)
                .ok_or_else(|| ProjectError::UnknownProject {
                    project_id: id.as_str().to_owned(),
                })?;
            let previous = project.approval_mode;
            project.approval_mode = mode;
            previous
        };
        if let Err(error) = self.persist(&inner.projects) {
            if let Some(project) = inner.projects.iter_mut().find(|project| project.id == *id) {
                project.approval_mode = previous;
            }
            return Err(error);
        }
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
        {
            let project = inner
                .projects
                .iter_mut()
                .find(|project| project.id == *id)
                .ok_or_else(|| ProjectError::UnknownProject {
                    project_id: id.as_str().to_owned(),
                })?;
            project.conversation_ids.push(conversation_id.to_owned());
        }
        if let Err(error) = self.persist(&inner.projects) {
            if let Some(project) = inner.projects.iter_mut().find(|project| project.id == *id) {
                project.conversation_ids.pop();
            }
            return Err(error);
        }
        Ok(())
    }

    /// Removes one conversation id from its project; the rollback companion
    /// for a failed post-creation attach.
    ///
    /// The durable write is best-effort here: the caller is already unwinding a
    /// failed creation, so a second persistence failure must not mask the first.
    pub fn detach_conversation(&self, id: &ProjectId, conversation_id: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            if let Some(project) = inner.projects.iter_mut().find(|p| p.id == *id) {
                project.conversation_ids.retain(|c| c != conversation_id);
            }
            let _ = self.persist(&inner.projects);
        }
    }
}

/// Derives the next creation counter from the loaded ids, so a restart cannot
/// reissue an id that already exists.
fn next_created_count(projects: &[Project]) -> u32 {
    projects
        .iter()
        .filter_map(|project| project.id.as_str().strip_prefix("proj-created-"))
        .filter_map(|suffix| suffix.parse::<u32>().ok())
        .max()
        .unwrap_or(0)
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

/// Maps a path-policy refusal onto the project error for that folder.
fn root_error(error: WorkspaceRootError, folder: String) -> ProjectError {
    match error {
        WorkspaceRootError::Relative => ProjectError::FolderNotAuthorized { folder },
        WorkspaceRootError::Missing => ProjectError::FolderNotFound { folder },
        WorkspaceRootError::NotADirectory => ProjectError::FolderNotDirectory { folder },
    }
}

/// Canonicalizes every folder of a new project, in order, refusing relative,
/// missing, non-directory and duplicate folders.
///
/// A relative folder is never authority, so it stays a denied-authority error
/// instead of being resolved against the process working directory.
fn canonicalize_new_roots(folders: &[String]) -> Result<Vec<String>, ProjectError> {
    let mut roots: Vec<String> = Vec::with_capacity(folders.len());
    for folder in folders {
        let canonical = canonicalize_existing_root(Path::new(folder))
            .map_err(|error| root_error(error, folder.clone()))?;
        let root = canonical.to_string_lossy().into_owned();
        if roots.contains(&root) {
            return Err(ProjectError::DuplicateFolder {
                folder: folder.clone(),
            });
        }
        roots.push(root);
    }
    Ok(roots)
}

/// Turns the folder the native dialog returned into a draft row (issue #147).
///
/// The dialog only hands back what the user chose, so the folder is checked
/// with the same rule `create_project` applies; the label is the folder's own
/// name, or the whole path for a filesystem root that has none.
pub fn describe_picked_folder(path: &Path) -> Result<PickedWorkspaceFolder, ProjectError> {
    let folder = path.to_string_lossy().into_owned();
    let canonical = canonicalize_existing_root(path).map_err(|error| root_error(error, folder))?;
    let path = canonical.to_string_lossy().into_owned();
    let label = canonical
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    Ok(PickedWorkspaceFolder { path, label })
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

    /// A fresh scratch folder under the OS temp dir, returned as its
    /// canonical path string (macOS resolves `/var` to `/private/var`).
    fn scratch_folder(name: &str) -> String {
        let root =
            std::env::temp_dir().join(format!("nx-projects-folder-{name}-{}", std::process::id()));
        if root.exists() {
            std::fs::remove_dir_all(&root).expect("scratch folder resets");
        }
        std::fs::create_dir_all(&root).expect("scratch folder exists");
        std::fs::canonicalize(&root)
            .expect("scratch folder canonicalizes")
            .to_string_lossy()
            .into_owned()
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
        let folder = scratch_folder("defaults");
        let name = ProjectName::new("Docs site").expect("name");
        let (project, projects) = store
            .create_project(&name, std::slice::from_ref(&folder))
            .expect("creation succeeds");
        assert_eq!(project.id.as_str(), "proj-created-1");
        assert_eq!(project.workspace_folders, vec![folder.clone()]);
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
    fn rejects_a_missing_folder() {
        let store = store();
        let name = ProjectName::new("Docs site").expect("name");
        let missing = format!("{}/does-not-exist", scratch_folder("missing"));
        assert_eq!(
            store
                .create_project(&name, std::slice::from_ref(&missing))
                .expect_err("missing folder"),
            ProjectError::FolderNotFound { folder: missing }
        );
        assert_eq!(store.list_projects().len(), 2);
    }

    #[test]
    fn rejects_a_folder_that_is_a_file() {
        let store = store();
        let name = ProjectName::new("Docs site").expect("name");
        let file = format!("{}/notes.txt", scratch_folder("file"));
        std::fs::write(&file, "x").expect("scratch file");
        assert_eq!(
            store
                .create_project(&name, std::slice::from_ref(&file))
                .expect_err("file, not folder"),
            ProjectError::FolderNotDirectory { folder: file }
        );
    }

    #[test]
    fn rejects_two_spellings_of_the_same_folder() {
        let store = store();
        let name = ProjectName::new("Docs site").expect("name");
        let folder = scratch_folder("duplicate");
        let respelled = format!("{folder}/.");
        assert_eq!(
            store
                .create_project(&name, &[folder.clone(), respelled.clone()])
                .expect_err("duplicate folder"),
            ProjectError::DuplicateFolder { folder: respelled }
        );
        assert_eq!(store.list_projects().len(), 2);
    }

    #[test]
    fn stores_the_canonical_form_of_each_folder() {
        let store = store();
        let name = ProjectName::new("Docs site").expect("name");
        let folder = scratch_folder("canonical");
        std::fs::create_dir_all(format!("{folder}/nested")).expect("nested folder");
        let (project, _) = store
            .create_project(&name, &[format!("{folder}/nested/..")])
            .expect("creation succeeds");
        assert_eq!(project.workspace_folders, vec![folder]);
    }

    #[test]
    fn describes_a_picked_folder_with_its_name_as_label() {
        let folder = scratch_folder("picked");
        let picked = describe_picked_folder(Path::new(&folder)).expect("existing folder");
        assert_eq!(picked.path, folder);
        let expected_label = Path::new(&folder)
            .file_name()
            .expect("named folder")
            .to_string_lossy()
            .into_owned();
        assert_eq!(picked.label, expected_label);
    }

    #[test]
    fn labels_a_filesystem_root_with_its_whole_path() {
        let picked = describe_picked_folder(Path::new("/")).expect("root exists");
        assert_eq!(picked.label, picked.path);
    }

    #[test]
    fn refuses_a_picked_folder_that_vanished() {
        let missing = format!("{}/gone", scratch_folder("vanished"));
        assert_eq!(
            describe_picked_folder(Path::new(&missing)).expect_err("missing folder"),
            ProjectError::FolderNotFound { folder: missing }
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
    fn returns_a_project_snapshot_or_none() {
        let store = store();
        let id = ProjectId::new("proj-design-system").expect("id");
        let project = store.project(&id).expect("known project");
        assert_eq!(project.name, "Design system");
        assert!(
            store
                .project(&ProjectId::new("proj-ghost").expect("id"))
                .is_none()
        );
    }

    #[test]
    fn records_a_new_hook_decision() {
        let store = store();
        let id = ProjectId::new("proj-design-system").expect("id");
        let project = store
            .set_hook_decision(&id, "hook-lint-on-write", HookApprovalStatus::Rejected)
            .expect("known project");
        assert_eq!(project.hook_decisions.len(), 1);
        assert_eq!(
            project.hook_decisions[0],
            HookDecision {
                hook_id: "hook-lint-on-write".to_owned(),
                approval_status: HookApprovalStatus::Rejected,
            }
        );
    }

    #[test]
    fn updates_an_existing_hook_decision_without_duplicating_it() {
        let store = store();
        let id = ProjectId::new("proj-api-client").expect("id");
        let project = store
            .set_hook_decision(&id, "hook-lint-on-write", HookApprovalStatus::Approved)
            .expect("known project");
        assert_eq!(project.hook_decisions.len(), 1);
        assert_eq!(
            project.hook_decisions[0].approval_status,
            HookApprovalStatus::Approved
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
    fn rejects_a_hook_decision_for_an_unknown_project() {
        let store = store();
        let id = ProjectId::new("proj-ghost").expect("id");
        assert_eq!(
            store
                .set_hook_decision(&id, "hook-lint-on-write", HookApprovalStatus::Approved)
                .expect_err("unknown project"),
            ProjectError::UnknownProject {
                project_id: "proj-ghost".to_owned(),
            }
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

    fn temp_store_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "nx-projects-store-{name}-{}.json",
            std::process::id()
        ))
    }

    #[test]
    fn persisted_projects_survive_a_reload() {
        use std::fs;

        let path = temp_store_path("reload");
        let _ = fs::remove_file(&path);
        let name = ProjectName::new("Docs site").expect("name");
        let first = scratch_folder("reload-one");
        let second = scratch_folder("reload-two");
        let store = ProjectStore::with_persistence(path.clone()).expect("store opens");
        let (created, _) = store
            .create_project(&name, &[first])
            .expect("creation succeeds");
        assert_eq!(created.id.as_str(), "proj-created-1");
        drop(store);

        let reloaded = ProjectStore::with_persistence(path.clone()).expect("store reloads");
        assert!(
            reloaded
                .list_projects()
                .iter()
                .any(|project| project.id.as_str() == "proj-created-1")
        );
        let (next, _) = reloaded
            .create_project(&name, &[second])
            .expect("second creation succeeds");
        assert_eq!(next.id.as_str(), "proj-created-2");

        fs::remove_file(&path).expect("scratch cleanup");
    }

    #[test]
    fn persisted_approval_mode_survives_a_reload() {
        use std::fs;

        let path = temp_store_path("approval");
        let _ = fs::remove_file(&path);
        let store = ProjectStore::with_persistence(path.clone()).expect("store opens");
        let id = ProjectId::new("proj-design-system").expect("id");
        store
            .set_approval_mode(&id, ApprovalMode::FullAccess)
            .expect("policy changes");
        drop(store);

        let reloaded = ProjectStore::with_persistence(path.clone()).expect("store reloads");
        let project = reloaded
            .list_projects()
            .into_iter()
            .find(|project| project.id == id)
            .expect("project persists");
        assert_eq!(project.approval_mode, ApprovalMode::FullAccess);

        fs::remove_file(&path).expect("scratch cleanup");
    }

    #[test]
    fn persisted_hook_decision_survives_a_reload() {
        use std::fs;

        let path = temp_store_path("hook-decision");
        let _ = fs::remove_file(&path);
        let store = ProjectStore::with_persistence(path.clone()).expect("store opens");
        let id = ProjectId::new("proj-design-system").expect("id");
        store
            .set_hook_decision(&id, "hook-lint-on-write", HookApprovalStatus::Approved)
            .expect("decision records");
        drop(store);

        let reloaded = ProjectStore::with_persistence(path.clone()).expect("store reloads");
        let project = reloaded.project(&id).expect("project persists");
        assert_eq!(
            project.hook_decisions,
            vec![HookDecision {
                hook_id: "hook-lint-on-write".to_owned(),
                approval_status: HookApprovalStatus::Approved,
            }]
        );

        fs::remove_file(&path).expect("scratch cleanup");
    }

    #[test]
    fn persisted_conversation_attachment_survives_a_reload() {
        use std::fs;

        let path = temp_store_path("attach");
        let _ = fs::remove_file(&path);
        let store = ProjectStore::with_persistence(path.clone()).expect("store opens");
        let id = ProjectId::new("proj-design-system").expect("id");
        store
            .attach_conversation(&id, "conv-created-1")
            .expect("attach succeeds");
        drop(store);

        let reloaded = ProjectStore::with_persistence(path.clone()).expect("store reloads");
        let project = reloaded
            .list_projects()
            .into_iter()
            .find(|project| project.id == id)
            .expect("project persists");
        assert!(
            project
                .conversation_ids
                .contains(&"conv-created-1".to_owned())
        );

        fs::remove_file(&path).expect("scratch cleanup");
    }
}
