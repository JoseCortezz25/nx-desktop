//! Project catalog domain (issue #18).
//!
//! Pure product rules for projects: identities, name validation, the
//! project-scoped approval policy and hook decisions
//! (`business-logic.md` §2, §3.3). No Tauri, no Serde wire attributes and no
//! filesystem access — those live in `dto.rs`, `commands.rs`, `service.rs`
//! and `security/path_policy.rs` respectively, per the DTO ≠ Domain rule.

/// Maximum accepted length for project ids (Limits tier).
pub const MAX_ID_LEN: usize = 128;

/// Maximum accepted length for project names (Limits tier).
pub const MAX_NAME_LEN: usize = 256;

/// Maximum number of workspace folders per project (Limits tier).
pub const MAX_FOLDERS: usize = 32;

/// Identity of a project (`proj-design-system`, `proj-created-1`, ...).
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ProjectId(String);

impl ProjectId {
    /// Builds an id, rejecting blank or overlong input at the Limits tier.
    pub fn new(id: impl Into<String>) -> Result<Self, ProjectError> {
        let id = id.into();
        if id.trim().is_empty() {
            return Err(ProjectError::EmptyProjectId);
        }
        if id.len() > MAX_ID_LEN {
            return Err(ProjectError::IdTooLong { len: id.len() });
        }
        Ok(Self(id))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// A validated project name; the normalized (trimmed) value is what the store
/// keeps, mirroring the frontend's minimal trimmed non-empty rule (#9).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectName(String);

impl ProjectName {
    /// Builds a name, rejecting blank or overlong input at the Limits tier.
    /// No uniqueness or charset policy is implied: duplicates and punctuation
    /// are accepted, matching the frontend rule.
    pub fn new(name: impl Into<String>) -> Result<Self, ProjectError> {
        let name = name.into();
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(ProjectError::EmptyName);
        }
        if trimmed.len() > MAX_NAME_LEN {
            return Err(ProjectError::NameTooLong { len: trimmed.len() });
        }
        Ok(Self(trimmed.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Tool approval policy for a project (`business-logic.md` §2).
///
/// Scope is per project, never global or per conversation: the composer chip
/// reads the level back from the owning project.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalMode {
    AskAlways,
    AutoApprove,
    FullAccess,
}

/// Whether the user allowed, deferred, or declined a hook.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HookApprovalStatus {
    Pending,
    Approved,
    Rejected,
}

/// The decision a project remembers about one reviewed hook.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HookDecision {
    pub hook_id: String,
    pub approval_status: HookApprovalStatus,
}

/// A project: a named set of authorized local workspace folders.
///
/// Conversations are referenced by id only; the conversations module owns the
/// history, so the project record never duplicates it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    pub id: ProjectId,
    pub name: String,
    pub workspace_folders: Vec<String>,
    pub approval_mode: ApprovalMode,
    pub hook_decisions: Vec<HookDecision>,
    pub conversation_ids: Vec<String>,
}

/// The ways project validation can fail.
///
/// Kept free of IPC types on purpose: the service maps each variant to an
/// `AppErrorDto`, so this enum never decides wire codes itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProjectError {
    EmptyProjectId,
    IdTooLong {
        len: usize,
    },
    EmptyName,
    NameTooLong {
        len: usize,
    },
    NoFolders,
    TooManyFolders {
        len: usize,
    },
    EmptyFolder,
    FolderTooLong {
        len: usize,
    },
    /// A folder the path policy refused (relative root, escape, ...). The
    /// service attaches the policy detail; commands report it as denied
    /// authority, since folders become authorized workspace roots.
    FolderNotAuthorized {
        folder: String,
    },
    UnknownProject {
        project_id: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_reject_blank_input() {
        assert_eq!(
            ProjectId::new("  ").expect_err("blank project id"),
            ProjectError::EmptyProjectId
        );
    }

    #[test]
    fn ids_reject_overlong_input() {
        let long = "p".repeat(MAX_ID_LEN + 1);
        assert_eq!(
            ProjectId::new(long).expect_err("overlong project id"),
            ProjectError::IdTooLong {
                len: MAX_ID_LEN + 1
            }
        );
    }

    #[test]
    fn names_accept_a_trimmed_value() {
        let name = ProjectName::new("  Docs site  ").expect("valid name");
        assert_eq!(name.as_str(), "Docs site");
    }

    #[test]
    fn names_reject_blank_input() {
        assert_eq!(
            ProjectName::new("   ").expect_err("blank name"),
            ProjectError::EmptyName
        );
    }

    #[test]
    fn names_reject_overlong_input() {
        let long = "n".repeat(MAX_NAME_LEN + 1);
        assert_eq!(
            ProjectName::new(long).expect_err("overlong name"),
            ProjectError::NameTooLong {
                len: MAX_NAME_LEN + 1
            }
        );
    }

    #[test]
    fn names_accept_duplicates_and_punctuation() {
        // No uniqueness or charset policy is implied (#9): the rule stays the
        // minimal trimmed non-empty one.
        assert!(ProjectName::new("Gamma app").is_ok());
        assert!(ProjectName::new("gamma app").is_ok());
        assert!(ProjectName::new("a/b:c*?").is_ok());
    }
}
