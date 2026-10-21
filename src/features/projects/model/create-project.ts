/**
 * Pure rules of the create-project flow (#9).
 *
 * They live outside the components for the reason `composer-draft.ts` records:
 * this repository's test runner is a node environment with no DOM, so a rule
 * only observable through JSX event wiring cannot be asserted. Every function
 * here reads its input and returns a new value without mutating it.
 *
 * Two product boundaries are held on purpose:
 *
 * - the name rule is the minimal trimmed non-empty one — no uniqueness, charset
 *   or length policy is invented, because the issue specifies none;
 * - folders come from the native folder dialog the Rust core opens (#147), so
 *   these rules only append what the picker returned; existence and
 *   uniqueness are enforced again by `create_project` in Rust.
 */
import type {
  CreateProjectDraft,
  CreateProjectInput,
  ProjectNameValidation,
  SourceFolder
} from './create-project.types';

/** The state the dialog opens in: no name, no folders. */
export const EMPTY_CREATE_PROJECT_DRAFT: CreateProjectDraft = {
  name: '',
  folders: []
};

/** The draft with the name a keystroke produced; the folders are kept. */
export function changeProjectName(
  draft: CreateProjectDraft,
  name: string
): CreateProjectDraft {
  return { ...draft, name };
}

/**
 * The draft with the picked folder appended.
 *
 * A cancelled pick (`null`) and a folder whose path the draft already holds
 * both leave the draft unchanged, so cancelling adds nothing and the same
 * folder is never listed twice.
 */
export function addSourceFolder(
  draft: CreateProjectDraft,
  folder: SourceFolder | null
): CreateProjectDraft {
  if (!folder || draft.folders.some(taken => taken.path === folder.path)) {
    return draft;
  }

  return { ...draft, folders: [...draft.folders, folder] };
}

/** The draft without the folder carrying `folderId`; the others are kept. */
export function removeSourceFolder(
  draft: CreateProjectDraft,
  folderId: string
): CreateProjectDraft {
  return {
    ...draft,
    folders: draft.folders.filter(folder => folder.id !== folderId)
  };
}

/** The minimal name rule: trimmed, non-empty. */
export function validateProjectName(name: string): ProjectNameValidation {
  const trimmed = name.trim();

  return trimmed.length > 0
    ? { status: 'valid', name: trimmed }
    : { status: 'empty' };
}

/**
 * The value the creation port receives, or `null` while the draft is not
 * submittable.
 *
 * Returning nothing for an invalid draft is what protects the submit path: the
 * dialog keeps its create control enabled (as the composer keeps send enabled)
 * and this rule, not a `disabled` attribute, is the guard.
 */
export function toCreateProjectInput(
  draft: CreateProjectDraft
): CreateProjectInput | null {
  const validation = validateProjectName(draft.name);

  if (validation.status !== 'valid') {
    return null;
  }

  return {
    name: validation.name,
    folders: draft.folders.map(folder => folder.path)
  };
}
