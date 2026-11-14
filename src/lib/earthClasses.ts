/**
 * Prompt Biome Archetypes & Earth Classification Taxonomy
 * Stratum-4D · NASA Space Apps Challenge (Earth System Trend Detective)
 *
 * Defines the structured biome archetypes for detective inquiry and
 * standardizes matching logic across 3D Globe, 2D Analytical Map, and GIS panels.
 */

export interface PromptBiomeArchetype {
  id: string;
  label: string;
  emoji: string;
  shortDesc: string;
  exemplarBasins: string[];
  rationale: string;
  primarySensors: string[];
  defaultBasinId: string;
}

export const PROMPT_BIOME_ARCHETYPES: PromptBiomeArchetype[] = [
  {
    id: 'DESERT',
    label: 'Desert & Arid Interior',
    emoji: '',
    shortDesc: 'Great Basin, Sahel, Lake Urmia, Tigris-Euphrates',
    exemplarBasins: [
      'BASIN_GREAT_BASIN_EAST',
      'BASIN_SAHEL',
      'BASIN_CASPIAN',
      'BASIN_COLORADO',
      'BASIN_TIGRIS_EUPHRATES',
      'BASIN_YELLOW_RIVER',
      'BASIN_NILE',
      'BASIN_NIGER',
    ],
    rationale:
      'Closed endorheic depressions and hyper-arid catchments experiencing severe evaporative demand and groundwater storage loss.',
    primarySensors: ['GRACE-FO mascons (observed)', 'NASA POWER reanalysis (rainfall, temperature)'],
    defaultBasinId: 'BASIN_GREAT_BASIN_EAST',
  },
  {
    id: 'RAINFOREST',
    label: 'Tropical Rainforest & Peatlands',
    emoji: '',
    shortDesc: 'Lower Amazon, Congo, Sebangau Peat / Sumatra-Java',
    exemplarBasins: [
      'BASIN_AMAZON_LOWER',
      'BASIN_CONGO',
      'BASIN_IOD_EAST',
      'BASIN_PARANA_LA_PLATA',
      'BASIN_SAO_FRANCISCO',
    ],
    rationale:
      'Equatorial carbon reservoirs and peat domes susceptible to drought-induced desiccation, fire smoldering, and monsoon teleconnections.',
    primarySensors: ['GRACE-FO mascons (observed)', 'NASA POWER reanalysis (rainfall)', 'Vegetation index (modelled proxy)'],
    defaultBasinId: 'BASIN_AMAZON_LOWER',
  },
  {
    id: 'TIDAL_ESTUARY',
    label: 'Tidal Estuary & River Delta',
    emoji: '',
    shortDesc: 'Yangtze Delta, Ganges-Brahmaputra, Mississippi Delta',
    exemplarBasins: [
      'BASIN_YANGTZE',
      'BASIN_GANGES_BRAHMAPUTRA',
      'BASIN_MISSISSIPPI_LOWER',
      'BASIN_DANUBE',
      'BASIN_RHINE',
      'BASIN_MISSISSIPPI_UPPER',
      'BASIN_COLUMBIA',
    ],
    rationale:
      'Densely inhabited downstream river deltas balancing inland runoff surges against rising sea levels and sediment starvation.',
    primarySensors: ['GRACE-FO mascons (observed)', 'NASA POWER reanalysis (rainfall)', 'Water surface height (modelled proxy)'],
    defaultBasinId: 'BASIN_YANGTZE',
  },
  {
    id: 'MEGACITY_ATMOSPHERE',
    label: 'Megacity Atmosphere & Airshed',
    emoji: '',
    shortDesc: 'Singapore/Jakarta Haze, Pearl River, Central Valley',
    exemplarBasins: [
      'BASIN_CALIFORNIA_CV',
      'BASIN_IOD_EAST',
      'BASIN_YANGTZE',
      'BASIN_YELLOW_RIVER',
      'BASIN_INDUS',
      'BASIN_GANGES_BRAHMAPUTRA',
      'CASE_07_SEA_CO_PLUME',
      'case-07-sea-co-plume',
    ],
    rationale:
      'Urbanized basins with coupled atmospheric emission plumes (CO, NO2) and intensive infrastructure water-table overdraft.',
    primarySensors: ['GRACE-FO mascons (observed)', 'Air pollution (modelled proxy)', 'Land subsidence (modelled proxy)'],
    defaultBasinId: 'BASIN_CALIFORNIA_CV',
  },
  {
    id: 'CRYOSPHERE',
    label: 'Polar Ice Sheet & Glacial Cryosphere',
    emoji: '',
    shortDesc: 'West Antarctica, Greenland, Qinghai-Tibetan Plateau',
    exemplarBasins: [
      'BASIN_WEST_ANTARCTICA',
      'BASIN_EAST_ANTARCTICA',
      'BASIN_TIBETAN_PLATEAU',
      'BASIN_VOLGA',
    ],
    rationale:
      'Glaciated polar catchments undergoing accelerated mass loss, ice shelf calving, and barystatic sea-level contributions.',
    primarySensors: ['GRACE-FO mascons (observed)', 'NASA POWER reanalysis (temperature)'],
    defaultBasinId: 'BASIN_WEST_ANTARCTICA',
  },
  {
    id: 'ANTHROPOGENIC',
    label: 'Intensive Irrigation & Overdraft',
    emoji: '',
    shortDesc: 'Central Valley, Indus, Tigris-Euphrates, Colorado',
    exemplarBasins: [
      'BASIN_CALIFORNIA_CV',
      'BASIN_INDUS',
      'BASIN_TIGRIS_EUPHRATES',
      'BASIN_COLORADO',
      'BASIN_CASPIAN',
      'BASIN_YELLOW_RIVER',
    ],
    rationale:
      'Agricultural basins where anthropogenic groundwater pumping drastically exceeds natural recharge, causing irreversible compaction.',
    primarySensors: ['GRACE mascons RL06.1M (observed)', 'Land subsidence (modelled proxy)', 'Soil moisture (modelled proxy)'],
    defaultBasinId: 'BASIN_CALIFORNIA_CV',
  },
];

/**
 * Checks whether a basin feature matches a given classification or prompt biome archetype.
 */
export function matchesEarthClassOrArchetype(
  basin: any,
  selectedClass?: string | null
): boolean {
  if (!selectedClass) return true;
  if (!basin || !basin.properties) return false;

  const ALIAS_MAP: Record<string, string> = {
    desert: 'DESERT',
    rainforest: 'RAINFOREST',
    estuary: 'TIDAL_ESTUARY',
    megacity: 'MEGACITY_ATMOSPHERE',
    cryosphere: 'CRYOSPHERE',
  };
  const normalizedClass = selectedClass ? (ALIAS_MAP[selectedClass.toLowerCase()] ?? selectedClass.toUpperCase()) : '';

  const p = basin.properties;
  const basinId = p.basin_id || basin.id || '';
  const explicitClasses: string[] = (p.earth_classes || []).map((c: string) => c.toUpperCase());
  const slope = p.theil_sen_slope ?? 0;
  const area = p.area_sqkm ?? p.area_km2 ?? 0;
  const cLat = p.centroid ? Math.abs(p.centroid[1]) : 0;

  // 1. Check prompt biome archetypes
  if (normalizedClass === 'DESERT') {
    const exemplar = PROMPT_BIOME_ARCHETYPES.find((a) => a.id === 'DESERT');
    if (exemplar?.exemplarBasins.includes(basinId)) return true;
    if (explicitClasses.includes('DESERT')) return true;
    // Arid / semi-arid with strong drying or low baseline humidity
    return (
      basinId === 'BASIN_GREAT_BASIN_EAST' ||
      basinId === 'BASIN_SAHEL' ||
      basinId === 'BASIN_CASPIAN' ||
      basinId === 'BASIN_COLORADO' ||
      basinId === 'BASIN_TIGRIS_EUPHRATES' ||
      basinId === 'BASIN_YELLOW_RIVER' ||
      basinId === 'BASIN_NILE' ||
      basinId === 'BASIN_NIGER'
    );
  }

  if (normalizedClass === 'RAINFOREST') {
    const exemplar = PROMPT_BIOME_ARCHETYPES.find((a) => a.id === 'RAINFOREST');
    if (exemplar?.exemplarBasins.includes(basinId)) return true;
    if (explicitClasses.includes('RAINFOREST')) return true;
    return (
      basinId === 'BASIN_AMAZON_LOWER' ||
      basinId === 'BASIN_CONGO' ||
      basinId === 'BASIN_IOD_EAST' ||
      basinId === 'BASIN_PARANA_LA_PLATA' ||
      basinId === 'BASIN_SAO_FRANCISCO'
    );
  }

  if (normalizedClass === 'TIDAL_ESTUARY') {
    const exemplar = PROMPT_BIOME_ARCHETYPES.find((a) => a.id === 'TIDAL_ESTUARY');
    if (exemplar?.exemplarBasins.includes(basinId)) return true;
    if (explicitClasses.includes('TIDAL_ESTUARY')) return true;
    return (
      basinId === 'BASIN_YANGTZE' ||
      basinId === 'BASIN_GANGES_BRAHMAPUTRA' ||
      basinId === 'BASIN_MISSISSIPPI_LOWER' ||
      basinId === 'BASIN_DANUBE' ||
      basinId === 'BASIN_RHINE' ||
      basinId === 'BASIN_MISSISSIPPI_UPPER' ||
      basinId === 'BASIN_COLUMBIA'
    );
  }

  if (normalizedClass === 'MEGACITY_ATMOSPHERE') {
    const exemplar = PROMPT_BIOME_ARCHETYPES.find((a) => a.id === 'MEGACITY_ATMOSPHERE');
    if (exemplar?.exemplarBasins.includes(basinId)) return true;
    if (explicitClasses.includes('MEGACITY_ATMOSPHERE')) return true;
    return (
      basinId === 'BASIN_CALIFORNIA_CV' ||
      basinId === 'BASIN_IOD_EAST' ||
      basinId === 'BASIN_YANGTZE' ||
      basinId === 'BASIN_YELLOW_RIVER' ||
      basinId === 'BASIN_INDUS' ||
      basinId === 'BASIN_GANGES_BRAHMAPUTRA' ||
      basinId === 'CASE_07_SEA_CO_PLUME' ||
      basinId === 'case-07-sea-co-plume'
    );
  }

  if (normalizedClass === 'CRYOSPHERE') {
    if (explicitClasses.includes('CRYOSPHERE')) return true;
    if (
      basinId === 'BASIN_WEST_ANTARCTICA' ||
      basinId === 'BASIN_EAST_ANTARCTICA' ||
      basinId === 'BASIN_TIBETAN_PLATEAU' ||
      basinId === 'BASIN_VOLGA'
    ) {
      return true;
    }
    return cLat > 48;
  }

  if (normalizedClass === 'ANTHROPOGENIC') {
    if (explicitClasses.includes('ANTHROPOGENIC')) return true;
    if (p.triangulation?.irreversible_subsidence) return true;
    if (
      basinId === 'BASIN_CALIFORNIA_CV' ||
      basinId === 'BASIN_INDUS' ||
      basinId === 'BASIN_TIGRIS_EUPHRATES' ||
      basinId === 'BASIN_COLORADO' ||
      basinId === 'BASIN_CASPIAN' ||
      basinId === 'BASIN_YELLOW_RIVER'
    ) {
      return true;
    }
    return slope < -1.4;
  }

  // 2. Fallbacks for existing standard classes
  if (explicitClasses.includes(normalizedClass)) return true;

  if (normalizedClass === 'WATER_BODY') return area > 800000;
  if (normalizedClass === 'THERMAL') return slope < -1.0;
  if (normalizedClass === 'VEGETATION') {
    return (p.triangulation?.vegetation_resilience_score ?? 0) > 0.4;
  }
  if (normalizedClass === 'DIPOLES') return Boolean(p.dipole_partner_id);
  if (normalizedClass === 'DEPLETING') return slope < 0;
  if (normalizedClass === 'SURPLUS') return slope > 0;

  return true;
}
