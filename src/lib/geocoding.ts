/**
 * Offline Major Cities, Global Landmarks, and Nominatim OpenStreetMap Geocoding
 */
import { parseCoordinates } from './geo';

export interface GeocodeLocation {
  id: string;
  name: string;
  category: 'basin' | 'case' | 'landmark' | 'city' | 'coordinate';
  lat: number;
  lon: number;
  subtitle: string;
  basinId?: string;
  caseObj?: any;
  basinPair?: [string, string];
}

export const OFFLINE_LANDMARKS: GeocodeLocation[] = [
  // Major Metros & Vulnerable Regions
  { id: 'city-la', name: 'Los Angeles, California', category: 'city', lat: 34.0522, lon: -118.2437, subtitle: 'United States · Adjacent to California Central Valley' },
  { id: 'city-sf', name: 'San Francisco, California', category: 'city', lat: 37.7749, lon: -122.4194, subtitle: 'United States · Central Valley Delta' },
  { id: 'city-singapore', name: 'Singapore', category: 'city', lat: 1.3521, lon: 103.8198, subtitle: 'Equatorial Southeast Asia · Malacca Strait' },
  { id: 'city-beijing', name: 'Beijing', category: 'city', lat: 39.9042, lon: 116.4074, subtitle: 'China · Yellow River Plain / Hai River' },
  { id: 'city-shanghai', name: 'Shanghai', category: 'city', lat: 31.2304, lon: 121.4737, subtitle: 'China · Yangtze River Estuary' },
  { id: 'city-manaus', name: 'Manaus', category: 'city', lat: -3.119, lon: -60.0217, subtitle: 'Brazil · Heart of Lower Amazon Basin' },
  { id: 'city-brasilia', name: 'Brasília', category: 'city', lat: -15.7975, lon: -47.8919, subtitle: 'Brazil · São Francisco Headwaters' },
  { id: 'city-cairo', name: 'Cairo', category: 'city', lat: 30.0444, lon: 31.2357, subtitle: 'Egypt · Nile River Delta' },
  { id: 'city-newdelhi', name: 'New Delhi', category: 'city', lat: 28.6139, lon: 77.209, subtitle: 'India · Indo-Gangetic Plains' },
  { id: 'city-lahore', name: 'Lahore', category: 'city', lat: 31.5204, lon: 74.3587, subtitle: 'Pakistan · Indus River Basin Aquifer' },
  { id: 'city-baghdad', name: 'Baghdad', category: 'city', lat: 33.3152, lon: 44.3661, subtitle: 'Iraq · Tigris-Euphrates Alluvial Plain' },
  { id: 'city-london', name: 'London', category: 'city', lat: 51.5074, lon: -0.1278, subtitle: 'United Kingdom · Thames Basin' },
  { id: 'city-paris', name: 'Paris', category: 'city', lat: 48.8566, lon: 2.3522, subtitle: 'France · Seine Basin' },
  { id: 'city-berlin', name: 'Berlin', category: 'city', lat: 52.52, lon: 13.405, subtitle: 'Germany · Spree / Elbe Basin' },
  { id: 'city-tokyo', name: 'Tokyo', category: 'city', lat: 35.6762, lon: 139.6503, subtitle: 'Japan · Kanto Plain' },
  { id: 'city-sydney', name: 'Sydney', category: 'city', lat: -33.8688, lon: 151.2093, subtitle: 'Australia · Murray-Darling Margin' },
  { id: 'city-kinshasa', name: 'Kinshasa', category: 'city', lat: -4.4419, lon: 15.2663, subtitle: 'DR Congo · Congo River Pool' },
  { id: 'city-ndjamena', name: "N'Djamena", category: 'city', lat: 12.1348, lon: 15.0557, subtitle: 'Chad · Lake Chad Basin' },
  { id: 'city-jakarta', name: 'Jakarta', category: 'city', lat: -6.2088, lon: 106.8456, subtitle: 'Indonesia · Eastern Indian Ocean Dipole Pole' },
  { id: 'city-mogadishu', name: 'Mogadishu', category: 'city', lat: 2.0469, lon: 45.3182, subtitle: 'Somalia · Horn of Africa / Western IOD' },

  // Climate & Hydrological Landmarks
  { id: 'lm-lakemead', name: 'Lake Mead / Hoover Dam', category: 'landmark', lat: 36.015, lon: -114.737, subtitle: 'Nevada/Arizona · Colorado River Basin Reservoir' },
  { id: 'lm-aralsea', name: 'Aral Sea (Former)', category: 'landmark', lat: 45.0, lon: 60.0, subtitle: 'Kazakhstan/Uzbekistan · Desiccated Endorheic Basin' },
  { id: 'lm-caspian', name: 'Caspian Sea (Garabogazköl)', category: 'landmark', lat: 41.5, lon: 52.5, subtitle: 'Central Asia · Critical Endorheic Drawdown' },
  { id: 'lm-lakechad', name: 'Lake Chad', category: 'landmark', lat: 13.0, lon: 14.5, subtitle: 'Sahel, Africa · Fluctuating Terminal Lake' },
  { id: 'lm-tibet', name: 'Qinghai Lake / Tibetan Plateau', category: 'landmark', lat: 36.9, lon: 100.2, subtitle: 'China · "Third Pole" Glacial Lake Expansion' },
  { id: 'lm-thwaites', name: 'Thwaites Glacier / Pine Island', category: 'landmark', lat: -75.5, lon: -106.8, subtitle: 'West Antarctica · Amundsen Sea Grounding Line' },
  { id: 'lm-deadsea', name: 'Dead Sea', category: 'landmark', lat: 31.5, lon: 35.5, subtitle: 'Jordan/Israel · Extreme Subsurface Drawdown' },
  { id: 'lm-greatlakes', name: 'Lake Superior', category: 'landmark', lat: 47.7, lon: -87.5, subtitle: 'North America · Laurentian Great Lakes' },
  { id: 'lm-threegorges', name: 'Three Gorges Dam', category: 'landmark', lat: 30.826, lon: 111.007, subtitle: 'China · Yangtze River Megastructure' },
  { id: 'lm-greenland', name: 'Jakobshavn Glacier / Ilulissat', category: 'landmark', lat: 69.2, lon: -50.1, subtitle: 'Greenland Ice Sheet Marine Outlet' },
];

/**
 * Searches local basin catalog, case files, offline landmarks, and coordinates.
 * Prepends instant-search results from allBasins and detectiveCases / summaryMeta.dipoles_detected
 * before falling back to external geocoding.
 */
export async function searchLocations(
  query: string,
  allBasins: any[],
  detectiveCases: any[] = [],
  summaryMeta?: any
): Promise<GeocodeLocation[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: GeocodeLocation[] = [];
  const seenIds = new Set<string>();

  // 1. Direct Coordinate Parsing (e.g. "37.5, -119.5" or "37.5N, 119.5W")
  const coord = parseCoordinates(query);
  if (coord) {
    const coordId = `coord-${coord.lat.toFixed(2)}-${coord.lon.toFixed(2)}`;
    results.push({
      id: coordId,
      name: `${Math.abs(coord.lat).toFixed(2)}°${coord.lat >= 0 ? 'N' : 'S'}, ${Math.abs(coord.lon).toFixed(2)}°${coord.lon >= 0 ? 'E' : 'W'}`,
      category: 'coordinate',
      lat: coord.lat,
      lon: coord.lon,
      subtitle: 'User Specified Geographic Coordinate · Point Probe Available',
    });
    seenIds.add(coordId);
  }

  // 2. Local Basins Instant-Search (e.g. "Amazon", "Indus", "Murray-Darling", "Caspian", "California")
  const matchedBasins: { basin: any; score: number }[] = [];
  for (const b of allBasins) {
    const name = (b.properties.basin_name || '').toLowerCase();
    const id = (b.properties.basin_id || '').toLowerCase();
    const continent = (b.properties.continent || '').toLowerCase();

    let score = 0;
    if (name.startsWith(q)) score = 10;
    else if (name.includes(q)) score = 8;
    else if (id.includes(q)) score = 6;
    else if (continent.includes(q)) score = 4;

    if (score > 0) {
      matchedBasins.push({ basin: b, score });
    }
  }

  // Sort matched basins by relevance
  matchedBasins.sort((a, b) => b.score - a.score);

  for (const { basin: b } of matchedBasins) {
    const bId = `basin-${b.properties.basin_id}`;
    if (!seenIds.has(bId)) {
      seenIds.add(bId);
      const [lon, lat] = b.properties.centroid;
      const slope = b.properties.theil_sen_slope ?? 0;
      results.push({
        id: bId,
        name: b.properties.basin_name,
        category: 'basin',
        lat,
        lon,
        basinId: b.properties.basin_id,
        subtitle: `${b.properties.continent} · ${slope > 0 ? '+' : ''}${slope.toFixed(2)} cm/yr · ${b.properties.significant ? 'Significant' : 'Inconclusive'}`,
      });
    }
  }

  // 3. Local Detective Cases & Summary Dipoles (e.g. "Sierra Nevada", "ENSO", "IOD", "South American Monsoon")
  // 3A. Detective Cases Search
  for (const c of detectiveCases) {
    const title = (c.title || '').toLowerCase();
    const sub = (c.subtitle || '').toLowerCase();
    const caseNum = (c.caseNumber || '').toLowerCase();
    const bounds = (c.spatialBounds || '').toLowerCase();
    const mech = (c.driverMechanism || '').toLowerCase();

    if (
      title.includes(q) ||
      sub.includes(q) ||
      caseNum.includes(q) ||
      bounds.includes(q) ||
      mech.includes(q)
    ) {
      const caseKey = `case-${c.id}`;
      if (!seenIds.has(caseKey)) {
        seenIds.add(caseKey);
        results.push({
          id: caseKey,
          name: `${c.caseNumber}: ${c.title}`,
          category: 'case',
          lat: c.cameraCenter[1],
          lon: c.cameraCenter[0],
          subtitle: `Curated Dipole · ${c.spatialBounds || c.subtitle}`,
          caseObj: c,
          basinPair: c.regionAId && c.regionBId ? [c.regionAId, c.regionBId] : undefined,
        });
      }
    }
  }

  // 3B. Summary Meta Dipoles Search (e.g. "Sierra Nevada", "ENSO", "IOD", "South American Monsoon", "East Asian Monsoon")
  const dipolesDetected = summaryMeta?.dipoles_detected || [];
  for (const d of dipolesDetected) {
    const sys = (d.system || '').toLowerCase();
    const mech = (d.mechanism || '').toLowerCase();
    const bA = (d.basin_a || '').toLowerCase();
    const bB = (d.basin_b || '').toLowerCase();

    if (sys.includes(q) || mech.includes(q) || bA.includes(q) || bB.includes(q)) {
      const dipoleKey = `dipole-${(d.system || '').toLowerCase().replace(/\s+/g, '-')}`;
      if (!seenIds.has(dipoleKey)) {
        seenIds.add(dipoleKey);

        const featA = allBasins.find((b: any) => b.properties.basin_id === d.basin_a);
        const featB = allBasins.find((b: any) => b.properties.basin_id === d.basin_b);
        const lat = featA && featB ? (featA.properties.centroid[1] + featB.properties.centroid[1]) / 2 : (featA?.properties.centroid[1] ?? 0);
        const lon = featA && featB ? (featA.properties.centroid[0] + featB.properties.centroid[0]) / 2 : (featA?.properties.centroid[0] ?? 0);

        const matchedCase = detectiveCases.find(
          (c: any) =>
            c.regionAId === d.basin_a ||
            c.regionBId === d.basin_b ||
            (c.title || '').toLowerCase().includes(sys) ||
            (c.subtitle || '').toLowerCase().includes(sys)
        );

        results.push({
          id: dipoleKey,
          name: d.system,
          category: 'case',
          lat,
          lon,
          subtitle: [
            'Paired regions',
            typeof d.inverse_correlation_r === 'number' ? `r = ${d.inverse_correlation_r}` : null,
            typeof d.opposing_divergence === 'number' ? `rate difference ${d.opposing_divergence} cm/yr` : null,
          ]
            .filter(Boolean)
            .join(' · '),
          caseObj: matchedCase,
          basinPair: [d.basin_a, d.basin_b],
        });
      }
    }
  }

  // 4. Offline Landmarks & Metros
  for (const lm of OFFLINE_LANDMARKS) {
    if (
      lm.name.toLowerCase().includes(q) ||
      lm.subtitle.toLowerCase().includes(q)
    ) {
      if (!seenIds.has(lm.id)) {
        seenIds.add(lm.id);
        results.push(lm);
      }
    }
  }

  // 5. If few results, fetch from OpenStreetMap Nominatim with timeout as fallback
  if (results.length < 3 && q.length >= 3 && !coord) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&limit=3&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        for (const item of data) {
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          const osmId = `osm-${item.place_id}`;
          if (!seenIds.has(osmId)) {
            seenIds.add(osmId);
            results.push({
              id: osmId,
              name: item.display_name.split(',')[0],
              category: 'city',
              lat,
              lon,
              subtitle: item.display_name,
            });
          }
        }
      }
    } catch {
      // Graceful offline fallback
    }
  }

  return results.slice(0, 10);
}
