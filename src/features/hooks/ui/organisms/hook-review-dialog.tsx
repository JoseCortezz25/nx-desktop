import { useState } from 'react';
import type { Hook, HookApprovalStatus } from '@/shared/domain/hook.types';
import type { HookId } from '@/shared/domain/value-objects.types';
import { Button } from '@/shared/ui/atoms/button';
import { Dialog } from '@/shared/ui/molecules/dialog';
import { getHookMessages } from '../../messages';
import {
  isHookSelected,
  toggleHookId,
  type HookDecisionScope
} from '../../model/hook-review';
import { HookRow } from '../molecules/hook-row';
import { HookDetail } from '../molecules/hook-detail';
import './hook-review-dialog.css';

export interface HookReviewDialogProps {
  readonly hooks: readonly Hook[];
  readonly selectedHookIds: ReadonlySet<HookId>;
  readonly onToggleSelection: (hookId: HookId) => void;
  /**
   * Reports the footer decision with the range it applies to: the whole reviewed
   * set or only the selected hooks. The caller records it through the core,
   * which persists it per project (business-logic §2 `Hook`; #20/#24).
   */
  readonly onDecide: (
    status: HookApprovalStatus,
    scope: HookDecisionScope
  ) => void;
  readonly onClose: () => void;
  /** The hook list is still being read from the core. */
  readonly isLoading?: boolean;
  /** The hook list could not be read. */
  readonly hasLoadError?: boolean;
  /** A decision is being written; the footer actions are disabled meanwhile. */
  readonly isDeciding?: boolean;
  /** The last decision was not (fully) stored. */
  readonly hasDecisionError?: boolean;
}

/** Selection is controlled; only the disclosed rows belong to this organism. */
export function HookReviewDialog({
  hooks,
  selectedHookIds,
  onToggleSelection,
  onDecide,
  onClose,
  isLoading = false,
  hasLoadError = false,
  isDeciding = false,
  hasDecisionError = false
}: HookReviewDialogProps) {
  const messages = getHookMessages().hookReview;
  const [expandedHookIds, setExpandedHookIds] = useState<ReadonlySet<HookId>>(
    new Set()
  );

  function handleToggleExpansion(hookId: HookId) {
    setExpandedHookIds(current => toggleHookId(current, hookId));
  }

  const listNotice = isLoading
    ? messages.loadingLabel
    : hasLoadError
      ? messages.loadErrorLabel
      : hooks.length === 0
        ? messages.emptyLabel
        : null;
  const canDecide = !isLoading && !hasLoadError && !isDeciding;

  return (
    <Dialog
      title={messages.title}
      closeLabel={messages.closeLabel}
      size="wide"
      onClose={onClose}
    >
      <div className="hook-review-dialog">
        {listNotice !== null ? (
          <p className="hook-review-dialog__notice" role="status">
            {listNotice}
          </p>
        ) : null}
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
          {hasDecisionError ? (
            <p className="hook-review-dialog__error" role="alert">
              {messages.decisionErrorLabel}
            </p>
          ) : null}
          <p className="hook-review-dialog__note">{messages.footerNote}</p>
          <div className="hook-review-dialog__actions">
            <Button
              variant="pill"
              isDisabled={!canDecide}
              onPress={() => onDecide('rejected', 'all')}
            >
              {messages.rejectLabel}
            </Button>
            <Button
              variant="pill"
              isDisabled={!canDecide}
              onPress={() => onDecide('approved', 'all')}
            >
              {messages.allowAllLabel}
            </Button>
            <Button
              variant="primary"
              isDisabled={!canDecide || selectedHookIds.size === 0}
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
