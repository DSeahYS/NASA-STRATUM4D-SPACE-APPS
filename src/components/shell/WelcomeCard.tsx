import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface WelcomeCardProps {
  onStartQuestion: () => void;
  onWatchDemo: () => void;
  onDismiss: () => void;
}

/** First-run welcome, docked bottom-left of the map. Nothing blocks the map. */
export default function WelcomeCard({ onStartQuestion, onWatchDemo, onDismiss }: WelcomeCardProps) {
  const startRef = useRef<HTMLButtonElement>(null);
  // First-visit entry point: move focus here (without trapping) unless the user already focused something.
  useEffect(() => {
    if (document.activeElement === document.body) startRef.current?.focus();
  }, []);

  return (
    <section
      aria-labelledby="welcome-title"
      className="popover absolute left-4 bottom-4 z-20 w-72 max-w-[calc(100%-2rem)] p-4 flex flex-col gap-3 bg-surface-1"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="welcome-title" className="m-0 text-body font-semibold text-ink-1">
            New to Stratum-4D?
          </h2>
          <p className="m-0 mt-1 text-label text-ink-2">
            Find out where Earth’s water is changing, and whether the change is real.
          </p>
        </div>
        <button type="button" className="btn btn-ghost btn-sm px-1 -mr-1 -mt-1" aria-label="Close welcome" onClick={onDismiss}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <button ref={startRef} type="button" className="btn btn-primary" onClick={onStartQuestion}>
          Start with a question
        </button>
        <button type="button" className="btn btn-secondary" onClick={onWatchDemo}>
          Watch the demo (90s)
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDismiss}>
          Explore on my own
        </button>
      </div>
    </section>
  );
}
