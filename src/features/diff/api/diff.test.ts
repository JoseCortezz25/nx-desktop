/**
 * Contract and client tests for the workspace diff (issue #16, slice 4).
 *
 * The fixture is the same JSON the Rust suite reads, so a renamed field or a
 * drifted `DiffLineKind` value fails on both sides. A clean workspace is still
 * `[]` on the wire, never `null`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import diffFixture from '../../../../docs/ipc/fixtures/diff-read-workspace-diff.json';
import type {
  DiffFileDto,
  ReadWorkspaceDiffRequestDto
} from './diff.contracts';
import { readWorkspaceDiff } from './diff-client';

const ipcInvoke = vi.hoisted(() => vi.fn());

vi.mock('@/shared/ipc/client', () => ({ ipcInvoke }));

const expectedRequest: ReadWorkspaceDiffRequestDto = {
  projectId: 'proj-design-system'
};

const expectedFiles: DiffFileDto[] = [
  {
    path: 'src/App.tsx',
    addedCount: 2,
    removedCount: 1,
    hunks: [
      {
        header: '@@ -6,7 +6,8 @@ function App()',
        lines: [
          { kind: 'context', content: 'function App() {' },
          {
            kind: 'removed',
            content: '  const [name, setName] = useState("");'
          },
          {
            kind: 'added',
            content: '  const [provider, setProvider] = useState("claude");'
          },
          {
            kind: 'added',
            content: '  const [model, setModel] = useState("sonnet");'
          },
          { kind: 'context', content: '}' }
        ]
      }
    ]
  }
];

beforeEach(() => {
  ipcInvoke.mockReset();
});

describe('workspace diff fixture', () => {
  it('matches the typed request and change set', () => {
    expect(diffFixture.request).toEqual(expectedRequest);
    expect(diffFixture.response).toEqual(expectedFiles);
  });

  it('uses the closed context/added/removed line kinds', () => {
    const kinds = new Set(
      expectedFiles.flatMap(file =>
        file.hunks.flatMap(hunk => hunk.lines.map(line => line.kind))
      )
    );
    expect([...kinds].sort()).toEqual(['added', 'context', 'removed']);
  });

  it('carries no runId: the read is project-scoped', () => {
    expect(diffFixture.request).not.toHaveProperty('runId');
  });
});

describe('workspace diff client', () => {
  it('calls read_workspace_diff with the project envelope', async () => {
    ipcInvoke.mockResolvedValue(expectedFiles);
    await expect(readWorkspaceDiff('proj-design-system')).resolves.toEqual(
      expectedFiles
    );
    expect(ipcInvoke).toHaveBeenCalledWith('read_workspace_diff', {
      request: expectedRequest
    });
  });

  it('resolves a clean workspace as an empty list', async () => {
    ipcInvoke.mockResolvedValue([]);
    await expect(readWorkspaceDiff('proj-design-system')).resolves.toEqual([]);
  });
});
