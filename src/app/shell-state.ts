/**
 * The window shell's ephemeral view state and its pure transitions.
 *
 * The shell composition root owns the presentation state that spans regions,
 * each piece with exactly one owner: which conversation is open, which
 * toggleable regions are visible, and the file a chip asked the right panel to
 * show. Keeping their transitions pure here — the same pattern `region-visibility`
 * and `selection-chain` already use — lets the root only wire them to React
 * state, so the test runner (node, no DOM) can still observe the rules.
 *
 * The Home destination and the file request are both rules rather than plain
 * setters, because that is where the shipped defects lived: `navigateHome` is
 * the missing "clear the open conversation" path, and `revealFileInPanel` makes
 * region visibility respond to a request instead of leaving the panel hidden.
 */
import { INITIAL_OPEN_FILE_REQUEST } from '@/features/files/model/open-file-request';
import type { OpenFileRequest } from '@/shared/domain/file-reference.types';
import type { ConversationId } from '@/shared/domain/value-objects.types';
import {
  INITIAL_REGION_VISIBILITY,
  showRegion,
  toggleRegion,
  type RegionVisibility,
  type ShellRegion
} from '@/shared/ui/layout/region-visibility';

export interface ShellState {
  /** The conversation the main pane shows, or `null` for the home view. */
  readonly activeConversationId: ConversationId | null;
  /** The regions the rail's toggles open and close. */
  readonly visibility: RegionVisibility;
  /** The file the right panel was last asked to show, owned once by the shell. */
  readonly openFileRequest: OpenFileRequest | null;
  /**
   * How many times the change set has been asked for (#13). A counter rather than
   * a value: the panel only needs to notice that a *new* request arrived, so two
   * presses in a row still focus the same `Cambios` tab.
   */
  readonly openChangesRequestCount: number;
}

/**
 * The state screen 01 draws: no conversation open, both toggleable regions
 * closed, no file requested. Read from the same module seams the per-state
 * suites already seed, so the shell's real wiring is exercised end to end.
 */
export const INITIAL_SHELL_STATE: ShellState = {
  activeConversationId: null,
  visibility: INITIAL_REGION_VISIBILITY,
  openFileRequest: INITIAL_OPEN_FILE_REQUEST,
  openChangesRequestCount: 0
};

/** Selects a conversation; the main pane switches from home to that thread. */
export function openConversation(
  state: ShellState,
  conversationId: ConversationId
): ShellState {
  return { ...state, activeConversationId: conversationId };
}

/**
 * Returns to the home view by clearing the open conversation. An already-empty
 * shell yields the same object, so navigating home twice is a no-op rather than
 * a spurious re-render. This is the missing one-way switch's return path: both
 * the rail's home entry and the sidebar's new-chat row route through it.
 */
export function navigateHome(state: ShellState): ShellState {
  return state.activeConversationId === null
    ? state
    : { ...state, activeConversationId: null };
}

/** Flips one toggleable region without touching the other. */
export function toggleShellRegion(
  state: ShellState,
  region: ShellRegion
): ShellState {
  return { ...state, visibility: toggleRegion(state.visibility, region) };
}

/**
 * A file chip's request: stores it for the right panel (#12) **and** reveals
 * the region, so opening a file from the chat actually shows it
 * (`docs/wireframes/README.md`, "opens on file or diff click"). The request
 * keeps its one owner — this state — and the panel reads that same value; the
 * only thing that changes is the visibility the request drives.
 */
export function revealFileInPanel(
  state: ShellState,
  request: OpenFileRequest
): ShellState {
  return {
    ...state,
    visibility: showRegion(state.visibility, 'rightPanel'),
    openFileRequest: request
  };
}

/** A diff tool row's request: reveals the panel and records one more ask (#13). */
export function revealChangesInPanel(state: ShellState): ShellState {
  return {
    ...state,
    visibility: showRegion(state.visibility, 'rightPanel'),
    openChangesRequestCount: state.openChangesRequestCount + 1
  };
}
