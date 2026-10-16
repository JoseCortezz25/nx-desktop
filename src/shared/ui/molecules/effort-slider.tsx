import type { EffortLevel } from '@/shared/domain/effort-level.types';
import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import './effort-slider.css';

export interface EffortSliderProps {
  /** Accessible name for the stop group. */
  readonly label: string;
  /** Display name of the model whose stops these are. */
  readonly modelName: string;
  /**
   * The stops the selected model reports, in order. The control draws exactly
   * one stop per entry and never assumes a count — a model that reports two
   * stops shows two (`docs/wireframes/08-effort-selector.html`).
   */
  readonly levels: readonly EffortLevel[];
  readonly selectedLevel: EffortLevel;
  /** Display label for a stop; keeps copy out of the molecule. */
  readonly levelLabel: (level: EffortLevel) => string;
  readonly onSelect: (level: EffortLevel) => void;
}

/**
 * Molecule: the effort control. It renders one selectable stop per supported
 * level of the selected model, with the knob on the current stop. It owns no
 * state and reads no catalog: the composer organism hands it the model's stops.
 */
export function EffortSlider({
  label,
  modelName,
  levels,
  selectedLevel,
  levelLabel,
  onSelect
}: EffortSliderProps) {
  const selectedIndex = Math.max(0, levels.indexOf(selectedLevel));
  const ratio = levels.length > 1 ? selectedIndex / (levels.length - 1) : 0;

  return (
    <div className="effort-slider">
      <div className="effort-slider__head">
        <Icon name="bolt" size="sm" />
        <span className="effort-slider__title">
          {levelLabel(selectedLevel)}
        </span>
      </div>
      <span className="effort-slider__model">{modelName}</span>
      <div className="effort-slider__track" role="group" aria-label={label}>
        <span
          className="effort-slider__knob"
          style={{ left: `calc((100% - 28px) * ${ratio} + 14px)` }}
          aria-hidden="true"
        />
        <span className="effort-slider__stops">
          {levels.map(level => (
            <Button
              key={level}
              variant="plain"
              label={levelLabel(level)}
              isPressed={level === selectedLevel}
              onPress={() => onSelect(level)}
            >
              <span className="effort-slider__stop" />
            </Button>
          ))}
        </span>
      </div>
    </div>
  );
}
