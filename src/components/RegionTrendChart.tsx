import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { BasinFeature } from './Globe';
import { GLOSSARY, MINUS, fmtSigned, term } from '../lib/glossary';
import type { BasinProps } from '../lib/glossary';

export interface RegionTrendChartProps {
  /** The basin whose water-storage series is drawn. */
  basin: BasinFeature;
  /** true = plain-language captions; false = technical captions. */
  plain: boolean;
  /** Chart height in px. Width always follows the container. */
  height?: number;
}

const MARGIN = { top: 26, right: 14, bottom: 22 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** GRACE ended in June 2017 and GRACE-FO began in June 2018; no data between July 2017 and May 2018. */
const GAP_START = 2017 + 6 / 12;
const GAP_END = 2018 + 5 / 12;

/** Full class names so Tailwind can see them. Red is a drying basin, blue a wetting one. */
const HUES = {
  dry: { fill: 'fill-dry-3', stroke: 'stroke-dry-3', bg: 'bg-dry-3' },
  wet: { fill: 'fill-wet-3', stroke: 'stroke-wet-3', bg: 'bg-wet-3' },
} as const;

/** 'YYYY-MM' to a decimal year (start of that month). */
function decimalYear(d: string): number {
  const m = /^(\d{4})-(\d{2})/.exec(d);
  return m ? Number(m[1]) + (Number(m[2]) - 1) / 12 : NaN;
}

function monthLabel(d: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(d);
  return m ? `${MONTHS[Number(m[2]) - 1] ?? ''} ${m[1]}` : d;
}

/** Round a raw step up to 1, 2 or 5 times a power of ten. */
function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
}

function tickLabel(v: number): string {
  if (v === 0) return '0';
  return v > 0 ? `+${v}` : `${MINUS}${Math.abs(v)}`;
}

function words(v: number): string {
  const r = Math.round(v);
  return r < 0 ? `minus ${Math.abs(r)} cm` : `plus ${r} cm`;
}

/** SVG path through the points, lifting the pen at non-finite values. */
function linePath(xs: number[], ys: (number | undefined)[], sx: (x: number) => number, sy: (y: number) => number): string {
  let d = '';
  let pen = false;
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i];
    if (y === undefined || !Number.isFinite(y) || !Number.isFinite(xs[i])) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(y).toFixed(1)}`;
    pen = true;
  }
  return d;
}

/**
 * The one canonical trend chart: deseasonalised series, Theil-Sen trend line,
 * its confidence band, the break year and the gap between the GRACE missions.
 * Hand-rolled SVG so tick text stays a true 11px at any column width.
 */
export default function RegionTrendChart({ basin, plain, height = 160 }: RegionTrendChartProps) {
  const p = basin.properties as BasinProps;
  const ts = p.time_series;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => {
    const dates = ts?.dates ?? ts?.timestamps ?? [];
    const series = ts?.deseasonalized ?? [];
    const n = Math.min(dates.length, series.length);
    if (n < 2) return null;
    const xs = dates.slice(0, n).map(decimalYear);
    const finiteXs = xs.filter(Number.isFinite);
    if (finiteXs.length < 2) return null;
    const trend = ts?.trend_line?.slice(0, n);
    const lo = ts?.conf_lower?.slice(0, n);
    const hi = ts?.conf_upper?.slice(0, n);
    const all: number[] = [0];
    for (const arr of [series.slice(0, n), trend, lo, hi]) {
      if (arr) for (const v of arr) if (Number.isFinite(v)) all.push(v);
    }
    const min = Math.min(...all);
    const max = Math.max(...all);
    const step = niceStep((max - min) / 4 || 1);
    const yMin = Math.floor(min / step) * step;
    const yMax = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(Math.round(v / step) * step);
    return { dates: dates.slice(0, n), series: series.slice(0, n), trend, lo, hi, xs, xMin: Math.min(...finiteXs), xMax: Math.max(...finiteXs), yMin, yMax, ticks };
  }, [ts]);

  if (!model) {
    return (
      <div className="flex items-center justify-center rounded border border-line text-caption text-ink-3" style={{ height }}>
        No time series for this basin.
      </div>
    );
  }

  const { dates, series, trend, lo, hi, xs, xMin, xMax, yMin, yMax, ticks } = model;
  const hue = p.theil_sen_slope < 0 ? HUES.dry : HUES.wet;
  const marginLeft = 12 + Math.max(...ticks.map((t) => tickLabel(t).length)) * 6.6;
  const plotW = Math.max(width - marginLeft - MARGIN.right, 10);
  const plotH = Math.max(height - MARGIN.top - MARGIN.bottom, 10);
  const sx = (x: number) => marginLeft + ((x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y: number) => MARGIN.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;

  const bpYear = typeof p.breakpoint_year === 'number' && Number.isFinite(p.breakpoint_year) ? p.breakpoint_year : null;
  const bpX = bpYear !== null && bpYear + 0.5 >= xMin && bpYear + 0.5 <= xMax ? sx(bpYear + 0.5) : null;
  const bpText = `${term(GLOSSARY.stepChange, plain)}, ${bpYear}`;
  const bpLeft = bpX !== null && bpX + 4 + bpText.length * 6 > width - 4;

  const gapX0 = sx(Math.max(GAP_START, xMin));
  const gapX1 = sx(Math.min(GAP_END, xMax));
  const showGap = GAP_START < xMax && GAP_END > xMin && gapX1 > gapX0;

  const perYear = plotW / (xMax - xMin);
  const yearStep = perYear >= 22 ? 2 : perYear >= 11 ? 4 : 5;
  const yearTicks: number[] = [];
  for (let y = Math.ceil(xMin / yearStep) * yearStep; y <= xMax; y += yearStep) yearTicks.push(y);

  let bandPath = '';
  if (lo && hi) {
    const idx = xs.map((_, i) => i).filter((i) => Number.isFinite(lo[i]) && Number.isFinite(hi[i]) && Number.isFinite(xs[i]));
    if (idx.length >= 2) {
      const top = idx.map((i, k) => `${k ? 'L' : 'M'}${sx(xs[i]).toFixed(1)},${sy(hi[i]).toFixed(1)}`).join('');
      const bottom = [...idx].reverse().map((i) => `L${sx(xs[i]).toFixed(1)},${sy(lo[i]).toFixed(1)}`).join('');
      bandPath = `${top}${bottom}Z`;
    }
  }

  const startLevel = trend?.[0] ?? series[0];
  const endLevel = trend?.[trend.length - 1] ?? series[series.length - 1];
  const label =
    `Water storage in ${p.basin_name} ${endLevel < startLevel ? 'fell' : 'rose'} from about ${words(startLevel)} in ${Math.round(xMin)} ` +
    `to about ${words(endLevel)} in ${Math.round(xMax)}` +
    (bpYear !== null ? `, with a ${plain ? 'step change' : 'Pettitt break'} around ${bpYear}.` : '.');

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = xMin + ((e.clientX - rect.left) / rect.width) * (xMax - xMin);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < xs.length; i++) {
      const d = Math.abs(xs[i] - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHover(best);
  };

  const hx = hover !== null ? sx(xs[hover]) : 0;
  const hoverTrend = hover !== null ? trend?.[hover] : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrapRef} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={label} className="block select-none">
            {showGap && <rect x={gapX0} y={MARGIN.top} width={gapX1 - gapX0} height={plotH} className="fill-surface-2" />}
            {ticks.map((t) => (
              <line key={t} x1={marginLeft} x2={marginLeft + plotW} y1={sy(t)} y2={sy(t)} className={t === 0 ? 'stroke-line-strong' : 'stroke-line'} strokeWidth={1} />
            ))}
            {bandPath && <path d={bandPath} className={hue.fill} fillOpacity={0.25} />}
            <path d={linePath(xs, series, sx, sy)} fill="none" className="stroke-ink-2" strokeWidth={1.25} strokeLinejoin="round" />
            {trend && <path d={linePath(xs, trend, sx, sy)} fill="none" className={hue.stroke} strokeWidth={2} strokeLinecap="round" />}
            {bpX !== null && (
              <>
                <line x1={bpX} x2={bpX} y1={MARGIN.top} y2={MARGIN.top + plotH} className="stroke-ink-1" strokeWidth={1} strokeDasharray="3 3" />
                <text x={bpLeft ? bpX - 4 : bpX + 4} y={MARGIN.top - 16} textAnchor={bpLeft ? 'end' : 'start'} className="fill-ink-2" fontSize={11}>
                  {bpText}
                </text>
              </>
            )}
            <text x={marginLeft - 8} y={MARGIN.top - 16} textAnchor="end" className="fill-ink-3" fontSize={11}>
              cm
            </text>
            {ticks.map((t) => (
              <text key={t} x={marginLeft - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="fill-ink-3 tnum" fontSize={11}>
                {tickLabel(t)}
              </text>
            ))}
            {yearTicks.map((y) => (
              <text key={y} x={sx(y)} y={MARGIN.top + plotH + 15} textAnchor="middle" className="fill-ink-3 tnum" fontSize={11}>
                {y}
              </text>
            ))}
            {hover !== null && (
              <g pointerEvents="none">
                <line x1={hx} x2={hx} y1={MARGIN.top} y2={MARGIN.top + plotH} className="stroke-ink-3" strokeWidth={1} />
                {Number.isFinite(series[hover]) && <circle cx={hx} cy={sy(series[hover])} r={3} className="fill-ink-1" />}
                {hoverTrend !== undefined && Number.isFinite(hoverTrend) && <circle cx={hx} cy={sy(hoverTrend)} r={3} className={hue.fill} />}
              </g>
            )}
            <rect
              x={marginLeft}
              y={MARGIN.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
        )}
        {hover !== null && width > 0 && (
          <div
            className="pointer-events-none absolute z-10 rounded border border-line bg-surface-2 px-2 py-1 text-caption text-ink-1"
            style={hx > width / 2 ? { top: MARGIN.top + 4, right: width - hx + 8 } : { top: MARGIN.top + 4, left: hx + 8 }}
          >
            <div className="text-ink-2">{monthLabel(dates[hover])}</div>
            <div className="tnum">{Number.isFinite(series[hover]) ? `${fmtSigned(series[hover], 1)} cm` : 'No value'}</div>
            {hoverTrend !== undefined && Number.isFinite(hoverTrend) && <div className="tnum text-ink-2">Trend {fmtSigned(hoverTrend, 1)} cm</div>}
          </div>
        )}
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-caption text-ink-3">
        <li className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-0.5 w-3.5 ${hue.bg}`} />
          Trend
        </li>
        {bandPath && (
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2 w-3.5 opacity-25 ${hue.bg}`} />
            Likely range
          </li>
        )}
        {bpX !== null && (
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="w-3.5 border-t border-dashed border-ink-1" />
            {term(GLOSSARY.stepChange, plain)}
          </li>
        )}
        {showGap && (
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 border border-line bg-surface-2" />
            {term(GLOSSARY.gap, plain)}
          </li>
        )}
      </ul>
    </div>
  );
}
