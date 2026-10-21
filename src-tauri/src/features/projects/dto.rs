//! Project catalog DTOs (issue #16, slice 2).
//!
//! Wire shapes only: the service, command, path authority and persistence live
//! in #18. `ApprovalModeDto` and `HookApprovalStatusDto` are wire enums with the
//! same `snake_case` values as the TypeScript domain unions.

use serde::{Deserialize, Serialize};

use super::domain::HookApprovalStatus;

/// Tool approval policy for a project (`ask_always` | `auto_approve` | `full_access`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalModeDto {
    AskAlways,
    AutoApprove,
    FullAccess,
}

/// Whether the user allowed, deferred, or declined a hook.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookApprovalStatusDto {
    Pending,
    Approved,
    Rejected,
}

/// The decision a project remembers about one reviewed hook.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookDecisionDto {
    pub hook_id: String,
    pub approval_status: HookApprovalStatusDto,
}

/// A project: a named set of authorized local workspace folders.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDto {
    pub id: String,
    pub name: String,
    pub workspace_folders: Vec<String>,
    /// Project-scoped tool approval policy; never global or per conversation.
    pub approval_mode: ApprovalModeDto,
    pub hook_decisions: Vec<HookDecisionDto>,
    pub conversation_ids: Vec<String>,
}

/// The row a creation produced, together with the list it joined.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedProjectDto {
    pub project: ProjectDto,
    pub projects: Vec<ProjectDto>,
}

/// Request envelope for `create_project`; the core decides id and defaults.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateProjectRequestDto {
    pub name: String,
    pub folders: Vec<String>,
}

/// A folder the user chose in the native dialog (`pick_workspace_folder`).
///
/// `path` is the canonical folder; `label` is its display name. A cancelled
/// dialog is `null` on the wire, not an empty row.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedWorkspaceFolderDto {
    pub path: String,
    pub label: String,
}

/// Request envelope for `set_project_approval_mode`; authority-bearing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetProjectApprovalModeRequestDto {
    pub project_id: String,
    pub approval_mode: ApprovalModeDto,
}

/// Request envelope for `list_workspace_branches`; authority-bearing.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListWorkspaceBranchesRequestDto {
    pub project_id: String,
}

/// Projects the project-scoped hook decision status onto its wire enum.
///
/// One projection for the project catalog and the hook review, so the two
/// surfaces cannot disagree about the closed three-value set.
pub fn to_hook_approval_status_dto(status: HookApprovalStatus) -> HookApprovalStatusDto {
    match status {
        HookApprovalStatus::Pending => HookApprovalStatusDto::Pending,
        HookApprovalStatus::Approved => HookApprovalStatusDto::Approved,
        HookApprovalStatus::Rejected => HookApprovalStatusDto::Rejected,
    }
}

/// Reads a closed wire status back into the domain enum.
pub fn from_hook_approval_status_dto(dto: HookApprovalStatusDto) -> HookApprovalStatus {
    match dto {
        HookApprovalStatusDto::Pending => HookApprovalStatus::Pending,
        HookApprovalStatusDto::Approved => HookApprovalStatus::Approved,
        HookApprovalStatusDto::Rejected => HookApprovalStatus::Rejected,
    }
}
