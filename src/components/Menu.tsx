import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

const CloseMenu = createContext<() => void>(() => {});

/** A glyph button that opens a list of less-used actions. */
export function Menu({ label, icon = 'more', children }: { label: string; icon?: IconName; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    rootRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(rootRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? [])];
    if (!items.length) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  };

  return (
    <div className="menu" ref={rootRef} onKeyDown={onKey}>
      <button ref={buttonRef} type="button" className={open ? 'icon on' : 'icon'} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name={icon} />
      </button>
      {open && (
        <div className="menu-list" role="menu" aria-label={label}>
          <CloseMenu.Provider value={close}>{children}</CloseMenu.Provider>
        </div>
      )}
    </div>
  );
}

interface ItemProps {
  icon?: IconName;
  children: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Makes the item an on/off setting, with a tick when on. It stays open so several can be flipped in a row. */
  checked?: boolean;
}

export function MenuItem({ icon, children, onSelect, danger, disabled, checked }: ItemProps) {
  const close = useContext(CloseMenu);
  const toggle = checked !== undefined;
  return (
    <button
      type="button"
      role={toggle ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={toggle ? checked : undefined}
      className={danger ? 'menu-item danger' : 'menu-item'}
      disabled={disabled}
      onClick={() => {
        if (!toggle) close();
        onSelect();
      }}
    >
      {toggle ? checked ? <Icon name="check" size={18} /> : <span className="glyph-gap" /> : icon ? <Icon name={icon} size={18} /> : <span className="glyph-gap" />}
      <span>{children}</span>
    </button>
  );
}

export function MenuHeading({ children }: { children: ReactNode }) {
  return (
    <div className="menu-heading" role="presentation">
      {children}
    </div>
  );
}
