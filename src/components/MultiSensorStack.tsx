import { useState, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import {
  ExternalLink,
  Layers,
  ShieldCheck,
  Sliders,
  Droplet,
  CloudRain,
  Thermometer,
  Sprout,
  Info,
  Activity,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Waves,
  Wind,
  Zap,
  Gauge,
  AlertTriangle,
  Droplets,
  Scale,
  Compass,
  Download,
  BarChart2,
  RotateCcw,
  X,
} from 'lucide-react';
import type { BasinFeature } from './Globe';
import {
  calculateTheilSenSlope,
  calculateMannKendallZ,
  calculateLinearRegressionTTest,
  calculateObservationHorizon,
  type LinearRegressionTTestResult,
  type ObservationHorizonResult,
} from '../lib/statistics';
import type { LayerKind } from '../lib/gibs';
import { CHART, COLORS, SERIES, trendColor } from '../theme/colors';

export type MonitoredVariable = 'tws' | 'precip' | 'et' | 'runoff' | 'temp' | 'soil' | 'no2';

export type ProvenanceTier = 'OBSERVED' | 'REANALYSIS' | 'SATELLITE_WMS' | 'DERIVED_PROXY';

export const CHANNEL_PROVENANCE: Record<string, { tier: ProvenanceTier; label: string; source: string; badgeClass: string }> = {
  T2M: {
    tier: 'REANALYSIS',
    label: 'Reanalysis (NASA POWER, MERRA-2)',
    source: 'NASA POWER T2M at one point per basin (0.5° × 0.625° grid)',
    badgeClass: 'tag',
  },
  PRECTOTCORR: {
    tier: 'REANALYSIS',
    label: 'Reanalysis (NASA POWER, MERRA-2)',
    source: 'NASA POWER PRECTOTCORR, a model-based estimate, not GPM IMERG',
    badgeClass: 'tag',
  },
  EVPTRNS: {
    tier: 'DERIVED_PROXY',
    label: 'Modelled proxy',
    source: 'Estimated in the browser from surface values (water balance), not a GLDAS product',
    badgeClass: 'tag tag-warn',
  },
  GWETPROF: {
    tier: 'REANALYSIS',
    label: 'Reanalysis (NASA POWER, MERRA-2)',
    source: 'NASA POWER GWETPROF (full-profile soil wetness)',
    badgeClass: 'tag',
  },
  GWETROOT: {
    tier: 'REANALYSIS',
    label: 'Reanalysis (NASA POWER, MERRA-2)',
    source: 'NASA POWER GWETROOT; synthetic fill for the Caspian and both Antarctic basins',
    badgeClass: 'tag',
  },
  NDVI: {
    tier: 'DERIVED_PROXY',
    label: 'Modelled proxy',
    source: 'Formula (seasonal cycle, GRACE-derived term and random noise), not MODIS',
    badgeClass: 'tag tag-warn',
  },
  AOD: {
    tier: 'DERIVED_PROXY',
    label: 'Modelled proxy',
    source: 'Synthetic aridity-combustion formula, not MODIS or MOPITT',
    badgeClass: 'tag tag-warn',
  },
  TWS: {
    tier: 'OBSERVED',
    label: 'Observed (GRACE / GRACE-FO, JPL RL06.1M)',
    source: 'Twin-satellite gravimetry, NASA JPL mascon solution RL06.1M',
    badgeClass: 'tag',
  },
  RUNOFF: {
    tier: 'DERIVED_PROXY',
    label: 'Modelled proxy',
    source: 'Water balance dS/dt = P - ET - Q, estimated in the browser (not SWOT or GLDAS)',
    badgeClass: 'tag tag-warn',
  },
  NO2: {
    tier: 'DERIVED_PROXY',
    label: 'Modelled proxy',
    source: 'Synthetic NO₂ / CO values, not OMI or AIRS retrievals (the globe layer is real GIBS imagery)',
    badgeClass: 'tag tag-warn',
  },
};

export const VAR_KEY_TO_PROVENANCE: Record<string, string> = {
  tws: 'TWS',
  precip: 'PRECTOTCORR',
  et: 'EVPTRNS',
  runoff: 'RUNOFF',
  temp: 'T2M',
  soil: 'GWETROOT',
  no2: 'NO2',
  s_sk: 'TWS',
  chi_hydro: 'EVPTRNS',
  TWS: 'TWS',
  PRECTOTCORR: 'PRECTOTCORR',
  EVPTRNS: 'EVPTRNS',
  RUNOFF: 'RUNOFF',
  T2M: 'T2M',
  GWETROOT: 'GWETROOT',
  GWETPROF: 'GWETPROF',
  NDVI: 'NDVI',
  AOD: 'AOD',
  NO2: 'NO2',
};

export interface MultiSensorStackProps {
  basin: BasinFeature | null;
  simulatedYear?: number;
  activeVariable?: MonitoredVariable;
  onVariableChange?: (v: MonitoredVariable) => void;
  isStudentMode?: boolean;
  onStudentModeChange?: (s: boolean) => void;
  onSelectLayer?: (layer: LayerKind) => void;
  stripSeasonality?: boolean;
  onStripSeasonalityChange?: (val: boolean) => void;
}

/**
 * Multi-Variable Seasonal Climatology Deseasonalization
 * Groups values by calendar month (parsing t.slice(5, 7)) and subtracts
 * the 12-month empirical climatological mean (Jan–Dec) plus overall mean.
 * Fixes the 2-year i % 12 bug by directly extracting true calendar months.
 */
export function removeSeasonalCycleByMonth(dates: string[], values: number[]): number[] {
  if (!dates || !values || !dates.length || !values.length) return values || [];
  const n = Math.min(dates.length, values.length);
  if (n === 0) return [];

  const monthSums = new Array<number>(12).fill(0);
  const monthCounts = new Array<number>(12).fill(0);
  let totalSum = 0;

  for (let i = 0; i < n; i++) {
    const val = values[i] ?? 0;
    totalSum += val;
    const m = parseInt(dates[i].slice(5, 7), 10) - 1;
    if (m >= 0 && m < 12) {
      monthSums[m] += val;
      monthCounts[m]++;
    }
  }

  const overallMean = totalSum / (n || 1);
  const monthMeans = monthSums.map((sum, m) => (monthCounts[m] > 0 ? sum / monthCounts[m] : overallMean));

  return values.map((val, i) => {
    const m = parseInt(dates[i].slice(5, 7), 10) - 1;
    const mMean = m >= 0 && m < 12 ? monthMeans[m] : overallMean;
    return parseFloat((val - mMean + overallMean).toFixed(3));
  });
}

/**
 * Returns catchment-appropriate monthly precipitation baseline (mm/month)
 * based on biophysical catchment properties and continent.
 */
export function getCatchmentPrecipBaseline(basin?: BasinFeature | null): number {
  if (!basin?.properties) return 65.0;
  const p = basin.properties as any;
  const id = p.basin_id || '';
  const continent = p.continent || '';
  const earthClasses: string[] = Array.isArray(p.earth_classes) ? p.earth_classes : [];

  // Polar / Cryosphere (Antarctica, Greenland)
  if (id.includes('ANTARCTICA') || id.includes('GREENLAND') || continent === 'Antarctica') {
    return 15.0;
  }
  // Arid / Desert Basins
  if (
    earthClasses.includes('DESERT') ||
    id.includes('SAHARA') ||
    id.includes('ARABIAN') ||
    id.includes('COLORADO') ||
    id.includes('GREAT_BASIN') ||
    id.includes('TARIM') ||
    id.includes('LAKE_CHAD') ||
    id.includes('INDUS')
  ) {
    return 15.0;
  }
  // Equatorial Rainforest Basins
  if (
    id.includes('AMAZON') ||
    id.includes('CONGO') ||
    id.includes('MEKONG') ||
    id.includes('IOD_EAST') ||
    id.includes('GANGES') ||
    id.includes('NIGER')
  ) {
    return 220.0;
  }
  // Subtropical / Monsoon Moderate Basins
  if (
    id.includes('YANGTZE') ||
    id.includes('PARANA') ||
    id.includes('SAO_FRANCISCO') ||
    id.includes('MISSISSIPPI') ||
    id.includes('MURRAY')
  ) {
    return 85.0;
  }
  // Boreal / Sub-Arctic Basins
  if (id.includes('LENA') || id.includes('MACKENZIE') || id.includes('OB') || id.includes('YENISEI')) {
    return 35.0;
  }
  // Temperate Default (Danube, Rhine, Columbia, Volga, etc.)
  return 65.0;
}

export type AtmosphericPressureLevel = 1000 | 850 | 500 | 250;

interface PressureLevelConfig {
  hPa: AtmosphericPressureLevel;
  label: string;
  altitudeKm: number;
  altitudeLabel: string;
  sensor: string;
  variableName: string;
  unit: string;
  description: string;
  studentDescription: string;
}

const ATM_LEVELS: Record<AtmosphericPressureLevel, PressureLevelConfig> = {
  1000: {
    hPa: 1000,
    label: 'Surface (1000 hPa)',
    altitudeKm: 0.002,
    altitudeLabel: '2m',
    sensor: 'Reanalysis (NASA POWER, MERRA-2) T2M',
    variableName: 'Surface 2m Temp',
    unit: '°C',
    description: 'Near-surface 2-meter air temperature and boundary layer VPD.',
    studentDescription: 'Ground air temperature right where we breathe and where crops grow.',
  },
  850: {
    hPa: 850,
    label: 'Lower Troposphere (850 hPa)',
    altitudeKm: 1.5,
    altitudeLabel: '1.5 km',
    sensor: 'Modelled proxy from surface T2M (not AIRS)',
    variableName: '850 hPa Temp & H2O',
    unit: '°C / g/kg',
    description: 'Top of atmospheric boundary layer; regulates convective moisture transport.',
    studentDescription: 'The height of low cumulus clouds (about 1 mile up in the sky).',
  },
  500: {
    hPa: 500,
    label: 'Mid-Troposphere (500 hPa)',
    altitudeKm: 5.5,
    altitudeLabel: '5.5 km',
    sensor: 'Modelled proxy from surface T2M (not AIRS)',
    variableName: '500 hPa CO & Winds',
    unit: 'ppbv / °C',
    description: 'Free tropospheric steering level; carries continental wildfire plumes and storms.',
    studentDescription: 'Halfway through the atmosphere (higher than Mont Blanc), where jet winds steer weather.',
  },
  250: {
    hPa: 250,
    label: 'Tropopause (250 hPa)',
    altitudeKm: 10.5,
    altitudeLabel: '10.5 km',
    sensor: 'Modelled proxy from surface T2M (not OMI)',
    variableName: '250 hPa Jet / Column NO2',
    unit: '×10¹⁵ molec/cm²',
    description: 'Cruising altitude boundary; jet stream core & stratosphere-troposphere exchange.',
    studentDescription: 'Airplane cruising altitude (35,000 ft), the cold border between clouds and outer space.',
  },
};

// Plain-English and Scientific Definitions for the Student Guide Card
export const VARIABLE_DEFINITIONS = {
  tws: {
    name: 'Total Water Storage (TWS)',
    symbol: 'ΔTWS',
    mission: 'Observed (GRACE / GRACE-FO, JPL RL06.1M)',
    plainDefinition:
      "Liquid Water Equivalent — changes in total water stored in ground, rivers, and soil measured by twin satellites feeling Earth's gravity pull.",
    studentSummary: 'Twin satellites weigh underground aquifers using subtle changes in Earth gravity.',
    icon: Droplet,
    color: COLORS.ink2,
    unit: 'cm',
  },
  precip: {
    name: 'Precipitation',
    symbol: 'P',
    mission: 'Reanalysis (NASA POWER, MERRA-2)',
    plainDefinition: 'Rain and snowfall in mm/month from NASA POWER reanalysis, a model-based estimate that blends observations. It is not raw GPM IMERG data.',
    studentSummary: 'Total rain and snowfall in millimeters per month, estimated by a NASA weather reanalysis model.',
    icon: CloudRain,
    color: COLORS.ink2,
    unit: 'mm/mo',
  },
  et: {
    name: 'Evapotranspiration (ET)',
    symbol: 'ET',
    mission: 'Modelled proxy',
    plainDefinition:
      'Water evaporating from soil and transpiring from plants back into the atmosphere. Estimated in the browser from surface temperature, VPD and the NDVI proxy, then balanced as P - dS/dt - Q.',
    studentSummary: 'Water evaporating from soil and plants sweating moisture back into rain clouds.',
    icon: Wind,
    color: COLORS.ink2,
    unit: 'mm/mo',
  },
  runoff: {
    name: 'Streamflow / Runoff (Q)',
    symbol: 'Q',
    mission: 'Modelled proxy',
    plainDefinition: 'Water draining through rivers and surface runoff out of the catchment. Not measured: it is the leftover of the water balance P - ET - dS/dt.',
    studentSummary: 'Rainwater draining across hillsides into creeks, rivers, and out to the sea.',
    icon: Waves,
    color: COLORS.ink2,
    unit: 'mm/mo',
  },
  soil: {
    name: 'Soil Moisture',
    symbol: 'θ_soil',
    mission: 'Reanalysis (NASA POWER, MERRA-2)',
    plainDefinition: 'Root-zone soil wetness (NASA POWER GWETROOT) for plant root uptake. For the Caspian and both Antarctic basins the series is a synthetic fill.',
    studentSummary: 'Moisture in topsoil that tree and crop roots drink to stay alive.',
    icon: Sprout,
    color: COLORS.ink2,
    unit: '0–1 index',
  },
  temp: {
    name: 'Surface Temp',
    symbol: 'T_2m',
    mission: 'Reanalysis (NASA POWER, MERRA-2)',
    plainDefinition: '2-meter surface air temperature from NASA POWER (MERRA-2 reanalysis). The upper-air levels (850, 500, 250 hPa) are modelled proxies computed from it.',
    studentSummary: 'Air temperature 6 feet off the ground where humans live and breathe.',
    icon: Thermometer,
    color: COLORS.ink2,
    unit: '°C',
  },
  no2: {
    name: 'Tropospheric NO2 / CO',
    symbol: 'NO₂ / CO',
    mission: 'Modelled proxy',
    plainDefinition:
      'Trace gas concentration over cities and wildfires. The values plotted here are a synthetic illustration, not OMI or AIRS retrievals; the globe layer shows real NASA imagery.',
    studentSummary: 'Air quality trace gases from factory emissions, vehicle exhaust, and wildfire smoke (illustrative values here).',
    icon: Zap,
    color: COLORS.ink2,
    unit: '×10¹⁵ molec/cm²',
  },
  s_sk: {
    name: 'Skeletal Storativity (S_sk*)',
    symbol: 'S_sk*',
    mission: 'Modelled proxy',
    plainDefinition:
      'How spongy the underground aquifer is, and whether pumping causes permanent ground collapse.',
    studentSummary: 'Checks whether empty aquifer layers bounce back or crush permanently.',
    icon: AlertTriangle,
    color: COLORS.ink2,
    unit: 'dimensionless',
  },
  chi_hydro: {
    name: 'Hydro-Evaporation Ratio (χ_hydro)',
    symbol: 'χ_hydro',
    mission: 'Derived from NASA POWER and GRACE',
    plainDefinition: 'Whether water dries up faster than rainfall can recharge it.',
    studentSummary: 'Compares if hot sunshine is evaporating water faster than rain refills it.',
    icon: Thermometer,
    color: COLORS.ink2,
    unit: 'ratio',
  },
  hamed_rao: {
    name: 'Hamed-Rao Var*(S)',
    symbol: 'Var*(S)',
    mission: 'Mann-Kendall Test',
    plainDefinition:
      'Variance inflation correction preventing normal climate cycles (like El Niño) from faking a long-term trend.',
    studentSummary: 'Strips out El Niño oscillations so temporary droughts are not mistaken for permanent.',
    icon: ShieldCheck,
    color: COLORS.ink2,
    unit: 'corrected p*',
  },
  yue_pilon: {
    name: 'Yue-Pilon ρ₁',
    symbol: 'ρ₁',
    mission: 'Pre-Whitening',
    plainDefinition:
      'Serial autocorrelation removal so the significance test is not inflated by month-to-month memory.',
    studentSummary: 'Accounts for month-to-month weather memory so short-term persistence is not counted as a long-term trend.',
    icon: Sliders,
    color: COLORS.ink2,
    unit: 'lag-1 corr',
  },
  barystatic_gmsl: {
    name: 'Barystatic GMSL',
    symbol: 'ΔGMSL',
    mission: 'Derived from the GRACE trend',
    plainDefinition:
      'Sea-level contribution in mm/yr implied by the GRACE trend of this basin (1 mm of sea level is about 361 Gt of water).',
    studentSummary: 'Approximate millimeters added to global ocean rise per year if the water lost by this basin reached the ocean.',
    icon: Compass,
    color: COLORS.ink2,
    unit: 'mm/yr',
  },
};

interface ClimateIndexRecord {
  date: string;
  mei: number;
  iod: number;
}

const CustomRibbonTooltip = ({ active, payload, unit, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="tnum z-30 px-2.5 py-1.5" style={CHART.tooltip.contentStyle}>
        <div className="mb-0.5 text-micro" style={CHART.tooltip.labelStyle}>
          {label}
        </div>
        {payload.map((p: any, idx: number) => (
          <div key={idx} className="flex items-center gap-1.5 text-caption" style={CHART.tooltip.itemStyle}>
            <span
              className="inline-block h-0.5 w-3 shrink-0"
              style={{ background: p.color || p.stroke }}
              aria-hidden="true"
            />
            <span>{p.name || 'Value'}:</span>
            <span className="font-semibold">
              {typeof p.value === 'number' ? p.value.toFixed(2) : p.value} {unit}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const signedClass = (isDrivenByWater: boolean, v: number) =>
  !isDrivenByWater || v === 0 ? 'text-ink-1' : v < 0 ? 'text-dry-3' : 'text-wet-3';

const fmtSign = (v: number) => (v > 0 ? '+' : '');

/** Source badge plus its one-line description; the honesty pass's provenance text lives here. */
function Provenance({ k }: { k: string }) {
  const p = CHANNEL_PROVENANCE[k];
  if (!p) return null;
  return (
    <div className="flex flex-col items-start gap-0.5" title={p.source}>
      <span className={p.badgeClass}>{p.label}</span>
      <span className="text-caption text-ink-3">{p.source}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-caption">
      <dt className="text-ink-2">{label}</dt>
      <dd className="tnum m-0 text-right text-ink-1">{value}</dd>
    </div>
  );
}

function ReadoutCell({
  active,
  icon,
  label,
  value,
  subLabel,
  subValue,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  value: string;
  subLabel: string;
  subValue: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-0.5 border-l-2 pl-2 ${active ? 'border-accent' : 'border-line'}`}>
      <div className="flex items-start gap-1.5 text-caption text-ink-2">
        <span className="mt-0.5 shrink-0 text-ink-3">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="tnum text-label font-semibold text-ink-1">{value}</div>
      <div className="tnum flex flex-wrap justify-between gap-x-2 text-caption text-ink-3">
        <span>{subLabel}</span>
        <span>{subValue}</span>
      </div>
    </div>
  );
}

interface LegendItem {
  label: string;
  color: string;
  dashed?: boolean;
  fade?: boolean;
}

function Ribbon({
  active,
  icon,
  title,
  unit,
  provKeys,
  note,
  extra,
  legend,
  children,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  unit: string;
  provKeys: string[];
  note?: string;
  extra?: ReactNode;
  legend: LegendItem[];
  children: ReactNode;
}) {
  return (
    <section className={`flex flex-col gap-2 border-l-2 pl-3 ${active ? 'border-accent' : 'border-transparent'}`}>
      <div className="flex flex-col gap-0.5">
        <h4 className="m-0 flex items-start gap-2 text-label font-semibold text-ink-1">
          <span className="mt-0.5 shrink-0 text-ink-2">{icon}</span>
          <span>{title}</span>
        </h4>
        <span className="tnum pl-[22px] text-caption text-ink-3">Unit: {unit}</span>
      </div>
      {provKeys.map((k) => (
        <Provenance key={k} k={k} />
      ))}
      {note && <p className="m-0 text-caption text-ink-3">{note}</p>}
      {extra && <div>{extra}</div>}
      {children}
      <ul className="m-0 flex list-none flex-wrap gap-x-3 gap-y-0.5 p-0 text-caption text-ink-3">
        {legend.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            <span
              className="inline-block w-4 shrink-0"
              style={{
                height: l.fade ? 8 : 0,
                borderTop: l.fade ? undefined : `2px ${l.dashed ? 'dashed' : 'solid'} ${l.color}`,
                background: l.fade ? `${l.color}33` : undefined,
              }}
              aria-hidden="true"
            />
            {l.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Causal Attribution Resolver
function resolveCausalAttribution(basin: BasinFeature) {
  const p = basin.properties as any;
  if (p.causal_attribution) {
    const raw = String(p.causal_attribution).toLowerCase();
    if (raw.includes('anthropogenic') || raw.includes('pumping')) {
      return {
        key: 'anthropogenic',
        title: 'Anthropogenic depletion',
        subtitle: 'Groundwater pumping exceeding natural recharge',
        twsVsDrivers: 'TWS depletion (β < -1.0) decouples from steady rainfall; consistent with pore compaction (modelled, not measured).',
        studentNote: 'Humans are pumping water out of deep wells much faster than rain clouds can refill them.',
      };
    }
    if (raw.includes('cryospheric') || raw.includes('ice') || raw.includes('glacier')) {
      return {
        key: 'cryospheric',
        title: 'Cryospheric mass loss',
        subtitle: 'Thermal ice/glacier ablation & meltwater runoff',
        twsVsDrivers: 'Secular warming drives negative surface mass balance regardless of seasonal precipitation.',
        studentNote: 'Warming air temperatures are melting glaciers and polar ice, washing water directly to the sea.',
      };
    }
    if (raw.includes('pluvial') || raw.includes('surplus')) {
      return {
        key: 'pluvial',
        title: 'Pluvial accumulation',
        subtitle: 'Intensified precipitation surplus & monsoon intensification',
        twsVsDrivers: 'Precipitation trend surge (+β_precip) drives rapid aquifer recharge & lake swelling.',
        studentNote: 'Extra rain and monsoons are filling up rivers, lakes, and underground reservoirs.',
      };
    }
    if (raw.includes('meteorological') || raw.includes('rainfall')) {
      return {
        key: 'meteorological',
        title: 'Meteorological drying',
        subtitle: 'Driven by reduced rainfall & persistent moisture divergence',
        twsVsDrivers: 'Water mass deficit correlates directly with negative precipitation trend (β_precip < 0).',
        studentNote: 'A natural drop in rainfall over several years is causing rivers and soils to dry up.',
      };
    }
  }

  // Dynamic scientific inference
  const slope = p.theil_sen_slope ?? 0;
  const isSubsidence = p.triangulation?.irreversible_subsidence || (p.triangulation?.compaction_rate_mm_yr ?? 0) > 8;
  const isPolar = ['BASIN_WEST_ANTARCTICA', 'BASIN_EAST_ANTARCTICA', 'BASIN_GREENLAND', 'BASIN_TIBETAN_PLATEAU'].includes(p.basin_id);

  if (isPolar) {
    return {
      key: 'cryospheric',
      title: 'Cryospheric mass loss',
      subtitle: 'Thermal ice/glacier ablation & meltwater discharge',
      twsVsDrivers: 'Atmospheric & oceanic warming forcing mass ablation across ice sheets and glacier headwaters.',
      studentNote: 'Glacial melting is draining frozen water out of the basin.',
    };
  }

  if (slope < -0.8 && (isSubsidence || ['BASIN_CALIFORNIA_CV', 'BASIN_INDUS', 'BASIN_NORTH_CHINA_PLAIN'].includes(p.basin_id))) {
    return {
      key: 'anthropogenic',
      title: 'Anthropogenic depletion',
      subtitle: 'Groundwater pumping exceeding natural recharge',
      twsVsDrivers: 'Severe TWS decline (-1.5 cm/yr) with inelastic subsidence while rainfall remains in normal variance.',
      studentNote: 'Intensive irrigation pumping is draining ancient underground aquifers faster than rain refills them.',
    };
  }

  if (slope < -0.2) {
    return {
      key: 'meteorological',
      title: 'Meteorological drying',
      subtitle: 'Driven by reduced rainfall & persistent atmospheric divergence',
      twsVsDrivers: 'Precipitation deficit drives catchment storage loss; deep aquifer stress lags rainfall anomaly.',
      studentNote: 'Rainfall deficits over multiple seasons are draining catchment water tables.',
    };
  }

  if (slope > 0.4) {
    return {
      key: 'pluvial',
      title: 'Pluvial accumulation',
      subtitle: 'Intensified precipitation surplus & atmospheric river convergence',
      twsVsDrivers: 'Significant positive rainfall anomaly drives multi-year terrestrial water table rise.',
      studentNote: 'Unusually heavy rainfall events are filling up lakes and raising underground water levels.',
    };
  }

  return {
    key: 'equilibrium',
    title: 'Equilibrium (natural fluctuation)',
    subtitle: 'Catchment operates within historical stationarity bounds',
    twsVsDrivers: 'TWS slope near 0.00 cm/yr; seasonal precipitation equals evapotranspiration recharge.',
    studentNote: 'Water coming in from rain equals water leaving through evaporation and rivers.',
  };
}

export default function MultiSensorStack({
  basin,
  simulatedYear = 2024,
  activeVariable: controlledVariable,
  onVariableChange,
  isStudentMode: controlledStudentMode,
  onSelectLayer,
  stripSeasonality: controlledStripSeasonality,
  onStripSeasonalityChange,
}: MultiSensorStackProps) {
  const [internalVariable, setInternalVariable] = useState<MonitoredVariable>('tws');
  const activeVar = controlledVariable ?? internalVariable;
  const setVar = (v: MonitoredVariable) => {
    if (onVariableChange) {
      onVariableChange(v);
    } else {
      setInternalVariable(v);
    }
    if (v === 'no2') {
      onSelectLayer?.('OMI_NO2');
    }
  };

  // Plain / Technical comes from the right panel header, through isStudentMode.
  const isStudent = controlledStudentMode ?? false;

  // The variable guide starts collapsed.
  const [showStudentGuide, setShowStudentGuide] = useState<boolean>(false);

  const [internalStripSeasonality, setInternalStripSeasonality] = useState(false);
  const stripSeasonality = controlledStripSeasonality !== undefined ? controlledStripSeasonality : internalStripSeasonality;
  const setStripSeasonality = (val: boolean) => {
    setInternalStripSeasonality(val);
    onStripSeasonalityChange?.(val);
  };

  const [showClimateDriver, setShowClimateDriver] = useState(false);
  const [useWaterYear, setUseWaterYear] = useState(false);
  const [showFdcView, setShowFdcView] = useState(false);
  const [atmLevel, setAtmLevel] = useState<AtmosphericPressureLevel>(1000);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [climateIndices, setClimateIndices] = useState<ClimateIndexRecord[]>([]);
  const [sliceStartYear, setSliceStartYear] = useState<number>(2002);
  const [sliceEndYear, setSliceEndYear] = useState<number>(2024);

  // Load climate oscillation indices
  useEffect(() => {
    fetch('/data/climate_indices.json')
      .then((res) => res.json())
      .then((data) => {
        if (data && Array.isArray(data.indices)) {
          setClimateIndices(data.indices);
        }
      })
      .catch((err) => console.error('Failed to load climate_indices.json:', err));
  }, []);

  const timeSeries = basin?.properties?.time_series;
  const slope = basin?.properties?.theil_sen_slope ?? 0;
  const ciLow = basin?.properties?.theil_sen_ci_low ?? 0;
  const ciHigh = basin?.properties?.theil_sen_ci_high ?? 0;

  // Process master timeline data using physical water-balance closure (dS/dt = P - ET - Q)
  const rawData = useMemo(() => {
    const timestamps = timeSeries?.timestamps || [];
    if (!timeSeries || !timestamps.length) return [];
    const ciDelta = Math.abs(ciHigh - ciLow) * 0.5;
    const n = timestamps.length;
    const pAny = (basin?.properties || {}) as any;
    const precipSlopeYr = typeof pAny.precip_slope === 'number' ? pAny.precip_slope : slope * 0.45;
    const soilSlopeYr = typeof pAny.soil_slope === 'number' ? pAny.soil_slope : slope * 0.002;
    const betaT2m = pAny.temp_slope ?? 0.025;

    // Atmospheric dynamic scaling across pressure levels:
    // 1000 hPa (Surface): 1.00 × β_T2M
    // 850 hPa (Lower Troposphere): 1.15 × β_T2M (boundary layer warming amplification)
    // 500 hPa (Mid-Troposphere): 1.25 × β_T2M (deep convective latent heating)
    // 250 hPa (Tropopause / Lower Stratosphere): -0.35 × β_T2M (greenhouse-forced stratospheric radiative cooling!)
    const verticalTrendScales: Record<AtmosphericPressureLevel, number> = {
      1000: 1.00,
      850: 1.15,
      500: 1.25,
      250: -0.35,
    };
    const vertScale = verticalTrendScales[atmLevel] ?? 1.0;

    const rawGrace = timeSeries.raw || timeSeries.swot_wse || [];
    const rawPrecipArr = (timeSeries as any).precip_anom;
    const rawT2mArr = (timeSeries as any).t2m;
    const rawSoilArr = (timeSeries as any).soil_moisture;

    const deseasArr = timestamps.map((_, i) =>
      timeSeries.deseasonalized?.[i] ?? ((rawGrace[i] ?? 0) - (timeSeries.stl_seasonal?.[i] ?? 0))
    );
    const meanDeseas = deseasArr.reduce((a, b) => a + b, 0) / (n || 1);
    const meanVpd = (timeSeries.atmospheric_vpd || []).reduce((a, b) => a + b, 0) / (n || 1);
    const precipBaseline = getCatchmentPrecipBaseline(basin);

    const intermediateRecords = timestamps.map((t, i) => {
      const swot = timeSeries.swot_wse?.[i] ?? rawGrace[i] ?? 0; // modelled proxy: GRACE + 0.05 x precipitation anomaly, not SWOT
      const grace = rawGrace[i] ?? 0; // observed GRACE / GRACE-FO
      const rawVal = rawGrace[i] ?? 0;
      const prevRaw = i > 0 ? (rawGrace[i - 1] ?? rawVal) : rawVal;

      // Monthly mass flux derivative d(TWS)/dt in mm/month: 1 cm of water = 10 mm
      const dStorageDtCm = rawVal - prevRaw;
      const dStorageDtMm = parseFloat((dStorageDtCm * 10).toFixed(1));

      const trend = timeSeries.stl_trend?.[i] ?? 0;
      const seasonal = timeSeries.stl_seasonal?.[i] ?? 0;
      const deseasonalized = deseasArr[i];
      const yearsFromMid = ((i - (n - 1) / 2) / Math.max(1, n - 1)) * 22;
      const fittedTheilSen = parseFloat((meanDeseas + slope * yearsFromMid).toFixed(3));
      const vpd = timeSeries.atmospheric_vpd?.[i] ?? 0.8;
      const ndvi = timeSeries.modis_ndvi?.[i] ?? 0.45;
      const insar = timeSeries.insar_subsidence?.[i] ?? 0;

      // True Calendar Month index (0 for Jan .. 11 for Dec) - Fixes the 2-year i % 12 bug!
      const monthIdx = Math.max(0, Math.min(11, (parseInt(t.slice(5, 7), 10) || 1) - 1));

      // Precipitation P (mm/month)
      const precipAnomaly = Array.isArray(rawPrecipArr)
        ? rawPrecipArr[i]
        : dStorageDtCm * 2.4 - (vpd - meanVpd) * 14.5 + precipSlopeYr * (yearsFromMid / 10);

      // Catchment-appropriate baseline monthly precipitation in mm/month
      const precipTotal = Math.max(
        4.0,
        parseFloat((precipBaseline + precipAnomaly + (precipBaseline * 0.22) * Math.sin((monthIdx / 12) * 2 * Math.PI)).toFixed(1))
      );

      // Surface Temp T2M (°C)
      const baseT2m = Array.isArray(rawT2mArr)
        ? rawT2mArr[i]
        : parseFloat(
            (16.0 + betaT2m * yearsFromMid + Math.sin((monthIdx / 12) * 2 * Math.PI) * 8.0).toFixed(1)
          );

      // Atmospheric altitude-dependent variance, lapse rate (-6.5°C/km), and vertical trend scaling
      const atmConfig = ATM_LEVELS[atmLevel];
      const seasonalPhase = ((monthIdx - 2) / 12) * 2 * Math.PI;
      const scaledAtmTrend = vertScale * betaT2m * yearsFromMid;

      let levelTemp = (baseT2m - betaT2m * yearsFromMid) - 6.5 * atmConfig.altitudeKm + scaledAtmTrend;
      if (atmLevel === 850) {
        levelTemp += Math.sin(seasonalPhase) * 0.8;
      } else if (atmLevel === 500) {
        // 500 hPa free-tropospheric wave dynamics (+15% seasonal swing)
        levelTemp += Math.sin(seasonalPhase) * 2.2 + ((monthIdx % 7 === 0) ? 1.4 : -0.8);
      } else if (atmLevel === 250) {
        // 250 hPa tropopause / lower stratosphere: cooling trend + Rossby wave meandering
        levelTemp += Math.sin(seasonalPhase) * 4.6 + Math.cos(seasonalPhase * 2) * 1.8;
      }
      levelTemp = parseFloat(levelTemp.toFixed(1));

      // Root-Zone Soil Moisture
      const soilMoisture = Array.isArray(rawSoilArr)
        ? rawSoilArr[i]
        : Math.max(
            0.05,
            Math.min(0.95, 0.42 + deseasonalized * 0.006 + (ndvi - 0.45) * 0.28 + soilSlopeYr * yearsFromMid)
          );

      // Physical Water-Balance Closure: dS/dt = P - ET - Q
      const potentialET = Math.max(10.0, 22.0 + Math.max(0, baseT2m) * 2.6 + vpd * 16.0);
      const etBase = Math.max(6.0, Math.min(precipTotal + 20.0, potentialET * (0.35 + 0.65 * ndvi)));

      // Runoff Q (mm/month) from water balance closure
      let runoffQ = precipTotal - etBase - dStorageDtMm;
      let actualET = etBase;
      if (runoffQ < 2.0) {
        runoffQ = Math.max(1.5, parseFloat((precipTotal * 0.12 + (ndvi > 0.5 ? 4.0 : 1.5)).toFixed(1)));
        actualET = Math.max(4.0, parseFloat((precipTotal - runoffQ - dStorageDtMm).toFixed(1)));
      } else {
        runoffQ = parseFloat(runoffQ.toFixed(1));
        actualET = parseFloat(actualET.toFixed(1));
      }
      const closureResidual = parseFloat((precipTotal - actualET - runoffQ - dStorageDtMm).toFixed(2));

      // Tropospheric NO2 / CO column density (OMI / AIRS) with altitude-dependent convective plumes & jet transport
      let no2Val = 2.9 + 0.8 * Math.cos((monthIdx / 12) * 2 * Math.PI) + Math.abs(slope) * 0.2 + (vpd > 1.2 ? 0.7 : 0);
      if (atmLevel === 1000) {
        no2Val += 0.4 * Math.sin(((monthIdx + 1) / 6) * Math.PI);
      } else if (atmLevel === 850) {
        no2Val -= 0.3;
      } else if (atmLevel === 500) {
        // 500 hPa mid-tropospheric CO convective plume spikes during dry/warm episodes
        const isConvectiveSeason = monthIdx >= 5 && monthIdx <= 9;
        const convectiveSpike = (isConvectiveSeason || vpd > 1.1) ? 1.85 + 0.9 * Math.sin(monthIdx * 1.7) : 0.2;
        no2Val = 1.6 + convectiveSpike + Math.abs(slope) * 0.35;
      } else if (atmLevel === 250) {
        // 250 hPa tropopause: lower column background, jet stream oscillations
        no2Val = 0.85 + 0.45 * Math.sin(seasonalPhase * 2) + ((monthIdx % 5 === 0) ? 0.6 : -0.2);
      }
      const no2 = parseFloat(Math.max(0.1, no2Val).toFixed(2));

      const cLow = (timeSeries as any).conf_lower?.[i] ?? (trend - ciDelta * (1 + (i / timestamps.length) * 0.8));
      const cHigh = (timeSeries as any).conf_upper?.[i] ?? (trend + ciDelta * (1 + (i / timestamps.length) * 0.8));

      // CUAHSI Water Year: Oct 1 of prior calendar year to Sep 30 of current year
      const month = parseInt(t.substring(5, 7), 10) || 1;
      const calYear = parseInt(t.substring(0, 4), 10) || 2002;
      const waterYear = month >= 10 ? calYear + 1 : calYear;
      const waterYearLabel = `WY${waterYear}`;

      return {
        date: t,
        year: calYear,
        month,
        waterYear,
        waterYearLabel,
        vpd,
        t2m: baseT2m,
        levelTemp,
        swot,
        grace,
        trend,
        deseasonalized,
        seasonal,
        fittedTheilSen,
        confLower: cLow,
        confUpper: cHigh,
        confBand: [cLow, cHigh] as [number, number],
        ndvi,
        insar,
        precip: parseFloat(precipAnomaly.toFixed(1)),
        precipTotal,
        soil: parseFloat(soilMoisture.toFixed(3)),
        et: actualET,
        runoff: runoffQ,
        dStorageDt: dStorageDtMm,
        closureResidual,
        no2,
      };
    });

    // Multi-variable seasonal climatology removal across all 7 monitored channels
    const dates = intermediateRecords.map((d) => d.date);
    const deseasTWS = removeSeasonalCycleByMonth(dates, intermediateRecords.map((d) => d.grace));
    const deseasPrecip = removeSeasonalCycleByMonth(dates, intermediateRecords.map((d) => d.precipTotal));
    const deseasET = removeSeasonalCycleByMonth(dates, intermediateRecords.map((d) => d.et));
    const deseasRunoff = removeSeasonalCycleByMonth(dates, intermediateRecords.map((d) => d.runoff));
    const deseasTemp = removeSeasonalCycleByMonth(dates, intermediateRecords.map((d) => d.levelTemp));
    const deseasSoil = removeSeasonalCycleByMonth(dates, intermediateRecords.map((d) => d.soil));
    const deseasNO2 = removeSeasonalCycleByMonth(dates, intermediateRecords.map((d) => d.no2));

    return intermediateRecords.map((d, idx) => ({
      ...d,
      deseasTWS: deseasTWS[idx],
      deseasPrecip: deseasPrecip[idx],
      deseasET: deseasET[idx],
      deseasRunoff: deseasRunoff[idx],
      deseasTemp: deseasTemp[idx],
      deseasSoil: deseasSoil[idx],
      deseasNO2: deseasNO2[idx],
    }));
  }, [timeSeries, slope, ciLow, ciHigh, basin, atmLevel]);

  // Filter data according to interactive epoch time window
  const slicedData = useMemo(() => {
    if (!rawData.length) return [];
    return rawData.filter((d) => {
      const yearToFilter = useWaterYear ? d.waterYear : d.year;
      return yearToFilter >= sliceStartYear && yearToFilter <= sliceEndYear;
    });
  }, [rawData, sliceStartYear, sliceEndYear, useWaterYear]);

  // Dynamically resolve exact bounding dates for the 2017-2018 GRACE/GRACE-FO inter-mission gap
  const graceGapBounds = useMemo(() => {
    const pts2017 = slicedData.filter((d) => d.date.startsWith('2017'));
    const pts2018 = slicedData.filter((d) => d.date.startsWith('2018'));
    if (!pts2017.length || !pts2018.length) return null;
    return {
      x1: pts2017[pts2017.length - 1].date,
      x2: pts2018[0].date,
    };
  }, [slicedData]);

  // Contiguous ENSO MEI climate oscillation intervals
  const climateBands = useMemo(() => {
    if (!showClimateDriver || !climateIndices.length || !slicedData.length) return [];
    const datesInSlice = new Set(slicedData.map((d) => d.date));
    const sortedIndices = climateIndices.filter((c) => datesInSlice.has(c.date));

    const bands: Array<{ start: string; end: string; phase: 'el_nino' | 'la_nina'; color: string; label: string }> = [];
    let currentBand: { start: string; end: string; phase: 'el_nino' | 'la_nina' } | null = null;

    for (let i = 0; i < sortedIndices.length; i++) {
      const rec = sortedIndices[i];
      const isElNino = rec.mei > 0.5;
      const isLaNina = rec.mei < -0.5;

      if (isElNino) {
        if (!currentBand || currentBand.phase !== 'el_nino') {
          if (currentBand) {
            bands.push({
              ...currentBand,
              color: currentBand.phase === 'el_nino' ? SERIES[1] : SERIES[3],
              label: currentBand.phase === 'el_nino' ? 'El Niño' : 'La Niña',
            });
          }
          currentBand = { start: rec.date, end: rec.date, phase: 'el_nino' };
        } else {
          currentBand.end = rec.date;
        }
      } else if (isLaNina) {
        if (!currentBand || currentBand.phase !== 'la_nina') {
          if (currentBand) {
            bands.push({
              ...currentBand,
              color: currentBand.phase === 'el_nino' ? SERIES[1] : SERIES[3],
              label: currentBand.phase === 'el_nino' ? 'El Niño' : 'La Niña',
            });
          }
          currentBand = { start: rec.date, end: rec.date, phase: 'la_nina' };
        } else {
          currentBand.end = rec.date;
        }
      } else {
        if (currentBand) {
          bands.push({
            ...currentBand,
            color: currentBand.phase === 'el_nino' ? SERIES[1] : SERIES[3],
            label: currentBand.phase === 'el_nino' ? 'El Niño' : 'La Niña',
          });
          currentBand = null;
        }
      }
    }
    if (currentBand) {
      bands.push({
        ...currentBand,
        color: currentBand.phase === 'el_nino' ? SERIES[1] : SERIES[3],
        label: currentBand.phase === 'el_nino' ? 'El Niño' : 'La Niña',
      });
    }

    return bands;
  }, [showClimateDriver, climateIndices, slicedData]);

  // Active Variable Metadata Configuration
  const activeVarConfig = useMemo(() => {
    switch (activeVar) {
      case 'precip':
        return {
          id: 'precip',
          name: 'Precipitation (NASA POWER)',
          unit: 'mm/mo/yr',
          rawUnit: 'mm/mo',
          getValue: (d: any) => d.precipTotal,
          getDeseas: (d: any) => d.deseasPrecip ?? d.precip,
        };
      case 'et':
        return {
          id: 'et',
          name: 'Evapotranspiration (modelled)',
          unit: 'mm/mo/yr',
          rawUnit: 'mm/mo',
          getValue: (d: any) => d.et,
          getDeseas: (d: any) => d.deseasET ?? d.et,
        };
      case 'runoff':
        return {
          id: 'runoff',
          name: 'Streamflow & Runoff (modelled)',
          unit: 'mm/mo/yr',
          rawUnit: 'mm/mo',
          getValue: (d: any) => d.runoff,
          getDeseas: (d: any) => d.deseasRunoff ?? d.runoff,
        };
      case 'temp':
        return {
          id: 'temp',
          name: `Surface / Air Temp (${atmLevel} hPa)`,
          unit: '°C/yr',
          rawUnit: '°C',
          getValue: (d: any) => d.levelTemp,
          getDeseas: (d: any) => d.deseasTemp ?? d.levelTemp,
        };
      case 'soil':
        return {
          id: 'soil',
          name: 'Root Soil Moisture (θ_soil)',
          unit: 'index/yr',
          rawUnit: '0–1 index',
          getValue: (d: any) => d.soil,
          getDeseas: (d: any) => d.deseasSoil ?? d.soil,
        };
      case 'no2':
        return {
          id: 'no2',
          name: `Tropospheric NO₂ / CO (${atmLevel} hPa, modelled)`,
          unit: '×10¹⁵ molec/yr',
          rawUnit: '×10¹⁵ molec/cm²',
          getValue: (d: any) => d.no2,
          getDeseas: (d: any) => d.deseasNO2 ?? d.no2,
        };
      case 'tws':
      default:
        return {
          id: 'tws',
          name: 'Total Water Storage (ΔTWS)',
          unit: 'cm/yr',
          rawUnit: 'cm',
          getValue: (d: any) => d.grace,
          getDeseas: (d: any) => d.deseasTWS ?? d.deseasonalized,
        };
    }
  }, [activeVar, atmLevel]);

  // Recalculate Theil-Sen, OLS t-Test, Hamed-Rao Mann-Kendall & Observation Horizon live
  const activeVarStats = useMemo(() => {
    if (!slicedData.length) {
      return {
        theilSenSlope: 0,
        ciLow: 0,
        ciHigh: 0,
        mkZ: 0,
        pStar: 1.0,
        pNaive: 1.0,
        rho1: 0,
        nStar: 0,
        vif: 1.0,
        ols: {
          slope: 0,
          intercept: 0,
          r: 0,
          r2: 0,
          se: 0,
          tStat: 0,
          pValue: 1.0,
          df: 1,
          sigmaResidual: 0,
        } as LinearRegressionTTestResult,
        obsHorizon: {
          currentMonths: 0,
          currentYears: 0,
          requiredMonths: 0,
          requiredYears: 0,
          additionalMonths: 0,
          additionalYears: 0,
          targetYear: 2024,
          currentNStar: 0,
          requiredNStar: 0,
          isDetectable: true,
        } as ObservationHorizonResult,
        fittedValues: [] as number[],
        verdict: 'INTERNAL_VARIABILITY' as const,
      };
    }

    const n = slicedData.length;
    const monthsPerStep = Math.max(1, ((sliceEndYear - sliceStartYear) * 12) / Math.max(1, n - 1));
    const dt = monthsPerStep / 12.0;

    const xYears = slicedData.map((_, i) => sliceStartYear + i * dt);
    const rawY = slicedData.map((d) => activeVarConfig.getValue(d));
    const deseasY = slicedData.map((d) => activeVarConfig.getDeseas(d));
    const targetY = stripSeasonality ? deseasY : rawY;

    // 1. Parametric: OLS + Student's t
    const ols = calculateLinearRegressionTTest(xYears, targetY);

    // 2. Non-Parametric: Theil-Sen & Mann-Kendall Z
    const ts = calculateTheilSenSlope(deseasY, monthsPerStep);
    const rho1Candidate = activeVar === 'tws' ? basin?.properties.rho_1_autocorr : undefined;
    const mkCorrected = calculateMannKendallZ(deseasY, rho1Candidate !== undefined ? { rho1: rho1Candidate } : undefined);
    const mkNaive = calculateMannKendallZ(deseasY, { rho1: 0, naive: true });

    const isFullWindowTws = activeVar === 'tws' && sliceStartYear === 2002 && sliceEndYear === 2024 && basin;
    const pStar = isFullWindowTws
      ? (basin.properties.p_value_corrected ?? basin.properties.p_value_fdr)
      : mkCorrected.p;
    const pNaive = isFullWindowTws
      ? ((basin.properties as any)?.p_value_naive ?? mkNaive.p)
      : mkNaive.p;
    const rho1 = isFullWindowTws ? (basin.properties.rho_1_autocorr ?? mkCorrected.rho1) : mkCorrected.rho1;
    const nStar = isFullWindowTws ? (basin.properties.n_star ?? mkCorrected.nStar) : mkCorrected.nStar;
    const vif = mkCorrected.varSStar / (mkCorrected.varS || 1);

    const verdict =
      pStar < 0.05
        ? 'SIGNIFICANT_TREND'
        : pNaive < 0.05 && pStar >= 0.05
        ? 'RED_NOISE_ILLUSION'
        : 'INTERNAL_VARIABILITY';

    // 3. Observation Horizon Calculation (Weatherhead et al. 1998)
    const currentMonths = Math.round(n * monthsPerStep);
    const chosenBeta = Math.abs(ts.slope) > 1e-4 ? ts.slope : (Math.abs(ols.slope) > 1e-4 ? ols.slope : 0.05);
    const obsHorizon = calculateObservationHorizon(
      currentMonths,
      sliceEndYear,
      chosenBeta,
      ols.sigmaResidual > 0.01 ? ols.sigmaResidual : 1.5,
      rho1,
      true
    );

    const fittedValues = xYears.map((x) => ols.intercept + ols.slope * x);

    return {
      theilSenSlope: isFullWindowTws ? basin.properties.theil_sen_slope : ts.slope,
      ciLow: ts.ciLow,
      ciHigh: ts.ciHigh,
      mkZ: isFullWindowTws ? basin.properties.mann_kendall_z : mkCorrected.z,
      pStar,
      pNaive,
      rho1,
      nStar,
      vif,
      ols,
      obsHorizon,
      fittedValues,
      verdict,
    };
  }, [slicedData, sliceStartYear, sliceEndYear, activeVar, activeVarConfig, stripSeasonality, basin]);

  const sliceStats = useMemo(() => {
    return {
      slope: activeVarStats.theilSenSlope,
      z: activeVarStats.mkZ,
      naiveP: activeVarStats.pNaive,
      p: activeVarStats.pStar,
      rho1: activeVarStats.rho1,
      nStar: activeVarStats.nStar,
      verdict: activeVarStats.verdict,
    };
  }, [activeVarStats]);

  // Sliced Data augmented with linear regression fit for whichever ribbon is active
  const slicedDataWithFit = useMemo(() => {
    return slicedData.map((d, i) => ({
      ...d,
      activeLinearFit: activeVarStats.fittedValues[i] !== undefined
        ? parseFloat(activeVarStats.fittedValues[i].toFixed(2))
        : null,
    }));
  }, [slicedData, activeVarStats.fittedValues]);

  // CUAHSI Flow Duration Curve (FDC) computation
  const fdcData = useMemo(() => {
    if (!slicedData.length) return [];
    const sorted = [...slicedData].map((d) => d.runoff).sort((a, b) => b - a);
    const N = sorted.length;
    return sorted.map((q, idx) => {
      const m = idx + 1;
      const pExceed = parseFloat(((m / (N + 1)) * 100).toFixed(1));
      return {
        pExceed,
        runoff: parseFloat(q.toFixed(1)),
      };
    });
  }, [slicedData]);

  const fdcPercentiles = useMemo(() => {
    if (!fdcData.length) return { q10: 0, q50: 0, q90: 0 };
    const getVal = (pTarget: number) => {
      const match = fdcData.find((d) => d.pExceed >= pTarget) || fdcData[fdcData.length - 1];
      return match ? match.runoff : 0;
    };
    return {
      q10: getVal(10),
      q50: getVal(50),
      q90: getVal(90),
    };
  }, [fdcData]);

  // Export HydroClient CSV
  const handleExportHydroCsv = () => {
    if (!slicedData.length || !basin) return;
    const headers = [
      'Date',
      'Water_Year',
      'TWS_Anomaly_cm_GRACE',
      'Precip_mm_mo',
      'ET_mm_mo',
      'Runoff_mm_mo',
      'Temp_C',
      'Soil_Wetness',
    ];
    const rows = slicedData.map((d) => [
      d.date,
      d.waterYearLabel,
      d.grace.toFixed(2),
      d.precipTotal.toFixed(1),
      d.et.toFixed(1),
      d.runoff.toFixed(1),
      d.levelTemp.toFixed(1),
      d.soil.toFixed(3),
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${basin.properties.basin_id || 'Catchment'}_HydroClient_Telemetry.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Synchronized sensor rates
  const sensorRates = useMemo(() => {
    if (slicedData.length < 2) {
      return { twsRate: slope, precipRate: 0, vpdRate: 0, ndviRate: 0, etRate: 0, runoffRate: 0 };
    }
    const monthsPerStep = Math.max(1, ((sliceEndYear - sliceStartYear) * 12) / Math.max(1, slicedData.length - 1));
    const precipVals = slicedData.map((d) => d.precip);
    const vpdVals = slicedData.map((d) => d.vpd);
    const ndviVals = slicedData.map((d) => d.ndvi);
    const etVals = slicedData.map((d) => d.et);
    const runoffVals = slicedData.map((d) => d.runoff);

    return {
      twsRate: sliceStats.slope || slope,
      precipRate: parseFloat(calculateTheilSenSlope(precipVals, monthsPerStep).slope.toFixed(2)),
      vpdRate: parseFloat(calculateTheilSenSlope(vpdVals, monthsPerStep).slope.toFixed(3)),
      ndviRate: parseFloat(calculateTheilSenSlope(ndviVals, monthsPerStep).slope.toFixed(3)),
      etRate: parseFloat(calculateTheilSenSlope(etVals, monthsPerStep).slope.toFixed(2)),
      runoffRate: parseFloat(calculateTheilSenSlope(runoffVals, monthsPerStep).slope.toFixed(2)),
    };
  }, [slicedData, sliceStartYear, sliceEndYear, sliceStats, slope]);

  // Active probed data point for simultaneous crosshair readout
  const probePoint = useMemo(() => {
    if (!slicedData.length) return null;
    if (hoveredDate) {
      const match = slicedData.find((d) => d.date === hoveredDate);
      if (match) return match;
    }
    return slicedData[slicedData.length - 1];
  }, [slicedData, hoveredDate]);

  // CUAHSI Flow Exceedance Probability calculation
  const exceedanceProbability = useMemo(() => {
    if (!probePoint || !slicedData.length) return null;
    const targetQ = probePoint.runoff;
    const sorted = slicedData.map((d) => d.runoff).sort((a, b) => b - a);
    const rank = sorted.findIndex((val) => val <= targetQ) + 1;
    const m = rank > 0 ? rank : sorted.length;
    const pWeibull = (m / (sorted.length + 1)) * 100;
    return {
      prob: parseFloat(pWeibull.toFixed(1)),
      flowClass:
        pWeibull <= 15
          ? 'High Pluvial Flow Surge (Top 15%)'
          : pWeibull >= 85
          ? 'Extreme Low Streamflow / Drought (Lowest 15%)'
          : 'Normal Hydrologic Flow Range',
      rank: m,
      total: sorted.length,
    };
  }, [probePoint, slicedData]);

  // Barystatic GMSL contribution calculation (1 mm GMSL = 361 Gt water)
  const barystaticGmslMmYr = useMemo(() => {
    if (!basin) return 0;
    const p = basin.properties as any;
    const areaKm2 = p.area_km2 || 350000;
    const twsSlopeCmYr = sliceStats.slope || p.theil_sen_slope || 0;
    // Water mass flux in Gt/yr: (twsSlope in cm / 100 = m) * (areaKm2 * 1e6 m2) * (1 Gt / 1e9 m3) = slope * area * 1e-5 Gt/yr
    const deltaMassGtYr = (twsSlopeCmYr / 100) * areaKm2 * 1e-3;
    // Terrestrial water loss (negative ΔM) directly adds freshwater mass to oceans (positive GMSL rise)
    const gmslRate = -deltaMassGtYr / 361;
    return parseFloat(gmslRate.toFixed(4));
  }, [basin, sliceStats.slope]);

  // Causal Attribution Info
  const causalInfo = useMemo(() => {
    return basin ? resolveCausalAttribution(basin) : null;
  }, [basin]);

  const playheadDate = useMemo(() => {
    if (!slicedData.length) return null;
    const match = slicedData.find((d) => (useWaterYear ? d.waterYear : d.year) === simulatedYear);
    return match ? match.date : null;
  }, [slicedData, simulatedYear, useWaterYear]);

  if (!basin || !rawData.length) {
    return <p className="m-0 text-caption text-ink-3">No sensor time series is available for this region.</p>;
  }

  const hasFit = stripSeasonality;
  const fitColor = trendColor(activeVarStats.theilSenSlope);
  const slopeClass = signedClass(activeVar === 'tws' || activeVar === 'precip' || activeVar === 'soil', activeVarStats.theilSenSlope);
  const olsSlopeClass = signedClass(activeVar === 'tws' || activeVar === 'precip' || activeVar === 'soil', activeVarStats.ols.slope);

  const chartHandlers = {
    onMouseMove: (e: any) => {
      if (e && e.activeLabel !== undefined && e.activeLabel !== null) setHoveredDate(String(e.activeLabel));
    },
    onMouseLeave: () => setHoveredDate(null),
  };

  // Shared reference marks drawn on every ribbon: ENSO bands, GRACE gap, hover and map-year lines.
  const overlays = [
    ...climateBands.map((band, idx) => (
      <ReferenceArea key={`band-${idx}`} x1={band.start} x2={band.end} fill={band.color} fillOpacity={0.14} strokeOpacity={0} />
    )),
    graceGapBounds && (
      <ReferenceArea
        key="gap"
        x1={graceGapBounds.x1}
        x2={graceGapBounds.x2}
        fill={COLORS.ink3}
        fillOpacity={0.16}
        stroke={COLORS.ink3}
        strokeOpacity={0.5}
        strokeDasharray="3 3"
      />
    ),
    hoveredDate && <ReferenceLine key="hover" x={hoveredDate} stroke={COLORS.ink3} strokeWidth={1.5} strokeDasharray="3 3" />,
    playheadDate && <ReferenceLine key="play" x={playheadDate} stroke={COLORS.accent} strokeWidth={1.5} strokeDasharray="3 3" />,
  ];

  const yAxis = (domain: any = ['auto', 'auto']) => (
    <YAxis stroke={COLORS.lineStrong} tick={CHART.tick} domain={domain} width={40} />
  );
  const grid = <CartesianGrid strokeDasharray="2 2" stroke={CHART.grid} vertical={false} />;
  const chartMargin = { top: 6, right: 8, left: 0, bottom: 2 };
  const fitLine = (name: string) => (
    <Line
      type="monotone"
      dataKey="activeLinearFit"
      name={name}
      stroke={fitColor}
      strokeWidth={2}
      strokeDasharray="4 2"
      dot={false}
      isAnimationActive={false}
    />
  );

  const windowLabel = useWaterYear ? `WY${sliceStartYear}–WY${sliceEndYear}` : `${sliceStartYear}–${sliceEndYear}`;
  const verdictText =
    activeVarStats.verdict === 'SIGNIFICANT_TREND'
      ? 'Significant after the Hamed-Rao autocorrelation correction'
      : activeVarStats.verdict === 'RED_NOISE_ILLUSION'
      ? 'The naive test is significant but the corrected test is not (autocorrelation)'
      : 'Not distinguishable from natural variability';

  const VARIABLE_CHIPS: Array<{ key: MonitoredVariable; label: string; Icon: typeof Droplet }> = [
    { key: 'tws', label: 'Water storage', Icon: Droplet },
    { key: 'precip', label: 'Rainfall', Icon: CloudRain },
    { key: 'et', label: 'Evapotranspiration', Icon: Wind },
    { key: 'runoff', label: 'Runoff', Icon: Waves },
    { key: 'temp', label: 'Temperature', Icon: Thermometer },
    { key: 'soil', label: 'Soil moisture', Icon: Sprout },
    { key: 'no2', label: 'NO₂ and CO', Icon: Zap },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Intro and provenance summary */}
      <p className="m-0 text-caption text-ink-3">
        7 channels, 1 observed. Observed: GRACE / GRACE-FO. Reanalysis: NASA POWER (MERRA-2). Modelled proxies: vegetation,
        subsidence, upper air, trace gases, water balance.
      </p>

      {/* Variable guide */}
      <section className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setShowStudentGuide(!showStudentGuide)}
          aria-expanded={showStudentGuide}
          aria-controls="sensor-stack-guide"
          className="flex min-h-[28px] w-full items-center justify-between gap-2 text-left text-ink-1"
        >
          <span className="flex items-center gap-2 text-body font-semibold">
            <BookOpen size={14} className="text-ink-2" aria-hidden="true" />
            What do these variables mean?
          </span>
          <span className="flex items-center gap-1 text-caption text-ink-3">
            {Object.keys(VARIABLE_DEFINITIONS).length} variables and metrics
            {showStudentGuide ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </span>
        </button>

        {showStudentGuide && (
          <div id="sensor-stack-guide" className="flex flex-col gap-3">
            <p className="m-0 text-caption text-ink-2">
              <strong className="font-semibold text-ink-1">Where each series comes from.</strong> Only water storage is
              observed by satellite (the GRACE twin satellites feel tiny gravity shifts that weigh aquifers). Rainfall,
              temperature and soil moisture come from NASA POWER reanalysis, a weather model that blends observations.
              Vegetation, subsidence, upper-air, trace-gas and water-balance series are modelled proxies and are tagged as
              such.
            </p>

            <div className="flex flex-col">
              {Object.entries(VARIABLE_DEFINITIONS).map(([key, item]) => {
                const IconComponent = item.icon;
                const provKey = VAR_KEY_TO_PROVENANCE[key] || key.toUpperCase();
                const prov = CHANNEL_PROVENANCE[provKey];
                return (
                  <div key={key} className="flex flex-col gap-1 border-t border-line py-2.5">
                    <h4 className="m-0 flex items-center gap-2 text-label font-semibold text-ink-1">
                      <IconComponent size={14} className="shrink-0 text-ink-2" aria-hidden="true" />
                      <span>
                        {item.name} <span className="font-normal text-ink-3">({item.symbol})</span>
                      </span>
                    </h4>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {prov && (
                        <span className={prov.badgeClass} title={prov.source}>
                          {prov.label}
                        </span>
                      )}
                      {item.mission !== prov?.label && (
                        <span className={item.mission === 'Modelled proxy' ? 'tag tag-warn' : 'tag'}>{item.mission}</span>
                      )}
                    </div>
                    {prov && <p className="m-0 text-caption text-ink-3">{prov.source}</p>}
                    <p className="m-0 text-caption text-ink-2">{item.plainDefinition}</p>
                    {isStudent && (
                      <p className="m-0 text-caption text-ink-1">
                        <strong className="font-semibold">In plain words:</strong> {item.studentSummary}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Variable stack selector */}
      <section className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="m-0 text-body font-semibold text-ink-1">Variable stack</h3>
          <span className="text-caption text-ink-3">Select a channel to highlight</span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Channel to highlight">
          {VARIABLE_CHIPS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className="chip"
              aria-pressed={activeVar === key}
              title={VARIABLE_DEFINITIONS[key].plainDefinition}
              onClick={() => setVar(key)}
            >
              <Icon size={13} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Pressure level gauge */}
      <section className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="m-0 flex items-center gap-2 text-body font-semibold text-ink-1">
            <Gauge size={14} className="text-ink-2" aria-hidden="true" />
            Pressure level and altitude
          </h3>
          <span className="tag tnum shrink-0">
            {ATM_LEVELS[atmLevel].altitudeLabel} · {atmLevel} hPa
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Atmospheric pressure level">
          {([1000, 850, 500, 250] as AtmosphericPressureLevel[]).map((level) => {
            const cfg = ATM_LEVELS[level];
            const isSelected = atmLevel === level;
            return (
              <button
                key={level}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setAtmLevel(level)}
                className={`flex flex-col gap-0.5 rounded-md border p-2 text-left ${
                  isSelected ? 'border-line-strong bg-surface-2 text-ink-1' : 'border-line text-ink-2 hover:border-line-strong'
                }`}
              >
                <span className="tnum flex items-baseline justify-between text-label font-medium">
                  <span>{level} hPa</span>
                  <span className="text-caption text-ink-3">{cfg.altitudeLabel}</span>
                </span>
                <span className="text-caption text-ink-2">{cfg.variableName}</span>
                <span className="text-caption text-ink-3">{cfg.sensor}</span>
              </button>
            );
          })}
        </div>

        <p className="m-0 text-caption text-ink-3">
          {isStudent
            ? ATM_LEVELS[atmLevel].studentDescription
            : `${ATM_LEVELS[atmLevel].description} (Lapse: T(z) = T₀ - 6.5°C/km × z)`}
        </p>
        <p className="tnum m-0 text-caption text-ink-2">Temperature at this level: {probePoint?.levelTemp ?? 0} °C</p>
      </section>

      {/* Causal attribution */}
      {causalInfo && (
        <section className="flex flex-col gap-1.5 border-t border-line pt-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="m-0 text-body font-semibold text-ink-1">{causalInfo.title}</h3>
            <span className="tag shrink-0">Causal attribution</span>
          </div>
          <p className="m-0 text-label text-ink-2">{causalInfo.subtitle}</p>
          <p className="m-0 flex items-start gap-1.5 text-caption text-ink-2">
            <Info size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-ink-1">Driver coupling: </strong>
              {causalInfo.twsVsDrivers}
            </span>
          </p>
          {isStudent && (
            <p className="m-0 text-caption text-ink-1">
              <strong className="font-semibold">In plain words:</strong> {causalInfo.studentNote}
            </p>
          )}
        </section>
      )}

      {/* Two estimators */}
      <section className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="m-0 flex items-center gap-2 text-body font-semibold text-ink-1">
              <Scale size={14} className="shrink-0 text-ink-2" aria-hidden="true" />
              Two trend estimators
            </h3>
            <span className="tnum shrink-0 text-caption text-ink-3">
              {sliceStartYear}–{sliceEndYear} ({slicedData.length} records)
            </span>
          </div>
          <p className="m-0 text-label text-ink-2">{activeVarConfig.name}</p>
          <Provenance k={VAR_KEY_TO_PROVENANCE[activeVar]} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="m-0 text-label font-semibold text-ink-1">
              Robust trend <span className="font-normal text-ink-3">(Theil-Sen, Mann-Kendall)</span>
            </h4>
            <span className={activeVarStats.pStar < 0.05 ? 'tag' : 'tag tag-warn'}>
              {activeVarStats.pStar < 0.05 ? 'p* < 0.05 (significant)' : 'p* ≥ 0.05 (not significant)'}
            </span>
          </div>
          <dl className="m-0 flex flex-col gap-1">
            <Stat
              label="Median slope (β_TS)"
              value={
                <span className={`font-semibold ${slopeClass}`}>
                  {fmtSign(activeVarStats.theilSenSlope)}
                  {activeVarStats.theilSenSlope.toFixed(3)} {activeVarConfig.unit}
                </span>
              }
            />
            <Stat
              label="95% Sen's CI"
              value={`[${activeVarStats.ciLow.toFixed(3)}, ${activeVarStats.ciHigh.toFixed(3)}]`}
            />
            <Stat
              label="Mann-Kendall Z"
              value={`Z = ${fmtSign(activeVarStats.mkZ)}${activeVarStats.mkZ.toFixed(2)}`}
            />
            <Stat
              label="Hamed-Rao corrected p*"
              value={<span className="font-semibold">p* = {activeVarStats.pStar.toFixed(4)}</span>}
            />
            <Stat
              label="Autocorrelation ρ₁ · effective N*"
              value={`${activeVarStats.rho1.toFixed(2)} · ${activeVarStats.nStar}`}
            />
          </dl>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="m-0 text-label font-semibold text-ink-1">
              Naive least squares <span className="font-normal text-ink-3">(OLS, ignores autocorrelation)</span>
            </h4>
            <span className="tag">{activeVarStats.ols.pValue < 0.05 ? 'p_t < 0.05 (naive)' : 'p_t ≥ 0.05 (naive)'}</span>
          </div>
          <dl className="m-0 flex flex-col gap-1">
            <Stat
              label="OLS slope (β_OLS)"
              value={
                <span className={`font-semibold ${olsSlopeClass}`}>
                  {fmtSign(activeVarStats.ols.slope)}
                  {activeVarStats.ols.slope.toFixed(3)} {activeVarConfig.unit}
                </span>
              }
            />
            <Stat label="Standard error SE(β)" value={`±${activeVarStats.ols.se.toFixed(4)}`} />
            <Stat
              label={`Student's t (df = ${activeVarStats.ols.df})`}
              value={`t = ${activeVarStats.ols.tStat.toFixed(2)}`}
            />
            <Stat
              label="Two-tailed p_t"
              value={<span className="font-semibold">p_t = {activeVarStats.ols.pValue.toFixed(4)}</span>}
            />
            <Stat
              label="R² · residual σ"
              value={`${(activeVarStats.ols.r2 * 100).toFixed(1)}% · ${activeVarStats.ols.sigmaResidual.toFixed(2)}`}
            />
          </dl>
        </div>
      </section>

      {/* Observation horizon, shown when the trend is not yet significant */}
      {activeVarStats.pStar >= 0.05 && (
        <section className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="m-0 flex items-center gap-2 text-body font-semibold text-ink-1">
              <AlertTriangle size={14} className="shrink-0 text-warn" aria-hidden="true" />
              Observation horizon (p &lt; 0.05 target)
            </h3>
            <span className="tag tag-warn shrink-0">Not significant yet</span>
          </div>
          <p className="m-0 text-caption text-ink-3">Emergence projection</p>

          <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="flex flex-col border-t border-line pt-2">
              <dt className="text-caption text-ink-3">Required record length (N*)</dt>
              <dd className="tnum m-0 text-label font-semibold text-ink-1">
                {activeVarStats.obsHorizon.requiredMonths} mo (~{activeVarStats.obsHorizon.requiredYears} yrs)
              </dd>
              <dd className="tnum m-0 text-caption text-ink-3">Currently: {activeVarStats.obsHorizon.currentMonths} mo</dd>
            </div>
            <div className="flex flex-col border-t border-line pt-2">
              <dt className="text-caption text-ink-3">Additional data needed</dt>
              <dd className="tnum m-0 text-label font-semibold text-ink-1">
                +{activeVarStats.obsHorizon.additionalMonths} mo (+{activeVarStats.obsHorizon.additionalYears} yrs)
              </dd>
              <dd className="m-0 text-caption text-ink-3">For p* &lt; 0.05</dd>
            </div>
            <div className="flex flex-col border-t border-line pt-2">
              <dt className="text-caption text-ink-3">Projected emergence</dt>
              <dd className="tnum m-0 text-label font-semibold text-ink-1">
                Target year: ~{activeVarStats.obsHorizon.targetYear}
              </dd>
              <dd className="m-0 text-caption text-ink-3">Weatherhead model</dd>
            </div>
            <div className="flex flex-col border-t border-line pt-2">
              <dt className="text-caption text-ink-3">Autocorrelation inflation (VIF)</dt>
              <dd className="tnum m-0 text-label font-semibold text-ink-1">{activeVarStats.vif.toFixed(2)}×</dd>
              <dd className="tnum m-0 text-caption text-ink-3">ρ₁ = {activeVarStats.rho1.toFixed(2)}</dd>
            </div>
          </dl>

          <p className="m-0 text-caption text-ink-2">
            <strong className="font-semibold text-ink-1">Signal versus noise.</strong> Because serial autocorrelation (ρ₁ ={' '}
            {activeVarStats.rho1.toFixed(2)}) inflates background variance by {activeVarStats.vif.toFixed(2)}×, this subtle
            trend (|β| = {Math.abs(activeVarStats.theilSenSlope).toFixed(3)} {activeVarConfig.unit}) is emerging from natural
            AR(1) multi-year weather memory. The observation record must extend to ~{activeVarStats.obsHorizon.targetYear} (+
            {activeVarStats.obsHorizon.additionalYears} yrs) before this signal permanently exceeds natural background noise
            at 95% confidence.
          </p>

          <div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSliceStartYear(2002);
                setSliceEndYear(2024);
              }}
            >
              <RotateCcw size={13} aria-hidden="true" />
              Reset full window (2002–2024)
            </button>
          </div>
        </section>
      )}

      {/* Time window, benchmarks and export */}
      <section className="flex flex-col gap-3 border-t border-line pt-4">
        <h3 className="m-0 flex items-center gap-2 text-body font-semibold text-ink-1">
          <Sliders size={14} className="text-ink-2" aria-hidden="true" />
          Time window and hydrology benchmarks
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="group" aria-label="Year convention" title="CUAHSI Water Year mode bins data from Oct 1 to Sep 30 instead of calendar year">
            <button type="button" className="seg-item" aria-pressed={!useWaterYear} onClick={() => setUseWaterYear(false)}>
              Calendar year
            </button>
            <button type="button" className="seg-item" aria-pressed={useWaterYear} onClick={() => setUseWaterYear(true)}>
              Water year
            </button>
          </div>
          <button
            type="button"
            className="chip"
            aria-pressed={showFdcView}
            onClick={() => setShowFdcView(!showFdcView)}
            title="Toggle CUAHSI Flow Duration Curve (FDC) showing discharge exceedance probabilities"
          >
            <BarChart2 size={13} aria-hidden="true" />
            Flow duration curve
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={showClimateDriver}
            onClick={() => setShowClimateDriver(!showClimateDriver)}
            title="Overlay historical El Niño and La Niña ENSO MEI.v2 / IOD bands"
          >
            El Niño / La Niña
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleExportHydroCsv}
            title="Download clean HydroClient CSV data export"
          >
            <Download size={13} aria-hidden="true" />
            Export CSV
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="tnum text-caption text-ink-3">2002</span>
          <div className="flex flex-1 gap-2">
            <input
              type="range"
              aria-label="Window start year"
              min="2002"
              max={sliceEndYear - 2}
              value={sliceStartYear}
              onChange={(e) => setSliceStartYear(parseInt(e.target.value, 10))}
              className="h-6 min-w-0 flex-1 cursor-pointer accent-accent"
            />
            <input
              type="range"
              aria-label="Window end year"
              min={sliceStartYear + 2}
              max="2024"
              value={sliceEndYear}
              onChange={(e) => setSliceEndYear(parseInt(e.target.value, 10))}
              className="h-6 min-w-0 flex-1 cursor-pointer accent-accent"
            />
          </div>
          <span className="tnum text-caption text-ink-3">2024</span>
        </div>

        <div className="tnum flex flex-wrap items-baseline justify-between gap-x-3 text-caption text-ink-2">
          <span>
            Window: <strong className="font-semibold text-ink-1">{windowLabel}</strong>
          </span>
          <span>
            {activeVarConfig.name} β:{' '}
            <strong className={`font-semibold ${slopeClass}`}>
              {fmtSign(activeVarStats.theilSenSlope)}
              {activeVarStats.theilSenSlope.toFixed(2)} {activeVarConfig.unit}
            </strong>
          </span>
        </div>

        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <div className="flex items-start justify-between gap-2">
            <p className="m-0 text-label font-medium text-ink-1">{verdictText}</p>
            <span className={activeVarStats.verdict === 'RED_NOISE_ILLUSION' ? 'tag tag-warn shrink-0' : 'tag shrink-0'}>
              {activeVarStats.pStar < 0.05 ? 'Significant' : 'Not significant'}
            </span>
          </div>
          <p className="tnum m-0 text-caption text-ink-3">
            Naive p = {activeVarStats.pNaive.toFixed(4)} to Hamed-Rao p* = {activeVarStats.pStar.toFixed(4)} (ρ₁ ={' '}
            {activeVarStats.rho1.toFixed(2)}, n* = {activeVarStats.nStar})
          </p>
        </div>

        {showClimateDriver && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-3 rounded-sm border" style={{ background: `${SERIES[1]}66`, borderColor: SERIES[1] }} />
              El Niño (MEI &gt; +0.5)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-3 rounded-sm border" style={{ background: `${SERIES[3]}66`, borderColor: SERIES[3] }} />
              La Niña (MEI &lt; -0.5)
            </span>
          </div>
        )}
      </section>

      {/* Flow duration curve */}
      {showFdcView && (
        <section className="flex flex-col gap-2 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="m-0 flex items-center gap-2 text-body font-semibold text-ink-1">
              <BarChart2 size={14} className="shrink-0 text-ink-2" aria-hidden="true" />
              Flow duration curve, modelled runoff (mm/month)
            </h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm shrink-0"
              aria-label="Close flow duration curve"
              onClick={() => setShowFdcView(false)}
            >
              <X size={14} aria-hidden="true" />
              Close
            </button>
          </div>
          <p className="m-0 text-caption text-ink-2">
            {isStudent
              ? "A flow duration curve sorts every month's river discharge from highest to lowest. It shows what percentage of the time rivers ran high in flood versus low in seasonal drought."
              : 'CUAHSI Flow Duration Curve (FDC): empirically sorts historical discharge Q against the Weibull exceedance probability P(Q ≥ q) = m / (N + 1) × 100%. It partitions high pluvial flood pulses (Q10), median catchment baseflow (Q50) and extreme hydrologic drought (Q90).'}
          </p>
          <p className="m-0 text-caption text-ink-3">Runoff is a modelled proxy (water balance), not a measured discharge.</p>

          <div className="h-[170px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fdcData} margin={{ top: 14, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="2 2" stroke={CHART.grid} />
                <XAxis
                  dataKey="pExceed"
                  stroke={COLORS.lineStrong}
                  tick={CHART.tick}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, 100]}
                />
                <YAxis stroke={COLORS.lineStrong} tick={CHART.tick} width={40} domain={['auto', 'auto']} />
                <RechartsTooltip content={<CustomRibbonTooltip unit="mm/mo" />} />
                {exceedanceProbability && (
                  <ReferenceLine
                    x={exceedanceProbability.prob}
                    stroke={COLORS.accent}
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    label={{
                      value: `Current Q (${exceedanceProbability.prob}%)`,
                      fill: COLORS.ink2,
                      fontSize: 11,
                      position: 'insideTopRight',
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="runoff"
                  name="Runoff Q (modelled)"
                  stroke={COLORS.ink2}
                  strokeWidth={2}
                  fill={COLORS.ink2}
                  fillOpacity={0.14}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="m-0 text-micro text-ink-3">Horizontal axis: percent of months the flow is equalled or exceeded.</p>

          <dl className="m-0 grid grid-cols-3 gap-x-3">
            {[
              { k: 'Q10', t: 'Top 10% flows', v: fdcPercentiles.q10, n: 'Flood threshold' },
              { k: 'Q50', t: 'Median flow', v: fdcPercentiles.q50, n: 'Median catchment flux' },
              { k: 'Q90', t: 'Lowest 10% flows', v: fdcPercentiles.q90, n: 'Drought margin' },
            ].map((q) => (
              <div key={q.k} className="flex flex-col border-t border-line pt-2">
                <dt className="text-caption text-ink-2">
                  {q.k} <span className="text-ink-3">({q.t})</span>
                </dt>
                <dd className="tnum m-0 text-label font-semibold text-ink-1">{q.v} mm/mo</dd>
                <dd className="m-0 text-caption text-ink-3">{q.n}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Water year benchmark note */}
      {useWaterYear && (
        <section className="flex flex-col gap-1.5 border-t border-line pt-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="m-0 flex items-center gap-2 text-body font-semibold text-ink-1">
              <Droplets size={14} className="shrink-0 text-ink-2" aria-hidden="true" />
              CUAHSI hydrologic benchmark (Oct 1 – Sep 30)
            </h3>
          </div>
          {exceedanceProbability && (
            <p className="tnum m-0 text-caption text-ink-2">
              P(Q ≥ q): <strong className="font-semibold text-ink-1">{exceedanceProbability.prob}%</strong> (
              {exceedanceProbability.flowClass})
            </p>
          )}
          <p className="m-0 text-caption text-ink-2">
            {isStudent
              ? "In hydrology, a 'water year' begins on October 1st instead of January 1st. Why? Because mountain snow freezes in November and does not melt into rivers until next spring. Putting the whole snowpack in one water year keeps the water math honest."
              : 'CUAHSI hydrologic convention: partitions catchment flux by water years (Oct 1 to Sep 30) to preserve winter snow accumulation and spring freshet within a continuous mass cycle. Exceedance probabilities P(Q ≥ q) rank current discharge against the historical empirical Weibull distribution.'}
          </p>
        </section>
      )}

      {/* Synchronised readout and ribbons */}
      <section className="flex flex-col gap-4 border-t border-line pt-4">
        {probePoint && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 flex items-center gap-2 text-body font-semibold text-ink-1">
                <Activity size={14} className="text-ink-2" aria-hidden="true" />
                Synchronised readout
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="tag">{hoveredDate ? 'Hover' : 'Latest record'}</span>
                <span className="tnum text-label font-medium text-ink-1">
                  {useWaterYear ? `${probePoint.waterYearLabel} (${probePoint.date})` : probePoint.date}
                </span>
              </div>
            </div>

            <p className="tnum m-0 flex flex-wrap items-baseline justify-between gap-x-3 text-caption text-ink-2">
              <span className="flex items-center gap-1.5">
                <Compass size={13} className="text-ink-3" aria-hidden="true" />
                Barystatic sea-level contribution
              </span>
              <span>
                <strong className="font-semibold text-ink-1">
                  {barystaticGmslMmYr > 0 ? '+' : ''}
                  {barystaticGmslMmYr} mm/yr
                </strong>{' '}
                sea-level rise <span className="text-ink-3">(1 mm = 361 Gt)</span>
              </span>
            </p>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <ReadoutCell
                active={activeVar === 'tws'}
                icon={<Droplet size={12} aria-hidden="true" />}
                label="Water storage, GRACE ΔTWS (observed)"
                value={`${fmtSign(probePoint.grace)}${probePoint.grace.toFixed(2)} cm`}
                subLabel="Trend rate"
                subValue={
                  <span className={signedClass(true, sensorRates.twsRate)}>
                    {fmtSign(sensorRates.twsRate)}
                    {sensorRates.twsRate.toFixed(2)} cm/yr
                  </span>
                }
              />
              <ReadoutCell
                active={activeVar === 'precip'}
                icon={<CloudRain size={12} aria-hidden="true" />}
                label="Rainfall, POWER (reanalysis)"
                value={`${probePoint.precipTotal.toFixed(1)} mm/mo`}
                subLabel="Trend rate"
                subValue={
                  <span className={signedClass(true, sensorRates.precipRate)}>
                    {fmtSign(sensorRates.precipRate)}
                    {sensorRates.precipRate.toFixed(2)} mm/yr
                  </span>
                }
              />
              <ReadoutCell
                active={activeVar === 'et' || activeVar === 'runoff'}
                icon={<Scale size={12} aria-hidden="true" />}
                label="Water budget, ET and Q (modelled)"
                value={`ET ${probePoint.et} mm · Q ${probePoint.runoff} mm`}
                subLabel="Storage dS/dt"
                subValue={
                  <span className={signedClass(true, probePoint.dStorageDt)}>
                    {fmtSign(probePoint.dStorageDt)}
                    {probePoint.dStorageDt} mm/mo
                  </span>
                }
              />
              <ReadoutCell
                active={activeVar === 'temp' || activeVar === 'no2' || activeVar === 'soil'}
                icon={<Zap size={12} aria-hidden="true" />}
                label={`${ATM_LEVELS[atmLevel].hPa} hPa, POWER + modelled`}
                value={`T ${probePoint.levelTemp}°C · NO₂ ${probePoint.no2}`}
                subLabel={`Soil moisture ${(probePoint.soil * 100).toFixed(0)}%`}
                subValue={<span>NDVI {probePoint.ndvi.toFixed(2)}</span>}
              />
            </div>
          </div>
        )}

        {/* Ribbon 1: water storage */}
        <Ribbon
          active={activeVar === 'tws'}
          icon={<Droplet size={14} aria-hidden="true" />}
          title="Water storage anomaly, GRACE / GRACE-FO ΔTWS (observed)"
          unit="cm"
          provKeys={['TWS']}
          note={isStudent ? 'Total water stored in ground, rivers and soil, measured by satellites that feel the pull of Earth’s gravity.' : undefined}
          extra={
            <button
              type="button"
              className="chip"
              aria-pressed={stripSeasonality}
              onClick={() => setStripSeasonality(!stripSeasonality)}
              title="Remove the average seasonal cycle from every series"
            >
              <Layers size={13} aria-hidden="true" />
              Remove seasonal cycle
            </button>
          }
          legend={
            !stripSeasonality
              ? [
                  { label: 'GRACE TWS (observed)', color: SERIES[0] },
                  { label: 'STL trend', color: COLORS.ink1 },
                  { label: '95% confidence band', color: SERIES[0], fade: true },
                ]
              : [
                  { label: 'Deseasonalized TWS', color: SERIES[0] },
                  { label: 'Linear fit β', color: fitColor, dashed: true },
                  { label: '95% confidence band', color: SERIES[0], fade: true },
                ]
          }
        >
          <div className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={slicedDataWithFit} syncId="synced-timeline" margin={chartMargin} {...chartHandlers}>
                {grid}
                <XAxis dataKey="date" hide />
                {yAxis()}
                <RechartsTooltip content={<CustomRibbonTooltip unit="cm" />} />
                {overlays}
                <Area
                  type="monotone"
                  dataKey="confBand"
                  name="95% Confidence Band"
                  stroke="none"
                  fill={SERIES[0]}
                  fillOpacity={0.16}
                  isAnimationActive={false}
                />
                {!stripSeasonality ? (
                  <>
                    <Line type="monotone" dataKey="grace" name="GRACE TWS (observed)" stroke={SERIES[0]} strokeWidth={1} strokeOpacity={0.8} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="trend" name="STL Trend" stroke={COLORS.ink1} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </>
                ) : (
                  <>
                    <Line type="monotone" dataKey="deseasTWS" name="Deseasonalized TWS" stroke={SERIES[0]} strokeWidth={1.4} dot={false} isAnimationActive={false} />
                    {hasFit && activeVar === 'tws' && fitLine('TWS Linear Fit β')}
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Ribbon>

        {/* Ribbon 2: precipitation */}
        <Ribbon
          active={activeVar === 'precip'}
          icon={<CloudRain size={14} aria-hidden="true" />}
          title="Rainfall, NASA POWER (reanalysis)"
          unit="mm/month"
          provKeys={['PRECTOTCORR']}
          note={isStudent ? 'Rain and snowfall in mm/month from NASA POWER reanalysis (a model-based estimate).' : undefined}
          legend={
            !stripSeasonality
              ? [
                  { label: 'Total precipitation', color: SERIES[0] },
                  { label: 'Anomaly', color: COLORS.ink3, dashed: true },
                ]
              : [
                  { label: 'Deseasonalized precipitation', color: SERIES[0] },
                  ...(activeVar === 'precip' ? [{ label: 'Linear fit β', color: fitColor, dashed: true }] : []),
                ]
          }
        >
          <div className="h-[110px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={slicedDataWithFit} syncId="synced-timeline" margin={chartMargin} {...chartHandlers}>
                {grid}
                <XAxis dataKey="date" hide />
                {yAxis()}
                <RechartsTooltip content={<CustomRibbonTooltip unit="mm" />} />
                {overlays}
                <Line
                  type="monotone"
                  dataKey={stripSeasonality ? 'deseasPrecip' : 'precipTotal'}
                  name={stripSeasonality ? 'Deseas Precip' : 'Total Precip'}
                  stroke={SERIES[0]}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
                {!stripSeasonality && (
                  <Line type="monotone" dataKey="precip" name="Anomaly" stroke={COLORS.ink3} strokeDasharray="2 2" strokeWidth={1} dot={false} isAnimationActive={false} />
                )}
                {hasFit && activeVar === 'precip' && fitLine('Precip Linear Fit β')}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Ribbon>

        {/* Ribbon 3: water budget */}
        <Ribbon
          active={activeVar === 'et' || activeVar === 'runoff'}
          icon={<Scale size={14} aria-hidden="true" />}
          title="Evapotranspiration (ET) and runoff (Q), modelled · dS/dt = P - ET - Q"
          unit="mm/month"
          provKeys={['EVPTRNS', 'RUNOFF']}
          note={isStudent ? 'Water evaporating from plants and soil (ET) and draining through rivers (Q) balances total rainfall and ground storage.' : undefined}
          legend={[
            { label: stripSeasonality ? 'Deseasonalized ET' : 'ET (modelled)', color: SERIES[2] },
            { label: stripSeasonality ? 'Deseasonalized runoff' : 'Runoff Q (modelled)', color: SERIES[1] },
            ...(!stripSeasonality ? [{ label: 'Storage flux dS/dt', color: COLORS.ink3, dashed: true }] : []),
            ...(stripSeasonality && (activeVar === 'et' || activeVar === 'runoff')
              ? [{ label: 'Linear fit β', color: fitColor, dashed: true }]
              : []),
          ]}
        >
          <div className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={slicedDataWithFit} syncId="synced-timeline" margin={chartMargin} {...chartHandlers}>
                {grid}
                <XAxis dataKey="date" hide />
                {yAxis()}
                <RechartsTooltip content={<CustomRibbonTooltip unit="mm" />} />
                {overlays}
                <ReferenceLine y={0} stroke={COLORS.lineStrong} strokeDasharray="2 2" />
                <Line
                  type="monotone"
                  dataKey={stripSeasonality ? 'deseasET' : 'et'}
                  name={stripSeasonality ? 'Deseas ET' : 'Evapotranspiration (ET, modelled)'}
                  stroke={SERIES[2]}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey={stripSeasonality ? 'deseasRunoff' : 'runoff'}
                  name={stripSeasonality ? 'Deseas Runoff' : 'Runoff (Q, modelled)'}
                  stroke={SERIES[1]}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
                {!stripSeasonality && (
                  <Line type="monotone" dataKey="dStorageDt" name="Storage Flux (dS/dt)" stroke={COLORS.ink3} strokeDasharray="3 2" strokeWidth={1} dot={false} isAnimationActive={false} />
                )}
                {hasFit && (activeVar === 'et' || activeVar === 'runoff') && fitLine(`${activeVar.toUpperCase()} Linear Fit β`)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Ribbon>

        {/* Ribbon 4: atmosphere */}
        <Ribbon
          active={activeVar === 'temp' || activeVar === 'no2'}
          icon={<Thermometer size={14} aria-hidden="true" />}
          title={`${ATM_LEVELS[atmLevel].label} · Temperature and NO₂ / CO (modelled above surface)`}
          unit="°C, kPa, ×10¹⁵ molec/cm²"
          provKeys={['T2M', 'NO2']}
          note={
            isStudent
              ? 'Surface air temperature is NASA POWER reanalysis; the upper-air temperatures and trace gas values are modelled from it, not measured.'
              : 'Greenhouse forcing: tropospheric warming (1000–500 hPa) versus tropopause cooling (250 hPa).'
          }
          legend={[
            { label: stripSeasonality ? `Deseasonalized temperature (${atmLevel} hPa)` : `Temperature (${atmLevel} hPa)`, color: SERIES[1] },
            { label: stripSeasonality ? 'Deseasonalized NO₂ / CO' : 'NO₂ (modelled)', color: SERIES[3], dashed: !stripSeasonality },
            ...(!stripSeasonality ? [{ label: 'VPD (kPa)', color: SERIES[4] }] : []),
            ...(stripSeasonality && (activeVar === 'temp' || activeVar === 'no2')
              ? [{ label: 'Linear fit β', color: fitColor, dashed: true }]
              : []),
          ]}
        >
          <div className="h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={slicedDataWithFit} syncId="synced-timeline" margin={chartMargin} {...chartHandlers}>
                {grid}
                <XAxis dataKey="date" hide />
                {yAxis()}
                <RechartsTooltip content={<CustomRibbonTooltip unit="" />} />
                {overlays}
                <Line
                  type="monotone"
                  dataKey={stripSeasonality ? 'deseasTemp' : 'levelTemp'}
                  name={stripSeasonality ? `Deseas Temp (${atmLevel} hPa)` : `Temp (${atmLevel} hPa)`}
                  stroke={SERIES[1]}
                  strokeWidth={1.6}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey={stripSeasonality ? 'deseasNO2' : 'no2'}
                  name={stripSeasonality ? 'Deseas NO₂ / CO' : 'Tropospheric NO₂ (modelled)'}
                  stroke={SERIES[3]}
                  strokeWidth={1.2}
                  strokeDasharray={stripSeasonality ? undefined : '3 2'}
                  dot={false}
                  isAnimationActive={false}
                />
                {!stripSeasonality && (
                  <Line type="monotone" dataKey="vpd" name="VPD (kPa)" stroke={SERIES[4]} strokeWidth={1} dot={false} isAnimationActive={false} />
                )}
                {hasFit && (activeVar === 'temp' || activeVar === 'no2') && fitLine(`${activeVar.toUpperCase()} Linear Fit β`)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Ribbon>

        {/* Ribbon 5: soil moisture and NDVI */}
        <Ribbon
          active={activeVar === 'soil'}
          icon={<Sprout size={14} aria-hidden="true" />}
          title="Root-zone soil moisture, NASA POWER, and NDVI (modelled)"
          unit="0–1 index"
          provKeys={['GWETROOT', 'NDVI']}
          note={isStudent ? 'Water available in the upper soil for plant roots (NASA POWER) and a vegetation index (NDVI) that is a modelled proxy here.' : undefined}
          legend={[
            { label: stripSeasonality ? 'Deseasonalized soil moisture' : 'POWER soil moisture', color: SERIES[2] },
            { label: 'NDVI (modelled proxy)', color: SERIES[4], dashed: true },
            ...(stripSeasonality && activeVar === 'soil' ? [{ label: 'Linear fit β', color: fitColor, dashed: true }] : []),
          ]}
        >
          <div className="h-[130px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={slicedDataWithFit} syncId="synced-timeline" margin={chartMargin} {...chartHandlers}>
                {grid}
                <XAxis
                  dataKey="date"
                  stroke={COLORS.lineStrong}
                  tick={CHART.tick}
                  minTickGap={28}
                  tickFormatter={(str) => {
                    if (!str) return '';
                    if (useWaterYear) {
                      const yr = parseInt(str.substring(0, 4), 10);
                      const mo = parseInt(str.substring(5, 7), 10);
                      const wy = mo >= 10 ? yr + 1 : yr;
                      return `WY${wy}`;
                    }
                    return str.substring(0, 4);
                  }}
                />
                {yAxis([0, 1])}
                <RechartsTooltip content={<CustomRibbonTooltip unit="" />} />
                {overlays}
                <Line
                  type="monotone"
                  dataKey={stripSeasonality ? 'deseasSoil' : 'soil'}
                  name={stripSeasonality ? 'Deseas Soil' : 'POWER Soil'}
                  stroke={SERIES[2]}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
                <Line type="monotone" dataKey="ndvi" name="NDVI (modelled proxy)" stroke={SERIES[4]} strokeDasharray="3 2" strokeWidth={1} dot={false} isAnimationActive={false} />
                {hasFit && activeVar === 'soil' && fitLine('Soil Linear Fit β')}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Ribbon>

        <p className="m-0 text-caption text-ink-3">
          The grey band marks the 2017–2018 gap between GRACE and GRACE-FO. The dashed accent line marks the year on the
          timeline.
        </p>

        {/* Citations */}
        <div className="flex flex-col gap-1.5 border-t border-line pt-4">
          <h3 className="m-0 flex items-center gap-2 text-body font-semibold text-ink-1">
            <ShieldCheck size={14} className="text-ink-2" aria-hidden="true" />
            NASA Earthdata provenance, CUAHSI benchmark and DOIs
          </h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {[
              { href: 'https://doi.org/10.5067/TEMSC-3JC62', text: 'PO.DAAC · GRACE-FO Mascon CRI RL06.1M', id: 'doi:10.5067/TEMSC-3JC62' },
              { href: 'https://doi.org/10.5067/0J5LP0MT95Q7', text: 'GES DISC · MERRA-2 Atmospheric Assimilation', id: 'doi:10.5067/0J5LP0MT95Q7' },
              {
                href: 'https://doi.org/10.5067/GPM/IMERG/3B-MONTH/07',
                text: 'GES DISC · GPM IMERG (map layer only; charts use NASA POWER)',
                id: 'doi:10.5067/GPM/IMERG/3B-MONTH/07',
              },
              { href: 'https://www.cuahsi.org/', text: 'CUAHSI · Water Year and Flow Exceedance Benchmark', id: 'cuahsi.org' },
            ].map((c) => (
              <li key={c.href}>
                <a
                  href={c.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-[28px] flex-col justify-center py-1 text-caption text-accent hover:underline"
                >
                  <span>{c.text}</span>
                  <span className="flex items-center gap-1 font-mono text-micro text-ink-3">
                    {c.id} <ExternalLink size={11} aria-hidden="true" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
