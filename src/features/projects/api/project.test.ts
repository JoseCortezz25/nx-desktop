/**
 * Contract and client tests for the project catalog (issue #16, slice 2).
 *
 * The fixtures are the same JSON the Rust suite reads. Typed literals pin the
 * DTO view; the client tests pin `list_projects`, `create_project` and
 * `set_project_approval_mode`, including the authority-bearing `projectId`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import createProjectFixture from '../../../../docs/ipc/fixtures/projects-create-project.json';
import listProjectsFixture from '../../../../docs/ipc/fixtures/projects-list-projects.json';
import setApprovalFixture from '../../../../docs/ipc/fixtures/projects-set-project-approval-mode.json';
import type { CreateProjectInput } from '../model/create-project.types';
import type {
  CreateProjectRequestDto,
  CreatedProjectDto,
  ProjectDto,
  SetProjectApprovalModeRequestDto
} from './project.contracts';
import {
  createProject,
  listProjects,
  setProjectApprovalMode
} from './project-client';

const ipcInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/shared/ipc/client', () => ({ ipcInvoke }));

const designSystem: ProjectDto = {
  id: 'proj-design-system',
  name: 'Design system',
  workspaceFolders: ['/workspace/design-system'],
  approvalMode: 'ask_always',
  hookDecisions: [],
  conversationIds: ['conv-composer-chain', 'conv-diff-review']
};

const apiClient: ProjectDto = {
  id: 'proj-api-client',
  name: 'API client',
  workspaceFolders: ['/workspace/api-client', '/workspace/shared-contracts'],
  approvalMode: 'auto_approve',
  hookDecisions: [{ hookId: 'hook-lint-on-write', approvalStatus: 'rejected' }],
  conversationIds: ['conv-hooks-review']
};

const createdProject: ProjectDto = {
  id: 'proj-created-1',
  name: 'Docs site',
  workspaceFolders: ['/workspace/docs-site'],
  approvalMode: 'ask_always',
  hookDecisions: [],
  conversationIds: []
};

const expectedProjects: ProjectDto[] = [designSystem, apiClient];
const expectedCreated: CreatedProjectDto = {
  project: createdProject,
  projects: [designSystem, createdProject]
};
const expectedSetApproval: ProjectDto[] = [
  { ...designSystem, approvalMode: 'full_access' },
  apiClient
];
const expectedCreateRequest: CreateProjectRequestDto = {
  name: 'Docs site',
  folders: ['/workspace/docs-site']
};
const expectedSetApprovalRequest: SetProjectApprovalModeRequestDto = {
  projectId: 'proj-design-system',
  approvalMode: 'full_access'
};

beforeEach(() => {
  ipcInvoke.mockReset();
});

describe('project fixtures', () => {
  it('match the typed project catalog', () => {
    expect(listProjectsFixture.response).toEqual(expectedProjects);
  });

  it('match the create request and created-project response', () => {
    expect(createProjectFixture.request).toEqual(expectedCreateRequest);
    expect(createProjectFixture.response).toEqual(expectedCreated);
  });

  it('match the approval request and updated catalog', () => {
    expect(setApprovalFixture.request).toEqual(expectedSetApprovalRequest);
    expect(setApprovalFixture.response).toEqual(expectedSetApproval);
  });
});

describe('project client', () => {
  it('calls list_projects without an envelope', async () => {
    ipcInvoke.mockResolvedValue(expectedProjects);
    await expect(listProjects()).resolves.toEqual(expectedProjects);
    expect(ipcInvoke).toHaveBeenCalledWith('list_projects');
  });

  it('calls create_project with the validated input as { request }', async () => {
    const input: CreateProjectInput = {
      name: 'Docs site',
      folders: ['/workspace/docs-site']
    };
    ipcInvoke.mockResolvedValue(expectedCreated);
    await expect(createProject(input)).resolves.toEqual(expectedCreated);
    expect(ipcInvoke).toHaveBeenCalledWith('create_project', {
      request: expectedCreateRequest
    });
  });

  it('calls set_project_approval_mode with projectId and mode', async () => {
    ipcInvoke.mockResolvedValue(expectedSetApproval);
    await expect(
      setProjectApprovalMode('proj-design-system', 'full_access')
    ).resolves.toEqual(expectedSetApproval);
    expect(ipcInvoke).toHaveBeenCalledWith('set_project_approval_mode', {
      request: expectedSetApprovalRequest
    });
  });
});
