import { describe, expect, it } from 'vitest';
import {
  EMPTY_CREATE_PROJECT_DRAFT,
  addSourceFolder,
  changeProjectName,
  removeSourceFolder,
  toCreateProjectInput,
  validateProjectName
} from './create-project';
import type { SourceFolder } from './create-project.types';

/**
 * The create-project rules are pure transitions outside the component so this
 * node-environment runner (no DOM) can observe them: issue #9 requires the name
 * rule to be explicit, and #147 feeds the folders from the native dialog, so
 * these tests hand in the folders a picker would return.
 */
const docsSite: SourceFolder = {
  id: '/workspace/docs-site',
  label: 'docs-site',
  path: '/workspace/docs-site'
};

const sharedContracts: SourceFolder = {
  id: '/workspace/shared-contracts',
  label: 'shared-contracts',
  path: '/workspace/shared-contracts'
};
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
    const draft = addSourceFolder(EMPTY_CREATE_PROJECT_DRAFT, docsSite);
    const renamed = changeProjectName(draft, 'Gamma app');

    expect(renamed.name).toBe('Gamma app');
    expect(renamed.folders).toBe(draft.folders);
  });

  it('appends each picked folder in pick order', () => {
    const once = addSourceFolder(EMPTY_CREATE_PROJECT_DRAFT, docsSite);
    const twice = addSourceFolder(once, sharedContracts);

    expect(once.folders).toEqual([docsSite]);
    expect(twice.folders).toEqual([docsSite, sharedContracts]);
  });

  it('adds nothing when the pick is cancelled', () => {
    const draft = addSourceFolder(EMPTY_CREATE_PROJECT_DRAFT, docsSite);

    expect(addSourceFolder(draft, null)).toBe(draft);
    expect(addSourceFolder(EMPTY_CREATE_PROJECT_DRAFT, null)).toBe(
      EMPTY_CREATE_PROJECT_DRAFT
    );
  });

  it('never lists the same folder path twice', () => {
    const draft = addSourceFolder(EMPTY_CREATE_PROJECT_DRAFT, docsSite);

    expect(addSourceFolder(draft, { ...docsSite, id: 'other-id' })).toBe(draft);
  });

  it('removes one folder by id and keeps the others', () => {
    const draft = addSourceFolder(
      addSourceFolder(EMPTY_CREATE_PROJECT_DRAFT, docsSite),
      sharedContracts
    );
    const withoutFirst = removeSourceFolder(draft, docsSite.id);

    expect(withoutFirst.folders).toEqual([sharedContracts]);
    // Untouched for an id the draft does not carry.
    expect(removeSourceFolder(draft, 'missing').folders).toEqual(draft.folders);
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
      changeProjectName(EMPTY_CREATE_PROJECT_DRAFT, '  Gamma app  '),
      docsSite
    );

    expect(toCreateProjectInput(draft)).toEqual({
      name: 'Gamma app',
      folders: [docsSite.path]
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
