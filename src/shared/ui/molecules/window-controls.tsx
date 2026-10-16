import { IconButton } from './icon-button';
import './window-controls.css';

export interface WindowControlsLabels {
  readonly minimize: string;
  readonly maximize: string;
  readonly close: string;
}

export interface WindowControlsProps {
  readonly labels: WindowControlsLabels;
  readonly onMinimize?: () => void;
  readonly onMaximize?: () => void;
  readonly onClose?: () => void;
}

/**
 * Molecule: the three window buttons. Wiring them to the Tauri window API is a
 * later ticket, so the handlers are optional.
 */
export function WindowControls({
  labels,
  onMinimize,
  onMaximize,
  onClose
}: WindowControlsProps) {
  return (
    <div className="window-controls">
      <IconButton
        icon="minus"
        label={labels.minimize}
        size="sm"
        onPress={onMinimize}
      />
      <IconButton
        icon="square"
        label={labels.maximize}
        size="sm"
        onPress={onMaximize}
      />
      <IconButton
        icon="close"
        label={labels.close}
        size="sm"
        onPress={onClose}
      />
    </div>
  );
}
