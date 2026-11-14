import type { BasinFeature } from '../components/Globe';
import { calculateTheilSenSlope } from './statistics';

const STORAGE_KEY_PREFIX = 'stratum4d_power_basin_v1_';
const memoryCache = new Map<string, BasinFeature>();

/**
 * Hydrates a BasinFeature on the spot with real NASA POWER (MERRA-2 / GEWEX)
 * monthly observations (2002–2024) and caches in memory + localStorage.
 */
export async function hydrateBasinOnTheSpot(
  basin: BasinFeature,
  forceRefresh: boolean = false
): Promise<BasinFeature> {
  const basinId = basin.properties.basin_id;
  if (!forceRefresh && memoryCache.has(basinId)) {
    return memoryCache.get(basinId)!;
  }

  const ts = basin.properties.time_series;
  const timestamps = ts?.timestamps || ts?.dates || [];
  if (!timestamps.length) return basin;

  // 1. Check browser localStorage cache first
  if (!forceRefresh) {
    try {
      const cachedRaw = localStorage.getItem(STORAGE_KEY_PREFIX + basinId);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        const hydrated = mergeHydratedTelemetry(basin, parsed);
        memoryCache.set(basinId, hydrated);
        return hydrated;
      }
    } catch {
      // Ignore storage quota / privacy mode errors
    }

    // If pre-hydrated in static GeoJSON and no live refresh forced, cache and return
    if (ts?.precip_anom?.length && ts?.soil_moisture?.length) {
      memoryCache.set(basinId, basin);
      return basin;
    }
  }

  // 2. Fetch live from NASA POWER Monthly API for the basin centroid
  const [lon, lat] = basin.properties.centroid;
  const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=T2M,PRECTOTCORR,GWETROOT,RH2M&community=AG&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&start=2002&end=2024&format=JSON`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`NASA POWER HTTP ${res.status}`);
    const data = await res.json();
    const param = data?.properties?.parameter;
    if (!param) throw new Error('Missing parameter block');

    const t2mMap = param.T2M || {};
    const precipMap = param.PRECTOTCORR || {};
    const soilMap = param.GWETROOT || {};
    const rhMap = param.RH2M || {};

    const vpdArr: number[] = [];
    const precipMmMo: number[] = [];
    const soilArr: number[] = [];
    const t2mArr: number[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const ym = timestamps[i].slice(0, 4) + timestamps[i].slice(5, 7);
      const t = typeof t2mMap[ym] === 'number' && t2mMap[ym] > -85 ? t2mMap[ym] : 16.0;
      const pDay = typeof precipMap[ym] === 'number' && precipMap[ym] >= 0 ? precipMap[ym] : 2.0;
      const s =
        typeof soilMap[ym] === 'number' && soilMap[ym] >= 0 && soilMap[ym] <= 1
          ? soilMap[ym]
          : (ts.soil_moisture?.[i] ?? 0.35);
      const rh = typeof rhMap[ym] === 'number' && rhMap[ym] >= 0 && rhMap[ym] <= 100 ? rhMap[ym] : 60.0;

      // Physical Tetens equation for Vapor Pressure Deficit (kPa)
      const es = 0.61078 * Math.exp((17.27 * t) / (t + 237.3));
      const vpd = Math.max(0.05, +(es * (1 - rh / 100)).toFixed(3));

      t2mArr.push(t);
      precipMmMo.push(+(pDay * 30.4375).toFixed(1));
      soilArr.push(+s.toFixed(3));
      vpdArr.push(vpd);
    }

    // Deseasonalize monthly precipitation into anomalies (mm/month)
    const monthSums = new Float64Array(12);
    const monthCounts = new Uint32Array(12);
    timestamps.forEach((d, idx) => {
      const m = (parseInt(d.slice(5, 7), 10) || 1) - 1;
      monthSums[m] += precipMmMo[idx];
      monthCounts[m] += 1;
    });
    const precipAnom = precipMmMo.map((val, idx) => {
      const m = (parseInt(timestamps[idx].slice(5, 7), 10) || 1) - 1;
      const mean = monthCounts[m] > 0 ? monthSums[m] / monthCounts[m] : 0;
      return +(val - mean).toFixed(1);
    });

    const payload = { vpdArr, precipAnom, soilArr, t2mArr };
    try {
      localStorage.setItem(STORAGE_KEY_PREFIX + basinId, JSON.stringify(payload));
    } catch {
      // Ignore quota errors
    }

    const hydrated = mergeHydratedTelemetry(basin, payload);
    memoryCache.set(basinId, hydrated);
    return hydrated;
  } catch {
    return basin;
  }
}

function mergeHydratedTelemetry(
  basin: BasinFeature,
  payload: { vpdArr: number[]; precipAnom: number[]; soilArr: number[]; t2mArr: number[] }
): BasinFeature {
  const p = basin.properties;
  const ts = p.time_series;
  const rawGrace = ts.raw || ts.swot_wse || [];

  // Derived Water-Balance Assimilated Surface WSE (no circular 0.74*rawGrace combination)
  const assimilatedSwotWse = rawGrace.map((g, i) =>
    +(g + 0.05 * (payload.precipAnom[i] || 0)).toFixed(3)
  );

  const monthsPerStep = 2;
  // Standardize precipSlope in mm/yr directly (removing magic 1200 confusion)
  const precipSlope = calculateTheilSenSlope(payload.precipAnom, monthsPerStep).slope;
  const tempSlope = calculateTheilSenSlope(payload.t2mArr, monthsPerStep).slope;
  const soilSlope = calculateTheilSenSlope(payload.soilArr, monthsPerStep).slope;

  // Normalize S_sk* if still in raw < 0.05 units from older geojson
  const rawSsk = p.triangulation?.skeletal_storativity_s_sk ?? 1.0;
  const normalizedSsk = rawSsk > 0 && rawSsk < 0.05 ? +(rawSsk / 0.002).toFixed(2) : rawSsk;

  return {
    ...basin,
    properties: {
      ...p,
      precip_slope: +precipSlope.toFixed(4),
      temp_slope: +tempSlope.toFixed(4),
      soil_slope: +soilSlope.toFixed(4),
      triangulation: p.triangulation
        ? {
            ...p.triangulation,
            skeletal_storativity_s_sk: normalizedSsk,
          }
        : undefined,
      time_series: {
        ...ts,
        raw: rawGrace,
        swot_wse: assimilatedSwotWse,
        atmospheric_vpd: payload.vpdArr,
        precip_anom: payload.precipAnom,
        soil_moisture: payload.soilArr,
      } as any,
    } as any,
  };
}
