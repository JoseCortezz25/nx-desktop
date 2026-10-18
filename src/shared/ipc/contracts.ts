/**
 * Cross-language IPC error contract (issue #16, slice 1).
 *
 * This module is the single TypeScript definition of the public error shape that
 * crosses the Tauri boundary. It mirrors `src-tauri/src/ipc/error.rs` and the
 * machine-checkable fixtures in `docs/ipc/fixtures/`; all three must agree.
 *
 * Contract rules (`.claude/rules/ipc-and-contracts.md` §4):
 * - `code` is a closed set of stable `snake_case` identifiers.
 * - `message` is a safe diagnostic summary; the UI resolves display copy from
 *   the code through `getSharedErrorMessage`, never from this field.
 * - `retryable` and `requestId` travel on every error.
 *
 * This module has no React and no Tauri runtime dependency, so feature clients,
 * hooks and tests can all import it.
 */
import type { SharedErrorCode } from '@/shared/i18n/messages';

/**
 * The five public `snake_case` error codes, in the same order and spelling as
 * the `sharedMessages.errors` keys they are translated from. The
 * `satisfies readonly SharedErrorCode[]` clause fails `tsc` if a code drifts
 * from the i18n map.
 */
export const appErrorCodes = [
  'validation_failed',
  'permission_denied',
  'provider_unavailable',
  'cancelled',
  'internal_error'
] as const satisfies readonly SharedErrorCode[];

/** Stable `snake_case` error code carried by an `AppErrorDto`. */
export type AppErrorCode = (typeof appErrorCodes)[number];

/** Serializable error shape crossing the IPC boundary. */
export interface AppErrorDto {
  /** Closed, stable error identifier. */
  code: AppErrorCode;
  /** Safe diagnostic summary; never raw secrets or stack traces. */
  message: string;
  /** Whether the caller may safely retry the same intent. */
  retryable: boolean;
  /** Correlation id logged in Rust; empty when the failure predates the command. */
  requestId: string;
}

/** Narrows an `unknown` value to a known {@link AppErrorCode}. */
export function isAppErrorCode(value: unknown): value is AppErrorCode {
  return (
    typeof value === 'string' && appErrorCodes.some(code => code === value)
  );
}

/** Narrows an `unknown` rejection value to a complete `AppErrorDto`. */
export function isAppErrorDto(value: unknown): value is AppErrorDto {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    isAppErrorCode(candidate.code) &&
    typeof candidate.message === 'string' &&
    typeof candidate.retryable === 'boolean' &&
    typeof candidate.requestId === 'string'
  );
}

/**
 * Normalizes an `unknown` IPC rejection into an `AppErrorDto`.
 *
 * A valid DTO passes through with only its known fields kept. Anything else — a
 * raw `Error`, a string, or a malformed object — becomes `internal_error` with
 * `retryable: false` and an empty `requestId`, because a failure that never
 * reached a command has no Rust correlation id and is not known to be retryable.
 */
export function toAppErrorDto(error: unknown): AppErrorDto {
  if (isAppErrorDto(error)) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      requestId: error.requestId
    };
  }
  return {
    code: 'internal_error',
    message: describeUnknownError(error),
    retryable: false,
    requestId: ''
  };
}

/** Best-effort diagnostic text for a rejection that is not an `AppErrorDto`. */
function describeUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  return 'unknown error';
}
