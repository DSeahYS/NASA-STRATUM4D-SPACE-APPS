const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export interface LatLon {
  lat: number;
  lon: number;
}

export function latLonToVector3(
  lat: number,
  lon: number,
  radius = 1
): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  latLonToVector3Into(lat, lon, radius, out, 0);
  return out;
}

export function latLonToVector3Into(
  lat: number,
  lon: number,
  radius: number,
  out: { [i: number]: number },
  offset = 0
): void {
  const latR = lat * DEG2RAD;
  const lonR = lon * DEG2RAD;
  const cosLat = Math.cos(latR);
  out[offset] = radius * cosLat * Math.cos(lonR);
  out[offset + 1] = radius * Math.sin(latR);
  out[offset + 2] = -radius * cosLat * Math.sin(lonR);
}

export function vector3ToLatLon(x: number, y: number, z: number): LatLon {
  const r = Math.sqrt(x * x + y * y + z * z) || 1;
  const lat = Math.asin(Math.min(1, Math.max(-1, y / r))) * RAD2DEG;
  const lon = Math.atan2(-z, x) * RAD2DEG;
  return { lat, lon: normalizeLon(lon) };
}

export function normalizeLon(lon: number): number {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (Object.is(l, -0)) l = 0;
  return l;
}

export const EARTH_MEAN_RADIUS_KM = 6371.0088;

export function greatCircleKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number | null {
  if (![lat1, lon1, lat2, lon2].every((v) => typeof v === "number" && Number.isFinite(v))) {
    return null;
  }
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MEAN_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Calculates initial bearing (azimuth in degrees 0-360) from point 1 to point 2
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = lat1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const deltaLambda = (lon2 - lon1) * DEG2RAD;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return (theta * RAD2DEG + 360) % 360;
}

/**
 * Converts azimuth degrees (0-360) to 8-point compass cardinal
 */
export function bearingToCardinal(bearing: number): string {
  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((bearing % 360) / 45)) % 8;
  return cardinals[index];
}

/**
 * 2D Ray-casting point-in-polygon algorithm
 * pt: [lon, lat], ring: array of [lon, lat]
 */
export function isPointInRing(pt: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      yi > pt[1] !== yj > pt[1] &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Point-in-polygon resolution for GeoJSON Polygon or MultiPolygon
 */
export function pointInPolygonGeometry(pt: [number, number], geometry: any): boolean {
  if (!geometry || !geometry.coordinates) return false;
  if (geometry.type === 'Polygon') {
    return isPointInRing(pt, geometry.coordinates[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      if (poly.length > 0 && isPointInRing(pt, poly[0])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Point-in-polygon check for a GeoJSON Polygon coordinates array: [exteriorRing, ...holes]
 * point: [lon, lat]
 */
export function pointInPolygon(point: [number, number], polygon: number[][][]): boolean {
  if (!polygon || polygon.length === 0) return false;
  if (!isPointInRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (isPointInRing(point, polygon[i])) return false;
  }
  return true;
}

/**
 * Find containing basin for a given [lat, lon]
 */
export function findContainingBasin<T extends { geometry: any }>(
  lat: number,
  lon: number,
  basins: T[]
): T | null {
  const pt: [number, number] = [lon, lat];
  for (const b of basins) {
    if (pointInPolygonGeometry(pt, b.geometry)) {
      return b;
    }
  }
  return null;
}

/**
 * Find nearest basin and distance/bearing from an arbitrary [lat, lon]
 */
export function findNearestBasin<T extends { properties: { centroid: [number, number]; basin_name: string } }>(
  lat: number,
  lon: number,
  basins: T[],
  maxDistanceKm?: number
): { basin: T; distanceKm: number; bearingDeg: number; cardinal: string } | null {
  if (!basins.length) return null;

  let bestBasin = basins[0];
  let minDistance = Infinity;
  let bestBearing = 0;

  for (const b of basins) {
    const [cLon, cLat] = b.properties.centroid;
    const d = greatCircleKm(lat, lon, cLat, cLon);
    if (d !== null && d < minDistance) {
      minDistance = d;
      bestBasin = b;
      bestBearing = calculateBearing(lat, lon, cLat, cLon);
    }
  }

  if (maxDistanceKm !== undefined && minDistance > maxDistanceKm) {
    return null;
  }

  return {
    basin: bestBasin,
    distanceKm: Math.round(minDistance),
    bearingDeg: Math.round(bestBearing),
    cardinal: bearingToCardinal(bestBearing),
  };
}

/**
 * Converts lat/lon in degrees to a unit 3D sphere coordinate
 */
export function latLonToUnitVector3(lat: number, lon: number): [number, number, number] {
  const DEG2RAD = Math.PI / 180;
  const latR = lat * DEG2RAD;
  const lonR = lon * DEG2RAD;
  const cosLat = Math.cos(latR);
  return [
    cosLat * Math.cos(lonR),
    Math.sin(latR),
    -cosLat * Math.sin(lonR),
  ];
}

/**
 * Spherical linear interpolation (Slerp) between two unit vectors on S^2
 */
export function slerpUnitVectors(
  v1: [number, number, number],
  v2: [number, number, number],
  t: number
): [number, number, number] {
  const dot = Math.max(-1, Math.min(1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]));
  const omega = Math.acos(dot);
  if (omega < 0.0001) {
    return [v1[0], v1[1], v1[2]];
  }
  const sinOmega = Math.sin(omega);
  if (sinOmega < 0.0001) {
    return [v1[0], v1[1], v1[2]];
  }
  const f1 = Math.sin((1 - t) * omega) / sinOmega;
  const f2 = Math.sin(t * omega) / sinOmega;
  const rx = f1 * v1[0] + f2 * v2[0];
  const ry = f1 * v1[1] + f2 * v2[1];
  const rz = f1 * v1[2] + f2 * v2[2];
  const len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
  return [rx / len, ry / len, rz / len];
}

/**
 * Subdivides a spherical triangle into smaller triangles so no edge exceeds maxArcRad
 * Recursively normalizes all interior vertices to target sphere radius R = R_earth + h_extrusion
 */
export function subdivideSphericalTriangle(
  u0: [number, number, number],
  u1: [number, number, number],
  u2: [number, number, number],
  maxArcRad = 0.043633,
  maxDepth = 4,
  legacyRadiusOrOut?: number | number[],
  legacyOutPositions?: number[]
): [number, number, number][] {
  const result: [number, number, number][] = [];

  const recurse = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    depth: number
  ) => {
    const dotAB = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const dotBC = Math.max(-1, Math.min(1, b[0] * c[0] + b[1] * c[1] + b[2] * c[2]));
    const dotCA = Math.max(-1, Math.min(1, c[0] * a[0] + c[1] * a[1] + c[2] * a[2]));

    const dAB = Math.acos(dotAB);
    const dBC = Math.acos(dotBC);
    const dCA = Math.acos(dotCA);

    if ((dAB > maxArcRad || dBC > maxArcRad || dCA > maxArcRad) && depth < maxDepth) {
      const normalize = (v: [number, number, number]): [number, number, number] => {
        const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
        return [v[0] / len, v[1] / len, v[2] / len];
      };

      const mAB = normalize([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
      const mBC = normalize([b[0] + c[0], b[1] + c[1], b[2] + c[2]]);
      const mCA = normalize([c[0] + a[0], c[1] + a[1], c[2] + a[2]]);

      recurse(a, mAB, mCA, depth + 1);
      recurse(b, mBC, mAB, depth + 1);
      recurse(c, mCA, mBC, depth + 1);
      recurse(mAB, mBC, mCA, depth + 1);
    } else {
      result.push(a, b, c);
    }
  };

  recurse(u0, u1, u2, 0);

  if (Array.isArray(legacyRadiusOrOut)) {
    for (const v of result) {
      legacyRadiusOrOut.push(v[0], v[1], v[2]);
    }
  } else if (typeof legacyRadiusOrOut === 'number' && Array.isArray(legacyOutPositions)) {
    const r = legacyRadiusOrOut;
    for (const v of result) {
      legacyOutPositions.push(v[0] * r, v[1] * r, v[2] * r);
    }
  }

  return result;
}

/**
 * Parses user coordinate strings:
 * "2.1S, 60.0W", "37.5, -119.5", "1.3521 N 103.8198 E", "lat: 34, lon: -118"
 */
export function parseCoordinates(input: string): LatLon | null {
  const s = input.trim();
  // 1. Decimal pair: "37.5, -119.5" or "37.5 -119.5"
  const decMatch = s.match(/^([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)$/);
  if (decMatch) {
    const lat = parseFloat(decMatch[1]);
    const lon = parseFloat(decMatch[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { lat, lon };
    }
  }

  // 2. Cardinal format: "2.1S, 60.0W" or "37.5N 119.5W"
  const cardMatch = s.match(/^(\d+(?:\.\d+)?)\s*([NSns])[,\s]+(\d+(?:\.\d+)?)\s*([EWew])$/);
  if (cardMatch) {
    let lat = parseFloat(cardMatch[1]);
    if (cardMatch[2].toUpperCase() === 'S') lat = -lat;
    let lon = parseFloat(cardMatch[3]);
    if (cardMatch[4].toUpperCase() === 'W') lon = -lon;
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return { lat, lon };
    }
  }

  return null;
}
