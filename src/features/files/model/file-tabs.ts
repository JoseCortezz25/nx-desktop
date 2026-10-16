/**
 * Open file tabs of the right panel.
 *
 * The panel consumes the shell's single open-file request (#11 emits it, #12
 * reads it) and turns each request into a tab. The transition is pure and lives
 * here so the panel only wires it to React state — the panel never encodes the
 * "focus instead of duplicate" rule inline.
 *
 * Reopening a file that is already open focuses its tab; it never adds a second
 * tab for the same path.
 */
import type { OpenFileRequest } from '@/shared/domain/file-reference.types';
import { fileName } from './file-path';

/** One open file tab. */
export interface FileTab {
  /** Stable tab identity. A path is unique inside a workspace, so it is the id. */
  readonly id: string;
  readonly path: string;
  /** Tab label: the file name, as screen 23 draws it. */
  readonly name: string;
}

/** The panel's tab strip: which files are open and which one is focused. */
export interface FileTabs {
  readonly tabs: readonly FileTab[];
  readonly activeTabId: string | null;
}

/** The panel starts with no file open; the shell's request opens the first tab. */
export const INITIAL_FILE_TABS: FileTabs = {
  tabs: [],
  activeTabId: null
};

/** Tab id for a workspace-relative path. */
export function fileTabId(path: string): string {
  return path;
}

/**
 * Opens the tab for a path, or focuses it when the file is already open. Returns
 * a new state; the input is never mutated, so it can be used directly as a React
 * state updater. A file that is already focused yields the same state object, so
 * React can skip the re-render.
 */
export function openFileTab(state: FileTabs, path: string): FileTabs {
  const id = fileTabId(path);

  if (state.tabs.some(tab => tab.id === id)) {
    return state.activeTabId === id ? state : { ...state, activeTabId: id };
  }

  return {
    tabs: [...state.tabs, { id, path, name: fileName(path) }],
    activeTabId: id
  };
}

/** Focuses an already open tab. An unknown id leaves the state untouched. */
export function focusFileTab(state: FileTabs, tabId: string): FileTabs {
  if (!state.tabs.some(tab => tab.id === tabId)) {
    return state;
  }
  return state.activeTabId === tabId ? state : { ...state, activeTabId: tabId };
}

/**
 * Closes one tab. When the closed tab held focus the neighbour on its left takes
 * over, falling back to the tab that slid into its place, so the strip never
 * ends up focused on a tab that no longer exists.
 */
export function closeFileTab(state: FileTabs, tabId: string): FileTabs {
  const index = state.tabs.findIndex(tab => tab.id === tabId);
  if (index === -1) {
    return state;
  }

  const tabs = state.tabs.filter(tab => tab.id !== tabId);
  if (state.activeTabId !== tabId) {
    return { tabs, activeTabId: state.activeTabId };
  }

  const neighbour = tabs[index - 1] ?? tabs[index] ?? null;
  return { tabs, activeTabId: neighbour?.id ?? null };
}

/** The focused tab, or `null` when nothing is open. */
export function activeFileTab(state: FileTabs): FileTab | null {
  return state.tabs.find(tab => tab.id === state.activeTabId) ?? null;
}

/** The tab a shell open-file request opens or focuses. */
export function applyOpenFileRequest(
  state: FileTabs,
  request: OpenFileRequest
): FileTabs {
  return openFileTab(state, request.path);
}
