import { getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import './context-bar.css';

export interface ContextBarProps {
  /**
   * Display name of the active project resolved by the shell through the project
   * port, or `null` while the list is loading.
   */
  readonly projectName: string | null;
  /** Label of the environment the next run executes in. */
  readonly environmentLabel: string;
  /** Whether the project picker is open. */
  readonly isProjectExpanded?: boolean;
  /** Whether the environment popover is open. */
  readonly isEnvironmentExpanded?: boolean;
  readonly onProjectPress?: () => void;
  readonly onEnvironmentPress?: () => void;
}

/**
 * Molecule: the context bar sitting on top of the composer
 * (`docs/wireframes/README.md`, "Reusable components": "Project chip,
 * environment chip"; screens 04, 09, 10).
 *
 * It composes the two chips for one UI job and holds no state — the composer
 * organism owns which popover is open and positions both, so no outer `position`
 * lives on this molecule.
 */
export function ContextBar({
  projectName,
  environmentLabel,
  isProjectExpanded,
  isEnvironmentExpanded,
  onProjectPress,
  onEnvironmentPress
}: ContextBarProps) {
  const messages = getSharedMessages();
  const projectLabel = projectName
    ? messages.contextBar.project.triggerLabel(projectName)
    : messages.contextBar.project.emptyLabel;

  return (
    <div className="context-bar">
      <Button
        variant="pill"
        label={projectLabel}
        isExpanded={isProjectExpanded}
        onPress={onProjectPress}
      >
        <Icon name="folder" size="sm" />
        <span className="context-bar__value">
          {projectName ?? messages.contextBar.project.emptyLabel}
        </span>
        <Icon name="chevron-down" size="sm" />
      </Button>

      <Button
        variant="plain"
        label={messages.contextBar.environment.triggerLabel(environmentLabel)}
        isExpanded={isEnvironmentExpanded}
        onPress={onEnvironmentPress}
      >
        <Icon name="monitor" size="sm" />
        <span className="context-bar__value">{environmentLabel}</span>
        <Icon name="chevron-down" size="sm" />
      </Button>
    </div>
  );
}
