import { describe, expect, it } from 'vitest';
import { countDiffLines } from '../model/diff-view';
import { createMockDiffRepository } from './mock-diff-repository';

/** Reads the seed through the port, exactly as the hook does. */
async function readSeed() {
  return createMockDiffRepository().readWorkspaceDiff();
}

describe('mock diff repository', () => {
  it('serves the two changed files screen 18 draws', async () => {
    const files = await readSeed();

    expect(files.map(file => file.path)).toEqual([
      'src/App.tsx',
      'src-tauri/src/lib.rs'
    ]);
  });

  it('declares the added and removed counts its own lines produce', async () => {
    const files = await readSeed();

    // The per-file counts are the repository's, not the view's: the header
    // trusts them, so the seed must agree with the lines it ships.
    for (const file of files) {
      expect({
        path: file.path,
        counted: countDiffLines(file.hunks)
      }).toEqual({
        path: file.path,
        counted: { added: file.addedCount, removed: file.removedCount }
      });
    }
  });

  it('ships the +14 / -6 totals the wireframe summary bar draws', async () => {
    const files = await readSeed();
    const added = files.reduce((total, file) => total + file.addedCount, 0);
    const removed = files.reduce((total, file) => total + file.removedCount, 0);

    expect({ added, removed }).toEqual({ added: 14, removed: 6 });
  });

  it('gives every hunk a readable header and at least one line', async () => {
    const files = await readSeed();
    const hunks = files.flatMap(file => file.hunks);

    expect(hunks.length).toBeGreaterThan(0);
    for (const hunk of hunks) {
      expect(hunk.header).toMatch(/^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/);
      expect(hunk.lines.length).toBeGreaterThan(0);
    }
  });

  it('serves an empty change set when asked for a clean workspace', async () => {
    const repository = createMockDiffRepository({ files: [] });

    await expect(repository.readWorkspaceDiff()).resolves.toEqual([]);
  });
});
