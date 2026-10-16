/**
 * The open-file request the window shell starts with: none.
 *
 * A `FileChip` in the conversation sets the request once (#11 emits it) and the
 * right panel consumes that same value (#12). Keeping the initial value in its
 * own module — the same pattern `INITIAL_REGION_VISIBILITY` uses for the
 * toggleable regions — lets the shell's real state be exercised end to end
 * instead of the panel being handed a hand-built request.
 */
import type { OpenFileRequest } from '@/shared/domain/file-reference.types';

export const INITIAL_OPEN_FILE_REQUEST: OpenFileRequest | null = null;
