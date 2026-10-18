import { describe, expect, it } from 'vitest';
import {
  activeFileTab,
  applyOpenFileRequest,
  closeFileTab,
  fileTabId,
  focusFileTab,
  INITIAL_FILE_TABS,
  openFileTab,
  openChangesTab,
  CHANGES_TAB_ID
} from './file-tabs';

const APP = 'src/App.tsx';
const DOC = 'docs/research-tecnico/arquitectura-tauri.md';

describe('right panel file tabs', () => {
  it('opens a single changes tab and refocuses it without losing file tabs', () => {
    const files = openFileTab(INITIAL_FILE_TABS, APP);
    const changes = openChangesTab(files, 'Cambios');
    expect(changes.tabs).toEqual([
      { kind: 'file', id: APP, path: APP, name: 'App.tsx' },
      { kind: 'changes', id: CHANGES_TAB_ID, name: 'Cambios' }
    ]);
    expect(changes.activeTabId).toBe(CHANGES_TAB_ID);
    expect(openChangesTab(changes, 'Cambios')).toBe(changes);
    const focusedFile = openFileTab(changes, APP);
    expect(focusedFile.tabs).toHaveLength(2);
    expect(focusedFile.activeTabId).toBe(APP);
    const refocused = openChangesTab(focusedFile, 'Cambios');
    expect(refocused.tabs).toHaveLength(2);
    expect(refocused.activeTabId).toBe(CHANGES_TAB_ID);
    expect(closeFileTab(focusedFile, APP).activeTabId).toBe(CHANGES_TAB_ID);
    expect(files.tabs).toHaveLength(1);
  });

  it('opens one tab per requested file, focusing the newest one', () => {
    let state = applyOpenFileRequest(INITIAL_FILE_TABS, { path: APP });
    state = applyOpenFileRequest(state, { path: DOC });

    // Observed tab set: both files, in the order they were opened.
    expect(
      state.tabs.map(tab => (tab.kind === 'file' ? tab.path : null))
    ).toEqual([APP, DOC]);
    expect(state.tabs.map(tab => tab.name)).toEqual([
      'App.tsx',
      'arquitectura-tauri.md'
    ]);
    expect(state.activeTabId).toBe(DOC);
  });

  it('focuses an already open file instead of duplicating its tab', () => {
    let state = applyOpenFileRequest(INITIAL_FILE_TABS, { path: APP });
    state = applyOpenFileRequest(state, { path: DOC });
    state = applyOpenFileRequest(state, { path: APP });

    // Observed tab set after reopening the first file: still two tabs, and the
    // first one is focused.
    expect(
      state.tabs.map(tab => (tab.kind === 'file' ? tab.path : null))
    ).toEqual([APP, DOC]);
    expect(state.activeTabId).toBe(APP);
  });

  it('returns the same state when the requested file already holds focus', () => {
    const opened = openFileTab(INITIAL_FILE_TABS, APP);

    expect(openFileTab(opened, APP)).toBe(opened);
  });

  it('focuses a tab by id and ignores an unknown id', () => {
    const opened = openFileTab(openFileTab(INITIAL_FILE_TABS, APP), DOC);

    expect(focusFileTab(opened, fileTabId(APP)).activeTabId).toBe(APP);
    expect(focusFileTab(opened, 'src/missing.ts')).toBe(opened);
  });

  it('closes a tab and hands focus to its left neighbour', () => {
    const opened = openFileTab(openFileTab(INITIAL_FILE_TABS, APP), DOC);
    const closed = closeFileTab(opened, DOC);

    expect(
      closed.tabs.map(tab => (tab.kind === 'file' ? tab.path : null))
    ).toEqual([APP]);
    expect(closed.activeTabId).toBe(APP);
  });

  it('leaves focus alone when a background tab is closed', () => {
    const opened = openFileTab(openFileTab(INITIAL_FILE_TABS, APP), DOC);
    const closed = closeFileTab(opened, APP);

    expect(
      closed.tabs.map(tab => (tab.kind === 'file' ? tab.path : null))
    ).toEqual([DOC]);
    expect(closed.activeTabId).toBe(DOC);
  });

  it('drops focus when the last tab closes', () => {
    const closed = closeFileTab(openFileTab(INITIAL_FILE_TABS, APP), APP);

    expect(closed.tabs).toEqual([]);
    expect(closed.activeTabId).toBeNull();
    expect(activeFileTab(closed)).toBeNull();
  });

  it('resolves the focused tab', () => {
    const opened = openFileTab(openFileTab(INITIAL_FILE_TABS, APP), DOC);

    expect(activeFileTab(opened)).toMatchObject({ kind: 'file', path: DOC });
  });

  it('never mutates the state it is given', () => {
    const opened = openFileTab(INITIAL_FILE_TABS, APP);
    const snapshot = opened.tabs;

    closeFileTab(opened, APP);

    expect(opened.tabs).toBe(snapshot);
    expect(
      opened.tabs.map(tab => (tab.kind === 'file' ? tab.path : null))
    ).toEqual([APP]);
  });
});
