/**
 * Vocabulary of the create-project flow (#9).
 *
 * These shapes are the seam the dialog, the pure rules and the project port
 * share. They are deliberately separate from the domain `Project`: a draft is
 * in-progress UI state, and `CreateProjectInput` is the validated value the port
 * receives — the port, not the UI, decides the id and the project's defaults.
 */
import type { WorkspacePath } from '@/shared/domain/value-objects.types';

/**
 * One source folder the mocked picker can attach to a new project.
 *
 * The folder picker is mocked in this ticket, so the catalog behind it is typed
 * fixture data rather than a filesystem/IPC read; `id` is the stable key the
 * draft and the row list use.
 */
export interface SourceFolder {
  readonly id: string;
  /** Display name of the folder, drawn in its row. */
  readonly label: string;
  /** The authorized workspace root the folder contributes. */
  readonly path: WorkspacePath;
}

/** The in-progress form the dialog renders and the shell owns. */
export interface CreateProjectDraft {
  readonly name: string;
  readonly folders: readonly SourceFolder[];
}

/** The validated value the creation port receives. */
export interface CreateProjectInput {
  readonly name: string;
  readonly folders: readonly WorkspacePath[];
}

/**
 * Outcome of the project-name rule.
 *
 * The issue asks only that the name be "validated"; no uniqueness, charset,
 * length or duplicate policy is implied, so the rule is the minimal trimmed
 * non-empty one and `valid` carries the normalized name.
 */
export type ProjectNameValidation =
  | { readonly status: 'valid'; readonly name: string }
  | { readonly status: 'empty' };

/** Outcome of asking the mocked source-folder catalog for the next folder. */
export type SourceFolderAvailability =
  | { readonly status: 'available'; readonly folder: SourceFolder }
  | { readonly status: 'exhausted' };
