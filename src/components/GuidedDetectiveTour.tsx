import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Compass,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Check,
  Award,
  X,
  Zap,
  Play,
  Pause,
  Eye,
  BookOpen,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { MonitoredVariable } from './MultiSensorStack';

export interface TourStepAction {
  stepIndex: number;
  basinId: string;
  partnerBasinId?: string;
  cameraTarget: [number, number]; // [lon, lat]
  extrudeRelief: boolean;
  significanceLock: boolean;
  openCompare: boolean;
  openBlockView: boolean;
  simulatedYear: number;
  toggleEpochDelta?: boolean;
  activateCase07?: boolean;
  stripSeasonality?: boolean;
  viewMode?: '3D' | '2D' | '4D';
  activeVariable?: MonitoredVariable;
  openIntakeWizard?: boolean;
  probeCoordinate?: [number, number] | null; // [lat, lon]
  isStudentMode?: boolean;
}

export interface TourStep {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  scientificFormula: string;
  whereToLook: string[];
  quizQuestion: string;
  quizOptions: string[];
  quizCorrectIndex: number;
  targetZoneLabel: string;
  targetElementId?: string;
  badgeName: string;
  challengePrompt: string;
  cameraPreset?: { lat: number; lon: number; zoom: number };
  action?: TourStepAction;
}

export interface DemoScene {
  id: string;
  sceneNumber: number;
  title: string;
  subtitle: string;
  caption: string;
  action: TourStepAction;
}

export const DEMO_SCENES: DemoScene[] = [
  {
    id: 'scene-1',
    sceneNumber: 1,
    title: 'Overview and 3D relief',
    subtitle: 'Groundwater overdraft in California Central Valley',
    caption: 'Scene 1 of 8: With 3D relief on, each region rises in proportion to the size of its water-storage trend (Theil-Sen slope). California Central Valley stands out at about -1.60 cm/yr, and Plain mode explains each term in everyday words.',
    action: {
      stepIndex: 0,
      basinId: 'BASIN_CALIFORNIA_CV',
      cameraTarget: [-119.0, 36.0],
      extrudeRelief: true,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      stripSeasonality: false,
      viewMode: '3D',
      activeVariable: 'tws',
      isStudentMode: true,
    },
  },
  {
    id: 'scene-2',
    sceneNumber: 2,
    title: 'Removing the seasonal cycle',
    subtitle: 'Seasonal adjustment and the water balance (dS/dt = P - ET - Q)',
    caption: 'Scene 2 of 8: Subtracting the 12-month seasonal cycle flattens the yearly swing in every variable on the Other variables list (storage, rainfall, evapotranspiration, runoff, temperature, soil moisture, NO₂) so the long-term trend is easier to see.',
    action: {
      stepIndex: 1,
      basinId: 'BASIN_CALIFORNIA_CV',
      cameraTarget: [-119.0, 36.0],
      extrudeRelief: true,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      stripSeasonality: true,
      viewMode: '3D',
      activeVariable: 'tws',
      isStudentMode: false,
    },
  },
  {
    id: 'scene-3',
    sceneNumber: 3,
    title: 'The 2D map',
    subtitle: 'Every region at once, with paired-region arcs',
    caption: 'Scene 3 of 8: The 2D map shows all 30 regions without the globe hiding half of them, along with the paired-region arcs and a zonal mean profile by latitude band.',
    action: {
      stepIndex: 2,
      basinId: 'BASIN_AMAZON_LOWER',
      cameraTarget: [-55.0, -5.0],
      extrudeRelief: false,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      stripSeasonality: false,
      viewMode: '2D',
      activeVariable: 'runoff',
    },
  },
  {
    id: 'scene-4',
    sceneNumber: 4,
    title: 'Opposite trends in one climate pattern',
    subtitle: 'Lower Amazon and the São Francisco basin',
    caption: 'Scene 4 of 8: Same climate pattern, opposite directions. ENSO and South Atlantic Convergence Zone shifts are linked to wetting in the Lower Amazon (+0.66 cm/yr) and drying in the São Francisco basin (-1.19 cm/yr).',
    action: {
      stepIndex: 3,
      basinId: 'BASIN_AMAZON_LOWER',
      partnerBasinId: 'BASIN_SAO_FRANCISCO',
      cameraTarget: [-55.0, -10.0],
      extrudeRelief: true,
      significanceLock: false,
      openCompare: true,
      openBlockView: false,
      simulatedYear: 2024,
      stripSeasonality: false,
      viewMode: '3D',
    },
  },
  {
    id: 'scene-5',
    sceneNumber: 5,
    title: 'When is a trend real?',
    subtitle: 'Naive t-test versus Hamed-Rao Mann-Kendall',
    caption: 'Scene 5 of 8: A plain regression gives the Danube Basin p = 0.029, but yearly memory in the data (lag-1 autocorrelation 0.78) lifts the corrected p-value to 0.185. About 4.8 more years of data would be needed to reach p < 0.05.',
    action: {
      stepIndex: 4,
      basinId: 'BASIN_DANUBE',
      cameraTarget: [20.0, 45.0],
      extrudeRelief: false,
      significanceLock: true,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      stripSeasonality: true,
      viewMode: '3D',
    },
  },
  {
    id: 'scene-6',
    sceneNumber: 6,
    title: 'Atmosphere levels (modelled)',
    subtitle: 'Lower-troposphere warming versus 250 hPa cooling',
    caption: 'Scene 6 of 8: Over East Asia, the upper-air levels are modelled proxies scaled from surface temperature. They show warming in the lower troposphere against cooling near the 250 hPa tropopause, and they are illustrations, not measurements.',
    action: {
      stepIndex: 5,
      basinId: 'BASIN_YANGTZE',
      cameraTarget: [112.0, 31.0],
      extrudeRelief: false,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      stripSeasonality: false,
      viewMode: '3D',
      activeVariable: 'no2',
    },
  },
  {
    id: 'scene-7',
    sceneNumber: 7,
    title: 'Subsurface view and a 2032 projection',
    subtitle: 'Clay compaction and infrastructure strain (illustrative)',
    caption: 'Scene 7 of 8: The Subsurface view opens a layered block of California Central Valley down to the upper mantle. At 2032 it illustrates how permanent clay compaction (more than 20 mm/yr) could reduce storage and strain dams and aqueducts. This is a modelled scenario.',
    action: {
      stepIndex: 6,
      basinId: 'BASIN_CALIFORNIA_CV',
      cameraTarget: [-119.0, 36.0],
      extrudeRelief: true,
      significanceLock: false,
      openCompare: false,
      openBlockView: true,
      simulatedYear: 2032,
      viewMode: '4D',
    },
  },
  {
    id: 'scene-8',
    sceneNumber: 8,
    title: 'Case study: SE Asia carbon monoxide plume',
    subtitle: 'Peat dewatering and smoke aloft, October 2026',
    caption: 'Scene 8 of 8: Case 7 pairs an AIRS carbon monoxide image layer at 500 hPa with wind streamlines to follow peat smoke over Kalimantan, Malaysia and Singapore. Open it from Tools, then Case studies.',
    action: {
      stepIndex: 7,
      basinId: 'BASIN_IOD_EAST',
      cameraTarget: [106.0, 0.5],
      extrudeRelief: false,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2026,
      activateCase07: true,
      viewMode: '3D',
    },
  },
];

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'intro_student_mode',
    title: '1. Plain or Technical wording',
    subtitle: 'Science for students and researchers',
    description: 'Stratum-4D is built for high-school and college earth science as well as graduate geophysics. In the header of the right panel, the Plain | Technical switch controls whether terms such as GRACE gravity anomaly or storativity come with an everyday explanation.',
    scientificFormula: 'Change in water storage (cm) = gravity-derived mass change ÷ density of water',
    whereToLook: [
      'Right panel header: switch between Plain and Technical.',
      'Right panel, Inspect tab, Statistics: each statistic shows its plain label first and the technical name second.',
    ],
    quizQuestion: 'How do the GRACE-FO twin satellites measure underground water changes?',
    quizOptions: [
      'By measuring micron-scale changes in the distance between them as gravity pulls differently',
      'By photographing underground caves',
    ],
    quizCorrectIndex: 0,
    targetZoneLabel: 'Right panel header: Plain | Technical switch',
    badgeName: 'Recruit Investigator',
    challengePrompt: 'Select Plain in the right panel header, then read the Statistics section in Inspect.',
    cameraPreset: { lat: 36.0, lon: -119.0, zoom: 2.5 },
    action: {
      stepIndex: 0,
      basinId: 'BASIN_CALIFORNIA_CV',
      cameraTarget: [-119.0, 36.0],
      extrudeRelief: false,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      toggleEpochDelta: false,
      viewMode: '3D',
      isStudentMode: true,
      openIntakeWizard: false,
    },
  },
  {
    id: 'intake_wizard',
    title: '2. Start with a question',
    subtitle: 'Landscape types and published benchmarks',
    description: 'Not sure where to begin? The question wizard lets you pick a landscape type (desert, rainforest, estuary, megacity, ice), a symptom and a time period, or load a landmark study such as Famiglietti (2011) or Rodell (2018).',
    scientificFormula: 'Hotspot score = rank of |trend slope| × (1 - q), where q is the false discovery rate',
    whereToLook: [
      'Header, Learn menu: choose Start with a question.',
      'Inside the wizard: choose a published paper to set up the sensors for you.',
    ],
    quizQuestion: 'Which biome archetype best captures closed basins with terminal lake desiccation?',
    quizOptions: ['Desert and arid interior (closed basins)', 'Estuary and river delta'],
    quizCorrectIndex: 0,
    targetZoneLabel: 'Header: Learn, then Start with a question',
    badgeName: 'Hypothesis Architect',
    challengePrompt: 'Open the question wizard and try a guided hypothesis.',
    cameraPreset: { lat: 25.0, lon: -90.0, zoom: 2.6 },
    action: {
      stepIndex: 1,
      basinId: 'BASIN_CALIFORNIA_CV',
      cameraTarget: [-119.0, 36.0],
      extrudeRelief: false,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      viewMode: '3D',
      openIntakeWizard: true,
    },
  },
  {
    id: 'q1_q2_globe',
    title: '3. What and where: 3D relief',
    subtitle: 'Trend size for 30 regions',
    description: 'The map shows 30 regions raised in proportion to the size of their Theil-Sen trend slope. Red regions are drying (losing stored water) and blue regions are wetting. The left panel legend gives the scale in cm/yr.',
    scientificFormula: 'Theil-Sen slope = median of (y_j - y_i) ÷ (t_j - t_i) over all pairs i < j',
    whereToLook: [
      'Map, top right: open Map options and turn on 3D relief.',
      'Left panel: read the Water-storage trend legend (cm/yr) and the region list sorted by trend size.',
    ],
    quizQuestion: 'Why do we use the non-parametric Theil-Sen estimator instead of simple linear regression alone?',
    quizOptions: [
      'It resists extreme flood and drought outliers (up to a 29.3% breakdown point)',
      'It ignores all data after 2015',
    ],
    quizCorrectIndex: 0,
    targetZoneLabel: 'Map options, then 3D relief',
    targetElementId: 'globe-container',
    badgeName: 'Global Topographer',
    challengePrompt: 'Turn on 3D relief and look at the Indus River Basin (about -1.42 cm/yr).',
    cameraPreset: { lat: 30.0, lon: 72.0, zoom: 3.2 },
    action: {
      stepIndex: 2,
      basinId: 'BASIN_INDUS',
      cameraTarget: [72.0, 30.0],
      extrudeRelief: true,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      toggleEpochDelta: false,
      viewMode: '3D',
      openIntakeWizard: false,
    },
  },
  {
    id: 'gibs_delta_anomaly',
    title: '4. Satellite image layers and change since the first year',
    subtitle: 'Comparing two years pixel by pixel',
    description: 'The Variable menu in the left panel adds an image layer from NASA GIBS: surface temperature, rainfall, vegetation greenness, carbon monoxide or nitrogen dioxide. Once a layer is on, Map options, Change since the first year, shows how each pixel differs from the first year of the layer.',
    scientificFormula: 'Change = image value in the chosen year - image value in the first year',
    whereToLook: [
      'Left panel: under Variable, pick an image layer.',
      'Map options: turn on Change since the first year (it needs an image layer).',
    ],
    quizQuestion: 'What does Change since the first year show on the map?',
    quizOptions: [
      'How each pixel of the image layer differs from the first year of that layer',
      'Tomorrow’s cloud cover forecast',
    ],
    quizCorrectIndex: 0,
    targetZoneLabel: 'Left panel Variable menu, then Map options',
    badgeName: 'Spectral Analyst',
    challengePrompt: 'Turn on Change since the first year (add an image layer first if the option is greyed out).',
    action: {
      stepIndex: 3,
      basinId: 'BASIN_INDUS',
      cameraTarget: [72.0, 30.0],
      extrudeRelief: false,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      toggleEpochDelta: true,
      viewMode: '3D',
      openIntakeWizard: false,
    },
  },
  {
    id: 'analytical_map_2d',
    title: '5. The 2D map and zonal profile',
    subtitle: 'All regions in one view',
    description: 'A globe hides half the planet at any moment. Switch to the 2D map to see all 30 regions, trace every paired-region arc without occlusion, and read the zonal mean profile (the average by latitude band) along the right edge.',
    scientificFormula: 'Zonal mean at latitude φ = average of the change in water storage over all longitudes at φ',
    whereToLook: [
      'Header: choose 2D map in the view switch (3D globe | 2D map | Subsurface).',
      'Right edge of the 2D map: the zonal mean profile from 90°N to 90°S.',
    ],
    quizQuestion: 'What is the primary analytical advantage of the 2D Equirectangular Twin?',
    quizOptions: [
      'No region is hidden behind the globe, so all 30 regions and the paired-region arcs are visible at once',
      'It removes the ocean basins from Earth',
    ],
    quizCorrectIndex: 0,
    targetZoneLabel: 'Header view switch: 2D map',
    badgeName: 'Cartographic Analyst',
    challengePrompt: 'Switch to the 2D map and look at the zonal profile.',
    action: {
      stepIndex: 4,
      basinId: 'BASIN_AMAZON_LOWER',
      cameraTarget: [-55.0, -5.0],
      extrudeRelief: false,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      viewMode: '2D',
      openIntakeWizard: false,
    },
  },
  {
    id: 'gis_aoi_lasso',
    title: '6. Draw an area and total its water change',
    subtitle: 'Area-weighted totals and sea-level equivalent',
    description: 'In the Region select tab you can draw an area on the map. Stratum-4D integrates its surface area (km²) and estimates the net mass change in gigatons per year (Gt/yr) and the matching sea-level equivalent (mm/yr). The left panel also holds the water balance across all regions.',
    scientificFormula: 'Area = R² · Δλ · |sin φ2 - sin φ1|   and   1 mm of sea level ≈ 361.8 Gt of water',
    whereToLook: [
      'Right panel: open the Region select tab and use Draw an area, then drag on the map.',
      'Left panel: under Landscape type, expand Water balance across all regions.',
    ],
    quizQuestion: 'How many Gigatons (Gt) of continental freshwater loss equal 1 mm of global sea-level rise?',
    quizOptions: ['~361.8 Gigatons (Gt)', '~10 Gigatons (Gt)'],
    quizCorrectIndex: 0,
    targetZoneLabel: 'Right panel: Region select tab',
    badgeName: 'Geodesy Specialist',
    challengePrompt: 'Return to the 3D globe and look at the continental water balance in the left panel.',
    action: {
      stepIndex: 5,
      basinId: 'BASIN_WEST_ANTARCTICA',
      cameraTarget: [-105.0, -74.0],
      extrudeRelief: true,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      viewMode: '3D',
      openIntakeWizard: false,
    },
  },
  {
    id: 'seasonality_water_budget',
    title: '7. Removing the seasonal cycle',
    subtitle: 'The water balance across seven variables',
    description: 'Long-term trends can hide inside big seasonal swings. In the right panel, Inspect, Other variables, turn on the seasonal-cycle removal switch to subtract the 12-month climatology from every variable. Rainfall (P), evapotranspiration (ET) and runoff (Q) then show how they govern the change in storage (dS/dt).',
    scientificFormula: 'dS/dt = P - ET - Q   and   y′(t) = y(t) - monthly mean + overall mean',
    whereToLook: [
      'Right panel, Inspect tab, Other variables: turn on seasonal-cycle removal to flatten the yearly swing.',
      'Same section: compare evapotranspiration (ET) and runoff (Q) against storage.',
    ],
    quizQuestion: 'In the terrestrial water balance equation dS/dt = P - ET - Q, what does ET represent?',
    quizOptions: [
      'Evapotranspiration: water evaporating from soil and transpiring from plant canopies',
      'Extraterrestrial solar wind',
    ],
    quizCorrectIndex: 0,
    targetZoneLabel: 'Inspect tab, Other variables',
    badgeName: 'Hydrologic Modeler',
    challengePrompt: 'Turn on seasonal-cycle removal and look at runoff (Q) in Technical mode.',
    action: {
      stepIndex: 6,
      basinId: 'BASIN_CALIFORNIA_CV',
      cameraTarget: [-119.0, 36.0],
      extrudeRelief: true,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      stripSeasonality: true,
      viewMode: '3D',
      activeVariable: 'runoff',
      isStudentMode: false,
      openIntakeWizard: false,
    },
  },
  {
    id: 'cuahsi_fdc_hydrology',
    title: '8. Water years and flow duration curves',
    subtitle: 'Exceedance probability P(Q ≥ q) and CSV export',
    description: 'Hydrologists group data by water year (1 October to 30 September) so winter snow and spring melt stay in one cycle. In Inspect, Other variables, the WY and FDC buttons switch to water years and draw the flow duration curve, which separates flood flow (Q10), median flow (Q50) and drought flow (Q90).',
    scientificFormula: 'P(Q ≥ q) = m ÷ (N + 1) × 100%',
    whereToLook: [
      'Right panel, Inspect tab, Other variables: use WY for water years and FDC for the flow duration curve.',
      'Same toolbar: Export CSV downloads the region’s series.',
    ],
    quizQuestion: 'What does the Q90 threshold on a Flow Duration Curve represent?',
    quizOptions: [
      'Low-flow hydrologic drought margin exceeded 90% of the time (lowest 10% of flows)',
      'Extreme flood peak exceeded only 1% of the time',
    ],
    quizCorrectIndex: 0,
    targetZoneLabel: 'Inspect tab, Other variables: WY, FDC, Export CSV',
    badgeName: 'CUAHSI Hydrologist',
    challengePrompt: 'Select the Yangtze runoff series and try the flow duration curve.',
    action: {
      stepIndex: 7,
      basinId: 'BASIN_YANGTZE',
      cameraTarget: [112.0, 31.0],
      extrudeRelief: true,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      stripSeasonality: false,
      viewMode: '3D',
      activeVariable: 'runoff',
      openIntakeWizard: false,
    },
  },
  {
    id: 'atmospheric_levels_probe',
    title: '9. Atmosphere levels and the point probe',
    subtitle: '1000 to 250 hPa (modelled) and a 1984 to 2024 point probe',
    description: 'Trends change with altitude. In Inspect, Other variables, the pressure-level gauge (1000, 850, 500, 250 hPa) contrasts lower-troposphere warming with cooling near 250 hPa. These upper-air levels are modelled proxies scaled from surface temperature. To probe any other place, click an open spot on the map: the probe uses a 1984 to 2024 record from NASA POWER.',
    scientificFormula: 'T(z) = surface T - lapse rate · z + level factor · surface trend · Δt',
    whereToLook: [
      'Right panel, Inspect tab, Other variables: pick 1000, 850, 500 or 250 hPa in the pressure-level gauge.',
      'Map: click any point outside a region to open the point probe in Inspect.',
    ],
    quizQuestion: 'What physical signature appears at the 250 hPa tropopause/lower stratosphere under greenhouse forcing?',
    quizOptions: [
      'Cooling (about -0.35 × the surface trend in this model) contrasting with warming lower down',
      'Temperatures boil at +100°C',
    ],
    quizCorrectIndex: 0,
    targetZoneLabel: 'Inspect tab, Other variables: pressure levels',
    badgeName: 'Atmospheric Sounder',
    challengePrompt: 'Look at temperature and NO₂ over East Asia, then change the pressure level.',
    action: {
      stepIndex: 8,
      basinId: 'BASIN_YANGTZE',
      cameraTarget: [112.0, 31.0],
      extrudeRelief: false,
      significanceLock: false,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      stripSeasonality: false,
      viewMode: '3D',
      activeVariable: 'no2',
      openIntakeWizard: false,
    },
  },
  {
    id: 'q3_dipole',
    title: '10. Opposite trends in one pattern',
    subtitle: 'One driver, opposite regional trends',
    description: 'One climate driver can push one region one way and another region the opposite way. Here ENSO and South Atlantic Convergence Zone shifts are linked to wetting in the Lower Amazon (+0.66 cm/yr) and drying in the São Francisco basin (-1.19 cm/yr).',
    scientificFormula: 'sign(trend A) ≠ sign(trend B)   and   partial correlation of A and B given ENSO',
    whereToLook: [
      'Right panel, Inspect tab: choose Compare with its pair (shown when the region has a partner).',
      'Tools menu: Compare paired regions lists all eight pairs in the Region select tab, each tagged opposite signs or same sign.',
    ],
    quizQuestion: 'What evidence would support the idea that two opposite regional trends share one climate driver?',
    quizOptions: [
      'Opposite slope signs (sign(β_A) ≠ sign(β_B)) coupled with high partial correlation attribution to ENSO/IOD',
      'Both basins having zero slope',
    ],
    quizCorrectIndex: 0,
    targetZoneLabel: 'Inspect tab: Compare with its pair',
    targetElementId: 'dual-compare-btn',
    badgeName: 'Dipole Navigator',
    challengePrompt: 'Open the pair comparison and check the shared ENSO link.',
    cameraPreset: { lat: -10.0, lon: -55.0, zoom: 3.5 },
    action: {
      stepIndex: 9,
      basinId: 'BASIN_AMAZON_LOWER',
      partnerBasinId: 'BASIN_SAO_FRANCISCO',
      cameraTarget: [-55.0, -10.0],
      extrudeRelief: true,
      significanceLock: false,
      openCompare: true,
      openBlockView: false,
      simulatedYear: 2024,
      viewMode: '3D',
      activeVariable: 'tws',
    },
  },
  {
    id: 'q4_red_noise_horizon',
    title: '11. Is the trend significant?',
    subtitle: 't-test, Hamed-Rao Mann-Kendall and how long to wait',
    description: 'Sometimes a trend only needs more years of data. In the Danube Basin a plain t-test gives p = 0.029, but Hamed-Rao corrects for yearly memory (lag-1 autocorrelation 0.78) and gives p = 0.185. The observation horizon estimates about 4.8 more years to reach p < 0.05.',
    scientificFormula: 'Effective sample size N* = n ÷ VIF   and   extra years ≈ current years × (t critical ÷ |t now|)^(2/3)',
    whereToLook: [
      'Left panel: the Significance control (All | Significant | Strong) hides regions that fail the test.',
      'Right panel, Inspect tab, Statistics: compare the Theil-Sen / Mann-Kendall and OLS / t-test results.',
    ],
    quizQuestion: 'Why does naive OLS regression often produce false-positive trends in climate time series?',
    quizOptions: [
      'It ignores lag-1 autocorrelation (yearly memory), so it overstates the effective sample size N*',
      'It uses too many satellites',
    ],
    quizCorrectIndex: 0,
    targetZoneLabel: 'Left panel: Significance control',
    targetElementId: 'significance-lock-btn',
    badgeName: 'Red-Noise Debunker',
    challengePrompt: 'Choose Significant in the left panel and look at the Danube Statistics.',
    cameraPreset: { lat: 45.0, lon: 20.0, zoom: 4.0 },
    action: {
      stepIndex: 10,
      basinId: 'BASIN_DANUBE',
      cameraTarget: [20.0, 45.0],
      extrudeRelief: false,
      significanceLock: true,
      openCompare: false,
      openBlockView: false,
      simulatedYear: 2024,
      viewMode: '3D',
    },
  },
  {
    id: 'voxel_cutaway_crisis',
    title: '12. Subsurface view and a case study',
    subtitle: 'Aquifer compaction to 2035 and the October 2026 smoke plume',
    description: 'Open the Subsurface view to explore a layered block and an illustrative scenario of dam shortfall and clay compaction (more than 20 mm/yr) to 2035. Then open Tools, Case studies, Case 7 to follow peat dewatering and a 5,500 m carbon monoxide plume across SE Asia.',
    scientificFormula: 'Skeletal storage coefficient = change in thickness ÷ change in head (inelastic compaction)',
    whereToLook: [
      'Right panel, Inspect tab: choose Subsurface view (or use the header view switch).',
      'Tools menu: Case studies, then Case 7.',
    ],
    quizQuestion: 'What happens when aquifer pumping drops hydraulic head below the preconsolidation threshold?',
    quizOptions: [
      'Clay pores collapse inelastically, causing permanent subsidence and lost storage',
      'The aquifer expands upward',
    ],
    quizCorrectIndex: 0,
    targetZoneLabel: 'Inspect tab: Subsurface view',
    targetElementId: 'voxel-view-btn',
    badgeName: 'Master Earth Detective',
    challengePrompt: 'Open the Subsurface view at the year 2032.',
    cameraPreset: { lat: 36.0, lon: -119.0, zoom: 4.5 },
    action: {
      stepIndex: 11,
      basinId: 'BASIN_CALIFORNIA_CV',
      cameraTarget: [-119.0, 36.0],
      extrudeRelief: true,
      significanceLock: false,
      openCompare: false,
      openBlockView: true,
      simulatedYear: 2032,
      viewMode: '4D',
    },
  },
];

export interface GuidedDetectiveTourProps {
  isOpen?: boolean;
  onClose: () => void;
  onSelectStep?: (step: TourStep) => void;
  onApplyStep?: (action: TourStepAction) => void;
  onExecuteMicroChallenge?: (stepIndex: number) => void;
  initialAutoPlay?: boolean;
  onAutoPlayChange?: (active: boolean) => void;
  currentAppState?: {
    isExtruded?: boolean;
    significanceLock?: boolean;
    epochDeltaMode?: boolean;
    compareData?: boolean;
    showBlockView?: boolean;
    activeCaseStudy?: string | null;
    activeLayer?: string;
    simulatedYear?: number;
    stripSeasonality?: boolean;
    viewMode?: '3D' | '2D' | '4D';
    activeVariable?: MonitoredVariable;
    showIntakeWizard?: boolean;
    isStudentMode?: boolean;
  };
}

const SCENE_DURATION_MS = 11250; // 11.25s per scene × 8 scenes = 90s comprehensive walkthrough
const TOTAL_DEMO_MS = DEMO_SCENES.length * SCENE_DURATION_MS;

export function GuidedDetectiveTour({
  isOpen,
  onClose,
  onSelectStep,
  onApplyStep,
  onExecuteMicroChallenge,
  initialAutoPlay = false,
  onAutoPlayChange,
  currentAppState,
}: GuidedDetectiveTourProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});

  // 90s Auto-Play Demonstration Mode State
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(Boolean(initialAutoPlay));
  const [demoSceneIdx, setDemoSceneIdx] = useState<number>(0);
  const [demoElapsedMs, setDemoElapsedMs] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const autoPlayRef = useRef<{ sceneIdx: number }>({ sceneIdx: 0 });
  const elapsedRef = useRef(0);
  const [collapsed, setCollapsed] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const wizardOpen = Boolean(currentAppState?.showIntakeWizard);

  useEffect(() => {
    onAutoPlayChange?.(isAutoPlaying);
  }, [isAutoPlaying, onAutoPlayChange]);

  useEffect(() => {
    if (initialAutoPlay) {
      setIsAutoPlaying(true);
      setDemoSceneIdx(0);
      setDemoElapsedMs(0);
      elapsedRef.current = 0;
      setIsPaused(false);
      autoPlayRef.current.sceneIdx = 0;
      onApplyStep?.(DEMO_SCENES[0].action);
    }
  }, [initialAutoPlay, onApplyStep]);

  useEffect(() => {
    if (!isAutoPlaying || isPaused) return;

    const interval = setInterval(() => {
      const next = elapsedRef.current + 100;
      if (next >= TOTAL_DEMO_MS) {
        elapsedRef.current = TOTAL_DEMO_MS;
        setDemoElapsedMs(TOTAL_DEMO_MS);
        setIsAutoPlaying(false);
        return;
      }
      elapsedRef.current = next;
      setDemoElapsedMs(next);
      const calculatedScene = Math.min(DEMO_SCENES.length - 1, Math.floor(next / SCENE_DURATION_MS));
      if (calculatedScene !== autoPlayRef.current.sceneIdx) {
        autoPlayRef.current.sceneIdx = calculatedScene;
        setDemoSceneIdx(calculatedScene);
        onApplyStep?.(DEMO_SCENES[calculatedScene].action);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isAutoPlaying, isPaused, onApplyStep]);

  const startAutoPlay = useCallback(() => {
    setIsAutoPlaying(true);
    setDemoSceneIdx(0);
    setDemoElapsedMs(0);
    elapsedRef.current = 0;
    setIsPaused(false);
    autoPlayRef.current.sceneIdx = 0;
    onApplyStep?.(DEMO_SCENES[0].action);
  }, [onApplyStep]);

  const jumpToDemoScene = useCallback(
    (idx: number) => {
      const clamped = Math.max(0, Math.min(DEMO_SCENES.length - 1, idx));
      autoPlayRef.current.sceneIdx = clamped;
      setDemoSceneIdx(clamped);
      setDemoElapsedMs(clamped * SCENE_DURATION_MS);
      elapsedRef.current = clamped * SCENE_DURATION_MS;
      onApplyStep?.(DEMO_SCENES[clamped].action);
    },
    [onApplyStep]
  );

  const togglePauseAutoPlay = useCallback(() => {
    setIsPaused((p) => !p);
  }, []);

  const stopAutoPlay = useCallback(() => {
    setIsAutoPlaying(false);
    setIsPaused(false);
  }, []);

  // Real-time micro-challenge completion detector across all 12 steps
  const isStepChallengeCompleted = (() => {
    if (completedSteps.includes(currentIndex)) return true;
    if (!currentAppState) return false;
    switch (currentIndex) {
      case 0:
        return Boolean(currentAppState.isStudentMode);
      case 1:
        return Boolean(currentAppState.showIntakeWizard);
      case 2:
        return Boolean(currentAppState.isExtruded);
      case 3:
        return Boolean(currentAppState.epochDeltaMode);
      case 4:
        return currentAppState.viewMode === '2D';
      case 5:
        return currentAppState.viewMode === '3D';
      case 6:
        return Boolean(currentAppState.stripSeasonality);
      case 7:
        return Boolean(currentAppState.activeVariable === 'runoff');
      case 8:
        return Boolean(currentAppState.activeVariable === 'no2' || currentAppState.activeVariable === 'temp');
      case 9:
        return Boolean(currentAppState.compareData);
      case 10:
        return Boolean(currentAppState.significanceLock);
      case 11:
        return Boolean(currentAppState.showBlockView || currentAppState.viewMode === '4D');
      default:
        return false;
    }
  })();

  const isVisible = isOpen ?? true;

  const lessonScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    lessonScrollRef.current?.scrollTo({ top: 0 });
  }, [currentIndex]);

  const effectiveCompletedSteps = useMemo(() => {
    const s = new Set(completedSteps);
    if (isStepChallengeCompleted) {
      s.add(currentIndex);
    }
    return s;
  }, [completedSteps, isStepChallengeCompleted, currentIndex]);

  const handleNext = useCallback(() => {
    if (!completedSteps.includes(currentIndex)) {
      setCompletedSteps((prev) => [...prev, currentIndex]);
    }
    if (currentIndex < TOUR_STEPS.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      onClose();
    }
  }, [completedSteps, currentIndex, onClose]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  }, [currentIndex]);

  useEffect(() => {
    if (!isVisible || isAutoPlaying) return;
    const step = TOUR_STEPS[currentIndex];
    if (onSelectStep) {
      onSelectStep(step);
    }
    if (onApplyStep && step.action) {
      onApplyStep(step.action);
    }
  }, [currentIndex, isVisible, isAutoPlaying, onSelectStep, onApplyStep]);

  useEffect(() => {
    if (!isVisible || isAutoPlaying) return;
    const targetId = TOUR_STEPS[currentIndex]?.targetElementId;
    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        el.classList.add('ring-2', 'ring-focus', 'ring-offset-2', 'ring-offset-canvas');
        const timer = setTimeout(() => {
          el.classList.remove('ring-2', 'ring-focus', 'ring-offset-2', 'ring-offset-canvas');
        }, 3500);
        return () => clearTimeout(timer);
      }
    }
  }, [currentIndex, isVisible, isAutoPlaying]);

  // Move focus into the tour when it opens; give it back to the Learn button when it closes.
  useEffect(() => {
    if (!isVisible) return;
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      const learn = Array.from(document.querySelectorAll<HTMLElement>('header button')).find((b) =>
        /^Learn/.test(b.textContent?.trim() ?? '')
      );
      const target = opener && opener !== document.body && document.contains(opener) ? opener : learn;
      target?.focus?.();
    };
  }, [isVisible]);

  useEffect(() => {
    if (isVisible && !isAutoPlaying && !wizardOpen) nextBtnRef.current?.focus();
  }, [isVisible, isAutoPlaying, wizardOpen]);

  useEffect(() => {
    if (!isVisible) return;
    const onKey = (e: KeyboardEvent) => {
      // Only react when the key is not meant for another control: the page body or the tour card itself.
      const t = e.target as HTMLElement | null;
      if (e.key !== 'Escape' && t && t !== document.body && !asideRef.current?.contains(t)) return;
      if (e.key === 'ArrowRight') {
        if (currentIndex < TOUR_STEPS.length - 1) {
          handleNext();
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        handlePrev();
      } else if (e.key === 'Escape') {
        if (isAutoPlaying) {
          stopAutoPlay();
        } else {
          onClose();
        }
      } else if (e.key === ' ' && isAutoPlaying) {
        e.preventDefault();
        togglePauseAutoPlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentIndex, isVisible, isAutoPlaying, handleNext, handlePrev, onClose, stopAutoPlay, togglePauseAutoPlay]);

  if (!isVisible) return null;

  const step = TOUR_STEPS[currentIndex];
  const progressPct = ((currentIndex + 1) / TOUR_STEPS.length) * 100;
  const currentDemoScene = DEMO_SCENES[demoSceneIdx] || DEMO_SCENES[0];
  const demoTotalPct = Math.min(100, (demoElapsedMs / TOTAL_DEMO_MS) * 100);
  const currentSceneSeconds = Math.min(
    SCENE_DURATION_MS / 1000,
    parseFloat(((demoElapsedMs % SCENE_DURATION_MS) / 1000).toFixed(1))
  );

  const selectedQuizAnswer = quizAnswers[currentIndex];
  const isQuizCorrect = selectedQuizAnswer === step.quizCorrectIndex;

  const handleApplyMicroChallenge = () => {
    if (!completedSteps.includes(currentIndex)) {
      setCompletedSteps((prev) => [...prev, currentIndex]);
    }
    if (step.action && onApplyStep) {
      onApplyStep(step.action);
    }
    onExecuteMicroChallenge?.(currentIndex);
  };

  return (
    <>
      {/* 90-second demo: scene caption */}
      {isAutoPlaying && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-auto w-full max-w-2xl px-4">
          <section
            aria-label="90-second demo"
            className="popover p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-body font-semibold text-ink-1">90-second demo</h2>
                <span className="tag tnum">
                  Scene {currentDemoScene.sceneNumber} of {DEMO_SCENES.length} ({Math.floor(demoElapsedMs / 1000)}s / 90s)
                </span>
              </div>

              <div className="flex items-center gap-1">
                {DEMO_SCENES.map((sc, i) => (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => jumpToDemoScene(i)}
                    aria-label={`Scene ${sc.sceneNumber}: ${sc.title}`}
                    aria-current={i === demoSceneIdx ? 'step' : undefined}
                    className={`min-w-6 h-6 px-1 rounded text-micro tnum cursor-pointer border ${
                      i === demoSceneIdx
                        ? 'bg-surface-2 border-line-strong text-ink-1 font-semibold'
                        : 'border-transparent text-ink-3 hover:text-ink-1'
                    }`}
                    title={sc.title}
                  >
                    {sc.sceneNumber}
                  </button>
                ))}
                <button type="button" onClick={togglePauseAutoPlay} className="btn btn-secondary btn-sm ml-1">
                  {isPaused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
                  <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </button>
                <button
                  type="button"
                  onClick={stopAutoPlay}
                  aria-label="Stop the demo"
                  title="Stop the demo (Esc)"
                  className="btn btn-ghost btn-sm px-2"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div
              className="w-full bg-line h-1 rounded-full overflow-hidden"
              role="progressbar"
              aria-label="Demo progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(demoTotalPct)}
            >
              <div className="bg-ink-2 h-full" style={{ width: `${demoTotalPct}%` }} />
            </div>

            <div className="flex flex-col gap-1 text-left" aria-live="polite">
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h3 className="text-body font-semibold text-ink-1">{currentDemoScene.title}</h3>
                <span className="text-caption text-ink-3 tnum">
                  {currentDemoScene.subtitle} ({currentSceneSeconds}s / 11.3s)
                </span>
              </div>
              <p className="text-label text-ink-2 leading-relaxed">{currentDemoScene.caption}</p>
            </div>
          </section>
        </div>
      )}

      {/* Lesson card (hidden while the demo plays; the demo has its own controls) */}
      {!isAutoPlaying && (
      <div
        hidden={wizardOpen}
        className="fixed z-40 pointer-events-none top-16 left-4 right-4 sm:right-auto sm:left-[304px] sm:w-[26rem]"
      >
        <aside
          ref={asideRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="guided-tour-title"
          tabIndex={-1}
          className="pointer-events-auto relative w-full max-h-[calc(100vh-11rem)] popover bg-surface-1 flex flex-col overflow-hidden"
        >
          <div className="px-5 py-3 border-b border-line flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <Compass size={18} className="text-ink-2 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-caption text-ink-3 leading-none whitespace-nowrap">Guided tour</p>
                <h2 id="guided-tour-title" className="text-body font-semibold text-ink-1 mt-1 tnum whitespace-nowrap">
                  Lesson {currentIndex + 1} of {TOUR_STEPS.length}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!isAutoPlaying ? (
                <button type="button" onClick={startAutoPlay} title="Watch the demo (90 seconds)" className="btn btn-secondary btn-sm">
                  <Play size={14} aria-hidden="true" />
                  <span>Watch demo</span>
                </button>
              ) : (
                <button type="button" onClick={togglePauseAutoPlay} className="btn btn-secondary btn-sm">
                  {isPaused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}
                  <span>{isPaused ? 'Resume demo' : 'Pause demo'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? 'Expand the lesson' : 'Collapse the lesson'}
                aria-expanded={!collapsed}
                className="btn btn-ghost btn-sm px-2"
              >
                {collapsed ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronUp size={16} aria-hidden="true" />}
              </button>

              <button
                type="button"
                onClick={onClose}
                aria-label="Close the tour"
                title="Close the tour (Esc)"
                className="btn btn-ghost btn-sm px-2"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          <p hidden={collapsed} className="px-5 py-2 border-b border-line flex items-center gap-2 text-label text-ink-1 shrink-0">
            <Eye size={14} className="shrink-0 text-ink-2" aria-hidden="true" />
            <span>
              <span className="text-ink-2">Look at: </span>
              {step.targetZoneLabel}
            </span>
          </p>

          <div
            className="w-full bg-line h-1 shrink-0"
            role="progressbar"
            aria-label="Tour progress"
            aria-valuemin={1}
            aria-valuemax={TOUR_STEPS.length}
            aria-valuenow={currentIndex + 1}
          >
            <div className="bg-ink-2 h-1 transition-all duration-300" style={{ width: `${progressPct}%` }} />
          </div>

          {/* Scrollable lesson content: groups are separated by hairlines, not nested boxes */}
          <div ref={lessonScrollRef} hidden={collapsed} className="p-4 sm:p-5 overflow-y-auto flex-1 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="tag">{step.subtitle}</span>
                <span className="flex items-center text-caption text-ink-3">
                  <Award className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Unlocks: {step.badgeName}
                </span>
              </div>
              <h3 className="text-title font-semibold text-ink-1">{step.title}</h3>
              <p className="text-body text-ink-2">{step.description}</p>
            </div>

            <div className="pt-3 border-t border-line flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-caption text-ink-3">
                <BookOpen size={14} aria-hidden="true" />
                <span>Core relation</span>
              </div>
              <p className="text-label text-ink-1 tnum break-words">{step.scientificFormula}</p>
            </div>

            <div className="pt-3 border-t border-line flex flex-col gap-1.5">
              <h4 className="text-label font-semibold text-ink-1 flex items-center gap-1.5">
                <Eye size={14} className="text-ink-2" aria-hidden="true" />
                Where to look on screen
              </h4>
              <ul className="flex flex-col gap-1 text-label text-ink-2">
                {step.whereToLook.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-ink-3" aria-hidden="true">
                      &bull;
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-3 border-t border-line">
              <button
                type="button"
                onClick={handleApplyMicroChallenge}
                className="btn btn-secondary w-full h-auto py-2 flex-col items-start gap-1 whitespace-normal text-left"
              >
                <span className="flex w-full items-center justify-between gap-2 text-caption text-ink-3">
                  <span className="flex items-center gap-1.5">
                    {isStepChallengeCompleted ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-ok" aria-hidden="true" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span>{isStepChallengeCompleted ? 'Done' : 'Try it'}</span>
                  </span>
                  <span>{isStepChallengeCompleted ? 'Select to apply again' : 'Select to apply'}</span>
                </span>
                <span className="text-label font-normal text-ink-1">{step.challengePrompt}</span>
              </button>
            </div>

            <div className="pt-3 border-t border-line flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-label font-semibold text-ink-1 flex items-center gap-1.5">
                  <HelpCircle size={14} className="text-ink-2" aria-hidden="true" />
                  Quick check
                </h4>
                {selectedQuizAnswer !== undefined && (
                  <span
                    className={`flex items-center gap-1 text-caption ${isQuizCorrect ? 'text-ok' : 'text-ink-2'}`}
                    role="status"
                  >
                    {isQuizCorrect ? (
                      <>
                        <Check size={14} aria-hidden="true" /> Correct
                      </>
                    ) : (
                      <>
                        <X size={14} aria-hidden="true" /> Try the other option
                      </>
                    )}
                  </span>
                )}
              </div>
              <p className="text-label text-ink-1">{step.quizQuestion}</p>
              <div className="flex flex-col gap-1.5">
                {step.quizOptions.map((opt, oIdx) => {
                  const isChosen = selectedQuizAnswer === oIdx;
                  const isCorrectOpt = oIdx === step.quizCorrectIndex;
                  return (
                    <button
                      key={oIdx}
                      type="button"
                      aria-pressed={isChosen}
                      onClick={() =>
                        setQuizAnswers((prev) => ({
                          ...prev,
                          [currentIndex]: oIdx,
                        }))
                      }
                      className={`text-left px-3 py-1.5 rounded-md border text-label cursor-pointer ${
                        isChosen
                          ? isCorrectOpt
                            ? 'bg-surface-2 border-ok text-ink-1'
                            : 'bg-surface-2 border-line-strong text-ink-1'
                          : 'bg-canvas border-line text-ink-2 hover:border-line-strong hover:text-ink-1'
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-line flex items-center justify-between gap-3 text-caption text-ink-3">
              <span className="tnum shrink-0">
                Completed: {effectiveCompletedSteps.size} / {TOUR_STEPS.length}
              </span>
              <div className="flex flex-wrap gap-1 justify-end">
                {TOUR_STEPS.map((s, idx) => {
                  const isCurrent = idx === currentIndex;
                  const isDone = effectiveCompletedSteps.has(idx);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      aria-label={`Lesson ${idx + 1}: ${s.title}${isDone ? ' (done)' : ''}`}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-micro tnum cursor-pointer border ${
                        isCurrent
                          ? 'bg-ink-1 text-canvas border-ink-1 font-semibold'
                          : isDone
                          ? 'bg-surface-2 text-ink-1 border-line-strong'
                          : 'border-line text-ink-3 hover:border-line-strong hover:text-ink-1'
                      }`}
                      title={`${s.badgeName}: ${s.title}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div hidden={collapsed} className="px-5 py-3 border-t border-line flex items-center justify-between shrink-0">
            <button type="button" onClick={handlePrev} disabled={currentIndex === 0} className="btn btn-ghost">
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Previous</span>
            </button>

            <button ref={nextBtnRef} type="button" onClick={handleNext} className="btn btn-primary">
              <span>{currentIndex === TOUR_STEPS.length - 1 ? 'Finish tour' : 'Next lesson'}</span>
              {currentIndex === TOUR_STEPS.length - 1 ? (
                <CheckCircle2 size={16} aria-hidden="true" />
              ) : (
                <ArrowRight size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        </aside>
      </div>
      )}
    </>
  );
}

export default GuidedDetectiveTour;
