import type { BasinFeature } from '../components/Globe';

/** A label written two ways: plain language first, technical name second. */
export interface TermPair {
  plain: string;
  technical: string;
}

/** Pick the wording for the current reading mode. */
export function term(pair: TermPair, plain: boolean): string {
  return plain ? pair.plain : pair.technical;
}

export const GLOSSARY = {
  what: {
    plain: 'Water stored on land',
    technical: 'Terrestrial water storage (liquid water equivalent)',
  },
  whatNote: {
    plain: 'Weighed from orbit by NASA’s GRACE satellites, in cm of water per year.',
    technical: 'GRACE / GRACE-FO, JPL RL06.1M mascons, cm/yr',
  },
  rangeLabel: {
    plain: 'Likely range',
    technical: 'Theil-Sen slope, 95% CI',
  },
  stepChange: {
    plain: 'Step change',
    technical: 'Pettitt break',
  },
  chartTitle: {
    plain: 'Water storage with the seasons removed, cm',
    technical: 'Deseasonalised water storage, cm (liquid water equivalent)',
  },
  gap: {
    plain: 'Gap between satellites',
    technical: 'GRACE to GRACE-FO gap',
  },
} satisfies Record<string, TermPair>;

/** Region properties as stored in public/data/basins.geojson; optional fields may be absent. */
export type BasinProps = BasinFeature['properties'];

export const MINUS = '−';

/** Number with a real minus sign (U+2212) and no plus sign. Rounds to zero without a sign. */
export function fmtNum(v: number, digits = 2): string {
  const s = v.toFixed(digits);
  if (Number(s) === 0) return (0).toFixed(digits);
  return s.replace('-', MINUS);
}

/** Number with an explicit sign: "+0.66" or "−1.60". Zero carries no sign. */
export function fmtSigned(v: number, digits = 2): string {
  const s = fmtNum(v, digits);
  return v > 0 && Number(s) !== 0 ? `+${s}` : s;
}

/** Whole number with thousands separators and a real minus sign. */
export function fmtInt(v: number): string {
  const r = Math.round(v);
  if (r === 0) return '0';
  return r.toLocaleString('en-US').replace('-', MINUS);
}

/** Corrected p-value as "q = 0.031" (or "q < 0.001"). */
export function fmtQ(q: number): string {
  return q < 0.001 ? 'q < 0.001' : `q = ${q.toFixed(3)}`;
}
