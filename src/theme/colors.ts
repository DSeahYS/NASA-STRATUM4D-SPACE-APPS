/**
 * Design tokens as hex strings, for places CSS classes cannot reach:
 * Recharts props, canvas drawing and inline SVG attributes.
 * Keep in step with the @theme block in src/index.css. In JSX className, use the Tailwind utilities instead.
 */
export const COLORS = {
  canvas: '#0d1013',
  surface1: '#15191c',
  surface2: '#1e2226',
  line: '#32363a',
  lineStrong: '#494e52',
  ink1: '#eceff2',
  ink2: '#b9bec4',
  ink3: '#9399a0',
  accent: '#bbd2de',
  ok: '#59c886',
  warn: '#eab532',
  danger: '#f75d59',
  /** Data only: drying (dry) to wetting (wet). */
  dry3: '#ff6557',
  dry2: '#cd6151',
  dry1: '#966258',
  trendZero: '#494e52',
  wet1: '#517791',
  wet2: '#478cc4',
  wet3: '#4ea4f1',
} as const;

/**
 * Categorical series colours for multi-variable charts (rainfall, temperature, soil moisture, ...).
 * Deliberately not red or blue, which mean drying and wetting everywhere else. Use them in this order.
 */
export const SERIES = ['#bbd2de', '#e0a458', '#8fbf8f', '#c59ad6', '#d9c7a3'] as const;

/** Shared Recharts styling so every chart reads as one system. */
export const CHART = {
  tick: { fontSize: 11, fill: COLORS.ink3 },
  grid: COLORS.line,
  axis: COLORS.lineStrong,
  tooltip: {
    contentStyle: {
      background: COLORS.surface2,
      border: `1px solid ${COLORS.line}`,
      borderRadius: 6,
      fontSize: 12,
      color: COLORS.ink1,
    },
    labelStyle: { color: COLORS.ink2 },
    itemStyle: { color: COLORS.ink1 },
  },
} as const;

/** Red for a falling trend, blue for a rising one, grey when the sign is not known. */
export function trendColor(slope: number | null | undefined): string {
  if (slope == null || !Number.isFinite(slope) || slope === 0) return COLORS.ink3;
  return slope < 0 ? COLORS.dry3 : COLORS.wet3;
}
