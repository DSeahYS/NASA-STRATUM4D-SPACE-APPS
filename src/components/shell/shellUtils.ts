import { useEffect, type RefObject } from 'react';
import type { BasinFeature } from '../Globe';
import { GIBS_LAYERS, snapGibsDate, type LayerKind } from '../../lib/gibs';

/** FDR-corrected significance, the one definition the shell uses everywhere. */
export const FDR_ALPHA = 0.05;

export function isSignificant(b: BasinFeature): boolean {
  return b.properties.p_value_fdr < FDR_ALPHA;
}

/** Signed number with a real minus sign, e.g. "−1.60" or "+0.66" (one shared formatter, see lib/glossary). */
export { fmtSigned } from '../../lib/glossary';

/**
 * Trend bins used by the globe's water-storage fill (Globe.tsx, getBasinMultiVariableColor):
 * |trend| above 0.9 cm/yr is the strongest colour, 0.18 to 0.9 the moderate one, and below 0.18 neutral grey.
 */
export const TREND_STRONG = 0.9;
export const TREND_WEAK = 0.18;

/** Tailwind background class for a region swatch, matching the legend bins. Not significant uses the hatch. */
export function trendSwatchClass(b: BasinFeature): string {
  if (!isSignificant(b)) return 'hatch';
  const s = b.properties.theil_sen_slope;
  if (s <= -TREND_STRONG) return 'bg-dry-3';
  if (s <= -TREND_WEAK) return 'bg-dry-2';
  if (s >= TREND_STRONG) return 'bg-wet-3';
  if (s >= TREND_WEAK) return 'bg-wet-2';
  return 'bg-trend-zero';
}

/** "Ctrl K" on Windows and Linux, "⌘K" on Apple platforms. */
export function shortcutHint(): string {
  try {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || '';
    return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘K' : 'Ctrl K';
  } catch {
    return 'Ctrl K';
  }
}

/** Plain names for the existing layer keys. No new data: each option maps to a LayerKind that already exists. */
export interface VariableOption {
  layer: LayerKind;
  label: string;
  help: string;
  group: 'trend' | 'overlay';
}

export const VARIABLE_OPTIONS: VariableOption[] = [
  {
    layer: 'base',
    label: 'Water stored on land (GRACE)',
    help: 'Regions are coloured by their GRACE water-storage trend. No satellite overlay; the base map is Natural Earth.',
    group: 'trend',
  },
  {
    layer: 'grace-ewt',
    label: 'Water storage map (GRACE)',
    help: 'NASA GIBS image of water-storage anomaly, drawn over the region trends.',
    group: 'overlay',
  },
  {
    layer: 'surface-temp',
    label: 'Land temperature (VIIRS)',
    help: 'NASA GIBS daytime land surface temperature. Imagery starts in 2018; earlier years show the 2018 image.',
    group: 'overlay',
  },
  {
    layer: 'precipitation',
    label: 'Rainfall (GPM IMERG)',
    help: 'NASA GIBS precipitation rate. Imagery starts in 2014; earlier years show the 2014 image.',
    group: 'overlay',
  },
  {
    layer: 'ndvi',
    label: 'Vegetation (NDVI)',
    help: 'NASA GIBS vegetation greenness. Imagery starts in Feb 2025; earlier years show that image.',
    group: 'overlay',
  },
  {
    layer: 'AIRS_CO_500HPA',
    label: 'Carbon monoxide (AIRS)',
    help: 'NASA GIBS image of carbon monoxide at about 5,500 m (500 hPa).',
    group: 'overlay',
  },
  {
    layer: 'OMI_NO2',
    label: 'Nitrogen dioxide (OMI)',
    help: 'NASA GIBS image of tropospheric nitrogen dioxide.',
    group: 'overlay',
  },
];

/** Close a popover on Escape or on a pointer press outside `ref` (and outside any extra refs, such as its trigger). */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  refs: RefObject<HTMLElement | null>[]
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (refs.some((r) => r.current && r.current.contains(target))) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
    // refs are stable ref objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);
}

/** Paired regions from the data (dipole_partner_id), each pair once, the featured Sierra Nevada pair first. */
export interface RegionPair {
  a: BasinFeature;
  b: BasinFeature;
  name: string;
  mechanism?: string;
}

export const FEATURED_PAIR = ['BASIN_CALIFORNIA_CV', 'BASIN_GREAT_BASIN_EAST'] as const;

export function regionPairs(allBasins: BasinFeature[]): RegionPair[] {
  const seen = new Set<string>();
  const pairs: RegionPair[] = [];
  for (const a of allBasins) {
    const pid = a.properties.dipole_partner_id;
    if (!pid) continue;
    const key = [a.properties.basin_id, pid].sort().join('|');
    if (seen.has(key)) continue;
    const b = allBasins.find((x) => x.properties.basin_id === pid);
    if (!b) continue;
    seen.add(key);
    pairs.push({
      a,
      b,
      name: a.properties.dipole_system || `${a.properties.basin_name} and ${b.properties.basin_name}`,
      mechanism: a.properties.dipole_mechanism,
    });
  }
  const featuredKey = [...FEATURED_PAIR].sort().join('|');
  pairs.sort((p, q) => {
    const pk = [p.a.properties.basin_id, p.b.properties.basin_id].sort().join('|') === featuredKey ? 0 : 1;
    const qk = [q.a.properties.basin_id, q.b.properties.basin_id].sort().join('|') === featuredKey ? 0 : 1;
    return pk - qk;
  });
  return pairs;
}

/** The baseline date the globe's "change since the first year" mode compares against. */
export const EPOCH_BASELINE = '2003-07-15';

/**
 * The date an image layer really shows for a timeline year, after GIBS clamps to the layer's first available
 * date (same rule as the globe: year limited to 2002..2025, mid-July). AIRS carbon monoxide uses its own archive date.
 */
export function effectiveImageDate(layer: LayerKind, year: number): { date: string; clamped: boolean } | null {
  const def = layer === 'base' ? undefined : GIBS_LAYERS[layer];
  if (!def) return null;
  const wanted = `${Math.min(2025, Math.max(2002, year))}-07-15`;
  const date = snapGibsDate(wanted, def.cadence, def.minDate);
  return { date, clamped: wanted < def.minDate };
}

/** "Change since the first year" is only meaningful when the layer has imagery by the baseline date. */
export function epochDeltaSupported(layer: LayerKind): boolean {
  if (layer === 'base') return false;
  if (layer === 'AIRS_CO_500HPA') return true;
  const def = GIBS_LAYERS[layer];
  return !!def && def.minDate <= EPOCH_BASELINE;
}
