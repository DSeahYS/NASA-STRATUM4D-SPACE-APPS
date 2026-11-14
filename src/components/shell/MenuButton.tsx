import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useDismiss } from './shellUtils';

export interface MenuItem {
  id: string;
  label: string;
  /** Optional second line in quieter text. */
  hint?: string;
  onSelect: () => void;
  /** Visually quieter item, e.g. "Reset onboarding". */
  quiet?: boolean;
}

export interface MenuButtonProps {
  label: string;
  items: MenuItem[];
  icon?: ReactNode;
  /** Menu alignment against the trigger. */
  align?: 'left' | 'right';
}

/**
 * A real popover menu: opens on click, closes on Escape or outside click, arrow keys move between
 * items, Home/End jump, Tab closes and lets focus move on. Focus returns to the trigger on Escape.
 */
export default function MenuButton({ label, items, icon, align = 'right' }: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);
  const closeAndFocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismiss(open, closeAndFocus, [triggerRef, menuRef]);

  const focusItem = (index: number) => {
    const nodes = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    if (!nodes || nodes.length === 0) return;
    const i = (index + nodes.length) % nodes.length;
    nodes[i].focus();
  };

  const openMenu = (focusIndex: number) => {
    setOpen(true);
    requestAnimationFrame(() => focusItem(focusIndex));
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openMenu(0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu(items.length - 1);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const nodes = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const current = nodes.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(current + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(current - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(nodes.length - 1);
    } else if (e.key === 'Tab') {
      close();
    }
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-ghost border-line text-ink-1"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? setOpen(false) : openMenu(0))}
        onKeyDown={onTriggerKey}
      >
        {icon}
        <span>{label}</span>
        <ChevronDown size={14} aria-hidden="true" className="text-ink-3" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={`popover absolute top-full mt-2 z-50 w-72 p-1.5 flex flex-col ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`menu-item h-auto min-h-9 py-2 flex-col items-start gap-0 ${item.quiet ? 'text-ink-2' : ''}`}
              onClick={() => {
                // Focus the trigger first so a dialog opened by this item restores focus here on close.
                triggerRef.current?.focus();
                setOpen(false);
                item.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.hint && <span className="text-caption text-ink-3">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
