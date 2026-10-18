import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Hook } from '@/shared/domain/hook.types';
import { getHookMessages } from '../../messages';
import { HookRow } from './hook-row';

const hook: Hook = {
  id: 'hook-lint',
  name: 'Lint on write',
  isNew: true,
  origin: 'Project',
  hookType: 'PreToolUse',
  command: 'pnpm lint',
  timeoutMs: 5000,
  approvalStatus: 'pending'
};
const messages = () => getHookMessages().hookReview;
const props = {
  hook,
  isSelected: false,
  isExpanded: false,
  onToggleSelection: () => undefined,
  onToggleExpansion: () => undefined
};

describe('hook row', () => {
  it('draws the provider name and a badge only for new hooks', () => {
    const markup = renderToStaticMarkup(<HookRow {...props} />);
    expect(markup).toContain(hook.name);
    expect(markup).toContain(messages().newBadge);
    expect(
      renderToStaticMarkup(
        <HookRow {...props} hook={{ ...hook, isNew: false }} />
      )
    ).not.toContain(messages().newBadge);
  });
  it('keeps the checkbox outside the disclosure and reflects controlled props', () => {
    const markup = renderToStaticMarkup(
      <HookRow {...props} isSelected isExpanded />
    );
    expect(markup).toContain(
      `aria-label="${messages().selectLabel(hook.name)}"`
    );
    expect(markup).toContain('checked=""');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain(
      `aria-label="${messages().collapseLabel(hook.name)}"`
    );
    expect(markup).not.toMatch(/<button[^>]*>[\s\S]*<input/);
    expect(renderToStaticMarkup(<HookRow {...props} />)).toContain(
      'aria-expanded="false"'
    );
  });
  it('routes selection and disclosure to separate callbacks', () => {
    const onToggleSelection = vi.fn();
    const onToggleExpansion = vi.fn();
    const row = HookRow({ ...props, onToggleSelection, onToggleExpansion });
    const [checkbox, disclosure] = row.props.children;
    checkbox.props.onChange();
    expect(onToggleSelection).toHaveBeenCalledOnce();
    expect(onToggleExpansion).not.toHaveBeenCalled();
    disclosure.props.onPress();
    expect(onToggleExpansion).toHaveBeenCalledOnce();
  });
});
