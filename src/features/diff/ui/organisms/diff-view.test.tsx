import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile } from '@/shared/domain/diff-file.types';
import type { ProjectId } from '@/shared/domain/value-objects.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import type { AppErrorDto } from '@/shared/ipc/contracts';
import { createMockDiffRepository } from '../../api/mock-diff-repository';
import { DiffView } from './diff-view';

/**
 * The view resolves the change set through its feature hook, which is a no-op
 * under static rendering. This harness replaces it so the rendered surface can be
 * asserted: the summary numbers, one collapsible section per file, and the
 * loading/empty notices.
 */
const harness = vi.hoisted(() => ({
  files: null as readonly DiffFile[] | null,
  isLoading: false,
  error: null as AppErrorDto | null
}));

vi.mock('@/features/diff/hooks/use-workspace-diff', () => ({
  useWorkspaceDiff: () => ({
    files: harness.files,
    isLoading: harness.isLoading,
    error: harness.error
  })
}));

let seed: readonly DiffFile[] = [];

function renderView(
  projectId: ProjectId | null = 'proj-design-system'
): string {
  return renderToStaticMarkup(<DiffView projectId={projectId} />);
}

describe('diff view', () => {
  beforeEach(async () => {
    seed = await createMockDiffRepository().readWorkspaceDiff();
    harness.files = seed;
    harness.isLoading = false;
    harness.error = null;
  });

  it('summarises the change set before the sections', () => {
    const messages = getSharedMessages();
    const markup = renderView();

    expect(markup).toContain(messages.diff.summary.fileCount(2));
    expect(markup).toMatch(/diff-view__added"[^>]*>\+14</);
    expect(markup).toMatch(/diff-view__removed"[^>]*>-6</);
    expect(markup.indexOf('diff-view__summary')).toBeLessThan(
      markup.indexOf('diff-file-section')
    );
  });

  it('draws one collapsible section per changed file, all expanded', () => {
    const markup = renderView();

    expect(markup.match(/class="diff-file-section"/g)?.length).toBe(2);
    expect(markup).toContain('src/App.tsx');
    expect(markup).toContain('src-tauri/src/lib.rs');
    expect(markup.match(/aria-expanded="true"/g)?.length).toBe(2);
  });

  it('names the region for assistive technology', () => {
    expect(renderView()).toContain(getSharedMessages().diff.listLabel);
  });

  it('shows the loading notice until the change set resolves', () => {
    harness.files = null;
    harness.isLoading = true;

    const markup = renderView();

    expect(markup).toContain(getSharedMessages().diff.loadingLabel);
    expect(markup).not.toContain('diff-file-section');
  });

  it('shows the clean-workspace notice instead of an empty list', () => {
    harness.files = [];

    const markup = renderView();
    expect(markup).toContain(getSharedMessages().diff.emptyLabel);
    expect(markup).not.toContain('diff-file-section');
    expect(markup).toContain('diff-view__summary');
  });

  it('asks for a project before inspecting any workspace', () => {
    harness.files = null;

    expect(renderView(null)).toContain(getSharedMessages().diff.noProjectLabel);
  });

  it('reports a failed read instead of claiming a clean workspace', () => {
    harness.files = null;
    harness.error = {
      code: 'permission_denied',
      message: 'diagnostic',
      retryable: false,
      requestId: 'req-1'
    };

    const markup = renderView();
    expect(markup).toContain(getSharedMessages().diff.errorLabel);
    expect(markup).not.toContain(getSharedMessages().diff.emptyLabel);
  });
});
