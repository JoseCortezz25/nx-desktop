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
  'bell',
  'chevron-down',
  'square-pen'
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
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </>
  ),
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'square-pen': (
    <>
      <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" />
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
