import { useState, useMemo } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  X,
  Check,
  Droplets,
  Waves,
  BookOpen,
  Flame,
  CloudRain,
  Wind,
  Thermometer,
  Sprout,
  type LucideIcon,
} from 'lucide-react';
import { useModalDialog } from './shell/useModalDialog';
import { fmtSigned } from './shell/shellUtils';
import type { MonitoredVariable } from './MultiSensorStack';
import type { LayerKind } from '../lib/gibs';
import type { BasinFeature } from './Globe';
import { matchesEarthClassOrArchetype } from '../lib/earthClasses';

export interface DetectivePlan {
  basinId: string;
  variable: MonitoredVariable;
  layer: LayerKind;
  year: number;
  activateCase07?: boolean;
  summaryText: string;
}

export interface DetectiveIntakeWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (plan: DetectivePlan) => void;
  allBasins?: BasinFeature[];
}

interface BiomeOption {
  id: string;
  title: string;
  examples: string;
  targetBasinId: string;
  badge: string;
  rationale: string;
  primarySensors: string;
}

interface SymptomOption {
  id: string;
  title: string;
  subtitle: string;
  variable: MonitoredVariable;
  layer: LayerKind;
  badge: string;
  /** True when the series is a modelled proxy, so the tag carries the caution style. */
  modelled?: boolean;
  rationale: string;
  icon: LucideIcon;
}

interface EraOption {
  id: string;
  title: string;
  subtitle: string;
  year: number;
  activateCase07: boolean;
  badge: string;
  curated?: boolean;
  rationale: string;
}

const BIOME_OPTIONS: BiomeOption[] = [
  {
    id: 'DESERT',
    title: 'Desert and arid interior',
    examples: 'Great Basin, Sahel, Lake Urmia, Tigris-Euphrates',
    targetBasinId: 'BASIN_GREAT_BASIN_EAST',
    badge: 'Arid, closed basins',
    rationale:
      'Inland closed catchments with rainfall deficits, shrinking terminal lakes and aquifer extraction.',
    primarySensors: 'GRACE observed · NASA POWER reanalysis (rainfall, temperature, soil moisture)',
  },
  {
    id: 'RAINFOREST',
    title: 'Tropical rainforest and peatlands',
    examples: 'Lower Amazon, Congo, Sebangau Peat (Kalimantan)',
    targetBasinId: 'BASIN_AMAZON_LOWER',
    badge: 'Equatorial tropics',
    rationale:
      'Moisture-recycling forests that can be hit by drought, canal drainage and smouldering peat fires.',
    primarySensors: 'GRACE observed · NASA POWER rainfall (reanalysis) · NDVI (modelled proxy)',
  },
  {
    id: 'TIDAL_ESTUARY',
    title: 'Tidal estuary and river delta',
    examples: 'Yangtze Delta, Ganges-Brahmaputra, Mississippi Delta',
    targetBasinId: 'BASIN_YANGTZE',
    badge: 'Deltas and monsoon',
    rationale:
      'Large deltas and estuaries balancing monsoon floods against sea-level rise and sinking land.',
    primarySensors: 'GRACE observed · NASA POWER rainfall (reanalysis) · Surface water elevation (modelled proxy)',
  },
  {
    id: 'MEGACITY_ATMOSPHERE',
    title: 'Megacity air and groundwater',
    examples: 'Singapore/Jakarta haze, Pearl River, California Central Valley',
    targetBasinId: 'BASIN_CALIFORNIA_CV',
    badge: 'Cities and airsheds',
    rationale:
      'Dense populations exposed to cross-border smoke plumes and heavy aquifer pumping.',
    primarySensors: 'GRACE observed · Subsidence (modelled proxy) · AIRS and OMI imagery layers',
  },
  {
    id: 'CRYOSPHERE',
    title: 'Polar ice sheet and glaciers',
    examples: 'West Antarctica, Greenland, Qinghai-Tibetan Plateau',
    targetBasinId: 'BASIN_WEST_ANTARCTICA',
    badge: 'Polar mass loss',
    rationale:
      'Ice-covered catchments losing mass, which feeds sea-level rise.',
    primarySensors: 'GRACE observed (basin water-storage trend)',
  },
];

const SYMPTOM_OPTIONS: SymptomOption[] = [
  {
    id: 'tws_depletion',
    title: 'Groundwater depletion or severe drought',
    subtitle: 'Aquifer overdraft, falling water tables and sinking land',
    variable: 'tws',
    layer: 'grace-ewt',
    icon: Droplets,
    badge: 'GRACE observed',
    rationale:
      'GRACE measures changes in gravity from space, so it detects mass loss through cloud and canopy.',
  },
  {
    id: 'pluvial_flooding',
    title: 'Flooding and water surplus',
    subtitle: 'Extreme monsoon rain, saturated soils and catchment surplus',
    variable: 'precip',
    layer: 'precipitation',
    icon: CloudRain,
    badge: 'NASA POWER reanalysis',
    rationale:
      'Rainfall here is a model-based reanalysis estimate (NASA POWER, MERRA-2), not a direct satellite measurement.',
  },
  {
    id: 'evapotranspiration',
    title: 'Evaporation and moisture recycling',
    subtitle: 'Atmospheric evaporative demand and plant transpiration',
    variable: 'et',
    layer: 'base',
    icon: Wind,
    badge: 'Modelled proxy',
    modelled: true,
    rationale:
      'Estimated in the browser from surface values and a water balance; it is not a GLDAS product.',
  },
  {
    id: 'river_runoff',
    title: 'River flow and delta runoff',
    subtitle: 'Water leaving the catchment through rivers and surface runoff',
    variable: 'runoff',
    layer: 'base',
    icon: Waves,
    badge: 'Modelled proxy',
    modelled: true,
    rationale:
      'Estimated from the water balance (rain minus evaporation minus storage change); it is not a SWOT or GLDAS measurement.',
  },
  {
    id: 'surface_warming',
    title: 'Surface warming and heat stress',
    subtitle: 'Higher near-surface temperature and evaporative stress',
    variable: 'temp',
    layer: 'surface-temp',
    icon: Thermometer,
    badge: 'NASA POWER reanalysis',
    rationale:
      'Air temperature at 2 metres from NASA POWER (MERRA-2), one point per region.',
  },
  {
    id: 'smoke_haze',
    title: 'Smoke, haze and trace gases',
    subtitle: 'Peat smouldering emissions, with NO₂ and CO lofted into the mid-troposphere',
    variable: 'no2',
    layer: 'OMI_NO2',
    icon: Flame,
    badge: 'Modelled proxy',
    modelled: true,
    rationale:
      'The NO₂ and CO values in the charts are synthetic. The globe layer is real archive imagery from NASA GIBS.',
  },
  {
    id: 'veg_dieback',
    title: 'Vegetation stress and crop dieback',
    subtitle: 'Root-zone moisture shortage and agricultural strain',
    variable: 'soil',
    layer: 'ndvi',
    icon: Sprout,
    badge: 'NASA POWER reanalysis',
    rationale:
      'Soil moisture comes from NASA POWER (reanalysis). The NDVI series shown beside it is a modelled proxy, not MODIS.',
  },
];

const ERA_OPTIONS: EraOption[] = [
  {
    id: 'full_record',
    title: 'Full satellite record',
    subtitle: '2002 to 2024 (22 years of GRACE and GRACE-FO)',
    year: 2024,
    activateCase07: false,
    badge: '2002 to 2024',
    rationale:
      'Best for long-term trends (Theil-Sen slope) and for spotting regime shifts with a Pettitt test.',
  },
  {
    id: 'modern_era',
    title: 'Recent years',
    subtitle: '2018 to 2024 (GRACE-FO era)',
    year: 2024,
    activateCase07: false,
    badge: '2018 to 2024',
    rationale:
      'A shorter window on the GRACE-FO record. Surface water elevation in this app is a modelled proxy, not SWOT.',
  },
  {
    id: 'live_crisis',
    title: 'October 2026 smoke scenario',
    subtitle: 'SE Asia peat dewatering and a 5,500 m carbon monoxide plume',
    year: 2024,
    activateCase07: true,
    badge: 'Curated scenario',
    curated: true,
    rationale:
      'An illustrative scenario built from archive AIRS imagery. The fire and plume events are curated, not measured here.',
  },
];

interface LiteraturePreset {
  id: string;
  citation: string;
  authors: string;
  journal: string;
  title: string;
  summary: string;
  targetBiomeId: string;
  targetSymptomId: string;
  targetEraId: string;
  targetBasinId: string;
  badge: string;
  tag: string;
}

const LITERATURE_PRESETS: LiteraturePreset[] = [
  {
    id: 'famiglietti-2011',
    citation: 'Famiglietti et al. (2011)',
    authors: 'Famiglietti, Lo, Ho, Bethune, Anderson, Syed, Swenson, de Linage, & Rodell',
    journal: 'Geophys. Res. Lett., 38, L03403',
    title: "Satellites measure recent groundwater depletion in California's Central Valley",
    summary: 'GRACE gravimetry reveals massive unconfined aquifer overdraft exceeding natural recharge during California drought cycles.',
    targetBiomeId: 'MEGACITY_ATMOSPHERE',
    targetSymptomId: 'tws_depletion',
    targetEraId: 'full_record',
    targetBasinId: 'BASIN_CALIFORNIA_CV',
    badge: 'Groundwater overdraft',
    tag: 'California Central Valley',
  },
  {
    id: 'rodell-2009',
    citation: 'Rodell et al. (2009)',
    authors: 'Rodell, Velicogna, & Famiglietti',
    journal: 'Nature 460, 999–1002',
    title: 'Satellite-based estimates of groundwater depletion in India',
    summary: 'Secular loss of 54 ± 9 km³ of groundwater over northern India driven by intensive tube-well irrigation independent of precipitation.',
    targetBiomeId: 'DESERT',
    targetSymptomId: 'tws_depletion',
    targetEraId: 'full_record',
    targetBasinId: 'BASIN_INDUS',
    badge: 'Irrigation depletion',
    tag: 'Indus and northern India',
  },
  {
    id: 'rodell-2018',
    citation: 'Rodell et al. (2018)',
    authors: 'Rodell, Famiglietti, Wiese, Reager, Beaudoing, Landerer, & Lo',
    journal: 'Nature 557, 651–659',
    title: 'Emerging trends in global freshwater availability',
    summary: 'Comprehensive 34-hotspot assessment attributing global TWS trends across direct human extraction, climate change, and multi-decadal cycles.',
    targetBiomeId: 'RAINFOREST',
    targetSymptomId: 'pluvial_flooding',
    targetEraId: 'modern_era',
    targetBasinId: 'BASIN_AMAZON_LOWER',
    badge: 'Global freshwater',
    tag: 'Amazon Basin freshwater',
  },
  {
    id: 'asmc-2026',
    citation: 'ASMC & CAMS (2026)',
    authors: 'ASEAN Specialised Meteorological Centre & Copernicus Atmosphere Monitoring Service',
    journal: 'ASMC & WMO Regional Meteorological Technical Report',
    title: 'Southeast Asian Peatland Fires & 500 hPa Transboundary Plume Dispersion',
    summary: 'Tropical peat dewatering triggering smoldering sub-surface combustion and lofting massive carbon monoxide and NO₂ plumes across Sundaland.',
    targetBiomeId: 'RAINFOREST',
    targetSymptomId: 'smoke_haze',
    targetEraId: 'live_crisis',
    targetBasinId: 'BASIN_AMAZON_LOWER',
    badge: 'Curated scenario',
    tag: 'SE Asia peat smoke, Case 07',
  },
];

function getBasinVariableTrendRate(b: BasinFeature, variable: MonitoredVariable): number {
  if (variable === 'tws') {
    return Math.abs(b.properties.theil_sen_slope);
  }
  if (variable === 'precip') {
    const p = b.properties.time_series?.precip_anom;
    if (p && p.length > 1) {
      return Math.abs(p[p.length - 1] - p[0]);
    }
    return Math.abs(b.properties.theil_sen_slope * 1.6);
  }
  if (variable === 'et') {
    const vpd = b.properties.time_series?.atmospheric_vpd;
    if (vpd && vpd.length > 1) {
      return Math.abs(vpd[vpd.length - 1] - vpd[0]);
    }
    return (b.properties.triangulation?.chi_hydro_evap_ratio ?? 0.8) * Math.abs(b.properties.theil_sen_slope);
  }
  if (variable === 'runoff') {
    const wse = b.properties.time_series?.swot_wse;
    if (wse && wse.length > 1) {
      return Math.abs(wse[wse.length - 1] - wse[0]);
    }
    return Math.abs(b.properties.theil_sen_slope * 0.9);
  }
  if (variable === 'temp') {
    return Math.abs(b.properties.theil_sen_slope * 0.35 + (b.properties.mann_kendall_z ? Math.abs(b.properties.mann_kendall_z) * 0.1 : 0.2));
  }
  if (variable === 'soil') {
    const ndvi = b.properties.time_series?.modis_ndvi;
    if (ndvi && ndvi.length > 1) {
      return Math.abs(ndvi[ndvi.length - 1] - ndvi[0]);
    }
    return Math.abs(b.properties.theil_sen_slope * 0.05);
  }
  if (variable === 'no2') {
    const slope = b.properties.theil_sen_slope ?? 0;
    const isMegacity =
      b.properties.earth_classes?.some((c: string) =>
        c.toUpperCase().includes('MEGACITY')
      ) || matchesEarthClassOrArchetype(b, 'MEGACITY_ATMOSPHERE');
    return (isMegacity ? 2.5 : 0.8) * Math.abs(slope);
  }
  return Math.abs(b.properties.theil_sen_slope);
}

export default function DetectiveIntakeWizard({
  isOpen,
  onClose,
  onComplete,
  allBasins = [],
}: DetectiveIntakeWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedBiomeId, setSelectedBiomeId] = useState<string>('DESERT');
  const [selectedSymptomId, setSelectedSymptomId] = useState<string>('tws_depletion');
  const [selectedEraId, setSelectedEraId] = useState<string>('full_record');
  const [candidateBasinId, setCandidateBasinId] = useState<string | null>(null);
  const dialog = useModalDialog<HTMLDivElement>(onClose, isOpen);

  const selectedBiome = useMemo(
    () => BIOME_OPTIONS.find((b) => b.id === selectedBiomeId) || BIOME_OPTIONS[0],
    [selectedBiomeId]
  );

  const selectedSymptom = useMemo(
    () => SYMPTOM_OPTIONS.find((s) => s.id === selectedSymptomId) || SYMPTOM_OPTIONS[0],
    [selectedSymptomId]
  );

  const selectedEra = useMemo(
    () => ERA_OPTIONS.find((e) => e.id === selectedEraId) || ERA_OPTIONS[0],
    [selectedEraId]
  );

  // Dynamically filter allBasins by chosen biome archetype and rank by chosen variable trend
  const candidateHotspots = useMemo(() => {
    if (!allBasins || allBasins.length === 0) return [];

    const matched = allBasins.filter((b) => matchesEarthClassOrArchetype(b, selectedBiome.id));
    const pool = matched.length >= 3 ? matched : allBasins;

    return [...pool]
      .sort((a, b) => {
        const rateA = getBasinVariableTrendRate(a, selectedSymptom.variable);
        const rateB = getBasinVariableTrendRate(b, selectedSymptom.variable);
        return rateB - rateA;
      })
      .slice(0, 3);
  }, [allBasins, selectedBiome.id, selectedSymptom.variable]);

  // Compute final investigation plan
  const plan: DetectivePlan = useMemo(() => {
    const isLiveCrisis = selectedEra.activateCase07;
    let targetBasinId = candidateBasinId || (candidateHotspots[0]?.properties.basin_id) || selectedBiome.targetBasinId;

    // If megacity + smoke/live crisis selected without explicit choice, point to Case 07 or Central Valley
    if (selectedBiome.id === 'MEGACITY_ATMOSPHERE' && (isLiveCrisis || selectedSymptom.id === 'smoke_haze')) {
      targetBasinId = candidateBasinId || 'BASIN_CALIFORNIA_CV';
    }

    const summaryText = `Investigating ${selectedBiome.title} (${selectedBiome.examples}) focusing on ${selectedSymptom.title} across the ${selectedEra.title}.`;

    return {
      basinId: targetBasinId,
      variable: selectedSymptom.variable,
      layer: selectedSymptom.layer,
      year: selectedEra.year,
      activateCase07: isLiveCrisis || (selectedBiome.id === 'MEGACITY_ATMOSPHERE' && selectedSymptom.id === 'smoke_haze'),
      summaryText,
    };
  }, [selectedBiome, selectedSymptom, selectedEra, candidateBasinId, candidateHotspots]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (step === 1) setStep(2);
    else if (step === 2) setStep(3);
    else {
      onComplete(plan);
    }
  };

  const handleBack = () => {
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  };

  const STEPS = ['Region type', 'What is changing', 'Time window'] as const;
  const planBasin = allBasins.find((b) => b.properties.basin_id === plan.basinId || b.id === plan.basinId);

  const optionClass = (selected: boolean) =>
    `w-full text-left px-3 py-3 rounded-md border transition-colors cursor-pointer ${
      selected ? 'bg-surface-2 border-line-strong' : 'bg-transparent border-line hover:border-line-strong'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <div
        {...dialog.props}
        aria-labelledby="intake-title"
        onClick={(e) => e.stopPropagation()}
        className="popover w-full max-w-4xl flex flex-col max-h-[92vh] overflow-hidden outline-none"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-4">
          <div>
            <h2 id="intake-title" className="text-title text-ink-1 font-semibold">
              Start with a question
            </h2>
            <p className="text-label text-ink-2 mt-1">
              Three short questions set up the map, the variable and the time window for your investigation.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn btn-ghost btn-sm shrink-0 w-7 px-0"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Stepper */}
        <ol className="px-5 py-3 border-b border-line bg-surface-1 flex items-center gap-3 text-label" aria-label="Progress">
          {STEPS.map((name, i) => {
            const n = i + 1;
            const active = step === n;
            const done = step > n;
            return (
              <li key={name} className="flex items-center gap-3 min-w-0 flex-1 last:flex-none" aria-current={active ? 'step' : undefined}>
                <span className="flex items-center gap-2 shrink-0">
                  <span
                    className={`flex items-center justify-center w-5 h-5 rounded-full text-caption tnum border ${
                      active
                        ? 'bg-accent text-accent-ink border-accent font-semibold'
                        : done
                        ? 'border-line-strong text-ink-1'
                        : 'border-line text-ink-3'
                    }`}
                  >
                    {done ? <Check size={12} strokeWidth={2} /> : n}
                  </span>
                  <span className={active ? 'text-ink-1 font-medium' : 'text-ink-2'}>{name}</span>
                </span>
                {n < STEPS.length && <span className="h-px flex-1 bg-line" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>

        {/* Step body */}
        <div className="px-5 py-5 overflow-y-auto flex-1 flex flex-col gap-5 bg-surface-1">
          {/* STEP 1 */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <section aria-labelledby="intake-presets" className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="intake-presets" className="text-body font-semibold text-ink-1 flex items-center gap-1.5">
                    <BookOpen size={14} strokeWidth={1.75} className="text-ink-2" />
                    Start from published research
                  </h3>
                  <span className="text-caption text-ink-3">Select one to fill in all three steps</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {LITERATURE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setSelectedBiomeId(preset.targetBiomeId);
                        setSelectedSymptomId(preset.targetSymptomId);
                        setSelectedEraId(preset.targetEraId);
                        setCandidateBasinId(preset.targetBasinId);
                      }}
                      className="px-3 py-2.5 rounded-md border border-line hover:border-line-strong text-left transition-colors cursor-pointer flex flex-col gap-1"
                    >
                      <span className={`tag self-start ${preset.badge === 'Curated scenario' ? 'tag-warn' : ''}`}>{preset.badge}</span>
                      <span className="text-label font-medium text-ink-1">{preset.citation}</span>
                      <span className="text-caption text-ink-2 line-clamp-2">{preset.title}</span>
                      <span className="text-caption text-ink-3 mt-auto pt-1 border-t border-line">{preset.tag}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section aria-labelledby="intake-q1" className="flex flex-col gap-3 border-t border-line pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 id="intake-q1" className="text-body font-semibold text-ink-1">
                      Which kind of region do you want to investigate?
                    </h3>
                    <p className="text-label text-ink-2 mt-0.5">
                      Pick a region type. It sets the area to look at and the catchments to rank.
                    </p>
                  </div>
                  <span className="text-caption text-ink-3 shrink-0 tnum">Step 1 of 3</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {BIOME_OPTIONS.map((biome) => {
                    const isSelected = selectedBiomeId === biome.id;
                    return (
                      <button
                        key={biome.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedBiomeId(biome.id)}
                        className={`${optionClass(isSelected)} flex flex-col gap-1.5`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span>
                            <span className="block text-body font-medium text-ink-1">{biome.title}</span>
                            <span className="block text-caption text-ink-2 mt-0.5">{biome.examples}</span>
                          </span>
                          {isSelected ? (
                            <Check size={16} strokeWidth={2} className="text-ink-1 shrink-0" aria-hidden="true" />
                          ) : (
                            <span className="tag shrink-0">{biome.badge}</span>
                          )}
                        </span>
                        <span className="block text-label text-ink-2">{biome.rationale}</span>
                        <span className="block text-caption text-ink-3 pt-1.5 border-t border-line">
                          Data: {biome.primarySensors}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <section aria-labelledby="intake-q2" className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="intake-q2" className="text-body font-semibold text-ink-1">
                    What change do you suspect?
                  </h3>
                  <p className="text-label text-ink-2 mt-0.5">
                    Pick the variable to show on the map and in the charts. Each tag says where its data comes from.
                  </p>
                </div>
                <span className="text-caption text-ink-3 shrink-0 tnum">Step 2 of 3</span>
              </div>

              <div className="flex flex-col gap-2">
                {SYMPTOM_OPTIONS.map((sym) => {
                  const isSelected = selectedSymptomId === sym.id;
                  const Icon = sym.icon;
                  return (
                    <button
                      key={sym.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedSymptomId(sym.id)}
                      className={`${optionClass(isSelected)} flex items-start gap-3`}
                    >
                      <Icon size={18} strokeWidth={1.75} className="text-ink-2 mt-0.5 shrink-0" aria-hidden="true" />
                      <span className="flex-1 min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-body font-medium text-ink-1">{sym.title}</span>
                          <span className={`tag ${sym.modelled ? 'tag-warn' : ''}`}>{sym.badge}</span>
                        </span>
                        <span className="block text-label text-ink-2 mt-0.5">{sym.subtitle}</span>
                        <span className="block text-caption text-ink-3 mt-1">{sym.rationale}</span>
                      </span>
                      {isSelected && <Check size={16} strokeWidth={2} className="text-ink-1 shrink-0 mt-0.5" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-body font-semibold text-ink-1">Which region and time window?</h3>
                  <p className="text-label text-ink-2 mt-0.5">
                    Choose one of the strongest matches, then set the time window.
                  </p>
                </div>
                <span className="text-caption text-ink-3 shrink-0 tnum">Step 3 of 3</span>
              </div>

              {candidateHotspots.length > 0 && (
                <section aria-labelledby="intake-hotspots" className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <h4 id="intake-hotspots" className="text-label font-semibold text-ink-1">
                      Top 3 matches: {selectedBiome.title}
                    </h4>
                    <span className="text-caption text-ink-3">Ranked by size of trend, {selectedSymptom.title.toLowerCase()}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {candidateHotspots.map((b, idx) => {
                      const isSelected = plan.basinId === b.properties.basin_id || b.id === plan.basinId;
                      const slope = b.properties.theil_sen_slope;
                      return (
                        <button
                          key={b.properties.basin_id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => setCandidateBasinId(b.properties.basin_id)}
                          className={`${optionClass(isSelected)} flex flex-col gap-1`}
                        >
                          <span className="flex items-center justify-between gap-2 text-caption text-ink-3">
                            <span className="tnum">Match {idx + 1}</span>
                            <span className="inline-flex items-center gap-1">
                              {isSelected && <Check size={14} strokeWidth={2} className="text-ink-1" aria-hidden="true" />}
                              <span>{b.properties.significant ? 'Significant' : 'Not significant'}</span>
                            </span>
                          </span>
                          <span className="block text-body font-medium text-ink-1 truncate">{b.properties.basin_name}</span>
                          <span className="block text-caption text-ink-2 truncate tnum">
                            {b.properties.continent} · {b.properties.area_sqkm.toLocaleString()} km²
                          </span>
                          <span className={`block text-label font-medium tnum pt-1.5 border-t border-line ${slope < 0 ? 'text-dry-3' : 'text-wet-3'}`}>
                            {fmtSigned(slope)} cm/yr
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <section aria-labelledby="intake-era" className="flex flex-col gap-2 border-t border-line pt-5">
                <h4 id="intake-era" className="text-label font-semibold text-ink-1">Time window</h4>
                <div className="flex flex-col gap-2">
                  {ERA_OPTIONS.map((era) => {
                    const isSelected = selectedEraId === era.id;
                    return (
                      <button
                        key={era.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedEraId(era.id)}
                        className={`${optionClass(isSelected)} flex flex-col gap-1`}
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span>
                            <span className="block text-body font-medium text-ink-1">{era.title}</span>
                            <span className="block text-label text-ink-2 mt-0.5">{era.subtitle}</span>
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className={`tag tnum ${era.curated ? 'tag-warn' : ''}`}>{era.badge}</span>
                            {isSelected && <Check size={16} strokeWidth={2} className="text-ink-1" aria-hidden="true" />}
                          </span>
                        </span>
                        <span className="block text-caption text-ink-3">{era.rationale}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* Plan summary */}
          <section aria-labelledby="intake-plan" className="border-t border-line pt-4 flex flex-col gap-2">
            <h3 id="intake-plan" className="text-label font-semibold text-ink-1">Your investigation plan</h3>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-label">
              <div className="min-w-0">
                <dt className="text-caption text-ink-3">Region</dt>
                <dd className="text-ink-1 truncate">{planBasin?.properties.basin_name ?? plan.basinId}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-caption text-ink-3">Variable</dt>
                <dd className="text-ink-1 truncate">{selectedSymptom.title}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-caption text-ink-3">Year shown</dt>
                <dd className="text-ink-1 tnum">
                  {plan.year}
                  {plan.activateCase07 ? ' (Case 07 scenario)' : ''}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-caption text-ink-3">Mode</dt>
                <dd className="text-ink-1">{plan.activateCase07 ? 'Curated scenario' : 'Trend analysis'}</dd>
              </div>
            </dl>
            <p className="text-caption text-ink-3">{plan.summaryText}</p>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-line flex items-center justify-between gap-3">
          <button type="button" onClick={handleBack} disabled={step === 1} className="btn btn-secondary">
            <ArrowLeft size={16} strokeWidth={1.75} />
            <span>Back</span>
          </button>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => onComplete(plan)} className="btn btn-ghost">
              Skip to plan
            </button>
            <button type="button" onClick={handleNext} className="btn btn-primary">
              <span>{step === 3 ? 'Start investigating' : 'Next'}</span>
              <ArrowRight size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
