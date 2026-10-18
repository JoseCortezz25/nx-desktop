import { describe, expect, it } from 'vitest';
import type { OpenFileRequest } from '@/shared/domain/file-reference.types';
import type { ConversationId } from '@/shared/domain/value-objects.types';
import {
  INITIAL_SHELL_STATE,
  openHookReview,
  closeHookReview,
  toggleShellHookSelection,
  navigateHome,
  openConversation,
  revealFileInPanel,
  revealChangesInPanel,
  toggleShellRegion
} from './shell-state';

/**
 * The window shell's own state module. These cover the two transitions that the
 * shipped defects lived in — the missing return to Home and the file request
 * that never revealed the panel — plus the region toggle the shell already had.
 *
 * They are the rule half of the seam; `app-shell-navigation-seam.test.tsx` proves
 * the shell's real wiring reaches these rules.
 */
const conversationId: ConversationId = 'conv-composer-chain';

const request: OpenFileRequest = {
  path: 'docs/research-tecnico/arquitectura-tauri.md'
};

describe('shell hook review state', () => {
  it('opens on an empty selection, resetting any previous review', () => {
    const selected = toggleShellHookSelection(INITIAL_SHELL_STATE, 'hook-lint');
    const opened = openHookReview(selected);
    expect(opened.hookReview).toEqual({
      isOpen: true,
      selectedHookIds: new Set()
    });
    expect(selected.hookReview.selectedHookIds.has('hook-lint')).toBe(true);
    expect(opened.visibility).toBe(selected.visibility);
  });
  it('closes without changing unrelated shell state', () => {
    const opened = openHookReview(INITIAL_SHELL_STATE);
    const closed = closeHookReview(opened);
    expect(closed.hookReview.isOpen).toBe(false);
    expect(opened.hookReview.isOpen).toBe(true);
    expect(closed.openFileRequest).toBe(opened.openFileRequest);
  });
  it('toggles selection immutably in either direction', () => {
    const selected = toggleShellHookSelection(INITIAL_SHELL_STATE, 'hook-lint');
    expect([...selected.hookReview.selectedHookIds]).toEqual(['hook-lint']);
    expect(INITIAL_SHELL_STATE.hookReview.selectedHookIds.size).toBe(0);
    expect(
      toggleShellHookSelection(selected, 'hook-lint').hookReview.selectedHookIds
        .size
    ).toBe(0);
    expect(selected.hookReview.selectedHookIds.size).toBe(1);
  });
});

describe('shell state', () => {
  it('starts home with both toggleable regions closed and no file requested', () => {
    expect(INITIAL_SHELL_STATE).toEqual({
      activeConversationId: null,
      visibility: { sidebar: false, rightPanel: false },
      openFileRequest: null,
      openChangesRequestCount: 0,
      hookReview: { isOpen: false, selectedHookIds: new Set() }
    });
  });

  it('reveals changes repeatedly without replacing the file request', () => {
    const initial = { ...INITIAL_SHELL_STATE, openFileRequest: request };
    const revealed = revealChangesInPanel(initial);
    expect(revealed.visibility).toEqual({ sidebar: false, rightPanel: true });
    expect(revealed.openChangesRequestCount).toBe(1);
    expect(revealed.openFileRequest).toBe(request);
    const again = revealChangesInPanel(revealed);
    expect(again.openChangesRequestCount).toBe(2);
    expect(again.visibility).toBe(revealed.visibility);
    expect(again.openFileRequest).toBe(request);
    expect(initial.openChangesRequestCount).toBe(0);
  });

  it('opens a conversation and returns home by clearing it', () => {
    const opened = openConversation(INITIAL_SHELL_STATE, conversationId);
    expect(opened.activeConversationId).toBe(conversationId);

    const home = navigateHome(opened);
    expect(home.activeConversationId).toBeNull();
  });

  it('navigating home from home is a no-op returning the same object', () => {
    // Both Home entry points may fire on the already-empty shell; returning the
    // same object avoids a spurious re-render (#40, criterion 1).
    expect(navigateHome(INITIAL_SHELL_STATE)).toBe(INITIAL_SHELL_STATE);
  });

  it('does not touch region visibility or the request when navigating home', () => {
    const opened = revealFileInPanel(
      openConversation(INITIAL_SHELL_STATE, conversationId),
      request
    );

    const home = navigateHome(opened);

    expect(home.activeConversationId).toBeNull();
    expect(home.visibility).toEqual({ sidebar: false, rightPanel: true });
    expect(home.openFileRequest).toBe(request);
  });

  it('toggles one region without touching the other or the conversation', () => {
    const toggled = toggleShellRegion(
      openConversation(INITIAL_SHELL_STATE, conversationId),
      'sidebar'
    );

    expect(toggled.visibility).toEqual({ sidebar: true, rightPanel: false });
    expect(toggled.activeConversationId).toBe(conversationId);
  });

  it('a file request both stores the request and reveals the right panel', () => {
    const revealed = revealFileInPanel(INITIAL_SHELL_STATE, request);

    // Storing alone was the shipped defect: the request existed but the panel
    // stayed hidden (#40, criterion 4).
    expect(revealed.openFileRequest).toBe(request);
    expect(revealed.visibility.rightPanel).toBe(true);
    expect(revealed.visibility.sidebar).toBe(false);
  });

  it('revealing an already-open panel keeps the same visibility object', () => {
    const opened = revealFileInPanel(INITIAL_SHELL_STATE, request);
    const again = revealFileInPanel(opened, request);

    // `showRegion`, not `toggleRegion`: a second request must never close the
    // panel it just opened.
    expect(again.visibility).toBe(opened.visibility);
    expect(again.openFileRequest).toBe(request);
  });
});
