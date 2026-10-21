/**
 * IPC-backed folder picker (#147).
 *
 * Implements `WorkspaceFolderPicker` over `pick_workspace_folder`: the dialog
 * is opened by Rust, so the webview needs no dialog permission. The canonical
 * path doubles as the row id, because one folder can only be added once.
 */
import { pickWorkspaceFolder } from './project-client';
import type { WorkspaceFolderPicker } from './workspace-folder-picker';

/** Builds the folder picker over the typed IPC client. */
export function createIpcWorkspaceFolderPicker(): WorkspaceFolderPicker {
  return {
    pickFolder() {
      return pickWorkspaceFolder().then(picked =>
        picked
          ? { id: picked.path, label: picked.label, path: picked.path }
          : null
      );
    }
  };
}
