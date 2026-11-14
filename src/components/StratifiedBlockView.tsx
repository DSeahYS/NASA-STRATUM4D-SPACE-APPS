import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  X,
  Play,
  RotateCcw,
  Layers,
  Droplets,
  Building,
  Sprout,
  Activity,
  ArrowUp,
  ArrowDown,
  Pause,
  AlertTriangle,
} from 'lucide-react';
import type { BasinFeature } from './Globe';
import { useModalDialog } from './shell/useModalDialog';

interface StratifiedBlockViewProps {
  basin: BasinFeature;
  simulatedYear: number;
  onYearChange: (year: number) => void;
  onClose: () => void;
  isStudentMode?: boolean;
}

export default function StratifiedBlockView({
  basin,
  simulatedYear,
  onYearChange,
  onClose,
  isStudentMode = false,
}: StratifiedBlockViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [explosionAmount, setExplosionAmount] = useState(0.35); // 0.0 to 1.0
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeAsset, setActiveAsset] = useState<'dam' | 'crop' | 'aqueduct' | null>(null);
  const [stratumMode, setStratumMode] = useState<'standard' | 'paradox'>(() =>
    basin.properties.basin_id === 'BASIN_CALIFORNIA_CV' || basin.properties.basin_id === 'BASIN_INDUS'
      ? 'paradox'
      : 'standard'
  );

  const dialog = useModalDialog<HTMLDivElement>(onClose);

  // Basin statistics
  const slope = stratumMode === 'paradox' ? -1.52 : basin.properties.theil_sen_slope;
  const isDepleting = slope < -0.2 || stratumMode === 'paradox';
  const isSurplus = slope > 0.2 && stratumMode === 'standard';

  // Auto-play simulation timer
  // The parent re-renders every second and passes a fresh callback each time, so the timer reads the
  // latest year and callback from refs and depends only on isPlaying.
  const yearRef = useRef(simulatedYear);
  const onYearChangeRef = useRef(onYearChange);
  useEffect(() => {
    yearRef.current = simulatedYear;
    onYearChangeRef.current = onYearChange;
  }, [simulatedYear, onYearChange]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      const y = yearRef.current;
      onYearChangeRef.current(y >= 2035 ? 2002 : y + 1);
    }, 1200);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Respect prefers-reduced-motion: freeze the WebGL animation when set.
  const reducedMotionRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotionRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Compute dynamic physical consequence states based on year (2002 -> 2035)
  // Baseline is 2002. Total years: 33.
  const elapsedYears = simulatedYear - 2002;
  const cumulativeAnomalyCm = slope * elapsedYears;

  // Data-driven monthly time-series extraction for simulatedYear
  const ts = basin.properties.time_series;
  const {
    currentDeltaTws,
    currentVpd,
    currentNdvi,
    currentSubsidence,
    atmoThickness,
    vadoseThickness,
    aquiferThickness,
    baselineWaterTableY,
    currentWaterTableY,
  } = useMemo(() => {
    const timestamps = ts?.timestamps || [];
    let deltaTws = cumulativeAnomalyCm;
    let vpd = 1.2;
    let ndvi = 0.5;
    let subsidence = Math.abs(slope) * elapsedYears * 12;

    if (stratumMode === 'paradox') {
      deltaTws = -1.52 * elapsedYears;
      ndvi = Math.min(0.88, 0.52 + elapsedYears * 0.012); // +18.4% greening paradox
      vpd = 1.45;
      subsidence = 18.5 * elapsedYears;
    } else if (timestamps.length > 0) {
      const yearPrefix = String(Math.min(2024, simulatedYear));
      let idx = timestamps.findIndex((t) => t.startsWith(yearPrefix));
      if (idx < 0) idx = timestamps.length - 1;

      if (simulatedYear <= 2024) {
        deltaTws = ts?.swot_wse?.[idx] ?? cumulativeAnomalyCm;
        vpd = ts?.atmospheric_vpd?.[idx] ?? 1.2;
        ndvi = ts?.modis_ndvi?.[idx] ?? 0.5;
        subsidence = ts?.insar_subsidence?.[idx] ?? subsidence;
      } else {
        const lastIdx = timestamps.length - 1;
        const yearsForward = simulatedYear - 2024;
        const baseTws = ts?.swot_wse?.[lastIdx] ?? cumulativeAnomalyCm;
        deltaTws = baseTws + slope * yearsForward;
        vpd = (ts?.atmospheric_vpd?.[lastIdx] ?? 1.2) * (1 + yearsForward * 0.015);
        ndvi = Math.max(0.05, Math.min(0.95, (ts?.modis_ndvi?.[lastIdx] ?? 0.5) + (slope < 0 ? -yearsForward * 0.02 : yearsForward * 0.01)));
        subsidence = (ts?.insar_subsidence?.[lastIdx] ?? 0) + (isDepleting ? yearsForward * 14 : 0);
      }
    }

    // Dynamic layer thickness calculations
    const atmoThick = Math.max(16, Math.min(36, 20 + vpd * 8));
    const vadoseThick = Math.max(8, Math.min(30, 14 - deltaTws * 0.35));
    const aquiferThick = Math.max(12, Math.min(42, 26 + deltaTws * 0.35));
    const baseWTY = -12;
    const curWTY = baseWTY + deltaTws * 0.45;

    return {
      currentDeltaTws: deltaTws,
      currentVpd: vpd,
      currentNdvi: ndvi,
      currentSubsidence: subsidence,
      atmoThickness: atmoThick,
      vadoseThickness: vadoseThick,
      aquiferThickness: aquiferThick,
      baselineWaterTableY: baseWTY,
      currentWaterTableY: curWTY,
    };
  }, [ts, simulatedYear, cumulativeAnomalyCm, slope, elapsedYears, isDepleting, stratumMode]);

  // Dam water level: drops if depleting, rises if surplus
  // Normalized 0.0 (empty) to 1.0 (full spillway)
  const damFillRatio = Math.max(
    0.1,
    Math.min(1.0, 0.85 + (cumulativeAnomalyCm / 40.0))
  );

  // Crop health ratio: 1.0 (lush green) down to 0.0 (scorched dead brown)
  const cropHealthRatio =
    stratumMode === 'paradox'
      ? Math.min(1.0, 0.65 + (elapsedYears / 33.0) * 0.35)
      : isDepleting
      ? Math.max(0.05, Math.min(1.0, 1.0 - (elapsedYears / 28.0) * Math.min(1.5, Math.abs(slope))))
      : Math.min(1.0, 0.8 + (elapsedYears / 35.0) * 0.2);

  // InSAR differential compaction shear strain (mm/yr)
  const compactionStrain = Math.max(
    2.5,
    Math.abs(slope) * 18.4 * (1.0 + elapsedYears * 0.04)
  );
  const isPipelineCritical = isDepleting && simulatedYear >= 2026 && compactionStrain > 25.0;

  // Dynamic live parameters ref to prevent WebGL context recreation on slider/timeline changes
  const liveParamsRef = useRef({
    explosionAmount,
    currentDeltaTws,
    currentVpd,
    currentNdvi,
    currentSubsidence,
    damFillRatio,
    cropHealthRatio,
    isPipelineCritical,
    currentWaterTableY,
    vadoseThickness,
    aquiferThickness,
  });

  useEffect(() => {
    liveParamsRef.current = {
      explosionAmount,
      currentDeltaTws,
      currentVpd,
      currentNdvi,
      currentSubsidence,
      damFillRatio,
      cropHealthRatio,
      isPipelineCritical,
      currentWaterTableY,
      vadoseThickness,
      aquiferThickness,
    };
  }, [
    explosionAmount,
    currentDeltaTws,
    currentVpd,
    currentNdvi,
    currentSubsidence,
    damFillRatio,
    cropHealthRatio,
    isPipelineCritical,
    currentWaterTableY,
    vadoseThickness,
    aquiferThickness,
  ]);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08090b); // Pure aerospace carbon dark

    // Camera: Isometric Perspective
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 2000);
    camera.position.set(220, 180, 260);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 2.2);
    sunLight.position.set(150, 250, 120);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.6);
    rimLight.position.set(-150, 50, -150);
    scene.add(rimLight);

    // Group containers for vertical explosion separation
    const atmosphericGroup = new THREE.Group();
    const hydrosphereGroup = new THREE.Group();
    const crustGroup = new THREE.Group();
    const mantleGroup = new THREE.Group();

    scene.add(atmosphericGroup);
    scene.add(hydrosphereGroup);
    scene.add(crustGroup);
    scene.add(mantleGroup);

    // Layer explosion vertical offsets (Data-driven strata thickness and displacement)
    atmosphericGroup.position.y = 52 + 65 * explosionAmount + (currentVpd > 1.4 ? 4 : 0);
    hydrosphereGroup.position.y = 0;
    crustGroup.position.y = -vadoseThickness / 2 - 25 * explosionAmount;
    mantleGroup.position.y = -vadoseThickness - aquiferThickness - 20 - 65 * explosionAmount;

    // -------------------------------------------------------------
    // 1. HYDROSPHERE & TERRAIN LAYER (Top of Ground Block)
    // -------------------------------------------------------------
    const blockSize = 120;
    const terrainHeight = 22;

    // Create realistic contoured terrain using custom plane geometry
    const terrainGeom = new THREE.PlaneGeometry(blockSize, blockSize, 48, 48);
    terrainGeom.rotateX(-Math.PI / 2);
    const posAttr = terrainGeom.attributes.position;

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      // Valley carving: low in center river channel, elevated on ridgelines
      const ridge = Math.sin(x * 0.05) * 8.0 + Math.cos(z * 0.04) * 6.0;
      const valley = Math.exp(-Math.pow(x * 0.04 - z * 0.03, 2)) * -12.0;
      posAttr.setY(i, ridge + valley + terrainHeight);
    }
    terrainGeom.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      color: isDepleting ? 0x854d0e : isSurplus ? 0x166534 : 0x52525b,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true,
    });
    const terrainMesh = new THREE.Mesh(terrainGeom, terrainMat);
    terrainMesh.receiveShadow = true;
    hydrosphereGroup.add(terrainMesh);

    // Meandering river ribbon flowing through the valley
    const riverCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-55, terrainHeight - 5, -45),
      new THREE.Vector3(-25, terrainHeight - 8, -20),
      new THREE.Vector3(0, terrainHeight - 11, 0),
      new THREE.Vector3(25, terrainHeight - 9, 25),
      new THREE.Vector3(55, terrainHeight - 6, 50),
    ]);
    const riverGeom = new THREE.TubeGeometry(riverCurve, 32, 4.5, 8, false);
    const riverMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.1,
      metalness: 0.8,
    });
    const riverMesh = new THREE.Mesh(riverGeom, riverMat);
    hydrosphereGroup.add(riverMesh);

    // -------------------------------------------------------------
    // ASSET 1: LOW-POLY CONCRETE DAM & RESERVOIR
    // -------------------------------------------------------------
    const damGroup = new THREE.Group();
    damGroup.position.set(-15, terrainHeight - 4, -12);

    // Dam wall geometry (arc / trapezoid)
    const damWallGeom = new THREE.BoxGeometry(6, 18, 28);
    const damWallMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // Concrete grey
      roughness: 0.7,
      metalness: 0.2,
    });
    const damWall = new THREE.Mesh(damWallGeom, damWallMat);
    damWall.castShadow = true;
    damWall.receiveShadow = true;
    damGroup.add(damWall);

    // Dam spillway piers
    for (let p = -8; p <= 8; p += 8) {
      const pierGeom = new THREE.BoxGeometry(7, 21, 3);
      const pier = new THREE.Mesh(pierGeom, damWallMat);
      pier.position.set(0, 1.5, p);
      damGroup.add(pier);
    }

    // Upstream reservoir water plane (Scales with damFillRatio)
    const reservoirGeom = new THREE.BoxGeometry(32, 1, 26);
    const reservoirMat = new THREE.MeshStandardMaterial({
      color: 0x0369a1,
      roughness: 0.15,
      metalness: 0.9,
      transparent: true,
      opacity: 0.85,
    });
    const reservoirMesh = new THREE.Mesh(reservoirGeom, reservoirMat);
    // Base height -9, max height +6
    const waterY = -9 + damFillRatio * 15;
    reservoirMesh.position.set(-18, waterY, 0);
    damGroup.add(reservoirMesh);

    hydrosphereGroup.add(damGroup);

    // -------------------------------------------------------------
    // ASSET 2: CENTER-PIVOT CIRCULAR CROP FIELD
    // -------------------------------------------------------------
    const cropGroup = new THREE.Group();
    cropGroup.position.set(28, terrainHeight + 4, -25);

    // Center pivot circle field
    const cropGeom = new THREE.CylinderGeometry(14, 14, 0.8, 24);
    // Dynamic color interpolation based on cropHealthRatio
    const greenColor = new THREE.Color(0x10b981); // Emerald
    const brownColor = new THREE.Color(0x78350f); // Desiccated brown
    const activeCropColor = brownColor.clone().lerp(greenColor, cropHealthRatio);

    const cropMat = new THREE.MeshStandardMaterial({
      color: activeCropColor,
      roughness: 0.9,
      metalness: 0.05,
    });
    const cropMesh = new THREE.Mesh(cropGeom, cropMat);
    cropMesh.receiveShadow = true;
    cropGroup.add(cropMesh);

    // Irrigation center pivot boom (spoke rotating arm)
    const armGeom = new THREE.CylinderGeometry(0.3, 0.3, 13.5, 6);
    armGeom.rotateZ(Math.PI / 2);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0 });
    const armMesh = new THREE.Mesh(armGeom, armMat);
    armMesh.position.set(6.75, 0.8, 0);
    cropGroup.add(armMesh);

    hydrosphereGroup.add(cropGroup);

    // -------------------------------------------------------------
    // ASSET 3: MUNICIPAL AQUEDUCT / PIPELINE ACROSS ALLUVIAL FAULT
    // -------------------------------------------------------------
    const pipelineGroup = new THREE.Group();
    pipelineGroup.position.set(-30, terrainHeight + 1, 30);

    const pipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-10, 0, -35),
      new THREE.Vector3(15, 1.5, -10),
      new THREE.Vector3(35, -2, 15),
      new THREE.Vector3(55, 0, 35),
    ]);
    const pipeGeom = new THREE.TubeGeometry(pipeCurve, 24, 2.0, 8, false);
    const pipeMat = new THREE.MeshStandardMaterial({
      color: isPipelineCritical ? 0xff4d30 : 0x475569, // Flashes crimson if exceeding compaction
      roughness: 0.4,
      metalness: 0.6,
      emissive: isPipelineCritical ? 0xff4d30 : 0x000000,
      emissiveIntensity: isPipelineCritical ? 0.6 : 0.0,
    });
    const pipeMesh = new THREE.Mesh(pipeGeom, pipeMat);
    pipeMesh.castShadow = true;
    pipelineGroup.add(pipeMesh);

    // Pipeline support pylons
    for (let s = 0; s < 4; s++) {
      const pylonGeom = new THREE.BoxGeometry(1.5, 6, 1.5);
      const pylonMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
      const pylon = new THREE.Mesh(pylonGeom, pylonMat);
      const pt = pipeCurve.getPoint(s / 3);
      pylon.position.set(pt.x, pt.y - 3, pt.z);
      pipelineGroup.add(pylon);
    }

    hydrosphereGroup.add(pipelineGroup);

    // -------------------------------------------------------------
    // 2. CRUSTAL STRATA & WATER TABLE (Vadose Zone & Deep Aquifer)
    // -------------------------------------------------------------
    // A. Vadose Zone (Unsaturated soil and alluvium)
    const vadoseGeom = new THREE.BoxGeometry(blockSize, vadoseThickness, blockSize);
    const vadoseMat = new THREE.MeshStandardMaterial({
      color: 0x52525b, // Unsaturated alluvium / porous silt
      roughness: 0.95,
      metalness: 0.1,
    });
    const vadoseMesh = new THREE.Mesh(vadoseGeom, vadoseMat);
    vadoseMesh.position.y = -vadoseThickness / 2;
    crustGroup.add(vadoseMesh);

    // B. Animated Water Table Surface Slab dropping with ΔTWS(t)
    const waterTableGeom = new THREE.BoxGeometry(blockSize - 0.4, 1.4, blockSize - 0.4);
    const waterTableMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Hydrological blue
      transparent: true,
      opacity: 0.72,
      roughness: 0.15,
      metalness: 0.85,
      emissive: 0x0369a1,
      emissiveIntensity: 0.35,
    });
    const waterTableMesh = new THREE.Mesh(waterTableGeom, waterTableMat);
    waterTableMesh.position.y = currentWaterTableY;
    crustGroup.add(waterTableMesh);

    // C. Dashed Ghost Line for 2002 Baseline Water Table (THREE.LineDashedMaterial)
    const halfW = blockSize / 2 + 0.6;
    const baselinePts = [
      new THREE.Vector3(-halfW, baselineWaterTableY, -halfW),
      new THREE.Vector3(halfW, baselineWaterTableY, -halfW),
      new THREE.Vector3(halfW, baselineWaterTableY, halfW),
      new THREE.Vector3(-halfW, baselineWaterTableY, halfW),
      new THREE.Vector3(-halfW, baselineWaterTableY, -halfW),
    ];
    const baselineGeom = new THREE.BufferGeometry().setFromPoints(baselinePts);
    const baselineMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 4.5,
      gapSize: 2.5,
    });
    const baselineLine = new THREE.Line(baselineGeom, baselineMat);
    baselineLine.computeLineDistances(); // Required for THREE.LineDashedMaterial
    crustGroup.add(baselineLine);

    // D. Deep Saturated Aquifer Stratum (beneath water table)
    const aquiferGeom = new THREE.BoxGeometry(blockSize, aquiferThickness, blockSize);
    const aquiferMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Saturated gravel & sandstone aquifer
      roughness: 0.85,
      metalness: 0.25,
    });
    const aquiferMesh = new THREE.Mesh(aquiferGeom, aquiferMat);
    aquiferMesh.position.y = -vadoseThickness - aquiferThickness / 2;
    crustGroup.add(aquiferMesh);

    // E. Moho Seismic Boundary Plane
    const mohoGeom = new THREE.BoxGeometry(blockSize + 0.4, 1.5, blockSize + 0.4);
    const mohoMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Amber Moho seismic discontinuity marker
      roughness: 0.5,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.3,
    });
    const mohoMesh = new THREE.Mesh(mohoGeom, mohoMat);
    mohoMesh.position.y = -vadoseThickness - aquiferThickness;
    crustGroup.add(mohoMesh);

    // F. Animated Vertical Flux Arrows (Recharge vs Extraction loss)
    const fluxArrowsGroup = new THREE.Group();
    crustGroup.add(fluxArrowsGroup);

    // Recharge Arrows (downward pointing, cyan)
    const rechargeArrows: THREE.Group[] = [];
    for (let i = 0; i < 4; i++) {
      const arr = new THREE.Group();
      const coneGeom = new THREE.ConeGeometry(1.6, 3.5, 8);
      coneGeom.rotateX(Math.PI); // Point downwards
      const cylGeom = new THREE.CylinderGeometry(0.4, 0.4, 6.0, 6);
      const fluxMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.5,
        roughness: 0.3,
      });
      const cone = new THREE.Mesh(coneGeom, fluxMat);
      cone.position.y = -3.0;
      const cyl = new THREE.Mesh(cylGeom, fluxMat);
      arr.add(cone);
      arr.add(cyl);

      const x = -35 + i * 22 + Math.sin(i * 1.5) * 4;
      const z = -25 + (i % 2) * 45 + Math.cos(i * 1.2) * 4;
      arr.position.set(x, 4 - i * 3, z);
      fluxArrowsGroup.add(arr);
      rechargeArrows.push(arr);
    }

    // Extraction Loss Arrows (upward pointing, amber/crimson)
    const extractionArrows: THREE.Group[] = [];
    for (let i = 0; i < 4; i++) {
      const arr = new THREE.Group();
      const coneGeom = new THREE.ConeGeometry(1.6, 3.5, 8); // Points upwards
      const cylGeom = new THREE.CylinderGeometry(0.4, 0.4, 6.0, 6);
      const fluxMat = new THREE.MeshStandardMaterial({
        color: isDepleting ? 0xef4444 : 0xf59e0b,
        emissive: isDepleting ? 0xdc2626 : 0xd97706,
        emissiveIntensity: 0.6,
        roughness: 0.3,
      });
      const cone = new THREE.Mesh(coneGeom, fluxMat);
      cone.position.y = 3.0;
      const cyl = new THREE.Mesh(cylGeom, fluxMat);
      arr.add(cone);
      arr.add(cyl);

      const x = 25 - i * 18 + Math.cos(i * 1.7) * 4;
      const z = 15 - (i % 2) * 35 + Math.sin(i * 1.3) * 4;
      arr.position.set(x, -vadoseThickness - 5 - i * 3, z);
      fluxArrowsGroup.add(arr);
      extractionArrows.push(arr);
    }

    // -------------------------------------------------------------
    // 3. UPPER MANTLE LAYER (Subterranean Block 2: -150km to -250km)
    // -------------------------------------------------------------
    // TU Delft 4D Dynamic Earth / WINTERC-G thermal stress mantle
    const mantleHeight = 45;
    const mantleGeom = new THREE.BoxGeometry(blockSize, mantleHeight, blockSize);
    const mantleMat = new THREE.MeshStandardMaterial({
      color: 0x4a4541, // Neutral grey-brown mantle (schematic)
      roughness: 0.75,
      metalness: 0.3,
    });
    const mantleMesh = new THREE.Mesh(mantleGeom, mantleMat);
    mantleMesh.position.y = -mantleHeight / 2;
    mantleGroup.add(mantleMesh);

    // WINTERC-G thermal stress contours (glowing magma grid lines)
    const mantleGridHelper = new THREE.GridHelper(blockSize, 8, 0x8a837c, 0x5c5651);
    mantleGridHelper.position.y = 0.5;
    mantleGroup.add(mantleGridHelper);

    // -------------------------------------------------------------
    // 4. FLOATING TROPOSPHERIC CANOPY (+300px above terrain)
    // -------------------------------------------------------------
    const atmoHeight = atmoThickness;
    const atmoGeom = new THREE.BoxGeometry(blockSize, atmoHeight, blockSize);
    const atmoMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.1,
      transparent: true,
      opacity: 0.18,
      wireframe: false,
    });
    const atmoMesh = new THREE.Mesh(atmoGeom, atmoMat);
    atmosphericGroup.add(atmoMesh);

    // Atmosphere bounding wireframe
    const wireGeom = new THREE.BoxGeometry(blockSize, atmoHeight, blockSize);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const wireMesh = new THREE.Mesh(wireGeom, wireMat);
    atmosphericGroup.add(wireMesh);

    // Floating wind streamlines inside troposphere
    const windGroup = new THREE.Group();
    for (let w = 0; w < 16; w++) {
      const zOffset = (Math.random() - 0.5) * (blockSize - 20);
      const yOffset = (Math.random() - 0.5) * (atmoHeight - 8);

      const streamGeom = new THREE.CylinderGeometry(0.5, 0.5, blockSize, 6);
      streamGeom.rotateZ(Math.PI / 2);
      const streamMat = new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.6 + Math.random() * 0.3,
      });
      const streamMesh = new THREE.Mesh(streamGeom, streamMat);
      streamMesh.position.set(0, yOffset, zOffset);
      windGroup.add(streamMesh);
    }
    atmosphericGroup.add(windGroup);

    // Interactive Drag Controls (Manual Orbit)
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let rotationY = Math.PI / 4;
    let rotationX = 0.42;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      rotationY += deltaX * 0.008;
      rotationX = Math.max(0.1, Math.min(1.2, rotationX + deltaY * 0.008));
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const currentDist = camera.position.length();
      const newDist = Math.max(140, Math.min(480, currentDist + e.deltaY * 0.3));
      camera.position.setLength(newDist);
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    // Animation Loop
    let animationId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      const p = liveParamsRef.current;

      // Camera position from spherical coordinates
      const dist = camera.position.length();
      camera.position.x = dist * Math.cos(rotationX) * Math.sin(rotationY);
      camera.position.y = dist * Math.sin(rotationX);
      camera.position.z = dist * Math.cos(rotationX) * Math.cos(rotationY);
      camera.lookAt(0, 0, 0);

      // Update exploded block positions dynamically without scene reconstruction
      atmosphericGroup.position.y = 52 + 65 * p.explosionAmount + (p.currentVpd > 1.4 ? 4 : 0);
      crustGroup.position.y = -p.vadoseThickness / 2 - 25 * p.explosionAmount;
      mantleGroup.position.y = -p.vadoseThickness - p.aquiferThickness - 20 - 65 * p.explosionAmount;

      // Update reservoir water level & crop viability
      reservoirMesh.position.y = -9 + p.damFillRatio * 15;
      cropMat.color.copy(brownColor).lerp(greenColor, p.cropHealthRatio);

      // Update water table position
      waterTableMesh.position.y = p.currentWaterTableY;

      // Animate wind particles
      const reduced = reducedMotionRef.current;
      if (!reduced) windGroup.children.forEach((c, idx) => {
        c.position.x = ((c.position.x + 0.6 + idx * 0.05 + blockSize / 2) % blockSize) - blockSize / 2;
      });

      // Animate vertical flux arrows
      if (!reduced) rechargeArrows.forEach((arr) => {
        arr.position.y -= 0.16;
        if (arr.position.y < p.currentWaterTableY - 2) {
          arr.position.y = 8;
        }
      });

      if (!reduced) extractionArrows.forEach((arr) => {
        arr.position.y += 0.2;
        if (arr.position.y > 6) {
          arr.position.y = -p.vadoseThickness - p.aquiferThickness + 2;
        }
      });

      // Water table wave shimmer
      waterTableMat.opacity = reduced ? 0.68 : 0.68 + Math.sin(elapsedTime * 3) * 0.08;

      // Pipeline pulsing alarm if critical
      const pipeStdMat = pipeMat as THREE.MeshStandardMaterial;
      if (p.isPipelineCritical) {
        const pulse = reduced ? 1 : (Math.sin(elapsedTime * 6) + 1) * 0.5;
        pipeStdMat.color.setHex(0xff4d30);
        pipeStdMat.emissive.setHex(0xff4d30);
        pipeStdMat.emissiveIntensity = 0.4 + pulse * 0.6;
      } else {
        pipeStdMat.color.setHex(0x475569);
        pipeStdMat.emissive.setHex(0x000000);
        pipeStdMat.emissiveIntensity = 0.0;
      }

      renderer.render(scene, camera);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    // Follow the container (not just the window) so the canvas tracks layout changes.
    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationId);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      resizeObserver.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [basin, stratumMode]);

  return (
    <div
      {...dialog.props}
      aria-label="Subsurface view"
      className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink-1 select-none overflow-hidden"
    >
      {/* Header */}
      <div className="z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface-1 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Layers size={20} strokeWidth={1.75} className="shrink-0 text-ink-2" aria-hidden="true" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-body font-semibold text-ink-1">
                {isStudentMode ? 'Subsurface aquifer and ground subsidence view' : 'Subsurface cross-section (layered model)'}
              </h2>
              <span className="tag">{basin.properties.basin_name}</span>
              <span className="tag tag-warn">Modelled illustration</span>
            </div>
            <p className="text-caption text-ink-3">
              {isStudentMode
                ? 'Underground water layers and a ground-sinking cross-section, with dam, crop and pipeline risks'
                : 'Layered cross-section with an infrastructure impact simulator. Layer depths are schematic, not measured.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="seg" role="group" aria-label="Scenario">
            <button
              type="button"
              onClick={() => setStratumMode('standard')}
              className="seg-item"
              aria-pressed={stratumMode === 'standard'}
            >
              Standard layers
            </button>
            <button
              type="button"
              onClick={() => setStratumMode('paradox')}
              className="seg-item"
              aria-pressed={stratumMode === 'paradox'}
            >
              Irrigation paradox scenario
            </button>
          </div>

          <div className="flex items-center gap-2 text-label">
            <span className="text-ink-3">Year</span>
            <span className="tnum text-body font-semibold text-ink-1">{simulatedYear}</span>
            {simulatedYear > 2024 && <span className="tag tag-warn">Linear extrapolation</span>}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            aria-label="Close subsurface view"
          >
            <X size={16} strokeWidth={1.75} />
            <span>Close</span>
          </button>
        </div>
      </div>

      {/* 3D viewport and overlays */}
      <div className="relative flex-1 w-full h-full">
        {/* 3D canvas mount */}
        <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Left overlay: layers and infrastructure */}
        <div className="absolute top-4 left-4 z-20 flex max-w-sm flex-col gap-2 pointer-events-none">
          <div className="popover pointer-events-auto p-3">
            <h3 className="mb-1 flex items-center gap-1.5 text-label font-semibold text-ink-1">
              <Layers size={14} strokeWidth={1.75} className="text-ink-2" aria-hidden="true" />
              Layers, top to bottom
            </h3>

            <div className="text-caption">
              <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
                <div>
                  <div className="text-label font-medium text-ink-1">Atmosphere</div>
                  <div className="text-ink-3">Vapour pressure deficit: <span className="tnum">{currentVpd.toFixed(2)}</span> kPa</div>
                </div>
                <span className="tnum shrink-0 text-label text-ink-2">+{atmoThickness.toFixed(0)} km</span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
                <div>
                  <div className="text-label font-medium text-ink-1">Vegetation and surface</div>
                  <div className="text-ink-3">Vegetation index (modelled proxy): <span className="tnum">{currentNdvi.toFixed(3)}</span></div>
                </div>
                <span className="shrink-0 text-label text-ink-2">0 km (surface)</span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
                <div>
                  <div className="text-label font-medium text-ink-1">Unsaturated zone and fluxes</div>
                  <div className="text-ink-3">Pore column: <span className="tnum">{vadoseThickness.toFixed(1)}</span> m, recharge flux</div>
                </div>
                <span className="tnum shrink-0 text-label text-ink-2">0 to -{vadoseThickness.toFixed(0)} m</span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
                <div>
                  <div className="text-label font-medium text-ink-1">Deep aquifer (2002 baseline)</div>
                  <div className="text-ink-3">
                    Water storage change: <span className="tnum">{currentDeltaTws > 0 ? '+' : ''}{currentDeltaTws.toFixed(1)}</span> cm, water table{' '}
                    <span className="tnum">{Math.abs(currentDeltaTws * 0.45).toFixed(1)}</span> m {currentDeltaTws < 0 ? 'drop' : 'rise'}
                  </div>
                </div>
                <span className="tnum shrink-0 text-label text-ink-2">-{aquiferThickness.toFixed(0)} m</span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
                <div>
                  <div className="text-label font-medium text-ink-1">Upper mantle (schematic)</div>
                  <div className="text-ink-3">Viscoelastic rebound, geothermal stress</div>
                </div>
                <span className="shrink-0 text-label text-ink-2">-150 to -250 km</span>
              </div>
            </div>
          </div>

          {/* Infrastructure status */}
          <div className="popover pointer-events-auto p-3">
            <h3 className="mb-1 flex items-center gap-1.5 text-label font-semibold text-ink-1">
              <Building size={14} strokeWidth={1.75} className="text-ink-2" aria-hidden="true" />
              Infrastructure at risk (simulated)
            </h3>

            {/* Asset 1: dam */}
            <button
              type="button"
              onClick={() => setActiveAsset('dam')}
              aria-pressed={activeAsset === 'dam'}
              className={`mt-2 w-full cursor-pointer border-t border-line px-2 pt-2 pb-1 text-left text-caption ${
                activeAsset === 'dam' ? 'bg-surface-1' : 'hover:bg-surface-1'
              }`}
            >
              <div className="flex items-center justify-between gap-3 text-label">
                <span className="flex items-center gap-1.5 font-medium text-ink-1">
                  <Droplets size={14} strokeWidth={1.75} className="text-ink-3" aria-hidden="true" />
                  Municipal concrete dam
                </span>
                <span className={`tnum inline-flex items-center gap-1 ${damFillRatio < 0.35 ? 'text-warn' : 'text-ink-2'}`}>
                  {damFillRatio < 0.35 && <AlertTriangle size={14} strokeWidth={1.75} aria-label="Low" />}
                  {(damFillRatio * 100).toFixed(0)}% full
                </span>
              </div>
              <div className="mt-0.5 text-ink-3">
                Reservoir head change: <span className="tnum">{cumulativeAnomalyCm > 0 ? '+' : ''}
                {cumulativeAnomalyCm.toFixed(1)}</span> cm. {damFillRatio < 0.3 ? 'Intake starved' : 'Normal intake'}
              </div>
            </button>

            {/* Asset 2: crop circle */}
            <button
              type="button"
              onClick={() => setActiveAsset('crop')}
              aria-pressed={activeAsset === 'crop'}
              className={`mt-1 w-full cursor-pointer border-t border-line px-2 pt-2 pb-1 text-left text-caption ${
                activeAsset === 'crop' ? 'bg-surface-1' : 'hover:bg-surface-1'
              }`}
            >
              <div className="flex items-center justify-between gap-3 text-label">
                <span className="flex items-center gap-1.5 font-medium text-ink-1">
                  <Sprout size={14} strokeWidth={1.75} className="text-ink-3" aria-hidden="true" />
                  Irrigated crop circle
                </span>
                <span className={`tnum inline-flex items-center gap-1 ${cropHealthRatio < 0.4 ? 'text-warn' : 'text-ink-2'}`}>
                  {cropHealthRatio < 0.4 && <AlertTriangle size={14} strokeWidth={1.75} aria-label="Low" />}
                  {(cropHealthRatio * 100).toFixed(0)}% viable
                </span>
              </div>
              <div className="mt-0.5 text-ink-3">
                Vegetation condition: {cropHealthRatio < 0.3 ? 'Scorched and dry' : cropHealthRatio < 0.6 ? 'Drought-stressed' : 'Healthy'}
              </div>
            </button>

            {/* Asset 3: pipeline */}
            <button
              type="button"
              onClick={() => setActiveAsset('aqueduct')}
              aria-pressed={activeAsset === 'aqueduct'}
              className={`mt-1 w-full cursor-pointer border-t border-line px-2 pt-2 pb-1 text-left text-caption ${
                activeAsset === 'aqueduct' ? 'bg-surface-1' : 'hover:bg-surface-1'
              }`}
            >
              <div className="flex items-center justify-between gap-3 text-label">
                <span className="flex items-center gap-1.5 font-medium text-ink-1">
                  <Activity size={14} strokeWidth={1.75} className="text-ink-3" aria-hidden="true" />
                  Buried pipeline or aqueduct
                </span>
                <span className={`tnum ${isPipelineCritical ? 'text-warn' : 'text-ink-2'}`}>
                  {compactionStrain.toFixed(1)} mm/yr shear
                </span>
              </div>
              <div className="mt-0.5 text-ink-3">
                Uneven compaction: {isPipelineCritical ? 'Rupture risk' : 'Within tolerance'}
              </div>
            </button>
          </div>
        </div>

        {/* Right overlay: data note, scenario callout, navigation hint */}
        <div className="absolute top-4 right-4 z-20 flex max-w-sm flex-col gap-2 pointer-events-none">
          <div className="pointer-events-auto rounded-md border border-line bg-surface-1/90 px-3 py-2 text-caption text-ink-2">
            Boundary values: NASA POWER reanalysis. Interior layers: interpolated between them (modelled proxy).
          </div>
          {stratumMode === 'paradox' && (
            <div className="popover pointer-events-auto p-3">
              <div className="flex items-center gap-2">
                <h3 className="text-label font-semibold text-ink-1">Irrigation paradox</h3>
                <span className="tag tag-warn">Scenario</span>
              </div>
              <div className="mt-2 grid grid-cols-2 border-t border-line pt-2 text-caption">
                <div className="pr-3">
                  <div className="flex items-center gap-1 text-label font-medium text-ink-1">
                    <ArrowUp size={14} strokeWidth={1.75} className="text-ink-3" aria-hidden="true" /> Surface greening
                  </div>
                  <div className="tnum mt-0.5 text-ink-2">+18.4% vegetation index (modelled proxy)</div>
                  <div className="text-ink-3">Irrigation can hide the loss</div>
                </div>
                <div className="border-l border-line pl-3">
                  <div className="flex items-center gap-1 text-label font-medium text-ink-1">
                    <ArrowDown size={14} strokeWidth={1.75} className="text-ink-3" aria-hidden="true" /> Aquifer decline
                  </div>
                  <div className="tnum mt-0.5 text-dry-3">-1.52 cm/yr water storage (scenario rate)</div>
                  <div className="text-ink-3">Possible compaction</div>
                </div>
              </div>
              <p className="mt-2 border-t border-line pt-2 text-caption text-ink-2">
                Surface images can show greening fields while gravity data shows groundwater storage falling. Both numbers
                here are a scenario, not measurements.
              </p>
            </div>
          )}

          <div className="pointer-events-auto rounded-md border border-line bg-surface-1/90 px-3 py-2 text-caption text-ink-3">
            <div>Drag to orbit the block</div>
            <div>Scroll to zoom</div>
          </div>
        </div>

        {/* Bottom: timeline and layer spacing */}
        <div className="popover absolute bottom-4 left-1/2 z-20 flex w-[840px] max-w-[94vw] -translate-x-1/2 flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="btn btn-primary btn-sm"
                aria-label={isPlaying ? 'Pause the year animation' : 'Play the year animation, 2002 to 2035'}
              >
                {isPlaying ? <Pause size={14} strokeWidth={1.75} /> : <Play size={14} strokeWidth={1.75} />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>
              <button
                type="button"
                onClick={() => onYearChange(2024)}
                className="btn btn-secondary btn-sm"
                aria-label="Reset to 2024"
                title="Reset to 2024"
              >
                <RotateCcw size={14} strokeWidth={1.75} />
                <span>2024</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-2">
              <span>
                Cumulative water-storage change:{' '}
                <strong className={`tnum font-semibold ${cumulativeAnomalyCm < 0 ? 'text-dry-3' : 'text-wet-3'}`}>
                  {cumulativeAnomalyCm > 0 ? '+' : ''}
                  {cumulativeAnomalyCm.toFixed(1)} cm
                </strong>
              </span>
              <span>
                {stratumMode === 'paradox' ? 'Scenario rate (not measured)' : 'Trend (Theil-Sen)'}: <strong className="tnum font-semibold text-ink-1">{slope > 0 ? '+' : ''}{slope.toFixed(2)} cm/yr</strong>
              </span>
            </div>
          </div>

          {/* Year slider and layer spacing slider */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-3">
            <div className="flex min-w-[260px] flex-1 items-center gap-3">
              <span className="tnum text-caption text-ink-3">2002</span>
              <input
                type="range"
                min={2002}
                max={2035}
                step={1}
                value={simulatedYear}
                onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
                aria-label="Year"
                className="flex-1 cursor-pointer accent-accent"
              />
              <span className="tnum text-caption text-ink-3">2035</span>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="subsurface-layer-spacing" className="text-caption text-ink-3">Layer spacing</label>
              <input
                id="subsurface-layer-spacing"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={explosionAmount}
                onChange={(e) => setExplosionAmount(parseFloat(e.target.value))}
                className="w-24 cursor-pointer accent-accent"
              />
              <span className="tnum w-10 text-caption text-ink-2">{Math.round(explosionAmount * 100)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
