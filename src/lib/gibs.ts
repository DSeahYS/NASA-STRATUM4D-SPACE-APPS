/**
 * NASA GIBS WMS Service Layer Catalog & Equirectangular Snapshot URL Builder
 * Stratum-4D Planetary Digital Twin
 * 
 * Direct NASA GIBS WMS endpoint (EPSG:4326) with open CORS.
 */

export const GIBS_WMS_ENDPOINT =
  "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";

export type LayerKind = "base" | "surface-temp" | "precipitation" | "grace-ewt" | "ndvi" | "AIRS_CO_500HPA" | "OMI_NO2";

export const GIBS_CO_500HPA_LAYER = {
  id: 'AIRS_CO_500HPA',
  label: 'Aqua AIRS Carbon Monoxide (5,500m / 500 hPa)',
  shortLabel: 'AIRS CO (5,500m)',
  sensor: 'NASA Aqua / AIRS L3 (500 hPa Volume Mixing Ratio)',
  wmsLayer: 'AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Daily_Day',
  fallbackWmsLayer: 'AIRS_L2_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Day',
  defaultDate: '2026-10-14', // requested date only; getAirsCoEffectiveDate() gives the date actually shown
  unit: 'ppbv (500 hPa / 5,500m)',
  colormap: 'Thermal Anomaly (Orange / Deep Red / Magenta)',
  doi: '10.5067/Aqua/AIRS/DATA301'
};

/** Archive date that the AIRS carbon-monoxide layer falls back to for recent dates. */
export const AIRS_CO_ARCHIVE_DATE = '2015-10-14';

/**
 * The date the AIRS carbon-monoxide layer actually shows for a requested date.
 * Any 2026 date, or any date after 2024-06-01, is silently replaced by AIRS_CO_ARCHIVE_DATE,
 * so imagery labelled with a recent date is really archive imagery from 14 October 2015.
 */
export const getAirsCoEffectiveDate = (dateStr: string = AIRS_CO_ARCHIVE_DATE): string =>
  dateStr.startsWith('2026') || dateStr > '2024-06-01' ? AIRS_CO_ARCHIVE_DATE : dateStr;

export const getGibsAirsCoWmsUrl = (dateStr = AIRS_CO_ARCHIVE_DATE) => {
  const effectiveDate = getAirsCoEffectiveDate(dateStr);
  return (
    `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?` +
    `SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
    `&LAYERS=AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Daily_Day` +
    `&STYLES=&FORMAT=image/png&TRANSPARENT=true` +
    `&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024` +
    `&TIME=${effectiveDate}`
  );
};

export const GIBS_OMI_NO2_LAYER = {
  id: 'OMI_NO2',
  label: 'Aura OMI Nitrogen Dioxide (Tropospheric Column)',
  shortLabel: 'OMI NO2',
  sensor: 'NASA Aura / OMI L3 Tropospheric Column',
  wmsLayer: 'OMI_Nitrogen_Dioxide_Tropo_Column',
  fallbackWmsLayer: 'OMI_NO2_Tropospheric_Column',
  defaultDate: '2024-02-15',
  unit: '10¹⁵ molec/cm²',
  colormap: 'Nitrogen Dioxide (Blue / Yellow / Red)',
  doi: '10.5067/Aura/OMI/DATA3001'
};

export const getGibsOmiNo2WmsUrl = (dateStr = '2024-02-15') =>
  `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?` +
  `SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0` +
  `&LAYERS=OMI_Nitrogen_Dioxide_Tropo_Column` +
  `&STYLES=&FORMAT=image/png&TRANSPARENT=true` +
  `&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=2048&HEIGHT=1024` +
  `&TIME=${dateStr}`;

export type AtmosphericPressureLevel = '1000hPa' | '850hPa' | '500hPa' | '250hPa';

export interface PressureLevelInfo {
  altitudeMeters: number;
  altitudeKm: number;
  altitudeLabel: string;
  description: string;
}

export const ATMOSPHERIC_PRESSURE_LEVELS: Record<AtmosphericPressureLevel, PressureLevelInfo> = {
  '1000hPa': {
    altitudeMeters: 100,
    altitudeKm: 0.1,
    altitudeLabel: 'Surface / Boundary Layer (~100m)',
    description: 'Near-surface boundary layer tracking ground-level emissions and urban heat islands.',
  },
  '850hPa': {
    altitudeMeters: 1500,
    altitudeKm: 1.5,
    altitudeLabel: 'Lower Troposphere (~1,500m)',
    description: 'Top of planetary boundary layer tracking regional advection and low-level jet streams.',
  },
  '500hPa': {
    altitudeMeters: 5500,
    altitudeKm: 5.5,
    altitudeLabel: 'Mid-Troposphere (~5,500m)',
    description: 'Mid-tropospheric steering flow and deep convective pyrocumulonimbus plume transport.',
  },
  '250hPa': {
    altitudeMeters: 10500,
    altitudeKm: 10.5,
    altitudeLabel: 'Upper Troposphere / Jet (~10,500m)',
    description: 'Upper troposphere and tropopause boundary tracing sub-polar jet stream dynamics.',
  },
};

export interface ColorbarStop {
  value: number;
  color: string;
  label: string;
}

export interface QuantitativeColorbar {
  unit: string;
  variable: string;
  min: number;
  max: number;
  stops: ColorbarStop[];
}

export interface GibsLayerDef {
  slug: string;
  gibsId: string;
  kind: LayerKind;
  format: "image/jpeg" | "image/png";
  width: number;
  height: number;
  title: string;
  badge: string;
  description: string;
  cadence: 'daily' | '8day' | 'monthly';
  minDate: string;
  tileMatrixSet: '2km' | '1km' | '500m' | '250m';
  legend: { min: string; max: string; unit: string; colors: string[] };
}

export const GIBS_LAYERS: Record<string, GibsLayerDef> = {
  "surface-temp": {
    slug: "surface-temp",
    gibsId: "VIIRS_NOAA20_Land_Surface_Temp_Day",
    kind: "surface-temp",
    format: "image/png",
    width: 2048,
    height: 1024,
    title: "VIIRS Land Surface Temperature",
    badge: "NOAA-20 VIIRS · DAYTIME LST",
    description: "Daytime radiometric land surface skin temperature. Shows planetary thermal stress and drought heating.",
    cadence: "daily",
    minDate: "2018-01-05",
    tileMatrixSet: "1km",
    legend: {
      min: "-20°C",
      max: "+50°C",
      unit: "°C",
      colors: ["#313695", "#4575b4", "#ffffbf", "#f46d43", "#a50026"],
    },
  },
  precipitation: {
    slug: "precipitation",
    gibsId: "IMERG_Precipitation_Rate",
    kind: "precipitation",
    format: "image/png",
    width: 2048,
    height: 1024,
    title: "GPM IMERG Precipitation Rate",
    badge: "NASA GPM IMERG · PRECIPITATION RATE",
    description: "Global Precipitation Measurement combined satellite microwave and infrared rain/snow rate.",
    cadence: "daily",
    minDate: "2014-03-12",
    tileMatrixSet: "2km",
    legend: {
      min: "0.1 mm/h",
      max: ">25 mm/h",
      unit: "mm/hr",
      colors: ["#0000ff", "#00ffff", "#00ff00", "#ffff00", "#ff0000", "#ff00ff"],
    },
  },
  ndvi: {
    slug: "ndvi",
    gibsId: "MODIS_Terra_NDVI_8Day",
    kind: "ndvi",
    format: "image/png",
    width: 2048,
    height: 1024,
    title: "MODIS Terra Vegetation Index (NDVI)",
    badge: "NASA MODIS TERRA · 8-DAY NDVI",
    description: "Normalized Difference Vegetation Index measuring canopy photosynthetic density and greening/browning trends.",
    cadence: "8day",
    minDate: "2025-02-12",
    tileMatrixSet: "1km",
    legend: {
      min: "0.0",
      max: "1.0",
      unit: "NDVI",
      colors: ["#d7c29e", "#e6e0a4", "#a1d99b", "#31a354", "#006d2c"],
    },
  },
  "grace-ewt": {
    slug: "grace-ewt",
    gibsId: "GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI",
    kind: "grace-ewt",
    format: "image/png",
    width: 2048,
    height: 1024,
    title: "GRACE / GRACE-FO Equivalent Water Thickness",
    badge: "NASA GRACE-FO · GRAVIMETRIC EWT",
    description: "Liquid Water Equivalent thickness anomaly showing subsurface aquifer and terrestrial water storage trends.",
    cadence: "monthly",
    minDate: "2002-04-01",
    tileMatrixSet: "2km",
    legend: {
      min: "-20 cm",
      max: "+20 cm",
      unit: "cm",
      colors: ["#d73027", "#fc8d59", "#ffffff", "#91bfdb", "#4575b4"],
    },
  },
  AIRS_CO_500HPA: {
    slug: "AIRS_CO_500HPA",
    gibsId: "AIRS_L3_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Daily_Day",
    kind: "AIRS_CO_500HPA",
    format: "image/png",
    width: 2048,
    height: 1024,
    title: "Aqua AIRS Carbon Monoxide (5,500m / 500 hPa)",
    badge: "NASA AQUA AIRS · 500 HPA CO",
    description: "Atmospheric Infrared Sounder mid-tropospheric (5,500m) carbon monoxide volume mixing ratio tracing peat fire convection.",
    cadence: "daily",
    minDate: "2002-08-30",
    tileMatrixSet: "2km",
    legend: {
      min: "50 ppbv",
      max: ">250 ppbv",
      unit: "ppbv",
      colors: ["#2c105c", "#711f81", "#b63679", "#f1605d", "#feae77", "#fcfdbf"],
    },
  },
  OMI_NO2: {
    slug: "OMI_NO2",
    gibsId: "OMI_Nitrogen_Dioxide_Tropo_Column",
    kind: "OMI_NO2",
    format: "image/png",
    width: 2048,
    height: 1024,
    title: "Aura OMI Tropospheric Nitrogen Dioxide",
    badge: "NASA AURA OMI · TROPOSPHERIC NO2",
    description: "Tropospheric nitrogen dioxide column density tracing combustion emissions and biomass burning plumes.",
    cadence: "daily",
    minDate: "2004-10-01",
    tileMatrixSet: "2km",
    legend: {
      min: "0",
      max: ">20 × 10¹⁵ molec/cm²",
      unit: "10¹⁵ molec/cm²",
      colors: ["#2c105c", "#711f81", "#b63679", "#f1605d", "#feae77", "#fcfdbf"],
    },
  },
};

export const QUANTITATIVE_COLORBARS: Record<string, QuantitativeColorbar> = {
  precipitation: {
    unit: "mm/day",
    variable: "Precipitation Rate",
    min: 0,
    max: 50,
    stops: [
      { value: 0, color: "#000033", label: "0 mm/day" },
      { value: 2, color: "#0066cc", label: "2 mm/day" },
      { value: 10, color: "#00ffff", label: "10 mm/day" },
      { value: 25, color: "#ffff00", label: "25 mm/day" },
      { value: 50, color: "#ff0000", label: "50+ mm/day" },
    ],
  },
  graceEwt: {
    unit: "cm",
    variable: "Water storage anomaly (equivalent water thickness)",
    min: -20,
    max: 20,
    stops: [
      { value: -20, color: "#d73027", label: "-20 cm" },
      { value: -10, color: "#fc8d59", label: "-10 cm" },
      { value: -2, color: "#fee090", label: "-2 cm" },
      { value: 0, color: "#ffffff", label: "0 cm" },
      { value: 2, color: "#e0f3f8", label: "+2 cm" },
      { value: 10, color: "#91bfdb", label: "+10 cm" },
      { value: 20, color: "#4575b4", label: "+20 cm" },
    ],
  },
  radiation: {
    unit: "W/m²",
    variable: "Net Surface Radiation / Outgoing Longwave",
    min: 100,
    max: 350,
    stops: [
      { value: 100, color: "#313695", label: "100 W/m²" },
      { value: 160, color: "#4575b4", label: "160 W/m²" },
      { value: 220, color: "#ffffbf", label: "220 W/m²" },
      { value: 280, color: "#f46d43", label: "280 W/m²" },
      { value: 350, color: "#a50026", label: "350 W/m²" },
    ],
  },
  ndvi: {
    unit: "NDVI",
    variable: "Normalized Difference Vegetation Index",
    min: 0.0,
    max: 1.0,
    stops: [
      { value: 0.0, color: "#d7c29e", label: "0.0 Barren" },
      { value: 0.2, color: "#e6e0a4", label: "0.2 Shrub" },
      { value: 0.4, color: "#a1d99b", label: "0.4 Grassland" },
      { value: 0.7, color: "#31a354", label: "0.7 Forest" },
      { value: 1.0, color: "#006d2c", label: "1.0 Dense Canopy" },
    ],
  },
  airsCo: {
    unit: "ppbv",
    variable: "AIRS Carbon Monoxide (500 hPa)",
    min: 50,
    max: 250,
    stops: [
      { value: 50, color: "#2c105c", label: "50 ppbv" },
      { value: 100, color: "#711f81", label: "100 ppbv" },
      { value: 150, color: "#b63679", label: "150 ppbv" },
      { value: 200, color: "#f1605d", label: "200 ppbv" },
      { value: 250, color: "#fcfdbf", label: ">250 ppbv" },
    ],
  },
  omiNo2: {
    unit: "10¹⁵ molec/cm²",
    variable: "OMI Tropospheric NO₂ Column",
    min: 0,
    max: 20,
    stops: [
      { value: 0, color: "#1a1c2e", label: "0" },
      { value: 2, color: "#2563eb", label: "2" },
      { value: 6, color: "#06b6d4", label: "6" },
      { value: 12, color: "#eab308", label: "12" },
      { value: 20, color: "#ef4444", label: ">20" },
    ],
  },
};

/**
 * Snaps any date to valid GIBS layer temporal cadence, clamping to minDate..today.
 */
export function snapGibsDate(
  dateStr: string,
  cadence: 'daily' | '8day' | 'monthly',
  minDate?: string
): string {
  const todayStr = new Date().toISOString().slice(0, 10);
  let target = dateStr.slice(0, 10);

  if (minDate && target < minDate) target = minDate;
  if (target > todayStr && parseInt(target.slice(0, 4), 10) < 2026) target = todayStr;

  const parts = target.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2] || 1;

  if (cadence === 'monthly') {
    return `${year}-${String(month).padStart(2, '0')}-01`;
  }

  if (cadence === '8day') {
    const jan1 = new Date(Date.UTC(year, 0, 1));
    const current = new Date(Date.UTC(year, month - 1, day));
    const doy = Math.floor((current.getTime() - jan1.getTime()) / 86400000) + 1;
    const snapDoy = 1 + Math.floor((doy - 1) / 8) * 8;
    const snapped = new Date(Date.UTC(year, 0, snapDoy));
    return snapped.toISOString().slice(0, 10);
  }

  return target;
}

/**
 * Builds direct NASA GIBS WMS 1.1.1 GetMap URL with cadence snapping.
 */
export function getGibsWmsUrl(
  layerId: string,
  date = "2024-02-15"
): string {
  if (layerId === 'AIRS_CO_500HPA') {
    return getGibsAirsCoWmsUrl(date);
  }
  if (layerId === 'OMI_NO2') {
    return getGibsOmiNo2WmsUrl(date);
  }
  const def = GIBS_LAYERS[layerId];
  if (!def) return "";

  const snappedDate = snapGibsDate(date, def.cadence, def.minDate);

  const params = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    LAYERS: def.gibsId,
    STYLES: "",
    SRS: "EPSG:4326",
    BBOX: "-180,-90,180,90",
    WIDTH: String(def.width),
    HEIGHT: String(def.height),
    FORMAT: def.format,
  });

  if (layerId !== 'grace-ewt') {
    params.set("TIME", snappedDate);
  }

  if (def.format === "image/png") {
    params.set("TRANSPARENT", "TRUE");
  }

  return `${GIBS_WMS_ENDPOINT}?${params.toString()}`;
}

export const buildWmsSnapshotUrl = getGibsWmsUrl;

export function getGibsDualEpochUrls(
  layerId: LayerKind,
  baselineDate: string,
  currentDate: string
): { baselineUrl: string; currentUrl: string } {
  return {
    baselineUrl: buildWmsSnapshotUrl(layerId, baselineDate),
    currentUrl: buildWmsSnapshotUrl(layerId, currentDate),
  };
}
