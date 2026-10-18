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
 * - the folder picker is mocked, so its catalog is typed, deterministic fixture
 *   data (`MOCK_SOURCE_FOLDERS`) rather than the wireframe's `nx-desktop`
 *   placeholder path (`docs/wireframes/README.md`, ground rules).
 */
import type {
  CreateProjectDraft,
  CreateProjectInput,
  ProjectNameValidation,
  SourceFolder,
  SourceFolderAvailability
} from './create-project.types';

/**
 * The folder picker's mocked catalog.
 *
 * The real source is a filesystem dialog owned by a later ticket; until it
 * exists the dialog needs a typed, deterministic stand-in that is obviously
 * fixture data. Adding therefore walks this list in order, which is what makes
 * the empty and folder-added states reproducible in tests and in the browser.
 */
export const MOCK_SOURCE_FOLDERS: readonly SourceFolder[] = [
  {
    id: 'folder-alpha',
    label: 'alpha-app',
    path: '/mock/workspace/alpha-app'
  },
  {
    id: 'folder-beta',
    label: 'beta-service',
    path: '/mock/workspace/beta-service'
  },
  {
    id: 'folder-gamma',
    label: 'gamma-site',
    path: '/mock/workspace/gamma-site'
  }
];

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
 * The next folder the mocked catalog can offer this draft.
 *
 * It is a pure lookup so the dialog can both add the folder and disable its add
 * control on the same fact — one source of truth for "is there another folder?".
 */
export function nextSourceFolder(
  draft: CreateProjectDraft
): SourceFolderAvailability {
  const taken = new Set(draft.folders.map(folder => folder.id));
  const folder = MOCK_SOURCE_FOLDERS.find(
    candidate => !taken.has(candidate.id)
  );

  return folder ? { status: 'available', folder } : { status: 'exhausted' };
}

/** The draft with the next unused mock folder appended, or unchanged when exhausted. */
export function addSourceFolder(draft: CreateProjectDraft): CreateProjectDraft {
  const next = nextSourceFolder(draft);

  return next.status === 'available'
    ? { ...draft, folders: [...draft.folders, next.folder] }
    : draft;
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
