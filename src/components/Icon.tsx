import type { ReactNode } from 'react';

/** Line glyphs on a 24-unit grid, drawn in the current text colour. */
const GLYPHS = {
  undo: <path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  redo: <path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
  layouts: (
    <>
      <rect x="3" y="3" width="8" height="10" rx="1" />
      <rect x="14" y="3" width="7" height="6" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="8" height="5" rx="1" />
    </>
  ),
  expand: <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />,
  collapse: <path d="m20 4-6 6M14 5v5h5M4 20l6-6M10 19v-5H5" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5H6a1 1 0 0 0-1 1v9" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  shuffle: <path d="M3 7h3c5 0 7 10 12 10h3M3 17h3c1.6 0 2.9-1 4-2.4M14 9.4C15.1 8 16.4 7 18 7h3M18 4l3 3-3 3M18 14l3 3-3 3" />,
  fit: (
    <>
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <rect x="8" y="9" width="8" height="6" rx="0.5" />
    </>
  ),
  download: <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />,
  upload: <path d="M12 16V5M7 9l5-5 5 5M5 20h14" />,
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="m21 16-5-5-9 9" />
    </>
  ),
  print: (
    <>
      <path d="M7 8V4h10v4M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2" />
      <rect x="7" y="14" width="10" height="6" />
    </>
  ),
  rename: <path d="m4 20 1-4L16 5l3 3L8 19z" />,
  check: <path d="m5 12 5 5 9-10" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof GLYPHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="glyph" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[name]}
    </svg>
  );
}

interface IconButtonProps {
  icon: IconName;
  /** What the button does: read by screen readers and shown as a tooltip, since there is no visible text. */
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** For on/off buttons. */
  pressed?: boolean;
  className?: string;
}

export function IconButton({ icon, label, onClick, disabled, pressed, className }: IconButtonProps) {
  const classes = ['icon', pressed ? 'on' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}
