/**
 * Wire contracts for the project catalog (issue #16, slice 2).
 *
 * A project authorizes workspace roots and owns the project-scoped approval
 * policy and hook decisions (`.claude/knowledge/business-logic.md` §2). These
 * `*Dto` shapes mirror `src-tauri/src/features/projects/dto.rs` and the shared
 * fixtures; the domain `Project` stays in `src/shared/domain/`.
 */
import type { ApprovalMode } from '@/shared/domain/approval-mode.types';
import type { HookApprovalStatus } from '@/shared/domain/hook.types';
import type {
  ConversationId,
  HookId,
  ProjectId,
  WorkspacePath
} from '@/shared/domain/value-objects.types';

/** The decision a project remembers about one reviewed hook. */
export interface HookDecisionDto {
  hookId: HookId;
  approvalStatus: HookApprovalStatus;
}

/** A project: a named set of authorized local workspace folders. */
export interface ProjectDto {
  id: ProjectId;
  name: string;
  workspaceFolders: WorkspacePath[];
  /** Project-scoped tool approval policy; never global or per conversation. */
  approvalMode: ApprovalMode;
  hookDecisions: HookDecisionDto[];
  conversationIds: ConversationId[];
}

/**
 * The row a creation produced, together with the list it joined.
 *
 * Shape preserved from `ProjectRepository.createProject` so #18/#22 can swap
 * the mock for this client without changing the published seam.
 */
export interface CreatedProjectDto {
  project: ProjectDto;
  projects: ProjectDto[];
}

/** Request envelope for `create_project`; the core decides id and defaults. */
export interface CreateProjectRequestDto {
  name: string;
  folders: WorkspacePath[];
}

/**
 * The folder the native dialog returned (`pick_workspace_folder`, #147).
 *
 * `path` is canonical and `label` is the folder's display name; a cancelled
 * dialog is `null`, never an empty row.
 */
export interface PickedWorkspaceFolderDto {
  path: WorkspacePath;
  label: string;
}

/** Request envelope for `set_project_approval_mode`; authority-bearing. */
export interface SetProjectApprovalModeRequestDto {
  projectId: ProjectId;
  approvalMode: ApprovalMode;
}
