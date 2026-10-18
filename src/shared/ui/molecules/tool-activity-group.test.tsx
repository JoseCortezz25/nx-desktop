import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  ToolActivityRow,
  type ToolActivityRowProps
} from './tool-activity-row';
import type { MessageId } from '@/shared/domain/value-objects.types';
import { toggleToolGroup } from '../organisms/conversation-view-model';
import {
  ToolActivityGroup,
  type ToolActivityRowItem
} from './tool-activity-group';

const rows: readonly ToolActivityRowItem[] = [
  {
    id: 'tool-1',
    icon: 'search',
    summary: 'Searched src for the selection chain',
    opensChanges: false
  },
  {
    id: 'tool-2',
    icon: 'terminal',
    summary: 'Ran pnpm test -- selection-chain',
    opensChanges: false
  }
];

function renderGroup(collapsedGroupIds: ReadonlySet<MessageId>) {
  return renderToStaticMarkup(
    <ToolActivityGroup
      summary="2 acciones"
      expandLabel="Expandir actividad de herramientas"
      collapseLabel="Contraer actividad de herramientas"
      isExpanded={!collapsedGroupIds.has('msg-1')}
      rows={rows}
      onToggle={() => undefined}
    />
  );
}

describe('tool activity group', () => {
  it('presses subagent rows through with their id while diffs open changes and ordinary tools stay inert', () => {
    const onOpenSubagent = vi.fn();
    const onOpenChanges = vi.fn();
    const props = {
      summary: '4 acciones',
      expandLabel: 'Expandir',
      collapseLabel: 'Contraer',
      isExpanded: true,
      rows: [
        ...rows,
        {
          id: 'child',
          icon: 'user' as const,
          summary: 'Inspect repo completed',
          opensChanges: false,
          opensSubagentId: 'subagent-inspect-repo'
        },
        {
          id: 'diff',
          icon: 'git-branch' as const,
          summary: 'Ran git diff',
          opensChanges: true
        }
      ],
      onToggle: () => undefined,
      onOpenSubagent,
      onOpenChanges
    };
    const group = ToolActivityGroup(props);
    const rowContainer = group.props.children[1] as ReactElement<{
      children: ReactElement<ToolActivityRowProps>[];
    }>;
    const renderedRows = rowContainer.props.children;
    expect(renderedRows[0]?.type).toBe(ToolActivityRow);
    expect(renderedRows[0]?.props.onPress).toBeUndefined();
    expect(renderedRows[1]?.props.onPress).toBeUndefined();
    expect(renderedRows[2]?.props.onPress).toBeTypeOf('function');
    renderedRows[2]?.props.onPress?.();
    expect(onOpenSubagent).toHaveBeenCalledExactlyOnceWith(
      'subagent-inspect-repo'
    );
    expect(onOpenChanges).not.toHaveBeenCalled();
    renderedRows[3]?.props.onPress?.();
    expect(onOpenChanges).toHaveBeenCalledTimes(1);
    const markup = renderToStaticMarkup(<ToolActivityGroup {...props} />);
    expect(markup).toContain(
      'aria-label="Ver el subagente en el panel derecho"'
    );
    expect(markup.match(/<button/g)).toHaveLength(3);
    expect(
      renderToStaticMarkup(
        <ToolActivityGroup
          {...props}
          onOpenSubagent={undefined}
          onOpenChanges={undefined}
        />
      ).match(/<button/g)
    ).toHaveLength(1);
  });
  it('collapses then expands, observing its rows in each state', () => {
    // Starts expanded — the state screens 11 and 12 draw.
    let collapsedGroupIds: ReadonlySet<MessageId> = new Set<MessageId>();

    const expanded = renderGroup(collapsedGroupIds);
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded).toContain('Searched src for the selection chain');
    expect(expanded).toContain('Ran pnpm test -- selection-chain');

    collapsedGroupIds = toggleToolGroup(collapsedGroupIds, 'msg-1');
    const collapsed = renderGroup(collapsedGroupIds);
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).not.toContain('Searched src for the selection chain');
    expect(collapsed).not.toContain('Ran pnpm test -- selection-chain');

    collapsedGroupIds = toggleToolGroup(collapsedGroupIds, 'msg-1');
    const reExpanded = renderGroup(collapsedGroupIds);
    expect(reExpanded).toContain('aria-expanded="true"');
    expect(reExpanded).toContain('Searched src for the selection chain');
    expect(reExpanded).toContain('Ran pnpm test -- selection-chain');
  });

  it('makes only change-opening rows pressable, and only with a callback', () => {
    const mixedRows: readonly ToolActivityRowItem[] = [
      ...rows,
      {
        id: 'diff',
        icon: 'git-branch',
        summary: 'Ran git diff',
        opensChanges: true
      }
    ];
    function render(onOpenChanges?: () => void) {
      return renderToStaticMarkup(
        <ToolActivityGroup
          summary="3 acciones"
          expandLabel="Expandir"
          collapseLabel="Contraer"
          isExpanded
          rows={mixedRows}
          onToggle={() => undefined}
          onOpenChanges={onOpenChanges}
        />
      );
    }
    expect(render().match(/<button/g)).toHaveLength(1);
    expect(render(() => undefined).match(/<button/g)).toHaveLength(2);
  });

  it('shows the action-count summary from its caller', () => {
    expect(renderGroup(new Set<MessageId>())).toContain('2 acciones');
  });
});
