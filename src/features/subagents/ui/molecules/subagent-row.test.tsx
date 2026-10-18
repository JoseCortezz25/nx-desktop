import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SubagentRow } from './subagent-row';

describe('subagent row', () => {
  it('renders name, status and elapsed time', () => {
    const markup = renderToStaticMarkup(
      <SubagentRow
        name="Inspect repo"
        avatarVariant="globe"
        statusLabel="Procesando"
        elapsedLabel="5m 59s"
        onPress={() => undefined}
      />
    );

    expect(markup).toContain('Inspect repo');
    expect(markup).toContain('Procesando');
    expect(markup).toContain('5m 59s');
  });

  it('opens the subagent detail from the row', () => {
    const onPress = vi.fn();
    const element = SubagentRow({
      name: 'Inspect repo',
      avatarVariant: 'globe',
      statusLabel: 'Procesando',
      elapsedLabel: '5m 59s',
      onPress
    });

    // The row's root is the Button atom; the press wiring is checked on the
    // props the molecule forwards (the atom's own onClick map is its contract).
    element.props.onPress?.();

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('carries the avatar shape the record names', () => {
    const markup = renderToStaticMarkup(
      <SubagentRow
        name="Tauri research"
        avatarVariant="flower"
        statusLabel="Procesando"
        elapsedLabel="6m 13s"
        onPress={() => undefined}
      />
    );

    expect(markup).toContain('subagent-avatar--flower');
  });
});
