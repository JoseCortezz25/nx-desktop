import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
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
    summary: 'Searched src for the selection chain'
  },
  {
    id: 'tool-2',
    icon: 'terminal',
    summary: 'Ran pnpm test -- selection-chain'
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

  it('shows the action-count summary from its caller', () => {
    expect(renderGroup(new Set<MessageId>())).toContain('2 acciones');
  });
});
