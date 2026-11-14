import { useMemo, useState } from 'react';
import { PanelLeftClose, Search, X } from 'lucide-react';
import type { BasinFeature } from '../Globe';
import type { LayerKind } from '../../lib/gibs';
import { GIBS_LAYERS, getAirsCoEffectiveDate } from '../../lib/gibs';
import Disclosure from './Disclosure';
import EarthClassSidebar from '../EarthClassSidebar';
import { matchesEarthClassOrArchetype } from '../../lib/earthClasses';
import {
  VARIABLE_OPTIONS,
  fmtSigned,
  isSignificant,
  trendSwatchClass,
  effectiveImageDate,
  TREND_STRONG,
  TREND_WEAK,
} from './shellUtils';

export type SignificanceLevel = 'all' | 'significant' | 'strong';
type RegionChip = 'all' | 'drying' | 'wetting' | 'notsig';

export interface LeftPanelProps {
  allBasins: BasinFeature[];
  selectedBasinId: string | null;
  onSelectBasin: (b: BasinFeature) => void;
  activeLayer: LayerKind;
  onChangeLayer: (l: LayerKind) => void;
  significance: SignificanceLevel;
  onChangeSignificance: (s: SignificanceLevel) => void;
  selectedEarthClass: string | null;
  onSelectEarthClass: (c: string | null) => void;
  searchFilter: string;
  onSearchFilter: (q: string) => void;
  viewMode: '3D' | '2D' | '4D';
  /** The variable the map is coloured by (MultiSensorStack can switch it away from water storage). */
  mapVariableIsWater: boolean;
  onCollapse: () => void;
  /** Timeline year, used to show the date an image layer really shows. */
  year?: number;
}

const SIG_OPTIONS: { id: SignificanceLevel; label: string; title: string }[] = [
  { id: 'all', label: 'All', title: 'Show every region' },
  { id: 'significant', label: 'Significant', title: 'Emphasise regions with FDR q < 0.05' },
  { id: 'strong', label: 'Strong', title: 'Only regions with FDR q < 0.01' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2015-10-14 becomes "14 Oct 2015". */
function fmtImageryDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export default function LeftPanel({
  allBasins,
  selectedBasinId,
  onSelectBasin,
  activeLayer,
  onChangeLayer,
  significance,
  onChangeSignificance,
  selectedEarthClass,
  onSelectEarthClass,
  searchFilter,
  onSearchFilter,
  viewMode,
  mapVariableIsWater,
  onCollapse,
  year,
}: LeftPanelProps) {
  const [chip, setChip] = useState<RegionChip>('all');

  const stats = useMemo(() => {
    let sig = 0;
    let drying = 0;
    let wetting = 0;
    let strong = 0;
    for (const b of allBasins) {
      if (b.properties.p_value_fdr < 0.01) strong += 1;
      if (isSignificant(b)) {
        sig += 1;
        if (b.properties.theil_sen_slope < 0) drying += 1;
        else if (b.properties.theil_sen_slope > 0) wetting += 1;
      }
    }
    return { total: allBasins.length, sig, drying, wetting, notsig: allBasins.length - sig, strong };
  }, [allBasins]);

  const regions = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    return allBasins
      .filter((b) => {
        const p = b.properties;
        if (
          q &&
          !p.basin_name.toLowerCase().includes(q) &&
          !p.continent.toLowerCase().includes(q) &&
          !p.basin_id.toLowerCase().includes(q)
        ) {
          return false;
        }
        if (!matchesEarthClassOrArchetype(b, selectedEarthClass)) return false;
        const sig = isSignificant(b);
        if (chip === 'drying') return sig && p.theil_sen_slope < 0;
        if (chip === 'wetting') return sig && p.theil_sen_slope > 0;
        if (chip === 'notsig') return !sig;
        return true;
      })
      .sort((a, b) => Math.abs(b.properties.theil_sen_slope) - Math.abs(a.properties.theil_sen_slope));
  }, [allBasins, searchFilter, selectedEarthClass, chip]);

  const variable = VARIABLE_OPTIONS.find((v) => v.layer === activeLayer) ?? VARIABLE_OPTIONS[0];
  const overlay = activeLayer !== 'base' ? GIBS_LAYERS[activeLayer] : undefined;
  const is2D = viewMode === '2D';

  const chips: { id: RegionChip; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: stats.total },
    { id: 'drying', label: 'Drying', count: stats.drying },
    { id: 'wetting', label: 'Wetting', count: stats.wetting },
    { id: 'notsig', label: 'Not significant', count: stats.notsig },
  ];

  return (
    <aside
      aria-label="Layers and regions"
      className="w-72 shrink-0 flex flex-col min-h-0 bg-surface-1 border-r border-line"
    >
      <div className="flex items-center justify-between gap-2 h-12 px-4 border-b border-line shrink-0">
        <h2 className="m-0 text-body font-semibold text-ink-1">Layers and regions</h2>
        <button
          type="button"
          className="btn btn-ghost btn-sm px-1.5"
          aria-label="Hide layers and regions panel"
          title="Hide panel"
          onClick={onCollapse}
        >
          <PanelLeftClose size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {/* Variable */}
        <div>
          <label htmlFor="variable-select" className="block mb-1.5 text-label font-medium text-ink-2">
            Variable
          </label>
          <select
            id="variable-select"
            className="field w-full"
            value={activeLayer}
            onChange={(e) => onChangeLayer(e.target.value as LayerKind)}
          >
            {VARIABLE_OPTIONS.filter((v) => v.group === 'trend').map((v) => (
              <option key={v.layer} value={v.layer}>
                {v.label}
              </option>
            ))}
            <optgroup label="Add a satellite image layer">
              {VARIABLE_OPTIONS.filter((v) => v.group === 'overlay').map((v) => (
                <option key={v.layer} value={v.layer}>
                  {v.label}
                </option>
              ))}
            </optgroup>
          </select>
          {activeLayer !== 'base' && <p className="m-0 mt-1.5 text-caption text-ink-3">{variable.help}</p>}
          {activeLayer !== 'base' && (
            <button
              type="button"
              className="btn btn-secondary btn-sm mt-2 w-full h-auto min-h-7 py-1 justify-start whitespace-normal text-left"
              onClick={() => onChangeLayer('base')}
            >
              <X size={14} aria-hidden="true" className="shrink-0" />
              Remove image layer (back to Natural Earth)
            </button>
          )}
        </div>

        {/* Legend */}
        <section aria-labelledby="legend-title" className="flex flex-col gap-2">
          <h3 id="legend-title" className="m-0 text-label font-medium text-ink-2">
            Water-storage trend, cm/yr
          </h3>
          <div aria-hidden="true" className="flex h-2.5 rounded-sm overflow-hidden">
            <div className="flex-1 bg-dry-3" />
            <div className="flex-1 bg-dry-2" />
            <div className="flex-1 bg-trend-zero" />
            <div className="flex-1 bg-wet-2" />
            <div className="flex-1 bg-wet-3" />
          </div>
          <div className="flex justify-between text-caption text-ink-3 tnum">
            <span>
              {'−'}
              {TREND_STRONG} drying
            </span>
            <span>0</span>
            <span>wetting +{TREND_STRONG}</span>
          </div>
          <Disclosure title="Map key" id="map-key">
            <p className="m-0 text-caption text-ink-3 tnum">
              Same scale in 3D and 2D. Between {'−'}
              {TREND_WEAK} and +{TREND_WEAK} cm/yr is neutral grey.
            </p>
            <ul className="m-0 p-0 list-none flex flex-col gap-1.5 text-caption text-ink-3">
              {is2D ? (
                <>
                  <li className="flex items-start gap-2">
                    <span aria-hidden="true" className="hatch shrink-0 mt-0.5 w-5 h-2.5 rounded-sm" />
                    <span>Not significant (FDR q ≥ 0.05): diagonal hatch over the fill.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span aria-hidden="true" className="shrink-0 mt-0.5 w-5 h-2.5 rounded-sm border-2 border-accent" />
                    <span>Selected region: light outline.</span>
                  </li>
                </>
              ) : (
                <>
                  <li className="flex items-start gap-2">
                    <span aria-hidden="true" className="shrink-0 mt-0.5 w-5 h-2.5 rounded-sm bg-dry-2 border border-ink-1" />
                    <span>Significant (FDR q &lt; 0.05): trend colour, white outline.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span aria-hidden="true" className="hatch shrink-0 mt-0.5 w-5 h-2.5 rounded-sm" />
                    <span>Not significant: grey stripes, direction not shown.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span aria-hidden="true" className="shrink-0 mt-0.5 w-5 h-2.5 rounded-sm bg-dry-3 border-2 border-ink-1" />
                    <span>Selected region: brighter fill, solid white outline.</span>
                  </li>
                </>
              )}
            </ul>
          </Disclosure>
          {!mapVariableIsWater && !is2D && (
            <p className="m-0 text-caption text-warn">
              The globe is coloured by another variable chosen under Other variables. This legend describes water
              storage.
            </p>
          )}

          <div className="mt-1">
            <div id="significance-label" className="sr-only">
              Significance
            </div>
            <div
              id="significance-lock-btn"
              className="seg w-full"
              role="group"
              aria-labelledby="significance-label"
            >
              {SIG_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="seg-item flex-1 h-7 px-2 text-label"
                  aria-pressed={significance === o.id}
                  title={o.id === 'strong' && stats.strong === 0 ? 'No regions meet FDR q < 0.01 in this data' : o.title}
                  disabled={o.id === 'strong' && stats.strong === 0}
                  onClick={() => onChangeSignificance(o.id)}
                >
                  {o.label}
                  {o.id === 'strong' && stats.strong === 0 && <span className="tnum"> 0</span>}
                </button>
              ))}
            </div>
            {significance !== 'all' && (
              <p className="m-0 mt-1.5 text-caption text-ink-3 tnum">
                {significance === 'significant' &&
                  (is2D
                    ? `Showing the ${stats.sig} regions with FDR q < 0.05.`
                    : `Fading regions that are not significant (${stats.notsig} of ${stats.total}).`)}
                {significance === 'strong' &&
                  `Strong means FDR q < 0.01. ${stats.strong} of ${stats.total} regions meet it in this data.`}
              </p>
            )}
          </div>

          {overlay && (
            <div className="mt-1 pt-3 border-t border-line flex flex-col gap-1.5">
              <div className="text-label font-medium text-ink-2">Image layer: {overlay.title}</div>
              {(() => {
                if (activeLayer === 'AIRS_CO_500HPA') {
                  return <div className="text-caption text-ink-3 tnum">Imagery date: {fmtImageryDate(getAirsCoEffectiveDate())}</div>;
                }
                const eff = effectiveImageDate(activeLayer, year ?? 2024);
                if (!eff) return null;
                return (
                  <div className="text-caption text-ink-3 tnum">
                    Imagery date: {fmtImageryDate(eff.date)}
                    {eff.clamped ? ' (first available; this layer has no earlier imagery)' : ''}
                  </div>
                );
              })()}
              <div
                aria-hidden="true"
                className="h-2.5 rounded-sm"
                style={{ background: `linear-gradient(to right, ${overlay.legend.colors.join(', ')})` }}
              />
              <div className="flex justify-between text-caption text-ink-3 tnum">
                <span>{overlay.legend.min}</span>
                <span>{overlay.legend.max}</span>
              </div>
            </div>
          )}
        </section>

        {/* Regions */}
        <section aria-labelledby="regions-title" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="regions-title" className="m-0 text-body font-semibold text-ink-1">
              Regions
            </h3>
            <span className="text-caption text-ink-3 tnum">
              {stats.total > 0 ? `${stats.sig} of ${stats.total} significant` : 'Loading…'}
            </span>
          </div>
          <div className="relative">
            <Search
              size={14}
              aria-hidden="true"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
            />
            <input
              id="region-search"
              type="search"
              className="field w-full pl-8"
              aria-label="Search regions"
              placeholder="Search a basin or continent"
              value={searchFilter}
              onChange={(e) => onSearchFilter(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter regions by trend">
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                className="chip"
                aria-pressed={chip === c.id}
                onClick={() => setChip(c.id)}
              >
                {c.label} <span className="tnum">{c.count}</span>
              </button>
            ))}
          </div>
          <EarthClassSidebar
            selectedClass={selectedEarthClass}
            onSelectClass={onSelectEarthClass}
            allBasins={allBasins}
          />
          <ul className="m-0 p-0 list-none flex flex-col gap-0.5" aria-label="Regions, strongest change first">
            {regions.map((b) => {
              const p = b.properties;
              const selected = p.basin_id === selectedBasinId;
              const sig = isSignificant(b);
              return (
                <li key={p.basin_id}>
                  <button
                    type="button"
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => onSelectBasin(b)}
                    className={`w-full flex items-center gap-2.5 h-[34px] px-2 rounded-md border-0 text-left text-body cursor-pointer ${
                      selected
                        ? 'bg-surface-2 text-ink-1 font-medium shadow-[inset_0_0_0_1px_var(--color-ink-1)]'
                        : 'bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink-1'
                    }`}
                  >
                    <span aria-hidden="true" className={`shrink-0 w-2.5 h-2.5 rounded-xs ${trendSwatchClass(b)}`} />
                    <span className="flex-1 min-w-0 truncate">{p.basin_name}</span>
                    {!sig && <span className="text-caption text-ink-3 shrink-0">not significant</span>}
                    <span className="tnum text-ink-1 shrink-0">
                      {fmtSigned(p.theil_sen_slope)}
                      <span className="sr-only"> cm/yr</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {regions.length === 0 && stats.total > 0 && (
              <li className="text-caption text-ink-3 py-2">No regions match these filters.</li>
            )}
          </ul>
        </section>
      </div>
    </aside>
  );
}
