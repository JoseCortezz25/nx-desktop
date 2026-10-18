import type { Hook } from '@/shared/domain/hook.types';
import { Button } from '@/shared/ui/atoms/button';
import { Checkbox } from '@/shared/ui/atoms/checkbox';
import { Icon } from '@/shared/ui/atoms/icon';
import { getHookMessages } from '../../messages';
import './hook-row.css';

export interface HookRowProps {
  readonly hook: Hook;
  readonly isSelected: boolean;
  readonly isExpanded: boolean;
  readonly onToggleSelection: () => void;
  readonly onToggleExpansion: () => void;
}

/** Independent selection and disclosure controls; neither owns state. */
export function HookRow({
  hook,
  isSelected,
  isExpanded,
  onToggleSelection,
  onToggleExpansion
}: HookRowProps) {
  const messages = getHookMessages().hookReview;
  return (
    <div className={`hook-row${isExpanded ? ' hook-row--expanded' : ''}`}>
      <Checkbox
        label={messages.selectLabel(hook.name)}
        isChecked={isSelected}
        onChange={onToggleSelection}
      />
      <Button
        variant="plain"
        label={
          isExpanded
            ? messages.collapseLabel(hook.name)
            : messages.expandLabel(hook.name)
        }
        isExpanded={isExpanded}
        onPress={onToggleExpansion}
      >
        <span className="hook-row__name">{hook.name}</span>
        {hook.isNew ? (
          <span className="hook-row__badge">{messages.newBadge}</span>
        ) : null}
        <span className="hook-row__chevron">
          <Icon name="chevron-down" size="sm" />
        </span>
      </Button>
    </div>
  );
}
