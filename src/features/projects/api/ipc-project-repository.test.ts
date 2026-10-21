/**
 * Repository tests for the IPC-backed project catalog (issue #22).
 *
 * The client module is mocked at its boundary; the tests pin the mapping and
 * the write delegation (create and approval mode) the hook relies on.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateProjectInput } from '../model/create-project.types';
import { createIpcProjectRepository } from './ipc-project-repository';
import type { ProjectDto } from './project.contracts';

const listProjects = vi.hoisted(() => vi.fn());
const createProject = vi.hoisted(() => vi.fn());
const setProjectApprovalMode = vi.hoisted(() => vi.fn());

vi.mock('./project-client', () => ({
  listProjects,
  createProject,
  setProjectApprovalMode
}));

const designSystem: ProjectDto = {
  id: 'proj-design-system',
  name: 'Design system',
  workspaceFolders: ['/workspace/design-system'],
  approvalMode: 'ask_always',
  hookDecisions: [],
  conversationIds: ['conv-composer-chain']
};

const created: ProjectDto = {
  id: 'proj-created-1',
  name: 'Docs site',
  workspaceFolders: ['/workspace/docs-site'],
  approvalMode: 'ask_always',
  hookDecisions: [],
  conversationIds: []
};

const input: CreateProjectInput = {
  name: 'Docs site',
  folders: ['/workspace/docs-site']
};

beforeEach(() => {
  listProjects.mockReset();
  createProject.mockReset();
  setProjectApprovalMode.mockReset();
});

describe('createIpcProjectRepository', () => {
  it('maps the Rust catalog to domain projects', async () => {
    listProjects.mockResolvedValue([designSystem]);
    const projects = await createIpcProjectRepository().listProjects();
    expect(projects).toEqual([
      {
        id: 'proj-design-system',
        name: 'Design system',
        workspaceFolders: ['/workspace/design-system'],
        approvalMode: 'ask_always',
        hookDecisions: [],
        conversationIds: ['conv-composer-chain']
      }
    ]);
    expect(projects[0].workspaceFolders).not.toBe(
      designSystem.workspaceFolders
    );
  });

  it('delegates creation and maps the created row with the catalog', async () => {
    createProject.mockResolvedValue({
      project: created,
      projects: [designSystem, created]
    });

    const result = await createIpcProjectRepository().createProject(input);

    expect(createProject).toHaveBeenCalledWith(input);
    expect(result.project.id).toBe('proj-created-1');
    expect(result.projects.map(project => project.id)).toEqual([
      'proj-design-system',
      'proj-created-1'
    ]);
  });

  it('delegates the approval mode write and maps the updated catalog', async () => {
    const updated = { ...designSystem, approvalMode: 'full_access' as const };
    setProjectApprovalMode.mockResolvedValue([updated]);

    const projects = await createIpcProjectRepository().setApprovalMode(
      'proj-design-system',
      'full_access'
    );

    expect(setProjectApprovalMode).toHaveBeenCalledWith(
      'proj-design-system',
      'full_access'
    );
    expect(projects[0].approvalMode).toBe('full_access');
  });
});
