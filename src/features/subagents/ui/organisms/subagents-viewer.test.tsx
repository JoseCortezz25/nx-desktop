import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Subagent } from '@/shared/domain/subagent.types';
import { PROVIDER_FIXTURES } from '@/features/providers/api/mock-provider-repository';
import { subagentRepositorySeed } from '../../api/mock-subagent-repository';
import {
  SubagentDetail,
  type SubagentDetailProps
} from '../molecules/subagent-detail';
import { SubagentRow, type SubagentRowProps } from '../molecules/subagent-row';
import { SubagentsViewer, type SubagentsViewerProps } from './subagents-viewer';

const harness = vi.hoisted(() => ({
  subagents: null as readonly Subagent[] | null,
  isLoading: false,
  stopSubagent: vi.fn()
}));

vi.mock('@/features/subagents/hooks/use-subagent-catalog', () => ({
  useSubagentCatalog: () => harness
}));
vi.mock('@/features/providers/hooks/use-provider-catalog', () => ({
  useProviderCatalog: () => ({ providers: PROVIDER_FIXTURES, isLoading: false })
}));

const request = {
  focusRequestCount: 1,
  focusedSubagentId: 'subagent-inspect-repo'
};

function findElement<Props>(
  node: ReactNode,
  type: unknown
): ReactElement<Props> | undefined {
  let found: ReactElement<Props> | undefined;
  Children.forEach(node, child => {
    if (found || !isValidElement<{ children?: ReactNode }>(child)) return;
    if (child.type === type) found = child as ReactElement<Props>;
    else found = findElement<Props>(child.props.children, type);
  });
  return found;
}

function renderView(props: SubagentsViewerProps = {}) {
  return renderToStaticMarkup(<SubagentsViewer {...props} />);
}

describe('subagents viewer', () => {
  beforeEach(() => {
    harness.subagents = subagentRepositorySeed();
    harness.isLoading = false;
    harness.stopSubagent.mockClear();
  });

  it('renders both grouped wireframe rows with statuses and elapsed times', () => {
    const markup = renderView();
    expect(markup).toContain('Activados · 2');
    expect(markup).toContain('Inspect repo');
    expect(markup).toContain('Tauri research');
    expect(markup.match(/subagent-row__status/g)).toHaveLength(2);
    expect(markup.match(/Procesando/g)).toHaveLength(2);
    expect(markup).toContain('5m 59s');
    expect(markup).toContain('6m 13s');
  });

  it('opens the requested detail with catalog model, effort and stop affordance', () => {
    const markup = renderView(request);
    expect(markup).toContain('Inspect repo');
    expect(markup).toContain('GPT-5 Codex · Ligero');
    expect(markup).toContain('aria-label="Detener"');
    expect(markup).not.toContain('subagent-row__name');
  });

  it('renders the current finished record without a stop control', () => {
    harness.subagents = subagentRepositorySeed().map(agent => ({
      ...agent,
      status: { kind: 'finished' }
    }));
    const markup = renderView(request);
    expect(markup).toContain('Finalizado');
    expect(markup).not.toContain('aria-label="Detener"');
  });

  it('falls back to the record model id when the catalog does not know it', () => {
    harness.subagents = subagentRepositorySeed().map(agent => ({
      ...agent,
      modelId: 'unknown-model'
    }));
    expect(renderView(request)).toContain('unknown-model · Ligero');
  });

  it('shows loading and empty notices without rows', () => {
    harness.subagents = null;
    harness.isLoading = true;
    expect(renderView()).toContain('Cargando los subagentes…');
    harness.subagents = [];
    harness.isLoading = false;
    expect(renderView()).toContain('Este run no tiene subagentes');
    expect(renderView()).not.toContain('subagent-row');
  });

  it('falls back to the list when the requested record no longer exists', () => {
    expect(renderView({ ...request, focusedSubagentId: 'missing' })).toContain(
      'Activados · 2'
    );
  });

  it('wires the detail stop callback to the catalog record id', () => {
    // Invoke the organism while React supplies the hook dispatcher; inspect its
    // bare section tree rather than mounting a DOM or mocking React state.
    function Probe() {
      const element = SubagentsViewer(request);
      expect(element.type).toBe('section');
      const detail = findElement<SubagentDetailProps>(
        element.props.children,
        SubagentDetail
      );
      expect(detail).toBeDefined();
      detail?.props.onStop?.();
      return element;
    }
    renderToStaticMarkup(<Probe />);
    expect(harness.stopSubagent).toHaveBeenLastCalledWith(
      'subagent-inspect-repo'
    );
  });

  it('reconciles new requests during render and resets the earlier disclosure', () => {
    let phase = 0;
    let props: SubagentsViewerProps = request;
    function Probe() {
      const element = SubagentsViewer(props);
      const detail = findElement<SubagentDetailProps>(element, SubagentDetail);
      if (phase === 0 && detail) {
        expect(detail.props.isEarlierExpanded).toBe(false);
        phase = 1;
        detail.props.onToggleEarlier();
      } else if (phase === 1 && detail) {
        expect(detail.props.isEarlierExpanded).toBe(true);
        phase = 2;
        props = {
          focusRequestCount: 2,
          focusedSubagentId: 'subagent-tauri-research'
        };
        // The toggle schedules another render with the new incoming request.
        detail.props.onToggleEarlier();
      } else if (phase === 2 && detail?.props.name === 'Tauri research') {
        expect(detail.props.isEarlierExpanded).toBe(false);
        phase = 3;
      }
      return element;
    }
    const markup = renderToStaticMarkup(<Probe />);
    expect(markup).toContain('Tauri research');
    expect(markup).toContain('GLM 4.6 · Máximo');
    expect(phase).toBe(3);
  });

  it('returns to the list for a new request without an id', () => {
    let phase = 0;
    let props: SubagentsViewerProps = request;
    function Probe() {
      const element = SubagentsViewer(props);
      const detail = findElement<SubagentDetailProps>(element, SubagentDetail);
      if (phase === 0 && detail) {
        phase = 1;
        props = { focusRequestCount: 2, focusedSubagentId: null };
        detail.props.onToggleEarlier();
      }
      return element;
    }
    expect(renderToStaticMarkup(<Probe />)).toContain('Activados · 2');
  });

  it('resolves the detail from the updated catalog after an individual stop', () => {
    let phase = 0;
    function Probe() {
      const element = SubagentsViewer(request);
      const detail = findElement<SubagentDetailProps>(element, SubagentDetail);
      if (phase === 0 && detail) {
        phase = 1;
        detail.props.onStop?.();
        harness.subagents = subagentRepositorySeed().map(agent =>
          agent.id === request.focusedSubagentId
            ? { ...agent, status: { kind: 'cancelled' } }
            : agent
        );
        detail.props.onToggleEarlier();
      }
      return element;
    }
    const markup = renderToStaticMarkup(<Probe />);
    expect(markup).toContain('Cancelado');
    expect(markup).not.toContain('aria-label="Detener"');
    expect(harness.stopSubagent).toHaveBeenCalledWith('subagent-inspect-repo');
  });

  it('keeps back navigation on the same request count and selects list rows', () => {
    let phase = 0;
    function Probe() {
      const element = SubagentsViewer(request);
      const detail = findElement<SubagentDetailProps>(element, SubagentDetail);
      if (phase === 0 && detail) {
        phase = 1;
        detail.props.onBack();
      } else if (phase === 1) {
        const row = findElement<SubagentRowProps>(element, SubagentRow);
        expect(row).toBeDefined();
        phase = 2;
        row?.props.onPress();
      }
      return element;
    }
    expect(renderToStaticMarkup(<Probe />)).toContain('GPT-5 Codex · Ligero');
    expect(phase).toBe(2);
  });
});
