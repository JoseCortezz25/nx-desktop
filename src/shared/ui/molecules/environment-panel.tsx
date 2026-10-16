import type { RunEnvironment } from '@/shared/domain/run-environment.types';
import { getSharedMessages } from '@/shared/i18n/messages';
import { Icon } from '../atoms/icon';
import { Switch } from '../atoms/switch';
import { TextInput } from '../atoms/text-input';
import { SelectList } from './select-list';
import type { SelectOption } from './select-list';
import './environment-panel.css';

export interface EnvironmentPanelProps {
  /** Accessible name for the field group. */
  readonly label: string;
  /**
   * The reconciled environment. Its `gitBranch` is already one of `branches`,
   * so the list always shows the run's real branch.
   */
  readonly environment: RunEnvironment;
  /** Branches served by the workspace port, never a hardcoded list. */
  readonly branches: readonly string[];
  /** Accessible name for the branch listbox. */
  readonly branchListLabel: string;
  readonly onWorktreeToggle: () => void;
  readonly onBranchSelect: (branch: string) => void;
  readonly onEnvironmentNameChange: (environmentName: string) => void;
}

/**
 * Molecule: the body of the environment popover
 * (`docs/wireframes/09-local-environment.html`).
 *
 * It edits the three fields of `RunEnvironment` — the worktree flag, the branch
 * and the environment name — and holds no state of its own: the composer owns
 * the environment and hands every change back up through the `on*` props.
 */
export function EnvironmentPanel({
  label,
  environment,
  branches,
  branchListLabel,
  onWorktreeToggle,
  onBranchSelect,
  onEnvironmentNameChange
}: EnvironmentPanelProps) {
  const messages = getSharedMessages();
  const branchOptions: readonly SelectOption[] = branches.map(branch => ({
    id: branch,
    label: branch,
    icon: 'git-branch'
  }));

  return (
    <div className="environment-panel" role="group" aria-label={label}>
      <div className="environment-panel__field">
        <Icon name="worktree" size="sm" />
        <span className="environment-panel__label">
          {messages.environment.worktree}
        </span>
        <Switch
          label={messages.environment.worktree}
          isOn={environment.useNewWorktree}
          onToggle={onWorktreeToggle}
        />
      </div>

      <div className="environment-panel__field">
        <Icon name="git-branch" size="sm" />
        <span className="environment-panel__label">
          {messages.environment.branch}
        </span>
      </div>
      <SelectList
        label={branchListLabel}
        options={branchOptions}
        selectedId={environment.gitBranch}
        onSelect={onBranchSelect}
      />

      <div className="environment-panel__field">
        <Icon name="settings" size="sm" />
        <span className="environment-panel__label">
          {messages.environment.name}
        </span>
      </div>
      <TextInput
        label={messages.environment.name}
        value={environment.environmentName}
        placeholder={messages.environment.namePlaceholder}
        onChange={onEnvironmentNameChange}
      />
    </div>
  );
}
