import { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ReferenceArea,
  Area,
  ComposedChart,
} from 'recharts';
import {
  X,
  ArrowRightLeft,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Activity,
} from 'lucide-react';
import { useModalDialog } from './shell/useModalDialog';
import { fmtSigned } from './shell/shellUtils';
import { COLORS, SERIES, CHART } from '../theme/colors';
import type { BasinFeature } from './Globe';
import {
  evaluateCustomDipole,
  gradeDipoleCorrelation,
  calculatePearsonR,
  calculateAttributionPercentage,
  computeLaggedCorrelation,
  isolateSecularTrend,
  type CustomDipoleVerdict,
} from '../lib/statistics';

interface RegionTrendText {
  annualSlopeText: string;
  decadalSlopeText: string;
  ci95Text: string;
  significanceBadge: string;
}

/** Trend text in cm/yr first (the unit used across the app), decade rate second, real minus signs, no scientific notation. */
function formatRegionTrend(slope: number, p: number, q: number | undefined, ciLow?: number, ciHigh?: number): RegionTrendText {
  const fmtP = (v: number) => (v < 0.001 ? 'p < 0.001' : `p = ${v.toFixed(3)}`);
  const effective = q ?? p;
  const qText = q !== undefined ? ` (FDR q = ${q < 0.001 ? '< 0.001' : q.toFixed(3)})` : '';
  return {
    annualSlopeText: `${fmtSigned(slope)} cm/yr`,
    decadalSlopeText: `${fmtSigned(slope * 10)} cm per decade`,
    ci95Text:
      ciLow !== undefined && ciHigh !== undefined
        ? `95% CI ${fmtSigned(ciLow)} to ${fmtSigned(ciHigh)} cm/yr`
        : '95% CI: Sen non-parametric',
    significanceBadge: effective < 0.05 ? `${fmtP(p)}${qText}, significant` : `${fmtP(p)}, not significant`,
  };
}

/** Sentence case for a label that arrives in capitals. */
function sentenceCase(text: string): string {
  const lower = text.toLowerCase().replace(/β_([ab])/g, (_m, s: string) => `β_${s.toUpperCase()}`);
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export interface DualCompareInspectorProps {
  regionA: BasinFeature;
  regionB: BasinFeature;
  allBasins?: BasinFeature[];
  dipoleName?: string;
  driverMechanism?: string;
  onClose: () => void;
  onChangeRegionA?: (basin: BasinFeature) => void;
  onChangeRegionB?: (basin: BasinFeature) => void;
  onSwapRegions?: () => void;
}

interface ClimateIndexRecord {
  date: string;
  mei: number;
  iod: number;
}

export default function DualCompareInspector({
  regionA,
  regionB,
  allBasins = [],
  dipoleName = 'Atmospheric Teleconnection Dipole',
  driverMechanism = 'Possible explanations: opposing regional moisture shifts or orographic barriers (not tested here).',
  onClose,
  onChangeRegionA,
  onChangeRegionB,
  onSwapRegions,
}: DualCompareInspectorProps) {
  const dialog = useModalDialog<HTMLDivElement>(onClose);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [showClimateDriver, setShowClimateDriver] = useState(true);
  const [activeDriver, setActiveDriver] = useState<'mei' | 'iod'>('mei');
  const [butterflyMode, setButterflyMode] = useState<'mirrored' | 'superimposed'>('mirrored');
  const [climateIndices, setClimateIndices] = useState<ClimateIndexRecord[]>([]);

  // Load climate oscillation dataset
  useEffect(() => {
    fetch('/data/climate_indices.json')
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.indices)) {
          setClimateIndices(data.indices);
        }
      })
      .catch((err) => console.error('Failed to load climate_indices in DualCompare:', err));
  }, []);

  // Auto-select the basin pair's primary climate driver (ENSO MEI vs IOD DMI)
  useEffect(() => {
    const opt = regionA.properties.optimal_driver || regionB.properties.optimal_driver || '';
    if (opt.toUpperCase().includes('IOD')) {
      setActiveDriver('iod');
    } else {
      setActiveDriver('mei');
    }
  }, [regionA, regionB]);

  // Synchronized time-series datasets using deseasonalized series & detrended anomalies
  const timeData = useMemo(() => {
    const tsA = regionA.properties.time_series;
    const tsB = regionB.properties.time_series;
    const timestamps = tsA?.timestamps || tsB?.timestamps || [];

    return timestamps.map((t, idx) => {
      const rawA = tsA?.raw?.[idx] ?? tsA?.swot_wse?.[idx] ?? 0;
      const deseasA = tsA?.deseasonalized?.[idx] ?? rawA;
      const lineA = tsA?.trend_line?.[idx] ?? tsA?.stl_trend?.[idx] ?? 0;
      const anomA = parseFloat((deseasA - lineA).toFixed(3));

      const rawB = tsB?.raw?.[idx] ?? tsB?.swot_wse?.[idx] ?? 0;
      const deseasB = tsB?.deseasonalized?.[idx] ?? rawB;
      const lineB = tsB?.trend_line?.[idx] ?? tsB?.stl_trend?.[idx] ?? 0;
      const anomB = parseFloat((deseasB - lineB).toFixed(3));

      return {
        date: t,
        rawA,
        deseasA,
        trendA: lineA,
        anomA,
        rawB,
        deseasB,
        trendB: lineB,
        anomB,
      };
    });
  }, [regionA, regionB]);

  // Detrended deseasonalized anomaly vectors for true teleconnection correlation
  const seriesA = useMemo(() => timeData.map((d) => d.anomA), [timeData]);
  const seriesB = useMemo(() => timeData.map((d) => d.anomB), [timeData]);

  // Dynamically compute inter-basin detrended anomaly correlation r(A, B)
  const rAB = useMemo(() => calculatePearsonR(seriesA, seriesB), [seriesA, seriesB]);

  const trendA = useMemo(
    () =>
      formatRegionTrend(
        regionA.properties.theil_sen_slope,
        regionA.properties.p_value_raw ?? regionA.properties.p_value_fdr,
        regionA.properties.p_value_fdr,
        regionA.properties.theil_sen_ci_low,
        regionA.properties.theil_sen_ci_high
      ),
    [regionA]
  );

  const trendB = useMemo(
    () =>
      formatRegionTrend(
        regionB.properties.theil_sen_slope,
        regionB.properties.p_value_raw ?? regionB.properties.p_value_fdr,
        regionB.properties.p_value_fdr,
        regionB.properties.theil_sen_ci_low,
        regionB.properties.theil_sen_ci_high
      ),
    [regionB]
  );

  // Extract active climate index time series Z matching YYYY-MM timestamps
  const seriesZ = useMemo(() => {
    if (!climateIndices.length || !timeData.length) return [];
    const climMap = new Map<string, ClimateIndexRecord>();
    climateIndices.forEach((c) => {
      climMap.set(c.date, c);
      climMap.set(c.date.slice(0, 7), c);
    });
    return timeData.map((d) => {
      const rec = climMap.get(d.date) || climMap.get(d.date.slice(0, 7));
      if (!rec) return 0;
      return activeDriver === 'mei' ? rec.mei : rec.iod;
    });
  }, [climateIndices, timeData, activeDriver]);

  // Each step in the exported time_series array represents 2 months (bi-monthly subsample_step = 2)
  // Compute lagged correlations r(A, Z; tau*) and r(B, Z; tau*) across 0..6 bi-monthly steps (0..12 months)
  const lagResultA = useMemo(() => {
    if (!seriesZ.length) return { maxR: 0, laggedR: 0, optimalLag: 0, optimalLagSteps: 0, correlationByLag: [] };
    return computeLaggedCorrelation(seriesA, seriesZ, 6);
  }, [seriesA, seriesZ]);

  const lagResultB = useMemo(() => {
    if (!seriesZ.length) return { maxR: 0, laggedR: 0, optimalLag: 0, optimalLagSteps: 0, correlationByLag: [] };
    return computeLaggedCorrelation(seriesB, seriesZ, 6);
  }, [seriesB, seriesZ]);

  const rAZ = lagResultA.maxR;
  const rBZ = lagResultB.maxR;

  // First-order partial correlation r(A,B · Z) controlling for lagged climate index Z
  // Regress seriesA on seriesZ at lagResultA.optimalLagSteps to get residual series eA
  // Regress seriesB on seriesZ at lagResultB.optimalLagSteps to get residual series eB
  // Compute rAB_Z = calculatePearsonR(eA, eB) without collinearity blowup or artificial clamps
  const rAB_Z = useMemo(() => {
    if (!seriesA.length || !seriesB.length || !seriesZ.length) return rAB;
    const lagA = lagResultA.optimalLagSteps ?? 0;
    const lagB = lagResultB.optimalLagSteps ?? 0;
    const { residualSeries: eA } = isolateSecularTrend(seriesA, seriesZ, lagA);
    const { residualSeries: eB } = isolateSecularTrend(seriesB, seriesZ, lagB);
    return calculatePearsonR(eA, eB);
  }, [seriesA, seriesB, seriesZ, lagResultA, lagResultB, rAB]);

  // Compute Shared Process Attribution %
  const attributionPct = useMemo(() => calculateAttributionPercentage(rAB, rAB_Z), [rAB, rAB_Z]);

  // Shared Teleconnection Butterfly Timeline Data
  const butterflyData = useMemo(() => {
    if (!timeData.length) return { data: [], divergenceBands: [], sigmaSpread: 0, maxSpread: 0 };

    const valsA = timeData.map((d) => d.anomA);
    const valsB = timeData.map((d) => d.anomB);

    const meanA = valsA.reduce((a, b) => a + b, 0) / (valsA.length || 1);
    const meanB = valsB.reduce((a, b) => a + b, 0) / (valsB.length || 1);

    const stdA = Math.sqrt(valsA.reduce((a, b) => a + (b - meanA) ** 2, 0) / Math.max(1, valsA.length - 1)) || 1;
    const stdB = Math.sqrt(valsB.reduce((a, b) => a + (b - meanB) ** 2, 0) / Math.max(1, valsB.length - 1)) || 1;

    const climateMap = new Map<string, ClimateIndexRecord>();
    climateIndices.forEach((c) => climateMap.set(c.date, c));

    const records = timeData.map((d) => {
      const zA = (d.anomA - meanA) / stdA;
      const zB = (d.anomB - meanB) / stdB;
      const spread = Math.abs(zA - zB);
      const clim = climateMap.get(d.date);
      const mei = clim ? clim.mei : 0;
      const iod = clim ? clim.iod : 0;

      return {
        date: d.date,
        zA: parseFloat(zA.toFixed(3)),
        zB: parseFloat(zB.toFixed(3)),
        mirroredZB: parseFloat((-zB).toFixed(3)),
        spread: parseFloat(spread.toFixed(3)),
        mei: parseFloat(mei.toFixed(2)),
        iod: parseFloat(iod.toFixed(2)),
      };
    });

    const diffs = records.map((r) => r.spread);
    const meanSpread = diffs.reduce((a, b) => a + b, 0) / (diffs.length || 1);
    const sigmaSpread = Math.sqrt(diffs.reduce((a, b) => a + (b - meanSpread) ** 2, 0) / Math.max(1, diffs.length - 1)) || 1;
    const divergenceThreshold = 2.0;

    const divergenceBands: Array<{ start: string; end: string; maxSpread: number; label: string }> = [];
    let curBand: { start: string; end: string; maxSpread: number } | null = null;

    for (const r of records) {
      if (r.spread > divergenceThreshold) {
        if (!curBand) {
          curBand = { start: r.date, end: r.date, maxSpread: r.spread };
        } else {
          curBand.end = r.date;
          curBand.maxSpread = Math.max(curBand.maxSpread, r.spread);
        }
      } else {
        if (curBand) {
          divergenceBands.push({
            ...curBand,
            label: `|ΔZ| = ${curBand.maxSpread.toFixed(1)}σ`,
          });
          curBand = null;
        }
      }
    }
    if (curBand) {
      divergenceBands.push({
        ...curBand,
        label: `|ΔZ| = ${curBand.maxSpread.toFixed(1)}σ`,
      });
    }

    const maxSpread = Math.max(...records.map((r) => r.spread), 0);

    return { data: records, divergenceBands, sigmaSpread, maxSpread };
  }, [timeData, climateIndices]);

  // Contiguous ENSO MEI climate oscillation intervals
  const climateBands = useMemo(() => {
    if (!showClimateDriver || !climateIndices.length || !timeData.length) return [];
    const datesInSeries = new Set(timeData.map((d) => d.date));
    const sortedIndices = climateIndices.filter((c) => datesInSeries.has(c.date));

    const bands: Array<{ start: string; end: string; phase: 'el_nino' | 'la_nina'; color: string }> = [];
    let currentBand: { start: string; end: string; phase: 'el_nino' | 'la_nina' } | null = null;

    for (const rec of sortedIndices) {
      const isElNino = rec.mei > 0.5;
      const isLaNina = rec.mei < -0.5;

      if (isElNino) {
        if (!currentBand || currentBand.phase !== 'el_nino') {
          if (currentBand) bands.push({ ...currentBand, color: currentBand.phase === 'el_nino' ? SERIES[3] : SERIES[2] });
          currentBand = { start: rec.date, end: rec.date, phase: 'el_nino' };
        } else {
          currentBand.end = rec.date;
        }
      } else if (isLaNina) {
        if (!currentBand || currentBand.phase !== 'la_nina') {
          if (currentBand) bands.push({ ...currentBand, color: currentBand.phase === 'el_nino' ? SERIES[3] : SERIES[2] });
          currentBand = { start: rec.date, end: rec.date, phase: 'la_nina' };
        } else {
          currentBand.end = rec.date;
        }
      } else {
        if (currentBand) {
          bands.push({ ...currentBand, color: currentBand.phase === 'el_nino' ? SERIES[3] : SERIES[2] });
          currentBand = null;
        }
      }
    }
    if (currentBand) {
      bands.push({ ...currentBand, color: currentBand.phase === 'el_nino' ? SERIES[3] : SERIES[2] });
    }

    return bands;
  }, [showClimateDriver, climateIndices, timeData]);

  // Teleconnection Scatter Plot & Regression Line
  const { scatterData, regressionLine } = useMemo(() => {
    const pts: Array<{ x: number; y: number; date: string }> = [];
    let sumX = 0;
    let sumY = 0;

    for (const d of timeData) {
      pts.push({ x: d.anomA, y: d.anomB, date: d.date });
      sumX += d.anomA;
      sumY += d.anomB;
    }

    const n = pts.length;
    if (n === 0) return { scatterData: [], regressionLine: [] };

    const meanX = sumX / n;
    const meanY = sumY / n;

    let num = 0;
    let denX = 0;

    for (const p of pts) {
      const dx = p.x - meanX;
      const dy = p.y - meanY;
      num += dx * dy;
      denX += dx * dx;
    }

    const slopeM = denX > 0 ? num / denX : 0;
    const interceptC = meanY - slopeM * meanX;

    let minX = 0,
      maxX = 0;
    if (pts.length > 0) {
      minX = Math.min(...pts.map((p) => p.x));
      maxX = Math.max(...pts.map((p) => p.x));
    }

    const line = [
      { x: minX, y: slopeM * minX + interceptC },
      { x: maxX, y: slopeM * maxX + interceptC },
    ];

    return { scatterData: pts, regressionLine: line };
  }, [timeData]);

  const dipoleVerdict: CustomDipoleVerdict = useMemo(() => {
    return evaluateCustomDipole(
      seriesA,
      seriesB,
      regionA.properties.theil_sen_slope,
      regionB.properties.theil_sen_slope
    );
  }, [seriesA, seriesB, regionA, regionB]);

  const activeHoverPoint = useMemo(() => {
    if (!hoveredDate) return null;
    return scatterData.find((p) => p.date === hoveredDate) || null;
  }, [hoveredDate, scatterData]);

  const fmtR = (r: number) => fmtSigned(r);
  const oppositeSigns = regionA.properties.theil_sen_slope * regionB.properties.theil_sen_slope < 0;
  const hoverRecord = hoveredDate ? butterflyData.data.find((d) => d.date === hoveredDate) : undefined;
  const COLOR_A = SERIES[0];
  const COLOR_B = SERIES[1];

  const regionPanel = (
    side: 'A' | 'B',
    basin: BasinFeature,
    trend: RegionTrendText,
    colour: string,
    rawKey: 'rawA' | 'rawB',
    trendKey: 'trendA' | 'trendB'
  ) => {
    const slope = basin.properties.theil_sen_slope;
    const z = basin.properties.mann_kendall_z;
    const slopeClass = slope < 0 ? 'text-dry-3' : 'text-wet-3';
    return (
      <section aria-labelledby={`dual-region-${side}`} className="p-5 flex flex-col gap-4 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption text-ink-3 flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: colour }} aria-hidden="true" />
              Region {side}
            </p>
            <h3 id={`dual-region-${side}`} className="text-body font-semibold text-ink-1 mt-0.5">
              {basin.properties.basin_name}
            </h3>
            <p className="text-caption text-ink-2">{basin.properties.continent}</p>
          </div>
          <span className={slopeClass} aria-hidden="true">
            {slope < 0 ? <TrendingDown size={18} strokeWidth={1.75} /> : <TrendingUp size={18} strokeWidth={1.75} />}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-4 text-label">
          <div>
            <dt className="text-caption text-ink-3">Trend (Theil-Sen)</dt>
            <dd className={`text-body font-semibold tnum ${slopeClass}`}>{trend.annualSlopeText}</dd>
            <dd className="text-caption text-ink-2 tnum">{trend.decadalSlopeText}</dd>
            <dd className="text-caption text-ink-3 tnum mt-1">{trend.ci95Text}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-3">Mann-Kendall Z</dt>
            <dd className="text-body font-semibold text-ink-1 tnum">
              Z = {fmtSigned(z)}
            </dd>
            <dd className="text-caption text-ink-2 tnum mt-1">{trend.significanceBadge}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <div className="flex justify-between items-baseline gap-2">
            <h4 className="text-label font-medium text-ink-1">Water storage anomaly, cm: series and STL trend</h4>
            {hoveredDate && <span className="text-caption text-ink-2 tnum">{hoveredDate}</span>}
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={timeData}
                syncId="dual-compare-sync"
                margin={{ top: 5, right: 8, left: -12, bottom: 2 }}
                onMouseMove={(e) => {
                  if (e && e.activeLabel !== undefined && e.activeLabel !== null) setHoveredDate(String(e.activeLabel));
                }}
                onMouseLeave={() => setHoveredDate(null)}
              >
                <CartesianGrid strokeDasharray="2 2" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="date" stroke={CHART.axis} tick={CHART.tick} minTickGap={35} />
                <YAxis stroke={CHART.axis} tick={CHART.tick} domain={['auto', 'auto']} width={36} />
                <RechartsTooltip {...CHART.tooltip} />

                {climateBands.map((band, idx) => (
                  <ReferenceArea key={idx} x1={band.start} x2={band.end} fill={band.color} fillOpacity={0.14} strokeOpacity={0} />
                ))}

                {hoveredDate && <ReferenceLine x={hoveredDate} stroke={COLORS.ink2} strokeWidth={1} strokeDasharray="3 3" />}
                <Line type="monotone" name="Series (cm)" dataKey={rawKey} stroke={colour} strokeWidth={1} strokeOpacity={0.55} dot={false} isAnimationActive={false} />
                <Line type="monotone" name="STL trend (cm)" dataKey={trendKey} stroke={colour} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <div
        {...dialog.props}
        aria-labelledby="dual-compare-title"
        onClick={(e) => e.stopPropagation()}
        className="popover w-full max-w-6xl flex flex-col max-h-[92vh] overflow-hidden outline-none"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="dual-compare-title" className="text-title text-ink-1 font-semibold">
                Compare two regions
              </h2>
              <span className="tag">{dipoleName}</span>
            </div>
            <p className="text-label text-ink-2 mt-1 max-w-3xl">
              {driverMechanism.startsWith('Custom teleconnection')
                ? 'Your own pair, not a published dipole.'
                : /^(Possible|Restored)/.test(driverMechanism)
                  ? driverMechanism
                  : `Proposed mechanism (not tested here): ${driverMechanism}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onSwapRegions && (
              <button type="button" onClick={onSwapRegions} className="btn btn-secondary btn-sm">
                <ArrowRightLeft size={14} strokeWidth={1.75} />
                <span>Swap A and B</span>
              </button>
            )}
            <button
              type="button"
              className="chip"
              aria-pressed={showClimateDriver}
              onClick={() => setShowClimateDriver(!showClimateDriver)}
            >
              <Activity size={14} strokeWidth={1.75} />
              <span>Climate driver {showClimateDriver ? 'on' : 'off'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close comparison"
              className="btn btn-ghost btn-sm w-7 px-0"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>

          {allBasins.length > 0 && onChangeRegionA && onChangeRegionB && (
            <div className="w-full flex flex-wrap items-center gap-2 text-label">
              <label className="flex items-center gap-2 text-ink-2">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLOR_A }} aria-hidden="true" />
                <span>Region A</span>
                <select
                  value={regionA.properties.basin_id}
                  onChange={(e) => {
                    const b = allBasins.find((x) => x.properties.basin_id === e.target.value);
                    if (b) onChangeRegionA(b);
                  }}
                  className="field max-w-72"
                >
                  {allBasins.map((b) => (
                    <option key={b.properties.basin_id} value={b.properties.basin_id}>
                      {b.properties.basin_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-ink-2">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLOR_B }} aria-hidden="true" />
                <span>Region B</span>
                <select
                  value={regionB.properties.basin_id}
                  onChange={(e) => {
                    const b = allBasins.find((x) => x.properties.basin_id === e.target.value);
                    if (b) onChangeRegionB(b);
                  }}
                  className="field max-w-72"
                >
                  {allBasins.map((b) => (
                    <option key={b.properties.basin_id} value={b.properties.basin_id}>
                      {b.properties.basin_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        {/* Verdict strip */}
        <div className="px-5 py-2.5 border-b border-line bg-surface-1 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-label">
          <p className="flex items-center gap-2 text-ink-1 font-medium">
            <Sparkles size={14} strokeWidth={1.75} className="text-ink-2" aria-hidden="true" />
            {sentenceCase(dipoleVerdict.badgeTitle)}
          </p>
          <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-ink-2">
            <div className="flex gap-1.5">
              <dt>Dipole score:</dt>
              <dd className="text-ink-1 font-medium tnum">{dipoleVerdict.dipoleStrength}/100</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Divergence:</dt>
              <dd className="text-ink-1 font-medium tnum">{dipoleVerdict.trendDivergence.toFixed(2)} cm/yr</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Spearman ρ:</dt>
              <dd className="text-ink-1 font-medium tnum">{dipoleVerdict.spearmanRho.toFixed(2)}</dd>
            </div>
          </dl>
        </div>

        {showClimateDriver && (
          <p className="px-5 py-2 border-b border-line bg-surface-1 text-caption text-ink-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Shaded bands in the charts mark climate-driver phases:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm opacity-60" style={{ backgroundColor: SERIES[3] }} aria-hidden="true" />
              El Niño (MEI above 0.5)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm opacity-60" style={{ backgroundColor: SERIES[2] }} aria-hidden="true" />
              La Niña (MEI below −0.5)
            </span>
          </p>
        )}

        {/* Body */}
        <div className="overflow-y-auto bg-surface-1">
          <div className="grid grid-cols-1 lg:grid-cols-3 lg:divide-x divide-line max-lg:divide-y">
            {regionPanel('A', regionA, trendA, COLOR_A, 'rawA', 'trendA')}

            {/* Centre: coupling */}
            <section aria-labelledby="dual-coupling" className="p-5 flex flex-col gap-4 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="dual-coupling" className="text-body font-semibold text-ink-1">How the two regions move together</h3>
                  <p className="text-caption text-ink-2 mt-0.5">Detrended anomalies, region A against region B</p>
                </div>
                <span className="tag tnum">r(A,B) = {fmtR(rAB)}</span>
              </div>

              <div className="flex flex-col gap-1">
                <h4 className="text-label font-medium text-ink-1">
                  Anomaly, cm: x = {regionA.properties.basin_name}, y = {regionB.properties.basin_name}
                </h4>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 8, left: -12, bottom: 2 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke={CHART.grid} />
                      <XAxis type="number" dataKey="x" name="Region A (cm)" stroke={CHART.axis} tick={CHART.tick} domain={['auto', 'auto']} />
                      <YAxis type="number" dataKey="y" name="Region B (cm)" stroke={CHART.axis} tick={CHART.tick} domain={['auto', 'auto']} width={36} />
                      <ZAxis range={[22, 22]} />
                      <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} {...CHART.tooltip} />

                      {activeHoverPoint && (
                        <>
                          <ReferenceLine x={activeHoverPoint.x} stroke={COLORS.ink2} strokeDasharray="2 2" strokeWidth={1} />
                          <ReferenceLine y={activeHoverPoint.y} stroke={COLORS.ink2} strokeDasharray="2 2" strokeWidth={1} />
                        </>
                      )}

                      <Scatter name="Epoch pair" data={scatterData} fill={COLORS.ink2} opacity={0.6} isAnimationActive={false} />

                      {activeHoverPoint && (
                        <Scatter name="Synchronized epoch" data={[activeHoverPoint]} fill={COLORS.ink1} shape="circle" isAnimationActive={false} />
                      )}

                      <Line type="linear" data={regressionLine} dataKey="y" stroke={COLORS.ink1} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Shared driver correlation */}
              <div className="flex flex-col gap-3 border-t border-line pt-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-label font-semibold text-ink-1 flex items-center gap-1.5">
                    <Activity size={14} strokeWidth={1.75} className="text-ink-2" aria-hidden="true" />
                    Correlation shared with a climate driver
                  </h4>
                  <div className="seg" role="group" aria-label="Climate driver">
                    <button type="button" className="seg-item" aria-pressed={activeDriver === 'mei'} onClick={() => setActiveDriver('mei')}>
                      ENSO MEI
                    </button>
                    <button type="button" className="seg-item" aria-pressed={activeDriver === 'iod'} onClick={() => setActiveDriver('iod')}>
                      IOD DMI
                    </button>
                  </div>
                </div>

                <div
                  className="w-full bg-surface-2 rounded-full h-2 overflow-hidden"
                  role="meter"
                  aria-label="Share of the correlation that goes away when the driver is removed"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(attributionPct)}
                >
                  <div
                    className="h-full bg-ink-2 transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(3, attributionPct))}%` }}
                  />
                </div>

                <dl className="grid grid-cols-3 gap-3 text-label">
                  <div>
                    <dt className="text-caption text-ink-3">Raw correlation</dt>
                    <dd className="text-ink-1 font-medium tnum">r(A,B) = {fmtR(rAB)}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-ink-3">Partial, without {activeDriver.toUpperCase()}</dt>
                    <dd className="text-ink-1 font-medium tnum">r(A,B·Z) = {fmtR(rAB_Z)}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-ink-3">Shared with driver</dt>
                    <dd className="text-ink-1 font-medium tnum">{attributionPct.toFixed(1)}%</dd>
                  </div>
                </dl>

                <p className="text-caption text-ink-2 tnum">
                  Region A lag (τ_A): <strong className="text-ink-1 font-medium">{lagResultA.optimalLag} mo</strong> (r = {fmtR(rAZ)}).{' '}
                  Region B lag (τ_B): <strong className="text-ink-1 font-medium">{lagResultB.optimalLag} mo</strong> (r = {fmtR(rBZ)}).
                </p>
              </div>

              <div className="border-t border-line pt-4 flex flex-col gap-2 text-label text-ink-2">
                <p className="flex items-center gap-2 text-ink-1 font-medium">
                  <ShieldAlert size={14} strokeWidth={1.75} className="text-ink-2" aria-hidden="true" />
                  {oppositeSigns ? 'Opposing regional trends (opposite signs)' : 'Asymmetric rate gradient (same sign)'}
                </p>
                <p>
                  {oppositeSigns
                    ? `Opposite-sign trends: sign(β_A) ≠ sign(β_B) (r = ${rAB.toFixed(2)}). ${gradeDipoleCorrelation(rAB).sentence} Controlling for ${activeDriver === 'mei' ? 'ENSO' : 'IOD'} gives partial r = ${rAB_Z.toFixed(2)}, which removes ${attributionPct.toFixed(0)}% of the correlation (a statistical association, not a proven cause).`
                    : `Same-sign asymmetric rate gradient: both basins share trend sign, while multi-decadal rates diverge (Δβ = ${Math.abs(regionA.properties.theil_sen_slope - regionB.properties.theil_sen_slope).toFixed(2)} cm/yr), which may reflect orographic rain shadow or groundwater pumping (not tested here).`}
                </p>
                <p className="text-ink-3">{dipoleVerdict.description}</p>
              </div>
            </section>

            {regionPanel('B', regionB, trendB, COLOR_B, 'rawB', 'trendB')}
          </div>

          {/* Butterfly timeline */}
          <section aria-labelledby="dual-butterfly" className="p-5 border-t border-line flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 id="dual-butterfly" className="text-body font-semibold text-ink-1">
                  Standardised anomaly, σ: region A and region B over time
                </h3>
                <p className="text-caption text-ink-2 mt-0.5">
                  {butterflyMode === 'mirrored' ? 'Region B is mirrored (plotted as −Z) so opposite swings overlap.' : 'Both regions plotted as they are.'}
                  {showClimateDriver && ' Shading marks El Niño (purple) and La Niña (green) phases.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {butterflyData.divergenceBands.length > 0 ? (
                  <span className="tag tnum">Divergence |ΔZ| &gt; 2σ in {butterflyData.divergenceBands.length} periods</span>
                ) : (
                  <span className="tag">Within 2σ everywhere</span>
                )}
                <div className="seg" role="group" aria-label="Timeline view">
                  <button type="button" className="seg-item" aria-pressed={butterflyMode === 'mirrored'} onClick={() => setButterflyMode('mirrored')}>
                    Mirrored (±Z)
                  </button>
                  <button type="button" className="seg-item" aria-pressed={butterflyMode === 'superimposed'} onClick={() => setButterflyMode('superimposed')}>
                    Superimposed
                  </button>
                </div>
              </div>
            </div>

            {/* Readout */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-caption text-ink-2 tnum">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLOR_A }} aria-hidden="true" />
                Z_A ({regionA.properties.basin_name.slice(0, 16)}):{' '}
                <strong className="text-ink-1 font-medium">{hoverRecord ? `${hoverRecord.zA.toFixed(2)}σ` : '--'}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COLOR_B }} aria-hidden="true" />
                Z_B ({regionB.properties.basin_name.slice(0, 16)}):{' '}
                <strong className="text-ink-1 font-medium">{hoverRecord ? `${hoverRecord.zB.toFixed(2)}σ` : '--'}</strong>
              </span>
              <span>
                Spread |ΔZ|:{' '}
                <strong className="text-ink-1 font-medium">{hoverRecord ? `${hoverRecord.spread.toFixed(2)}σ` : '--'}</strong>
                {hoverRecord && hoverRecord.spread > 2.0 ? ' (above 2σ)' : ''}
              </span>
              {hoveredDate && <span className="text-ink-3">Date: {hoveredDate}</span>}
            </div>

            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={butterflyData.data}
                  syncId="dual-compare-sync"
                  margin={{ top: 8, right: 12, left: -8, bottom: 2 }}
                  onMouseMove={(e) => {
                    if (e && e.activeLabel !== undefined && e.activeLabel !== null) {
                      setHoveredDate(String(e.activeLabel));
                    }
                  }}
                  onMouseLeave={() => setHoveredDate(null)}
                >
                  <CartesianGrid strokeDasharray="2 2" stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="date" stroke={CHART.axis} tick={CHART.tick} minTickGap={35} />
                  <YAxis stroke={CHART.axis} tick={CHART.tick} domain={butterflyMode === 'mirrored' ? [-3.8, 3.8] : [-3.2, 3.2]} width={36} />
                  <RechartsTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = butterflyData.data.find((x) => x.date === label);
                      if (!d) return null;
                      const isDivergent = d.spread > 2.0;

                      return (
                        <div className="popover px-3 py-2 text-caption text-ink-1 tnum">
                          <div className="flex items-center justify-between gap-3 text-ink-2 pb-1 mb-1 border-b border-line">
                            <span className="font-medium text-ink-1">{label}</span>
                            {isDivergent && <span className="tag tag-warn">Above 2σ</span>}
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Z_A ({regionA.properties.basin_name.slice(0, 14)}):</span>
                            <span className="font-medium">{d.zA.toFixed(2)}σ</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Z_B ({regionB.properties.basin_name.slice(0, 14)}):</span>
                            <span className="font-medium">{d.zB.toFixed(2)}σ</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 pt-1 mt-1 border-t border-line">
                            <span>Spread |Z_A − Z_B|:</span>
                            <span className="font-medium">{d.spread.toFixed(2)}σ</span>
                          </div>
                          {showClimateDriver && (
                            <div className="text-ink-2 pt-1 flex justify-between gap-3">
                              <span>ENSO MEI: {d.mei > 0 ? `+${d.mei}` : d.mei}</span>
                              <span>IOD: {d.iod > 0 ? `+${d.iod}` : d.iod}</span>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />

                  {climateBands.map((band, idx) => (
                    <ReferenceArea
                      key={`clim-band-${idx}`}
                      x1={band.start}
                      x2={band.end}
                      fill={band.color}
                      fillOpacity={0.12}
                      strokeOpacity={0}
                    />
                  ))}

                  {butterflyData.divergenceBands.map((band, idx) => (
                    <ReferenceArea
                      key={`div-band-${idx}`}
                      x1={band.start}
                      x2={band.end}
                      fill={COLORS.ink3}
                      fillOpacity={0.18}
                      stroke={COLORS.ink2}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                  ))}

                  <ReferenceLine y={0} stroke={COLORS.lineStrong} strokeWidth={1} strokeDasharray="4 2" />

                  {hoveredDate && <ReferenceLine x={hoveredDate} stroke={COLORS.ink2} strokeWidth={1} strokeDasharray="3 3" />}

                  {showClimateDriver && (
                    <Area
                      type="monotone"
                      dataKey={activeDriver === 'mei' ? 'mei' : 'iod'}
                      name={activeDriver === 'mei' ? 'ENSO MEI driver' : 'IOD DMI driver'}
                      stroke={SERIES[4]}
                      fill={SERIES[4]}
                      fillOpacity={0.1}
                      strokeWidth={1}
                      strokeDasharray="2 2"
                      isAnimationActive={false}
                    />
                  )}

                  {butterflyMode === 'mirrored' ? (
                    <>
                      <Area
                        type="monotone"
                        dataKey="zA"
                        name={`Z_A (${regionA.properties.basin_name.slice(0, 12)})`}
                        stroke={COLOR_A}
                        fill={COLOR_A}
                        fillOpacity={0.2}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="mirroredZB"
                        name={`-Z_B (${regionB.properties.basin_name.slice(0, 12)} mirrored)`}
                        stroke={COLOR_B}
                        fill={COLOR_B}
                        fillOpacity={0.2}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </>
                  ) : (
                    <>
                      <Line
                        type="monotone"
                        dataKey="zA"
                        name={`Z_A (${regionA.properties.basin_name.slice(0, 12)})`}
                        stroke={COLOR_A}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="zB"
                        name={`Z_B (${regionB.properties.basin_name.slice(0, 12)})`}
                        stroke={COLOR_B}
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
