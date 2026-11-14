import { useId, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export interface DisclosureProps {
  title: string;
  /** Short quieter text after the title, e.g. a count. */
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  id?: string;
}

/**
 * Collapsible section separated by a hairline. Content mounts only while open, so heavy panels
 * (charts, scanners) cost nothing until the reader asks for them.
 */
export default function Disclosure({ title, meta, defaultOpen = false, children, id }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section className="border-t border-line" id={id}>
      <h3 className="m-0">
        <button
          type="button"
          className="w-full flex items-center justify-between gap-3 h-10 px-0 bg-transparent border-0 text-left text-body font-medium text-ink-1 cursor-pointer hover:text-ink-1"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="flex items-baseline gap-2 min-w-0">
            <span className="truncate">{title}</span>
            {meta && <span className="text-caption text-ink-3 font-normal tnum">{meta}</span>}
          </span>
          <ChevronRight
            size={14}
            aria-hidden="true"
            className={`shrink-0 text-ink-3 transition-transform ${open ? 'rotate-90' : ''}`}
          />
        </button>
      </h3>
      {open && (
        <div id={panelId} className="pb-4 flex flex-col gap-3">
          {children}
        </div>
      )}
    </section>
  );
}
