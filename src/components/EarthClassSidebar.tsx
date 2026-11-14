import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { BasinFeature } from './Globe';
import { PROMPT_BIOME_ARCHETYPES, matchesEarthClassOrArchetype } from '../lib/earthClasses';
import { fmtSigned } from '../lib/glossary';

export interface EarthClassSidebarProps {
  selectedClass: string | null;
  onSelectClass: (c: string | null) => void;
  allBasins?: BasinFeature[];
  /** Kept for compatibility. The filter now sits inside the left panel, so it no longer positions itself. */
  leftDrawerOpen?: boolean;
}

const EARTH_CLASSES = [
  { id: 'WATER_BODY', label: 'Water bodies' },
  { id: 'THERMAL', label: 'Heat and fire' },
  { id: 'VEGETATION', label: 'Vegetation and soil' },
  { id: 'CRYOSPHERE', label: 'Ice and snow' },
  { id: 'DIPOLES', label: 'Paired regions (dipoles)' },
  { id: 'ANTHROPOGENIC', label: 'Human water use' },
];


/**
 * Secondary region filter by landscape type (the prompt biome archetypes and sensor classes),
 * plus the total water balance across all regions. Rendered inline in the left panel.
 */
export default function EarthClassSidebar({ selectedClass, onSelectClass, allBasins = [] }: EarthClassSidebarProps) {
  const [showLedger, setShowLedger] = useState(false);

  // Area (km²) × slope (cm/yr) × 1e-5 = Gt/yr. 361.8 Gt of water spread over the ocean is about 1 mm of sea level.
  const ledger = useMemo(() => {
    let gainGt = 0;
    let lossGt = 0;
    for (const b of allBasins) {
      const p = b.properties;
      const slope = p.theil_sen_slope ?? 0;
      const area = p.area_sqkm ?? p.area_km2 ?? 0;
      const fluxGt = area * slope * 1e-5;
      if (slope > 0) gainGt += fluxGt;
      else if (slope < 0) lossGt += Math.abs(fluxGt);
    }
    return { gainGt, lossGt, netMm: (lossGt - gainGt) / 361.8 };
  }, [allBasins]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const arch of PROMPT_BIOME_ARCHETYPES) {
      c[arch.id] = allBasins.filter((b) => matchesEarthClassOrArchetype(b, arch.id)).length;
    }
    for (const cls of EARTH_CLASSES) {
      c[cls.id] = allBasins.filter((b) => matchesEarthClassOrArchetype(b, cls.id)).length;
    }
    return c;
  }, [allBasins]);

  const activeArchetype = PROMPT_BIOME_ARCHETYPES.find((a) => a.id === selectedClass);

  return (
    <div className="flex flex-col gap-2">
      <select
        id="landscape-filter"
        aria-label="Landscape type"
        className="field w-full"
        value={selectedClass ?? ''}
        onChange={(e) => onSelectClass(e.target.value || null)}
      >
        <option value="">All landscape types</option>
        <optgroup label="Landscape">
          {PROMPT_BIOME_ARCHETYPES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label} ({counts[a.id] ?? 0})
            </option>
          ))}
        </optgroup>
        <optgroup label="Signal type">
          {EARTH_CLASSES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({counts[c.id] ?? 0})
            </option>
          ))}
        </optgroup>
      </select>
      {activeArchetype && <p className="m-0 text-caption text-ink-3">{activeArchetype.rationale}</p>}

      {allBasins.length > 0 && (
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm px-0 gap-1 text-ink-2"
            aria-expanded={showLedger}
            onClick={() => setShowLedger((v) => !v)}
          >
            <ChevronRight
              size={14}
              aria-hidden="true"
              className={`transition-transform ${showLedger ? 'rotate-90' : ''}`}
            />
            Water balance across all regions
          </button>
          {showLedger && (
            <dl className="m-0 mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-caption">
              <dt className="text-ink-3">Gaining water</dt>
              <dd className="m-0 text-ink-1 tnum text-right">+{ledger.gainGt.toFixed(1)} Gt/yr</dd>
              <dt className="text-ink-3">Losing water</dt>
              <dd className="m-0 text-ink-1 tnum text-right">
                {'−'}
                {ledger.lossGt.toFixed(1)} Gt/yr
              </dd>
              <dt className="text-ink-3">Sea-level equivalent (rough)</dt>
              <dd className="m-0 text-ink-1 tnum text-right">{fmtSigned(ledger.netMm, 3)} mm/yr</dd>
              <dd className="m-0 col-span-2 text-ink-3">
                Sum of these regions only (area times trend), not a global budget. Includes ice-sheet regions.
              </dd>
            </dl>
          )}
        </div>
      )}
    </div>
  );
}
