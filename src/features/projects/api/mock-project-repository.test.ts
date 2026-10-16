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
