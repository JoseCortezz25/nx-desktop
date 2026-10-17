import { describe, expect, it } from 'vitest';
import {
  getEffortLevelLabel,
  getSharedErrorMessage,
  getSharedMessages,
  sharedMessages
} from './messages';

describe('shared messages accessor', () => {
  it('exposes the documented shared actions', () => {
    expect(getSharedMessages().actions.save).toBe('Save');
    expect(getSharedMessages().actions.retry).toBe('Retry');
  });

  it('resolves copy for every public IPC error code', () => {
    expect(getSharedErrorMessage('validation_failed')).toBe(
      'The request contains invalid parameters.'
    );
    expect(getSharedErrorMessage('provider_unavailable')).toBe(
      'The selected agent provider is currently unavailable.'
    );
  });

  it('returns the same map instance as the exported literal', () => {
    expect(getSharedMessages()).toBe(sharedMessages);
  });

  it('no longer carries the drawn window-chrome copy', () => {
    // #42 supersedes the wireframe's drawn title bar: the fake menu labels
    // (Archivo / Edición / Ver / Ayuda), the back/forward labels and the
    // window-control labels were removed with the controls they named. The
    // region toggle labels survived the move into the rail, the app's own
    // surface; a native menu's labels belong to its Rust declaration instead.
    const messages = getSharedMessages();

    expect(Object.keys(messages)).not.toContain('window');
    expect(messages.rail.toggleSidebarLabel).toBe('Alternar barra lateral');
    expect(messages.rail.toggleRightPanelLabel).toBe('Alternar panel derecho');
  });

  it('builds the composer prompt placeholder from the provider name', () => {
    expect(getSharedMessages().composer.promptPlaceholder('OpenCode')).toBe(
      'Trabaja con OpenCode'
    );
  });

  it('builds the selector chip labels from runtime names', () => {
    expect(getSharedMessages().composer.provider.triggerLabel('OpenCode')).toBe(
      'Proveedor: OpenCode'
    );
    expect(getSharedMessages().composer.model.triggerLabel('Kimi K2')).toBe(
      'Modelo: Kimi K2'
    );
    expect(getSharedMessages().composer.effort.triggerLabel('Ligero')).toBe(
      'Esfuerzo: Ligero'
    );
  });

  it('labels known effort stops and falls back to the provider token', () => {
    expect(getEffortLevelLabel('light')).toBe('Ligero');
    expect(getEffortLevelLabel('provider-only-stop')).toBe(
      'provider-only-stop'
    );
  });
});
