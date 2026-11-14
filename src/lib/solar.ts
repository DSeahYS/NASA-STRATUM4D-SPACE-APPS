import { latLonToVector3, normalizeLon, type LatLon } from './geo';

const DAY_MS = 86_400_000;
const RAD2DEG = 180 / Math.PI;

export function dayOfYearUTC(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / DAY_MS) + 1;
}

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

export function fractionalYear(date: Date): number {
  const doy = dayOfYearUTC(date);
  const hours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  return (
    ((2 * Math.PI) / daysInYear(date.getUTCFullYear())) *
    (doy - 1 + (hours - 12) / 24)
  );
}

export function solarDeclination(gamma: number): number {
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  return decl * RAD2DEG;
}

export function equationOfTime(gamma: number): number {
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))
  );
}

export function subsolarPoint(date: Date): LatLon {
  const gamma = fractionalYear(date);
  const declination = solarDeclination(gamma);
  const eqTimeMin = equationOfTime(gamma);
  const utcHours =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3_600_000;
  const lon = -15 * (utcHours + eqTimeMin / 60 - 12);
  return { lat: declination, lon: normalizeLon(lon) };
}

export function sunDirection(date: Date): [number, number, number] {
  const { lat, lon } = subsolarPoint(date);
  return latLonToVector3(lat, lon, 1);
}

export function solarNoonUTC(date: Date): Date {
  const noon = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12)
  );
  const eqTimeMin = equationOfTime(fractionalYear(noon));
  return new Date(noon.getTime() - eqTimeMin * 60_000);
}
