import { IconButton } from './icon-button';
import './nav-history.css';

export interface NavHistoryProps {
  readonly backLabel: string;
  readonly forwardLabel: string;
  readonly isBackEnabled?: boolean;
  readonly isForwardEnabled?: boolean;
  readonly onBack?: () => void;
  readonly onForward?: () => void;
}

/**
 * Molecule: the title bar's history navigation. The handlers are optional
 * because history tracking is a later ticket; the control renders disabled
 * until a destination exists.
 */
export function NavHistory({
  backLabel,
  forwardLabel,
  isBackEnabled = false,
  isForwardEnabled = false,
  onBack,
  onForward
}: NavHistoryProps) {
  return (
    <div className="nav-history">
      <IconButton
        icon="arrow-left"
        label={backLabel}
        size="sm"
        isDisabled={!isBackEnabled}
        onPress={onBack}
      />
      <IconButton
        icon="arrow-right"
        label={forwardLabel}
        size="sm"
        isDisabled={!isForwardEnabled}
        onPress={onForward}
      />
    </div>
  );
}
