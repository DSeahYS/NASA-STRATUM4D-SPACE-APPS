export interface WindMeta {
  source: string;
  cycle: string;
  forecast_hour: number;
  generated: string;
  resolution: number;
  units: string;
}

export interface WindField {
  meta: WindMeta;
  nx: number;
  ny: number;
  lo1: number;
  la1: number;
  dx: number;
  dy: number;
  u: Float32Array;
  v: Float32Array;
  uZonalMean: Float32Array;
}

interface WindJson {
  meta: WindMeta;
  nx: number;
  ny: number;
  lo1: number;
  la1: number;
  dx: number;
  dy: number;
  u: number[] | Float32Array;
  v: number[] | Float32Array;
}

export function parseWindField(json: unknown): WindField {
  const j = json as WindJson;
  const expected = j?.nx * j?.ny;
  if (
    !j ||
    !Number.isFinite(expected) ||
    (!Array.isArray(j.u) && !(j.u instanceof Float32Array)) ||
    (!Array.isArray(j.v) && !(j.v instanceof Float32Array)) ||
    j.u.length !== expected ||
    j.v.length !== expected
  ) {
    throw new Error('Invalid wind JSON format');
  }

  const u = j.u instanceof Float32Array ? j.u : new Float32Array(j.u);
  const v = j.v instanceof Float32Array ? j.v : new Float32Array(j.v);

  // Precompute zonal mean [U](lat) for fast zonal anomaly calculation
  const nx = j.nx;
  const ny = j.ny;
  const uZonalMean = new Float32Array(ny);
  for (let r = 0; r < ny; r++) {
    let sum = 0;
    const offset = r * nx;
    for (let c = 0; c < nx; c++) {
      sum += u[offset + c];
    }
    uZonalMean[r] = sum / nx;
  }

  return {
    meta: j.meta,
    nx: j.nx,
    ny: j.ny,
    lo1: j.lo1,
    la1: j.la1,
    dx: j.dx,
    dy: j.dy,
    u,
    v,
    uZonalMean,
  };
}

/**
 * Samples wind velocity and returns zonal anomaly (Delta U = U - [U]_phi)
 */
export function sampleWind(
  field: WindField,
  lat: number,
  lon: number,
  out?: { [i: number]: number }
): number {
  const { nx, ny, lo1, la1, dx, dy, u, v, uZonalMean } = field;

  let r = (la1 - lat) / dy;
  if (r < 0) r = 0;
  else if (r > ny - 1) r = ny - 1;
  let r0 = Math.floor(r);
  if (r0 > ny - 2) r0 = ny - 2;
  const fr = r - r0;

  let c = (lon - lo1) / dx;
  c = ((c % nx) + nx) % nx;
  const c0 = Math.floor(c) % nx;
  const c1 = (c0 + 1) % nx;
  const fc = c - Math.floor(c);

  const i00 = r0 * nx + c0;
  const i01 = r0 * nx + c1;
  const i10 = (r0 + 1) * nx + c0;
  const i11 = (r0 + 1) * nx + c1;

  const w00 = (1 - fr) * (1 - fc);
  const w01 = (1 - fr) * fc;
  const w10 = fr * (1 - fc);
  const w11 = fr * fc;

  const uVal = u[i00] * w00 + u[i01] * w01 + u[i10] * w10 + u[i11] * w11;
  const vVal = v[i00] * w00 + v[i01] * w01 + v[i10] * w10 + v[i11] * w11;

  let meanU = 0;
  if (uZonalMean && uZonalMean.length === ny) {
    const nextR = r0 + 1 < ny ? r0 + 1 : r0;
    meanU = (1 - fr) * uZonalMean[r0] + fr * uZonalMean[nextR];
  }
  const zonalAnomaly = uVal - meanU;

  if (out) {
    out[0] = uVal;
    out[1] = vVal;
    out[2] = zonalAnomaly;
  }

  return zonalAnomaly;
}

const M_PER_DEG = 111_320;
const MIN_COS_LAT = 0.05;

export function advectLatLon(
  lat: number,
  lon: number,
  uMs: number,
  vMs: number,
  seconds: number,
  out: { [i: number]: number }
): void {
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), MIN_COS_LAT);
  const newLat = lat + (vMs * seconds) / M_PER_DEG;
  let newLon = lon + (uMs * seconds) / (M_PER_DEG * cosLat);
  newLon = ((((newLon + 180) % 360) + 360) % 360) - 180;
  out[0] = newLat;
  out[1] = newLon;
}
