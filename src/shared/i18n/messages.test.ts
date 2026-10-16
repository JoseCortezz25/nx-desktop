import { describe, expect, it } from 'vitest';
import {
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

  it('carries the wireframe window menus as the copy source', () => {
    expect(getSharedMessages().window.menus).toEqual({
      file: 'Archivo',
      edit: 'Edición',
      view: 'Ver',
      help: 'Ayuda'
    });
  });
});
