import type { ReactNode } from 'react';
import './icon.css';

/** Closed set of icons used by the window shell chrome. */
export const ICON_NAMES = [
  'arrow-left',
  'arrow-right',
  'panel-left',
  'panel-right',
  'minus',
  'square',
  'close',
  'home',
  'plus',
  'send',
  'search',
  'chevron-down',
  'square-pen',
  'check',
  'provider',
  'bolt',
  'hook',
  // Composer context surfaces (#8): the approval levels, the project picker and
  // the environment popover (`docs/wireframes/10-approval-mode.html`,
  // `04-project-picker.html`, `09-local-environment.html`).
  'alert',
  'folder',
  'git-branch',
  'hand',
  'monitor',
  'settings',
  'terminal',
  'worktree',
  // Conversation region (#11): the inline file chip and the message actions row
  // (`docs/wireframes/11-chat-conversation-sidebar.html`,
  // `12-chat-conversation-full.html`, `23-file-viewer-markdown.html`).
  'file',
  'copy',
  'thumb-up',
  'share',
  // Right panel file viewer (#12): the `Abrir` split button and its menu rows
  // (`docs/wireframes/24-file-open-menu.html`). The wireframe draws the VS Code
  // vendor mark there; a neutral "open externally" glyph keeps a vendor logo out
  // of the shared icon set.
  'external'
] as const;

export type IconName = (typeof ICON_NAMES)[number];
export type IconSize = 'sm' | 'md' | 'lg';

/**
 * Icon geometry only. Stroke color and thickness come from `icon.css` so a
 * single token set drives every glyph.
 */
const ICON_GLYPHS: Record<IconName, ReactNode> = {
  'arrow-left': (
    <>
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>
  ),
  'panel-left': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  'panel-right': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </>
  ),
  hook: (
    <>
      <circle cx="12" cy="5" r="3" />
      <path d="M12 22V8" />
      <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  square: <rect x="5" y="5" width="14" height="14" rx="1.5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  // Send glyph as drawn in the composer's send control (`docs/wireframes/01-home.html`).
  send: (
    <>
      <path d="M2 10v3" />
      <path d="M6 6v11" />
      <path d="M10 3v18" />
      <path d="M14 8v7" />
      <path d="M18 5v13" />
      <path d="M22 10v3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'square-pen': (
    <>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
    </>
  ),
  // Selected-row marker in the provider and model lists
  // (`docs/wireframes/16-provider-selector.html`).
  check: <path d="M20 6 9 17l-5-5" />,
  // Generic coding-agent engine glyph. The catalog carries a per-provider icon
  // token, but a ticketing-neutral shape keeps provider identities out of the
  // shared UI; the chip and list rows draw this one.
  provider: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </>
  ),
  // Effort stop glyph (`docs/wireframes/08-effort-selector.html`, popover head).
  bolt: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  // Unrestricted approval level and the chip carrying it while it is selected
  // (`docs/wireframes/10-approval-mode.html`).
  alert: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
  // Project chip and project rows (`docs/wireframes/04-project-picker.html`).
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  // Branch field of the environment popover
  // (`docs/wireframes/09-local-environment.html`).
  'git-branch': (
    <>
      <path d="M6 3v15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </>
  ),
  // "Ask always" approval level (`docs/wireframes/10-approval-mode.html`).
  hand: (
    <>
      <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </>
  ),
  // Environment chip of the context bar (`docs/wireframes/04-project-picker.html`).
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M2 20h20" />
    </>
  ),
  // Named-environment field (`docs/wireframes/09-local-environment.html`).
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" />
    </>
  ),
  // "Auto-approve" approval level (`docs/wireframes/10-approval-mode.html`).
  terminal: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="m7 9 3 3-3 3" />
      <path d="M13 15h4" />
    </>
  ),
  // New-worktree field (`docs/wireframes/09-local-environment.html`).
  worktree: (
    <>
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9M12 12v3" />
    </>
  ),
  // File chip glyph (`docs/wireframes/23-file-viewer-markdown.html`,
  // `.file-chip`).
  file: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </>
  ),
  // Message action: copy (`docs/wireframes/12-chat-conversation-full.html`,
  // `.msg-actions`).
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  // Message action: feedback.
  'thumb-up': (
    <>
      <path d="M7 10v11H3V10z" />
      <path d="M7 10l4-7a2.5 2.5 0 0 1 2.5 2.5V9h6.2a2 2 0 0 1 2 2.3l-1.4 7.5A2 2 0 0 1 18.3 21H7" />
    </>
  ),
  // Message action: share.
  share: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
    </>
  ),
  // Open a file outside the panel in an external target
  // (`docs/wireframes/24-file-open-menu.html`, the `Abrir` control).
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 12 12" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  )
};

export interface IconProps {
  readonly name: IconName;
  readonly size?: IconSize;
}

/** Indivisible SVG primitive. Decorative by default; the surrounding control carries its accessible name. */
export function Icon({ name, size = 'md' }: IconProps) {
  return (
    <svg
      className={`icon icon--${size}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_GLYPHS[name]}
    </svg>
  );
}
