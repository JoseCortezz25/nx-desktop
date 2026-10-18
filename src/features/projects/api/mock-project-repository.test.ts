import { describe, expect, it } from 'vitest';
import { APPROVAL_MODES } from '@/shared/domain/approval-mode.types';
import { createMockProjectRepository } from './mock-project-repository';

/**
 * Guards the two properties the ticket requires of the project port: the list is
 * readable through `ProjectRepository`, and the approval policy is genuinely
 * project-scoped — two projects carry two different levels, so the composer's
 * chip cannot be built against a single shared value.
 */
describe('mock project repository', () => {
  it('serves the project list through the ProjectRepository port', async () => {
    const projects = await createMockProjectRepository().listProjects();

    expect(projects.map(project => project.id)).toEqual([
      'proj-design-system',
      'proj-api-client'
    ]);
  });

  it('gives the two projects different approval policies', async () => {
    const projects = await createMockProjectRepository().listProjects();
    const modes = projects.map(project => project.approvalMode);

    expect(modes).toEqual(['ask_always', 'auto_approve']);
    expect(new Set(modes).size).toBe(projects.length);
  });

  it('gives every project a documented approval level', async () => {
    const projects = await createMockProjectRepository().listProjects();

    for (const project of projects) {
      expect(APPROVAL_MODES).toContain(project.approvalMode);
    }
  });

  it('writes the approval policy through the port and reports the new list', async () => {
    const repository = createMockProjectRepository();

    const updated = await repository.setApprovalMode(
      'proj-design-system',
      'full_access'
    );
    const designSystem = updated.find(
      project => project.id === 'proj-design-system'
    );

    expect(designSystem?.approvalMode).toBe('full_access');
    // The write survives, and the other project is untouched.
    const reread = await repository.listProjects();
    expect(
      reread.find(project => project.id === 'proj-design-system')?.approvalMode
    ).toBe('full_access');
    expect(
      reread.find(project => project.id === 'proj-api-client')?.approvalMode
    ).toBe('auto_approve');
  });

  it('keeps every other project field intact when the policy changes', async () => {
    const repository = createMockProjectRepository();
    const [before] = await repository.listProjects();
    const updated = await repository.setApprovalMode(before.id, 'full_access');
    const after = updated.find(project => project.id === before.id);

    expect(after).toEqual({ ...before, approvalMode: 'full_access' });
  });

  it('leaves the list unchanged for a project that is not there', async () => {
    const repository = createMockProjectRepository();
    const before = await repository.listProjects();

    const updated = await repository.setApprovalMode('missing', 'full_access');

    expect(updated).toEqual(before);
  });
});

/**
 * Creation is the write the create-project dialog (#9) needs: it must append a
 * typed project through the port and answer with the created row **plus** the
 * updated list, so the one catalog owner can publish both the new project and
 * the list the picker and sidebar read.
 */
describe('mock project repository creation', () => {
  it('appends a typed project and reports it with the updated list', async () => {
    const repository = createMockProjectRepository();
    const before = await repository.listProjects();

    const created = await repository.createProject({
      name: 'Gamma app',
      folders: ['/workspace/gamma-site']
    });

    expect(created.projects).toHaveLength(before.length + 1);
    expect(created.projects[created.projects.length - 1]).toEqual(
      created.project
    );
    expect(created.project.name).toBe('Gamma app');
    expect(created.project.workspaceFolders).toEqual(['/workspace/gamma-site']);
  });

  it('persists the creation through the port', async () => {
    const repository = createMockProjectRepository();

    const created = await repository.createProject({
      name: 'Gamma app',
      folders: []
    });
    const reread = await repository.listProjects();

    expect(reread.some(project => project.id === created.project.id)).toBe(
      true
    );
  });

  it('accepts the empty state: a project with no source folder', async () => {
    const repository = createMockProjectRepository();

    const created = await repository.createProject({
      name: 'Empty workspace',
      folders: []
    });

    expect(created.project.workspaceFolders).toEqual([]);
  });

  it('gives each created project a deterministic unique id', async () => {
    const repository = createMockProjectRepository();

    const first = await repository.createProject({ name: 'One', folders: [] });
    const second = await repository.createProject({ name: 'Two', folders: [] });

    expect(first.project.id).toBe('proj-created-1');
    expect(second.project.id).toBe('proj-created-2');
    expect(first.project.id).not.toBe(second.project.id);
  });

  it('starts a created project at the most restrictive approval level', async () => {
    const repository = createMockProjectRepository();

    const { project } = await repository.createProject({
      name: 'One',
      folders: []
    });

    // A required field still needs a value, and the issue specifies none: the
    // most cautious level is the honest default rather than an invented policy.
    expect(project.approvalMode).toBe('ask_always');
    expect(project.hookDecisions).toEqual([]);
    expect(project.conversationIds).toEqual([]);
  });

  it('keeps each repository instance’s creations to itself', async () => {
    const first = createMockProjectRepository();
    const second = createMockProjectRepository();

    await first.createProject({ name: 'One', folders: [] });
    const other = await second.listProjects();

    expect(other.some(project => project.id === 'proj-created-1')).toBe(false);
  });
});
