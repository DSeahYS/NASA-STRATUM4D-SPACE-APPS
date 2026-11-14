import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Behaviour every modal needs: Escape closes it, focus moves inside when it opens,
 * Tab stays inside while it is open, and focus returns to where it was on close.
 *
 * Usage:
 *   const dialog = useModalDialog<HTMLDivElement>(onClose);
 *   <div className="fixed inset-0 z-50 bg-canvas/80" onClick={onClose}>
 *     <div {...dialog.props} aria-label="Case studies" onClick={(e) => e.stopPropagation()}>...</div>
 *   </div>
 */
export function useModalDialog<T extends HTMLElement>(onClose: () => void, active = true) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => (node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
    (focusables()[0] ?? node)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !node.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !node.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [active]);

  return {
    ref,
    props: { ref, role: 'dialog' as const, 'aria-modal': true as const, tabIndex: -1 },
  };
}
