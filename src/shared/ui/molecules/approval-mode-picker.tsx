import {
  APPROVAL_MODES,
  isApprovalMode,
  isUnrestrictedApprovalMode
} from '@/shared/domain/approval-mode.types';
import type { ApprovalMode } from '@/shared/domain/approval-mode.types';
import { getApprovalModeCopy } from '@/shared/i18n/messages';
import type { IconName } from '../atoms/icon';
import { SelectList } from './select-list';
import type { SelectOption } from './select-list';

/**
 * Glyph drawn for each level (`docs/wireframes/10-approval-mode.html`). Keyed by
 * the domain union, so a level added to the domain cannot ship without a glyph.
 */
const APPROVAL_MODE_ICONS: Readonly<Record<ApprovalMode, IconName>> = {
  ask_always: 'hand',
  auto_approve: 'terminal',
  full_access: 'alert'
};

/** The glyph the approval chip and the mode row draw for one level. */
export function getApprovalModeIcon(mode: ApprovalMode): IconName {
  return APPROVAL_MODE_ICONS[mode];
}

export interface ApprovalModePickerProps {
  /** Accessible name for the listbox. */
  readonly label: string;
  /** The level selected on the active project, read from `Project.approvalMode`. */
  readonly selectedMode: ApprovalMode;
  readonly onSelect: (mode: ApprovalMode) => void;
}

/**
 * Molecule: the approval-level list.
 *
 * The levels are the domain's `APPROVAL_MODES`, not a copy of the union, so the
 * popover offers exactly the documented policies. The chip and the row for the
 * unrestricted level carry the warning tone the wireframe gives them.
 */
export function ApprovalModePicker({
  label,
  selectedMode,
  onSelect
}: ApprovalModePickerProps) {
  const options: readonly SelectOption[] = APPROVAL_MODES.map(mode => {
    const copy = getApprovalModeCopy(mode);
    return {
      id: mode,
      label: copy.label,
      description: copy.description,
      icon: APPROVAL_MODE_ICONS[mode],
      tone: isUnrestrictedApprovalMode(mode) ? 'warn' : undefined
    };
  });

  function handleSelect(id: string) {
    if (isApprovalMode(id)) {
      onSelect(id);
    }
  }

  return (
    <SelectList
      label={label}
      options={options}
      selectedId={selectedMode}
      onSelect={handleSelect}
    />
  );
}
