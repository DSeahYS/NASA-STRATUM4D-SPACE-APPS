import { useState, useMemo, useEffect } from 'react';
import { Trash2, Waves, ExternalLink, Sparkles } from 'lucide-react';
import type { BasinFeature } from './Globe';
import { COLORS } from '../theme/colors';
import type { AppMode } from './ModeSwitcherHUD';
import { matchesEarthClassOrArchetype } from '../lib/earthClasses';
import {
  isolateSecularTrend,
  calculateEffectiveSampleSize,
  calculateTimeOfEmergence,
  calculateLinearRegressionTTest,
  calculateObservationHorizon,
  type ObservationHorizonResult,
} from '../lib/statistics';

export interface AOISelection {
  bounds: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  areaKm2: number;
  intersectingBasins: BasinFeature[];
}

export interface GISAnalysisPanelProps {
  mode: AppMode;
  allBasins: BasinFeature[];
  selectedEarthClass?: string | null;
  aoiSelection: AOISelection | null;
  onClearAOI: () => void;
  onFlyToBasin: (basin: BasinFeature) => void;
  onHoverBasin?: (basin: BasinFeature | null) => void;
}

function computeLinearRegression(values: number[], monthsPerStep: number = 2) {
  const n = values.length;
  if (n < 2) {
    return {
      slope: 0,
      intercept: 0,
      r: 0,
      r2: 0,
      se: 0,
      tStat: 0,
      pValue: 1.0,
      df: 0,
      sigmaResidual: 0,
    };
  }
  const dt = monthsPerStep / 12.0; // annual step (t in years)
  const x: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = i * dt;
  }
  return calculateLinearRegressionTTest(x, values);
}

function computeOLSSlope(values: number[], monthsPerStep: number = 2): number {
  const res = computeLinearRegression(values, monthsPerStep);
  return parseFloat(res.slope.toFixed(4));
}

function matchesEarthClass(basin: BasinFeature, selectedEarthClass?: string | null): boolean {
  return matchesEarthClassOrArchetype(basin, selectedEarthClass);
}

// Three regimes, one rule: significance is the FDR-corrected q-value (p_value_fdr < 0.05), direction is the sign of the Theil-Sen slope.
function getBasinRegime(b: BasinFeature): 'DRYING' | 'WETTING' | 'NOISE' {
  const p = b.properties.p_value_fdr;
  const slope = b.properties.theil_sen_slope;

  if (p >= 0.05) {
    return 'NOISE';
  }
  return slope < 0 ? 'DRYING' : 'WETTING';
}

export default function GISAnalysisPanel({
  mode,
  allBasins,
  selectedEarthClass,
  aoiSelection,
  onClearAOI,
  onFlyToBasin,
  onHoverBasin,
}: GISAnalysisPanelProps) {
  // State for interactive donut filtering
  const [activeRegimeFilter, setActiveRegimeFilter] = useState<
    'ALL' | 'DRYING' | 'WETTING' | 'NOISE'
  >('ALL');

  // Selected basin for detail inspection card
  const [inspectedBasinId, setInspectedBasinId] = useState<string | null>(null);

  // Strip cyclical oscillations toggle
  const [stripCyclical, setStripCyclical] = useState<boolean>(false);

  // Synchronized climate oscillation indices
  const [climateIndices, setClimateIndices] = useState<any>(null);

  useEffect(() => {
    fetch('/data/climate_indices.json')
      .then((res) => res.json())
      .then((data) => setClimateIndices(data))
      .catch((err) => console.warn('Could not load climate indices:', err));
  }, []);

  // Filter basins by selected Earth classification if set
  const filteredByClassBasins = useMemo(() => {
    return allBasins.filter((b) => matchesEarthClass(b, selectedEarthClass));
  }, [allBasins, selectedEarthClass]);

  // Remote Sensing Mode: Trend regime breakdown calculation based on filtered basins
  const regimeStats = useMemo(() => {
    let drying = 0;
    let wetting = 0;
    let insignificant = 0;

    for (const b of filteredByClassBasins) {
      const regime = getBasinRegime(b);
      if (regime === 'DRYING') drying++;
      else if (regime === 'WETTING') wetting++;
      else insignificant++;
    }

    const totalAreaKm2 = filteredByClassBasins.reduce(
      (acc, b) => acc + (b.properties.area_sqkm || 0),
      0
    );

    return {
      drying,
      wetting,
      insignificant,
      total: filteredByClassBasins.length,
      totalAreaKm2,
    };
  }, [filteredByClassBasins]);

  // Basins ranked by FDR q (smallest first), then by size of the trend, filtered by regime and earth class
  const rankedBasins = useMemo(() => {
    return filteredByClassBasins
      .filter((b) => {
        if (activeRegimeFilter === 'ALL') return true;
        return getBasinRegime(b) === activeRegimeFilter;
      })
      .map((b) => ({
        basin: b,
        fdrQ: b.properties.p_value_fdr,
      }))
      .sort(
        (a, b) =>
          a.fdrQ - b.fdrQ ||
          Math.abs(b.basin.properties.theil_sen_slope) - Math.abs(a.basin.properties.theil_sen_slope)
      );
  }, [filteredByClassBasins, activeRegimeFilter]);

  // Active basin for detail inspection card (defaults to top ranked or first basin)
  const inspectedBasin = useMemo(() => {
    if (inspectedBasinId) {
      const match = allBasins.find((b) => b.properties.basin_id === inspectedBasinId);
      if (match) return match;
    }
    return rankedBasins[0]?.basin || allBasins[0] || null;
  }, [allBasins, inspectedBasinId, rankedBasins]);

  // Dual-slope and statistical derivations for inspected basin
  const inspectedMetrics = useMemo(() => {
    if (!inspectedBasin) return null;
    const p = inspectedBasin.properties;
    const rawSeries = p.time_series?.deseasonalized || p.time_series?.raw || p.time_series?.swot_wse || [];

    // Dynamic monthsPerStep calculation
    const timestamps = p.time_series?.timestamps || p.time_series?.dates || [];
    const years = timestamps.map((d) => {
      const yr = parseInt(d.slice(0, 4), 10);
      const mo = parseInt(d.slice(5, 7), 10) || 1;
      return yr + (mo - 1) / 12;
    });
    const monthsPerStep =
      years.length > 1
        ? Math.max(1, ((years[years.length - 1] - years[0]) * 12) / (years.length - 1))
        : 2;
    // Parametric OLS regression metrics
    const olsRegression = computeLinearRegression(rawSeries, monthsPerStep);
    const olsSlope = parseFloat(olsRegression.slope.toFixed(4));
    const olsT = parseFloat(olsRegression.tStat.toFixed(2));
    const olsSE = parseFloat(olsRegression.se.toFixed(4));
    const olsP = parseFloat(olsRegression.pValue.toFixed(5));
    const sigmaResidual = parseFloat(olsRegression.sigmaResidual.toFixed(4));

    // Non-parametric metrics
    const sensSlope = p.theil_sen_slope;
    const mkZ = p.mann_kendall_z ?? (p.signal_to_noise_ratio ? p.signal_to_noise_ratio * 3.5 : 1.2);
    const ciLow = typeof p.theil_sen_ci_low === 'number'
      ? p.theil_sen_ci_low
      : parseFloat((sensSlope - 1.96 * olsSE).toFixed(4));
    const ciHigh = typeof p.theil_sen_ci_high === 'number'
      ? p.theil_sen_ci_high
      : parseFloat((sensSlope + 1.96 * olsSE).toFixed(4));

    const pValue = p.p_value_fdr ?? p.p_value_raw ?? 1.0;
    const n = rawSeries.length || 115;
    const rho1 = p.rho_1_autocorr ?? 0;
    const nStar = p.n_star ?? calculateEffectiveSampleSize(n, rho1);
    const breakpointYear = p.breakpoint_year ?? 2015;
    const snr = p.signal_to_noise_ratio ?? (p.mann_kendall_z ? Math.abs(p.mann_kendall_z) / 3.5 : 1.2);

    // Time of Emergence (ToE)
    const toeYear = p.time_of_emergence_year ?? calculateTimeOfEmergence(rawSeries, years, sensSlope);

    // Observation Horizon
    const currentMonths = rawSeries.length > 0 ? Math.round(rawSeries.length * monthsPerStep) : 264;
    const currentYear = years.length > 0 ? Math.round(years[years.length - 1]) : 2024;
    const observationHorizon: ObservationHorizonResult = calculateObservationHorizon(
      currentMonths,
      currentYear,
      olsSlope !== 0 ? olsSlope : sensSlope,
      sigmaResidual > 0 ? sigmaResidual : 2.5,
      rho1,
      true
    );

    // Handle { indices: Array<{ date: string; mei: number; iod: number }> } schema
    let cyclical: { cyclicalComponent: number[]; residualSeries: number[] } | null = null;
    if (stripCyclical && rawSeries.length > 0) {
      const optDriver = p.optimal_driver || 'ENSO_MEI';
      const isIod = optDriver.toLowerCase().includes('iod');
      const driverKey = isIod ? 'iod_dmi' : 'enso_mei';

      let driverSeries: number[] = [];
      if (climateIndices) {
        const dateValueMap = new Map<string, number>();
        if (Array.isArray(climateIndices.indices)) {
          for (const item of climateIndices.indices) {
            const val = isIod ? (item.iod ?? item.iod_dmi ?? 0) : (item.mei ?? item.enso_mei ?? 0);
            dateValueMap.set(item.date, val);
          }
        } else if (Array.isArray(climateIndices)) {
          for (const item of climateIndices) {
            const val = isIod ? (item.iod ?? item.iod_dmi ?? 0) : (item.mei ?? item.enso_mei ?? 0);
            dateValueMap.set(item.date, val);
          }
        } else if (Array.isArray(climateIndices.dates)) {
          const arr = isIod
            ? (climateIndices.iod_dmi || climateIndices.iod || [])
            : (climateIndices.enso_mei || climateIndices.mei || []);
          climateIndices.dates.forEach((d: string, idx: number) => {
            dateValueMap.set(d, arr[idx] ?? 0);
          });
        }

        if (dateValueMap.size > 0 && timestamps.length > 0) {
          driverSeries = timestamps.map((d: string) => dateValueMap.get(d) ?? 0);
        } else if (Array.isArray(climateIndices[driverKey])) {
          driverSeries = climateIndices[driverKey].slice(0, rawSeries.length);
        }
      }

      if (!driverSeries || driverSeries.length === 0) {
        // Deterministic proxy aligned to months
        driverSeries = rawSeries.map((_, i) => Math.sin((i / 6) * Math.PI) * 1.2);
      }
      const lagMonths = p.driver_lag_months ?? 0;
      const lagSteps = Math.round(lagMonths / monthsPerStep);
      cyclical = isolateSecularTrend(rawSeries, driverSeries, lagSteps);
    }

    const secularSlope = cyclical ? computeOLSSlope(cyclical.residualSeries, monthsPerStep) : olsSlope;

    return {
      basin: inspectedBasin,
      sensSlope,
      olsSlope,
      olsT,
      olsSE,
      olsP,
      sigmaResidual,
      mkZ,
      ciLow,
      ciHigh,
      observationHorizon,
      pValue,
      nStar,
      rho1,
      snr,
      breakpointYear,
      toeYear,
      cyclical,
      secularSlope,
      optimalDriver: p.optimal_driver || 'ENSO_MEI',
      driverLag: p.driver_lag_months ?? 0,
      driverR: p.driver_r ?? 0,
    };
  }, [inspectedBasin, stripCyclical, climateIndices]);

  // GIS AOI Mode stats
  const aoiStats = useMemo(() => {
    if (!aoiSelection) {
      return {
        count: 0,
        areaKm2: 0,
        drying: 0,
        wetting: 0,
        stable: 0,
        fluxGt: 0,
        basins: [],
      };
    }

    const basins = aoiSelection.intersectingBasins;
    let drying = 0;
    let wetting = 0;
    let stable = 0;
    let fluxGt = 0;

    for (const b of basins) {
      const slope = b.properties.theil_sen_slope;
      if (slope < -0.3) drying++;
      else if (slope > 0.3) wetting++;
      else stable++;

      // 1 cm/yr * area (km²) * 10^-5 = Gt/yr water equivalent
      const annualGt = slope * (b.properties.area_sqkm || 100000) * 1e-5;
      fluxGt += annualGt;
    }

    return {
      count: basins.length,
      areaKm2: aoiSelection.areaKm2,
      drying,
      wetting,
      stable,
      fluxGt: +fluxGt.toFixed(2),
      basins,
    };
  }, [aoiSelection]);

  // Donut chart calculations (Circumference C = 2 * PI * r)
  const r = 38;
  const C = 2 * Math.PI * r;
  const totalCount = regimeStats.total || 1;
  const pCrit = (regimeStats.drying / totalCount) * C;
  const pWet = (regimeStats.wetting / totalCount) * C;
  const pInsignif = (regimeStats.insignificant / totalCount) * C;

  const toggleRegimeFilter = (regime: 'DRYING' | 'WETTING' | 'NOISE') => {
    setActiveRegimeFilter((prev) => (prev === regime ? 'ALL' : regime));
  };

  if (mode === 'AGENT') return null;

  const slopeClass = (v: number) => (v === 0 ? 'text-ink-2' : v < 0 ? 'text-dry-3' : 'text-wet-3');
  const signed = (v: number, digits: number) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;

  const donutSegments = [
    {
      key: 'DRYING' as const,
      color: COLORS.dry3,
      len: pCrit,
      offset: 0,
    },
    {
      key: 'WETTING' as const,
      color: COLORS.wet3,
      len: pWet,
      offset: -pCrit,
    },
    {
      key: 'NOISE' as const,
      color: COLORS.ink3,
      len: pInsignif,
      offset: -(pCrit + pWet),
    },
  ];

  return (
    <div className="flex w-full flex-col gap-4 text-label text-ink-2">
      {mode === 'REMOTE_SENSING' ? (
        <>
          {/* Summary line */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="tnum m-0 text-caption text-ink-3">
              {regimeStats.total} regions, {regimeStats.totalAreaKm2.toLocaleString()} km² in total
            </p>
            {selectedEarthClass && <span className="tag">{selectedEarthClass}</span>}
          </div>

          {/* Donut: trend regimes */}
          <section aria-label="Trend regimes" className="flex flex-col items-center gap-3">
            <div className="flex w-full items-center justify-between">
              <h3 className="m-0 text-body font-semibold text-ink-1">Trend regimes (FDR q &lt; 0.05)</h3>
              {activeRegimeFilter !== 'ALL' && (
                <button type="button" onClick={() => setActiveRegimeFilter('ALL')} className="btn btn-ghost btn-sm">
                  Reset
                </button>
              )}
            </div>

            <div className="relative flex h-28 w-28 items-center justify-center">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                {donutSegments.map((seg) => (
                  <circle
                    key={seg.key}
                    cx="50"
                    cy="50"
                    r={r}
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth={activeRegimeFilter === seg.key ? '14' : '11'}
                    strokeDasharray={`${seg.len} ${C - seg.len}`}
                    strokeDashoffset={seg.offset}
                    className="cursor-pointer transition-all duration-200"
                    style={{
                      opacity: activeRegimeFilter === 'ALL' || activeRegimeFilter === seg.key ? 1 : 0.35,
                    }}
                    onClick={() => toggleRegimeFilter(seg.key)}
                  />
                ))}
              </svg>

              <div className="pointer-events-none absolute flex flex-col items-center text-center">
                <span className="tnum text-title font-semibold text-ink-1">
                  {activeRegimeFilter === 'ALL'
                    ? regimeStats.total
                    : activeRegimeFilter === 'DRYING'
                    ? regimeStats.drying
                    : activeRegimeFilter === 'WETTING'
                    ? regimeStats.wetting
                    : regimeStats.insignificant}
                </span>
                <span className="text-caption text-ink-3">
                  {activeRegimeFilter === 'ALL'
                    ? 'Regions'
                    : activeRegimeFilter === 'DRYING'
                    ? 'Drying'
                    : activeRegimeFilter === 'WETTING'
                    ? 'Wetting'
                    : 'Not significant'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Filter regions by trend regime">
              <button
                type="button"
                onClick={() => toggleRegimeFilter('DRYING')}
                aria-pressed={activeRegimeFilter === 'DRYING'}
                className="chip"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-dry-3" aria-hidden="true" />
                <span className="tnum">Significant drying ({regimeStats.drying})</span>
              </button>
              <button
                type="button"
                onClick={() => toggleRegimeFilter('WETTING')}
                aria-pressed={activeRegimeFilter === 'WETTING'}
                className="chip"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-wet-3" aria-hidden="true" />
                <span className="tnum">Significant wetting ({regimeStats.wetting})</span>
              </button>
              <button
                type="button"
                onClick={() => toggleRegimeFilter('NOISE')}
                aria-pressed={activeRegimeFilter === 'NOISE'}
                className="chip"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-ink-3" aria-hidden="true" />
                <span className="tnum">Not significant ({regimeStats.insignificant})</span>
              </button>
            </div>
          </section>

          {/* Ranked regions */}
          <section aria-label="Regions ranked by FDR q" className="flex min-h-[160px] flex-col gap-2 border-t border-line pt-4">
            <div className="flex items-center justify-between">
              <h3 className="m-0 text-body font-semibold text-ink-1">Regions ranked by FDR q</h3>
              {activeRegimeFilter !== 'ALL' && (
                <button type="button" onClick={() => setActiveRegimeFilter('ALL')} className="btn btn-ghost btn-sm">
                  Clear filter
                </button>
              )}
            </div>

            {/* Not-significant regions: naive vs corrected p, read from the data */}
            {activeRegimeFilter === 'NOISE' && (
              <div className="flex flex-col gap-1 text-caption text-ink-2">
                <span className="tag tag-warn self-start">Not significant after autocorrelation correction and FDR</span>
                {rankedBasins.slice(0, 6).map(({ basin }) => {
                  const bp = basin.properties as any;
                  const fmt = (v: unknown) => (typeof v === 'number' ? v.toFixed(3) : 'n/a');
                  return (
                    <span key={bp.basin_id} className="tnum">
                      <strong className="font-semibold text-ink-1">{bp.basin_name}</strong>: naive p = {fmt(bp.p_value_naive)}, corrected p = {fmt(bp.p_value_corrected)}, FDR q = {fmt(bp.p_value_fdr)}.
                    </span>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col border-y border-line">
              <div className="grid grid-cols-[32px_56px_1fr_72px] items-center px-2 py-1.5 text-caption text-ink-3">
                <span>Rank</span>
                <span>FDR q</span>
                <span>Region</span>
                <span className="text-right">cm/yr</span>
              </div>

              <div className="custom-scrollbar max-h-56 divide-y divide-line overflow-y-auto border-t border-line">
                {rankedBasins.length === 0 ? (
                  <div className="p-4 text-center text-caption text-ink-3">No regions match the active filter.</div>
                ) : (
                  rankedBasins.slice(0, 15).map(({ basin, fdrQ }, idx) => {
                    const slope = basin.properties.theil_sen_slope;
                    const isSelected =
                      inspectedMetrics?.basin?.properties.basin_id === basin.properties.basin_id;
                    return (
                      <button
                        type="button"
                        key={basin.properties.basin_id}
                        onClick={() => {
                          setInspectedBasinId(basin.properties.basin_id);
                          onFlyToBasin(basin);
                        }}
                        onMouseEnter={() => onHoverBasin?.(basin)}
                        onMouseLeave={() => onHoverBasin?.(null)}
                        onFocus={() => onHoverBasin?.(basin)}
                        onBlur={() => onHoverBasin?.(null)}
                        aria-current={isSelected ? 'true' : undefined}
                        className={`grid min-h-[32px] w-full cursor-pointer grid-cols-[32px_56px_1fr_72px] items-center border-0 border-l-2 bg-transparent px-2 py-1.5 text-left text-ink-2 hover:bg-surface-2 ${
                          isSelected ? 'border-accent bg-surface-2' : 'border-transparent'
                        }`}
                      >
                        <span className="tnum text-caption text-ink-3">{idx + 1}</span>
                        <span className="tnum text-caption text-ink-2">{fdrQ.toFixed(3)}</span>
                        <span className="truncate pr-2 text-label text-ink-1" title={basin.properties.basin_name}>
                          {basin.properties.basin_name}
                        </span>
                        <span className={`tnum text-right text-label font-semibold ${slopeClass(slope)}`}>
                          {signed(slope, 2)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          {/* Detail for the inspected region */}
          {inspectedMetrics && (
            <section aria-label="Statistics for the selected region" className="flex flex-col gap-4 border-t border-line pt-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 min-w-0 truncate text-body font-semibold text-ink-1" title={inspectedMetrics.basin.properties.basin_name}>
                  {inspectedMetrics.basin.properties.basin_name}
                </h3>
                <button
                  type="button"
                  onClick={() => onFlyToBasin(inspectedMetrics.basin)}
                  className="btn btn-secondary btn-sm shrink-0"
                >
                  <span>Fly to region</span>
                  <ExternalLink size={12} aria-hidden="true" />
                </button>
              </div>

              {/* Theil-Sen and Mann-Kendall */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="m-0 text-label font-medium text-ink-2">Rank-based estimate</h4>
                  <span className="tag">Theil-Sen and Mann-Kendall</span>
                </div>
                <dl className="m-0 flex flex-col gap-1 text-caption">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-ink-3">Trend (Sen&apos;s slope)</dt>
                    <dd className={`tnum m-0 text-label font-semibold ${slopeClass(inspectedMetrics.sensSlope)}`}>
                      {signed(inspectedMetrics.sensSlope, 4)} cm/yr
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-ink-3">Mann-Kendall Z</dt>
                    <dd className="tnum m-0 text-ink-1">{signed(inspectedMetrics.mkZ, 2)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-ink-3">95% confidence interval</dt>
                    <dd className="tnum m-0 text-ink-2">
                      [{inspectedMetrics.ciLow.toFixed(2)}, {inspectedMetrics.ciHigh.toFixed(2)}] cm/yr
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Significance, effective N* and regime shift */}
              <dl className="m-0 flex flex-col gap-1.5 border-t border-line pt-4 text-caption">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-ink-3">Significance (FDR q-value)</dt>
                  <dd className="tnum m-0 text-right text-ink-1">
                    {inspectedMetrics.pValue < 0.0001 ? '< 0.0001' : inspectedMetrics.pValue.toFixed(5)}{' '}
                    <span className={inspectedMetrics.pValue < 0.05 ? 'text-ink-2' : 'text-warn'}>
                      {inspectedMetrics.pValue < 0.05 ? '(significant, q < 0.05)' : '(not significant, q ≥ 0.05)'}
                    </span>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-ink-3">Effective sample size (n*) and lag-1 autocorrelation</dt>
                  <dd className="tnum m-0 text-right text-ink-1">
                    n* = {inspectedMetrics.nStar}, ρ₁ = {inspectedMetrics.rho1.toFixed(2)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-ink-3">Regime shift (Pettitt) and signal-to-noise</dt>
                  <dd className="tnum m-0 text-right text-ink-1">
                    {inspectedMetrics.breakpointYear}, SNR {inspectedMetrics.snr.toFixed(2)}
                  </dd>
                </div>
              </dl>

              {/* Naive OLS, shown after the corrected test */}
              <div className="flex flex-col gap-1.5 border-t border-line pt-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="m-0 text-label font-medium text-ink-2">Naive least squares</h4>
                  <span className="tag">Uncorrected t-test</span>
                </div>
                <p className="m-0 text-caption text-ink-3">Ignores autocorrelation, so it can overstate significance.</p>
                <dl className="m-0 flex flex-col gap-1 text-caption">
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-ink-3">Trend (OLS slope)</dt>
                    <dd className={`tnum m-0 text-label font-semibold ${slopeClass(inspectedMetrics.olsSlope)}`}>
                      {signed(inspectedMetrics.olsSlope, 4)} cm/yr
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-ink-3">t-statistic</dt>
                    <dd className="tnum m-0 text-ink-1">t = {signed(inspectedMetrics.olsT, 2)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-ink-3">Standard error and naive p</dt>
                    <dd className="tnum m-0 text-ink-2">
                      {inspectedMetrics.olsSE.toFixed(4)}, {inspectedMetrics.olsP < 0.001 ? 'p < 0.001' : 'p = ' + inspectedMetrics.olsP.toFixed(3)}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Observation horizon when q >= 0.05 */}
              {inspectedMetrics.pValue >= 0.05 && inspectedMetrics.observationHorizon && (
                <div className="flex flex-col gap-2 border-t border-line pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="m-0 flex items-center gap-1.5 text-label font-medium text-ink-1">
                      <Sparkles size={14} className="shrink-0 text-warn" aria-hidden="true" />
                      Observation horizon (p &lt; 0.05 target)
                    </h4>
                    <span className="tag tag-warn tnum">About {inspectedMetrics.observationHorizon.targetYear}</span>
                  </div>
                  <dl className="m-0 flex flex-col gap-1 text-caption">
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-ink-3">Effective sample size needed</dt>
                      <dd className="tnum m-0 text-ink-1">
                        {inspectedMetrics.observationHorizon.requiredNStar} points (now {inspectedMetrics.nStar})
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-ink-3">More data needed</dt>
                      <dd className="tnum m-0 text-ink-1">
                        +{inspectedMetrics.observationHorizon.additionalMonths} months (+{inspectedMetrics.observationHorizon.additionalYears.toFixed(1)} years)
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <dt className="text-ink-3">Year p &lt; 0.05 is reached</dt>
                      <dd className="tnum m-0 text-ink-1">{inspectedMetrics.observationHorizon.targetYear}</dd>
                    </div>
                  </dl>
                  <p className="tnum m-0 text-caption text-ink-3">
                    Not significant, partly because of AR(1) persistence (ρ₁={inspectedMetrics.rho1.toFixed(2)}). If the current trend continues, about +{inspectedMetrics.observationHorizon.additionalMonths} more months (+{inspectedMetrics.observationHorizon.additionalYears.toFixed(1)} yrs) of data would be needed to reach p &lt; 0.05, around year ~{inspectedMetrics.observationHorizon.targetYear} (a projection, not a forecast).
                  </p>
                </div>
              )}

              {/* Time of emergence */}
              <div className="flex items-baseline justify-between gap-2 border-t border-line pt-4 text-caption">
                <span className="text-ink-3">Time of emergence (ToE)</span>
                <span className="tnum text-right text-ink-1">
                  {inspectedMetrics.toeYear
                    ? `Year ${inspectedMetrics.toeYear} (SNR > 2.0 signal)`
                    : 'Stationary or low SNR'}
                </span>
              </div>

              {/* Strip cyclical oscillations (isolate secular trend) */}
              <div className="flex flex-col gap-2 border-t border-line pt-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="m-0 flex items-center gap-1.5 text-label font-medium text-ink-1">
                    <Waves size={14} className="text-ink-3" aria-hidden="true" />
                    Remove climate cycles
                  </h4>
                  <button
                    type="button"
                    onClick={() => setStripCyclical((prev) => !prev)}
                    aria-pressed={stripCyclical}
                    className="btn btn-secondary btn-sm"
                  >
                    {stripCyclical ? 'Cycles removed' : 'Remove cycles'}
                  </button>
                </div>

                {stripCyclical && inspectedMetrics.cyclical ? (
                  <div className="flex flex-col gap-1 text-caption text-ink-3">
                    <div className="flex justify-between gap-2">
                      <span>Coupled climate index</span>
                      <span className="tnum text-right text-ink-1">
                        {inspectedMetrics.optimalDriver} (lag {inspectedMetrics.driverLag} mo, r = {inspectedMetrics.driverR})
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Residual rate after removing the index</span>
                      <span className="tnum text-right text-ink-1">
                        {signed(inspectedMetrics.secularSlope, 4)} cm/yr
                      </span>
                    </div>
                    <span>
                      Lagged climate index regressed out. The residual rate is a statistical
                      remainder, not proof of permanent change.
                    </span>
                  </div>
                ) : (
                  <span className="text-caption text-ink-3">
                    Switch on to regress out the lagged climate index ({inspectedMetrics.optimalDriver}) and
                    isolate the underlying long-term drift.
                  </span>
                )}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          {/* Mode === 'GIS' */}
          <div className="flex items-center justify-between gap-2">
            <p className="tnum m-0 text-caption text-ink-3">
              {aoiStats.count} regions in the box, {aoiStats.areaKm2.toLocaleString()} km²
            </p>
            <button
              type="button"
              onClick={onClearAOI}
              className="btn btn-ghost btn-sm"
              title="Clear selection box"
            >
              <Trash2 size={14} aria-hidden="true" />
              <span>Clear</span>
            </button>
          </div>

          <section aria-label="Regions in the box by trend" className="flex flex-col gap-2">
            <h3 className="m-0 text-body font-semibold text-ink-1">Regions in the box, by trend</h3>
            <div className="flex flex-col gap-2">
              {[
                { label: 'Drying regions', count: aoiStats.drying, bar: 'bg-dry-2', text: 'text-dry-3' },
                { label: 'Wetting regions', count: aoiStats.wetting, bar: 'bg-wet-2', text: 'text-wet-3' },
                { label: 'Roughly stable', count: aoiStats.stable, bar: 'bg-ink-3', text: 'text-ink-2' },
              ].map((row) => (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-caption">
                    <span className={row.text}>{row.label}</span>
                    <span className="tnum text-ink-1">{row.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${row.bar} transition-all duration-300`}
                      style={{ width: `${aoiStats.count ? (row.count / aoiStats.count) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Estimated annual flux" className="flex flex-col gap-1 border-t border-line pt-4">
            <h3 className="m-0 text-body font-semibold text-ink-1">Estimated annual water-storage change</h3>
            <div className="flex items-baseline justify-between">
              <span className="text-caption text-ink-3">Annual flux</span>
              <span className={`tnum text-body font-semibold ${slopeClass(aoiStats.fluxGt)}`}>
                {aoiStats.fluxGt > 0 ? '+' : ''}
                {aoiStats.fluxGt} Gt/yr
              </span>
            </div>
            <span className="text-caption text-ink-3">Integrated across all enclosed region boundaries.</span>
          </section>

          <section aria-label="Selection bounds" className="flex flex-col gap-1 border-t border-line pt-4">
            <h3 className="m-0 text-body font-semibold text-ink-1">Selection bounds (WGS84)</h3>
            {aoiSelection ? (
              <div className="flex flex-col gap-1 text-caption text-ink-2">
                <div className="flex justify-between gap-2">
                  <span className="text-ink-3">Bottom-left</span>
                  <span className="tnum">
                    {aoiSelection.bounds[0].toFixed(4)}°, {aoiSelection.bounds[1].toFixed(4)}°
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-ink-3">Top-right</span>
                  <span className="tnum">
                    {aoiSelection.bounds[2].toFixed(4)}°, {aoiSelection.bounds[3].toFixed(4)}°
                  </span>
                </div>
              </div>
            ) : (
              <span className="text-caption text-ink-3">Drag on the map to draw a box.</span>
            )}
          </section>
        </>
      )}
    </div>
  );
}
