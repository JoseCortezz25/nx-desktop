import { useState } from 'react';
import type { Hook, HookApprovalStatus } from '@/shared/domain/hook.types';
import type { HookId } from '@/shared/domain/value-objects.types';
import { Button } from '@/shared/ui/atoms/button';
import { Dialog } from '@/shared/ui/molecules/dialog';
import { getHookMessages } from '../../messages';
import { isHookSelected, toggleHookId } from '../../model/hook-review';
import { HookRow } from '../molecules/hook-row';
import { HookDetail } from '../molecules/hook-detail';
import './hook-review-dialog.css';

export interface HookReviewDialogProps {
  readonly hooks: readonly Hook[];
  readonly selectedHookIds: ReadonlySet<HookId>;
  readonly onToggleSelection: (hookId: HookId) => void;
  /**
   * Reports the footer decision with the range it applies to: the whole reviewed
   * set or only the selected hooks. The caller owns what that means — this
   * delivery persists nothing (business-logic §2 `Hook`; #19/#23 own it).
   */
  readonly onDecide: (
    status: HookApprovalStatus,
    scope: 'selection' | 'all'
  ) => void;
  readonly onClose: () => void;
}

/** Selection is controlled; only the disclosed rows belong to this organism. */
export function HookReviewDialog({
  hooks,
  selectedHookIds,
  onToggleSelection,
  onDecide,
  onClose
}: HookReviewDialogProps) {
  const messages = getHookMessages().hookReview;
  const [expandedHookIds, setExpandedHookIds] = useState<ReadonlySet<HookId>>(
    new Set()
  );

  function handleToggleExpansion(hookId: HookId) {
    setExpandedHookIds(current => toggleHookId(current, hookId));
  }

  return (
    <Dialog
      title={messages.title}
      closeLabel={messages.closeLabel}
      onClose={onClose}
    >
      <div className="hook-review-dialog">
        <div className="hook-review-dialog__list">
          {hooks.map(hook => (
            <div className="hook-review-dialog__item" key={hook.id}>
              <HookRow
                hook={hook}
                isSelected={isHookSelected(selectedHookIds, hook.id)}
                isExpanded={expandedHookIds.has(hook.id)}
                onToggleSelection={() => onToggleSelection(hook.id)}
                onToggleExpansion={() => handleToggleExpansion(hook.id)}
              />
              {expandedHookIds.has(hook.id) ? <HookDetail hook={hook} /> : null}
            </div>
          ))}
        </div>
        <div className="hook-review-dialog__footer">
          <p className="hook-review-dialog__note">{messages.footerNote}</p>
          <div className="hook-review-dialog__actions">
            <Button onPress={() => onDecide('rejected', 'all')}>
              {messages.rejectLabel}
            </Button>
            <Button variant="pill" onPress={() => onDecide('approved', 'all')}>
              {messages.allowAllLabel}
            </Button>
            <Button
              variant="solid"
              isDisabled={selectedHookIds.size === 0}
              onPress={() => onDecide('approved', 'selection')}
            >
              {messages.allowSelectionLabel}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
