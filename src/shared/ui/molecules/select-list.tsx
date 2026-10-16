import type { ReactNode } from 'react';
import { Button } from '../atoms/button';
import type { ButtonTone } from '../atoms/button';
import { Icon } from '../atoms/icon';
import type { IconName } from '../atoms/icon';
import './select-list.css';

export interface SelectOption {
  readonly id: string;
  readonly label: string;
  /** Secondary line drawn under the label (the provider subtitle). */
  readonly description?: string;
  readonly icon?: IconName;
  /**
   * Caution treatment for a row the wireframe draws as a warning — the
   * unrestricted approval level
   * (`docs/wireframes/10-approval-mode.html`, `.popover .opt.warn`).
   */
  readonly tone?: ButtonTone;
}

export interface SelectListLead {
  readonly title: string;
  readonly description: string;
}

export interface SelectListProps {
  /** Accessible name for the listbox. */
  readonly label: string;
  readonly options: readonly SelectOption[];
  /** Currently selected option id, or `null` while none is resolved. */
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  /** Optional muted block drawn above the rows (the model list's lead). */
  readonly lead?: SelectListLead;
  /** Optional content drawn above the rows (the model list's provider line). */
  readonly slot?: ReactNode;
}

/**
 * Molecule: the shared selectable list. The provider and model selectors are
 * "the same list with a selected row and a check"
 * (`docs/wireframes/README.md`, "Reusable components"); the differences are the
 * data, the optional lead and the optional slot.
 */
export function SelectList({
  label,
  options,
  selectedId,
  onSelect,
  lead,
  slot
}: SelectListProps) {
  return (
    <div className="select-list">
      {slot}
      {lead ? (
        <div className="select-list__lead">
          <span className="select-list__lead-title">{lead.title}</span>
          <span className="select-list__lead-description">
            {lead.description}
          </span>
        </div>
      ) : null}
      <div className="select-list__options" role="listbox" aria-label={label}>
        {options.map(option => {
          const isSelected = option.id === selectedId;
          return (
            <Button
              key={option.id}
              variant="list"
              role="option"
              isSelected={isSelected}
              isActive={isSelected}
              tone={option.tone}
              label={option.label}
              onPress={() => onSelect(option.id)}
            >
              {option.icon ? <Icon name={option.icon} size="sm" /> : null}
              <span className="select-list__text">
                <span className="select-list__title">{option.label}</span>
                {option.description ? (
                  <span className="select-list__description">
                    {option.description}
                  </span>
                ) : null}
              </span>
              {isSelected ? <Icon name="check" size="sm" /> : null}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
