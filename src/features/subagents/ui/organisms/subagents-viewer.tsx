import { useState } from 'react';
import { useProviderCatalog } from '@/features/providers/hooks/use-provider-catalog';
import type { SubagentId } from '@/shared/domain/value-objects.types';
import {
  getEffortLevelLabel,
  getSharedMessages,
  getSubagentGroupLabel,
  getSubagentStatusLabel
} from '@/shared/i18n/messages';
import { useSubagentCatalog } from '../../hooks/use-subagent-catalog';
import {
  backToList,
  focusRequest,
  selectSubagent,
  type SubagentsFocus
} from '../../model/subagent-focus';
import { formatElapsed, groupSubagents } from '../../model/subagent-view';
import { SubagentDetail } from '../molecules/subagent-detail';
import { SubagentRow } from '../molecules/subagent-row';
import './subagents-viewer.css';

export interface SubagentsViewerProps {
  readonly focusRequestCount?: number;
  readonly focusedSubagentId?: SubagentId | null;
}

/** Organism: viewer content only; the panel owns its frame and reachability. */
export function SubagentsViewer({
  focusRequestCount = 0,
  focusedSubagentId = null
}: SubagentsViewerProps) {
  const messages = getSharedMessages().subagents;
  const { subagents, isLoading, stopSubagent } = useSubagentCatalog();
  const { providers } = useProviderCatalog();
  const [focus, setFocus] = useState<SubagentsFocus>(() =>
    focusRequest(focusRequestCount, focusedSubagentId)
  );
  const [handledRequestCount, setHandledRequestCount] =
    useState(focusRequestCount);
  const [isEarlierExpanded, setIsEarlierExpanded] = useState(false);

  // Reconcile during render like FilePanel: repeated counts cannot override
  // local back/selection, while a new request resets the transcript disclosure.
  if (focusRequestCount !== handledRequestCount) {
    setHandledRequestCount(focusRequestCount);
    setFocus(focusRequest(focusRequestCount, focusedSubagentId));
    setIsEarlierExpanded(false);
  }

  const selected =
    focus.kind === 'detail'
      ? subagents?.find(agent => agent.id === focus.subagentId)
      : undefined;
  const model = selected
    ? providers
        .flatMap(provider => provider.availableModels)
        .find(one => one.id === selected.modelId)
    : undefined;

  function handleSelect(id: SubagentId) {
    setFocus(current => selectSubagent(current, id));
    setIsEarlierExpanded(false);
  }

  function handleBack() {
    setFocus(current => backToList(current));
    setIsEarlierExpanded(false);
  }

  return (
    <section
      className="subagents-viewer"
      aria-label={messages.list.groupsLabel}
    >
      {isLoading ? (
        <p className="subagents-viewer__notice">{messages.list.loadingLabel}</p>
      ) : !subagents?.length ? (
        <p className="subagents-viewer__notice">{messages.list.emptyLabel}</p>
      ) : selected ? (
        <SubagentDetail
          name={selected.name}
          avatarVariant={selected.avatar}
          statusLabel={getSubagentStatusLabel(selected.status.kind)}
          modelLabel={model?.displayName ?? selected.modelId}
          effortLabel={getEffortLevelLabel(selected.effortLevel)}
          transcript={selected.transcript}
          canStop={selected.status.kind === 'processing'}
          isEarlierExpanded={isEarlierExpanded}
          onToggleEarlier={() => setIsEarlierExpanded(current => !current)}
          onBack={handleBack}
          onStop={() => stopSubagent(selected.id)}
        />
      ) : (
        <div className="subagents-viewer__groups">
          {groupSubagents(subagents).map(group => (
            <div className="subagents-viewer__group" key={group.kind}>
              <p className="subagents-viewer__group-label">
                {messages.list.groupHeading(
                  getSubagentGroupLabel(group.kind),
                  group.subagents.length
                )}
              </p>
              {group.subagents.map(agent => (
                <SubagentRow
                  key={agent.id}
                  name={agent.name}
                  avatarVariant={agent.avatar}
                  statusLabel={getSubagentStatusLabel(agent.status.kind)}
                  elapsedLabel={formatElapsed(agent.elapsedMs)}
                  onPress={() => handleSelect(agent.id)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
