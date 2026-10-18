import type * as React from 'react';
import type * as HookRowModule from '../molecules/hook-row';
import type * as ButtonModule from '@/shared/ui/atoms/button';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hook } from '@/shared/domain/hook.types';
import type { ButtonProps } from '@/shared/ui/atoms/button';
import type { HookRowProps } from '../molecules/hook-row';
import { getHookMessages } from '../../messages';

// Node-only event harness: retain the organism's one state slot across renders.
const harness = vi.hoisted(() => ({
  expanded: new Set<string>() as ReadonlySet<string>,
  rows: [] as HookRowProps[],
  buttons: [] as ButtonProps[]
}));
vi.mock('react', async () => ({
  ...(await vi.importActual<typeof React>('react')),
  useState: () => [
    harness.expanded,
    (next: (current: ReadonlySet<string>) => ReadonlySet<string>) => {
      harness.expanded = next(harness.expanded);
    }
  ]
}));
vi.mock('../molecules/hook-row', async () => {
  const actual = await vi.importActual<typeof HookRowModule>(
    '../molecules/hook-row'
  );
  return {
    HookRow: (props: HookRowProps) => {
      harness.rows.push(props);
      return actual.HookRow(props);
    }
  };
});
vi.mock('@/shared/ui/atoms/button', async () => {
  const actual = await vi.importActual<typeof ButtonModule>(
    '@/shared/ui/atoms/button'
  );
  return {
    Button: (props: ButtonProps) => {
      harness.buttons.push(props);
      return actual.Button(props);
    }
  };
});
import { HookReviewDialog } from './hook-review-dialog';

const hooks: readonly Hook[] = [
  {
    id: 'hook-lint',
    name: 'Lint on write',
    isNew: true,
    origin: 'Project config',
    hookType: 'PreToolUse',
    command: 'pnpm lint',
    timeoutMs: 5000,
    approvalStatus: 'pending'
  },
  {
    id: 'hook-format',
    name: 'Format on save',
    isNew: false,
    origin: 'User config',
    hookType: 'PostToolUse',
    command: 'pnpm format',
    timeoutMs: 1500,
    approvalStatus: 'pending'
  }
];
const messages = getHookMessages().hookReview;
function render(
  selectedHookIds: ReadonlySet<string> = new Set(),
  onDecide = vi.fn()
) {
  harness.rows = [];
  harness.buttons = [];
  return renderToStaticMarkup(
    <HookReviewDialog
      hooks={hooks}
      selectedHookIds={selectedHookIds}
      onToggleSelection={() => undefined}
      onDecide={onDecide}
      onClose={() => undefined}
    />
  );
}

describe('hook review dialog', () => {
  beforeEach(() => {
    harness.expanded = new Set();
  });
  it('uses the shared dialog and feature copy, with one collapsed row per hook', () => {
    const markup = render();
    expect(markup).toContain('role="dialog"');
    // Screen 14 draws this review on the wide surface, not the compact one.
    expect(markup).toContain('dialog--wide');
    expect(markup).toContain(`aria-label="${messages.title}"`);
    expect(markup).toContain(`aria-label="${messages.closeLabel}"`);
    expect(markup).toContain(messages.footerNote);
    expect(harness.rows).toHaveLength(2);
    expect(harness.rows.every(row => !row.isExpanded)).toBe(true);
    expect(markup).not.toContain('class="hook-detail"');
    for (const label of [
      messages.rejectLabel,
      messages.allowAllLabel,
      messages.allowSelectionLabel
    ])
      expect(markup).toContain(`>${label}<`);
  });
  it('disables selection approval only when the controlled selection is empty', () => {
    expect(render()).toMatch(
      new RegExp(`disabled=""[^>]*>${messages.allowSelectionLabel}`)
    );
    expect(render(new Set(['hook-lint']))).not.toMatch(
      new RegExp(`disabled=""[^>]*>${messages.allowSelectionLabel}`)
    );
    expect(harness.rows.map(row => row.isSelected)).toEqual([true, false]);
  });
  it('expands and collapses only the disclosed row', () => {
    render();
    harness.rows[0].onToggleExpansion();
    expect(render()).toContain('pnpm lint');
    expect(harness.rows.map(row => row.isExpanded)).toEqual([true, false]);
    harness.rows[0].onToggleExpansion();
    expect(render()).not.toContain('class="hook-detail"');
  });
  it('emits each decision with the range it applies to', () => {
    const onDecide = vi.fn();
    render(new Set(['hook-lint']), onDecide);
    for (const label of [
      messages.rejectLabel,
      messages.allowAllLabel,
      messages.allowSelectionLabel
    ]) {
      harness.buttons.find(button => button.children === label)?.onPress?.();
    }
    // Rejecting and allowing everything cover the whole reviewed set; the third
    // action only covers what the controlled selection holds.
    expect(onDecide.mock.calls).toEqual([
      ['rejected', 'all'],
      ['approved', 'all'],
      ['approved', 'selection']
    ]);
  });
});
