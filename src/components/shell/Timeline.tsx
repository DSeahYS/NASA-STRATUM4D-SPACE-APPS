import { Pause, Play, RotateCcw } from 'lucide-react';

export const TIMELINE_MIN = 2002;
export const TIMELINE_LAST_OBSERVED = 2024;
export const TIMELINE_MAX = 2035;

export interface TimelineProps {
  year: number;
  onYearChange: (y: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  speed: 1 | 5 | 10;
  onCycleSpeed: () => void;
  onReset: () => void;
}

/** Five controls only: play, speed, reset, year slider, year readout. */
export default function Timeline({ year, onYearChange, isPlaying, onTogglePlay, speed, onCycleSpeed, onReset }: TimelineProps) {
  const span = TIMELINE_MAX - TIMELINE_MIN;
  const observedPct = ((TIMELINE_LAST_OBSERVED - TIMELINE_MIN) / span) * 100;
  const extrapolated = year > TIMELINE_LAST_OBSERVED;

  return (
    <div
      role="group"
      aria-label="Timeline"
      className="shrink-0 flex items-center gap-2.5 px-4 py-2.5 bg-surface-1 border-t border-line"
    >
      <button
        type="button"
        className="btn btn-secondary w-9 px-0"
        aria-label={isPlaying ? 'Pause timeline' : 'Play timeline'}
        aria-pressed={isPlaying}
        onClick={onTogglePlay}
      >
        {isPlaying ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </button>
      <button
        type="button"
        className="btn btn-ghost border-line px-2.5 tnum"
        aria-label={`Playback speed ${speed} times, change`}
        onClick={onCycleSpeed}
      >
        {speed}×
      </button>
      <button
        type="button"
        className="btn btn-ghost border-line px-2.5"
        onClick={onReset}
        title={`Back to ${TIMELINE_LAST_OBSERVED}, the last observed year`}
      >
        <RotateCcw size={14} aria-hidden="true" />
        Reset
      </button>

      <span className="text-caption text-ink-3 tnum" aria-hidden="true">
        {TIMELINE_MIN}
      </span>
      <div className="flex-1 min-w-20 flex flex-col gap-0.5">
        <input
          type="range"
          min={TIMELINE_MIN}
          max={TIMELINE_MAX}
          step={1}
          value={year}
          onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
          aria-label="Year"
          aria-valuetext={extrapolated ? `${year}, linear extrapolation (illustrative)` : `${year}, full-record trend grown from 2002`}
          className="w-full h-6 accent-[var(--color-accent)] cursor-pointer"
        />
        <div className="relative flex h-4 text-micro whitespace-nowrap overflow-visible text-ink-3" aria-hidden="true">
          <span style={{ width: `${observedPct}%` }} className="border-t border-line-strong pt-0.5">
            Full-record trend
          </span>
          <span className="flex-1 border-t border-dashed border-warn" />
          <span className="absolute right-0 top-0 pt-0.5 whitespace-nowrap text-warn">
            Linear extrapolation (illustrative)
          </span>
        </div>
      </div>
      <span className="text-caption text-ink-3 tnum" aria-hidden="true">
        {TIMELINE_MAX}
      </span>
      <output
        aria-live={isPlaying ? 'off' : 'polite'}
        className={`min-w-11 text-right text-base leading-6 font-semibold tnum ${extrapolated ? 'text-warn' : 'text-ink-1'}`}
      >
        {year}
      </output>
    </div>
  );
}
