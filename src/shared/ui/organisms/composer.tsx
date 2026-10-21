import { useEffect, useId, useRef, useState } from 'react';
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
  changeWorktreeFlag,
  resolveApprovalMode,
  resolveRunEnvironment,
  type ResolvedSelection
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
import { IconButton } from '../molecules/icon-button';
import { ProjectPicker } from '../molecules/project-picker';
import { SelectList, type SelectOption } from '../molecules/select-list';
import { SelectTrigger } from '../molecules/select-trigger';
import {
  submitDraftWithSelection,
  typeInDraft,
  type ComposerDraft
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
  readonly newHookCount?: number;
  readonly onOpenHookReview?: () => void;
  /**
   * The provider catalog the selectors read, resolved by the shell root through
   * the typed provider port. Empty while the catalog loads, which leaves the
   * controls unrendered rather than naming a provider here.
   */
  readonly providers: readonly Provider[];
  /**
   * The reconciled `provider -> model -> effort` chain the shell root owns. The
   * composer renders it and reports changes upward, so the sidebar brand and the
   * selectors read one selection — never a second copy (#10 defect carried over
   * from #7). `null` is the "no provider selected yet" state: no provider is
   * ever preselected (decision 2026-10-20), the model chip stays disabled, the
   * effort chip is not drawn and sending is blocked with the draft kept.
   */
  readonly selection: ResolvedSelection | null;
  /** Hands the chosen provider up; the shell reconciles model and effort. */
  readonly onSelectProvider: (providerId: ProviderId) => void;
  readonly onSelectModel: (modelId: ModelId) => void;
  readonly onSelectEffort: (effortLevel: EffortLevel) => void;
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
   * Opens the create-project dialog (#9). The picker's `Nuevo proyecto` row
   * reports it; the *shell* owns the dialog and the catalog it creates into, so
   * the composer only forwards the intent (and closes its popover). Omitted when
   * the surface has no dialog to open.
   */
  readonly onCreateProject?: () => void;
  /**
   * Hands the chosen approval level up. The shell persists it through the
   * project port — the composer never keeps a copy of the policy.
   */
  readonly onChangeApprovalMode: (approvalMode: ApprovalMode) => void;
  /**
   * The unsent prompt, owned by the shell root beside the selection chain. The
   * composer is a **controlled** field: it renders this value and reports every
   * change upward instead of keeping its own copy, so the draft is not lost
   * when the main pane re-slots the composer under a different parent (the
   * `Home -> Conversation` switch remounts it).
   */
  readonly draft: ComposerDraft;
  /** Reports the draft a keystroke, paste or send produces up to the shell. */
  readonly onDraftChange: (draft: ComposerDraft) => void;
  /**
   * Handed the submitted prompt text and the run environment the composer
   * resolved for it, so the shell can start the run (#23).
   */
  readonly onSubmit: (prompt: string, environment: RunEnvironment) => void;
  /**
   * `true` while a run streams. Sending is guarded (the draft is kept) and the
   * send control becomes the cancel control.
   */
  readonly isRunActive?: boolean;
  /** Cancels the streaming run. */
  readonly onCancelRun?: () => void;
}

/**
 * Organism: the composer and the context bar on its top edge
 * (`docs/wireframes/README.md`, "Reusable components").
 *
 * It owns the run environment and which popover is open. The unsent draft, the
 * selection chain (#7) and the approval policy (#8) are the exceptions: all
 * three live outside this organism — the draft and the chain on the shell root,
 * the policy on the project — so the composer renders what it is handed and
 * reports changes upward instead of keeping a second copy. That is what keeps
 * the draft alive across the `Home -> Conversation` view switch, which remounts
 * this component under a different parent.
 *
 * Everything resolved from catalog/port data is derived during render — a
 * late-arriving catalog or branch list becomes a valid selection instead of
 * needing an effect.
 */
export function Composer({
  newHookCount = 0,
  onOpenHookReview,
  providers,
  selection,
  onSelectProvider,
  onSelectModel,
  onSelectEffort,
  projects,
  activeProject,
  branches,
  onSelectProject,
  onCreateProject,
  onChangeApprovalMode,
  draft,
  onDraftChange,
  onSubmit,
  isRunActive = false,
  onCancelRun
}: ComposerProps) {
  const messages = getSharedMessages();
  const [desiredEnvironment, setDesiredEnvironment] = useState<RunEnvironment>(
    DEFAULT_RUN_ENVIRONMENT
  );
  const [openSelector, setOpenSelector] = useState<OpenSelector | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectionHintId = useId();

  // The reconciled chain is owned by the shell root and handed down, so the
  // sidebar brand and these selectors read one selection.
  const resolved = selection;

  // Derived the same way: the approval level belongs to the active project, and
  // the environment's branch belongs to the active workspace's branch list.
  const approvalMode = resolveApprovalMode(activeProject);
  const environment = resolveRunEnvironment(desiredEnvironment, branches);
  const environmentLabel =
    environment.environmentName || messages.contextBar.environment.localMachine;

  // Publishes how much room the dock needs at the bottom of the window
  // (`--composer-clearance`) so the narrow-window region overlays (#43) can end
  // above it: the overlays must never cover the composer or its send control.
  // The observer keeps the value correct as the draft grows or the window
  // resizes; the body is observed too because a bottom-docked composer moves
  // without changing its own height. Cleanup is idempotent.
  useEffect(() => {
    const dock = rootRef.current;
    if (!dock || typeof ResizeObserver === 'undefined') {
      return;
    }

    const body = dock.closest('.window-shell__body');
    const root = document.documentElement;
    const publish = () => {
      const bodyBottom = body
        ? body.getBoundingClientRect().bottom
        : window.innerHeight;
      const clearance = Math.max(
        0,
        Math.round(bodyBottom - dock.getBoundingClientRect().top)
      );
      root.style.setProperty('--composer-clearance', `${clearance}px`);
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(dock);
    if (body) {
      observer.observe(body);
    }

    return () => {
      observer.disconnect();
      root.style.removeProperty('--composer-clearance');
    };
  }, []);

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
    onDraftChange(typeInDraft(text));
  }

  function handleSend() {
    // One run at a time: a send while a run streams keeps the draft untouched.
    if (isRunActive) {
      return;
    }
    // Reads the draft it is handed rather than a state updater: the submit
    // rule calls `onSubmit`, and an updater must stay side-effect free (React
    // may invoke it twice in StrictMode). With no provider selected the rule
    // keeps the draft and starts nothing (decision 2026-10-20).
    onDraftChange(
      submitDraftWithSelection(draft, resolved !== null, text =>
        onSubmit(text, environment)
      )
    );
  }

  function handleToggle(selector: OpenSelector) {
    setOpenSelector(current => (current === selector ? null : selector));
  }

  function handleProviderSelect(providerId: ProviderId) {
    // The shell applies the transition rule: a provider change resets model and
    // effort to the new provider's valid defaults (§3.1, item 2).
    onSelectProvider(providerId);
    setOpenSelector(null);
  }

  function handleModelSelect(modelId: ModelId) {
    onSelectModel(modelId);
    setOpenSelector(null);
  }

  function handleEffortSelect(effortLevel: EffortLevel) {
    onSelectEffort(effortLevel);
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

  function handleCreateProjectPress() {
    // One dismissal path: opening the dialog closes the popover that opened it,
    // so the modal never sits on top of its own trigger.
    setOpenSelector(null);
    onCreateProject?.();
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
                onCreateProject={
                  onCreateProject ? handleCreateProjectPress : undefined
                }
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
            <>
              {approvalMode && approvalCopy ? (
                <SelectTrigger
                  label={messages.composer.approval.triggerLabel(
                    approvalCopy.label
                  )}
                  value={approvalCopy.label}
                  icon={getApprovalModeIcon(approvalMode)}
                  tone={
                    isUnrestrictedApprovalMode(approvalMode)
                      ? 'warn'
                      : undefined
                  }
                  isExpanded={openSelector === 'approval'}
                  onPress={() => handleToggle('approval')}
                />
              ) : null}
              {onOpenHookReview ? (
                <span className="composer__hooks">
                  <IconButton
                    icon="hook"
                    label={messages.composer.hooks.triggerLabel(newHookCount)}
                    onPress={onOpenHookReview}
                  />
                  {newHookCount > 0 ? (
                    <span className="composer__hooks-dot" aria-hidden="true" />
                  ) : null}
                </span>
              ) : null}
            </>
          }
          controls={
            <>
              <SelectTrigger
                label={
                  resolved
                    ? messages.composer.provider.triggerLabel(
                        resolved.provider.displayName
                      )
                    : messages.composer.provider.emptyTriggerLabel
                }
                value={
                  resolved?.provider.displayName ??
                  messages.composer.provider.emptyValue
                }
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
              ) : (
                <SelectTrigger
                  label={messages.composer.model.emptyTriggerLabel}
                  value={messages.composer.model.emptyValue}
                  isDisabled
                />
              )}
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
          isSendDisabled={!resolved}
          sendDescriptionId={resolved ? undefined : selectionHintId}
          isRunActive={isRunActive}
          onCancelPress={onCancelRun}
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

      {resolved ? null : (
        <p className="composer-dock__hint" id={selectionHintId}>
          {messages.composer.selectionRequiredHint}
        </p>
      )}
    </div>
  );
}
