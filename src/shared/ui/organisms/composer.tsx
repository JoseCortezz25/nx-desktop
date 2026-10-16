import { useEffect, useRef, useState } from 'react';
import type { ApprovalMode } from '@/shared/domain/approval-mode.types';
import { isUnrestrictedApprovalMode } from '@/shared/domain/approval-mode.types';
import type { EffortLevel } from '@/shared/domain/effort-level.types';
import type { Project } from '@/shared/domain/project.types';
import type { Provider } from '@/shared/domain/provider.types';
import {
  DEFAULT_RUN_ENVIRONMENT,
  type RunEnvironment
} from '@/shared/domain/run-environment.types';
import {
  changeEnvironmentName,
  changeGitBranch,
  changeProvider,
  changeWorktreeFlag,
  reconcileSelection,
  resolveApprovalMode,
  resolveRunEnvironment,
  resolveSelection,
  type ComposerSelection
} from '@/shared/domain/selection-chain';
import type {
  ModelId,
  ProjectId,
  ProviderId
} from '@/shared/domain/value-objects.types';
import {
  getApprovalModeCopy,
  getEffortLevelLabel,
  getSharedMessages
} from '@/shared/i18n/messages';
import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import { TextArea } from '../atoms/text-area';
import {
  ApprovalModePicker,
  getApprovalModeIcon
} from '../molecules/approval-mode-picker';
import { ComposerBar } from '../molecules/composer-bar';
import { ContextBar } from '../molecules/context-bar';
import { EffortSlider } from '../molecules/effort-slider';
import { EnvironmentPanel } from '../molecules/environment-panel';
import { Popover } from '../molecules/popover';
import { ProjectPicker } from '../molecules/project-picker';
import { SelectList, type SelectOption } from '../molecules/select-list';
import { SelectTrigger } from '../molecules/select-trigger';
import {
  EMPTY_COMPOSER_DRAFT,
  submitDraft,
  typeInDraft
} from './composer-draft';
import './composer.css';

/**
 * The popover currently open. The composer is the single owner of this state —
 * one popover at a time, one dismissal path — shared by the selector chips and
 * the context bar rather than duplicated per surface.
 */
type OpenSelector =
  'provider' | 'model' | 'effort' | 'approval' | 'project' | 'environment';

export interface ComposerProps {
  /**
   * The provider catalog the selectors read, resolved by the shell root through
   * the typed provider port. Empty while the catalog loads, which leaves the
   * controls unrendered rather than naming a provider here.
   */
  readonly providers: readonly Provider[];
  /** The project list the picker reads, served by the project port. */
  readonly projects: readonly Project[];
  /**
   * The project whose approval policy the chip shows, or `null` while the list
   * loads. The level is read from `Project.approvalMode` and is never local.
   */
  readonly activeProject: Project | null;
  /** The active workspace's branches, served by the workspace port. */
  readonly branches: readonly string[];
  /** Hands the chosen project id up; the shell writes the selection. */
  readonly onSelectProject: (projectId: ProjectId) => void;
  /**
   * Hands the chosen approval level up. The shell persists it through the
   * project port — the composer never keeps a copy of the policy.
   */
  readonly onChangeApprovalMode: (approvalMode: ApprovalMode) => void;
  /** Handed the submitted prompt text. */
  readonly onSubmit: (prompt: string) => void;
}

/**
 * Organism: the composer and the context bar on its top edge
 * (`docs/wireframes/README.md`, "Reusable components").
 *
 * It owns the unsent draft, the `provider -> model -> effort` selection chain
 * (#7), the run environment and which popover is open. The approval chip (#8) is
 * the exception: it renders `Project.approvalMode`, so the value lives on the
 * project and this organism only shows it and reports the change upward.
 *
 * Everything resolved from catalog/port data is derived during render — a
 * late-arriving catalog or branch list becomes a valid selection instead of
 * needing an effect.
 */
export function Composer({
  providers,
  projects,
  activeProject,
  branches,
  onSelectProject,
  onChangeApprovalMode,
  onSubmit
}: ComposerProps) {
  const messages = getSharedMessages();
  const [draft, setDraft] = useState(EMPTY_COMPOSER_DRAFT);
  const [desiredSelection, setDesiredSelection] =
    useState<ComposerSelection | null>(null);
  const [desiredEnvironment, setDesiredEnvironment] = useState<RunEnvironment>(
    DEFAULT_RUN_ENVIRONMENT
  );
  const [openSelector, setOpenSelector] = useState<OpenSelector | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Derived during render: the chain is always valid for the current catalog, so
  // a late-arriving catalog becomes a usable selection without an effect.
  const resolved = resolveSelection(providers, desiredSelection);

  // Derived the same way: the approval level belongs to the active project, and
  // the environment's branch belongs to the active workspace's branch list.
  const approvalMode = resolveApprovalMode(activeProject);
  const environment = resolveRunEnvironment(desiredEnvironment, branches);
  const environmentLabel =
    environment.environmentName || messages.contextBar.environment.localMachine;

  // Synchronizes with the document while a popover is open: dismiss on an
  // outside press or Escape. Cleanup is idempotent.
  useEffect(() => {
    if (!openSelector) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (
        rootRef.current &&
        target instanceof Node &&
        !rootRef.current.contains(target)
      ) {
        setOpenSelector(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenSelector(null);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openSelector]);

  const placeholder = resolved
    ? messages.composer.promptPlaceholder(resolved.provider.displayName)
    : undefined;

  const providerOptions: readonly SelectOption[] = providers.map(provider => ({
    id: provider.id,
    label: provider.displayName,
    description: provider.subtitle,
    icon: 'provider'
  }));

  const modelOptions: readonly SelectOption[] = (
    resolved?.provider.availableModels ?? []
  ).map(model => ({
    id: model.id,
    label: model.displayName
  }));

  const effortLabel = resolved
    ? getEffortLevelLabel(resolved.selection.effortLevel)
    : null;

  const approvalCopy = approvalMode ? getApprovalModeCopy(approvalMode) : null;
  const approvalHeaderLabel = resolved
    ? messages.composer.approval.header(resolved.provider.displayName)
    : messages.composer.approval.listLabel;

  function handlePromptChange(text: string) {
    setDraft(typeInDraft(text));
  }

  function handleSend() {
    // Reads the current draft rather than a state updater: `submitDraft` calls
    // `onSubmit`, and an updater must stay side-effect free (React may invoke it
    // twice in StrictMode).
    setDraft(submitDraft(draft, onSubmit));
  }

  function handleToggle(selector: OpenSelector) {
    setOpenSelector(current => (current === selector ? null : selector));
  }

  function handleProviderSelect(providerId: ProviderId) {
    // The transition rule: a provider change resets model and effort to the new
    // provider's valid defaults (§3.1, item 2).
    setDesiredSelection(changeProvider(providers, providerId));
    setOpenSelector(null);
  }

  function handleModelSelect(modelId: ModelId) {
    const current = resolved?.selection;
    if (!current) {
      return;
    }
    setDesiredSelection(reconcileSelection(providers, { ...current, modelId }));
    setOpenSelector(null);
  }

  function handleEffortSelect(effortLevel: EffortLevel) {
    const current = resolved?.selection;
    if (!current) {
      return;
    }
    setDesiredSelection(
      reconcileSelection(providers, { ...current, effortLevel })
    );
  }

  function handleApprovalSelect(mode: ApprovalMode) {
    // Persisted through the project port by the shell: the chip's next value is
    // the project's, not a value parked in this component.
    onChangeApprovalMode(mode);
    setOpenSelector(null);
  }

  function handleProjectSelect(projectId: ProjectId) {
    onSelectProject(projectId);
    setOpenSelector(null);
  }

  function handleWorktreeToggle() {
    setDesiredEnvironment(current =>
      changeWorktreeFlag(current, !current.useNewWorktree)
    );
  }

  function handleBranchSelect(branch: string) {
    setDesiredEnvironment(current => changeGitBranch(current, branch));
  }

  function handleEnvironmentNameChange(environmentName: string) {
    setDesiredEnvironment(current =>
      changeEnvironmentName(current, environmentName)
    );
  }

  return (
    <div className="composer-dock" ref={rootRef}>
      <div className="composer-dock__context">
        <ContextBar
          projectName={activeProject?.name ?? null}
          environmentLabel={environmentLabel}
          isProjectExpanded={openSelector === 'project'}
          isEnvironmentExpanded={openSelector === 'environment'}
          onProjectPress={() => handleToggle('project')}
          onEnvironmentPress={() => handleToggle('environment')}
        />

        {openSelector === 'project' ? (
          <div className="composer-dock__popover">
            <Popover header={messages.contextBar.project.header}>
              <ProjectPicker
                label={messages.contextBar.project.listLabel}
                projects={projects}
                selectedId={activeProject?.id ?? null}
                onSelect={handleProjectSelect}
              />
            </Popover>
          </div>
        ) : null}

        {openSelector === 'environment' ? (
          <div className="composer-dock__popover composer-dock__popover--end">
            <Popover
              variant="panel"
              header={messages.contextBar.environment.header}
            >
              <EnvironmentPanel
                label={messages.contextBar.environment.listLabel}
                environment={environment}
                branches={branches}
                branchListLabel={messages.environment.branchListLabel}
                onWorktreeToggle={handleWorktreeToggle}
                onBranchSelect={handleBranchSelect}
                onEnvironmentNameChange={handleEnvironmentNameChange}
              />
            </Popover>
          </div>
        ) : null}
      </div>

      <div className="composer">
        <TextArea
          label={messages.composer.promptLabel}
          value={draft.text}
          placeholder={placeholder}
          onChange={handlePromptChange}
        />
        <ComposerBar
          leadingControls={
            approvalMode && approvalCopy ? (
              <SelectTrigger
                label={messages.composer.approval.triggerLabel(
                  approvalCopy.label
                )}
                value={approvalCopy.label}
                icon={getApprovalModeIcon(approvalMode)}
                tone={
                  isUnrestrictedApprovalMode(approvalMode) ? 'warn' : undefined
                }
                isExpanded={openSelector === 'approval'}
                onPress={() => handleToggle('approval')}
              />
            ) : null
          }
          controls={
            <>
              <SelectTrigger
                label={
                  resolved
                    ? messages.composer.provider.triggerLabel(
                        resolved.provider.displayName
                      )
                    : messages.composer.provider.listLabel
                }
                value={resolved?.provider.displayName ?? ''}
                icon="provider"
                isExpanded={openSelector === 'provider'}
                onPress={() => handleToggle('provider')}
              />
              {resolved ? (
                <SelectTrigger
                  label={messages.composer.model.triggerLabel(
                    resolved.model.displayName
                  )}
                  value={resolved.model.displayName}
                  isExpanded={openSelector === 'model'}
                  onPress={() => handleToggle('model')}
                />
              ) : null}
              {resolved && effortLabel ? (
                <SelectTrigger
                  label={messages.composer.effort.triggerLabel(effortLabel)}
                  value={effortLabel}
                  isExpanded={openSelector === 'effort'}
                  onPress={() => handleToggle('effort')}
                />
              ) : null}
            </>
          }
          onSendPress={handleSend}
        />

        {openSelector === 'provider' ? (
          <div className="composer__popover">
            <Popover
              header={messages.composer.provider.header}
              footer={messages.composer.provider.footer}
            >
              <SelectList
                label={messages.composer.provider.listLabel}
                options={providerOptions}
                selectedId={resolved?.provider.id ?? null}
                onSelect={handleProviderSelect}
              />
            </Popover>
          </div>
        ) : null}

        {openSelector === 'model' && resolved ? (
          <div className="composer__popover">
            <Popover
              header={messages.composer.model.header}
              footer={messages.composer.model.footer}
            >
              <SelectList
                label={messages.composer.model.listLabel}
                options={modelOptions}
                selectedId={resolved.model.id}
                onSelect={handleModelSelect}
                lead={{
                  title: messages.composer.model.leadTitle,
                  description: messages.composer.model.leadDescription
                }}
                slot={
                  <div className="select-list__provider-line">
                    <Icon name="provider" size="sm" />
                    <span>
                      {messages.composer.model.providerLine(
                        resolved.provider.displayName
                      )}
                    </span>
                    <Button
                      variant="text"
                      onPress={() => handleToggle('provider')}
                    >
                      {messages.composer.model.changeLabel}
                    </Button>
                  </div>
                }
              />
            </Popover>
          </div>
        ) : null}

        {openSelector === 'effort' && resolved ? (
          <div className="composer__popover">
            <Popover variant="panel">
              <EffortSlider
                label={messages.composer.effort.groupLabel}
                modelName={resolved.model.displayName}
                levels={resolved.effortLevels}
                selectedLevel={resolved.selection.effortLevel}
                levelLabel={getEffortLevelLabel}
                onSelect={handleEffortSelect}
              />
            </Popover>
          </div>
        ) : null}

        {openSelector === 'approval' && approvalMode ? (
          <div className="composer__popover composer__popover--start">
            <Popover variant="wide" header={approvalHeaderLabel}>
              <ApprovalModePicker
                label={messages.composer.approval.listLabel}
                selectedMode={approvalMode}
                onSelect={handleApprovalSelect}
              />
            </Popover>
          </div>
        ) : null}
      </div>
    </div>
  );
}
