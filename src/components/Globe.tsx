import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseWindField, sampleWind, advectLatLon, type WindField } from '../lib/wind';
import { sunDirection } from '../lib/solar';
import {
  latLonToVector3,
  latLonToVector3Into,
  latLonToUnitVector3,
  slerpUnitVectors,
  subdivideSphericalTriangle,
  vector3ToLatLon,
  findNearestBasin,
} from '../lib/geo';
import { calculatePearsonR } from '../lib/statistics';
import { buildWmsSnapshotUrl, getGibsAirsCoWmsUrl, type LayerKind } from '../lib/gibs';
import {
  EARTH_VERTEX,
  EARTH_FRAGMENT,
  ATMOSPHERE_VERTEX,
  ATMOSPHERE_FRAGMENT,
  BASIN_VERTEX,
  BASIN_FRAGMENT,
  DIPOLE_ARC_VERTEX,
  DIPOLE_ARC_FRAGMENT,
} from './globeShaders';
import { fetchActiveEONETEvents, type EONETEvent } from '../lib/eonet';
import type { AppMode } from './ModeSwitcherHUD';
import type { AOISelection } from './GISAnalysisPanel';
import { matchesEarthClassOrArchetype } from '../lib/earthClasses';
import { COLORS } from '../theme/colors';

export interface BasinFeature {
  type: string;
  id: string;
  geometry: {
    type: string;
    coordinates: any;
  };
  properties: {
    basin_id: string;
    basin_name: string;
    continent: string;
    centroid: [number, number];
    area_sqkm: number;
    theil_sen_slope: number;
    theil_sen_ci_low: number;
    theil_sen_ci_high: number;
    theil_sen_unit: string;
    mann_kendall_z: number;
    mann_kendall_s: number;
    mann_kendall_var_s: number;
    rho_1_autocorr?: number;
    yue_pilon_prewhitened?: boolean;
    p_value_raw: number;
    p_value_fdr: number;
    p_value_corrected?: number;
    time_of_emergence_year?: number | null;
    significant: boolean;
    confidence_pct?: number;
    is_control?: boolean;
    is_negative_control?: boolean;
    trend_category: string;
    anomaly_class?: string;
    causal_attribution?: string;
    earth_classes?: string[];
    triangulation?: {
      chi_hydro_evap_ratio: number;
      seasonal_lag_months: number;
      vegetation_resilience_score: number;
      buffer_collapsed: boolean;
      skeletal_storativity_s_sk: number;
      compaction_rate_mm_yr: number;
      irreversible_subsidence: boolean;
    };
    breakpoint_year?: number | null;
    n_star?: number | null;
    dipole_partner_id: string | null;
    dipole_system: string | null;
    dipole_r?: number;
    dipole_strength?: number;
    dipole_mechanism?: string;
    area_km2?: number;
    pettitt_p?: number;
    is_significant_shift?: boolean;
    optimal_driver?: string;
    driver_lag_months?: number;
    driver_r?: number;
    bbox?: any;
    signal_to_noise_ratio?: number;
    time_series: {
      timestamps: string[];
      dates?: string[];
      raw?: number[];
      deseasonalized?: number[];
      conf_lower?: number[];
      conf_upper?: number[];
      seasonal?: number[];
      trend_line?: number[];
      swot_wse: number[];
      modis_ndvi: number[];
      atmospheric_vpd: number[];
      insar_subsidence: number[];
      stl_trend: number[];
      stl_seasonal: number[];
      precip_anom?: number[];
      soil_moisture?: number[];
    };
  };
}

export interface ProbePointResult {
  lat: number;
  lon: number;
  windSpeed: number;
  windAzimuth: number;
  nearestBasin: BasinFeature | null;
  distanceKm: number;
  cardinal: string;
}

export interface GlobeProps {
  timestamp?: number;
  explodeAmount?: number;
  simulatedYear?: number;
  confidenceFilter?: 'all' | 'high' | 'likely';
  significanceLock?: boolean;
  epochDeltaMode?: boolean;
  showWind?: boolean;
  showDipoles?: boolean;
  showStratifiedStack?: boolean;
  selectedBasinId?: string | null;
  compareData?: {
    regionA: BasinFeature;
    regionB: BasinFeature;
    dipoleName?: string;
    dipoleSystem?: string;
    mechanism?: string;
  } | null;
  highlightedBasinId?: string | null;
  cameraTarget?: [number, number] | null; // [lon, lat]
  activeLayer?: LayerKind;
  windSpeedScale?: number;
  extrudeRelief?: boolean;
  activeProbeCoordinate?: [number, number] | null; // [lat, lon]
  mode?: AppMode;
  activeVariable?: 'tws' | 'precip' | 'et' | 'runoff' | 'temp' | 'soil' | 'no2';
  selectedEarthClass?: string | null;
  aoiSelection?: AOISelection | null;
  onSelectBasin?: (basin: BasinFeature | null) => void;
  onHoverBasin?: (basin: BasinFeature | null, x?: number, y?: number) => void;
  onProbePoint?: (probe: ProbePointResult) => void;
  onCompareCustomBasins?: (basinA: BasinFeature, basinB: BasinFeature) => void;
  onSelectAOI?: (aoi: AOISelection | null) => void;
  onSelectEONETEvent?: (event: EONETEvent) => void;
}

export interface GlobeRef {
  flyTo: (lat: number, lon: number, altitude?: number) => void;
}

export interface BasinMeshRecord {
  mesh: THREE.Mesh;
  line: THREE.LineLoop;
  feature: BasinFeature;
  baseColor: THREE.Color;
  baseOpacity: number;
  baseLineColor: number;
  baseLineOpacity: number;
}

// Screen-Space Centroid Projection for AOI Selection in GIS Mode
export function getBasinsInScreenBox(
  basins: BasinFeature[],
  box: { minX: number; minY: number; maxX: number; maxY: number },
  camera: THREE.Camera,
  canvasWidth: number,
  canvasHeight: number
): BasinFeature[] {
  const selected: BasinFeature[] = [];
  const tempVec = new THREE.Vector3();
  const cameraPos = new THREE.Vector3();
  camera.getWorldPosition(cameraPos);
  const camDir = cameraPos.clone().normalize();

  for (const basin of basins) {
    const [lng, lat] = basin.properties.centroid;
    const pos3D = new THREE.Vector3(...latLonToVector3(lat, lng, 1.0));
    // Back-face culling: do not select basins on the far side of the globe
    const isBackFace = pos3D.distanceTo(cameraPos.length() > 1.4 ? camDir : cameraPos) > 1.35;
    if (isBackFace) continue;

    tempVec.copy(pos3D).project(camera);
    const screenX = ((tempVec.x + 1) * canvasWidth) / 2;
    const screenY = ((-tempVec.y + 1) * canvasHeight) / 2;
    if (screenX >= box.minX && screenX <= box.maxX && screenY >= box.minY && screenY <= box.maxY) {
      selected.push(basin);
    }
  }
  return selected;
}

// Color matching for Multi-Variable Layer Support
export function getBasinMultiVariableColor(
  basin: BasinFeature,
  isSelected: boolean,
  confidenceFilter: 'all' | 'high' | 'likely',
  activeVariable: 'tws' | 'precip' | 'et' | 'runoff' | 'temp' | 'soil' | 'no2' = 'tws',
  simulatedYear: number = 2024,
  selectedEarthClass: string | null = null
): { color: THREE.Color; opacity: number; isInconclusive: boolean } {
  if (isSelected) {
    // The selected region keeps its own trend colour, so colour always means the trend.
    // The shader lifts it and the outline goes fully white to mark the selection.
    const own = getBasinMultiVariableColor(basin, false, 'all', activeVariable, simulatedYear, null);
    return { color: own.color, opacity: 0.95, isInconclusive: own.isInconclusive };
  }

  // Earth Classification & Prompt Biome Archetype Filter check
  if (selectedEarthClass) {
    const matches = matchesEarthClassOrArchetype(basin, selectedEarthClass);
    if (!matches) {
      return { color: new THREE.Color('#1E222A'), opacity: 0.12, isInconclusive: true };
    }
  }

  // Filter evaluation
  const pVal = basin.properties.p_value_fdr;
  let passesConfidence = true;
  if (confidenceFilter === 'high') passesConfidence = pVal < 0.01;
  else if (confidenceFilter === 'likely') passesConfidence = pVal < 0.05;

  const isInconclusive =
    !passesConfidence || (!basin.properties.significant && confidenceFilter === 'all') || pVal >= 0.05;

  if (isInconclusive) {
    return { color: new THREE.Color('#334155'), opacity: 0.15, isInconclusive: true };
  }

  const pAny = basin.properties as any;
  const elapsedYears = Math.max(0, simulatedYear - 2002);
  const yearFraction = Math.max(0.15, Math.min(1.5, elapsedYears / 22.0));
  const yearIntensity = Math.min(1.3, 0.45 + yearFraction * 0.55);

  // Multi-variable mapping using actual pipeline slopes
  if (activeVariable === 'temp') {
    const tempSlope = typeof pAny.temp_slope === 'number' ? pAny.temp_slope : 0.025;
    const op = Math.min(0.95, 0.75 * yearIntensity);
    if (tempSlope >= 0.032) return { color: new THREE.Color('#DC2626'), opacity: op, isInconclusive: false };
    if (tempSlope >= 0.024) return { color: new THREE.Color('#F97316'), opacity: op, isInconclusive: false };
    return { color: new THREE.Color('#38BDF8'), opacity: Math.min(0.85, 0.65 * yearIntensity), isInconclusive: false };
  } else if (activeVariable === 'precip') {
    const precipSlope = typeof pAny.precip_slope === 'number' ? pAny.precip_slope : basin.properties.theil_sen_slope * 0.005;
    const op = Math.min(0.95, 0.75 * yearIntensity);
    if (precipSlope > 0.002) return { color: new THREE.Color('#2563EB'), opacity: op, isInconclusive: false };
    if (precipSlope > 0.0005) return { color: new THREE.Color('#06B6D4'), opacity: op, isInconclusive: false };
    if (precipSlope < -0.002) return { color: new THREE.Color('#DC2626'), opacity: op, isInconclusive: false };
    return { color: new THREE.Color('#F87171'), opacity: op, isInconclusive: false };
  } else if (activeVariable === 'soil') {
    const soilSlope = typeof pAny.soil_slope === 'number' ? pAny.soil_slope : 0;
    const op = Math.min(0.95, 0.75 * yearIntensity);
    if (soilSlope > 0.0005) return { color: new THREE.Color('#10B981'), opacity: op, isInconclusive: false };
    if (soilSlope < -0.001) return { color: new THREE.Color('#B45309'), opacity: op, isInconclusive: false };
    return { color: new THREE.Color('#F59E0B'), opacity: op, isInconclusive: false };
  } else if (activeVariable === 'et') {
    const etSlope = typeof pAny.et_slope === 'number' ? pAny.et_slope : basin.properties.theil_sen_slope * 0.002;
    const op = Math.min(0.95, 0.75 * yearIntensity);
    if (etSlope > 0.001) return { color: new THREE.Color('#059669'), opacity: op, isInconclusive: false };
    if (etSlope < -0.001) return { color: new THREE.Color('#D97706'), opacity: op, isInconclusive: false };
    return { color: new THREE.Color('#10B981'), opacity: op, isInconclusive: false };
  } else if (activeVariable === 'runoff') {
    const qSlope = typeof pAny.runoff_slope === 'number' ? pAny.runoff_slope : basin.properties.theil_sen_slope * 0.003;
    const op = Math.min(0.95, 0.75 * yearIntensity);
    if (qSlope > 0.001) return { color: new THREE.Color('#2563EB'), opacity: op, isInconclusive: false };
    if (qSlope < -0.001) return { color: new THREE.Color('#E11D48'), opacity: op, isInconclusive: false };
    return { color: new THREE.Color('#38BDF8'), opacity: op, isInconclusive: false };
  } else if (activeVariable === 'no2') {
    const op = Math.min(0.95, 0.75 * yearIntensity);
    return { color: new THREE.Color('#A855F7'), opacity: op, isInconclusive: false };
  }

  // Default: TWS RdBu modulated by timeline progression
  const cumulativeTrend = basin.properties.theil_sen_slope * yearFraction;
  const op = Math.min(0.95, 0.65 * yearIntensity);
  // Same five bins and colours as the left-panel legend (src/theme/colors.ts).
  if (cumulativeTrend < -0.9) {
    return { color: new THREE.Color(COLORS.dry3), opacity: op, isInconclusive: false };
  }
  if (cumulativeTrend < -0.18) {
    return { color: new THREE.Color(COLORS.dry2), opacity: op, isInconclusive: false };
  }
  if (cumulativeTrend > 0.9) {
    return { color: new THREE.Color(COLORS.wet3), opacity: op, isInconclusive: false };
  }
  if (cumulativeTrend > 0.18) {
    return { color: new THREE.Color(COLORS.wet2), opacity: op, isInconclusive: false };
  }
  return { color: new THREE.Color(COLORS.ink3), opacity: 0.5 * yearIntensity, isInconclusive: false };
}

// 2D Point-in-polygon ray casting algorithm
function isPointInPoly(pt: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const Globe = forwardRef<GlobeRef, GlobeProps>(function Globe(
  {
    timestamp = 1704067200000,
    explodeAmount = 0,
    simulatedYear = 2024,
    confidenceFilter = 'all',
    significanceLock = false,
    epochDeltaMode = false,
    showWind = true,
    showDipoles = true,
    showStratifiedStack = true,
    compareData = null,
    selectedBasinId = null,
    highlightedBasinId = null,
    cameraTarget = null,
    activeLayer = 'base',
    windSpeedScale = 1.0,
    extrudeRelief = false,
    activeProbeCoordinate = null,
    mode = 'REMOTE_SENSING',
    activeVariable = 'tws',
    selectedEarthClass = null,
    aoiSelection = null,
    onSelectBasin,
    onHoverBasin,
    onProbePoint,
    onCompareCustomBasins,
    onSelectAOI,
    onSelectEONETEvent,
  }: GlobeProps,
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragBoxRef = useRef<HTMLDivElement>(null);

  const timestampRef = useRef(timestamp);
  const windSpeedScaleRef = useRef(windSpeedScale);
  const explodeAmountRef = useRef(explodeAmount);
  const simulatedYearRef = useRef(simulatedYear);
  const significanceLockRef = useRef(significanceLock);
  const epochDeltaModeRef = useRef(epochDeltaMode);
  const showWindRef = useRef(showWind);
  const showDipolesRef = useRef(showDipoles);
  const showStratifiedStackRef = useRef(showStratifiedStack);
  const compareDataRef = useRef(compareData);
  const selectedBasinIdRef = useRef(selectedBasinId);
  const highlightedBasinIdRef = useRef(highlightedBasinId);
  const extrudeReliefRef = useRef(extrudeRelief);
  const activeLayerRef = useRef(activeLayer);
  const modeRef = useRef(mode);
  const activeVariableRef = useRef(activeVariable);
  const selectedEarthClassRef = useRef(selectedEarthClass);
  const onSelectBasinRef = useRef(onSelectBasin);
  const onHoverBasinRef = useRef(onHoverBasin);
  const onProbePointRef = useRef(onProbePoint);
  const onCompareCustomBasinsRef = useRef(onCompareCustomBasins);
  const onSelectAOIRef = useRef(onSelectAOI);
  const onSelectEONETEventRef = useRef(onSelectEONETEvent);

  useEffect(() => {
    timestampRef.current = timestamp;
    windSpeedScaleRef.current = windSpeedScale;
    explodeAmountRef.current = explodeAmount;
    simulatedYearRef.current = simulatedYear;
    significanceLockRef.current = significanceLock;
    epochDeltaModeRef.current = epochDeltaMode;
    if (earthUniformsRef.current) {
      earthUniformsRef.current.uEpochDeltaMode.value = epochDeltaMode ? 1.0 : 0.0;
    }
    showWindRef.current = showWind;
    showDipolesRef.current = showDipoles;
    showStratifiedStackRef.current = showStratifiedStack;
    compareDataRef.current = compareData;
    selectedBasinIdRef.current = selectedBasinId;
    highlightedBasinIdRef.current = highlightedBasinId;
    extrudeReliefRef.current = extrudeRelief;
    activeLayerRef.current = activeLayer;
    modeRef.current = mode;
    activeVariableRef.current = activeVariable;
    selectedEarthClassRef.current = selectedEarthClass;
    onSelectBasinRef.current = onSelectBasin;
    onHoverBasinRef.current = onHoverBasin;
    onProbePointRef.current = onProbePoint;
    onCompareCustomBasinsRef.current = onCompareCustomBasins;
    onSelectAOIRef.current = onSelectAOI;
    onSelectEONETEventRef.current = onSelectEONETEvent;
  }, [
    timestamp,
    windSpeedScale,
    explodeAmount,
    simulatedYear,
    significanceLock,
    epochDeltaMode,
    showWind,
    showDipoles,
    showStratifiedStack,
    compareData,
    selectedBasinId,
    highlightedBasinId,
    extrudeRelief,
    activeLayer,
    mode,
    activeVariable,
    selectedEarthClass,
    onSelectBasin,
    onHoverBasin,
    onProbePoint,
    onCompareCustomBasins,
    onSelectAOI,
    onSelectEONETEvent,
  ]);

  // Three.js internal objects refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const earthMeshRef = useRef<THREE.Mesh | null>(null);
  const earthUniformsRef = useRef<any>(null);
  const atmosphereUniformsRef = useRef<any>(null);
  const windLinesRef = useRef<THREE.LineSegments | null>(null);
  const dipolesGroupRef = useRef<THREE.Group | null>(null);
  const dipoleMaterialsRef = useRef<THREE.ShaderMaterial[]>([]);
  const stipplingGroupRef = useRef<THREE.Group | null>(null);
  const subBasinMaskGroupRef = useRef<THREE.Group | null>(null);
  const eonetPinsGroupRef = useRef<THREE.Group | null>(null);
  const aoiLassoGroupRef = useRef<THREE.Group | null>(null);
  const troposphereGroupRef = useRef<THREE.Group | null>(null);
  const lithosphereGroupRef = useRef<THREE.Group | null>(null);
  const beaconGroupRef = useRef<THREE.Group | null>(null);
  const basinMeshesRef = useRef<BasinMeshRecord[]>([]);
  const eonetSpritesRef = useRef<Array<{ sprite: THREE.Sprite; event: EONETEvent }>>([]);
  const windFieldRef = useRef<WindField | null>(null);
  const emptyTextureRef = useRef<THREE.Texture | null>(null);
  const basinsGeoJsonRef = useRef<any>(null);

  // AOI Drag state
  const isDraggingAOIRef = useRef(false);
  const aoiStartScreenPosRef = useRef<{ x: number; y: number } | null>(null);

  // Fetch wind dataset
  useEffect(() => {
    fetch('/data/wind.json')
      .then((res) => res.json())
      .then((json) => {
        try {
          windFieldRef.current = parseWindField(json);
        } catch (e) {
          console.error('Failed to parse wind data:', e);
        }
      })
      .catch((err) => console.error('Failed to load wind.json:', err));
  }, []);

  // Preload NASA base textures asynchronously
  const [baseTextures, setBaseTextures] = useState<{ day: THREE.Texture; night: THREE.Texture } | null>(null);
  useEffect(() => {
    const loader = new THREE.TextureLoader();
    Promise.all([
      loader.loadAsync('/textures/earth-day-blue-marble.jpg'),
      loader.loadAsync('/textures/earth-night-black-marble.jpg'),
    ])
      .then(([day, night]) => {
        day.colorSpace = THREE.SRGBColorSpace;
        day.wrapS = THREE.RepeatWrapping;
        day.anisotropy = 8;
        night.colorSpace = THREE.SRGBColorSpace;
        night.wrapS = THREE.RepeatWrapping;
        night.anisotropy = 8;
        setBaseTextures({ day, night });
        if (typeof window !== 'undefined') {
          (window as any).__STRATUM4D_BASE_LOADED__ = true;
        }
      })
      .catch((err) => console.error('Failed to preload textures:', err));
  }, []);

  // Fetch basins dataset
  const [basinsGeoJson, setBasinsGeoJson] = useState<any>(null);
  useEffect(() => {
    fetch('/data/basins.geojson')
      .then((res) => res.json())
      .then((data) => {
        basinsGeoJsonRef.current = data;
        setBasinsGeoJson(data);
      })
      .catch((err) => console.error('Failed to load basins.geojson:', err));
  }, []);

  useEffect(() => {
    basinsGeoJsonRef.current = basinsGeoJson;
  }, [basinsGeoJson]);

  // Camera Fly-To animation
  const flyTo = (lat: number, lon: number, altitude = 2.25) => {
    if (!cameraRef.current || !controlsRef.current) return;
    const dest = latLonToVector3(lat, lon, altitude);
    const cam = cameraRef.current;
    const controls = controlsRef.current;

    const startPos = cam.position.clone();
    const endPos = new THREE.Vector3(...dest);
    let progress = 0;

    const flyAnim = () => {
      progress += 0.04;
      cam.position.lerpVectors(startPos, endPos, Math.min(1.0, progress));
      controls.target.set(0, 0, 0);
      controls.update();
      if (progress < 1.0) {
        requestAnimationFrame(flyAnim);
      }
    };
    flyAnim();
  };

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lon: number, altitude?: number) => {
      flyTo(lat, lon, altitude ?? 2.25);
    },
  }), []);

  useEffect(() => {
    if (!cameraTarget) return;
    const [lon, lat] = cameraTarget;
    flyTo(lat, lon, 2.25);
  }, [cameraTarget]);

  // Main Three.js Scene Setup
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !baseTextures) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(2.36, 0.99, 1.36);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1.2;
    controls.maxDistance = 5.5;
    controls.rotateSpeed = 0.8;
    controls.zoomSpeed = 0.85;
    controlsRef.current = controls;

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const { day: dayTexture, night: nightTexture } = baseTextures;

    const emptyCanvas = document.createElement('canvas');
    emptyCanvas.width = 1;
    emptyCanvas.height = 1;
    const emptyTexture = new THREE.CanvasTexture(emptyCanvas);
    emptyTextureRef.current = emptyTexture;

    const earthUniforms = {
      dayMap: { value: dayTexture },
      nightMap: { value: nightTexture },
      overlayMap: { value: emptyTexture },
      baselineMap: { value: emptyTexture },
      overlayStrength: { value: 0.0 },
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
      uDataFocusFactor: { value: 0.0 },
      uEpochDeltaMode: { value: epochDeltaModeRef.current ? 1.0 : 0.0 },
    };
    earthUniformsRef.current = earthUniforms;

    const earthMaterial = new THREE.ShaderMaterial({
      vertexShader: EARTH_VERTEX,
      fragmentShader: EARTH_FRAGMENT,
      uniforms: earthUniforms,
    });
    const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1.0, 64, 64), earthMaterial);
    earthMeshRef.current = earthMesh;
    globeGroup.add(earthMesh);

    const atmosphereUniforms = {
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
    };
    atmosphereUniformsRef.current = atmosphereUniforms;

    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: ATMOSPHERE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      uniforms: atmosphereUniforms,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const atmosphereMesh = new THREE.Mesh(new THREE.SphereGeometry(1.0, 64, 64), atmosphereMaterial);
    atmosphereMesh.scale.setScalar(1.045);
    globeGroup.add(atmosphereMesh);

    // Wind lines
    const NUM_PARTICLES = 8500;
    const TRAIL_LEN = 8;
    const particleLats = new Float32Array(NUM_PARTICLES);
    const particleLons = new Float32Array(NUM_PARTICLES);
    const particleAges = new Int16Array(NUM_PARTICLES);
    const particleMaxAges = new Int16Array(NUM_PARTICLES);

    const totalVertices = NUM_PARTICLES * TRAIL_LEN;
    const positionsBuffer = new Float32Array(totalVertices * 3);
    const colorsBuffer = new Float32Array(totalVertices * 4);
    const segmentsPerParticle = TRAIL_LEN - 1;
    const indicesBuffer = new Uint32Array(NUM_PARTICLES * segmentsPerParticle * 2);

    let idxPtr = 0;
    for (let p = 0; p < NUM_PARTICLES; p++) {
      const baseVertex = p * TRAIL_LEN;
      for (let s = 0; s < segmentsPerParticle; s++) {
        indicesBuffer[idxPtr++] = baseVertex + s;
        indicesBuffer[idxPtr++] = baseVertex + s + 1;
      }
      const lat = (Math.asin(2 * Math.random() - 1) * 180) / Math.PI;
      const lon = Math.random() * 360 - 180;
      particleLats[p] = lat;
      particleLons[p] = lon;
      particleAges[p] = Math.floor(Math.random() * 120);
      particleMaxAges[p] = 120 + Math.floor(Math.random() * 160);

      const initialPos = latLonToVector3(lat, lon, 1.008);
      for (let v = 0; v < TRAIL_LEN; v++) {
        const off = (p * TRAIL_LEN + v) * 3;
        positionsBuffer[off] = initialPos[0];
        positionsBuffer[off + 1] = initialPos[1];
        positionsBuffer[off + 2] = initialPos[2];
      }
    }

    const windGeometry = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positionsBuffer, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    windGeometry.setAttribute('position', posAttr);

    const colAttr = new THREE.BufferAttribute(colorsBuffer, 4);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    windGeometry.setAttribute('color', colAttr);
    windGeometry.setIndex(new THREE.BufferAttribute(indicesBuffer, 1));

    const windMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.95,
    });
    const windLines = new THREE.LineSegments(windGeometry, windMaterial);
    windLinesRef.current = windLines;

    // Groups
    const troposphereGroup = new THREE.Group();
    troposphereGroupRef.current = troposphereGroup;
    troposphereGroup.add(windLines);
    globeGroup.add(troposphereGroup);

    const dipolesGroup = new THREE.Group();
    dipolesGroupRef.current = dipolesGroup;
    globeGroup.add(dipolesGroup);

    const stipplingGroup = new THREE.Group();
    stipplingGroupRef.current = stipplingGroup;
    globeGroup.add(stipplingGroup);

    const subBasinMaskGroup = new THREE.Group();
    subBasinMaskGroupRef.current = subBasinMaskGroup;
    globeGroup.add(subBasinMaskGroup);

    const eonetPinsGroup = new THREE.Group();
    eonetPinsGroupRef.current = eonetPinsGroup;
    globeGroup.add(eonetPinsGroup);

    const aoiLassoGroup = new THREE.Group();
    aoiLassoGroupRef.current = aoiLassoGroup;
    globeGroup.add(aoiLassoGroup);

    const lithosphereGroup = new THREE.Group();
    lithosphereGroupRef.current = lithosphereGroup;
    globeGroup.add(lithosphereGroup);

    const beaconGroup = new THREE.Group();
    beaconGroupRef.current = beaconGroup;
    globeGroup.add(beaconGroup);

    const uvScratch = [0, 0];
    const advectScratch = [0, 0];
    const posScratch: [number, number, number] = [0, 0, 0];
    const sunVec = new THREE.Vector3();

    // Animation Loop
    const clock = new THREE.Clock();
    let animId: number;
    // Decorative pulses (pair arcs, hover highlight, mask) hold still when the user asks for reduced motion.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const animate = () => {
      animId = requestAnimationFrame(animate);

      controls.update();

      const delta = clock.getDelta();
      const elapsed = reduceMotion ? 0 : clock.getElapsedTime();
      const dt = Math.min(delta, 1 / 30);
      const simSeconds = dt * 16000 * (windSpeedScaleRef.current ?? 1.0);

      const curSun = sunDirection(new Date(timestampRef.current));
      sunVec.set(curSun[0], curSun[1], curSun[2]).normalize();
      earthUniforms.sunDir.value.copy(sunVec);
      atmosphereUniforms.sunDir.value.copy(sunVec);

      const extrudeRelief = extrudeReliefRef.current;
      const activeLayer = activeLayerRef.current;
      earthUniforms.uDataFocusFactor.value = THREE.MathUtils.lerp(
        earthUniforms.uDataFocusFactor.value,
        (extrudeRelief || activeLayer !== 'base') ? 1.0 : 0.0,
        0.05
      );

      if (troposphereGroupRef.current) {
        const expScale = 1.0 + (explodeAmountRef.current ?? 0) * 0.08;
        troposphereGroupRef.current.scale.set(expScale, expScale, expScale);
      }

      // Update dipole arc pulse travel animations
      if (dipoleMaterialsRef.current.length > 0) {
        for (const mat of dipoleMaterialsRef.current) {
          if (mat.uniforms?.uTime) {
            mat.uniforms.uTime.value = elapsed;
          }
        }
      }

      // Pulse Sub-Basin AI Segmentation Masks
      if (subBasinMaskGroupRef.current?.children.length) {
        const pulse = 0.75 + 0.25 * Math.sin(elapsed * 4.0);
        for (const child of subBasinMaskGroupRef.current.children) {
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
          if (mat) mat.opacity = pulse;
        }
      }

      // Basin Hover Highlight Pulse (Table row hover in GISAnalysisPanel)
      const hlId = highlightedBasinIdRef.current;
      if (basinMeshesRef.current.length > 0) {
        const hlPulse = 0.5 + 0.5 * Math.sin(elapsed * 7.0);
        for (const item of basinMeshesRef.current) {
          const isHl = Boolean(hlId && item.feature.properties.basin_id === hlId);
          const isSel = Boolean(
            selectedBasinIdRef.current && item.feature.properties.basin_id === selectedBasinIdRef.current
          );
          const lineMat = item.line.material as THREE.LineBasicMaterial;
          const meshMat = item.mesh.material as any;

          if (isHl) {
            if (lineMat) {
              lineMat.color.setHex(0x38bdf8);
              lineMat.opacity = 0.85 + 0.15 * hlPulse;
            }
            if (meshMat) {
              if (meshMat.uniforms?.uBaseColor) {
                meshMat.uniforms.uBaseColor.value.setHex(0x38bdf8);
                meshMat.uniforms.uOpacity.value = 0.35 + 0.45 * hlPulse;
              } else if (meshMat.color) {
                meshMat.color.setHex(0x38bdf8);
                meshMat.opacity = 0.35 + 0.45 * hlPulse;
              }
            }
          } else if (!isSel) {
            if (lineMat && (lineMat.opacity !== item.baseLineOpacity || lineMat.color.getHex() !== item.baseLineColor)) {
              lineMat.color.setHex(item.baseLineColor);
              lineMat.opacity = item.baseLineOpacity;
            }
            if (meshMat) {
              if (meshMat.uniforms?.uBaseColor) {
                if (!meshMat.uniforms.uBaseColor.value.equals(item.baseColor)) {
                  meshMat.uniforms.uBaseColor.value.copy(item.baseColor);
                }
                meshMat.uniforms.uOpacity.value = item.baseOpacity;
                if (meshMat.uniforms.uSelected) {
                  meshMat.uniforms.uSelected.value = 0.0;
                }
                if (meshMat.uniforms.uIsSelected) {
                  meshMat.uniforms.uIsSelected.value = 0.0;
                }
              } else if (meshMat.color) {
                if (meshMat.opacity !== item.baseOpacity || !meshMat.color.equals(item.baseColor)) {
                  meshMat.color.copy(item.baseColor);
                  meshMat.opacity = item.baseOpacity;
                }
              }
            }
          } else if (isSel) {
            if (meshMat?.uniforms) {
              if (meshMat.uniforms.uSelected) meshMat.uniforms.uSelected.value = 1.0;
              if (meshMat.uniforms.uIsSelected) meshMat.uniforms.uIsSelected.value = 1.0;
            }
          }
        }
      }

      // Wind advection
      const field = windFieldRef.current;
      if (showWindRef.current && field && windLines.visible) {
        for (let p = 0; p < NUM_PARTICLES; p++) {
          const baseOffset = p * TRAIL_LEN;
          for (let k = TRAIL_LEN - 1; k >= 1; k--) {
            const destIdx = (baseOffset + k) * 3;
            const srcIdx = (baseOffset + k - 1) * 3;
            positionsBuffer[destIdx] = positionsBuffer[srcIdx];
            positionsBuffer[destIdx + 1] = positionsBuffer[srcIdx + 1];
            positionsBuffer[destIdx + 2] = positionsBuffer[srcIdx + 2];
          }

          let lat = particleLats[p];
          let lon = particleLons[p];
          sampleWind(field, lat, lon, uvScratch);
          const speed = Math.sqrt(uvScratch[0] * uvScratch[0] + uvScratch[1] * uvScratch[1]);

          advectLatLon(lat, lon, uvScratch[0], uvScratch[1], simSeconds, advectScratch);
          lat = advectScratch[0];
          lon = advectScratch[1];
          particleLats[p] = lat;
          particleLons[p] = lon;

          latLonToVector3Into(lat, lon, 1.008, posScratch, 0);
          const headIdx = baseOffset * 3;
          positionsBuffer[headIdx] = posScratch[0];
          positionsBuffer[headIdx + 1] = posScratch[1];
          positionsBuffer[headIdx + 2] = posScratch[2];

          const speedRatio = Math.min(1.0, speed / 26.0);
          for (let k = 0; k < TRAIL_LEN; k++) {
            const t = 1.0 - k / (TRAIL_LEN - 1);
            const brightness = t * t;
            const colIdx = (baseOffset + k) * 4;
            colorsBuffer[colIdx] = 1.0 * brightness;
            colorsBuffer[colIdx + 1] = (0.55 + 0.40 * speedRatio) * brightness;
            colorsBuffer[colIdx + 2] = (0.15 + 0.50 * speedRatio) * brightness;
            colorsBuffer[colIdx + 3] = brightness * 0.95;
          }

          particleAges[p]++;
          if (particleAges[p] >= particleMaxAges[p] || Math.abs(lat) > 88) {
            const newLat = (Math.asin(2 * Math.random() - 1) * 180) / Math.PI;
            const newLon = Math.random() * 360 - 180;
            particleLats[p] = newLat;
            particleLons[p] = newLon;
            particleAges[p] = 0;
            particleMaxAges[p] = 120 + Math.floor(Math.random() * 160);

            latLonToVector3Into(newLat, newLon, 1.008, posScratch, 0);
            for (let k = 0; k < TRAIL_LEN; k++) {
              const off = (baseOffset + k) * 3;
              positionsBuffer[off] = posScratch[0];
              positionsBuffer[off + 1] = posScratch[1];
              positionsBuffer[off + 2] = posScratch[2];
            }
          }
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Raycasting & AOI Lasso Mouse Events
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    let downPos = { x: 0, y: 0 };

    const updateAOILassoGeometry = (minLng: number, minLat: number, maxLng: number, maxLat: number) => {
      const group = aoiLassoGroupRef.current;
      if (!group) return;

      while (group.children.length > 0) {
        const c = group.children[0] as any;
        group.remove(c);
        c.geometry?.dispose();
        c.material?.dispose();
      }

      const rBox = 1.004;
      const rBorder = 1.0045;
      const steps = 16;
      const ptsTop: THREE.Vector3[] = [];
      const ptsRight: THREE.Vector3[] = [];
      const ptsBottom: THREE.Vector3[] = [];
      const ptsLeft: THREE.Vector3[] = [];

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lon = minLng + t * (maxLng - minLng);
        const p = latLonToVector3(maxLat, lon, rBorder);
        ptsTop.push(new THREE.Vector3(...p));
      }
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = maxLat - t * (maxLat - minLat);
        const p = latLonToVector3(lat, maxLng, rBorder);
        ptsRight.push(new THREE.Vector3(...p));
      }
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lon = maxLng - t * (maxLng - minLng);
        const p = latLonToVector3(minLat, lon, rBorder);
        ptsBottom.push(new THREE.Vector3(...p));
      }
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lat = minLat + t * (maxLat - minLat);
        const p = latLonToVector3(lat, minLng, rBorder);
        ptsLeft.push(new THREE.Vector3(...p));
      }

      const loopPoints = [...ptsTop, ...ptsRight, ...ptsBottom, ...ptsLeft];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(loopPoints);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 2, transparent: true, opacity: 0.95 });
      const borderLine = new THREE.LineLoop(lineGeo, lineMat);
      group.add(borderLine);

      // Translucent Blue Box Fill
      const meshVertices: number[] = [];
      const gridSteps = 12;
      for (let i = 0; i < gridSteps; i++) {
        for (let j = 0; j < gridSteps; j++) {
          const u0 = minLng + (i / gridSteps) * (maxLng - minLng);
          const u1 = minLng + ((i + 1) / gridSteps) * (maxLng - minLng);
          const v0 = minLat + (j / gridSteps) * (maxLat - minLat);
          const v1 = minLat + ((j + 1) / gridSteps) * (maxLat - minLat);

          const p00 = latLonToVector3(v0, u0, rBox);
          const p10 = latLonToVector3(v0, u1, rBox);
          const p11 = latLonToVector3(v1, u1, rBox);
          const p01 = latLonToVector3(v1, u0, rBox);

          meshVertices.push(...p00, ...p10, ...p11);
          meshVertices.push(...p00, ...p11, ...p01);
        }
      }
      const fillGeo = new THREE.BufferGeometry();
      fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(meshVertices, 3));
      fillGeo.computeVertexNormals();
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const fillMesh = new THREE.Mesh(fillGeo, fillMat);
      group.add(fillMesh);
    };

    const handlePointerDown = (e: MouseEvent) => {
      downPos = { x: e.clientX, y: e.clientY };

      if (modeRef.current === 'GIS' && e.button === 0) {
        controls.enabled = false;
        isDraggingAOIRef.current = true;
        aoiStartScreenPosRef.current = { x: e.clientX, y: e.clientY };

        if (dragBoxRef.current) {
          const rect = renderer.domElement.getBoundingClientRect();
          const startX = e.clientX - rect.left;
          const startY = e.clientY - rect.top;
          dragBoxRef.current.style.display = 'block';
          dragBoxRef.current.style.left = `${startX}px`;
          dragBoxRef.current.style.top = `${startY}px`;
          dragBoxRef.current.style.width = '0px';
          dragBoxRef.current.style.height = '0px';
        }
      }
    };

    const handlePointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      // Handle active AOI Drag in GIS mode
      if (isDraggingAOIRef.current && aoiStartScreenPosRef.current) {
        const start = aoiStartScreenPosRef.current;
        const startX = start.x - rect.left;
        const startY = start.y - rect.top;
        const curX = e.clientX - rect.left;
        const curY = e.clientY - rect.top;

        const minX = Math.min(startX, curX);
        const minY = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);

        if (dragBoxRef.current) {
          dragBoxRef.current.style.display = 'block';
          dragBoxRef.current.style.left = `${minX}px`;
          dragBoxRef.current.style.top = `${minY}px`;
          dragBoxRef.current.style.width = `${w}px`;
          dragBoxRef.current.style.height = `${h}px`;
        }
        return;
      }

      // Check EONET sprites hover
      raycaster.setFromCamera(mouse, camera);
      const spriteHits = raycaster.intersectObjects(eonetSpritesRef.current.map((s) => s.sprite));
      if (spriteHits.length > 0) {
        renderer.domElement.style.cursor = 'pointer';
        return;
      }

      // Check basin meshes hover
      const meshes = basinMeshesRef.current.map((b) => b.mesh);
      const intersects = raycaster.intersectObjects(meshes, false);

      if (intersects.length > 0) {
        const found = basinMeshesRef.current.find((b) => b.mesh === intersects[0].object);
        if (found) {
          onHoverBasinRef.current?.(found.feature, e.clientX, e.clientY);
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      onHoverBasinRef.current?.(null);
      renderer.domElement.style.cursor = modeRef.current === 'GIS' ? 'crosshair' : 'grab';
    };

    const handlePointerUp = (e: MouseEvent) => {
      if (isDraggingAOIRef.current && aoiStartScreenPosRef.current) {
        isDraggingAOIRef.current = false;
        controls.enabled = true;

        if (dragBoxRef.current) {
          dragBoxRef.current.style.display = 'none';
        }

        const start = aoiStartScreenPosRef.current;
        aoiStartScreenPosRef.current = null;

        const rect = renderer.domElement.getBoundingClientRect();
        const startX = start.x - rect.left;
        const startY = start.y - rect.top;
        const endX = e.clientX - rect.left;
        const endY = e.clientY - rect.top;

        const minX = Math.min(startX, endX);
        const maxX = Math.max(startX, endX);
        const minY = Math.min(startY, endY);
        const maxY = Math.max(startY, endY);

        const boxWidth = maxX - minX;
        const boxHeight = maxY - minY;

        if (boxWidth > 5 || boxHeight > 5) {
          const allFeatures = (basinsGeoJsonRef.current?.features || []) as BasinFeature[];
          const selected = getBasinsInScreenBox(
            allFeatures,
            { minX, minY, maxX, maxY },
            camera,
            rect.width,
            rect.height
          );

          let minLng = Infinity;
          let maxLng = -Infinity;
          let minLat = Infinity;
          let maxLat = -Infinity;
          let hasBounds = false;

          if (selected.length > 0) {
            for (const b of selected) {
              const rings: number[][][] = [];
              if (b.geometry?.type === 'Polygon') {
                rings.push(b.geometry.coordinates[0]);
              } else if (b.geometry?.type === 'MultiPolygon') {
                for (const poly of b.geometry.coordinates) {
                  if (poly.length > 0) rings.push(poly[0]);
                }
              }
              if (rings.length > 0) {
                for (const ring of rings) {
                  for (const [lng, lat] of ring) {
                    if (lng < minLng) minLng = lng;
                    if (lng > maxLng) maxLng = lng;
                    if (lat < minLat) minLat = lat;
                    if (lat > maxLat) maxLat = lat;
                  }
                }
              } else {
                const [cLng, cLat] = b.properties.centroid;
                if (cLng < minLng) minLng = cLng;
                if (cLng > maxLng) maxLng = cLng;
                if (cLat < minLat) minLat = cLat;
                if (cLat > maxLat) maxLat = cLat;
              }
            }
            hasBounds = true;
          } else if (earthMeshRef.current) {
            // Raycast bounds if no basins matched
            const p1 = new THREE.Vector2((startX / rect.width) * 2 - 1, -(startY / rect.height) * 2 + 1);
            const p2 = new THREE.Vector2((endX / rect.width) * 2 - 1, -(endY / rect.height) * 2 + 1);
            raycaster.setFromCamera(p1, camera);
            const hit1 = raycaster.intersectObject(earthMeshRef.current, false);
            raycaster.setFromCamera(p2, camera);
            const hit2 = raycaster.intersectObject(earthMeshRef.current, false);

            if (hit1.length > 0 && hit2.length > 0) {
              const geo1 = vector3ToLatLon(hit1[0].point.x, hit1[0].point.y, hit1[0].point.z);
              const geo2 = vector3ToLatLon(hit2[0].point.x, hit2[0].point.y, hit2[0].point.z);
              minLng = Math.min(geo1.lon, geo2.lon);
              maxLng = Math.max(geo1.lon, geo2.lon);
              minLat = Math.min(geo1.lat, geo2.lat);
              maxLat = Math.max(geo1.lat, geo2.lat);
              hasBounds = true;
            }
          }

          if (hasBounds) {
            // Calculate spherical surface area in km² (R = 6371 km)
            const DEG2RAD = Math.PI / 180;
            const R = 6371.0;
            const dLonRad = Math.abs((maxLng - minLng) * DEG2RAD);
            const lat1Rad = minLat * DEG2RAD;
            const lat2Rad = maxLat * DEG2RAD;
            const areaKm2 = Math.round(R * R * dLonRad * Math.abs(Math.sin(lat2Rad) - Math.sin(lat1Rad)));

            updateAOILassoGeometry(minLng, minLat, maxLng, maxLat);

            onSelectAOIRef.current?.({
              bounds: [minLng, minLat, maxLng, maxLat],
              areaKm2,
              intersectingBasins: selected,
            });
          }
        }
        return;
      }
    };

    const handleClick = (e: MouseEvent) => {
      const dx = e.clientX - downPos.x;
      const dy = e.clientY - downPos.y;
      if (Math.hypot(dx, dy) > 6) return;

      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // Check EONET pins first
      const spriteHits = raycaster.intersectObjects(eonetSpritesRef.current.map((s) => s.sprite));
      if (spriteHits.length > 0) {
        const found = eonetSpritesRef.current.find((s) => s.sprite === spriteHits[0].object);
        if (found) {
          onSelectEONETEventRef.current?.(found.event);
          return;
        }
      }

      // Check basin meshes
      const meshes = basinMeshesRef.current.map((b) => b.mesh);
      const basinIntersects = raycaster.intersectObjects(meshes, false);

      if (basinIntersects.length > 0) {
        const found = basinMeshesRef.current.find((b) => b.mesh === basinIntersects[0].object);
        if (found) {
          if (e.shiftKey) {
            const allFeatures = (basinsGeoJsonRef.current?.features || []) as BasinFeature[];
            const currentSelected =
              allFeatures.find((b) => b.properties.basin_id === selectedBasinIdRef.current) ||
              compareDataRef.current?.regionA;
            if (currentSelected && currentSelected.properties.basin_id !== found.feature.properties.basin_id) {
              onCompareCustomBasinsRef.current?.(currentSelected, found.feature);
              return;
            }
          }
          onSelectBasinRef.current?.(found.feature);
          return;
        }
      }

      // No basin hit -> raycast onto the Earth sphere for probe point
      if (earthMeshRef.current && modeRef.current !== 'GIS') {
        const earthIntersects = raycaster.intersectObject(earthMeshRef.current, false);
        if (earthIntersects.length > 0) {
          const pt = earthIntersects[0].point;
          const { lat, lon } = vector3ToLatLon(pt.x, pt.y, pt.z);

          let windSpeed = 0;
          let windAzimuth = 0;
          const field = windFieldRef.current;
          if (field) {
            const uv = [0, 0];
            sampleWind(field, lat, lon, uv);
            const u = uv[0];
            const v = uv[1];
            windSpeed = Math.sqrt(u * u + v * v);
            windAzimuth = (Math.atan2(u, v) * (180 / Math.PI) + 360) % 360;
          }

          const allFeatures = (basinsGeoJsonRef.current?.features || []) as BasinFeature[];
          const nearest = findNearestBasin(lat, lon, allFeatures);

          onProbePointRef.current?.({
            lat: +lat.toFixed(4),
            lon: +lon.toFixed(4),
            windSpeed: +windSpeed.toFixed(2),
            windAzimuth: +windAzimuth.toFixed(1),
            nearestBasin: nearest ? nearest.basin : null,
            distanceKm: nearest ? nearest.distanceKm : 0,
            cardinal: nearest ? nearest.cardinal : '',
          });

          onSelectBasinRef.current?.(null);
          return;
        }
      }

      onSelectBasinRef.current?.(null);
    };

    renderer.domElement.addEventListener('mousedown', handlePointerDown);
    renderer.domElement.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    renderer.domElement.addEventListener('click', handleClick);

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    // Follow the container (not just the window) so the canvas tracks layout changes.
    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      window.removeEventListener('mouseup', handlePointerUp);
      renderer.domElement.removeEventListener('mousedown', handlePointerDown);
      renderer.domElement.removeEventListener('mousemove', handlePointerMove);
      renderer.domElement.removeEventListener('click', handleClick);
      controls.dispose();
      renderer.dispose();
      if (container && renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [baseTextures]);

  // NASA GIBS WMS overlay + Baseline Epoch texture for GPU Delta Anomaly Mode
  useEffect(() => {
    const earthUniforms = earthUniformsRef.current;
    if (!earthUniforms) return;

    if (typeof window !== 'undefined') {
      (window as any).__STRATUM4D_OVERLAY_LOADED__ = activeLayer === 'base' ? 'base' : false;
      (window as any).__STRATUM4D_BASELINE_LOADED__ = activeLayer === 'base' ? 'base' : false;
    }

    if (activeLayer === 'base') {
      earthUniforms.overlayStrength.value = 0.0;
      if (emptyTextureRef.current) {
        earthUniforms.overlayMap.value = emptyTextureRef.current;
        earthUniforms.baselineMap.value = emptyTextureRef.current;
      }
    } else {
      const airsDate =
        simulatedYear >= 2026
          ? '2026-10-14'
          : `${Math.max(2003, simulatedYear)}-10-14`;
      const currentUrl =
        activeLayer === 'AIRS_CO_500HPA'
          ? getGibsAirsCoWmsUrl(airsDate)
          : buildWmsSnapshotUrl(activeLayer, `${Math.min(2025, Math.max(2002, simulatedYear))}-07-15`);
      const baselineUrl =
        activeLayer === 'AIRS_CO_500HPA'
          ? getGibsAirsCoWmsUrl('2003-10-14')
          : buildWmsSnapshotUrl(activeLayer, `2003-07-15`);
      const loader = new THREE.TextureLoader();

      if (currentUrl) {
        loader.load(
          currentUrl,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            earthUniforms.overlayMap.value = tex;
            earthUniforms.overlayStrength.value = 1.0;
            if (typeof window !== 'undefined') {
              (window as any).__STRATUM4D_OVERLAY_LOADED__ = activeLayer;
            }
          },
          undefined,
          (err) => {
            console.warn(`[GIBS] Satellite tile failed to load: ${currentUrl}`, err);
            earthUniforms.overlayStrength.value = 0.0;
            if (typeof window !== 'undefined') {
              (window as any).__STRATUM4D_OVERLAY_LOADED__ = 'error';
            }
          }
        );
      }
      if (baselineUrl) {
        loader.load(
          baselineUrl,
          (baseTex) => {
            baseTex.colorSpace = THREE.SRGBColorSpace;
            baseTex.wrapS = THREE.ClampToEdgeWrapping;
            baseTex.wrapT = THREE.ClampToEdgeWrapping;
            earthUniforms.baselineMap.value = baseTex;
            if (typeof window !== 'undefined') {
              (window as any).__STRATUM4D_BASELINE_LOADED__ = activeLayer;
            }
          },
          undefined,
          (err) => {
            console.warn(`[GIBS] Baseline tile failed to load: ${baselineUrl}`, err);
            if (typeof window !== 'undefined') {
              (window as any).__STRATUM4D_BASELINE_LOADED__ = 'error';
            }
          }
        );
      }
    }
  }, [activeLayer, simulatedYear]);

  // Synchronize Epoch Delta Mode with Earth shader uniform
  useEffect(() => {
    if (earthUniformsRef.current?.uEpochDeltaMode) {
      earthUniformsRef.current.uEpochDeltaMode.value = epochDeltaMode ? 1.0 : 0.0;
    }
  }, [epochDeltaMode]);

  // Wind visibility
  useEffect(() => {
    if (windLinesRef.current) {
      windLinesRef.current.visible = showWind;
    }
  }, [showWind]);

  // NASA EONET Hotspot Pins: 3D Billboard Sprites
  useEffect(() => {
    const group = eonetPinsGroupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      const c = group.children[0] as any;
      group.remove(c);
      c.geometry?.dispose();
      c.material?.dispose();
    }
    eonetSpritesRef.current = [];

    // Billboard sprite canvas generators
    const createBillboardTexture = (category: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;

      // Glowing circular badge
      const cx = 32;
      const cy = 32;
      const r = 24;

      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
      let strokeColor = '#f59e0b';
      let icon = '⚠️';

      if (category === 'wildfires' || category === 'Wildfires') {
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.4, 'rgba(239, 68, 68, 0.95)');
        grad.addColorStop(1, 'rgba(185, 28, 28, 0.2)');
        strokeColor = '#ef4444';
        icon = '🔥';
      } else if (category === 'dustHaze' || category === 'Dust and Haze') {
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.4, 'rgba(217, 119, 6, 0.95)');
        grad.addColorStop(1, 'rgba(120, 53, 15, 0.2)');
        strokeColor = '#f59e0b';
        icon = '🌫️';
      } else {
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.4, 'rgba(245, 158, 11, 0.95)');
        grad.addColorStop(1, 'rgba(180, 83, 9, 0.2)');
        strokeColor = '#f59e0b';
        icon = '⚠️';
      }

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Outer ring
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = strokeColor;
      ctx.stroke();

      // Emoji/Symbol icon
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, cx, cy + 1);

      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };

    const textureMap = new Map<string, THREE.CanvasTexture>();
    const getTextureForCategory = (cat: string) => {
      if (!textureMap.has(cat)) {
        textureMap.set(cat, createBillboardTexture(cat));
      }
      return textureMap.get(cat)!;
    };

    fetchActiveEONETEvents().then((events) => {
      for (const ev of events) {
        const catKey = ev.categoryId || ev.category;
        const tex = getTextureForCategory(catKey);
        const mat = new THREE.SpriteMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
        });
        const sprite = new THREE.Sprite(mat);
        const pos = latLonToVector3(ev.coordinates[1], ev.coordinates[0], 1.025);
        sprite.position.set(...pos);
        sprite.scale.set(0.045, 0.045, 0.045);
        group.add(sprite);

        eonetSpritesRef.current.push({ sprite, event: ev });
      }
    });
  }, []);

  // Clipped Sub-Basin Anomaly Masks
  useEffect(() => {
    const group = subBasinMaskGroupRef.current;
    if (!group || !basinsGeoJson) return;

    while (group.children.length > 0) {
      const c = group.children[0] as any;
      group.remove(c);
      c.geometry?.dispose();
      c.material?.dispose();
    }

    if (mode !== 'REMOTE_SENSING' || !selectedBasinId) return;

    const features = basinsGeoJson.features as BasinFeature[];
    const target = features.find((b) => b.properties.basin_id === selectedBasinId);
    if (!target) return;

    const rings: number[][][] = [];
    if (target.geometry.type === 'Polygon') {
      rings.push(target.geometry.coordinates[0]);
    } else if (target.geometry.type === 'MultiPolygon') {
      for (const poly of target.geometry.coordinates) {
        if (poly.length > 0) rings.push(poly[0]);
      }
    }

    const rMask = 1.0035;
    const gridStep = 0.5; // 0.5 degree grid resolution
    const maskVertices: number[] = [];

    for (const ring of rings) {
      let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
      for (const pt of ring) {
        if (pt[0] < minLon) minLon = pt[0];
        if (pt[0] > maxLon) maxLon = pt[0];
        if (pt[1] < minLat) minLat = pt[1];
        if (pt[1] > maxLat) maxLat = pt[1];
      }

      const absSlope = Math.abs(target.properties.theil_sen_slope);

      for (let lat = minLat; lat <= maxLat; lat += gridStep) {
        for (let lon = minLon; lon <= maxLon; lon += gridStep) {
          const center: [number, number] = [lon + gridStep / 2, lat + gridStep / 2];
          if (isPointInPoly(center, ring) && absSlope > 0.8) {
            const p0 = latLonToVector3(lat, lon, rMask);
            const p1 = latLonToVector3(lat, lon + gridStep * 0.85, rMask);
            const p2 = latLonToVector3(lat + gridStep * 0.85, lon + gridStep * 0.85, rMask);
            const p3 = latLonToVector3(lat + gridStep * 0.85, lon, rMask);

            maskVertices.push(...p0, ...p1, ...p2);
            maskVertices.push(...p0, ...p2, ...p3);
          }
        }
      }
    }

    if (maskVertices.length > 0) {
      const maskGeo = new THREE.BufferGeometry();
      maskGeo.setAttribute('position', new THREE.Float32BufferAttribute(maskVertices, 3));
      maskGeo.computeVertexNormals();

      const isDepleting = (target.properties?.theil_sen_slope ?? 0) < 0;
      const maskMat = new THREE.MeshBasicMaterial({
        color: isDepleting ? 0xff4d30 : 0x2563eb,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const maskMesh = new THREE.Mesh(maskGeo, maskMat);
      group.add(maskMesh);
    }
  }, [mode, selectedBasinId, basinsGeoJson]);

  // Synchronize AOI selection visual box when aoiSelection changes from parent
  useEffect(() => {
    const group = aoiLassoGroupRef.current;
    if (!group) return;

    if (!aoiSelection) {
      while (group.children.length > 0) {
        const c = group.children[0] as any;
        group.remove(c);
        c.geometry?.dispose();
        c.material?.dispose();
      }
    }
  }, [aoiSelection]);

  // 1A. Build Draped & Extruded Basin Geometries ONLY when GeoJSON or 3D Relief mode changes
  useEffect(() => {
    const scene = sceneRef.current;
    const stippleGroup = stipplingGroupRef.current;
    if (!scene || !basinsGeoJson) return;

    for (const b of basinMeshesRef.current) {
      scene.remove(b.mesh);
      scene.remove(b.line);
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
      b.line.geometry.dispose();
      (b.line.material as THREE.Material).dispose();
    }
    basinMeshesRef.current = [];

    if (stippleGroup) {
      while (stippleGroup.children.length > 0) {
        const child = stippleGroup.children[0] as any;
        stippleGroup.remove(child);
        child.geometry?.dispose();
        child.material?.dispose();
      }
    }

    const features = basinsGeoJson.features as BasinFeature[];

    for (const basin of features) {
      const absSlope = Math.abs(basin.properties.theil_sen_slope ?? 0);
      const baseReliefOffset = extrudeRelief ? Math.min(0.08, absSlope * 0.015) : 0;
      const rPoly = 1.002 + baseReliefOffset;
      const rLine = 1.0025 + baseReliefOffset;

      const aPValue = basin.properties.p_value_fdr ?? 0.05;
      const aSlope = basin.properties.theil_sen_slope ?? 0.0;

      const rings: number[][][] = [];
      if (basin.geometry.type === 'Polygon') {
        rings.push(basin.geometry.coordinates[0]);
      } else if (basin.geometry.type === 'MultiPolygon') {
        for (const poly of basin.geometry.coordinates) {
          if (poly.length > 0) rings.push(poly[0]);
        }
      }

      for (const ring of rings) {
        if (!ring || ring.length < 3) continue;

        const pts2d = ring.slice(0, ring.length - 1).map((pt) => new THREE.Vector2(pt[0], pt[1]));
        const faces = THREE.ShapeUtils.triangulateShape(pts2d, []);

        const positions: number[] = [];
        const normals: number[] = [];
        const pValues: number[] = [];
        const slopes: number[] = [];

        for (const [i0, i1, i2] of faces) {
          const v0 = latLonToUnitVector3(pts2d[i0].y, pts2d[i0].x);
          const v1 = latLonToUnitVector3(pts2d[i1].y, pts2d[i1].x);
          const v2 = latLonToUnitVector3(pts2d[i2].y, pts2d[i2].x);

          const subVerts = subdivideSphericalTriangle(v0, v1, v2, 0.043633, 4);
          for (const v of subVerts) {
            positions.push(v[0] * rPoly, v[1] * rPoly, v[2] * rPoly);
            normals.push(v[0], v[1], v[2]);
            pValues.push(aPValue);
            slopes.push(aSlope);
          }
        }

        if (extrudeRelief && baseReliefOffset > 0.0005) {
          const rBase = 1.0015;
          for (let i = 0; i < ring.length - 1; i++) {
            const ptA = ring[i];
            const ptB = ring[i + 1];
            const uA = latLonToUnitVector3(ptA[1], ptA[0]);
            const uB = latLonToUnitVector3(ptB[1], ptB[0]);

            const dot = Math.max(-1, Math.min(1, uA[0] * uB[0] + uA[1] * uB[1] + uA[2] * uB[2]));
            const angDist = Math.acos(dot);
            const numSteps = Math.max(1, Math.ceil(angDist / 0.043633));

            for (let s = 0; s < numSteps; s++) {
              const tA = s / numSteps;
              const tB = (s + 1) / numSteps;
              const subA = slerpUnitVectors(uA, uB, tA);
              const subB = slerpUnitVectors(uA, uB, tB);

              const b0 = [subA[0] * rBase, subA[1] * rBase, subA[2] * rBase];
              const b1 = [subB[0] * rBase, subB[1] * rBase, subB[2] * rBase];
              const t0 = [subA[0] * rPoly, subA[1] * rPoly, subA[2] * rPoly];
              const t1 = [subB[0] * rPoly, subB[1] * rPoly, subB[2] * rPoly];

              positions.push(b0[0], b0[1], b0[2], t0[0], t0[1], t0[2], t1[0], t1[1], t1[2]);
              normals.push(subA[0], subA[1], subA[2], subA[0], subA[1], subA[2], subB[0], subB[1], subB[2]);
              pValues.push(aPValue, aPValue, aPValue);
              slopes.push(aSlope, aSlope, aSlope);

              positions.push(b0[0], b0[1], b0[2], t1[0], t1[1], t1[2], b1[0], b1[1], b1[2]);
              normals.push(subA[0], subA[1], subA[2], subB[0], subB[1], subB[2], subB[0], subB[1], subB[2]);
              pValues.push(aPValue, aPValue, aPValue);
              slopes.push(aSlope, aSlope, aSlope);
            }
          }
        }

        const meshGeo = new THREE.BufferGeometry();
        meshGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        meshGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        meshGeo.setAttribute('aPValue', new THREE.Float32BufferAttribute(pValues, 1));
        meshGeo.setAttribute('aSlope', new THREE.Float32BufferAttribute(slopes, 1));

        const defaultColor = new THREE.Color('#94A3B8');
        const meshMat = new THREE.ShaderMaterial({
          vertexShader: BASIN_VERTEX,
          fragmentShader: BASIN_FRAGMENT,
          uniforms: {
            uBaseColor: { value: defaultColor.clone() },
            uSelected: { value: 0.0 },
            uIsSelected: { value: 0.0 },
            uOpacity: { value: 0.65 },
            uPValue: { value: aPValue },
            uSlope: { value: aSlope },
            uIsSignificant: { value: 1.0 },
            uSignificanceLock: { value: 0.0 },
          },
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
        });

        const mesh = new THREE.Mesh(meshGeo, meshMat);
        scene.add(mesh);

        const linePoints = ring.map((pt) => {
          const p = latLonToVector3(pt[1], pt[0], rLine);
          return new THREE.Vector3(p[0], p[1], p[2]);
        });
        const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.75,
        });
        const line = new THREE.LineLoop(lineGeo, lineMat);
        scene.add(line);

        basinMeshesRef.current.push({
          mesh,
          line,
          feature: basin,
          baseColor: defaultColor,
          baseOpacity: 0.65,
          baseLineColor: 0xffffff,
          baseLineOpacity: 0.75,
        });
      }
    }
  }, [basinsGeoJson, extrudeRelief]);

  // 1B. Lightweight Uniform & Radial Offset Updater (0 Geometry Rebuilds on Scrub/Select)
  useEffect(() => {
    if (basinMeshesRef.current.length === 0) return;

    const yearFactor = Math.max(0.3, Math.min(1.8, (simulatedYear - 2002) / 22.0));
    const explodeOffset = (explodeAmount || 0) * 0.06;

    for (const record of basinMeshesRef.current) {
      const basin = record.feature;
      const isSelected = basin.properties.basin_id === selectedBasinId;
      const { color: basinColor, opacity: basinOpacity, isInconclusive } = getBasinMultiVariableColor(
        basin,
        isSelected,
        confidenceFilter,
        activeVariable,
        simulatedYear,
        selectedEarthClass
      );

      const isSig = basin.properties.significant && basin.properties.p_value_fdr < 0.05 && !isInconclusive;
      const lineColor = isSelected ? 0xffffff : isSig ? 0xffffff : 0x475569;
      const lineOpacity = isSelected ? 1.0 : isSig ? 0.75 : significanceLock ? 0.12 : 0.20;

      record.baseColor.copy(basinColor);
      record.baseOpacity = basinOpacity;
      record.baseLineColor = lineColor;
      record.baseLineOpacity = lineOpacity;

      const meshMat = record.mesh.material as THREE.ShaderMaterial;
      if (meshMat?.uniforms) {
        meshMat.uniforms.uBaseColor.value.copy(basinColor);
        meshMat.uniforms.uOpacity.value = basinOpacity;
        meshMat.uniforms.uSelected.value = isSelected ? 1.0 : 0.0;
        meshMat.uniforms.uIsSelected.value = isSelected ? 1.0 : 0.0;
        meshMat.uniforms.uIsSignificant.value = isSig ? 1.0 : 0.0;
        meshMat.uniforms.uSignificanceLock.value = significanceLock ? 1.0 : 0.0;
      }

      const lineMat = record.line.material as THREE.LineBasicMaterial;
      if (lineMat) {
        lineMat.color.setHex(lineColor);
        lineMat.opacity = lineOpacity;
      }

      const absSlope = Math.abs(basin.properties.theil_sen_slope ?? 0);
      const dynamicReliefDelta = extrudeRelief
        ? Math.min(0.08, absSlope * 0.015 * yearFactor) - Math.min(0.08, absSlope * 0.015)
        : 0;
      const radialScale = 1.0 + explodeOffset + Math.max(-0.04, dynamicReliefDelta);
      record.mesh.scale.setScalar(radialScale);
      record.line.scale.setScalar(radialScale);
    }
  }, [
    basinsGeoJson,
    selectedBasinId,
    confidenceFilter,
    extrudeRelief,
    activeVariable,
    selectedEarthClass,
    significanceLock,
    simulatedYear,
    explodeAmount,
  ]);

  // Animated Great-Circle Dipoles
  useEffect(() => {
    const group = dipolesGroupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      const child = group.children[0] as any;
      group.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }
    dipoleMaterialsRef.current = [];

    const hasCompare = Boolean(compareData?.regionA && compareData?.regionB);
    if (!showDipoles && !hasCompare) return;

    const pairs: Array<{ basinA: BasinFeature; basinB: BasinFeature }> = [];

    if (hasCompare && compareData) {
      pairs.push({ basinA: compareData.regionA, basinB: compareData.regionB });
    }
    if (showDipoles && basinsGeoJson) {
      const features = basinsGeoJson.features as BasinFeature[];
      const basinMap = new Map<string, BasinFeature>();
      for (const f of features) basinMap.set(f.properties.basin_id, f);

      const seenPairs = new Set<string>();
      if (hasCompare && compareData) {
        seenPairs.add(
          [compareData.regionA.properties.basin_id, compareData.regionB.properties.basin_id].sort().join('::')
        );
      }
      for (const f of features) {
        const partnerId = f.properties.dipole_partner_id;
        if (partnerId && basinMap.has(partnerId)) {
          const key = [f.properties.basin_id, partnerId].sort().join('::');
          if (!seenPairs.has(key)) {
            seenPairs.add(key);
            pairs.push({ basinA: f, basinB: basinMap.get(partnerId)! });
          }
        }
      }
    }

    for (const { basinA, basinB } of pairs) {
      const [lonA, latA] = basinA.properties.centroid;
      const [lonB, latB] = basinB.properties.centroid;

      const vecA = latLonToUnitVector3(latA, lonA);
      const vecB = latLonToUnitVector3(latB, lonB);

      const slopeA = basinA.properties.theil_sen_slope ?? 0.0;
      const slopeB = basinB.properties.theil_sen_slope ?? 0.0;

      // Pulse direction: from positive slope (accumulation) to negative slope (depletion)
      const startVec = slopeA >= slopeB ? vecA : vecB;
      const endVec = slopeA >= slopeB ? vecB : vecA;

      const dot = Math.max(-1, Math.min(1, startVec[0] * endVec[0] + startVec[1] * endVec[1] + startVec[2] * endVec[2]));
      const angularDistance = Math.acos(dot);
      const hMax = Math.min(0.18, 0.05 + angularDistance * 0.08);

      const NUM_POINTS = 64;
      const arcPositions = new Float32Array(NUM_POINTS * 3);
      const arcT = new Float32Array(NUM_POINTS);

      for (let i = 0; i < NUM_POINTS; i++) {
        const t = i / (NUM_POINTS - 1);
        const ht = 4.0 * hMax * t * (1.0 - t);
        const explodeArc = (explodeAmount || 0) * 0.10;
        const r = 1.002 + ht + explodeArc;
        const u = slerpUnitVectors(startVec, endVec, t);

        const off = i * 3;
        arcPositions[off] = u[0] * r;
        arcPositions[off + 1] = u[1] * r;
        arcPositions[off + 2] = u[2] * r;
        arcT[i] = t;
      }

      const arcGeo = new THREE.BufferGeometry();
      arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
      arcGeo.setAttribute('aArcT', new THREE.BufferAttribute(arcT, 1));

      // Calculate Pearson correlation r between detrended anomaly series of basinA and basinB
      const tsA = basinA.properties.time_series;
      const tsB = basinB.properties.time_series;
      const seriesA = (tsA?.deseasonalized || tsA?.swot_wse || []).map(
        (v, idx) => v - (tsA?.trend_line?.[idx] ?? tsA?.stl_trend?.[idx] ?? 0)
      );
      const seriesB = (tsB?.deseasonalized || tsB?.swot_wse || []).map(
        (v, idx) => v - (tsB?.trend_line?.[idx] ?? tsB?.stl_trend?.[idx] ?? 0)
      );
      let r = 0;
      if (
        (basinA.properties.dipole_partner_id === basinB.properties.basin_id ||
          basinB.properties.dipole_partner_id === basinA.properties.basin_id) &&
        typeof basinA.properties.dipole_r === 'number'
      ) {
        r = basinA.properties.dipole_r;
      } else if (seriesA.length >= 3 && seriesB.length >= 3) {
        r = calculatePearsonR(seriesA, seriesB);
      } else {
        r = (slopeA > 0 && slopeB < 0) || (slopeA < 0 && slopeB > 0) ? -0.65 : 0.0;
      }

      const isCuratedPair = Boolean(
        basinA.properties.dipole_partner_id &&
        (basinA.properties.dipole_partner_id === basinB.properties.basin_id ||
          basinB.properties.dipole_partner_id === basinA.properties.basin_id)
      );

      // Invariant-based dipole identification: curated system, opposing secular slopes, strong divergence (>= 0.10 cm/yr), or empirical anti-correlation
      const isDipole =
        isCuratedPair ||
        (slopeA * slopeB < 0) ||
        (Math.abs(slopeA - slopeB) >= 0.10) ||
        (r < -0.20);
      const colorPos = isDipole ? new THREE.Color('#ec4899') : new THREE.Color('#64748b');
      const colorNeg = isDipole ? new THREE.Color('#06b6d4') : new THREE.Color('#94a3b8');

      const arcMat = new THREE.ShaderMaterial({
        vertexShader: DIPOLE_ARC_VERTEX,
        fragmentShader: DIPOLE_ARC_FRAGMENT,
        uniforms: {
          uTime: { value: 0.0 },
          uColorPos: { value: colorPos },
          uColorNeg: { value: colorNeg },
          uIsDashed: { value: isDipole ? 0.0 : 1.0 },
          uGlowIntensity: { value: isDipole ? 2.4 : 0.3 },
        },
        transparent: true,
        depthWrite: false,
      });

      const arcLine = new THREE.Line(arcGeo, arcMat);
      group.add(arcLine);
      dipoleMaterialsRef.current.push(arcMat);
    }
  }, [basinsGeoJson, showDipoles, compareData, explodeAmount]);

  // 3D Locator Pin / Beacon for Virtual Station Probe
  useEffect(() => {
    const group = beaconGroupRef.current;
    if (!group) return;

    while (group.children.length > 0) {
      const child = group.children[0] as any;
      group.remove(child);
      child.geometry?.dispose();
      child.material?.dispose();
    }

    if (!activeProbeCoordinate) return;

    const [lat, lon] = activeProbeCoordinate;
    const pos = latLonToVector3(lat, lon, 1.003);
    const posVector = new THREE.Vector3(...pos);
    const normal = posVector.clone().normalize();

    // Beacon Pin base ring
    const ringGeo = new THREE.RingGeometry(0.015, 0.022, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.copy(posVector);
    ringMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    group.add(ringMesh);

    // Beacon Pin cylinder / needle
    const pinHeight = 0.06;
    const pinGeo = new THREE.CylinderGeometry(0.002, 0.005, pinHeight, 16);
    const pinMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.95,
    });
    const pinMesh = new THREE.Mesh(pinGeo, pinMat);
    const pinCenter = posVector.clone().add(normal.clone().multiplyScalar(pinHeight / 2));
    pinMesh.position.copy(pinCenter);
    pinMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    group.add(pinMesh);

    // Glowing head sphere
    const headGeo = new THREE.SphereGeometry(0.009, 16, 16);
    const headMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.copy(posVector.clone().add(normal.clone().multiplyScalar(pinHeight)));
    group.add(headMesh);
  }, [activeProbeCoordinate]);

  return (
    <div
      role="img"
      aria-label="Interactive 3D globe of water-storage trend by region. Drag to rotate, scroll to zoom, click a region to select it."
      className="relative w-full h-full bg-[#07080A] overflow-hidden select-none"
    >
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
      <div
        ref={dragBoxRef}
        className="absolute border-2 border-blue-400 bg-blue-500/20 pointer-events-none hidden z-10 rounded-sm shadow-[0_0_8px_rgba(59,130,246,0.5)]"
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, transparent 45%, rgba(7, 8, 10, 0.85) 90%)',
        }}
      />
    </div>
  );
});

export default Globe;
