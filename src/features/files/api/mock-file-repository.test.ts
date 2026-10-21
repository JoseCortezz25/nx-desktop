import { describe, expect, it } from 'vitest';
import { createMockFileRepository } from './mock-file-repository';
import { createMockOpenTargetRepository } from './mock-open-target-repository';

describe('mock file repository', () => {
  it('reads a seeded document', async () => {
    const repository = createMockFileRepository();

    const document = await repository.readDocument('src/App.tsx');

    expect(document?.path).toBe('src/App.tsx');
    expect(document?.content.length).toBeGreaterThan(0);
  });

  it('resolves an unseeded path to null instead of inventing content', async () => {
    const repository = createMockFileRepository();

    await expect(
      repository.readDocument('src/does-not-exist.ts')
    ).resolves.toBeNull();
  });

  it('seeds both content modes the viewer draws', async () => {
    const repository = createMockFileRepository();

    const markdown = await repository.readDocument(
      'docs/research-tecnico/arquitectura-tauri.md'
    );
    const code = await repository.readDocument(
      'src/shared/domain/selection-chain.ts'
    );

    expect(markdown?.content).toContain('# ');
    expect(code?.content).toContain('export');
  });

  it('seeds every path the conversation file chips point at', async () => {
    const repository = createMockFileRepository();

    for (const path of [
      'src/shared/domain/selection-chain.ts',
      'src/features/providers/hooks/use-composer-selection.ts',
      'src/App.tsx'
    ]) {
      await expect(repository.readDocument(path)).resolves.not.toBeNull();
    }
  });
});

describe('mock open target repository', () => {
  it('reports VS Code installed by default', async () => {
    const repository = createMockOpenTargetRepository();

    const report = await repository.listOpenTargets();

    expect(report).toContainEqual({ target: 'editor', isInstalled: true });
  });

  it('can report VS Code as missing', async () => {
    const repository = createMockOpenTargetRepository({
      isEditorInstalled: false
    });

    const report = await repository.listOpenTargets();

    expect(report).toContainEqual({ target: 'editor', isInstalled: false });
  });

  it('reports the file-manager target the menu must refuse', async () => {
    const repository = createMockOpenTargetRepository();

    const report = await repository.listOpenTargets();

    expect(report).toContainEqual({
      target: 'reveal_in_file_manager',
      isInstalled: true
    });
  });

  it('launches nothing: the open action is a stub behind the port', async () => {
    const repository = createMockOpenTargetRepository();

    await expect(
      repository.openInTarget('proj-design-system', 'editor', 'src/App.tsx')
    ).resolves.toBeUndefined();
  });
});
