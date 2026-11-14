import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useDismiss } from './shellUtils';

export interface MapOptionsProps {
  extrudeRelief: boolean;
  onToggleRelief: () => void;
  showWind: boolean;
  onToggleWind: () => void;
  windSpeed: number;
  onChangeWindSpeed: (v: number) => void;
  showDipoles: boolean;
  onToggleDipoles: () => void;
  epochDelta: boolean;
  onToggleEpochDelta: () => void;
  /** Epoch delta only has meaning while a satellite image layer is shown. */
  hasOverlay: boolean;
  layerSpacing: number;
  onChangeLayerSpacing: (v: number) => void;
  /** The 2D map draws wind and pair arcs but not relief or underground layers. */
  is2D: boolean;
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={`flex items-start gap-2.5 py-1.5 ${disabled ? 'opacity-50' : ''}`}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 w-4 h-4 accent-[var(--color-accent)] cursor-pointer disabled:cursor-not-allowed"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <label htmlFor={id} className="flex flex-col cursor-pointer">
        <span className="text-body text-ink-1">{label}</span>
        {hint && <span className="text-caption text-ink-3">{hint}</span>}
      </label>
    </div>
  );
}

const WIND_SPEEDS = [0.5, 1, 2];

/** "Map options" popover: every secondary map toggle, out of the way of the data. */
export default function MapOptions(props: MapOptionsProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  useDismiss(open, close, [triggerRef, panelRef]);
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('input:not([disabled]), button')?.focus();
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary bg-surface-1"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        Map options
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Map options"
          className="popover absolute right-0 top-full mt-2 w-80 p-3 flex flex-col"
        >
          <Toggle
            label="3D relief"
            hint={props.is2D ? 'Globe only' : 'Raise each region by the size of its trend'}
            checked={props.extrudeRelief}
            onChange={props.onToggleRelief}
            disabled={props.is2D}
          />
          <Toggle label="Wind" hint="Animated wind particles" checked={props.showWind} onChange={props.onToggleWind} />
          {props.showWind && (
            <div className="flex items-center justify-between gap-2 pl-6.5 pb-1.5">
              <span id={`${panelId}-wind`} className="text-label text-ink-2">
                Wind speed
              </span>
              <div className="seg" role="group" aria-labelledby={`${panelId}-wind`}>
                {WIND_SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="seg-item h-7 px-2.5 text-label tnum"
                    aria-pressed={props.windSpeed === s}
                    onClick={() => props.onChangeWindSpeed(s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          )}
          <Toggle
            label="Paired-region arcs"
            hint="Lines joining regions studied as pairs (dipoles)"
            checked={props.showDipoles}
            onChange={props.onToggleDipoles}
          />
          <Toggle
            label="Change since the first year"
            hint={props.hasOverlay ? 'Show the image layer as a difference from 2003' : 'Needs a water-storage or carbon-monoxide image layer (their imagery reaches back to 2003)'}
            checked={props.epochDelta}
            onChange={props.onToggleEpochDelta}
            disabled={!props.epochDelta && (!props.hasOverlay || props.is2D)}
          />
          {!props.is2D && (
            <div className="flex flex-col gap-1 pt-2 mt-1 border-t border-line">
            <div className="flex items-center gap-3">
              <label htmlFor={`${panelId}-spacing`} className="text-label text-ink-2 shrink-0">
                Layer spacing
              </label>
              <input
                id={`${panelId}-spacing`}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={props.layerSpacing}
                onChange={(e) => props.onChangeLayerSpacing(parseFloat(e.target.value))}
                className="flex-1 min-w-0 h-6 accent-[var(--color-accent)]"
              />
              <span className="text-caption text-ink-2 tnum w-9 text-right">{Math.round(props.layerSpacing * 100)}%</span>
            </div>
            <span className="text-caption text-ink-3">Pull the stacked globe layers (regions, air layers, pair arcs) apart.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
