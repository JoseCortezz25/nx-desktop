/**
 * Contract and client tests for the workspace reads (issue #16, slices 2 and 4).
 *
 * The request carries the authority-bearing `projectId`; the branch response is
 * the repository's branch order, which the composer consumes as
 * `RunEnvironment`, and the file response is the document the right panel
 * renders. The same fixture bytes are read by the Rust suite.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import branchesFixture from '../../../../docs/ipc/fixtures/projects-list-workspace-branches.json';
import readFileFixture from '../../../../docs/ipc/fixtures/workspace-read-file.json';
import type {
  FileDocumentDto,
  ListWorkspaceBranchesRequestDto,
  ReadFileRequestDto
} from './workspace.contracts';
import { listWorkspaceBranches, readFile } from './workspace-client';

const ipcInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/shared/ipc/client', () => ({ ipcInvoke }));

const expectedRequest: ListWorkspaceBranchesRequestDto = {
  projectId: 'proj-design-system'
};
const expectedBranches: string[] = [
  'main',
  'feat/context-bar',
  'fix/chip-contrast'
];

beforeEach(() => {
  ipcInvoke.mockReset();
});

describe('workspace branch fixture', () => {
  it('matches the typed request and branch list', () => {
    expect(branchesFixture.request).toEqual(expectedRequest);
    expect(branchesFixture.response).toEqual(expectedBranches);
  });
});

describe('workspace client', () => {
  it('calls list_workspace_branches with the project envelope', async () => {
    ipcInvoke.mockResolvedValue(expectedBranches);
    await expect(listWorkspaceBranches('proj-design-system')).resolves.toEqual(
      expectedBranches
    );
    expect(ipcInvoke).toHaveBeenCalledWith('list_workspace_branches', {
      request: expectedRequest
    });
  });
});

const expectedReadFileRequest: ReadFileRequestDto = {
  projectId: 'proj-design-system',
  path: 'docs/research-tecnico/arquitectura-tauri.md'
};

const expectedFileDocument: FileDocumentDto = {
  path: 'docs/research-tecnico/arquitectura-tauri.md',
  content:
    '# Architecture\n\nEvery read crosses the workspace port; the panel never touches the disk.\n'
};

describe('workspace file fixture', () => {
  it('matches the typed request and document', () => {
    expect(readFileFixture.request).toEqual(expectedReadFileRequest);
    expect(readFileFixture.response).toEqual(expectedFileDocument);
  });

  it('carries the authority-bearing projectId and a workspace-relative path', () => {
    expect(typeof readFileFixture.request.projectId).toBe('string');
    expect(readFileFixture.request.path.startsWith('/')).toBe(false);
    expect(readFileFixture.request).not.toHaveProperty('runId');
  });
});

describe('workspace file client', () => {
  it('calls read_file with the project and path envelope', async () => {
    ipcInvoke.mockResolvedValue(expectedFileDocument);
    await expect(
      readFile(
        'proj-design-system',
        'docs/research-tecnico/arquitectura-tauri.md'
      )
    ).resolves.toEqual(expectedFileDocument);
    expect(ipcInvoke).toHaveBeenCalledWith('read_file', {
      request: expectedReadFileRequest
    });
  });

  it('resolves null when the path holds no document', async () => {
    ipcInvoke.mockResolvedValue(null);
    await expect(
      readFile('proj-design-system', 'src/App.tsx')
    ).resolves.toBeNull();
    expect(ipcInvoke).toHaveBeenCalledWith('read_file', {
      request: { projectId: 'proj-design-system', path: 'src/App.tsx' }
    });
  });
});
