import { Children, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { transcriptEntry } from '../../model/subagent-view';
import { SubagentDetail, type SubagentDetailProps } from './subagent-detail';

const props: SubagentDetailProps = {
  name: 'Inspect repo',
  avatarVariant: 'globe',
  statusLabel: 'Procesando',
  modelLabel: 'GPT-5 Codex',
  effortLabel: 'Ligero',
  transcript: [
    'early one',
    'early two',
    'recent one',
    'recent two',
    'recent three'
  ].map((content, index) =>
    transcriptEntry(String(index), 'assistant', content, '2026-10-18T09:00:00Z')
  ),
  canStop: true,
  isEarlierExpanded: false,
  onToggleEarlier: vi.fn(),
  onBack: vi.fn(),
  onStop: vi.fn()
};

function renderDetail(overrides: Partial<SubagentDetailProps> = {}) {
  return renderToStaticMarkup(<SubagentDetail {...props} {...overrides} />);
}

function press(node: ReactNode, label: string) {
  Children.forEach(node, child => {
    if (
      !isValidElement<{
        label?: string;
        onPress?: () => void;
        children?: ReactNode;
      }>(child)
    )
      return;
    if (child.props.label === label) child.props.onPress?.();
    else press(child.props.children, label);
  });
}

describe('subagent detail', () => {
  it('renders the header, composed meta, status and accessible back control', () => {
    const markup = renderDetail();
    expect(markup).toContain('<h2');
    expect(markup).toContain('Inspect repo');
    expect(markup).toContain('subagent-avatar--globe');
    expect(markup).toContain('GPT-5 Codex · Ligero');
    expect(markup).toContain('Procesando');
    expect(markup).toContain('aria-label="Volver a la lista"');
    expect(markup).toContain(
      'role="log" aria-label="Transcripción del subagente"'
    );
  });

  it('shows the recent window and counted divider, hiding earlier messages', () => {
    const markup = renderDetail();
    expect(markup).toContain('recent one');
    expect(markup).toContain('recent two');
    expect(markup).toContain('recent three');
    expect(markup).not.toContain('early one');
    expect(markup).not.toContain('early two');
    expect(markup).toContain('2 mensajes anteriores');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('Mostrar mensajes anteriores');
  });

  it('expands earlier entries before the divider and recent entries', () => {
    const markup = renderDetail({ isEarlierExpanded: true });
    expect(markup.indexOf('early one')).toBeLessThan(
      markup.indexOf('early two')
    );
    expect(markup.indexOf('early two')).toBeLessThan(
      markup.indexOf('2 mensajes anteriores')
    );
    expect(markup.indexOf('2 mensajes anteriores')).toBeLessThan(
      markup.indexOf('recent one')
    );
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('Contraer mensajes anteriores');
  });

  it('omits the divider when the transcript fits the recent window', () => {
    expect(
      renderDetail({ transcript: props.transcript.slice(-3) })
    ).not.toContain('mensajes anteriores');
    expect(renderDetail({ transcript: [] })).not.toContain('aria-expanded');
  });

  it('shows stop only when permitted and wired', () => {
    expect(renderDetail()).toContain('aria-label="Detener"');
    expect(renderDetail({ canStop: false })).not.toContain(
      'aria-label="Detener"'
    );
    expect(renderDetail({ onStop: undefined })).not.toContain(
      'aria-label="Detener"'
    );
  });

  it('reports back, toggle and stop presses to its owner', () => {
    const onBack = vi.fn();
    const onToggleEarlier = vi.fn();
    const onStop = vi.fn();
    const element = SubagentDetail({
      ...props,
      onBack,
      onToggleEarlier,
      onStop
    });
    press(element, 'Volver a la lista');
    press(element, 'Mostrar mensajes anteriores');
    press(element, 'Detener');
    expect(onBack).toHaveBeenCalledOnce();
    expect(onToggleEarlier).toHaveBeenCalledOnce();
    expect(onStop).toHaveBeenCalledOnce();
  });
});
