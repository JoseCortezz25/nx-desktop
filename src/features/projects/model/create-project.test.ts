import { describe, expect, it } from 'vitest';
import {
  EMPTY_CREATE_PROJECT_DRAFT,
  MOCK_SOURCE_FOLDERS,
  addSourceFolder,
  changeProjectName,
  nextSourceFolder,
  removeSourceFolder,
  toCreateProjectInput,
  validateProjectName
} from './create-project';

/**
 * The create-project rules are pure transitions outside the component so this
 * node-environment runner (no DOM) can observe them: issue #9 requires the name
 * rule and the mocked folder source to be typed, deterministic and explicit.
 */
describe('project name validation', () => {
  it('accepts a non-empty name and reports it trimmed', () => {
    expect(validateProjectName('  Gamma app  ')).toEqual({
      status: 'valid',
      name: 'Gamma app'
    });
  });

  it('rejects an empty name', () => {
    expect(validateProjectName('')).toEqual({ status: 'empty' });
  });

  it('rejects a whitespace-only name', () => {
    expect(validateProjectName('   ')).toEqual({ status: 'empty' });
  });

  it('invents no uniqueness or charset policy beyond trimmed non-empty', () => {
    // The issue specifies "validates the name" and nothing else; a duplicate
    // name and a name with punctuation are both accepted rather than rejected by
    // a policy this ticket was never asked to design.
    expect(validateProjectName('Gamma app')).toEqual({
      status: 'valid',
      name: 'Gamma app'
    });
    expect(validateProjectName('gamma app')).toEqual({
      status: 'valid',
      name: 'gamma app'
    });
    expect(validateProjectName('a/b:c*?')).toEqual({
      status: 'valid',
      name: 'a/b:c*?'
    });
  });
});

describe('create-project draft', () => {
  it('starts empty: no name, no folders', () => {
    expect(EMPTY_CREATE_PROJECT_DRAFT).toEqual({ name: '', folders: [] });
  });

  it('keeps the folders when the name changes', () => {
    const draft = addSourceFolder(EMPTY_CREATE_PROJECT_DRAFT);
    const renamed = changeProjectName(draft, 'Gamma app');

    expect(renamed.name).toBe('Gamma app');
    expect(renamed.folders).toBe(draft.folders);
  });

  it('adds the next unused mock folder deterministically', () => {
    const once = addSourceFolder(EMPTY_CREATE_PROJECT_DRAFT);
    const twice = addSourceFolder(once);

    expect(once.folders).toEqual([MOCK_SOURCE_FOLDERS[0]]);
    expect(twice.folders).toEqual([
      MOCK_SOURCE_FOLDERS[0],
      MOCK_SOURCE_FOLDERS[1]
    ]);
  });

  it('never offers the same folder twice', () => {
    let draft = EMPTY_CREATE_PROJECT_DRAFT;
    for (const _folder of MOCK_SOURCE_FOLDERS) {
      draft = addSourceFolder(draft);
    }

    const ids = draft.folders.map(folder => folder.id);
    expect(new Set(ids).size).toBe(MOCK_SOURCE_FOLDERS.length);
  });

  it('removes one folder by id and keeps the others', () => {
    const draft = addSourceFolder(addSourceFolder(EMPTY_CREATE_PROJECT_DRAFT));
    const withoutFirst = removeSourceFolder(draft, MOCK_SOURCE_FOLDERS[0].id);

    expect(withoutFirst.folders).toEqual([MOCK_SOURCE_FOLDERS[1]]);
    // Untouched for an id the draft does not carry.
    expect(removeSourceFolder(draft, 'missing').folders).toEqual(draft.folders);
  });

  it('hardcodes no wireframe placeholder folder', () => {
    for (const folder of MOCK_SOURCE_FOLDERS) {
      expect(folder.label).not.toBe('nx-desktop');
      expect(folder.path).not.toContain('nx-desktop');
      expect(folder.path).not.toContain('fabrica-skills');
    }
    expect(MOCK_SOURCE_FOLDERS.length).toBeGreaterThan(0);
  });

  it('stops offering folders once the typed mock source is exhausted', () => {
    let draft = EMPTY_CREATE_PROJECT_DRAFT;
    for (const _folder of MOCK_SOURCE_FOLDERS) {
      draft = addSourceFolder(draft);
    }

    expect(nextSourceFolder(draft)).toEqual({ status: 'exhausted' });
    // An exhausted source is a no-op, not a rule violation.
    expect(addSourceFolder(draft)).toBe(draft);
  });
});

describe('create-project input', () => {
  it('returns nothing while the name is blank', () => {
    expect(toCreateProjectInput(EMPTY_CREATE_PROJECT_DRAFT)).toBeNull();
    expect(
      toCreateProjectInput(changeProjectName(EMPTY_CREATE_PROJECT_DRAFT, ' '))
    ).toBeNull();
  });

  it('builds the port input from the trimmed name and the folder paths', () => {
    const draft = addSourceFolder(
      changeProjectName(EMPTY_CREATE_PROJECT_DRAFT, '  Gamma app  ')
    );

    expect(toCreateProjectInput(draft)).toEqual({
      name: 'Gamma app',
      folders: [MOCK_SOURCE_FOLDERS[0].path]
    });
  });

  it('accepts the empty state: a project with no source folder is submittable', () => {
    const draft = changeProjectName(
      EMPTY_CREATE_PROJECT_DRAFT,
      'Empty workspace'
    );

    expect(toCreateProjectInput(draft)).toEqual({
      name: 'Empty workspace',
      folders: []
    });
  });
});
