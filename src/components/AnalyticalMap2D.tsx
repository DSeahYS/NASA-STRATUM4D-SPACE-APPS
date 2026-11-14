import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Wind,
  Share2,
  BarChart3,
  BoxSelect,
  Crosshair,
  Flame,
  Minus,
} from 'lucide-react';
import type { BasinFeature } from './Globe';
import type { AppMode } from './ModeSwitcherHUD';
import type { AOISelection } from './GISAnalysisPanel';
import { getGibsWmsUrl, type LayerKind } from '../lib/gibs';
import { parseWindField, sampleWind, advectLatLon, type WindField } from '../lib/wind';
import { fetchActiveEONETEvents, type EONETEvent } from '../lib/eonet';
import { matchesEarthClassOrArchetype } from '../lib/earthClasses';
import { COLORS, trendColor } from '../theme/colors';

/** Same bins as the legend and the globe: |trend| of 0.9 cm/yr or more is strong, 0.18 to 0.9 moderate, below 0.18 neutral. */
function trendFill(slope: number): string {
  if (slope <= -0.9) return COLORS.dry3;
  if (slope <= -0.18) return COLORS.dry2;
  if (slope >= 0.9) return COLORS.wet3;
  if (slope >= 0.18) return COLORS.wet2;
  return COLORS.trendZero;
}

export interface AnalyticalMap2DProps {
  allBasins: BasinFeature[];
  selectedBasin?: BasinFeature | null;
  hoveredBasin?: BasinFeature | null;
  compareData?: {
    regionA: BasinFeature;
    regionB: BasinFeature;
    dipoleName?: string;
    mechanism?: string;
  } | null;
  activeLayer?: LayerKind;
  simulatedYear?: number;
  confidenceFilter?: 'all' | 'high' | 'likely';
  significanceLock?: boolean;
  showWind?: boolean;
  showDipoles?: boolean;
  windSpeedScale?: number;
  mode?: AppMode;
  selectedEarthClass?: string | null;
  aoiSelection?: AOISelection | null;
  onSelectBasin?: (basin: BasinFeature | null) => void;
  onHoverBasin?: (basin: BasinFeature | null, x?: number, y?: number) => void;
  onSelectAOI?: (aoi: AOISelection | null) => void;
  onSelectEONETEvent?: (event: EONETEvent) => void;
  onToggleWind?: () => void;
  onToggleDipoles?: () => void;
  onCompareCustomBasins?: (basinA: BasinFeature, basinB: BasinFeature) => void;
}

interface Particle2D {
  lat: number;
  lon: number;
  prevLat: number;
  prevLon: number;
  age: number;
  maxAge: number;
  speed: number;
}

export default function AnalyticalMap2D({
  allBasins,
  selectedBasin,
  compareData,
  activeLayer = 'base',
  simulatedYear = 2024,
  confidenceFilter = 'all',
  significanceLock = false,
  showWind = true,
  showDipoles = true,
  windSpeedScale = 1.0,
  mode = 'REMOTE_SENSING',
  selectedEarthClass = null,
  aoiSelection = null,
  onSelectBasin,
  onHoverBasin,
  onSelectAOI,
  onSelectEONETEvent,
  onToggleWind,
  onToggleDipoles,
  onCompareCustomBasins,
}: AnalyticalMap2DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Viewport dimensions
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 1200,
    height: 600,
  });

  // Pan & Zoom View State
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Map Layer Toggles
  const [localShowWind, setLocalShowWind] = useState(showWind);
  const [localShowDipoles, setLocalShowDipoles] = useState(showDipoles);
  // The latitude strip takes a third of a narrow map, so it starts hidden below 1500px (toolbar toggle).
  const [showZonalProfile, setShowZonalProfile] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 1500
  );
  const [hoveredArcId, setHoveredArcId] = useState<string | null>(null);
  const [showGraticule, setShowGraticule] = useState(true);
  const [isAoiMode, setIsAoiMode] = useState(mode === 'GIS');

  // EONET Hotspot Events
  const [eonetEvents, setEonetEvents] = useState<EONETEvent[]>([]);

  // Hover states & Tooltips
  const [hoveredBasinLocal, setHoveredBasinLocal] = useState<BasinFeature | null>(null);
  const [hoveredEonetEvent, setHoveredEonetEvent] = useState<EONETEvent | null>(null);
  const [hoveredBin, setHoveredBin] = useState<{
    latMin: number;
    latMax: number;
    meanSlope: number;
    count: number;
  } | null>(null);
  const [cursorGeo, setCursorGeo] = useState<{ lat: number; lon: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Dragging / AOI Lasso State
  const isDraggingMapRef = useRef(false);
  const isDrawingAoiRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });
  const aoiStartRef = useRef<{ x: number; y: number; lon: number; lat: number } | null>(null);
  const [activeAoiRect, setActiveAoiRect] = useState<{
    minLon: number;
    maxLon: number;
    minLat: number;
    maxLat: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  // Sync external props with internal states
  useEffect(() => {
    setLocalShowWind(showWind);
  }, [showWind]);

  useEffect(() => {
    setLocalShowDipoles(showDipoles);
  }, [showDipoles]);

  useEffect(() => {
    if (mode === 'GIS') setIsAoiMode(true);
  }, [mode]);

  // Load EONET Events
  useEffect(() => {
    let cancelled = false;
    fetchActiveEONETEvents()
      .then((events) => {
        if (!cancelled) setEonetEvents(events);
      })
      .catch((err) => console.error('AnalyticalMap2D: Failed to fetch EONET events:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  // ResizeObserver for responsive layout
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDimensions({ width, height });
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Map Viewport dimensions (excluding Zonal profile strip if open)
  const zonalWidth = showZonalProfile ? 140 : 0;
  const mapWidth = Math.max(100, dimensions.width - zonalWidth);
  const mapHeight = dimensions.height;

  // Coordinate projection conversions
  const lonToScreenX = useCallback(
    (lon: number) => {
      const u = (lon + 180) / 360;
      return (u * mapWidth) * zoom + pan.x;
    },
    [mapWidth, zoom, pan.x]
  );

  const latToScreenY = useCallback(
    (lat: number) => {
      const v = (90 - lat) / 180;
      return (v * mapHeight) * zoom + pan.y;
    },
    [mapHeight, zoom, pan.y]
  );

  const screenToLon = useCallback(
    (sx: number) => {
      const contentX = (sx - pan.x) / zoom;
      const u = contentX / mapWidth;
      return Math.max(-180, Math.min(180, u * 360 - 180));
    },
    [mapWidth, zoom, pan.x]
  );

  const screenToLat = useCallback(
    (sy: number) => {
      const contentY = (sy - pan.y) / zoom;
      const v = contentY / mapHeight;
      return Math.max(-90, Math.min(90, 90 - v * 180));
    },
    [mapHeight, zoom, pan.y]
  );

  // Clamp pan bounds so map cannot disappear from view
  const clampPan = useCallback(
    (newPanX: number, newPanY: number, newZoom: number) => {
      const minX = mapWidth * (1 - newZoom);
      const maxX = 0;
      const minY = mapHeight * (1 - newZoom);
      const maxY = 0;
      return {
        x: Math.max(minX, Math.min(maxX, newPanX)),
        y: Math.max(minY, Math.min(maxY, newPanY)),
      };
    },
    [mapWidth, mapHeight]
  );

  // Zoom handlers
  const handleZoom = useCallback(
    (deltaFactor: number, centerScreenX = mapWidth / 2, centerScreenY = mapHeight / 2) => {
      setZoom((prevZoom) => {
        const nextZoom = Math.max(1.0, Math.min(10.0, prevZoom * deltaFactor));
        setPan((prevPan) => {
          if (nextZoom === 1.0) return { x: 0, y: 0 };
          const ratio = nextZoom / prevZoom;
          const targetPanX = centerScreenX - (centerScreenX - prevPan.x) * ratio;
          const targetPanY = centerScreenY - (centerScreenY - prevPan.y) * ratio;
          return clampPan(targetPanX, targetPanY, nextZoom);
        });
        return nextZoom;
      });
    },
    [mapWidth, mapHeight, clampPan]
  );

  const handleResetView = useCallback(() => {
    setZoom(1.0);
    setPan({ x: 0, y: 0 });
  }, []);

  // -------------------------------------------------------------
  // CANVAS ENGINE: Base Map + NASA GIBS + MERRA-2 Wind Flow
  // -------------------------------------------------------------
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const gibsImageRef = useRef<HTMLImageElement | null>(null);
  const gibsUrlRef = useRef<string>('');
  const windFieldRef = useRef<WindField | null>(null);
  const particlesRef = useRef<Particle2D[]>([]);

  // Load Base Map Image
  useEffect(() => {
    const img = new Image();
    img.src = '/textures/earth-day-blue-marble.jpg';
    img.onload = () => {
      baseImageRef.current = img;
    };
  }, []);

  // Load Active GIBS Overlay Image
  useEffect(() => {
    if (activeLayer === 'base') {
      gibsImageRef.current = null;
      gibsUrlRef.current = '';
      return;
    }

    const epochDate =
      activeLayer === 'AIRS_CO_500HPA'
        ? '2026-10-14'
        : `${Math.min(2025, Math.max(2002, simulatedYear))}-07-15`;
    const url = getGibsWmsUrl(activeLayer, epochDate);

    if (url && url !== gibsUrlRef.current) {
      gibsUrlRef.current = url;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      img.onload = () => {
        gibsImageRef.current = img;
      };
      img.onerror = () => {
        // Fallback without cross-origin if CORS is blocked on local snapshot
        const fallbackImg = new Image();
        fallbackImg.src = url;
        fallbackImg.onload = () => {
          gibsImageRef.current = fallbackImg;
        };
      };
    }
  }, [activeLayer, simulatedYear]);

  // Load Wind Field JSON
  useEffect(() => {
    let cancelled = false;
    fetch('/data/wind.json')
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          windFieldRef.current = parseWindField(json);
        }
      })
      .catch((err) => console.error('AnalyticalMap2D: Failed to load wind.json:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize Wind Particles
  useEffect(() => {
    const NUM_PARTICLES = 1600;
    const particles: Particle2D[] = [];
    for (let i = 0; i < NUM_PARTICLES; i++) {
      const lat = (Math.asin(2 * Math.random() - 1) * 180) / Math.PI;
      const lon = Math.random() * 360 - 180;
      particles.push({
        lat,
        lon,
        prevLat: lat,
        prevLon: lon,
        age: Math.floor(Math.random() * 120),
        maxAge: 90 + Math.floor(Math.random() * 120),
        speed: 5.0,
      });
    }
    particlesRef.current = particles;
  }, []);

  // Main Canvas Render & Wind Animation Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = mapWidth * dpr;
    canvas.height = mapHeight * dpr;
    ctx.scale(dpr, dpr);

    let animId: number;
    const uvScratch = [0, 0, 0];
    const advectScratch = [0, 0];

    const render = () => {
      ctx.clearRect(0, 0, mapWidth, mapHeight);

      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // 1. Draw Base Blue Marble Earth Map
      if (baseImageRef.current && baseImageRef.current.complete) {
        ctx.drawImage(baseImageRef.current, 0, 0, mapWidth, mapHeight);
      } else {
        // Flat fallback while the texture loads
        ctx.fillStyle = COLORS.surface1;
        ctx.fillRect(0, 0, mapWidth, mapHeight);
      }

      // 2. Draw Active GIBS WMS Data Overlay
      if (
        activeLayer !== 'base' &&
        gibsImageRef.current &&
        gibsImageRef.current.complete &&
        gibsImageRef.current.naturalWidth > 0
      ) {
        ctx.globalAlpha = 0.72;
        ctx.drawImage(gibsImageRef.current, 0, 0, mapWidth, mapHeight);
        ctx.globalAlpha = 1.0;
      }

      // 3. Wind flow particles (MERRA-2 reanalysis)
      const field = windFieldRef.current;
      if (localShowWind && field) {
        const particles = particlesRef.current;
        const dt = 1800 * windSpeedScale;

        ctx.lineWidth = Math.max(1.0, 1.2 / Math.sqrt(zoom));
        ctx.lineCap = 'round';

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.prevLat = p.lat;
          p.prevLon = p.lon;

          sampleWind(field, p.lat, p.lon, uvScratch);
          const uMs = uvScratch[0];
          const vMs = uvScratch[1];
          p.speed = Math.hypot(uMs, vMs);

          advectLatLon(p.lat, p.lon, uMs, vMs, dt, advectScratch);
          p.lat = advectScratch[0];
          p.lon = advectScratch[1];

          // Screen positions within [0, mapWidth] x [0, mapHeight] (unzoomed content coordinates)
          const x0 = ((p.prevLon + 180) / 360) * mapWidth;
          const y0 = ((90 - p.prevLat) / 180) * mapHeight;
          const x1 = ((p.lon + 180) / 360) * mapWidth;
          const y1 = ((90 - p.lat) / 180) * mapHeight;

          // Don't draw across anti-meridian wrap discontinuity
          if (Math.abs(p.lon - p.prevLon) < 180) {
            const speedRatio = Math.min(1.0, p.speed / 24.0);
            const alpha = Math.max(0.15, Math.sin((p.age / p.maxAge) * Math.PI) * 0.85);

            // Neutral flow: faster wind is brighter, slower wind fainter
            if (speedRatio > 0.6) {
              ctx.strokeStyle = `rgba(236, 239, 242, ${alpha})`;
            } else if (speedRatio > 0.3) {
              ctx.strokeStyle = `rgba(185, 190, 196, ${alpha})`;
            } else {
              ctx.strokeStyle = `rgba(147, 153, 160, ${alpha * 0.7})`;
            }

            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
          }

          p.age++;
          if (p.age >= p.maxAge || Math.abs(p.lat) > 88) {
            p.lat = (Math.asin(2 * Math.random() - 1) * 180) / Math.PI;
            p.lon = Math.random() * 360 - 180;
            p.prevLat = p.lat;
            p.prevLon = p.lon;
            p.age = 0;
            p.maxAge = 90 + Math.floor(Math.random() * 120);
          }
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [
    mapWidth,
    mapHeight,
    zoom,
    pan.x,
    pan.y,
    activeLayer,
    localShowWind,
    windSpeedScale,
  ]);

  // -------------------------------------------------------------
  // DIPOLE PAIR EXTRACTION (All 8 Global Systems)
  // -------------------------------------------------------------
  const dipoleArcs = useMemo(() => {
    if (!localShowDipoles) return [];

    const pairs: Array<{
      id: string;
      basinA: BasinFeature;
      basinB: BasinFeature;
      name: string;
      slopeA: number;
      slopeB: number;
    }> = [];

    const basinMap = new Map<string, BasinFeature>();
    for (const b of allBasins) basinMap.set(b.properties.basin_id, b);

    const seen = new Set<string>();

    // 1. Active Compare Data pair
    if (compareData?.regionA && compareData?.regionB) {
      const key = [
        compareData.regionA.properties.basin_id,
        compareData.regionB.properties.basin_id,
      ]
        .sort()
        .join('::');
      seen.add(key);
      pairs.push({
        id: key,
        basinA: compareData.regionA,
        basinB: compareData.regionB,
        name: compareData.dipoleName || 'Teleconnection Coupling System',
        slopeA: compareData.regionA.properties.theil_sen_slope ?? 0,
        slopeB: compareData.regionB.properties.theil_sen_slope ?? 0,
      });
    }

    // 2. Curated Global Teleconnection Dipoles
    for (const b of allBasins) {
      const partnerId = b.properties.dipole_partner_id;
      if (partnerId && basinMap.has(partnerId)) {
        const key = [b.properties.basin_id, partnerId].sort().join('::');
        if (!seen.has(key)) {
          seen.add(key);
          const partner = basinMap.get(partnerId)!;
          pairs.push({
            id: key,
            basinA: b,
            basinB: partner,
            name:
              b.properties.dipole_system ||
              partner.properties.dipole_system ||
              'Coupled Climatological Dipole',
            slopeA: b.properties.theil_sen_slope ?? 0,
            slopeB: partner.properties.theil_sen_slope ?? 0,
          });
        }
      }
    }

    return pairs;
  }, [allBasins, localShowDipoles, compareData]);

  // -------------------------------------------------------------
  // ZONAL MEAN LATITUDE PROFILE COMPUTATION (10-degree bins)
  // -------------------------------------------------------------
  const zonalProfile = useMemo(() => {
    // 18 latitudinal bins: 90°N to -90°S
    const bins: Array<{
      latMax: number;
      latMin: number;
      latCenter: number;
      meanSlope: number;
      count: number;
    }> = [];

    for (let i = 0; i < 18; i++) {
      const latMax = 90 - i * 10;
      const latMin = 90 - (i + 1) * 10;
      const latCenter = (latMax + latMin) / 2;

      let sumSlope = 0;
      let count = 0;

      for (const b of allBasins) {
        const cLat = b.properties.centroid[1];
        if (cLat >= latMin && cLat < latMax) {
          sumSlope += b.properties.theil_sen_slope ?? 0;
          count++;
        }
      }

      bins.push({
        latMax,
        latMin,
        latCenter,
        meanSlope: count > 0 ? sumSlope / count : 0,
        count,
      });
    }

    return bins;
  }, [allBasins]);

  // -------------------------------------------------------------
  // MOUSE & INTERACTION DISPATCHERS (Pan, Zoom, AOI Lasso)
  // -------------------------------------------------------------
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.14 : 0.88;
    handleZoom(factor, sx, sy);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // If Shift is pressed or AOI Mode active -> draw AOI bounding box
    if (e.shiftKey || isAoiMode) {
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const lon = screenToLon(sx);
      const lat = screenToLat(sy);

      isDrawingAoiRef.current = true;
      aoiStartRef.current = { x: sx, y: sy, lon, lat };
      setActiveAoiRect({
        minLon: lon,
        maxLon: lon,
        minLat: lat,
        maxLat: lat,
        x: sx,
        y: sy,
        w: 0,
        h: 0,
      });
      return;
    }

    // Otherwise standard pan drag
    isDraggingMapRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Track geographic coordinates under cursor
    const curLon = screenToLon(sx);
    const curLat = screenToLat(sy);
    setCursorGeo({ lat: curLat, lon: curLon });
    setTooltipPos({ x: e.clientX, y: e.clientY });

    // Handle Active AOI Lasso Draw
    if (isDrawingAoiRef.current && aoiStartRef.current) {
      const start = aoiStartRef.current;
      const minLon = Math.min(start.lon, curLon);
      const maxLon = Math.max(start.lon, curLon);
      const minLat = Math.min(start.lat, curLat);
      const maxLat = Math.max(start.lat, curLat);

      const minX = Math.min(start.x, sx);
      const minY = Math.min(start.y, sy);
      const w = Math.abs(sx - start.x);
      const h = Math.abs(sy - start.y);

      setActiveAoiRect({
        minLon,
        maxLon,
        minLat,
        maxLat,
        x: minX,
        y: minY,
        w,
        h,
      });
      return;
    }

    // Handle Map Pan
    if (isDraggingMapRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const clamped = clampPan(
        dragStartRef.current.panX + dx,
        dragStartRef.current.panY + dy,
        zoom
      );
      setPan(clamped);
    }
  };

  const handleMouseUp = () => {
    // Complete AOI Selection
    if (isDrawingAoiRef.current && activeAoiRect) {
      isDrawingAoiRef.current = false;
      const { minLon, maxLon, minLat, maxLat, w, h } = activeAoiRect;

      if (w > 8 && h > 8) {
        // Calculate spherical surface area in km² (R = 6371 km)
        const DEG2RAD = Math.PI / 180;
        const R = 6371.0;
        const dLonRad = Math.abs((maxLon - minLon) * DEG2RAD);
        const lat1Rad = minLat * DEG2RAD;
        const lat2Rad = maxLat * DEG2RAD;
        const areaKm2 = Math.round(
          R * R * dLonRad * Math.abs(Math.sin(lat2Rad) - Math.sin(lat1Rad))
        );

        // Find intersecting basins
        const intersecting = allBasins.filter((b) => {
          const [cLon, cLat] = b.properties.centroid;
          if (cLon >= minLon && cLon <= maxLon && cLat >= minLat && cLat <= maxLat) {
            return true;
          }
          const bbox = b.properties.bbox || (b as any).bbox;
          if (bbox && Array.isArray(bbox) && bbox.length === 4) {
            const [bMinLon, bMinLat, bMaxLon, bMaxLat] = bbox;
            return !(
              bMaxLon < minLon ||
              bMinLon > maxLon ||
              bMaxLat < minLat ||
              bMinLat > maxLat
            );
          }
          return false;
        });

        onSelectAOI?.({
          bounds: [minLon, minLat, maxLon, maxLat],
          areaKm2,
          intersectingBasins: intersecting,
        });
      }
      setActiveAoiRect(null);
      aoiStartRef.current = null;
      return;
    }

    isDraggingMapRef.current = false;
  };

  const handleMouseLeave = () => {
    isDraggingMapRef.current = false;
    isDrawingAoiRef.current = false;
    setActiveAoiRect(null);
    setHoveredBasinLocal(null);
    setHoveredEonetEvent(null);
    setHoveredBin(null);
    setCursorGeo(null);
    onHoverBasin?.(null);
  };

  // -------------------------------------------------------------
  // SVG POLYLINES & RINGS BUILDER
  // -------------------------------------------------------------
  const getBasinPathData = useCallback(
    (basin: BasinFeature) => {
      const geom = basin.geometry;
      if (!geom || !geom.coordinates) return '';

      const rings: number[][][] = [];
      if (geom.type === 'Polygon') {
        rings.push(geom.coordinates[0]);
      } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates) {
          if (poly.length > 0) rings.push(poly[0]);
        }
      }

      const paths: string[] = [];
      for (const ring of rings) {
        if (!ring || ring.length < 3) continue;
        const points = ring.map((pt, idx) => {
          const x = lonToScreenX(pt[0]);
          const y = latToScreenY(pt[1]);
          return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        });
        paths.push(points.join(' ') + ' Z');
      }

      return paths.join(' ');
    },
    [lonToScreenX, latToScreenY]
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex overflow-hidden select-none bg-canvas"
    >
      {/* 2D Equirectangular Map Container */}
      <div
        className="relative flex-1 h-full cursor-crosshair overflow-hidden"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Layer 1: Canvas (base map, image overlay, wind) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ width: `${mapWidth}px`, height: `${mapHeight}px` }}
        />

        {/* Layer 2: SVG Vector Overlay (Basins + Dipoles + Pins + Lasso) */}
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full pointer-events-auto"
          style={{ width: `${mapWidth}px`, height: `${mapHeight}px` }}
        >
          <defs>
            {/* Hatching for trends that are not significant (FDR q of 0.05 or more) */}
            <pattern
              id="ipcc-hatch"
              width="10"
              height="10"
              patternTransform="rotate(45 0 0)"
              patternUnits="userSpaceOnUse"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="10"
                stroke={COLORS.ink1}
                strokeWidth="1.2"
                strokeOpacity="0.32"
              />
            </pattern>

          </defs>

          {/* Graticule Grid Lines (Latitudes & Longitudes) */}
          {showGraticule && (
            <g className="pointer-events-none">
              {/* Parallels (every 30 degrees) */}
              {[-60, -30, 0, 30, 60].map((lat) => {
                const y = latToScreenY(lat);
                return (
                  <g key={`lat-${lat}`}>
                    <line
                      x1="0"
                      y1={y}
                      x2={mapWidth}
                      y2={y}
                      stroke={COLORS.ink3}
                      strokeOpacity="0.3"
                      strokeWidth={lat === 0 ? 1.5 : 0.75}
                      strokeDasharray={lat === 0 ? '' : '4 4'}
                    />
                    <text
                      x="8"
                      y={y - 3}
                      fill={COLORS.ink2}
                      fontSize="11"
                      stroke={COLORS.canvas}
                      strokeWidth="3"
                      paintOrder="stroke"
                    >
                      {lat > 0 ? `${lat}°N` : lat < 0 ? `${Math.abs(lat)}°S` : '0° equator'}
                    </text>
                  </g>
                );
              })}
              {/* Meridians (every 60 degrees) */}
              {[-120, -60, 0, 60, 120].map((lon) => {
                const x = lonToScreenX(lon);
                return (
                  <g key={`lon-${lon}`}>
                    <line
                      x1={x}
                      y1="0"
                      x2={x}
                      y2={mapHeight}
                      stroke={COLORS.ink3}
                      strokeOpacity="0.3"
                      strokeWidth={lon === 0 ? 1.5 : 0.75}
                      strokeDasharray={lon === 0 ? '' : '4 4'}
                    />
                    <text
                      x={x + 3}
                      y={mapHeight - 46}
                      fill={COLORS.ink2}
                      fontSize="11"
                      stroke={COLORS.canvas}
                      strokeWidth="3"
                      paintOrder="stroke"
                    >
                      {lon > 0 ? `${lon}°E` : lon < 0 ? `${Math.abs(lon)}°W` : '0°'}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* 1. Catchment Boundary Polygons */}
          <g className="basin-polygons">
            {allBasins.map((basin) => {
              const pathData = getBasinPathData(basin);
              if (!pathData) return null;

              const isSelected =
                selectedBasin?.properties.basin_id === basin.properties.basin_id;
              const isHovered =
                hoveredBasinLocal?.properties.basin_id === basin.properties.basin_id;

              const slope = basin.properties.theil_sen_slope ?? 0.0;
              const p = basin.properties.p_value_fdr ?? basin.properties.p_value_raw ?? 0.05;
              const isSignificant = p < 0.05;

              // Filter check
              if (confidenceFilter === 'high' && p >= 0.01) return null;
              if (confidenceFilter === 'likely' && p >= 0.05) return null;
              if (
                selectedEarthClass &&
                !matchesEarthClassOrArchetype(basin, selectedEarthClass)
              ) {
                return null;
              }

              // Fill from the Theil-Sen rate (cm/yr), same drying and wetting colours as the legend and globe
              const fillColor = trendFill(slope);

              // Dim non-significant catchments if significanceLock is engaged
              let opacity = isSignificant ? 0.65 : 0.35;
              if (significanceLock && !isSignificant) {
                opacity = 0.15;
              }
              if (isHovered) opacity = Math.min(1.0, opacity + 0.25);
              if (isSelected) opacity = 0.85;

              return (
                <g key={basin.properties.basin_id} className="cursor-pointer">
                  {/* Base polygon fill */}
                  <path
                    d={pathData}
                    fill={fillColor}
                    fillOpacity={opacity}
                    stroke={
                      isSelected
                        ? COLORS.accent
                        : isHovered
                        ? COLORS.ink1
                        : isSignificant
                        ? COLORS.ink2
                        : COLORS.lineStrong
                    }
                    strokeWidth={isSelected ? 3 : isHovered ? 2 : 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBasin?.(basin);
                    }}
                    onMouseEnter={(e) => {
                      setHoveredBasinLocal(basin);
                      onHoverBasin?.(basin, e.clientX, e.clientY);
                    }}
                    onMouseLeave={() => {
                      setHoveredBasinLocal(null);
                      onHoverBasin?.(null);
                    }}
                  />

                  {/* Hatching for trends that are not significant */}
                  {!isSignificant && (
                    <path
                      d={pathData}
                      fill="url(#ipcc-hatch)"
                      fillOpacity={significanceLock ? 0.75 : 0.4}
                      stroke="none"
                      className="pointer-events-none"
                    />
                  )}
                </g>
              );
            })}
          </g>

          {/* 2. Centroid Mini Trend Badges */}
          <g className="trend-badges pointer-events-none">
            {(() => {
              // Collision handling: selected and hovered first, then the strongest trends; a badge that would
              // overlap one already placed is skipped (zoom in to see it).
              const cand = allBasins
                .map((b) => {
                  const [cLon, cLat] = b.properties.centroid;
                  const pv = b.properties.p_value_fdr ?? b.properties.p_value_raw ?? 0.05;
                  const prio =
                    b.properties.basin_id === selectedBasin?.properties.basin_id ||
                    b.properties.basin_id === hoveredBasinLocal?.properties.basin_id
                      ? Infinity
                      : Math.abs(b.properties.theil_sen_slope ?? 0);
                  return { b, x: lonToScreenX(cLon), y: latToScreenY(cLat), pv, prio };
                })
                .filter((c) => {
                  if (c.x < -50 || c.x > mapWidth + 50 || c.y < -50 || c.y > mapHeight + 50) return false;
                  if (confidenceFilter === 'high' && c.pv >= 0.01) return false;
                  if (confidenceFilter === 'likely' && c.pv >= 0.05) return false;
                  return true;
                })
                .sort((a, c) => c.prio - a.prio);
              const placed: Array<{ x: number; y: number }> = [];
              const out: BasinFeature[] = [];
              for (const c of cand) {
                if (c.prio !== Infinity && placed.some((q) => Math.abs(q.x - c.x) < 68 && Math.abs(q.y - c.y) < 24)) continue;
                placed.push({ x: c.x, y: c.y });
                out.push(c.b);
              }
              return out;
            })().map((basin) => {
              const [cLon, cLat] = basin.properties.centroid;
              const x = lonToScreenX(cLon);
              const y = latToScreenY(cLat);

              // Don't draw if outside viewport
              if (x < -50 || x > mapWidth + 50 || y < -50 || y > mapHeight + 50) {
                return null;
              }

              const slope = basin.properties.theil_sen_slope ?? 0.0;
              const p = basin.properties.p_value_fdr ?? basin.properties.p_value_raw ?? 0.05;

              // Filter out if confidence filter hides it
              if (confidenceFilter === 'high' && p >= 0.01) return null;
              if (confidenceFilter === 'likely' && p >= 0.05) return null;

              const isSelected =
                selectedBasin?.properties.basin_id === basin.properties.basin_id;
              const isHovered =
                hoveredBasinLocal?.properties.basin_id === basin.properties.basin_id;

              const arrow = slope > 0.05 ? '↑' : slope < -0.05 ? '↓' : '→';
              const arrowColor = Math.abs(slope) > 0.05 ? trendColor(slope) : COLORS.ink3;
              const sigDotColor = p < 0.01 ? COLORS.ink1 : p < 0.05 ? COLORS.ink2 : 'none';

              return (
                <g
                  key={`badge-${basin.properties.basin_id}`}
                  transform={`translate(${x}, ${y})`}
                  className="transition-transform duration-150"
                  style={{
                    transform: `translate(${x}px, ${y}px) scale(${
                      isSelected || isHovered ? 1.2 : 1.0
                    })`,
                  }}
                >
                  {/* Badge pill backdrop */}
                  <rect
                    x="-32"
                    y="-11"
                    width="64"
                    height="22"
                    rx="11"
                    fill={COLORS.surface1}
                    fillOpacity="0.92"
                    stroke={isSelected ? COLORS.accent : COLORS.line}
                    strokeWidth={isSelected ? 1.5 : 0.75}
                  />
                  {/* Significance Dot */}
                  <circle cx="-22" cy="0" r="3" fill={sigDotColor} stroke={COLORS.ink3} strokeWidth="1" />
                  {/* Trend Arrow */}
                  <text
                    x="-12"
                    y="4"
                    fill={arrowColor}
                    fontSize="12"
                    fontWeight="600"
                  >
                    {arrow}
                  </text>
                  {/* Slope Value */}
                  <text
                    x="4"
                    y="3.5"
                    fill={COLORS.ink1}
                    fontSize="11"
                    fontWeight="600"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {Math.abs(slope).toFixed(1)}
                  </text>
                </g>
              );
            })}
          </g>

          {/* 3. Opposite-trend pair arcs (all 8 pairs) */}
          {localShowDipoles && (
            <g className="dipole-arcs pointer-events-auto">
              {dipoleArcs.map((arc) => {
                const [lonA, latA] = arc.basinA.properties.centroid;
                const [lonB, latB] = arc.basinB.properties.centroid;

                const x1 = lonToScreenX(lonA);
                const y1 = latToScreenY(latA);
                const x2 = lonToScreenX(lonB);
                const y2 = latToScreenY(latB);

                // Bézier arch calculations
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                const dist = Math.hypot(x2 - x1, y2 - y1);
                const archH = Math.max(35, Math.min(130, dist * 0.22));
                const cpx = mx;
                const cpy = my - archH;

                const pathData = `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cpx.toFixed(
                  1
                )} ${cpy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;

                return (
                  <g
                    key={`dipole-${arc.id}`}
                    className="cursor-pointer group"
                    onClick={() => onCompareCustomBasins?.(arc.basinA, arc.basinB)}
                    onMouseEnter={() => setHoveredArcId(arc.id)}
                    onMouseLeave={() => setHoveredArcId(null)}
                  >
                    <title>{arc.name}</title>
                    {/* Dashed arc between the two regions */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke={COLORS.ink2}
                      strokeWidth="2"
                      strokeDasharray="8 5"
                      className="animate-dipole-stream"
                    />

                    {/* Wide invisible stroke so the arc is easy to hover */}
                    <path d={pathData} fill="none" stroke="transparent" strokeWidth="14" />

                    {/* Midpoint label: only for the hovered pair or the active comparison */}
                    {(hoveredArcId === arc.id ||
                      (compareData?.regionA && compareData?.regionB && arc.id === dipoleArcs[0]?.id)) && (
                    <g
                      transform={`translate(${cpx}, ${cpy - 6})`}
                      className="transition-transform group-hover:scale-110"
                    >
                      <rect
                        x="-80"
                        y="-11"
                        width="160"
                        height="22"
                        rx="11"
                        fill={COLORS.surface2}
                        stroke={COLORS.lineStrong}
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="4"
                        fill={COLORS.ink1}
                        fontSize="11"
                        textAnchor="middle"
                      >
                        {arc.name.length > 24 ? `${arc.name.slice(0, 22)}…` : arc.name}
                      </text>
                    </g>
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* 4. NASA EONET event pins */}
          <g className="eonet-pins pointer-events-auto">
            {eonetEvents.map((ev) => {
              const [lon, lat] = ev.coordinates;
              const x = lonToScreenX(lon);
              const y = latToScreenY(lat);

              // Neutral pin; curated scenarios (not from the live EONET feed) are marked with the caution colour
              const catColor = ev.curated ? COLORS.warn : COLORS.ink1;

              return (
                <g
                  key={ev.id}
                  transform={`translate(${x}, ${y})`}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEONETEvent?.(ev);
                  }}
                  onMouseEnter={() => setHoveredEonetEvent(ev)}
                  onMouseLeave={() => setHoveredEonetEvent(null)}
                >
                  {/* Outer ring */}
                  <circle
                    cx="0"
                    cy="0"
                    r="9"
                    fill={catColor}
                    fillOpacity="0.25"
                    stroke={catColor}
                    strokeOpacity="0.6"
                    strokeWidth="1"
                  />
                  {/* Core pin */}
                  <circle
                    cx="0"
                    cy="0"
                    r="4.5"
                    fill={catColor}
                    stroke={COLORS.canvas}
                    strokeWidth="1.5"
                  />
                </g>
              );
            })}
          </g>

          {/* 5. Area-of-interest box (being drawn, or selected) */}
          {(activeAoiRect || aoiSelection) && (
            <g className="aoi-lasso pointer-events-none">
              {activeAoiRect ? (
                <g>
                  <rect
                    x={activeAoiRect.x}
                    y={activeAoiRect.y}
                    width={activeAoiRect.w}
                    height={activeAoiRect.h}
                    fill={COLORS.ink1}
                    fillOpacity="0.08"
                    stroke={COLORS.ink1}
                    strokeWidth="2"
                    strokeDasharray="6 4"
                  />
                  <g transform={`translate(${activeAoiRect.x + 6}, ${activeAoiRect.y - 8})`}>
                    <rect
                      x="0"
                      y="-12"
                      width="170"
                      height="20"
                      rx="4"
                      fill={COLORS.surface2}
                      stroke={COLORS.lineStrong}
                      strokeWidth="1"
                    />
                    <text
                      x="8"
                      y="0"
                      fill={COLORS.ink1}
                      fontSize="11"
                    >
                      Drawing area of interest…
                    </text>
                  </g>
                </g>
              ) : aoiSelection ? (
                (() => {
                  const [minLon, minLat, maxLon, maxLat] = aoiSelection.bounds;
                  const x1 = lonToScreenX(minLon);
                  const y1 = latToScreenY(maxLat);
                  const x2 = lonToScreenX(maxLon);
                  const y2 = latToScreenY(minLat);
                  const rx = Math.min(x1, x2);
                  const ry = Math.min(y1, y2);
                  const rw = Math.abs(x2 - x1);
                  const rh = Math.abs(y2 - y1);

                  return (
                    <g>
                      <rect
                        x={rx}
                        y={ry}
                        width={rw}
                        height={rh}
                        fill={COLORS.ink1}
                        fillOpacity="0.08"
                        stroke={COLORS.ink1}
                        strokeWidth="2"
                        strokeDasharray="6 4"
                      />
                      <g transform={`translate(${rx + 6}, ${ry - 8})`}>
                        <rect
                          x="0"
                          y="-14"
                          width="240"
                          height="20"
                          rx="4"
                          fill={COLORS.surface2}
                          stroke={COLORS.lineStrong}
                          strokeWidth="1"
                        />
                        <text
                          x="8"
                          y="0"
                          fill={COLORS.ink1}
                          fontSize="11"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          Selected area: {aoiSelection.areaKm2.toLocaleString()} km² ·{' '}
                          {aoiSelection.intersectingBasins.length} basins
                        </text>
                      </g>
                    </g>
                  );
                })()
              ) : null}
            </g>
          )}
        </svg>

        {/* Top-left map controls */}
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
          {/* Zoom and reset */}
          <div className="popover flex items-center gap-1 self-start p-1" role="group" aria-label="Zoom">
            <button
              type="button"
              onClick={() => handleZoom(1.3)}
              className="btn btn-ghost btn-sm w-7 px-0"
              aria-label="Zoom in"
              title="Zoom in"
            >
              <ZoomIn size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => handleZoom(0.77)}
              className="btn btn-ghost btn-sm w-7 px-0"
              aria-label="Zoom out"
              title="Zoom out"
            >
              <ZoomOut size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="btn btn-ghost btn-sm w-7 px-0"
              aria-label="Reset view"
              title="Reset view"
            >
              <RotateCcw size={16} strokeWidth={1.75} />
            </button>
            <div className="h-4 w-px bg-line-strong mx-1" />
            <span className="tnum min-w-10 px-1 text-label text-ink-2">{Math.round(zoom * 100)}%</span>
          </div>

          {/* Layer toggles */}
          <div className="popover flex flex-wrap items-center gap-1 self-start p-1" role="group" aria-label="Map layers">
            <button
              type="button"
              onClick={() => {
                setLocalShowWind(!localShowWind);
                onToggleWind?.();
              }}
              className="chip"
              aria-pressed={localShowWind}
              title="Wind streamlines (MERRA-2 reanalysis)"
              aria-label="Wind streamlines"
            >
              <Wind size={14} strokeWidth={1.75} />
              <span className="hidden min-[1500px]:inline">Wind</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setLocalShowDipoles(!localShowDipoles);
                onToggleDipoles?.();
              }}
              className="chip"
              aria-pressed={localShowDipoles}
              title="Arcs joining the 8 paired regions"
              aria-label={`Paired regions (${dipoleArcs.length})`}
            >
              <Share2 size={14} strokeWidth={1.75} />
              <span className="tnum hidden min-[1500px]:inline">Pairs ({dipoleArcs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setShowZonalProfile(!showZonalProfile)}
              className="chip"
              aria-pressed={showZonalProfile}
              title="Show the mean trend by latitude band beside the map"
              aria-label="Latitude strip"
            >
              <BarChart3 size={14} strokeWidth={1.75} />
              <span className="hidden min-[1500px]:inline">Latitudes</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAoiMode(!isAoiMode)}
              className="chip"
              aria-pressed={isAoiMode}
              title="Draw a box to select an area (or hold Shift and drag)"
              aria-label="Select area"
            >
              <BoxSelect size={14} strokeWidth={1.75} />
              <span className="hidden min-[1500px]:inline">Select area</span>
            </button>

            <button
              type="button"
              onClick={() => setShowGraticule(!showGraticule)}
              className="chip"
              aria-pressed={showGraticule}
              title="Latitude and longitude grid"
              aria-label="Grid"
            >
              <Crosshair size={14} strokeWidth={1.75} />
              <span className="hidden min-[1500px]:inline">Grid</span>
            </button>
          </div>
        </div>

        {/* Bottom status and coordinates */}
        <div className="absolute bottom-3 left-4 z-20 flex items-center gap-3 rounded-md border border-line bg-surface-1/90 px-3 py-1 text-caption text-ink-2">
          <span className="whitespace-nowrap">EPSG:4326 map</span>
          {cursorGeo && (
            <span className="tnum whitespace-nowrap font-mono text-ink-1">
              {cursorGeo.lat >= 0 ? `${cursorGeo.lat.toFixed(2)}°N` : `${Math.abs(cursorGeo.lat).toFixed(2)}°S`},{' '}
              {cursorGeo.lon >= 0 ? `${cursorGeo.lon.toFixed(2)}°E` : `${Math.abs(cursorGeo.lon).toFixed(2)}°W`}
            </span>
          )}
          <span className="hidden 2xl:inline text-ink-3">Shift and drag to select an area</span>
        </div>

        {/* Basin hover tooltip */}
        {hoveredBasinLocal && (
          <div
            className="popover fixed z-50 pointer-events-none max-w-xs p-3 text-label"
            style={{
              left: `${Math.min(window.innerWidth - 280, tooltipPos.x + 16)}px`,
              top: `${Math.min(window.innerHeight - 160, tooltipPos.y + 16)}px`,
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="truncate text-body font-semibold text-ink-1">
                {hoveredBasinLocal.properties.basin_name}
              </h3>
              <span className="shrink-0 text-caption text-ink-3">
                {hoveredBasinLocal.properties.continent || 'Catchment'}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-3 border-t border-line pt-2">
              <div>
                <span className="block text-caption text-ink-3">Trend (Theil-Sen)</span>
                <span
                  className={`tnum text-body font-semibold ${
                    (hoveredBasinLocal.properties.theil_sen_slope ?? 0) <= -0.18
                      ? 'text-dry-3'
                      : (hoveredBasinLocal.properties.theil_sen_slope ?? 0) >= 0.18
                      ? 'text-wet-3'
                      : 'text-ink-1'
                  }`}
                >
                  {(hoveredBasinLocal.properties.theil_sen_slope ?? 0) > 0 ? '+' : ''}
                  {(hoveredBasinLocal.properties.theil_sen_slope ?? 0).toFixed(2)} cm/yr
                </span>
              </div>
              <div>
                <span className="block text-caption text-ink-3">Significance (FDR q)</span>
                <span className="tnum text-body font-semibold text-ink-1">
                  {(hoveredBasinLocal.properties.p_value_fdr ?? 0.05).toFixed(3)}
                </span>
              </div>
            </div>

            {hoveredBasinLocal.properties.dipole_system && (
              <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2 text-caption text-ink-2">
                <Share2 size={12} strokeWidth={1.75} className="shrink-0" />
                <span className="truncate">{hoveredBasinLocal.properties.dipole_system}</span>
              </div>
            )}
          </div>
        )}

        {/* EONET event tooltip */}
        {hoveredEonetEvent && (
          <div
            className="popover fixed z-50 pointer-events-none max-w-xs p-3 text-label"
            style={{
              left: `${Math.min(window.innerWidth - 280, tooltipPos.x + 16)}px`,
              top: `${Math.min(window.innerHeight - 160, tooltipPos.y + 16)}px`,
            }}
          >
            <div className="mb-1 flex items-center gap-1.5 text-caption text-ink-2">
              <Flame size={14} strokeWidth={1.75} />
              <span>{hoveredEonetEvent.curated ? 'Curated scenario event' : 'NASA EONET natural event'}</span>
            </div>
            <h3 className="mb-1 text-body font-semibold text-ink-1">{hoveredEonetEvent.title}</h3>
            <div className="text-caption text-ink-3">
              Category: <span className="text-ink-2">{hoveredEonetEvent.category}</span>
            </div>
            {hoveredEonetEvent.date && (
              <div className="tnum text-caption text-ink-3">Date: {hoveredEonetEvent.date.slice(0, 10)}</div>
            )}
            {hoveredEonetEvent.curated && (
              <span className="tag tag-warn mt-2">Curated scenario</span>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Layer c: Zonal Mean Latitude Profile Strip (Right Edge)       */}
      {/* ------------------------------------------------------------- */}
      {showZonalProfile && (
        <aside
          className="relative h-full flex flex-col bg-surface-1 border-l border-line select-none"
          aria-label="Mean trend by latitude band"
          style={{ width: `${zonalWidth}px` }}
        >
          {/* Header */}
          <div className="border-b border-line p-2 pt-12 text-center">
            <h3 className="text-label font-semibold text-ink-1">Mean trend by latitude, cm/yr</h3>
            <div className="text-caption text-ink-3">90°N to 90°S</div>
          </div>

          {/* Latitude Profile Visualization */}
          <div className="relative flex-1 w-full overflow-hidden">
            {/* Zero Slope Center Guide Axis */}
            <div className="absolute top-0 bottom-0 left-1/2 w-px bg-line-strong pointer-events-none" />

            {/* Latitude Bins: Horizontal Bars */}
            {zonalProfile.map((bin, idx) => {
              const topY = (idx / 18) * 100;
              const isWetting = bin.meanSlope > 0;
              const maxMagnitude = 1.0; // cm/yr normalization cap
              const barWidthPct = Math.min(
                28,
                (Math.abs(bin.meanSlope) / maxMagnitude) * 28
              );

              return (
                <div
                  key={`zonal-${bin.latCenter}`}
                  className="absolute w-full group cursor-pointer hover:bg-surface-2 transition-colors"
                  style={{
                    top: `${topY}%`,
                    height: `${100 / 18}%`,
                  }}
                  onMouseEnter={() => setHoveredBin(bin)}
                  onMouseLeave={() => setHoveredBin(null)}
                >
                  {/* Mean Slope Bar */}
                  {barWidthPct > 0 && (
                    <div
                      className={`absolute top-1 bottom-1 rounded-sm transition-all ${
                        isWetting ? 'bg-wet-2 left-1/2' : 'bg-dry-2 right-1/2'
                      }`}
                      style={{
                        width: `${barWidthPct}%`,
                      }}
                    />
                  )}

                  {/* Latitude Reference Label */}
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-micro text-ink-3 pointer-events-none">
                    {bin.latCenter > 0
                      ? `${bin.latCenter}°N`
                      : bin.latCenter < 0
                      ? `${Math.abs(bin.latCenter)}°S`
                      : '0°'}
                  </span>
                </div>
              );
            })}

            {/* Smooth Connected Profile Spline (SVG) */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`0 0 ${zonalWidth} 100`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                d={zonalProfile
                  .map((bin, i) => {
                    const y = ((i + 0.5) / 18) * 100;
                    const x =
                      zonalWidth / 2 +
                      Math.max(-1, Math.min(1, bin.meanSlope / 1.0)) * (zonalWidth * 0.28);
                    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                  })
                  .join(' ')}
                fill="none"
                stroke={COLORS.ink2}
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>

          {/* Direction key and hovered band readout */}
          <div className="flex flex-col gap-1 border-t border-line p-2 text-caption text-ink-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-dry-3">
                <Minus size={12} strokeWidth={1.75} /> Drying
              </span>
              <span className="flex items-center gap-1 text-wet-3">
                Wetting <Minus size={12} strokeWidth={1.75} />
              </span>
            </div>
            {hoveredBin && (
              <div className="tnum mt-1 text-caption text-ink-1">
                {hoveredBin.latMin}° to {hoveredBin.latMax}°:{' '}
                <span
                  className={
                    hoveredBin.meanSlope >= 0 ? 'text-wet-3' : 'text-dry-3'
                  }
                >
                  {hoveredBin.meanSlope > 0 ? '+' : ''}
                  {hoveredBin.meanSlope.toFixed(2)} cm/yr
                </span>{' '}
                ({hoveredBin.count} basins)
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Global CSS for animated dashed stroke */}
      <style>{`
        @keyframes dipoleStream {
          to {
            stroke-dashoffset: -26;
          }
        }
        .animate-dipole-stream {
          animation: dipoleStream 1.6s linear infinite;
        }
      `}</style>
    </div>
  );
}
