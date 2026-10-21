import { describe, expect, it } from 'vitest';
import {
  resolveSidebarFocusRestore,
  type FocusContainer,
  type FocusRestoreCandidate
} from './sidebar-focus';

interface FakeNode extends FocusRestoreCandidate {
  readonly name: string;
}

function node(name: string, isConnected = true): FakeNode {
  return { name, isConnected };
}

function drawerContaining(...nodes: readonly unknown[]): FocusContainer {
  return { contains: candidate => nodes.includes(candidate) };
}

describe('resolveSidebarFocusRestore (#51)', () => {
  const toggle = node('rail-toggle');
  const drawerChild = node('new-chat');
  const body = node('body');

  it('restores to the rail toggle when focus is inside the still-mounted drawer', () => {
    const drawer = drawerContaining(drawerChild);

    expect(resolveSidebarFocusRestore(toggle, drawer, drawerChild)).toBe(
      toggle
    );
  });

  it('cannot recover once the drawer is gone and focus fell to body (the #51 defect)', () => {
    // Asked after unmount, the active element is already `body`, which is not
    // inside the drawer — the decision has to be taken before the close.
    const drawer = drawerContaining(drawerChild);

    expect(resolveSidebarFocusRestore(toggle, drawer, body)).toBeNull();
  });

  it('never steals focus the user moved outside the drawer', () => {
    const composer = node('composer');
    const drawer = drawerContaining(drawerChild);

    expect(resolveSidebarFocusRestore(toggle, drawer, composer)).toBeNull();
  });

  it('skips a restore target that has left the document', () => {
    const detached = node('rail-toggle', false);
    const drawer = drawerContaining(drawerChild);

    expect(
      resolveSidebarFocusRestore(detached, drawer, drawerChild)
    ).toBeNull();
  });

  it('skips a restore target that lives inside the closing drawer', () => {
    const drawer = drawerContaining(drawerChild);

    expect(
      resolveSidebarFocusRestore(drawerChild, drawer, drawerChild)
    ).toBeNull();
  });

  it('does nothing without a recorded opener or a drawer node', () => {
    const drawer = drawerContaining(drawerChild);

    expect(resolveSidebarFocusRestore(null, drawer, drawerChild)).toBeNull();
    expect(resolveSidebarFocusRestore(toggle, null, drawerChild)).toBeNull();
  });
});
