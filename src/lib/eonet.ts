/**
 * NASA Earth Observatory Natural Event Tracker (EONET) Client
 * Stratum-4D Remote Sensing & Crisis Telemetry Layer
 */

import { findContainingBasin } from './geo';
import type { BasinFeature } from '../components/Globe';

export interface EONETEvent {
  id: string;
  title: string;
  category: 'wildfires' | 'severeStorms' | 'floods' | 'drought' | 'volcanoes' | 'dustHaze' | string;
  coordinates: [number, number]; // [lon, lat]
  date: string;
  magnitudeValue?: number;
  magnitudeUnit?: string;
  sourceUrl?: string;
  nearestBasinId?: string;
  hostBasinId?: string;
  isCompoundHazard?: boolean;
  categoryId?: string;
  lat?: number;
  lon?: number;
  source?: string;
  severity?: string;
  description?: string;
  /** True for hand-written scenario or fallback events that did not come from the live NASA EONET feed. */
  curated?: boolean;
}

/**
 * Hand-written "South-East Asia October 2026" scenario events (Case 07). They are NOT from the EONET feed:
 * they are always prepended to the live feed so the case file has something to show.
 */
export const SEA_OCT_2026_EONET_EVENTS = [
  {
    id: 'EONET_SEA_2026_KALIMANTAN_PEAT',
    title: 'Curated scenario: Central Kalimantan Subsurface Peatland Smoldering Complex',
    category: 'Wildfires' as const,
    categoryId: 'wildfires',
    lat: -2.21,
    lon: 113.92,
    date: '2026-10-14T00:00:00Z',
    source: 'Curated scenario (hand-written, not from the NASA EONET feed)',
    severity: 'CRITICAL',
    description:
      'Illustrative scenario: water-table drawdown in drained peat domes can trigger underground smoldering and inject carbon monoxide (CO) high into the atmosphere.'
  },
  {
    id: 'EONET_SEA_2026_SUMATRA_PEAT',
    title: 'Curated scenario: South Sumatra & Riau Peatland Dewatering Fire Cluster',
    category: 'Wildfires' as const,
    categoryId: 'wildfires',
    lat: -2.99,
    lon: 104.76,
    date: '2026-10-14T00:00:00Z',
    source: 'Curated scenario (hand-written, not from the NASA EONET feed)',
    severity: 'CRITICAL',
    description:
      'Illustrative scenario: subsurface peat combustion feeding transboundary mid-tropospheric CO across the Strait of Malacca.'
  },
  {
    id: 'EONET_SEA_2026_MALACCA_SG_PLUME',
    title: 'Curated scenario: SE Asia 5,500m Tropospheric Carbon Monoxide Plume',
    category: 'Dust and Haze' as const,
    categoryId: 'dustHaze',
    lat: 1.35,
    lon: 103.82,
    date: '2026-10-15T00:00:00Z',
    source: 'Curated scenario (hand-written, not from the NASA EONET feed)',
    severity: 'ELEVATED',
    description:
      'Illustrative scenario: high-altitude (5,500m) carbon monoxide accumulation around 13 to 15 October 2026 across Indonesia, Malaysia and Singapore. Not a measured event.'
  }
];

export const MAPPED_SEA_OCT_2026_EVENTS: EONETEvent[] = SEA_OCT_2026_EONET_EVENTS.map((ev) => ({
  id: ev.id,
  title: ev.title,
  category: ev.category,
  categoryId: ev.categoryId,
  coordinates: [ev.lon, ev.lat],
  lat: ev.lat,
  lon: ev.lon,
  date: ev.date,
  source: ev.source,
  severity: ev.severity,
  description: ev.description,
  nearestBasinId: 'BASIN_IOD_EAST',
  curated: true,
}));

/** Curated list returned when the live feed cannot be reached; every entry carries curated: true. */
export const CURATED_EONET_EVENTS: EONETEvent[] = ([
  ...MAPPED_SEA_OCT_2026_EVENTS,
  {
    id: 'eonet-wf-01',
    title: 'Quebec Boreal Wildfire Megacomplex',
    category: 'wildfires',
    coordinates: [-74.5, 49.8],
    date: '2024-06-12',
    magnitudeValue: 4800,
    magnitudeUnit: 'km²',
    nearestBasinId: 'BASIN_OHIO',
    sourceUrl: 'https://eonet.gsfc.nasa.gov/api/v3/events',
  },
  {
    id: 'eonet-wf-02',
    title: 'Pantanal Wetland Conflagration',
    category: 'wildfires',
    coordinates: [-56.8, -17.2],
    date: '2024-07-28',
    magnitudeValue: 3200,
    magnitudeUnit: 'km²',
    nearestBasinId: 'BASIN_PARANA_LA_PLATA',
    sourceUrl: 'https://eonet.gsfc.nasa.gov/api/v3/events',
  },
  {
    id: 'eonet-wf-03',
    title: 'California Sierra / Park Wildfire',
    category: 'wildfires',
    coordinates: [-121.6, 39.8],
    date: '2024-08-04',
    magnitudeValue: 1730,
    magnitudeUnit: 'km²',
    nearestBasinId: 'BASIN_CALIFORNIA_CV',
    sourceUrl: 'https://eonet.gsfc.nasa.gov/api/v3/events',
  },
  {
    id: 'eonet-dr-01',
    title: 'Horn of Africa Mega-Drought Emergency',
    category: 'drought',
    coordinates: [44.2, 5.1],
    date: '2024-04-10',
    magnitudeValue: 5.0,
    magnitudeUnit: 'SPEI-12',
    nearestBasinId: 'BASIN_NILE',
    sourceUrl: 'https://eonet.gsfc.nasa.gov/api/v3/events',
  },
  {
    id: 'eonet-dr-02',
    title: 'Yangtze Poyang Flash Drought Crisis',
    category: 'drought',
    coordinates: [116.2, 29.1],
    date: '2024-08-15',
    magnitudeValue: 3.8,
    magnitudeUnit: 'VPD Anomaly',
    nearestBasinId: 'BASIN_YANGTZE',
    sourceUrl: 'https://eonet.gsfc.nasa.gov/api/v3/events',
  },
  {
    id: 'eonet-fl-01',
    title: 'Indus River Flash Inundation Deluge',
    category: 'floods',
    coordinates: [68.3, 27.5],
    date: '2024-09-02',
    magnitudeValue: 12500,
    magnitudeUnit: 'm³/s',
    nearestBasinId: 'BASIN_INDUS',
    sourceUrl: 'https://eonet.gsfc.nasa.gov/api/v3/events',
  },
  {
    id: 'eonet-fl-02',
    title: 'Rio Grande do Sul Extreme Flood Event',
    category: 'floods',
    coordinates: [-51.2, -30.0],
    date: '2024-05-08',
    magnitudeValue: 840,
    magnitudeUnit: 'mm/wk',
    nearestBasinId: 'BASIN_PARANA_LA_PLATA',
    sourceUrl: 'https://eonet.gsfc.nasa.gov/api/v3/events',
  },
  {
    id: 'eonet-ss-01',
    title: 'Cyclone Remal Storm Surge System',
    category: 'severeStorms',
    coordinates: [89.4, 21.8],
    date: '2024-05-26',
    magnitudeValue: 135,
    magnitudeUnit: 'km/h',
    nearestBasinId: 'BASIN_GANGES_BRAHMAPUTRA',
    sourceUrl: 'https://eonet.gsfc.nasa.gov/api/v3/events',
  },
] as EONETEvent[]).map((e): EONETEvent => ({ ...e, curated: true }));

export async function fetchActiveEONETEvents(): Promise<EONETEvent[]> {
  try {
    const res = await fetch(
      'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=30',
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) throw new Error(`EONET API HTTP ${res.status}`);
    const data = await res.json();
    if (!data.events || !Array.isArray(data.events)) return CURATED_EONET_EVENTS;

    const parsed: EONETEvent[] = [];
    for (const item of data.events) {
      const catId = item.categories?.[0]?.id;
      let category: EONETEvent['category'] = 'severeStorms';
      if (catId === 'wildfires') category = 'wildfires';
      else if (catId === 'drought') category = 'drought';
      else if (catId === 'floods') category = 'floods';
      else if (catId === 'severeStorms') category = 'severeStorms';
      else if (catId === 'volcanoes') category = 'volcanoes';
      else if (catId === 'dustHaze' || catId === 'dust-and-haze') category = 'dustHaze';

      const geometry = item.geometry?.[item.geometry.length - 1];
      if (geometry && Array.isArray(geometry.coordinates)) {
        const coords: [number, number] = [geometry.coordinates[0], geometry.coordinates[1]];
        parsed.push({
          id: item.id,
          title: item.title,
          category,
          categoryId: catId,
          coordinates: coords,
          lat: coords[1],
          lon: coords[0],
          date: geometry.date || item.geometry?.[0]?.date || new Date().toISOString(),
          magnitudeValue: geometry.magnitudeValue,
          magnitudeUnit: geometry.magnitudeUnit,
          sourceUrl: item.sources?.[0]?.url,
        });
      }
    }
    // The three curated Case 07 scenario events are always prepended; they carry curated: true.
    return [...MAPPED_SEA_OCT_2026_EVENTS, ...parsed];
  } catch {
    return CURATED_EONET_EVENTS;
  }
}

/**
 * Enriches an EONET event with its host hydrological basin and checks for compound hazard risk.
 * A compound hazard is flagged if the event occurs within a catchment undergoing statistically
 * significant terrestrial water depletion (p < 0.05 and Theil-Sen slope < 0).
 */
export function enrichEventWithBasinContext(
  event: EONETEvent,
  basins: BasinFeature[]
): EONETEvent {
  const [lon, lat] = event.coordinates;
  const host = findContainingBasin(lat, lon, basins);
  if (!host) {
    return { ...event, isCompoundHazard: false };
  }

  const p = host.properties.p_value_fdr ?? host.properties.p_value_raw ?? 1.0;
  const slope = host.properties.theil_sen_slope ?? 0.0;
  const isCompoundHazard = p < 0.05 && slope < 0;

  return {
    ...event,
    hostBasinId: host.properties.basin_id,
    nearestBasinId: event.nearestBasinId || host.properties.basin_id,
    isCompoundHazard,
  };
}

export function enrichEonetEvents(
  events: EONETEvent[],
  basins: BasinFeature[]
): EONETEvent[] {
  return events.map((e) => enrichEventWithBasinContext(e, basins));
}

