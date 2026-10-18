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
  CHANGES_TAB_ID,
  SUBAGENTS_TAB_ID,
  openSubagentsTab
} from './file-tabs';

const APP = 'src/App.tsx';
const DOC = 'docs/research-tecnico/arquitectura-tauri.md';

describe('right panel file tabs', () => {
  it('opens and refocuses one subagents tab alongside files and changes without id collisions', () => {
    const files = openFileTab(INITIAL_FILE_TABS, 'subagents');
    const changes = openChangesTab(files, 'Cambios');
    const opened = openSubagentsTab(changes, 'Subagentes');
    expect(opened.tabs.map(tab => tab.id)).toEqual([
      'file:subagents',
      'changes',
      'subagents'
    ]);
    expect(opened.activeTabId).toBe(SUBAGENTS_TAB_ID);
    expect(openSubagentsTab(opened, 'Subagentes')).toBe(opened);
    const focused = openFileTab(opened, 'subagents');
    expect(openSubagentsTab(focused, 'Subagentes').activeTabId).toBe(
      SUBAGENTS_TAB_ID
    );
    expect(openSubagentsTab(focused, 'Subagentes').tabs).toBe(opened.tabs);
    expect(
      closeFileTab(focused, fileTabId('subagents')).tabs.map(tab => tab.kind)
    ).toEqual(['changes', 'subagents']);
    expect(
      closeFileTab(openChangesTab(opened, 'Cambios'), CHANGES_TAB_ID)
        .activeTabId
    ).toBe(fileTabId('subagents'));
    expect(
      openFileTab(
        openSubagentsTab(INITIAL_FILE_TABS, 'Subagentes'),
        'subagents'
      ).tabs
    ).toHaveLength(2);
    expect(files.tabs).toHaveLength(1);
  });
  it('opens a single changes tab and refocuses it without losing file tabs', () => {
    const files = openFileTab(INITIAL_FILE_TABS, APP);
    const changes = openChangesTab(files, 'Cambios');
    expect(changes.tabs).toEqual([
      { kind: 'file', id: fileTabId(APP), path: APP, name: 'App.tsx' },
      { kind: 'changes', id: CHANGES_TAB_ID, name: 'Cambios' }
    ]);
    expect(changes.activeTabId).toBe(CHANGES_TAB_ID);
    expect(openChangesTab(changes, 'Cambios')).toBe(changes);
    const focusedFile = openFileTab(changes, APP);
    expect(focusedFile.tabs).toHaveLength(2);
    expect(focusedFile.activeTabId).toBe(fileTabId(APP));
    const refocused = openChangesTab(focusedFile, 'Cambios');
    expect(refocused.tabs).toHaveLength(2);
    expect(refocused.activeTabId).toBe(CHANGES_TAB_ID);
    expect(closeFileTab(focusedFile, fileTabId(APP)).activeTabId).toBe(
      CHANGES_TAB_ID
    );
    expect(files.tabs).toHaveLength(1);
  });

  it('keeps a file named like the changes tab in its own tab', () => {
    // `changes` is a legal workspace path, so the two ids must never meet: the
    // file keeps its own tab beside the change set, whichever opens first.
    const fileFirst = openFileTab(INITIAL_FILE_TABS, 'changes');
    const bothFirst = openChangesTab(fileFirst, 'Cambios');

    expect(bothFirst.tabs.map(tab => tab.kind)).toEqual(['file', 'changes']);
    expect(bothFirst.activeTabId).toBe(CHANGES_TAB_ID);
    expect(
      activeFileTab(focusFileTab(bothFirst, fileTabId('changes')))
    ).toEqual({
      kind: 'file',
      id: fileTabId('changes'),
      path: 'changes',
      name: 'changes'
    });

    const changesFirst = openChangesTab(INITIAL_FILE_TABS, 'Cambios');
    const bothSecond = openFileTab(changesFirst, 'changes');

    expect(bothSecond.tabs.map(tab => tab.kind)).toEqual(['changes', 'file']);
    expect(bothSecond.activeTabId).toBe(fileTabId('changes'));
    expect(openFileTab(bothSecond, 'changes')).toBe(bothSecond);
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
    expect(state.activeTabId).toBe(fileTabId(DOC));
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
    expect(state.activeTabId).toBe(fileTabId(APP));
  });

  it('returns the same state when the requested file already holds focus', () => {
    const opened = openFileTab(INITIAL_FILE_TABS, APP);

    expect(openFileTab(opened, APP)).toBe(opened);
  });

  it('focuses a tab by id and ignores an unknown id', () => {
    const opened = openFileTab(openFileTab(INITIAL_FILE_TABS, APP), DOC);

    expect(focusFileTab(opened, fileTabId(APP)).activeTabId).toBe(
      fileTabId(APP)
    );
    expect(focusFileTab(opened, 'src/missing.ts')).toBe(opened);
  });

  it('closes a tab and hands focus to its left neighbour', () => {
    const opened = openFileTab(openFileTab(INITIAL_FILE_TABS, APP), DOC);
    const closed = closeFileTab(opened, fileTabId(DOC));

    expect(
      closed.tabs.map(tab => (tab.kind === 'file' ? tab.path : null))
    ).toEqual([APP]);
    expect(closed.activeTabId).toBe(fileTabId(APP));
  });

  it('leaves focus alone when a background tab is closed', () => {
    const opened = openFileTab(openFileTab(INITIAL_FILE_TABS, APP), DOC);
    const closed = closeFileTab(opened, fileTabId(APP));

    expect(
      closed.tabs.map(tab => (tab.kind === 'file' ? tab.path : null))
    ).toEqual([DOC]);
    expect(closed.activeTabId).toBe(fileTabId(DOC));
  });

  it('drops focus when the last tab closes', () => {
    const closed = closeFileTab(
      openFileTab(INITIAL_FILE_TABS, APP),
      fileTabId(APP)
    );

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
