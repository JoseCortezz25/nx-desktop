/**
 * Shared cross-feature i18n messages.
 *
 * Single source of truth for generic UI copy reused by two or more features, as
 * defined in `.claude/rules/text-management.md`: generic reusable actions and
 * public IPC error-code translations. Feature-scoped copy lives in
 * `src/features/<feature>/messages.ts`.
 *
 * Components must never hardcode user-facing strings or wireframe placeholders.
 * Read copy through the accessors exported here (`getSharedMessages`,
 * `getSharedErrorMessage`) so lookup stays behind one seam.
 */
export const sharedMessages = {
  actions: {
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    retry: 'Retry'
  },
  errors: {
    validation_failed: 'The request contains invalid parameters.',
    permission_denied:
      'Operation not permitted outside the authorized workspace.',
    provider_unavailable:
      'The selected agent provider is currently unavailable.',
    cancelled: 'The run was cancelled.',
    internal_error: 'An unexpected internal error occurred.'
  }
} as const;

/** Stable `snake_case` error codes carried by `AppErrorDto`. */
export type SharedErrorCode = keyof typeof sharedMessages.errors;

/** Shape of the shared message map, derived from the `as const` literal. */
export type SharedMessages = typeof sharedMessages;

/** Returns the shared message map. */
export function getSharedMessages(): SharedMessages {
  return sharedMessages;
}

/** Resolves the localized copy for a public IPC error code. */
export function getSharedErrorMessage(code: SharedErrorCode): string {
  return sharedMessages.errors[code];
}
