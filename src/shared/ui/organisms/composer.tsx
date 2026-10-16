import { useEffect, useRef, useState } from 'react';
import type { EffortLevel } from '@/shared/domain/effort-level.types';
import type { Provider } from '@/shared/domain/provider.types';
import {
  changeProvider,
  reconcileSelection,
  resolveSelection,
  type ComposerSelection
} from '@/shared/domain/selection-chain';
import type { ModelId, ProviderId } from '@/shared/domain/value-objects.types';
import { getEffortLevelLabel, getSharedMessages } from '@/shared/i18n/messages';
import { Button } from '../atoms/button';
import { Icon } from '../atoms/icon';
import { TextArea } from '../atoms/text-area';
import { ComposerBar } from '../molecules/composer-bar';
import { EffortSlider } from '../molecules/effort-slider';
import { Popover } from '../molecules/popover';
import { SelectList, type SelectOption } from '../molecules/select-list';
import { SelectTrigger } from '../molecules/select-trigger';
import {
  EMPTY_COMPOSER_DRAFT,
  submitDraft,
  typeInDraft
} from './composer-draft';
import './composer.css';

/** The composer selector whose popover is currently open. */
type OpenSelector = 'provider' | 'model' | 'effort';

export interface ComposerProps {
  /**
   * The provider catalog the selectors read, resolved by the shell root through
   * the typed provider port. Empty while the catalog loads, which leaves the
   * controls unrendered rather than naming a provider here.
   */
  readonly providers: readonly Provider[];
  /** Handed the submitted prompt text. */
  readonly onSubmit: (prompt: string) => void;
}

/**
 * Organism: the composer (`docs/wireframes/README.md`, "Reusable components").
 *
 * It owns the unsent draft and, since #7, the `provider -> model -> effort`
 * selection chain. The chain is ephemeral presentation state, so it lives here
 * as local state reconciled by the pure helpers in `selection-chain.ts`; the
 * approval chip (#8) and the microphone are theirs / out of scope.
 */
export function Composer({ providers, onSubmit }: ComposerProps) {
  const messages = getSharedMessages();
  const [draft, setDraft] = useState(EMPTY_COMPOSER_DRAFT);
  const [desiredSelection, setDesiredSelection] =
    useState<ComposerSelection | null>(null);
  const [openSelector, setOpenSelector] = useState<OpenSelector | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Derived during render: the chain is always valid for the current catalog, so
  // a late-arriving catalog becomes a usable selection without an effect.
  const resolved = resolveSelection(providers, desiredSelection);

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

  return (
    <div className="composer" ref={rootRef}>
      <TextArea
        label={messages.composer.promptLabel}
        value={draft.text}
        placeholder={placeholder}
        onChange={handlePromptChange}
      />
      <ComposerBar
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
    </div>
  );
}
