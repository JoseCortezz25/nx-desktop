/**
 * Contract test for the shared IPC error kernel (issue #16, slice 1).
 *
 * `docs/ipc/fixtures/*.json` is the single source shared with the Rust suite
 * (`src-tauri/tests/ipc_contract.rs`), imported here through `resolveJsonModule`
 * so both sides read the same bytes. This test proves the TypeScript
 * `AppErrorDto` agrees with those fixtures: the same five `snake_case` codes,
 * the same `camelCase` wire keys, and the same retry posture. The
 * `satisfies Record<AppErrorCode, AppErrorDto>` on the typed literal view makes
 * a missing or misspelled code fail `tsc`, not only the runtime assertions.
 */
import { describe, expect, it } from 'vitest';
import { getSharedMessages } from '@/shared/i18n/messages';
import cancelledFixture from '../../../docs/ipc/fixtures/app-error-cancelled.json';
import internalErrorFixture from '../../../docs/ipc/fixtures/app-error-internal-error.json';
import permissionDeniedFixture from '../../../docs/ipc/fixtures/app-error-permission-denied.json';
import providerUnavailableFixture from '../../../docs/ipc/fixtures/app-error-provider-unavailable.json';
import validationFailedFixture from '../../../docs/ipc/fixtures/app-error-validation-failed.json';
import {
  appErrorCodes,
  isAppErrorCode,
  isAppErrorDto,
  toAppErrorDto
} from './contracts';
import type { AppErrorCode, AppErrorDto } from './contracts';

/** Every shipped fixture, keyed by its file name. */
const fixtureByName = {
  'app-error-cancelled.json': cancelledFixture,
  'app-error-internal-error.json': internalErrorFixture,
  'app-error-permission-denied.json': permissionDeniedFixture,
  'app-error-provider-unavailable.json': providerUnavailableFixture,
  'app-error-validation-failed.json': validationFailedFixture
} as const;

type FixtureName = keyof typeof fixtureByName;

const fixtureNames = Object.keys(fixtureByName) as FixtureName[];

/** The typed literal view of every shipped fixture, pinned by code. */
const expectedAppErrors = {
  validation_failed: {
    code: 'validation_failed',
    message: 'prompt exceeds the maximum accepted size',
    retryable: false,
    requestId: 'req-9f1c4a20'
  },
  permission_denied: {
    code: 'permission_denied',
    message: 'path is outside the authorized workspace root',
    retryable: false,
    requestId: 'req-3b7e15d8'
  },
  provider_unavailable: {
    code: 'provider_unavailable',
    message: 'provider adapter did not respond before the timeout',
    retryable: true,
    requestId: 'req-6c02f7a1'
  },
  cancelled: {
    code: 'cancelled',
    message: 'run cancelled by user request',
    retryable: false,
    requestId: 'req-a4d18e6b'
  },
  internal_error: {
    code: 'internal_error',
    message: 'unexpected internal error',
    retryable: true,
    requestId: 'req-e8f3b907'
  }
} as const satisfies Record<AppErrorCode, AppErrorDto>;

/** Narrows a fixture to a complete `AppErrorDto`, failing loudly if it drifts. */
function fixture(name: FixtureName): AppErrorDto {
  const value: unknown = fixtureByName[name];
  if (!isAppErrorDto(value)) {
    throw new Error(`${name} is not a valid AppErrorDto fixture`);
  }
  return value;
}

describe('AppErrorDto contract', () => {
  it('uses exactly the five public snake_case codes', () => {
    const messageCodes = Object.keys(getSharedMessages().errors);
    expect([...appErrorCodes].sort()).toEqual([...messageCodes].sort());
    expect(appErrorCodes).toHaveLength(5);
  });

  it('ships one fixture per code with camelCase wire keys only', () => {
    const dtos = fixtureNames.map(name => fixture(name));
    expect(dtos).toHaveLength(appErrorCodes.length);
    expect(dtos.map(dto => dto.code).sort()).toEqual([...appErrorCodes].sort());
    for (const dto of dtos) {
      expect(Object.keys(dto).sort()).toEqual([
        'code',
        'message',
        'requestId',
        'retryable'
      ]);
    }
  });

  it('matches the typed literal view of every fixture byte-for-byte', () => {
    for (const name of fixtureNames) {
      expect(expectedAppErrors[fixture(name).code]).toEqual(fixture(name));
    }
  });

  it('recognizes a valid code and rejects an unknown one', () => {
    expect(isAppErrorCode('permission_denied')).toBe(true);
    expect(isAppErrorCode('not_a_code')).toBe(false);
    expect(isAppErrorCode(42)).toBe(false);
  });
});

describe('toAppErrorDto normalization', () => {
  it('passes a valid DTO through unchanged', () => {
    const dto = fixture('app-error-cancelled.json');
    expect(toAppErrorDto(dto)).toEqual(dto);
  });

  it('normalizes a raw Error into internal_error', () => {
    expect(toAppErrorDto(new Error('transport exploded'))).toEqual({
      code: 'internal_error',
      message: 'transport exploded',
      retryable: false,
      requestId: ''
    });
  });

  it('normalizes a non-error rejection value into internal_error', () => {
    expect(toAppErrorDto('opaque rejection').code).toBe('internal_error');
    expect(toAppErrorDto({ unexpected: true }).code).toBe('internal_error');
    expect(toAppErrorDto(undefined).retryable).toBe(false);
  });

  it('flags a malformed error-shaped object for normalization', () => {
    expect(isAppErrorDto({ code: 'cancelled' })).toBe(false);
    expect(toAppErrorDto({ code: 'cancelled' }).code).toBe('internal_error');
  });
});
