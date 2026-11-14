import { useMemo, useState } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { COLORS } from '../theme/colors';
import type { BasinFeature } from './Globe';

interface EcologicalPhasePortraitProps {
  basin: BasinFeature | null;
}

// Continuous time ramp: early record is dim grey, recent record is bright ink (one neutral hue, lightness only)
function interpolateTimeGradient(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const from = [100, 110, 120];
  const to = [236, 239, 242];
  const c = from.map((v, k) => Math.round(v + clamped * (to[k] - v)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

interface EllipseParams {
  meanX: number;
  meanY: number;
  semiMajor: number;
  semiMinor: number;
  angleRad: number;
  polygonPoints: Array<{ x: number; y: number }>;
}

function computeCovarianceEllipse(epochPts: Array<{ x: number; y: number }>): EllipseParams | null {
  const n = epochPts.length;
  if (n < 6) return null;

  const meanX = epochPts.reduce((acc, p) => acc + p.x, 0) / n;
  const meanY = epochPts.reduce((acc, p) => acc + p.y, 0) / n;

  let varX = 0;
  let varY = 0;
  let covXY = 0;

  for (const p of epochPts) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    varX += dx * dx;
    varY += dy * dy;
    covXY += dx * dy;
  }
  varX /= Math.max(1, n - 1);
  varY /= Math.max(1, n - 1);
  covXY /= Math.max(1, n - 1);

  // Eigenvalues of 2x2 covariance matrix
  const trace = varX + varY;
  const disc = Math.sqrt(Math.max(0, (varX - varY) * (varX - varY) + 4 * covXY * covXY));

  const lambda1 = Math.max(0.0001, (trace + disc) / 2);
  const lambda2 = Math.max(0.0001, (trace - disc) / 2);

  const semiMajor = Math.sqrt(lambda1);
  const semiMinor = Math.sqrt(lambda2);

  const angleRad = 0.5 * Math.atan2(2 * covXY, varX - varY);

  const polygonPoints: Array<{ x: number; y: number }> = [];
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  for (let k = 0; k <= 32; k++) {
    const theta = (2 * Math.PI * k) / 32;
    const px = semiMajor * Math.cos(theta);
    const py = semiMinor * Math.sin(theta);
    const x = meanX + px * cosA - py * sinA;
    const y = meanY + px * sinA + py * cosA;
    polygonPoints.push({ x, y });
  }

  return { meanX, meanY, semiMajor, semiMinor, angleRad, polygonPoints };
}

// Separating axis / directional radius overlap test for two 1-sigma covariance ellipses
function checkEllipsesOverlap(e1: EllipseParams | null, e2: EllipseParams | null): boolean {
  if (!e1 || !e2) return true;

  const dx = e2.meanX - e1.meanX;
  const dy = e2.meanY - e1.meanY;
  const centerDist = Math.hypot(dx, dy);
  if (centerDist === 0) return true;

  const dirAngle = Math.atan2(dy, dx);

  // Directional radius for e1
  const theta1 = dirAngle - e1.angleRad;
  const r1 = (e1.semiMajor * e1.semiMinor) /
    Math.sqrt(Math.pow(e1.semiMinor * Math.cos(theta1), 2) + Math.pow(e1.semiMajor * Math.sin(theta1), 2));

  // Directional radius for e2
  const theta2 = dirAngle - e2.angleRad;
  const r2 = (e2.semiMajor * e2.semiMinor) /
    Math.sqrt(Math.pow(e2.semiMinor * Math.cos(theta2), 2) + Math.pow(e2.semiMajor * Math.sin(theta2), 2));

  return centerDist <= (r1 + r2);
}

export default function EcologicalPhasePortrait({ basin }: EcologicalPhasePortraitProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const timeSeries = basin?.properties?.time_series;
  const bufferCollapsed = basin?.properties?.triangulation?.buffer_collapsed ?? false;
  const timestamps = timeSeries?.timestamps;
  const twsSeries = timeSeries?.raw || timeSeries?.deseasonalized || timeSeries?.swot_wse;
  const ndvi = timeSeries?.modis_ndvi;

  // Raw monthly data points
  const rawPoints = useMemo(() => {
    if (!timestamps || !timestamps.length || !twsSeries || !ndvi) return [];
    const toYear = (d: string) => parseFloat(d.substring(0, 4)) + (parseInt(d.substring(5, 7), 10) - 1) / 12;
    const y0 = toYear(timestamps[0]);
    const y1 = toYear(timestamps[timestamps.length - 1]);
    return timestamps.map((date, i) => {
      const year = toYear(date);
      const t = Math.max(0, Math.min(1, (year - y0) / Math.max(0.01, y1 - y0)));
      return {
        date,
        year,
        x: twsSeries[i] ?? 0,
        y: ndvi[i] ?? 0.4,
        index: i,
        t,
        color: interpolateTimeGradient(t),
      };
    });
  }, [timestamps, twsSeries, ndvi]);

  // 12-Month Rolling Smoothed Trajectory Curve
  const smoothedTrajectory = useMemo(() => {
    if (rawPoints.length < 2) return [];
    const windowSize = 12;
    return rawPoints.map((p, i) => {
      const start = Math.max(0, i - windowSize + 1);
      const slice = rawPoints.slice(start, i + 1);
      const avgX = slice.reduce((sum, pt) => sum + pt.x, 0) / slice.length;
      const avgY = slice.reduce((sum, pt) => sum + pt.y, 0) / slice.length;
      return {
        x: avgX,
        y: avgY,
        date: p.date,
        year: p.year,
        t: p.t,
        color: interpolateTimeGradient(p.t),
      };
    });
  }, [rawPoints]);

  // 1-Sigma Covariance Ellipses for 2002-2012 vs 2014-2024
  const { ellipse2002to2012, ellipse2014to2024, isShiftConfirmed } = useMemo(() => {
    const ptsEarly = rawPoints.filter((p) => p.year >= 2002 && p.year <= 2012.99);
    const ptsLate = rawPoints.filter((p) => p.year >= 2014 && p.year <= 2024.99);

    const e1 = computeCovarianceEllipse(ptsEarly);
    const e2 = computeCovarianceEllipse(ptsLate);

    const overlap = checkEllipsesOverlap(e1, e2);
    const shiftConfirmed = !overlap && e1 !== null && e2 !== null;

    return {
      ellipse2002to2012: e1,
      ellipse2014to2024: e2,
      isShiftConfirmed: shiftConfirmed,
    };
  }, [rawPoints]);

  // Compute bounding box
  const bounds = useMemo(() => {
    if (!rawPoints.length) {
      return { xMin: -10, xMax: 10, yMin: 0, yMax: 1, yMid: 0.5 };
    }
    const xs = rawPoints.map((p) => p.x);
    const ys = rawPoints.map((p) => p.y);

    let xMin = Math.min(...xs);
    let xMax = Math.max(...xs);
    const xSpan = Math.max(2, xMax - xMin);
    xMin = Math.floor(xMin - xSpan * 0.12);
    xMax = Math.ceil(xMax + xSpan * 0.12);

    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);
    const ySpan = Math.max(0.1, yMax - yMin);
    yMin = Math.max(0, parseFloat((yMin - ySpan * 0.12).toFixed(2)));
    yMax = Math.min(1.0, parseFloat((yMax + ySpan * 0.12).toFixed(2)));
    const yMid = parseFloat(((yMin + yMax) / 2).toFixed(3));

    return { xMin, xMax, yMin, yMax, yMid };
  }, [rawPoints]);

  if (!basin) return null;

  if (!rawPoints.length) {
    return <div className="py-2 text-caption text-ink-3">No phase data available for this basin.</div>;
  }

  // SVG dimensions
  const width = 440;
  const height = 300;
  const padding = { top: 22, right: 20, bottom: 44, left: 52 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const { xMin, xMax, yMin, yMax, yMid } = bounds;

  const mapX = (val: number) => padding.left + ((val - xMin) / (xMax - xMin)) * plotWidth;
  const mapY = (val: number) => padding.top + plotHeight - ((val - yMin) / (yMax - yMin)) * plotHeight;

  const hasZeroX = xMin <= 0 && xMax >= 0;
  const zeroXPos = hasZeroX ? mapX(0) : null;
  const zeroYPos = mapY(yMid);

  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  const xTicks = [xMin, (xMin + xMax) / 2, xMax];

  const startLabel = rawPoints[0].date.substring(0, 4);
  const endLabel = rawPoints[rawPoints.length - 1].date.substring(0, 4);
  const midLabel = rawPoints[Math.floor(rawPoints.length / 2)].date.substring(0, 4);
  const arrows = smoothedTrajectory
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i > 12 && i < smoothedTrajectory.length - 1 && i % 24 === 0);

  const hoveredPoint = hoveredIndex !== null ? rawPoints[hoveredIndex] : null;
  const quadrant = { fill: COLORS.ink3, fontSize: 11 } as const;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-body font-semibold text-ink-1">
          <RotateCw size={14} className="text-ink-2" aria-hidden="true" />
          Water storage and vegetation phase portrait
        </h4>
        <span className="text-caption text-ink-3">&Delta;TWS (cm) vs vegetation index</span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2 text-label text-ink-2">
          {bufferCollapsed ? (
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
          ) : (
            <RotateCw size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
          )}
          <p>
            {bufferCollapsed
              ? 'Inward spiral in the modelled vegetation proxy: the buffer appears to shrink (attractor collapse).'
              : 'Elliptical seasonal orbit: vegetation tracks water storage through the year (limit cycle).'}
          </p>
        </div>

        {isShiftConfirmed && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line pt-2 text-label text-ink-1">
            <span className="font-semibold">Early and recent periods do not overlap</span>
            <span className="text-caption text-ink-3">1&sigma; ellipses, 2002&ndash;2012 vs 2014&ndash;2024</span>
          </div>
        )}
      </div>

      <div className="relative flex flex-col items-center border-t border-line pt-2">
        <div className="flex w-full items-center justify-between pb-1 text-caption text-ink-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: interpolateTimeGradient(0) }} /> {startLabel} (dim)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: interpolateTimeGradient(0.5) }} /> {midLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: interpolateTimeGradient(1) }} /> {endLabel} (bright)
          </span>
        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full select-none"
          style={{ maxHeight: '320px' }}
          role="img"
          aria-label="Phase portrait of water storage anomaly against a modelled vegetation index, coloured from dim (start of record) to bright (end of record), arrows show direction of time"
        >
          {yTicks.map((tick, i) => (
            <g key={`y-${i}`}>
              <line x1={padding.left} y1={mapY(tick)} x2={padding.left + plotWidth} y2={mapY(tick)} stroke={COLORS.line} strokeDasharray="2 2" />
              <text x={padding.left - 6} y={mapY(tick) + 4} fill={COLORS.ink3} fontSize={11} textAnchor="end">
                {tick.toFixed(2)}
              </text>
            </g>
          ))}

          {xTicks.map((tick, i) => (
            <g key={`x-${i}`}>
              <line x1={mapX(tick)} y1={padding.top} x2={mapX(tick)} y2={padding.top + plotHeight} stroke={COLORS.line} strokeDasharray="2 2" />
              <text x={mapX(tick)} y={padding.top + plotHeight + 14} fill={COLORS.ink3} fontSize={11} textAnchor="middle">
                {tick.toFixed(0)}
              </text>
            </g>
          ))}

          {zeroXPos !== null && (
            <line x1={zeroXPos} y1={padding.top} x2={zeroXPos} y2={padding.top + plotHeight} stroke={COLORS.lineStrong} strokeDasharray="3 3" />
          )}

          <line x1={padding.left} y1={zeroYPos} x2={padding.left + plotWidth} y2={zeroYPos} stroke={COLORS.lineStrong} strokeDasharray="3 3" strokeOpacity={0.6} />

          <text x={padding.left + plotWidth - 6} y={padding.top + 13} textAnchor="end" {...quadrant}>
            Wetter, greener
          </text>
          <text x={padding.left + 6} y={padding.top + 13} textAnchor="start" {...quadrant}>
            Drier, greener
          </text>
          <text x={padding.left + 6} y={padding.top + plotHeight - 6} textAnchor="start" {...quadrant}>
            Drier, less green
          </text>
          <text x={padding.left + plotWidth - 6} y={padding.top + plotHeight - 6} textAnchor="end" {...quadrant}>
            Wetter, less green
          </text>

          {ellipse2002to2012 && (
            <g>
              <polygon
                points={ellipse2002to2012.polygonPoints.map((p) => `${mapX(p.x)},${mapY(p.y)}`).join(' ')}
                fill={COLORS.ink3}
                fillOpacity={0.12}
                stroke={COLORS.ink3}
                strokeWidth={1.5}
                strokeDasharray="3 2"
              />
              <text x={mapX(ellipse2002to2012.meanX)} y={mapY(ellipse2002to2012.meanY)} fill={COLORS.ink2} fontSize={11} textAnchor="middle">
                2002&ndash;2012
              </text>
            </g>
          )}

          {ellipse2014to2024 && (
            <g>
              <polygon
                points={ellipse2014to2024.polygonPoints.map((p) => `${mapX(p.x)},${mapY(p.y)}`).join(' ')}
                fill={COLORS.accent}
                fillOpacity={0.12}
                stroke={COLORS.accent}
                strokeWidth={1.5}
                strokeDasharray="3 2"
              />
              <text x={mapX(ellipse2014to2024.meanX)} y={mapY(ellipse2014to2024.meanY)} fill={COLORS.accent} fontSize={11} textAnchor="middle">
                2014&ndash;2024
              </text>
            </g>
          )}

          {rawPoints.map((p, i) => (
            <circle key={`raw-pt-${i}`} cx={mapX(p.x)} cy={mapY(p.y)} r={1.8} fill={p.color} opacity={0.3} />
          ))}

          {smoothedTrajectory.slice(0, -1).map((p, i) => {
            const next = smoothedTrajectory[i + 1];
            return (
              <line
                key={`smooth-seg-${i}`}
                x1={mapX(p.x)}
                y1={mapY(p.y)}
                x2={mapX(next.x)}
                y2={mapY(next.y)}
                stroke={p.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeOpacity={0.9}
              />
            );
          })}

          {arrows.map(({ p, i }) => {
            const n = smoothedTrajectory[i + 1];
            const ang = (Math.atan2(mapY(n.y) - mapY(p.y), mapX(n.x) - mapX(p.x)) * 180) / Math.PI;
            return (
              <polygon
                key={`arrow-${i}`}
                points="4,0 -3,3 -3,-3"
                fill={p.color}
                stroke={COLORS.canvas}
                strokeWidth={0.5}
                transform={`translate(${mapX(p.x)} ${mapY(p.y)}) rotate(${ang})`}
              />
            );
          })}

          {rawPoints.map((p, i) => {
            const isHovered = hoveredIndex === i;
            const isStart = i === 0;
            const isEnd = i === rawPoints.length - 1;

            if (!isHovered && !isStart && !isEnd && i % 4 !== 0) return null;

            return (
              <g key={`pt-${i}`} className="cursor-pointer" onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)}>
                <circle
                  cx={mapX(p.x)}
                  cy={mapY(p.y)}
                  r={isHovered ? 5.5 : isStart || isEnd ? 4 : 2.5}
                  fill={p.color}
                  stroke={isHovered ? COLORS.ink1 : COLORS.canvas}
                  strokeWidth={isHovered || isStart || isEnd ? 1.5 : 0.75}
                />
              </g>
            );
          })}

          <text x={mapX(rawPoints[0].x)} y={mapY(rawPoints[0].y) - 7} fill={COLORS.ink2} fontSize={11} fontWeight="bold" textAnchor="middle">
            {startLabel}
          </text>
          <text x={mapX(rawPoints[rawPoints.length - 1].x)} y={mapY(rawPoints[rawPoints.length - 1].y) - 7} fill={COLORS.ink1} fontSize={11} fontWeight="bold" textAnchor="middle">
            {endLabel}
          </text>

          <text x={padding.left + plotWidth / 2} y={height - 8} fill={COLORS.ink2} fontSize={11} textAnchor="middle">
            Water storage anomaly, &Delta;TWS (cm)
          </text>
          <text x={12} y={padding.top + plotHeight / 2} fill={COLORS.ink2} fontSize={11} textAnchor="middle" transform={`rotate(-90 12 ${padding.top + plotHeight / 2})`}>
            Vegetation index (modelled proxy)
          </text>
        </svg>

        <p className="mt-1 text-center text-caption text-ink-3">
          Water storage is observed (GRACE); the vegetation index is a modelled proxy. Lines are 12-month rolling means; ellipses enclose one standard deviation.
        </p>

        {hoveredPoint && (
          <div className="popover pointer-events-none absolute bottom-14 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 px-2.5 py-1 text-caption text-ink-1">
            <span className="tnum font-semibold">{hoveredPoint.date}</span>
            <span className="text-ink-3">&middot;</span>
            <span className="tnum">&Delta;TWS: {hoveredPoint.x.toFixed(1)} cm</span>
            <span className="text-ink-3">&middot;</span>
            <span className="tnum">Vegetation index: {hoveredPoint.y.toFixed(3)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
