import type { KeyboardEvent } from 'react';

export type AppMode = 'REMOTE_SENSING' | 'GIS' | 'AGENT';

export interface ModeSwitcherHUDProps {
  activeMode: AppMode;
  onChangeMode: (m: AppMode) => void;
  /** No longer shown here: significance moved to the left-panel legend. Kept for compatibility. */
  significanceLock?: boolean;
  onToggleSignificanceLock?: () => void;
  basinCount?: number;
  dipoleCount?: number;
}

/**
 * The analysis modes, shown as the right-panel tabs: Inspect, Region select, Ask.
 * The mode values (and the ?mode= URL param) are unchanged. The tab panel must have id "right-panel-tabpanel".
 */
const MODE_TABS: { mode: AppMode; label: string; id: string }[] = [
  { mode: 'REMOTE_SENSING', label: 'Inspect', id: 'tab-inspect' },
  { mode: 'GIS', label: 'Region select', id: 'tab-region-select' },
  { mode: 'AGENT', label: 'Ask', id: 'tab-ask' },
];

export default function ModeSwitcherHUD({ activeMode, onChangeMode }: ModeSwitcherHUDProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = MODE_TABS.findIndex((t) => t.mode === activeMode);
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % MODE_TABS.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + MODE_TABS.length) % MODE_TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = MODE_TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChangeMode(MODE_TABS[next].mode);
    requestAnimationFrame(() => document.getElementById(MODE_TABS[next].id)?.focus());
  };

  return (
    <div role="tablist" aria-label="Analysis" onKeyDown={onKeyDown} className="flex gap-5 border-b border-line">
      {MODE_TABS.map((t) => {
        const selected = activeMode === t.mode;
        return (
          <button
            key={t.mode}
            id={t.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls="right-panel-tabpanel"
            tabIndex={selected ? 0 : -1}
            onClick={() => onChangeMode(t.mode)}
            className={`h-9 px-0 -mb-px bg-transparent border-0 border-b-2 text-body cursor-pointer ${
              selected ? 'border-accent text-ink-1 font-semibold' : 'border-transparent text-ink-2 hover:text-ink-1'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
