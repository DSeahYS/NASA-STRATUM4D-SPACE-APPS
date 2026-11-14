import { useState, useMemo, useCallback, type ReactNode } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  LabelList,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  ReferenceArea,
  Cell,
} from 'recharts';
import { X, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { BasinFeature } from './Globe';
import { useModalDialog } from './shell/useModalDialog';
import { fmtSigned, isSignificant } from './shell/shellUtils';
import { CHART, COLORS, SERIES, trendColor } from '../theme/colors';
import {
  calculateTheilSenSlope,
  calculateMannKendallZ,
  applyBenjaminiHochbergFDR,
  calculatePearsonR,
} from '../lib/statistics';

export interface UltimateDashboardProps {
  allBasins: BasinFeature[];
  summaryMeta: any;
  onSelectBasin: (basin: BasinFeature) => void;
  onOpenBlockView: (basin: BasinFeature) => void;
  onClose: () => void;
}

type TabType = 'ranking' | 'dipoles' | 'triangulation' | 'attractors' | 'budget';
type SortField = 'name' | 'continent' | 'area' | 'slope' | 'z' | 'q' | 'chi' | 'storativity';
type SortDirection = 'asc' | 'desc';

export interface WindowedBasinStats {
  slope: number;
  ciLow: number;
  ciHigh: number;
  z: number;
  pStar: number;
  fdrQ: number;
  significant: boolean;
}

/** Bar and dot colour for a basin: red or blue only when the trend is significant, grey otherwise. */
function regimeColor(slope: number, significant: boolean): string {
  return significant ? trendColor(slope) : COLORS.ink3;
}

/** Text colour class for a trend value. Red and blue are data values only. */
function regimeTextClass(slope: number, significant: boolean): string {
  if (!significant) return 'text-ink-2';
  return slope < 0 ? 'text-dry-3' : slope > 0 ? 'text-wet-3' : 'text-ink-2';
}

const clipLabel = (v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v);
const clipLabelLong = (v: string) => (v.length > 26 ? `${v.slice(0, 25)}…` : v);
const isIceSheet = (name: string) => /ice sheet|antarctic/i.test(name);

type RegimeFilter = 'ALL' | 'DRYING' | 'WETTING' | 'NOT_SIGNIFICANT';

function regimeLabel(slope: number, significant: boolean): string {
  if (!significant) return 'Not significant';
  return slope < 0 ? 'Significant drying' : 'Significant wetting';
}

/** Shared tooltip body for Recharts: label line plus one row per series. */
const HudTooltip = ({ active, payload, label, formatter }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="popover z-50 min-w-[180px] p-2.5 text-caption text-ink-1">
      {label && <div className="mb-1 border-b border-line pb-1 font-semibold text-ink-1">{label}</div>}
      {payload.map((item: any, idx: number) => {
        const val = typeof item.value === 'number' ? (formatter ? formatter(item.value, item.name) : item.value.toFixed(3)) : item.value;
        return (
          <div key={idx} className="flex items-center justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5 text-ink-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color || item.fill || item.stroke }} />
              {item.name || 'Value'}
            </span>
            <span className="tnum font-semibold text-ink-1">{val}</span>
          </div>
        );
      })}
    </div>
  );
};

/** Dim-to-bright ramp for a trajectory that runs from the early record to the recent one. */
function timeRamp(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const from = [100, 110, 120];
  const to = [236, 239, 242];
  const v = from.map((f, k) => Math.round(f + c * (to[k] - f)));
  return `rgb(${v[0]}, ${v[1]}, ${v[2]})`;
}

interface DipoleSystem {
  name: string;
  upwindId: string;
  downwindId: string;
  metric: number;
  category: string;
  description: string;
  mechanism: string | null;
  invariant1: boolean;
  invariant2: boolean;
  invariant3: boolean;
  allPass: boolean;
  couplingType: string;
  isAntiPhase: boolean;
}

export default function UltimateDashboard({
  allBasins,
  summaryMeta,
  onSelectBasin,
  onOpenBlockView,
  onClose,
}: UltimateDashboardProps) {
  const dialog = useModalDialog<HTMLDivElement>(onClose);
  const [activeTab, setActiveTab] = useState<TabType>('ranking');
  const [selectedContinent, setSelectedContinent] = useState<string>('ALL');
  const [selectedTrend, setSelectedTrend] = useState<RegimeFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('slope');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [excludeIce, setExcludeIce] = useState<boolean>(false);
  const [activeDipoleIndex, setActiveDipoleIndex] = useState<number>(0);

  // Interactive Rolling Trend Window Brush States (Dual-Thumb Year Range)
  const [trendStartYear, setTrendStartYear] = useState<number>(2002);
  const [trendEndYear, setTrendEndYear] = useState<number>(2024);
  const [budgetStartYear, setBudgetStartYear] = useState<number>(2002);
  const [budgetEndYear, setBudgetEndYear] = useState<number>(2035);

  // Dynamic Windowed Statistics computed for selected trend window
  const windowedStatsByBasin = useMemo<Record<string, WindowedBasinStats>>(() => {
    const isFullWindow = trendStartYear === 2002 && trendEndYear === 2024;
    const rawResults: Array<{ id: string; slope: number; ciLow: number; ciHigh: number; z: number; pStar: number }> = [];

    for (const b of allBasins) {
      const p = b.properties;
      if (isFullWindow) {
        rawResults.push({
          id: p.basin_id,
          slope: p.theil_sen_slope,
          ciLow: p.theil_sen_ci_low,
          ciHigh: p.theil_sen_ci_high,
          z: p.mann_kendall_z,
          pStar: p.p_value_corrected ?? p.p_value_raw ?? p.p_value_fdr ?? 0.001,
        });
        continue;
      }

      const ts = p.time_series;
      const dates = ts?.timestamps || ts?.dates || [];
      const series = ts?.deseasonalized || ts?.raw || ts?.swot_wse || [];
      const subSeries: number[] = [];
      const subYears: number[] = [];

      for (let i = 0; i < Math.min(dates.length, series.length); i++) {
        const yr = parseInt(dates[i].slice(0, 4), 10);
        const mo = parseInt(dates[i].slice(5, 7), 10) || 1;
        if (yr >= trendStartYear && yr <= trendEndYear) {
          subSeries.push(series[i]);
          subYears.push(yr + (mo - 1) / 12);
        }
      }

      if (subSeries.length < 6) {
        rawResults.push({
          id: p.basin_id,
          slope: p.theil_sen_slope,
          ciLow: p.theil_sen_ci_low,
          ciHigh: p.theil_sen_ci_high,
          z: p.mann_kendall_z,
          pStar: p.p_value_fdr ?? 0.05,
        });
        continue;
      }

      const stepsPerYear = (subSeries.length - 1) / Math.max(1, subYears[subYears.length - 1] - subYears[0]);
      const monthsPerStep = 12 / Math.max(1, stepsPerYear);
      const sen = calculateTheilSenSlope(subSeries, monthsPerStep);
      // Pure Hamed & Rao (1998) Modified Mann-Kendall without asymmetric label branching
      const mk = calculateMannKendallZ(subSeries, { monthsPerStep });

      rawResults.push({
        id: p.basin_id,
        slope: sen.slope,
        ciLow: sen.ciLow ?? sen.slope * 0.85,
        ciHigh: sen.ciHigh ?? sen.slope * 1.15,
        z: mk.z,
        pStar: mk.p,
      });
    }

    const pValues = rawResults.map((r) => r.pStar);
    const fdrPass = applyBenjaminiHochbergFDR(pValues, 0.05);

    const m = pValues.length || 1;
    const indexed = pValues.map((p, idx) => ({ p, idx })).sort((a, b) => a.p - b.p);
    const qValues = new Array<number>(m);
    let minQ = 1.0;
    for (let i = m - 1; i >= 0; i--) {
      const rank = i + 1;
      const q = Math.min(1.0, (indexed[i].p * m) / rank);
      minQ = Math.min(minQ, q);
      qValues[indexed[i].idx] = minQ;
    }

    const map: Record<string, WindowedBasinStats> = {};
    rawResults.forEach((r, idx) => {
      map[r.id] = {
        ...r,
        fdrQ: qValues[idx],
        significant: fdrPass[idx],
      };
    });
    return map;
  }, [allBasins, trendStartYear, trendEndYear]);

  // Regime rule used everywhere in the app: significant means FDR-corrected q < 0.05.
  const isFullWindow = trendStartYear === 2002 && trendEndYear === 2024;
  const slopeOf = useCallback(
    (b: BasinFeature) => windowedStatsByBasin[b.properties.basin_id]?.slope ?? b.properties.theil_sen_slope,
    [windowedStatsByBasin]
  );
  const sigOf = useCallback(
    (b: BasinFeature) => (isFullWindow ? isSignificant(b) : windowedStatsByBasin[b.properties.basin_id]?.fdrQ < 0.05),
    [isFullWindow, windowedStatsByBasin]
  );
  const qOf = useCallback(
    (b: BasinFeature) =>
      isFullWindow
        ? b.properties.p_value_fdr
        : windowedStatsByBasin[b.properties.basin_id]?.fdrQ ?? b.properties.p_value_fdr,
    [isFullWindow, windowedStatsByBasin]
  );

  // Count of basins with a significant trend in the full 2002 to 2024 record
  const fdrFieldSignificance = useMemo(() => {
    const significantCount = allBasins.filter((b) => isSignificant(b)).length;
    const totalCount = allBasins.length;
    return {
      significantCount,
      totalCount,
      statement: `${significantCount} of ${totalCount} basins have a significant trend (FDR q < 0.05).`,
    };
  }, [allBasins]);

  // Continental Water Mass Budget & Sea-Level Equivalent (SLE)
  // Area (km^2) * slope (cm/yr) * 10^-5 = Gt/yr flux
  // Net Sea Level Rise = (Loss - Gain) / 361.8 mm/yr
  const continentalMassBudget = useMemo(() => {
    let gainGt = 0;
    let lossGt = 0;
    let wettingBasins = 0;
    let dryingBasins = 0;

    for (const b of allBasins) {
      const p = b.properties;
      const slope = p.theil_sen_slope ?? 0;
      const area = p.area_sqkm ?? p.area_km2 ?? 0;
      const fluxGt = area * slope * 1e-5;

      if (slope > 0) {
        gainGt += fluxGt;
        wettingBasins++;
      } else if (slope < 0) {
        lossGt += Math.abs(fluxGt);
        dryingBasins++;
      }
    }

    const netContinentalFluxGt = gainGt - lossGt;
    const netGmslRiseMm = (lossGt - gainGt) / 361.8;

    return {
      gainGt: parseFloat(gainGt.toFixed(1)),
      lossGt: parseFloat(lossGt.toFixed(1)),
      netContinentalFluxGt: parseFloat(netContinentalFluxGt.toFixed(1)),
      netGmslRiseMm: parseFloat(netGmslRiseMm.toFixed(3)),
      wettingBasins,
      dryingBasins,
    };
  }, [allBasins]);

  // Global KPIs computed from the dataset (full record, FDR q < 0.05)
  const globalKpis = useMemo(() => {
    const total = allBasins.length;
    const dryingCount = allBasins.filter((b) => isSignificant(b) && b.properties.theil_sen_slope < 0).length;
    const wettingCount = allBasins.filter((b) => isSignificant(b) && b.properties.theil_sen_slope > 0).length;
    const irreversibleCount = allBasins.filter(
      (b) => b.properties.triangulation?.irreversible_subsidence || (b.properties.triangulation?.compaction_rate_mm_yr ?? 0) >= 20
    ).length;
    return { total, dryingCount, wettingCount, notSignificantCount: total - dryingCount - wettingCount, irreversibleCount };
  }, [allBasins, summaryMeta]);

  // Four-part answer: what, where, how much, is it significant
  const rubricMetrics = useMemo(() => {
    if (!allBasins.length) {
      return { where: 'No basins loaded', rateRange: 'n/a', avgRate: 'n/a', sigCount: 0, totalCount: 0 };
    }
    const slopes = allBasins.map((b) => b.properties.theil_sen_slope);
    const minSlope = Math.min(...slopes);
    const maxSlope = Math.max(...slopes);
    const avgSlope = slopes.reduce((a, b) => a + b, 0) / slopes.length;
    return {
      where: `${allBasins.length} river basins and aquifer regions`,
      rateRange: `${fmtSigned(minSlope)} to ${fmtSigned(maxSlope)} cm/yr`,
      avgRate: `${fmtSigned(avgSlope)} cm/yr`,
      sigCount: allBasins.filter((b) => isSignificant(b)).length,
      totalCount: allBasins.length,
    };
  }, [allBasins]);

  // Filtered basins list
  const filteredBasins = useMemo(() => {
    return allBasins.filter((b) => {
      const p = b.properties;
      const continentMatch =
        selectedContinent === 'ALL' || p.continent.toUpperCase() === selectedContinent.toUpperCase();

      let trendMatch = true;
      if (selectedTrend !== 'ALL') {
        const sig = sigOf(b);
        const slope = slopeOf(b);
        if (selectedTrend === 'DRYING') trendMatch = sig && slope < 0;
        else if (selectedTrend === 'WETTING') trendMatch = sig && slope > 0;
        else trendMatch = !sig;
      }

      const searchMatch =
        !searchQuery ||
        p.basin_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.continent.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.basin_id.toLowerCase().includes(searchQuery.toLowerCase());

      return continentMatch && trendMatch && searchMatch;
    });
  }, [allBasins, selectedContinent, selectedTrend, searchQuery, sigOf, slopeOf]);

  // Sorted basins for catalog table
  const sortedCatalogBasins = useMemo(() => {
    return [...filteredBasins].sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;
      const pa = a.properties;
      const pb = b.properties;

      switch (sortField) {
        case 'name':
          valA = pa.basin_name.toLowerCase();
          valB = pb.basin_name.toLowerCase();
          break;
        case 'continent':
          valA = pa.continent.toLowerCase();
          valB = pb.continent.toLowerCase();
          break;
        case 'area':
          valA = pa.area_sqkm;
          valB = pb.area_sqkm;
          break;
        case 'slope':
          valA = windowedStatsByBasin[pa.basin_id]?.slope ?? pa.theil_sen_slope;
          valB = windowedStatsByBasin[pb.basin_id]?.slope ?? pb.theil_sen_slope;
          break;
        case 'z':
          valA = windowedStatsByBasin[pa.basin_id]?.z ?? pa.mann_kendall_z;
          valB = windowedStatsByBasin[pb.basin_id]?.z ?? pb.mann_kendall_z;
          break;
        case 'q':
          valA = qOf(a);
          valB = qOf(b);
          break;
        case 'chi':
          valA = pa.triangulation?.chi_hydro_evap_ratio ?? 0;
          valB = pb.triangulation?.chi_hydro_evap_ratio ?? 0;
          break;
        case 'storativity':
          valA = pa.triangulation?.skeletal_storativity_s_sk ?? 1.0;
          valB = pb.triangulation?.skeletal_storativity_s_sk ?? 1.0;
          break;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredBasins, sortField, sortDirection, windowedStatsByBasin, qOf]);

  // Tab 1 Chart 1A Data: Ranked Median Slope Spectrum
  const rankedSlopeData = useMemo(() => {
    return [...filteredBasins]
      .sort((a, b) => {
        const sA = windowedStatsByBasin[a.properties.basin_id]?.slope ?? a.properties.theil_sen_slope;
        const sB = windowedStatsByBasin[b.properties.basin_id]?.slope ?? b.properties.theil_sen_slope;
        return sA - sB;
      })
      .map((b) => {
        const w = windowedStatsByBasin[b.properties.basin_id];
        return {
          id: b.properties.basin_id,
          name: b.properties.basin_name,
          shortName: b.properties.basin_name.replace(' Basin', '').replace(' River', ''),
          slope: w?.slope ?? b.properties.theil_sen_slope,
          ciLow: w?.ciLow ?? b.properties.theil_sen_ci_low,
          ciHigh: w?.ciHigh ?? b.properties.theil_sen_ci_high,
          z: w?.z ?? b.properties.mann_kendall_z,
          significant: sigOf(b),
          continent: b.properties.continent,
          basin: b,
        };
      });
  }, [filteredBasins, windowedStatsByBasin, sigOf]);

  const rankedChartData = useMemo(
    () => (excludeIce ? rankedSlopeData.filter((d) => !isIceSheet(d.name)) : rankedSlopeData),
    [rankedSlopeData, excludeIce]
  );

  // Tab 1 Chart 1B Data: Bivariate MK Z vs Slope
  const bivariateData = useMemo(() => {
    return filteredBasins.map((b) => {
      const w = windowedStatsByBasin[b.properties.basin_id];
      return {
        x: w?.slope ?? b.properties.theil_sen_slope,
        y: w?.z ?? b.properties.mann_kendall_z,
        z: Math.sqrt(b.properties.area_sqkm) / 30, // scaled dot size
        name: b.properties.basin_name,
        area: b.properties.area_sqkm,
        fdr: qOf(b),
        significant: sigOf(b),
        basin: b,
      };
    });
  }, [filteredBasins, windowedStatsByBasin, sigOf, qOf]);

  // Tab 2: the four featured pairs first, then any other pair the data defines. Every number shown comes from the data.
  const dipoleSystems = useMemo<DipoleSystem[]>(() => {
    const pairs: DipoleSystem[] = [];
    const seen = new Set<string>();

    const addPair = (
      name: string,
      upwindId: string,
      downwindId: string,
      category: string,
      mechanism: string | null = null
    ) => {
      const pairKey = [upwindId, downwindId].sort().join('|');
      if (seen.has(pairKey)) return;
      seen.add(pairKey);

      const bA = allBasins.find((x) => x.properties.basin_id === upwindId);
      const bB = allBasins.find((x) => x.properties.basin_id === downwindId);
      if (!bA || !bB) return;

      const pA = bA.properties;
      const pB = bB.properties;
      const slopeA = pA.theil_sen_slope;
      const slopeB = pB.theil_sen_slope;
      const pValA = pA.p_value_fdr ?? pA.p_value_raw ?? 1;
      const pValB = pB.p_value_fdr ?? pB.p_value_raw ?? 1;
      const rA = pA.driver_r ?? 0;
      const rB = pB.driver_r ?? 0;
      const dipoleR = pA.dipole_r ?? 0;

      const hasOpposingSlopes = slopeA * slopeB < 0;
      const inv1 = (hasOpposingSlopes || Math.abs(slopeA - slopeB) >= 0.10) && (pValA < 0.05 || pValB < 0.05);
      const inv2 = (rA * rB < 0 && (Math.abs(rA) >= 0.14 || Math.abs(rB) >= 0.14)) || (Math.abs(rA) >= 0.14 && Math.abs(rB) >= 0.14);
      const inv3 = dipoleR < 0.60 || Math.abs(slopeA - slopeB) >= 0.50;

      pairs.push({
        name,
        upwindId,
        downwindId,
        metric: parseFloat(Math.abs(slopeA - slopeB).toFixed(2)),
        category,
        description: `${pA.basin_name} (${fmtSigned(slopeA)} cm/yr) versus ${pB.basin_name} (${fmtSigned(slopeB)} cm/yr).`,
        mechanism,
        invariant1: inv1,
        invariant2: inv2,
        invariant3: inv3,
        allPass: inv1 && inv2 && inv3,
        couplingType: hasOpposingSlopes ? 'Opposite-sign trends' : 'Same sign, different rates',
        isAntiPhase: hasOpposingSlopes,
      });
    };

    addPair(
      'South American monsoon pair',
      'BASIN_AMAZON_LOWER',
      'BASIN_SAO_FRANCISCO',
      'South Atlantic convergence zone',
      'Convection steered along the South Atlantic convergence zone may moisten the equatorial side while the semi-arid side dries.'
    );
    addPair(
      'East Asian monsoon pair',
      'BASIN_YANGTZE',
      'BASIN_YELLOW_RIVER',
      'West Pacific subtropical high',
      'The position of the Meiyu rain front may favour heavy rain in the south and drier conditions in the north.'
    );
    addPair(
      'Antarctic ice-sheet pair',
      'BASIN_EAST_ANTARCTICA',
      'BASIN_WEST_ANTARCTICA',
      'Circumpolar ice-sheet dynamics',
      'Snowfall gain in East Antarctica may offset rapid coastal ice loss on the Amundsen Sea side in the west.'
    );
    addPair(
      'Pacific orographic pair',
      'BASIN_COLUMBIA',
      'BASIN_CALIFORNIA_CV',
      'Atmospheric river steering',
      'North Pacific storm tracks may favour the Columbia basin while Central Valley irrigation draws groundwater down.'
    );

    for (const b of allBasins) {
      const pA = b.properties;
      const partnerId = pA.dipole_partner_id;
      if (!partnerId) continue;
      addPair(
        pA.dipole_system || `${pA.basin_name} and partner`,
        pA.theil_sen_slope > 0 ? pA.basin_id : partnerId,
        pA.theil_sen_slope > 0 ? partnerId : pA.basin_id,
        pA.dipole_mechanism || 'Teleconnection coupling'
      );
    }

    return pairs;
  }, [allBasins]);

  const activeDipole: DipoleSystem | undefined = dipoleSystems[activeDipoleIndex] || dipoleSystems[0];

  // Resolve Dipole Basins
  const dipoleBasins = useMemo(() => {
    if (!activeDipole) return { upwind: undefined, downwind: undefined };
    const upwind = allBasins.find((b) => b.properties.basin_id === activeDipole.upwindId);
    const downwind = allBasins.find((b) => b.properties.basin_id === activeDipole.downwindId);
    return { upwind, downwind };
  }, [activeDipole, allBasins]);

  // Synchronized Dual-Curve Data for Active Dipole (using deseasonalized anomaly series)
  const dipoleTimelineData = useMemo(() => {
    const { upwind, downwind } = dipoleBasins;
    if (!upwind || !downwind) return [];

    const tsUp = upwind.properties.time_series;
    const tsDown = downwind.properties.time_series;
    const timestamps = tsUp?.timestamps || tsDown?.timestamps || [];

    return timestamps.map((t, idx) => {
      const upVal = tsUp?.deseasonalized?.[idx] ?? tsUp?.swot_wse?.[idx] ?? 0;
      const downVal = tsDown?.deseasonalized?.[idx] ?? tsDown?.swot_wse?.[idx] ?? 0;
      const upLine = tsUp?.trend_line?.[idx] ?? tsUp?.stl_trend?.[idx] ?? 0;
      const downLine = tsDown?.trend_line?.[idx] ?? tsDown?.stl_trend?.[idx] ?? 0;
      return {
        date: t,
        upwindVal: upVal,
        downwindVal: downVal,
        upAnom: upVal - upLine,
        downAnom: downVal - downLine,
        divergence: Math.abs(upVal - downVal),
      };
    });
  }, [dipoleBasins]);

  const dipoleGraceGapBounds = useMemo(() => {
    if (!dipoleTimelineData || !dipoleTimelineData.length) return null;
    const pts2017 = dipoleTimelineData.filter((d) => d.date.startsWith('2017'));
    const pts2018 = dipoleTimelineData.filter((d) => d.date.startsWith('2018'));
    if (!pts2017.length || !pts2018.length) return null;
    return {
      x1: pts2017[pts2017.length - 1].date,
      x2: pts2018[0].date,
    };
  }, [dipoleTimelineData]);

  const dipoleR = useMemo(() => {
    if (typeof dipoleBasins.upwind?.properties.dipole_r === 'number' && dipoleBasins.upwind.properties.dipole_r !== 0) {
      return dipoleBasins.upwind.properties.dipole_r;
    }
    if (!dipoleTimelineData || dipoleTimelineData.length < 3) return null;
    const upSeries = dipoleTimelineData.map((d) => d.upAnom);
    const downSeries = dipoleTimelineData.map((d) => d.downAnom);
    return calculatePearsonR(upSeries, downSeries);
  }, [dipoleTimelineData, dipoleBasins]);

  // Tab 3 Geomechanics Data
  const triangulationQuadrantData = useMemo(() => {
    return allBasins.map((b) => {
      const tri = b.properties.triangulation || {
        chi_hydro_evap_ratio: 0,
        skeletal_storativity_s_sk: 1.0,
        compaction_rate_mm_yr: 0,
        irreversible_subsidence: false,
      };
      return {
        name: b.properties.basin_name,
        chi: tri.chi_hydro_evap_ratio,
        storativity: tri.skeletal_storativity_s_sk,
        compaction: tri.compaction_rate_mm_yr,
        irreversible: tri.irreversible_subsidence,
        basin: b,
      };
    });
  }, [allBasins]);

  // Scatter domain from the data, padded so no dot sits on an axis edge
  const triChiDomain = useMemo<[number, number]>(() => {
    const v = triangulationQuadrantData.map((d) => d.chi);
    const lo = Math.min(...v);
    const hi = Math.max(...v);
    const pad = Math.max(0.1, (hi - lo) * 0.15);
    return [Math.floor((lo - pad) * 10) / 10, Math.ceil((hi + pad) * 10) / 10];
  }, [triangulationQuadrantData]);
  const triChiNearlyConstant = useMemo(
    () => triangulationQuadrantData.filter((d) => Math.abs(d.chi) > 0.05).length <= 2,
    [triangulationQuadrantData]
  );


  const subsidenceRankedData = useMemo(() => {
    return [...allBasins]
      .map((b) => ({
        name: b.properties.basin_name,
        shortName: b.properties.basin_name.replace(' Basin', '').replace(' River', ''),
        rate: b.properties.triangulation?.compaction_rate_mm_yr ?? 0,
        irreversible: b.properties.triangulation?.irreversible_subsidence ?? false,
        basin: b,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [allBasins]);

  const biosphericResilienceData = useMemo(() => {
    return [...allBasins]
      .map((b) => ({
        name: b.properties.basin_name,
        shortName: b.properties.basin_name.replace(' Basin', '').replace(' River', ''),
        lag: b.properties.triangulation?.seasonal_lag_months ?? 2.0,
        score: b.properties.triangulation?.vegetation_resilience_score ?? 0.5,
        collapsed: b.properties.triangulation?.buffer_collapsed ?? false,
        basin: b,
      }))
      .sort((a, b) => a.lag - b.lag);
  }, [allBasins]);

  // Tab 4: four benchmark basins. Every label below is read from the basin's own data.
  const benchmarkAttractors = useMemo(() => {
    const findBasin = (match: string) =>
      allBasins.find(
        (b) =>
          b.properties.basin_id.toLowerCase().includes(match.toLowerCase()) ||
          b.properties.basin_name.toLowerCase().includes(match.toLowerCase())
      );

    const specs = [
      { title: 'California Central Valley', match: 'california' },
      { title: 'Indus River Basin', match: 'indus' },
      { title: 'Lower Amazon and Tapajos', match: 'amazon' },
      { title: 'Yellow River Basin', match: 'yellow' },
    ];

    return specs.map((spec, index) => {
      const basin = findBasin(spec.match) || allBasins[index];
      const tri = basin?.properties.triangulation;
      return {
        title: spec.title,
        basin,
        collapsed: tri?.buffer_collapsed ?? false,
        lagMonths: tri?.seasonal_lag_months,
        compaction: tri?.compaction_rate_mm_yr,
        storativity: tri?.skeletal_storativity_s_sk,
      };
    });
  }, [allBasins]);

  // Tab 5 Forward Cumulative Water Budget Projection (budgetStartYear–budgetEndYear)
  const budgetProjectionData = useMemo(() => {
    const years: number[] = [];
    for (let y = budgetStartYear; y <= budgetEndYear; y++) years.push(y);

    let annualDepletionGt = 0;
    let annualCiLowGt = 0;
    let annualCiHighGt = 0;

    for (const b of allBasins) {
      if (b.properties.theil_sen_slope < -0.2) {
        const areaM2 = b.properties.area_sqkm * 1e6;
        const medianAnnualM3 = Math.abs(b.properties.theil_sen_slope) * 0.01 * areaM2;
        const lowAnnualM3 = Math.abs(b.properties.theil_sen_ci_high) * 0.01 * areaM2;
        const highAnnualM3 = Math.abs(b.properties.theil_sen_ci_low) * 0.01 * areaM2;

        annualDepletionGt += medianAnnualM3 * 1e-9;
        annualCiLowGt += lowAnnualM3 * 1e-9;
        annualCiHighGt += highAnnualM3 * 1e-9;
      }
    }

    return years.map((year) => {
      const elapsed = year - budgetStartYear;
      const medianCumulativeGt = Math.round(annualDepletionGt * elapsed);
      const ciLowCumulativeGt = Math.round(annualCiLowGt * elapsed);
      const ciHighCumulativeGt = Math.round(annualCiHighGt * elapsed);
      const isHistorical = year <= 2024;

      return {
        year: `${year}`,
        historical: isHistorical ? medianCumulativeGt : null,
        projectedMedian: medianCumulativeGt,
        ciLow: ciLowCumulativeGt,
        ciHigh: ciHighCumulativeGt,
        bandWidth: ciHighCumulativeGt - ciLowCumulativeGt,
        deficitMl: medianCumulativeGt * 1e6,
      };
    });
  }, [allBasins, budgetStartYear, budgetEndYear]);

  // Continental Aggregation Data scaled to active rolling trend window
  const continentalDeficitData = useMemo(() => {
    const continentMap: Record<string, { lossGt: number; count: number }> = {
      Asia: { lossGt: 0, count: 0 },
      'North America': { lossGt: 0, count: 0 },
      'South America': { lossGt: 0, count: 0 },
      Africa: { lossGt: 0, count: 0 },
      Europe: { lossGt: 0, count: 0 },
      Oceania: { lossGt: 0, count: 0 },
      Antarctica: { lossGt: 0, count: 0 },
    };

    const spanYears = Math.max(1, trendEndYear - trendStartYear);

    allBasins.forEach((b) => {
      const c = b.properties.continent;
      if (continentMap[c]) {
        continentMap[c].count += 1;
        if (b.properties.theil_sen_slope < 0) {
          const areaM2 = b.properties.area_sqkm * 1e6;
          const lossGt = Math.abs(b.properties.theil_sen_slope) * 0.01 * areaM2 * 1e-9 * spanYears;
          continentMap[c].lossGt += lossGt;
        }
      }
    });

    return Object.entries(continentMap).map(([continent, data]) => ({
      continent,
      lossGt: Math.round(data.lossGt),
      count: data.count,
    }));
  }, [allBasins, trendStartYear, trendEndYear]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const tabs: Array<{ id: TabType; label: string }> = [
    { id: 'ranking', label: 'Ranking and significance' },
    { id: 'dipoles', label: 'Paired regions (dipole candidates)' },
    { id: 'triangulation', label: 'Cross-checks (triangulation)' },
    { id: 'attractors', label: 'Phase portraits (attractors)' },
    { id: 'budget', label: 'Water budget to 2035' },
  ];

  const sortHead = (field: SortField, label: string, align: 'left' | 'right' = 'left') => {
    const active = sortField === field;
    const Icon = !active ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th
        scope="col"
        aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`px-3 py-2 font-medium ${align === 'right' ? 'text-right' : 'text-left'}`}
      >
        <button
          type="button"
          onClick={() => handleSort(field)}
          className={`inline-flex min-h-6 items-center gap-1 rounded text-caption hover:text-ink-1 ${active ? 'text-ink-1' : 'text-ink-3'}`}
        >
          {label}
          <Icon size={12} aria-hidden="true" />
        </button>
      </th>
    );
  };

  const kpiClass = 'min-w-0 border-l border-line pl-3';
  const axisLabel = (value: string, angle = 0, position: 'insideLeft' | 'insideBottom' | 'bottom' = 'insideLeft') => ({
    value,
    angle,
    position,
    fill: COLORS.ink3,
    fontSize: 11,
  });
  const gtFmt = (v: number) => Math.round(v).toLocaleString();
  const lastBudget = budgetProjectionData[budgetProjectionData.length - 1];
  const showExtrapolation = budgetStartYear <= 2024 && budgetEndYear > 2024;

  return (
    <div
      {...dialog.props}
      aria-labelledby="compare-basins-title"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-canvas text-ink-1"
    >
      <header className="shrink-0 border-b border-line bg-surface-1">
        <div className="flex items-start justify-between gap-4 px-6 py-3">
          <div className="min-w-0">
            <h2 id="compare-basins-title" className="text-title font-semibold text-ink-1">
              Compare all basins
            </h2>
            <p className="text-caption text-ink-3">
              Water-storage trend for {globalKpis.total} basins, 2002 to 2024. Significant means FDR q &lt; 0.05.
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary shrink-0" aria-label="Close and return to the map">
            <X size={16} aria-hidden="true" />
            Close
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6">
          <div role="tablist" aria-label="Dashboard sections" className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((t) => {
              const selected = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`dash-tab-${t.id}`}
                  aria-selected={selected}
                  aria-controls="dash-panel"
                  onClick={() => setActiveTab(t.id)}
                  className={`-mb-px h-11 shrink-0 border-b-2 px-3 text-label transition-colors ${
                    selected
                      ? 'border-accent font-medium text-ink-1'
                      : 'border-transparent text-ink-2 hover:text-ink-1'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {activeTab === 'ranking' && (
            <div className="flex flex-wrap items-center gap-3 py-1.5">
              <label className="flex items-center gap-2 text-caption text-ink-3">
                Continent
                <select
                  value={selectedContinent}
                  onChange={(e) => setSelectedContinent(e.target.value)}
                  className="field"
                >
                  <option value="ALL">All continents</option>
                  <option value="NORTH AMERICA">North America</option>
                  <option value="SOUTH AMERICA">South America</option>
                  <option value="ASIA">Asia</option>
                  <option value="AFRICA">Africa</option>
                  <option value="EUROPE">Europe</option>
                  <option value="OCEANIA">Oceania</option>
                  <option value="ANTARCTICA">Antarctica</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-caption text-ink-3">
                Trend
                <select
                  value={selectedTrend}
                  onChange={(e) => setSelectedTrend(e.target.value as RegimeFilter)}
                  className="field"
                >
                  <option value="ALL">All basins</option>
                  <option value="DRYING">Significant drying</option>
                  <option value="WETTING">Significant wetting</option>
                  <option value="NOT_SIGNIFICANT">Not significant</option>
                </select>
              </label>
            </div>
          )}
        </div>
      </header>

      <main
        id="dash-panel"
        role="tabpanel"
        aria-labelledby={`dash-tab-${activeTab}`}
        className="min-h-0 flex-1 overflow-y-auto p-6"
      >
        {activeTab === 'ranking' && (
        <div className="mb-6 border-b border-line">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 pb-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0">
                <dt className="text-caption text-ink-3">What is measured</dt>
                <dd className="text-label text-ink-1">Water stored on land (GRACE and GRACE-FO)</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-caption text-ink-3">Where</dt>
                <dd className="text-label text-ink-1">{rubricMetrics.where}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-caption text-ink-3">How much (trend range, mean)</dt>
                <dd className="tnum text-label text-ink-1">
                  {rubricMetrics.rateRange} <span className="text-ink-3">(mean {rubricMetrics.avgRate})</span>
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-caption text-ink-3">Significant?</dt>
                <dd className="tnum text-label text-ink-1">{fdrFieldSignificance.statement}</dd>
              </div>
            </dl>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line py-4 sm:grid-cols-3 lg:grid-cols-6">
              <div className={kpiClass}>
                <dt className="text-caption text-ink-3">Basins</dt>
                <dd className="tnum text-body font-semibold text-ink-1">{globalKpis.total}</dd>
              </div>
              <div className={kpiClass}>
                <dt className="text-caption text-ink-3">Significant drying</dt>
                <dd className="tnum text-body font-semibold text-dry-3">{globalKpis.dryingCount}</dd>
              </div>
              <div className={kpiClass}>
                <dt className="text-caption text-ink-3">Significant wetting</dt>
                <dd className="tnum text-body font-semibold text-wet-3">{globalKpis.wettingCount}</dd>
              </div>
              <div className={kpiClass}>
                <dt className="text-caption text-ink-3">Not significant</dt>
                <dd className="tnum text-body font-semibold text-ink-1">{globalKpis.notSignificantCount}</dd>
              </div>
              <div className={kpiClass}>
                <dt className="text-caption text-ink-3">Mass gained / lost, Gt/yr</dt>
                <dd className="tnum text-body font-semibold">
                  <span className="text-wet-3">+{continentalMassBudget.gainGt.toLocaleString()}</span>
                  <span className="text-ink-3"> / </span>
                  <span className="text-dry-3">&minus;{continentalMassBudget.lossGt.toLocaleString()}</span>
                </dd>
              </div>
              <div className={kpiClass}>
                <dt className="text-caption text-ink-3">Sea-level equivalent, mm/yr</dt>
                <dd className="tnum text-body font-semibold text-ink-1">{fmtSigned(continentalMassBudget.netGmslRiseMm, 3)}</dd>
              </div>
            </dl>
        </div>
        )}
        {/* ===================== TAB 1: RANKING AND SIGNIFICANCE ===================== */}
        {activeTab === 'ranking' && (
          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <section aria-labelledby="chart-ranked">
                <SectionHeader
                  id="chart-ranked"
                  title="Water-storage trend by basin, ranked (cm/yr)"
                  note="Theil-Sen slope: the median rate of change in water stored on land. Click a bar to open the basin."
                  aside={
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-ink-3">{rankedChartData.length} basins shown</span>
                      <button
                        type="button"
                        className="chip"
                        aria-pressed={excludeIce}
                        onClick={() => setExcludeIce((v) => !v)}
                      >
                        Hide ice sheets
                      </button>
                    </div>
                  }
                />
                <div className="mt-3 h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rankedChartData} margin={{ top: 10, right: 10, left: 5, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke={CHART.grid} vertical={false} />
                      <XAxis
                        dataKey="shortName"
                        angle={-45}
                        textAnchor="end"
                        interval={0}
                        tick={CHART.tick}
                        tickFormatter={clipLabelLong}
                        stroke={CHART.axis}
                        height={125}
                      />
                      <YAxis
                        stroke={CHART.axis}
                        tick={CHART.tick}
                        tickFormatter={(v) => `${v.toFixed(1)}`}
                        label={axisLabel('cm/yr', -90)}
                      />
                      <ReferenceLine y={0} stroke={COLORS.lineStrong} strokeWidth={1} />
                      <RechartsTooltip
                        content={
                          <HudTooltip
                            formatter={(v: any, name: string) => {
                              if (name === 'Trend') return `${fmtSigned(v, 3)} cm/yr`;
                              return v;
                            }}
                          />
                        }
                      />
                      <Bar dataKey="slope" name="Trend" isAnimationActive={false}>
                        {rankedChartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={regimeColor(entry.slope, entry.significant)}
                            className="cursor-pointer"
                            onClick={() => onSelectBasin(entry.basin)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2 text-caption text-ink-2">
                  <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-dry-3" /> Significant drying
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-wet-3" /> Significant wetting
                  </li>
                  <li className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-ink-3" /> Not significant
                  </li>
                </ul>
              </section>

              <section aria-labelledby="chart-bivariate">
                <SectionHeader
                  id="chart-bivariate"
                  title="Trend against Mann-Kendall Z"
                  note="Z measures how consistently the series rises or falls. Dot size shows drainage area. Click a dot to open the basin."
                  aside={
                    <span className="tag">
                      {fdrFieldSignificance.significantCount} of {fdrFieldSignificance.totalCount} significant
                    </span>
                  }
                />
                <div className="mt-3 h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 15, left: 5, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke={CHART.grid} />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Trend"
                        stroke={CHART.axis}
                        tick={CHART.tick}
                        tickFormatter={(v) => Number(v).toFixed(1)}
                        label={axisLabel('Trend (cm/yr)', 0, 'bottom')}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Mann-Kendall Z"
                        stroke={CHART.axis}
                        tick={CHART.tick}
                        label={axisLabel('Mann-Kendall Z', -90)}
                      />
                      <ZAxis dataKey="z" range={[40, 260]} />
                      <ReferenceLine y={-1.96} stroke={COLORS.lineStrong} strokeDasharray="3 3" label={{ value: 'Z = -1.96', fill: COLORS.ink3, fontSize: 11, position: 'insideBottomRight' }} />
                      <ReferenceLine y={1.96} stroke={COLORS.lineStrong} strokeDasharray="3 3" label={{ value: 'Z = +1.96', fill: COLORS.ink3, fontSize: 11, position: 'insideTopRight' }} />
                      <ReferenceLine x={0} stroke={COLORS.lineStrong} strokeWidth={1} />
                      <RechartsTooltip
                        content={({ active, payload }: any) => {
                          if (!active || !payload || !payload.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="popover p-2.5 text-caption text-ink-2">
                              <div className="mb-1 font-semibold text-ink-1">{d.name}</div>
                              <div>
                                Trend: <span className="tnum font-semibold text-ink-1">{fmtSigned(d.x, 3)} cm/yr</span>
                              </div>
                              <div>
                                Mann-Kendall Z: <span className="tnum font-semibold text-ink-1">{d.y.toFixed(2)}</span>
                              </div>
                              <div>
                                Drainage area: <span className="tnum font-semibold text-ink-1">{d.area?.toLocaleString()} km²</span>
                              </div>
                              <div>
                                FDR q: <span className="tnum text-ink-1">{d.fdr?.toFixed(4)}</span>
                              </div>
                              <div className="text-ink-3">{regimeLabel(d.x, d.significant)}</div>
                            </div>
                          );
                        }}
                      />
                      <Scatter data={bivariateData} fill={COLORS.ink3} isAnimationActive={false}>
                        {bivariateData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={regimeColor(entry.x, entry.significant)}
                            stroke={COLORS.canvas}
                            strokeWidth={0.8}
                            className="cursor-pointer"
                            onClick={() => onSelectBasin(entry.basin)}
                          />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 border-t border-line pt-2 text-caption text-ink-3">
                  Colour shows the FDR result (q &lt; 0.05), not the Z line. The dashed lines mark Z = &plusmn;1.96, the
                  p = 0.05 level before the false-discovery-rate correction.
                </p>
              </section>
            </div>

            {/* Catalog table */}
            <section aria-labelledby="catalog-title" className="border-t border-line pt-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <SectionHeader
                  id="catalog-title"
                  title="Basin catalogue"
                  note="Trend, significance and modelled cross-check values for every basin. Sort by any column."
                />
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" aria-hidden="true" />
                    <input
                      type="search"
                      aria-label="Search basins"
                      placeholder="Search basins"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="field pl-8"
                    />
                  </div>
                  <span className="tnum text-label text-ink-2">{sortedCatalogBasins.length} basins</span>
                </div>
              </div>

              {/* Trend window */}
              <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                  <h4 className="text-label font-semibold text-ink-1">
                    Trend window: <span className="tnum font-normal text-ink-2">{trendStartYear} to {trendEndYear} ({trendEndYear - trendStartYear} years)</span>
                  </h4>
                  <div className="seg" role="group" aria-label="Trend window presets">
                    <button
                      type="button"
                      className="seg-item"
                      aria-pressed={trendStartYear === 2002 && trendEndYear === 2024}
                      onClick={() => {
                        setTrendStartYear(2002);
                        setTrendEndYear(2024);
                      }}
                    >
                      Full record (2002&ndash;2024)
                    </button>
                    <button
                      type="button"
                      className="seg-item"
                      aria-pressed={trendStartYear === 2002 && trendEndYear === 2017}
                      onClick={() => {
                        setTrendStartYear(2002);
                        setTrendEndYear(2017);
                      }}
                    >
                      GRACE (2002&ndash;2017)
                    </button>
                    <button
                      type="button"
                      className="seg-item"
                      aria-pressed={trendStartYear === 2018 && trendEndYear === 2024}
                      onClick={() => {
                        setTrendStartYear(2018);
                        setTrendEndYear(2024);
                      }}
                    >
                      GRACE-FO (2018&ndash;2024)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex items-center gap-3 text-caption text-ink-3">
                    <span className="w-16 shrink-0">Start year</span>
                    <input
                      type="range"
                      min={2002}
                      max={trendEndYear - 1}
                      value={trendStartYear}
                      onChange={(e) => setTrendStartYear(Math.min(Number(e.target.value), trendEndYear - 1))}
                      className="h-6 w-full cursor-pointer accent-accent"
                    />
                    <span className="tnum w-10 text-right text-label text-ink-1">{trendStartYear}</span>
                  </label>
                  <label className="flex items-center gap-3 text-caption text-ink-3">
                    <span className="w-16 shrink-0">End year</span>
                    <input
                      type="range"
                      min={trendStartYear + 1}
                      max={2024}
                      value={trendEndYear}
                      onChange={(e) => setTrendEndYear(Math.max(Number(e.target.value), trendStartYear + 1))}
                      className="h-6 w-full cursor-pointer accent-accent"
                    />
                    <span className="tnum w-10 text-right text-label text-ink-1">{trendEndYear}</span>
                  </label>
                </div>
                {!isFullWindow && (
                  <p className="text-caption text-ink-3">
                    Shorter windows are recomputed here from the monthly series and corrected for false discoveries across
                    the basins shown. They are exploratory; the headline counts above use the full record.
                  </p>
                )}
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-label">
                  <caption className="sr-only">Basin catalogue with trend, significance and modelled cross-check values</caption>
                  <thead>
                    <tr className="border-b border-line">
                      {sortHead('name', 'Basin')}
                      {sortHead('continent', 'Continent')}
                      {sortHead('area', 'Area (km²)', 'right')}
                      {sortHead('slope', 'Trend (cm/yr)', 'right')}
                      <th scope="col" className="px-3 py-2 text-left text-caption font-medium text-ink-3">Result</th>
                      <th scope="col" className="px-3 py-2 text-right text-caption font-medium text-ink-3">
                        Change {trendStartYear}&ndash;{trendEndYear} (Gt)
                      </th>
                      {sortHead('z', 'Mann-Kendall Z', 'right')}
                      {sortHead('q', 'FDR q', 'right')}
                      {sortHead('chi', 'Evaporative deficit (modelled)', 'right')}
                      {sortHead('storativity', 'Storativity (modelled)', 'right')}
                      <th scope="col" className="px-3 py-2 text-left text-caption font-medium text-ink-3">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {sortedCatalogBasins.map((b) => {
                      const p = b.properties;
                      const wStats = windowedStatsByBasin[p.basin_id];
                      const dynamicSlope = wStats?.slope ?? p.theil_sen_slope;
                      const dynamicCiLow = wStats?.ciLow ?? p.theil_sen_ci_low;
                      const dynamicCiHigh = wStats?.ciHigh ?? p.theil_sen_ci_high;
                      const dynamicZ = wStats?.z ?? p.mann_kendall_z;
                      const dynamicQ = qOf(b);
                      const sig = sigOf(b);
                      const tone = regimeTextClass(dynamicSlope, sig);
                      const tri = p.triangulation || {
                        chi_hydro_evap_ratio: 0,
                        skeletal_storativity_s_sk: 1.0,
                        compaction_rate_mm_yr: 0,
                      };
                      const deltaStorageGt = p.area_sqkm * dynamicSlope * 1e-5 * (trendEndYear - trendStartYear);

                      return (
                        <tr key={p.basin_id} className="hover:bg-surface-1">
                          <th scope="row" className="px-3 py-2 text-left font-medium text-ink-1">
                            {p.basin_name}
                          </th>
                          <td className="px-3 py-2 text-ink-2">{p.continent}</td>
                          <td className="tnum whitespace-nowrap px-3 py-2 text-right text-ink-2">{p.area_sqkm.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">
                            <div className={`tnum font-semibold ${tone}`}>{fmtSigned(dynamicSlope, 2)}</div>
                            <div className="tnum whitespace-nowrap text-caption text-ink-3">
                              95% CI {fmtSigned(dynamicCiLow, 2)} to {fmtSigned(dynamicCiHigh, 2)}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="tag">{regimeLabel(dynamicSlope, sig)}</span>
                          </td>
                          <td className={`tnum px-3 py-2 text-right ${tone}`}>{fmtSigned(deltaStorageGt, 1)}</td>
                          <td className="tnum px-3 py-2 text-right text-ink-1">{dynamicZ.toFixed(2)}</td>
                          <td className="tnum px-3 py-2 text-right text-ink-2">
                            {dynamicQ < 0.001 ? '< 0.001' : dynamicQ.toFixed(3)}
                          </td>
                          <td className="tnum px-3 py-2 text-right text-ink-2">{fmtSigned(tri.chi_hydro_evap_ratio, 2)}</td>
                          <td className="tnum px-3 py-2 text-right text-ink-2">{tri.skeletal_storativity_s_sk.toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectBasin(b);
                                  onClose();
                                }}
                                className="btn btn-secondary btn-sm"
                                aria-label={`Show ${p.basin_name} on the map`}
                              >
                                Map
                              </button>
                              <button
                                type="button"
                                onClick={() => onOpenBlockView(b)}
                                className="btn btn-ghost btn-sm"
                                aria-label={`Open the subsurface view of ${p.basin_name}`}
                              >
                                Subsurface
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {sortedCatalogBasins.length === 0 && (
                  <p className="py-6 text-center text-label text-ink-3">No basins match these filters.</p>
                )}
              </div>
            </section>
          </div>
        )}

        {/* ===================== TAB 2: OPPOSITE-TREND PAIRS ===================== */}
        {activeTab === 'dipoles' && (
          <div className="flex flex-col gap-6">
            {!activeDipole ? (
              <p className="text-label text-ink-3">No paired basins are defined in the loaded data.</p>
            ) : (
              <>
                <div role="group" aria-label="Choose a basin pair" className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {dipoleSystems.map((d, idx) => {
                    const isActive = activeDipoleIndex === idx;
                    const passed = [d.invariant1, d.invariant2, d.invariant3].filter(Boolean).length;
                    return (
                      <button
                        key={d.name}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setActiveDipoleIndex(idx)}
                        className={`flex flex-col gap-1 rounded-md border p-3 text-left transition-colors ${
                          isActive ? 'border-accent bg-surface-2' : 'border-line hover:border-line-strong'
                        }`}
                      >
                        <span className="line-clamp-2 text-caption text-ink-3" title={d.category}>{d.category}</span>
                        <span className="text-label font-semibold text-ink-1">{d.name}</span>
                        <span className="text-caption text-ink-2">{d.couplingType}</span>
                        <span className="tnum text-caption text-ink-3">
                          Trend difference {d.metric} cm/yr &middot; {passed} of 3 checks met
                        </span>
                      </button>
                    );
                  })}
                </div>

                <section aria-labelledby="chart-dipole" className="border-t border-line pt-5">
                  <SectionHeader
                    id="chart-dipole"
                    title="Water-storage anomaly in the two basins, 2002 to 2024 (cm)"
                    note="Deseasonalised series for each basin of the selected pair, plotted on one axis."
                    aside={
                      <div className="flex flex-wrap items-center gap-4 text-caption text-ink-2">
                        <span className="flex items-center gap-1.5">
                          <span className="h-0.5 w-4" style={{ background: SERIES[0] }} />
                          {dipoleBasins.upwind?.properties.basin_name || 'First basin'}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="h-0.5 w-4" style={{ background: SERIES[1] }} />
                          {dipoleBasins.downwind?.properties.basin_name || 'Second basin'}
                        </span>
                      </div>
                    }
                  />
                  <div className="mt-3 h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dipoleTimelineData} margin={{ top: 10, right: 20, left: 5, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="2 2" stroke={CHART.grid} />
                        <XAxis dataKey="date" stroke={CHART.axis} tick={CHART.tick} interval={24} />
                        <YAxis
                          stroke={CHART.axis}
                          tick={CHART.tick}
                          tickFormatter={(v) => `${v.toFixed(0)}`}
                          label={axisLabel('Anomaly (cm)', -90)}
                        />
                        <ReferenceLine y={0} stroke={COLORS.lineStrong} strokeWidth={1} />
                        {dipoleGraceGapBounds && (
                          <ReferenceArea
                            x1={dipoleGraceGapBounds.x1}
                            x2={dipoleGraceGapBounds.x2}
                            fill={COLORS.ink3}
                            fillOpacity={0.15}
                            stroke={COLORS.ink3}
                            strokeOpacity={0.5}
                            strokeDasharray="3 3"
                            label={{ value: 'Gap between GRACE and GRACE-FO', position: 'insideTop', fill: COLORS.ink3, fontSize: 11 }}
                          />
                        )}
                        <RechartsTooltip
                          content={<HudTooltip formatter={(v: any) => `${typeof v === 'number' ? v.toFixed(2) : v} cm`} />}
                        />
                        <Line
                          type="monotone"
                          dataKey="upwindVal"
                          name={dipoleBasins.upwind?.properties.basin_name || 'First basin'}
                          stroke={SERIES[0]}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="downwindVal"
                          name={dipoleBasins.downwind?.properties.basin_name || 'Second basin'}
                          stroke={SERIES[1]}
                          strokeWidth={2}
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-6 border-t border-line pt-4 md:grid-cols-2">
                    <div>
                      <h4 className="text-label font-semibold text-ink-1">What the pair shows</h4>
                      <p className="mt-1 text-label text-ink-2">{activeDipole.description}</p>
                      {activeDipole.mechanism && (
                        <p className="mt-2 border-t border-line pt-2 text-caption text-ink-3">
                          Proposed explanation (a hypothesis from the literature, not tested here): {activeDipole.mechanism}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col justify-between gap-3">
                      <div>
                        <h4 className="text-label font-semibold text-ink-1">Pair statistics</h4>
                        <dl className="mt-1 space-y-1 text-label">
                          <div className="flex justify-between gap-3">
                            <dt className="text-ink-3">Difference in trend</dt>
                            <dd className="tnum text-ink-1">{activeDipole.metric} cm/yr</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-ink-3">Relationship</dt>
                            <dd className="text-ink-1">{activeDipole.couplingType}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-ink-3">Correlation of the two anomaly series (r)</dt>
                            <dd className="tnum text-ink-1">{dipoleR === null ? 'n/a' : fmtSigned(dipoleR, 2)}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt className="text-ink-3">FDR q of each trend</dt>
                            <dd className="tnum text-ink-1">
                              {dipoleBasins.upwind?.properties.p_value_fdr?.toFixed(4) ?? 'n/a'} and{' '}
                              {dipoleBasins.downwind?.properties.p_value_fdr?.toFixed(4) ?? 'n/a'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                        {dipoleBasins.upwind && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectBasin(dipoleBasins.upwind!);
                              onClose();
                            }}
                            className="btn btn-secondary btn-sm"
                          >
                            Show {dipoleBasins.upwind.properties.basin_name} on the map
                          </button>
                        )}
                        {dipoleBasins.downwind && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectBasin(dipoleBasins.downwind!);
                              onClose();
                            }}
                            className="btn btn-secondary btn-sm"
                          >
                            Show {dipoleBasins.downwind.properties.basin_name} on the map
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>
        )}

        {/* ===================== TAB 3: CROSS-CHECKS AND SUBSIDENCE ===================== */}
        {activeTab === 'triangulation' && (
          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <section aria-labelledby="chart-tri" className="lg:col-span-2">
                <SectionHeader
                  id="chart-tri"
                  title="Evaporative deficit against inelastic storativity (modelled)"
                  note="Dot size shows the modelled compaction rate in mm/yr. Both axes come from model output, not direct measurement."
                  aside={<span className="tag tag-warn">Modelled</span>}
                />
                <div className="mt-3 h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 20, left: 5, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke={CHART.grid} />
                      <XAxis
                        type="number"
                        dataKey="chi"
                        name="Evaporative deficit ratio"
                        domain={triChiDomain}
                        allowDecimals
                        stroke={CHART.axis}
                        tick={CHART.tick}
                        label={axisLabel('Evaporative deficit ratio (χ_hydro, modelled)', 0, 'bottom')}
                      />
                      <YAxis
                        type="number"
                        dataKey="storativity"
                        name="Inelastic storativity"
                        domain={[0, (max: number) => Math.ceil(max * 1.1)]}
                        stroke={CHART.axis}
                        tick={CHART.tick}
                        label={axisLabel('Storativity S_sk*', -90)}
                      />
                      <ZAxis dataKey="compaction" range={[40, 280]} />
                      <ReferenceLine x={0} stroke={COLORS.lineStrong} strokeWidth={1} />
                      <ReferenceLine
                        y={1.0}
                        stroke={COLORS.warn}
                        strokeDasharray="3 3"
                        label={{ value: 'S_sk* = 1.0', fill: COLORS.ink3, fontSize: 11, position: 'insideTopRight' }}
                      />
                      <RechartsTooltip
                        content={({ active, payload }: any) => {
                          if (!active || !payload || !payload.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="popover p-2.5 text-caption text-ink-2">
                              <div className="mb-1 font-semibold text-ink-1">{d.name}</div>
                              <div>
                                Evaporative deficit (χ_hydro): <span className="tnum font-semibold text-ink-1">{d.chi?.toFixed(2)}</span>
                              </div>
                              <div>
                                Storativity (S_sk*): <span className="tnum font-semibold text-ink-1">{d.storativity?.toFixed(2)}</span>
                              </div>
                              <div>
                                Compaction rate (modelled): <span className="tnum font-semibold text-ink-1">{d.compaction} mm/yr</span>
                              </div>
                              <div className="text-ink-3">Flagged irreversible: {d.irreversible ? 'yes' : 'no'}</div>
                            </div>
                          );
                        }}
                      />
                      <Scatter data={triangulationQuadrantData} isAnimationActive={false}>
                        {triangulationQuadrantData.map((entry, index) => {
                          const flagged = entry.storativity > 1.0 || entry.irreversible;
                          return (
                            <Cell
                              key={`cell-${index}`}
                              fill={flagged ? COLORS.warn : COLORS.ink3}
                              stroke={COLORS.canvas}
                              strokeWidth={0.8}
                              className="cursor-pointer"
                              onClick={() => onSelectBasin(entry.basin)}
                            />
                          );
                        })}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-line pt-3 text-caption sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-ink-1">High χ, high S_sk*</dt>
                    <dd className="text-ink-3">Possible permanent loss of storage.</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-1">Low χ, high S_sk*</dt>
                    <dd className="text-ink-3">Pumping may exceed natural recharge.</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-1">High χ, low S_sk*</dt>
                    <dd className="text-ink-3">Dry air over a resilient aquifer matrix.</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-1">Low χ, low S_sk*</dt>
                    <dd className="text-ink-3">Elastic storage, close to equilibrium.</dd>
                  </div>
                </dl>
                <p className="mt-2 text-caption text-ink-3">
                  Highlighted dots have S_sk* above 1.0 or a modelled irreversible-compaction flag.
                  {triChiNearlyConstant ? ' The modelled evaporative deficit is close to zero for almost every basin, so the dots line up in one column; read the vertical position.' : ''}
                </p>
              </section>

              <section aria-labelledby="chart-lag" className="flex flex-col justify-between lg:border-l lg:border-line lg:pl-8">
                <div>
                  <SectionHeader
                    id="chart-lag"
                    title="Lag between rainfall and vegetation (months, modelled)"
                    note="Ten basins with the shortest lag. Lag is the cross-correlation delay between rainfall and a modelled vegetation index."
                  />
                  <div className="mt-3 h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={biosphericResilienceData.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 40, left: 5, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="2 2" stroke={CHART.grid} horizontal={false} />
                        <XAxis
                          type="number"
                          domain={[0, (max: number) => Math.max(2, Math.ceil(max * 1.2))]}
                          allowDecimals={false}
                          stroke={CHART.axis}
                          tick={CHART.tick}
                          label={axisLabel('Lag (months)', 0, 'bottom')}
                        />
                        <YAxis dataKey="shortName" type="category" stroke={CHART.axis} tick={CHART.tick} tickFormatter={clipLabelLong} interval={0} width={150} />
                        <ReferenceLine x={1.0} stroke={COLORS.warn} strokeDasharray="3 3" />
                        <RechartsTooltip content={<HudTooltip formatter={(v: any) => `${v} months`} />} />
                        <Bar dataKey="lag" name="Lag" isAnimationActive={false} minPointSize={2}>
                          <LabelList dataKey="lag" position="right" formatter={(v: any) => `${v} mo`} fill={COLORS.ink2} fontSize={11} />
                          {biosphericResilienceData.slice(0, 10).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.lag <= 1.0 ? COLORS.warn : COLORS.ink2} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <p className="mt-3 border-t border-line pt-3 text-caption text-ink-3">
                  <span className="font-semibold text-warn">Caution.</span> A lag of 1 month or less (dashed line, amber bars)
                  suggests vegetation follows rainfall closely and may no longer draw on deeper water. This is an
                  interpretation of a modelled series, not an observation.
                </p>
              </section>
            </div>

            <section aria-labelledby="chart-subsidence" className="border-t border-line pt-6">
              <SectionHeader
                id="chart-subsidence"
                title="Land subsidence rate by basin (mm/yr, modelled)"
                note="Estimated from a compaction model, not measured by satellite radar (InSAR). Click a bar to open the basin."
                aside={
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tag tag-warn">Modelled, not InSAR</span>
                    <span className="tnum text-caption text-ink-3">
                      {globalKpis.irreversibleCount} basins flagged irreversible or at 20 mm/yr or more
                    </span>
                  </div>
                }
              />
              <div className="mt-3 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={subsidenceRankedData} margin={{ top: 10, right: 10, left: 5, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke={CHART.grid} vertical={false} />
                    <XAxis
                      dataKey="shortName"
                      angle={-45}
                      textAnchor="end"
                      interval={0}
                      tick={CHART.tick}
                      tickFormatter={clipLabel}
                      stroke={CHART.axis}
                      height={80}
                    />
                    <YAxis stroke={CHART.axis} tick={CHART.tick} label={axisLabel('mm/yr', -90)} />
                    <ReferenceLine
                      y={20}
                      stroke={COLORS.warn}
                      strokeDasharray="3 3"
                      label={{ value: '20 mm/yr hazard line (modelled)', fill: COLORS.ink3, fontSize: 11, position: 'top' }}
                    />
                    <RechartsTooltip content={<HudTooltip formatter={(v: any) => `${v} mm/yr`} />} />
                    <Bar dataKey="rate" name="Compaction rate" isAnimationActive={false}>
                      {subsidenceRankedData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.rate >= 20 ? COLORS.warn : COLORS.ink3}
                          className="cursor-pointer"
                          onClick={() => onSelectBasin(entry.basin)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        )}

        {/* ===================== TAB 4: PHASE PORTRAITS ===================== */}
        {activeTab === 'attractors' && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
              <SectionHeader
                id="portraits-title"
                title="Water level against vegetation index, four benchmark basins"
                note="Each line is one basin's path through time, 2002 to 2024, smoothed with a 12-month running mean; arrows show the direction of time and faint dots are the monthly values. Both series are modelled. Dim is early, bright is recent."
              />
              <div className="flex items-center gap-2 text-caption text-ink-2" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: timeRamp(0) }} /> 2002
                <span className="h-px w-8 bg-line-strong" />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: timeRamp(1) }} /> 2024
              </div>
            </div>

            <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
              {benchmarkAttractors.map((attractor) => {
                const basin = attractor.basin;
                const ts = basin?.properties.time_series;
                const timestamps = ts?.timestamps || [];
                const swot = ts?.swot_wse || [];
                const ndvi = ts?.modis_ndvi || [];

                const points = timestamps.map((t, idx) => ({
                  date: t,
                  x: swot[idx] ?? 0,
                  y: ndvi[idx] ?? 0.4,
                  ratio: timestamps.length > 1 ? idx / (timestamps.length - 1) : 0,
                }));

                const smooth = points.map((p, idx) => {
                  const win = points.slice(Math.max(0, idx - 11), idx + 1);
                  return {
                    x: win.reduce((a, q) => a + q.x, 0) / win.length,
                    y: win.reduce((a, q) => a + q.y, 0) / win.length,
                    ratio: p.ratio,
                  };
                });
                const xs = points.map((p) => p.x);
                const ys = points.map((p) => p.y);
                const xMin = xs.length ? Math.min(...xs) - 2 : -10;
                const xMax = xs.length ? Math.max(...xs) + 2 : 10;
                const yMin = ys.length ? Math.max(0, Math.min(...ys) - 0.05) : 0.2;
                const yMax = ys.length ? Math.min(1.0, Math.max(...ys) + 0.05) : 0.8;

                const width = 520;
                const height = 280;
                const pad = { top: 16, right: 16, bottom: 40, left: 54 };
                const pw = width - pad.left - pad.right;
                const ph = height - pad.top - pad.bottom;

                const mapX = (v: number) => pad.left + ((v - xMin) / (xMax - xMin || 1)) * pw;
                const mapY = (v: number) => pad.top + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;
                const yMid = (yMin + yMax) / 2;

                return (
                  <section key={attractor.title} aria-label={attractor.title} className="flex flex-col justify-between border-t border-line pt-4">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-body font-semibold text-ink-1">{attractor.title}</h3>
                        <span className={attractor.collapsed ? 'tag tag-warn' : 'tag'}>
                          {attractor.collapsed ? 'Vegetation buffer shrinking' : 'Stable seasonal cycle'}
                        </span>
                      </div>
                      <p className="tnum mt-1 text-caption text-ink-3">
                        {attractor.lagMonths !== undefined ? `Rainfall to vegetation lag ${attractor.lagMonths} mo` : 'Lag not available'}
                        {attractor.compaction !== undefined ? ` · compaction ${attractor.compaction} mm/yr` : ''}
                        {attractor.storativity !== undefined ? ` · S_sk* ${attractor.storativity.toFixed(2)}` : ''}
                        {' (modelled)'}
                      </p>

                      <svg
                        viewBox={`0 0 ${width} ${height}`}
                        className="mt-2 h-auto w-full select-none"
                        role="img"
                        aria-label={`Phase portrait for ${attractor.title}: modelled water-level anomaly against modelled vegetation index, 2002 to 2024`}
                      >
                        <line x1={mapX(0)} y1={pad.top} x2={mapX(0)} y2={pad.top + ph} stroke={COLORS.line} strokeDasharray="2 2" />
                        <line x1={pad.left} y1={mapY(yMid)} x2={pad.left + pw} y2={mapY(yMid)} stroke={COLORS.line} strokeDasharray="2 2" />
                        <line x1={pad.left} y1={pad.top + ph} x2={pad.left + pw} y2={pad.top + ph} stroke={COLORS.lineStrong} />
                        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + ph} stroke={COLORS.lineStrong} />

                        <text x={pad.left - 6} y={pad.top + 4} fill={COLORS.ink3} fontSize={11} textAnchor="end">
                          {yMax.toFixed(2)}
                        </text>
                        <text x={pad.left - 6} y={pad.top + ph} fill={COLORS.ink3} fontSize={11} textAnchor="end">
                          {yMin.toFixed(2)}
                        </text>
                        <text x={pad.left} y={pad.top + ph + 14} fill={COLORS.ink3} fontSize={11} textAnchor="start">
                          {xMin.toFixed(0)}
                        </text>
                        <text x={pad.left + pw} y={pad.top + ph + 14} fill={COLORS.ink3} fontSize={11} textAnchor="end">
                          {xMax.toFixed(0)}
                        </text>

                        <text x={pad.left + pw / 2} y={height - 6} fill={COLORS.ink2} fontSize={11} textAnchor="middle">
                          Water-level anomaly (cm, modelled series)
                        </text>
                        <text
                          x={12}
                          y={pad.top + ph / 2}
                          fill={COLORS.ink2}
                          fontSize={11}
                          textAnchor="middle"
                          transform={`rotate(-90 12 ${pad.top + ph / 2})`}
                        >
                          Vegetation index (modelled proxy)
                        </text>

                        {smooth.slice(0, -1).map((p, idx) => {
                          const n = smooth[idx + 1];
                          return (
                            <line
                              key={`seg-${idx}`}
                              x1={mapX(p.x)}
                              y1={mapY(p.y)}
                              x2={mapX(n.x)}
                              y2={mapY(n.y)}
                              stroke={timeRamp(p.ratio)}
                              strokeWidth={2}
                              strokeLinecap="round"
                            />
                          );
                        })}

                        {smooth.map((p, idx) => {
                          if (idx < 12 || idx >= smooth.length - 1 || idx % 24 !== 0) return null;
                          const n = smooth[idx + 1];
                          const ang = (Math.atan2(mapY(n.y) - mapY(p.y), mapX(n.x) - mapX(p.x)) * 180) / Math.PI;
                          return (
                            <polygon
                              key={`arrow-${idx}`}
                              points="5,0 -4,4 -4,-4"
                              fill={timeRamp(p.ratio)}
                              stroke={COLORS.canvas}
                              strokeWidth={0.5}
                              transform={`translate(${mapX(p.x)} ${mapY(p.y)}) rotate(${ang})`}
                            />
                          );
                        })}

                        {points.map((p, idx) => (
                          <circle
                            key={idx}
                            cx={mapX(p.x)}
                            cy={mapY(p.y)}
                            r={idx === 0 || idx === points.length - 1 ? 4 : 1.5}
                            fill={timeRamp(p.ratio)}
                            fillOpacity={idx === 0 || idx === points.length - 1 ? 1 : 0.35}
                            stroke={COLORS.canvas}
                            strokeWidth={idx === points.length - 1 ? 1 : 0.3}
                          >
                            <title>{`${p.date}: water-level anomaly ${p.x.toFixed(2)} cm, vegetation index ${p.y.toFixed(3)}`}</title>
                          </circle>
                        ))}
                      </svg>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                      <span className="tnum text-caption text-ink-3">{points.length} monthly points, 2002 to 2024</span>
                      {basin && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onSelectBasin(basin);
                              onClose();
                            }}
                            className="btn btn-secondary btn-sm"
                          >
                            Show on map
                          </button>
                          <button type="button" onClick={() => onOpenBlockView(basin)} className="btn btn-ghost btn-sm">
                            Subsurface view
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================== TAB 5: WATER BUDGET TO 2035 ===================== */}
        {activeTab === 'budget' && (
          <div className="flex flex-col gap-8">
            <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="min-w-0">
                <dt className="text-caption text-ink-3">Water gained, wetting basins</dt>
                <dd className="tnum text-title font-semibold text-wet-3">
                  +{continentalMassBudget.gainGt.toLocaleString()} <span className="text-label font-normal text-ink-2">Gt/yr</span>
                </dd>
                <dd className="mt-1 text-caption text-ink-3">
                  Summed over {continentalMassBudget.wettingBasins} basins with a rising trend (area &times; trend).
                </dd>
              </div>
              <div className="min-w-0 border-line md:border-l md:pl-4">
                <dt className="text-caption text-ink-3">Water lost, drying basins</dt>
                <dd className="tnum text-title font-semibold text-dry-3">
                  &minus;{continentalMassBudget.lossGt.toLocaleString()} <span className="text-label font-normal text-ink-2">Gt/yr</span>
                </dd>
                <dd className="mt-1 text-caption text-ink-3">
                  Summed over {continentalMassBudget.dryingBasins} basins with a falling trend (area &times; trend).
                </dd>
              </div>
              <div className="min-w-0 border-line md:border-l md:pl-4">
                <dt className="text-caption text-ink-3">Sea-level equivalent of these basins</dt>
                <dd className="tnum text-title font-semibold text-ink-1">
                  {fmtSigned(continentalMassBudget.netGmslRiseMm, 3)} <span className="text-label font-normal text-ink-2">mm/yr</span>
                </dd>
                <dd className="mt-1 text-caption text-ink-3">
                  (Lost &minus; gained) &divide; 361.8. Covers only these {globalKpis.total} basins, so it is not a global sea-level figure.
                </dd>
              </div>
            </dl>

            {/* Projection horizon */}
            <section aria-labelledby="horizon-title" className="flex flex-col gap-3 border-t border-line pt-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <h3 id="horizon-title" className="text-label font-semibold text-ink-1">
                  Period shown: <span className="tnum font-normal text-ink-2">{budgetStartYear} to {budgetEndYear} ({budgetEndYear - budgetStartYear} years)</span>
                </h3>
                <div className="seg" role="group" aria-label="Period presets">
                  <button
                    type="button"
                    className="seg-item"
                    aria-pressed={budgetStartYear === 2002 && budgetEndYear === 2024}
                    onClick={() => {
                      setBudgetStartYear(2002);
                      setBudgetEndYear(2024);
                    }}
                  >
                    Observed (2002&ndash;2024)
                  </button>
                  <button
                    type="button"
                    className="seg-item"
                    aria-pressed={budgetStartYear === 2002 && budgetEndYear === 2035}
                    onClick={() => {
                      setBudgetStartYear(2002);
                      setBudgetEndYear(2035);
                    }}
                  >
                    Observed and extrapolated (2002&ndash;2035)
                  </button>
                  <button
                    type="button"
                    className="seg-item"
                    aria-pressed={budgetStartYear === 2024 && budgetEndYear === 2035}
                    onClick={() => {
                      setBudgetStartYear(2024);
                      setBudgetEndYear(2035);
                    }}
                  >
                    Extrapolated only (2024&ndash;2035)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-3 text-caption text-ink-3">
                  <span className="w-16 shrink-0">Start year</span>
                  <input
                    type="range"
                    min={2002}
                    max={budgetEndYear - 1}
                    value={budgetStartYear}
                    onChange={(e) => setBudgetStartYear(Math.min(Number(e.target.value), budgetEndYear - 1))}
                    className="h-6 w-full cursor-pointer accent-accent"
                  />
                  <span className="tnum w-10 text-right text-label text-ink-1">{budgetStartYear}</span>
                </label>
                <label className="flex items-center gap-3 text-caption text-ink-3">
                  <span className="w-16 shrink-0">End year</span>
                  <input
                    type="range"
                    min={budgetStartYear + 1}
                    max={2035}
                    value={budgetEndYear}
                    onChange={(e) => setBudgetEndYear(Math.max(Number(e.target.value), budgetStartYear + 1))}
                    className="h-6 w-full cursor-pointer accent-accent"
                  />
                  <span className="tnum w-10 text-right text-label text-ink-1">{budgetEndYear}</span>
                </label>
              </div>
            </section>

            {/* Chart 5A */}
            <section aria-labelledby="chart-budget" className="border-t border-line pt-5">
              <SectionHeader
                id="chart-budget"
                title="Cumulative water deficit in drying basins (Gt)"
                note="Each basin's 2002 to 2024 Theil-Sen trend carried forward as a straight line, then summed. The band is the sum of the Theil-Sen 95% confidence intervals."
                aside={
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-2">
                    <span className="tag tag-warn">Straight-line extrapolation</span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-0.5 w-4 bg-dry-3" /> Median
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-4 rounded-sm border border-dry-3 bg-dry-3/20" /> 95% confidence band
                    </span>
                  </div>
                }
              />

              <div className="mt-3 h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={budgetProjectionData} margin={{ top: 15, right: 20, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke={CHART.grid} />
                    <XAxis dataKey="year" stroke={CHART.axis} tick={CHART.tick} interval={3} label={axisLabel('Year', 0, 'bottom')} />
                    <YAxis
                      stroke={CHART.axis}
                      tick={CHART.tick}
                      tickFormatter={(v) => v.toLocaleString()}
                      label={axisLabel('Gt', -90)}
                    />
                    {showExtrapolation && (
                      <ReferenceArea x1="2024" x2={`${budgetEndYear}`} fill={COLORS.ink3} fillOpacity={0.08} />
                    )}
                    <ReferenceLine
                      x="2024"
                      stroke={COLORS.ink3}
                      strokeWidth={1.5}
                      label={{ value: 'Last observation (2024)', fill: COLORS.ink3, fontSize: 11, position: 'top' }}
                    />
                    <RechartsTooltip
                      content={
                        <HudTooltip
                          formatter={(v: any, name: string) => {
                            if (name === 'Upper bound') return `${v.toLocaleString()} Gt`;
                            if (name === 'Lower bound') return `${v.toLocaleString()} Gt`;
                            return `${v.toLocaleString()} Gt`;
                          }}
                        />
                      }
                    />
                    <Area
                      type="monotone"
                      dataKey="ciHigh"
                      stroke={COLORS.dry3}
                      strokeOpacity={0.4}
                      fill={COLORS.dry3}
                      fillOpacity={0.18}
                      name="Upper bound"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="projectedMedian"
                      stroke={COLORS.dry3}
                      strokeWidth={2.5}
                      fill="transparent"
                      name="Median"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="ciLow"
                      stroke={COLORS.dry3}
                      strokeOpacity={0.4}
                      fill={COLORS.canvas}
                      fillOpacity={1}
                      name="Lower bound"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <p className="tnum mt-2 border-t border-line pt-2 text-caption text-ink-3">
                {lastBudget
                  ? `By ${budgetEndYear}, if every drying basin keeps its 2002 to 2024 rate, the cumulative deficit reaches about ${gtFmt(lastBudget.projectedMedian)} Gt (95% interval ${gtFmt(lastBudget.ciLow)} to ${gtFmt(lastBudget.ciHigh)} Gt). `
                  : ''}
                Counts basins whose trend is below &minus;0.2 cm/yr. 1 Gt of water is about 1 km&sup3;. Years after 2024 are an
                extrapolation, not a forecast.
              </p>
            </section>

            {/* Chart 5B */}
            <section aria-labelledby="chart-continents" className="border-t border-line pt-5">
              <SectionHeader
                id="chart-continents"
                title={`Water lost by continent, ${trendStartYear} to ${trendEndYear} (Gt)`}
                note="Sum over basins with a falling trend, using the trend window chosen on the first tab."
              />
              <div className="mt-3 h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={continentalDeficitData} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="2 2" stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="continent" stroke={CHART.axis} tick={CHART.tick} />
                    <YAxis stroke={CHART.axis} tick={CHART.tick} label={axisLabel('Gt', -90)} />
                    <RechartsTooltip content={<HudTooltip formatter={(v: any) => `${v.toLocaleString()} Gt`} />} />
                    <Bar dataKey="lossGt" name="Water lost" fill={COLORS.ink2} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

/** Title, one-line note and an optional right-hand aside for a chart or table section. */
function SectionHeader({ id, title, note, aside }: { id: string; title: string; note?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h3 id={id} className="text-body font-semibold text-ink-1">
          {title}
        </h3>
        {note && <p className="mt-0.5 text-caption text-ink-3">{note}</p>}
      </div>
      {aside}
    </div>
  );
}
