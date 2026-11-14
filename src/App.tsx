import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Globe, { type BasinFeature, type ProbePointResult, type GlobeRef } from './components/Globe';
import AnalyticalMap2D from './components/AnalyticalMap2D';
import StratifiedBlockView from './components/StratifiedBlockView';
import AutonomousTriageSentinel from './components/AutonomousTriageSentinel';
import DualCompareInspector from './components/DualCompareInspector';
import CaseFilesModal, { DETECTIVE_CASES, type CaseFile } from './components/CaseFilesModal';
import OmniboxSearch, { type OmniboxCommand } from './components/OmniboxSearch';
import VirtualStationProbe from './components/VirtualStationProbe';
import { GIBS_LAYERS, type LayerKind } from './lib/gibs';
import ModeSwitcherHUD, { type AppMode } from './components/ModeSwitcherHUD';
import GISAnalysisPanel, { type AOISelection } from './components/GISAnalysisPanel';
import TrendDetectiveAIModal from './components/TrendDetectiveAIModal';
import type { MonitoredVariable } from './components/MultiSensorStack';
import type { EONETEvent } from './lib/eonet';
import { analyzeEarthTrend } from './lib/statistics';
import { hydrateBasinOnTheSpot } from './lib/liveDataHydrator';
import GuidedDetectiveTour, { type TourStepAction } from './components/GuidedDetectiveTour';
import StartupOnboardingOverlay from './components/StartupOnboardingOverlay';
import DetectiveIntakeWizard, { type DetectivePlan } from './components/DetectiveIntakeWizard';
import { X, Layers, ArrowRightLeft, PanelLeftOpen, PanelRightOpen, PanelRightClose } from 'lucide-react';
import TriangulationBadges from './components/TriangulationBadges';
import MultiSensorStack from './components/MultiSensorStack';
import EcologicalPhasePortrait from './components/EcologicalPhasePortrait';
import UltimateDashboard from './components/UltimateDashboard';
import AnswerPanel from './components/AnswerPanel';
import HeaderBar, { type ViewMode } from './components/shell/HeaderBar';
import type { MenuItem } from './components/shell/MenuButton';
import LeftPanel, { type SignificanceLevel } from './components/shell/LeftPanel';
import MapOptions from './components/shell/MapOptions';
import Timeline, { TIMELINE_LAST_OBSERVED, TIMELINE_MAX, TIMELINE_MIN } from './components/shell/Timeline';
import WelcomeCard from './components/shell/WelcomeCard';
import Disclosure from './components/shell/Disclosure';
import InspectorStats from './components/shell/InspectorStats';
import AboutDialog from './components/shell/AboutDialog';
import {
  FEATURED_PAIR,
  epochDeltaSupported,
  fmtSigned,
  isSignificant,
  regionPairs,
  trendSwatchClass,
} from './components/shell/shellUtils';

export const CASE_07_SEA_CO_PLUME = {
  id: 'case-07-sea-co-plume',
  badge: 'Case 7: SE Asia peat smoke, Oct 2026',
  title: 'SE Asia Peatland Dewatering & 5,500m CO Plume',
  subtitle: 'Indonesia (Sumatra & Kalimantan) → Malaysia & Singapore',
  isBreakingEvent: true,
  camera: {
    lat: 0.5,
    lon: 106.0,
    altitude: 1.85,
  },
  virtualProbeTarget: {
    lat: -2.21,
    lon: 113.92,
    label: 'Central Kalimantan Peat Dome (Sebangau / Mega Rice Complex)',
  },
  gibsLayer: 'AIRS_CO_500HPA' as LayerKind,
  epochDate: '2026-10-14',
  enableWindParticles: true,
  headlineMetrics: {
    plumeAltitude: '5,500 m (500 hPa)',
    peakWindow: 'Oct 13–15, 2026 (Aug 1 – Oct 19 Episode)',
    combustionMode: 'Subsurface Smoldering (O₂-Starved Peat)',
    primarySensor: 'NASA Aqua AIRS + POWER MERRA-2 + EONET v3',
  },
  forensicSummary:
    'When regional rainfall deficits and drainage canals lower the subsurface water table (ΔGWS) in tropical peatlands, buried organic carbon is exposed to oxygen-starved underground smoldering. Unlike flaming surface fires that emit CO₂, incomplete subterranean combustion releases massive Carbon Monoxide (CO) plumes lofted by deep convection to 5,500m altitude and advected across Indonesia, Malaysia, and Singapore.',
};

/** Extra search words for the Learn commands, so 'brief', 'wizard' or 'intake' find them. */
const LEARN_KEYWORDS: Record<string, string> = {
  wizard: 'brief wizard intake guide help onboarding question',
  tour: 'guide lessons walkthrough help',
  demo: 'guide video walkthrough help',
  featured: 'example pair dipole',
  interface: 'guide help layout onboarding',
  about: 'brief overview challenge nasa guide help',
};

/** Region pre-selected on first load when the URL names none. */
const DEFAULT_BASIN_ID = 'BASIN_CALIFORNIA_CV';

/** One key for the first-run welcome card; any of the legacy keys also counts as "already welcomed". */
const WELCOME_KEY = 'stratum4d_welcome_dismissed';
const LEGACY_ONBOARDING_KEYS = [
  'stratum4d_has_seen_onboarding_arrows',
  'stratum4d_has_seen_tour',
  'stratum4d_has_seen_wizard',
];

function rememberKey(key: string) {
  try {
    localStorage.setItem(key, 'true');
  } catch {
    // storage unavailable: nothing to remember
  }
}

interface Notice {
  id: string;
  text: string;
  action?: { label: string; run: () => void };
  /** Auto-dismiss after this many ms. */
  timeoutMs?: number;
}

export default function App() {
  // Clock (also drives the globe's sun position)
  const [now, setNow] = useState(() => Date.now());
  const [explodeAmount, setExplodeAmount] = useState(0.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 5 | 10>(1);
  const [showWind, setShowWind] = useState(true);
  const [showDipoles, setShowDipoles] = useState(true);
  const [activeLayer, setActiveLayer] = useState<LayerKind>('base');
  const [windSpeed, setWindSpeed] = useState<number>(1.0);
  const [selectedBasin, setSelectedBasin] = useState<BasinFeature | null>(null);
  const [hoveredBasin, setHoveredBasin] = useState<BasinFeature | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [summaryMeta, setSummaryMeta] = useState<any>(null);
  const [allBasins, setAllBasins] = useState<BasinFeature[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [cameraTarget, setCameraTarget] = useState<[number, number] | null>(null);
  const [highlightedBasinId, setHighlightedBasinId] = useState<string | null>(null);

  // URL deep-linked state
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialBasinId = useMemo(() => initialParams.get('basin'), [initialParams]);
  const initialCompare = useMemo(() => initialParams.get('compare'), [initialParams]);
  const [hasRestoredFromUrl, setHasRestoredFromUrl] = useState(false);
  // Camera target chosen while restoring from the URL; re-sent once the globe's camera exists (see below).
  const initialCameraTargetRef = useRef<[number, number] | null>(null);

  // View: '3D' globe | '2D' map | '4D' subsurface block
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const v = initialParams.get('view')?.toLowerCase();
    if (v === '2d' || v === 'map') return '2D';
    if (v === '4d' || v === 'block') return '4D';
    return '3D';
  });

  const [simulatedYear, setSimulatedYear] = useState<number>(() => {
    const y = parseInt(initialParams.get('year') || '2024', 10);
    return y >= TIMELINE_MIN && y <= TIMELINE_MAX ? y : TIMELINE_LAST_OBSERVED;
  });
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'high' | 'likely'>(() => {
    const f = initialParams.get('filter');
    return f === 'high' || f === 'likely' ? f : 'all';
  });
  const [isExtruded, setIsExtruded] = useState<boolean>(() => {
    return initialParams.get('extrude') === 'true' || initialParams.get('extrude') === '1';
  });
  const [significanceLock, setSignificanceLock] = useState<boolean>(() => {
    return (
      initialParams.get('significanceLock') === 'true' ||
      initialParams.get('siglock') === 'true' ||
      initialParams.get('significanceLock') === '1' ||
      initialParams.get('siglock') === '1'
    );
  });
  const [epochDeltaMode, setEpochDeltaMode] = useState(false);
  const [activeCaseStudy, setActiveCaseStudy] = useState<string | null>(() => initialParams.get('case'));
  // The subsurface view is just the '4D' view mode (one source of truth, so it round-trips through ?view=4d).
  // The mode we came from is remembered so closing the subsurface view returns to it.
  const prevViewRef = useRef<ViewMode>('3D');
  const showBlockView = viewMode === '4D';
  const openBlockView = useCallback((from?: ViewMode) => {
    setViewMode((cur) => {
      if (from) prevViewRef.current = from === '4D' ? '3D' : from;
      else if (cur !== '4D') prevViewRef.current = cur;
      return '4D';
    });
  }, []);
  const closeBlockView = useCallback(() => {
    setViewMode((cur) => (cur === '4D' ? prevViewRef.current : cur));
  }, []);
  const globeRef = useRef<GlobeRef | null>(null);

  // Exploration tools
  const [showOmniboxSearch, setShowOmniboxSearch] = useState(false);
  const [probeLocation, setProbeLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Modals
  const [showNarrativeModal, setShowNarrativeModal] = useState(false);
  const [showUltimateDashboard, setShowUltimateDashboard] = useState(false);
  const [showCaseFilesModal, setShowCaseFilesModal] = useState(false);
  const [compareData, setCompareData] = useState<{
    regionA: BasinFeature;
    regionB: BasinFeature;
    dipoleName?: string;
    mechanism?: string;
  } | null>(null);

  // Side panels (collapsible so narrow screens can reclaim space)
  const [showLeftDrawer, setShowLeftDrawer] = useState(true);
  const [showRightDock, setShowRightDock] = useState(true);
  const [showGuidedTour, setShowGuidedTour] = useState(false);
  const [tourAutoPlay, setTourAutoPlay] = useState(false);
  // The interface map is opened on demand only (Learn > Interface map); it no longer blocks the first load.
  const [showOnboardingGuide, setShowOnboardingGuide] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState<boolean>(() => {
    try {
      return [WELCOME_KEY, ...LEGACY_ONBOARDING_KEYS].some((k) => Boolean(localStorage.getItem(k)));
    } catch {
      return false;
    }
  });

  const dismissWelcome = useCallback(() => {
    setWelcomeDismissed(true);
    rememberKey(WELCOME_KEY);
  }, []);

  const handleCloseOnboardingGuide = useCallback(() => {
    setShowOnboardingGuide(false);
    rememberKey('stratum4d_has_seen_onboarding_arrows');
  }, []);
  const [stripSeasonality, setStripSeasonality] = useState(false);
  const [showIntakeWizard, setShowIntakeWizard] = useState(false);

  // Case Study 7
  const activateCase07 = useCallback(() => {
    setActiveCaseStudy(CASE_07_SEA_CO_PLUME.id);
    globeRef.current?.flyTo(
      CASE_07_SEA_CO_PLUME.camera.lat,
      CASE_07_SEA_CO_PLUME.camera.lon,
      CASE_07_SEA_CO_PLUME.camera.altitude
    );
    setActiveLayer('AIRS_CO_500HPA');
    setShowWind(true);
    setSelectedBasin(null);
    setProbeLocation({
      lat: CASE_07_SEA_CO_PLUME.virtualProbeTarget.lat,
      lon: CASE_07_SEA_CO_PLUME.virtualProbeTarget.lon,
    });
  }, []);

  // Analysis mode = right-panel tab (Inspect / Region select / Ask); the ?mode= URL param is unchanged.
  const [activeMode, setActiveMode] = useState<AppMode>(() => {
    const m = initialParams.get('mode');
    return m === 'GIS' || m === 'AGENT' || m === 'REMOTE_SENSING' ? m : 'REMOTE_SENSING';
  });
  const [selectedEarthClass, setSelectedEarthClass] = useState<string | null>(null);
  const [activeVariable, setActiveVariable] = useState<MonitoredVariable>('tws');
  // isStudentMode = the "Plain" side of the Plain | Technical toggle.
  const [isStudentMode, setIsStudentMode] = useState<boolean>(true);
  const [aoiSelection, setAoiSelection] = useState<AOISelection | null>(null);
  const [showDetectiveModal, setShowDetectiveModal] = useState(false);
  const [activeEonetEvent, setActiveEonetEvent] = useState<EONETEvent | null>(null);

  const handleChangeMode = useCallback((m: AppMode) => {
    setActiveMode(m);
    setShowRightDock(true);
    if (m === 'AGENT') setShowDetectiveModal(true);
  }, []);

  // Guided tour dispatcher. Every flag a step sets still drives the same state; selecting a region or
  // probing a point also brings the right panel back to the Inspect tab so the step's content is visible.
  const handleApplyTourStep = useCallback(
    (action: TourStepAction) => {
      if (action.activateCase07) {
        activateCase07();
        setActiveMode('REMOTE_SENSING');
        setShowRightDock(true);
        setHighlightedBasinId('BASIN_IOD_EAST');
        return;
      }

      if (action.viewMode) {
        setViewMode(action.viewMode);
      }

      if (action.activeVariable) {
        setActiveVariable(action.activeVariable);
      }

      if (action.isStudentMode !== undefined) {
        setIsStudentMode(action.isStudentMode);
      }

      if (action.openIntakeWizard !== undefined) {
        setShowIntakeWizard(action.openIntakeWizard);
      }

      if (action.stripSeasonality !== undefined) {
        setStripSeasonality(action.stripSeasonality);
      }

      if (action.probeCoordinate) {
        setSelectedBasin(null);
        setProbeLocation({ lat: action.probeCoordinate[0], lon: action.probeCoordinate[1] });
        setActiveMode('REMOTE_SENSING');
        setShowRightDock(true);
      }

      const found = allBasins.find((b) => b.properties.basin_id === action.basinId || b.id === action.basinId);
      if (found && !action.probeCoordinate) {
        setSelectedBasin(found);
        setHighlightedBasinId(found.properties.basin_id);
        setProbeLocation(null);
        setActiveMode('REMOTE_SENSING');
        setShowRightDock(true);
        if (action.openCompare && action.partnerBasinId) {
          const partner = allBasins.find(
            (b) => b.properties.basin_id === action.partnerBasinId || b.id === action.partnerBasinId
          );
          if (partner) {
            setCompareData({
              regionA: found,
              regionB: partner,
              dipoleName: found.properties.dipole_system || 'Teleconnection Coupling System',
              mechanism: found.properties.dipole_mechanism || undefined,
            });
          }
        } else {
          setCompareData(null);
        }
      }
      if (action.cameraTarget) {
        setCameraTarget(action.cameraTarget);
      }
      setIsExtruded(action.extrudeRelief);
      setSignificanceLock(action.significanceLock);
      setSimulatedYear(action.simulatedYear);
      if (action.openBlockView) openBlockView(action.viewMode ?? viewMode);
      else closeBlockView();
      if (action.toggleEpochDelta !== undefined) {
        setEpochDeltaMode(action.toggleEpochDelta);
      }
    },
    [allBasins, activateCase07, openBlockView, closeBlockView, viewMode]
  );

  // Intake wizard dispatcher
  const handleCompleteWizard = useCallback(
    (plan: DetectivePlan) => {
      setShowIntakeWizard(false);
      setActiveVariable(plan.variable);
      setActiveLayer(plan.layer);
      setSimulatedYear(plan.year);
      setActiveMode('REMOTE_SENSING');

      if (plan.activateCase07) {
        activateCase07();
        setShowRightDock(true);
        return;
      }

      const found = allBasins.find((b) => b.properties.basin_id === plan.basinId || b.id === plan.basinId);
      if (found) {
        setSelectedBasin(found);
        setHighlightedBasinId(found.properties.basin_id);
        setCameraTarget(found.properties.centroid);
        setProbeLocation(null);
        setShowRightDock(true);
      }
    },
    [allBasins, activateCase07]
  );

  // Load summary and basins GeoJSON
  useEffect(() => {
    fetch('/data/summary.json')
      .then((res) => res.json())
      .then((data) => setSummaryMeta(data))
      .catch((err) => console.error('Failed to load summary.json:', err));

    fetch('/data/basins.geojson')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.features) {
          const rawFeatures = data.features as BasinFeature[];
          const features = rawFeatures.map((f) => {
            const p = f.properties;
            const rawSsk = p.triangulation?.skeletal_storativity_s_sk ?? 1.0;
            const normalizedSsk = rawSsk > 0 && rawSsk < 0.05 ? +(rawSsk / 0.002).toFixed(2) : rawSsk;
            const updatedTriangulation = p.triangulation
              ? {
                  ...p.triangulation,
                  skeletal_storativity_s_sk: normalizedSsk,
                }
              : undefined;
            const ts = p.time_series;
            if (ts) {
              const deseas = ts.deseasonalized || ts.stl_trend || ts.raw || ts.swot_wse || [];
              const timestamps = ts.timestamps || ts.dates || [];
              const years = timestamps.map((d) => {
                const yr = parseInt(d.slice(0, 4), 10);
                const mo = parseInt(d.slice(5, 7), 10) || 1;
                return yr + (mo - 1) / 12;
              });
              if (deseas.length >= 3 && years.length >= 3) {
                const trend = analyzeEarthTrend(years, deseas);
                return {
                  ...f,
                  properties: {
                    ...p,
                    triangulation: updatedTriangulation,
                    n_star: p.n_star ?? trend.nStar,
                    rho_1_autocorr: p.rho_1_autocorr ?? trend.rho1,
                    breakpoint_year: p.breakpoint_year ?? trend.breakpointYear,
                    signal_to_noise_ratio: p.signal_to_noise_ratio ?? trend.snr,
                    time_of_emergence_year: p.time_of_emergence_year ?? trend.timeOfEmergence,
                  },
                };
              }
            }
            return {
              ...f,
              properties: {
                ...p,
                triangulation: updatedTriangulation,
              },
            };
          });
          setAllBasins(features);

          // Restore deep-linked basin or compare state; with neither, pre-select the default region.
          const compareParam = initialCompare;
          const basinParam = initialBasinId;
          let restored = false;

          if (compareParam) {
            const parts = compareParam.includes(',') ? compareParam.split(',') : [basinParam || '', compareParam];
            const [idA, idB] = parts;
            const bA = features.find((b) => b.properties.basin_id === idA);
            const bB = features.find((b) => b.properties.basin_id === idB);
            if (bA && bB) {
              setSelectedBasin(bA);
              setCompareData({
                regionA: bA,
                regionB: bB,
                dipoleName: `Teleconnection Analysis: ${bA.properties.basin_name} vs. ${bB.properties.basin_name}`,
                mechanism: 'Restored from deep-linked mission findings URL.',
              });
              restored = true;
            }
          } else if (basinParam) {
            const match = features.find((b) => b.properties.basin_id === basinParam);
            if (match) {
              setSelectedBasin(match);
              setCameraTarget(match.properties.centroid);
              initialCameraTargetRef.current = match.properties.centroid;
              restored = true;
            }
          }

          if (!restored && !basinParam) {
            const fallback = features.find((b) => b.properties.basin_id === DEFAULT_BASIN_ID) ?? features[0];
            if (fallback) {
              setSelectedBasin(fallback);
              setCameraTarget(fallback.properties.centroid);
              initialCameraTargetRef.current = fallback.properties.centroid;
            }
          }

          const caseParam = initialParams.get('case');
          const layerParam = initialParams.get('layer');
          if (caseParam === 'case-07-sea-co-plume') {
            setActiveCaseStudy(CASE_07_SEA_CO_PLUME.id);
            setActiveLayer('AIRS_CO_500HPA');
            setShowWind(true);
            setSelectedBasin(null);
            setProbeLocation({
              lat: CASE_07_SEA_CO_PLUME.virtualProbeTarget.lat,
              lon: CASE_07_SEA_CO_PLUME.virtualProbeTarget.lon,
            });
            setCameraTarget([CASE_07_SEA_CO_PLUME.camera.lon, CASE_07_SEA_CO_PLUME.camera.lat]);
          }
          if (
            layerParam &&
            (layerParam in GIBS_LAYERS || layerParam === 'AIRS_CO_500HPA' || layerParam === 'OMI_NO2' || layerParam === 'base')
          ) {
            setActiveLayer(layerParam as LayerKind);
          }
          const epochDeltaParam = initialParams.get('epochDelta');
          if (epochDeltaParam === 'true') {
            setEpochDeltaMode(true);
          }

          setHasRestoredFromUrl(true);
        }
      })
      .catch((err) => console.error('Failed to load basins.geojson:', err));
  }, [initialBasinId, initialCompare]);

  // The globe builds its camera only after its textures load, so a fly-to requested earlier is dropped.
  // Re-send the restored target once the globe reports its textures loaded, unless the user has moved on.
  useEffect(() => {
    const target = initialCameraTargetRef.current;
    if (!hasRestoredFromUrl || !target) return;
    let tries = 0;
    let resend: ReturnType<typeof setTimeout> | undefined;
    const poll = setInterval(() => {
      tries += 1;
      const ready = Boolean((window as unknown as { __STRATUM4D_BASE_LOADED__?: boolean }).__STRATUM4D_BASE_LOADED__);
      if (ready || tries > 60) {
        clearInterval(poll);
        resend = setTimeout(() => {
          setCameraTarget((cur) => (cur && cur[0] === target[0] && cur[1] === target[1] ? [target[0], target[1]] : cur));
        }, 500);
      }
    }, 250);
    return () => {
      clearInterval(poll);
      if (resend) clearTimeout(resend);
    };
  }, [hasRestoredFromUrl]);

  // Hydrate the selected basin with live NASA POWER data on the spot, and cache it
  useEffect(() => {
    if (!selectedBasin) return;
    let cancelled = false;
    hydrateBasinOnTheSpot(selectedBasin).then((hydrated) => {
      if (!cancelled && hydrated !== selectedBasin) {
        setSelectedBasin(hydrated);
        setAllBasins((prev) =>
          prev.map((b) => (b.properties.basin_id === hydrated.properties.basin_id ? hydrated : b))
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedBasin?.properties.basin_id]);

  // Sync state to URL search parameters
  useEffect(() => {
    if (!hasRestoredFromUrl) return;
    const url = new URL(window.location.href);

    if (selectedBasin) {
      url.searchParams.set('basin', selectedBasin.properties.basin_id);
    } else {
      url.searchParams.delete('basin');
    }

    if (compareData) {
      url.searchParams.set(
        'compare',
        `${compareData.regionA.properties.basin_id},${compareData.regionB.properties.basin_id}`
      );
    } else {
      url.searchParams.delete('compare');
    }

    if (activeMode !== 'REMOTE_SENSING') {
      url.searchParams.set('mode', activeMode);
    } else {
      url.searchParams.delete('mode');
    }

    if (simulatedYear !== TIMELINE_LAST_OBSERVED) {
      url.searchParams.set('year', String(simulatedYear));
    } else {
      url.searchParams.delete('year');
    }

    if (confidenceFilter !== 'all') {
      url.searchParams.set('filter', confidenceFilter);
    } else {
      url.searchParams.delete('filter');
    }

    if (isExtruded) {
      url.searchParams.set('extrude', 'true');
    } else {
      url.searchParams.delete('extrude');
    }

    if (significanceLock) {
      url.searchParams.set('significanceLock', 'true');
    } else {
      url.searchParams.delete('significanceLock');
      url.searchParams.delete('siglock');
    }

    if (activeCaseStudy) {
      url.searchParams.set('case', activeCaseStudy);
    } else {
      url.searchParams.delete('case');
    }

    if (epochDeltaMode) {
      url.searchParams.set('epochDelta', 'true');
    } else {
      url.searchParams.delete('epochDelta');
    }

    if (activeLayer !== 'base') {
      url.searchParams.set('layer', activeLayer);
    } else {
      url.searchParams.delete('layer');
    }

    if (viewMode === '2D') {
      url.searchParams.set('view', '2d');
    } else if (viewMode === '4D') {
      url.searchParams.set('view', '4d');
    } else {
      url.searchParams.delete('view');
    }

    window.history.replaceState(null, '', url.toString());
  }, [
    selectedBasin,
    compareData,
    activeMode,
    simulatedYear,
    confidenceFilter,
    isExtruded,
    significanceLock,
    hasRestoredFromUrl,
    activeCaseStudy,
    activeLayer,
    viewMode,
    epochDeltaMode,
  ]);

  // Ctrl+K / Cmd+K opens the omnibox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowOmniboxSearch((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Clock tick (UTC readout in the status strip, sun position on the globe)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Timeline playback (1x: 1200 ms per year, 5x: 280 ms, 10x: 140 ms)
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = playbackSpeed === 10 ? 140 : playbackSpeed === 5 ? 280 : 1200;
    const interval = setInterval(() => {
      setSimulatedYear((prev) => (prev >= TIMELINE_MAX ? TIMELINE_MIN : prev + 1));
    }, intervalMs);
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed]);

  // Auto-dismiss timed notices
  useEffect(() => {
    if (!notice?.timeoutMs) return;
    const t = setTimeout(() => setNotice((cur) => (cur?.id === notice.id ? null : cur)), notice.timeoutMs);
    return () => clearTimeout(t);
  }, [notice]);

  const utcDate = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  const utcClockStr = `${utcDate.getUTCFullYear()}-${pad(utcDate.getUTCMonth() + 1)}-${pad(utcDate.getUTCDate())} ${pad(utcDate.getUTCHours())}:${pad(utcDate.getUTCMinutes())} UTC`;

  // Regions still losing more than 1 cm/yr when the timeline is extended past the last observed year
  const forwardDrying = useMemo(
    () => allBasins.filter((b) => isSignificant(b) && b.properties.theil_sen_slope < -1.0).length,
    [allBasins]
  );

  const handleSelectCase = useCallback(
    (caseItem: CaseFile) => {
      setShowCaseFilesModal(false);

      if (caseItem.id === 'case-07-sea-co-plume') {
        activateCase07();
        return;
      }
      setActiveCaseStudy(caseItem.id);

      const bA = allBasins.find((b) => b.properties.basin_id === caseItem.regionAId);
      const bB = allBasins.find((b) => b.properties.basin_id === caseItem.regionBId);

      if (typeof caseItem.breakpointYear === 'number') {
        setSimulatedYear(caseItem.breakpointYear);
      }

      if (caseItem.caseType === 'dipole') {
        if (bA && bB) {
          const midLon = (bA.properties.centroid[0] + bB.properties.centroid[0]) / 2;
          const midLat = (bA.properties.centroid[1] + bB.properties.centroid[1]) / 2;
          setCameraTarget(caseItem.cameraCenter || [midLon, midLat]);
        } else {
          setCameraTarget(caseItem.cameraCenter);
        }
      } else if (bA) {
        setCameraTarget(bA.properties.centroid || caseItem.cameraCenter);
      } else {
        setCameraTarget(caseItem.cameraCenter);
      }

      if (caseItem.caseType === 'dipole') {
        if (bA && bB) {
          setSelectedBasin(bA);
          closeBlockView();
          setCompareData({
            regionA: bA,
            regionB: bB,
            dipoleName: caseItem.title,
            mechanism: caseItem.driverMechanism,
          });
        }
      } else if (caseItem.caseType === 'aquifer' || caseItem.caseType === 'cryosphere' || caseItem.caseType === 'peatland') {
        if (bA) {
          setSelectedBasin(bA);
          setCompareData(null);
          openBlockView();
        }
      }
    },
    [allBasins, activateCase07, openBlockView, closeBlockView]
  );

  const handleCompareCustomBasins = useCallback(
    (basinA: BasinFeature, basinB: BasinFeature, dipoleName?: string, mechanism?: string) => {
      setActiveCaseStudy(null);
      setSelectedBasin(basinA);
      setCompareData({
        regionA: basinA,
        regionB: basinB,
        dipoleName: dipoleName || `Custom Dipole: ${basinA.properties.basin_name} vs. ${basinB.properties.basin_name}`,
        mechanism: mechanism || 'Custom teleconnection evaluation evaluated at edge runtime.',
      });
    },
    []
  );

  // Leaving the case's own layer ends the case (Case 7 is the carbon monoxide layer plus its probe).
  const handleChangeLayer = useCallback((l: LayerKind) => {
    setActiveLayer(l);
    setActiveCaseStudy((cur) => (cur === CASE_07_SEA_CO_PLUME.id && l !== 'AIRS_CO_500HPA' ? null : cur));
  }, []);

  const selectBasin = useCallback((b: BasinFeature) => {
    setActiveCaseStudy(null);
    setSelectedBasin(b);
    setCameraTarget(b.properties.centroid);
    setProbeLocation(null);
    setActiveMode((m) => (m === 'AGENT' ? m : 'REMOTE_SENSING'));
    setShowRightDock(true);
  }, []);

  // Keyboard route for the globe: arrows rotate, plus and minus zoom (the mouse does the same by dragging and scrolling).
  const kbView = useRef({ lat: 20, lon: 0, alt: 2.5 });
  const handleGlobeKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    const v = kbView.current;
    if (e.key === 'ArrowLeft') v.lon -= 15;
    else if (e.key === 'ArrowRight') v.lon += 15;
    else if (e.key === 'ArrowUp') v.lat = Math.min(80, v.lat + 15);
    else if (e.key === 'ArrowDown') v.lat = Math.max(-80, v.lat - 15);
    else if (e.key === '+' || e.key === '=') v.alt = Math.max(1.3, v.alt * 0.8);
    else if (e.key === '-' || e.key === '_') v.alt = Math.min(4, v.alt * 1.25);
    else return;
    e.preventDefault();
    v.lon = ((v.lon + 540) % 360) - 180;
    globeRef.current?.flyTo(v.lat, v.lon, v.alt);
  };

  const handleShareFinding = () => {
    const done = (ok: boolean) =>
      setNotice({ id: `share-${Date.now()}`, text: ok ? 'Link copied' : 'Could not copy the link', timeoutMs: 2400 });
    try {
      navigator.clipboard.writeText(window.location.href).then(
        () => done(true),
        () => done(false)
      );
    } catch {
      done(false);
    }
  };

  // ---- Learn and Tools actions (each also listed as an omnibox command) ----
  const openWizard = () => {
    setShowIntakeWizard(true);
    rememberKey('stratum4d_has_seen_wizard');
    dismissWelcome();
  };
  const openTour = (autoPlay: boolean) => {
    setShowGuidedTour(true);
    setTourAutoPlay(autoPlay);
    rememberKey('stratum4d_has_seen_tour');
    dismissWelcome();
  };
  const openFeaturedComparison = () => {
    const a = allBasins.find((b) => b.properties.basin_id === FEATURED_PAIR[0]);
    const b = allBasins.find((x) => x.properties.basin_id === FEATURED_PAIR[1]);
    if (a && b) {
      handleCompareCustomBasins(a, b, a.properties.dipole_system || undefined, a.properties.dipole_mechanism);
    }
  };
  const [pairsKey, setPairsKey] = useState(0);
  const openPairs = () => {
    handleChangeMode('GIS');
    setPairsKey((k) => k + 1); // remounts the Paired regions disclosure, open
    setTimeout(() => document.querySelector<HTMLElement>('#paired-regions button')?.focus(), 60);
  };
  const showProbeHint = () =>
    setNotice({
      id: 'probe-hint',
      text: 'To probe any point, click a spot on the globe outside the regions, or type coordinates such as 2.1S, 60.0W in search.',
      action: { label: 'Open search', run: () => setShowOmniboxSearch(true) },
      timeoutMs: 8000,
    });
  const resetOnboarding = () => {
    try {
      [WELCOME_KEY, ...LEGACY_ONBOARDING_KEYS].forEach((k) => localStorage.removeItem(k));
    } catch {
      // storage unavailable
    }
    setWelcomeDismissed(false);
    setNotice({ id: `reset-${Date.now()}`, text: 'Onboarding reset. The welcome card is back.', timeoutMs: 3200 });
  };

  const handleChangeView = (v: ViewMode) => {
    if (v === '4D') {
      if (!selectedBasin && allBasins.length > 0) {
        setSelectedBasin(allBasins.find((b) => b.properties.basin_id === DEFAULT_BASIN_ID) ?? allBasins[0]);
      }
      openBlockView();
      return;
    }
    setViewMode(v);
  };

  const learnItems: MenuItem[] = [
    { id: 'wizard', label: 'Start with a question', hint: 'Three short steps to pick a region and a variable', onSelect: openWizard },
    { id: 'tour', label: 'Guided tour (12 lessons)', onSelect: () => openTour(false) },
    { id: 'demo', label: 'Watch the demo (90s)', hint: 'Plays the tour automatically', onSelect: () => openTour(true) },
    { id: 'featured', label: 'Featured pair', hint: 'California Central Valley and the Great Basin, both drying', onSelect: openFeaturedComparison },
    { id: 'interface', label: 'Interface map', hint: 'What each part of the screen does', onSelect: () => setShowOnboardingGuide(true) },
    { id: 'about', label: 'About this project', onSelect: () => setShowNarrativeModal(true) },
  ];
  const toolItems: MenuItem[] = [
    { id: 'cases', label: 'Case studies', hint: 'Seven curated investigations', onSelect: () => setShowCaseFilesModal(true) },
    { id: 'matrix', label: 'Compare all basins', hint: 'Every region in one table', onSelect: () => setShowUltimateDashboard(true) },
    { id: 'pairs', label: 'Compare paired regions', hint: 'Paired regions, side by side', onSelect: openPairs },
    { id: 'probe', label: 'Probe any point on Earth', hint: 'Click the map, or type coordinates in search', onSelect: showProbeHint },
    { id: 'reset', label: 'Reset onboarding', quiet: true, onSelect: resetOnboarding },
  ];

  const pairs = useMemo(() => regionPairs(allBasins), [allBasins]);

  const commands: OmniboxCommand[] = [
    ...learnItems.map((i) => ({
      id: `learn-${i.id}`,
      label: i.label,
      section: 'Learn',
      keywords: `${i.hint ?? ''} ${LEARN_KEYWORDS[i.id] ?? ''}`,
      run: i.onSelect,
    })),
    ...toolItems.map((i) => ({
      id: `tools-${i.id}`,
      label: i.label,
      section: 'Tools',
      keywords: `${i.hint ?? ''} ${i.id === 'matrix' ? 'matrix dashboard table' : ''} ${i.id === 'cases' ? 'case files' : ''} ${i.id === 'pairs' ? 'dipole pair opposite compare' : ''}`,
      run: i.onSelect,
    })),
    { id: 'view-3d', label: 'Show the 3D globe', section: 'View', keywords: 'globe 3d', run: () => handleChangeView('3D') },
    { id: 'view-2d', label: 'Show the 2D map', section: 'View', keywords: 'map flat 2d', run: () => handleChangeView('2D') },
    { id: 'view-4d', label: 'Show the subsurface view', section: 'View', keywords: '4d block underground voxel', run: () => handleChangeView('4D') },
    { id: 'tab-inspect', label: 'Inspect the selected region', section: 'Panel', keywords: 'inspect details statistics', run: () => handleChangeMode('REMOTE_SENSING') },
    { id: 'tab-gis', label: 'Region select (draw an area)', section: 'Panel', keywords: 'gis lasso area select', run: () => handleChangeMode('GIS') },
    { id: 'tab-ask', label: 'Ask the analyst', section: 'Panel', keywords: 'ai agent ask question', run: () => handleChangeMode('AGENT') },
    {
      id: 'mode-plain',
      label: isStudentMode ? 'Switch to technical labels' : 'Switch to plain labels',
      section: 'Panel',
      keywords: 'student geophysicist plain technical',
      run: () => setIsStudentMode((v) => !v),
    },
    { id: 'share', label: 'Copy a link to this view', section: 'Share', keywords: 'share url link', run: handleShareFinding },
    ...pairs.map((p) => ({
      id: `pair-${p.a.properties.basin_id}`,
      label: `Compare ${p.a.properties.basin_name} and ${p.b.properties.basin_name}`,
      section: 'Compare',
      keywords: p.name,
      run: () => handleCompareCustomBasins(p.a, p.b, p.name, p.mechanism),
    })),
  ];

  // Three-state significance control over the existing confidenceFilter + significanceLock state (and URL params)
  const significance: SignificanceLevel =
    confidenceFilter === 'high' ? 'strong' : confidenceFilter === 'likely' || significanceLock ? 'significant' : 'all';
  const handleChangeSignificance = (s: SignificanceLevel) => {
    if (s === 'all') {
      setConfidenceFilter('all');
      setSignificanceLock(false);
    } else if (s === 'significant') {
      setConfidenceFilter('likely');
      setSignificanceLock(true);
    } else {
      setConfidenceFilter('high');
      setSignificanceLock(true);
    }
  };

  const partner = selectedBasin?.properties.dipole_partner_id
    ? allBasins.find((b) => b.properties.basin_id === selectedBasin.properties.dipole_partner_id)
    : undefined;

  const period = summaryMeta?.temporal_range
    ? (summaryMeta.temporal_range as [string, string])
        .map((d) =>
          new Date(`${d.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString('en-GB', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })
        )
        .join(' to ')
    : '2002 to 2024';

  const rightTitle = selectedBasin
    ? selectedBasin.properties.basin_name
    : probeLocation
      ? 'Point probe'
      : 'No region selected';

  const openSubsurface = () => handleChangeView('4D');

  // One notification at a time: a notice (toast or hint) wins over a natural-event banner.
  const notification = notice
    ? { key: notice.id, text: notice.text, sub: undefined as string | undefined, curated: false, action: notice.action, onClose: () => setNotice(null) }
    : activeEonetEvent
      ? {
          key: `eonet-${activeEonetEvent.title}`,
          text: `Natural event: ${activeEonetEvent.title}`,
          sub: `${activeEonetEvent.curated ? 'Scenario event' : 'NASA EONET'}, ${activeEonetEvent.date}`,
          curated: !!activeEonetEvent.curated,
          action:
            activeEonetEvent.nearestBasinId || activeEonetEvent.hostBasinId || activeEonetEvent.coordinates
              ? {
                  label: allBasins.some(
                    (b) =>
                      b.properties.basin_id === activeEonetEvent.nearestBasinId ||
                      b.properties.basin_id === activeEonetEvent.hostBasinId
                  )
                    ? 'Inspect region'
                    : 'Probe this point',
                  run: () => {
                    const match =
                      allBasins.find((b) => b.properties.basin_id === activeEonetEvent.nearestBasinId) ||
                      allBasins.find((b) => b.properties.basin_id === activeEonetEvent.hostBasinId);
                    if (match) {
                      selectBasin(match);
                    } else {
                      setActiveCaseStudy(null);
                      setSelectedBasin(null);
                      setProbeLocation({
                        lat: activeEonetEvent.lat ?? activeEonetEvent.coordinates[1],
                        lon: activeEonetEvent.lon ?? activeEonetEvent.coordinates[0],
                      });
                    }
                    setActiveEonetEvent(null);
                  },
                }
              : undefined,
          onClose: () => setActiveEonetEvent(null),
        }
      : null;

  const activeCaseLabel =
    activeCaseStudy === CASE_07_SEA_CO_PLUME.id
      ? 'Case 7 active: SE Asia peat smoke'
      : (() => {
          const c = DETECTIVE_CASES.find((x) => x.id === activeCaseStudy);
          return c ? `${c.caseNumber} active: ${c.title}` : 'Case study active';
        })();

  const showHoverTooltip =
    hoveredBasin && hoverPos && hoveredBasin.properties.basin_id !== selectedBasin?.properties.basin_id;

  const regionsOverview = (
    <GISAnalysisPanel
      mode="REMOTE_SENSING"
      allBasins={allBasins}
      selectedEarthClass={selectedEarthClass}
      aoiSelection={aoiSelection}
      onClearAOI={() => setAoiSelection(null)}
      onFlyToBasin={selectBasin}
      onHoverBasin={(b) => setHighlightedBasinId(b ? b.properties.basin_id : null)}
    />
  );

  const trendScanner = (
    <AutonomousTriageSentinel
      className="w-full flex flex-col text-label"
      selectedBasin={selectedBasin}
      allBasins={allBasins}
      isStudentMode={isStudentMode}
      onSelectBasin={(b) => {
        setActiveCaseStudy(null);
        setSelectedBasin(b);
        setProbeLocation(null);
      }}
    />
  );

  return (
    <div className="flex flex-col w-screen h-screen bg-canvas text-ink-1 overflow-hidden font-sans">
      <a
        href="#region-search"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-2 focus:left-2 btn btn-primary"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('region-search')?.focus();
        }}
      >
        Skip to region list
      </a>
      <HeaderBar
        viewMode={viewMode}
        subsurfaceOpen={showBlockView}
        onChangeView={handleChangeView}
        onOpenSearch={() => setShowOmniboxSearch(true)}
        learnItems={learnItems}
        toolItems={toolItems}
        onShare={handleShareFinding}
      />

      <div className="flex-1 min-h-0 flex">
        {showLeftDrawer && (
          <LeftPanel
            allBasins={allBasins}
            selectedBasinId={selectedBasin?.properties.basin_id ?? null}
            onSelectBasin={selectBasin}
            activeLayer={activeLayer}
            onChangeLayer={handleChangeLayer}
            year={simulatedYear}
            significance={significance}
            onChangeSignificance={handleChangeSignificance}
            selectedEarthClass={selectedEarthClass}
            onSelectEarthClass={setSelectedEarthClass}
            searchFilter={searchFilter}
            onSearchFilter={setSearchFilter}
            viewMode={viewMode}
            mapVariableIsWater={activeVariable === 'tws'}
            onCollapse={() => setShowLeftDrawer(false)}
          />
        )}

        <main className="flex-1 min-w-0 flex flex-col" aria-label="Map">
          <div id="globe-container" className="relative flex-1 min-h-0 overflow-hidden bg-canvas">
            {activeCaseStudy && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 popover bg-surface-1 flex items-center gap-2 pl-3 pr-1 py-1">
                <span className="text-label text-ink-1">{activeCaseLabel}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm px-1.5"
                  aria-label="Close the active case study"
                  onClick={() => setActiveCaseStudy(null)}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            )}
            {viewMode === '2D' ? (
              <AnalyticalMap2D
                allBasins={allBasins}
                selectedBasin={selectedBasin}
                hoveredBasin={hoveredBasin}
                compareData={compareData}
                activeLayer={activeLayer}
                simulatedYear={simulatedYear}
                confidenceFilter={confidenceFilter}
                significanceLock={significanceLock}
                showWind={showWind}
                showDipoles={showDipoles}
                windSpeedScale={windSpeed}
                mode={activeMode}
                selectedEarthClass={selectedEarthClass}
                aoiSelection={aoiSelection}
                onSelectBasin={(b) => {
                  setSelectedBasin(b);
                  if (b) {
                    setProbeLocation(null);
                    setActiveCaseStudy(null);
                  }
                }}
                onHoverBasin={(b, x, y) => {
                  setHoveredBasin(b);
                  setHoverPos(x !== undefined && y !== undefined ? { x, y } : null);
                }}
                onSelectAOI={(aoi) => setAoiSelection(aoi)}
                onSelectEONETEvent={(ev) => {
                  setActiveEonetEvent(ev);
                  setCameraTarget(ev.coordinates);
                }}
                onToggleWind={() => setShowWind((prev) => !prev)}
                onToggleDipoles={() => setShowDipoles((prev) => !prev)}
                onCompareCustomBasins={(basinA, basinB) => handleCompareCustomBasins(basinA, basinB)}
              />
            ) : (
              <div
                id="globe-keyboard"
                className="absolute inset-0"
                tabIndex={0}
                role="group"
                aria-label="Globe. Arrow keys rotate, plus and minus zoom. The region list is the keyboard way to select a region."
                onFocus={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const c = selectedBasin?.properties.centroid;
                  if (c) kbView.current = { lat: c[1], lon: c[0], alt: kbView.current.alt };
                }}
                onKeyDown={handleGlobeKey}
              >
              <Globe
                ref={globeRef}
                timestamp={now}
                explodeAmount={explodeAmount}
                simulatedYear={simulatedYear}
                confidenceFilter={confidenceFilter}
                significanceLock={significanceLock}
                showWind={showWind}
                showDipoles={showDipoles}
                showStratifiedStack
                compareData={compareData}
                activeLayer={activeLayer}
                epochDeltaMode={epochDeltaMode}
                windSpeedScale={windSpeed}
                extrudeRelief={isExtruded}
                activeProbeCoordinate={probeLocation ? [probeLocation.lat, probeLocation.lon] : null}
                selectedBasinId={selectedBasin ? selectedBasin.properties.basin_id : highlightedBasinId}
                highlightedBasinId={highlightedBasinId}
                cameraTarget={cameraTarget}
                onSelectBasin={(b) => {
                  setSelectedBasin(b);
                  if (b) {
                    setProbeLocation(null);
                    setActiveCaseStudy(null);
                  }
                }}
                onHoverBasin={(b, x, y) => {
                  setHoveredBasin(b);
                  setHoverPos(x !== undefined && y !== undefined ? { x, y } : null);
                }}
                mode={activeMode}
                activeVariable={activeVariable}
                selectedEarthClass={selectedEarthClass}
                aoiSelection={aoiSelection}
                onSelectAOI={(aoi) => setAoiSelection(aoi)}
                onSelectEONETEvent={(ev) => {
                  setActiveEonetEvent(ev);
                  setCameraTarget(ev.coordinates);
                }}
                onProbePoint={(probe: ProbePointResult) => {
                  setActiveCaseStudy(null);
                  setSelectedBasin(null);
                  setProbeLocation({ lat: probe.lat, lon: probe.lon });
                  setActiveMode((m) => (m === 'AGENT' ? m : 'REMOTE_SENSING'));
                  setShowRightDock(true);
                }}
                onCompareCustomBasins={(basinA, basinB) => handleCompareCustomBasins(basinA, basinB)}
              />
              </div>
            )}

            {/* Top-left: reopen the left panel */}
            {!showLeftDrawer && (
              <button
                type="button"
                className="btn btn-secondary bg-surface-1 absolute top-3 left-3 z-20"
                onClick={() => setShowLeftDrawer(true)}
                aria-label="Show layers and regions panel"
              >
                <PanelLeftOpen size={16} aria-hidden="true" />
                <span>Layers</span>
              </button>
            )}

            {/* Top-right: map options, and reopen the right panel */}
            <div className="absolute top-3 right-3 z-20 flex items-start gap-2">
              <MapOptions
                extrudeRelief={isExtruded}
                onToggleRelief={() => setIsExtruded((v) => !v)}
                showWind={showWind}
                onToggleWind={() => setShowWind((v) => !v)}
                windSpeed={windSpeed}
                onChangeWindSpeed={setWindSpeed}
                showDipoles={showDipoles}
                onToggleDipoles={() => setShowDipoles((v) => !v)}
                epochDelta={epochDeltaMode}
                onToggleEpochDelta={() => setEpochDeltaMode((v) => !v)}
                hasOverlay={epochDeltaSupported(activeLayer)}
                layerSpacing={explodeAmount}
                onChangeLayerSpacing={setExplodeAmount}
                is2D={viewMode === '2D'}
              />
              {!showRightDock && (
                <button
                  type="button"
                  className="btn btn-secondary bg-surface-1"
                  onClick={() => setShowRightDock(true)}
                  aria-label="Show region details panel"
                >
                  <PanelRightOpen size={16} aria-hidden="true" />
                  <span>Details</span>
                </button>
              )}
            </div>

            {/* Single notification slot */}
            <div role="status" aria-live="polite" className="absolute top-16 left-1/2 -translate-x-1/2 z-20 w-max max-w-[min(560px,calc(100%-2rem))]">
              {notification && (
                <div key={notification.key} className="popover bg-surface-1 flex items-center gap-3 pl-4 pr-1.5 py-1.5">
                  <div className="min-w-0">
                    <div className="text-label text-ink-1">
                      {notification.text}
                      {notification.curated && <span className="tag tag-warn ml-2 align-middle">Curated scenario</span>}
                    </div>
                    {notification.sub && <div className="text-caption text-ink-3">{notification.sub}</div>}
                  </div>
                  {notification.action && (
                    <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={notification.action.run}>
                      {notification.action.label}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm px-1.5 shrink-0"
                    aria-label="Dismiss notification"
                    onClick={notification.onClose}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>

            {!welcomeDismissed && (
              <WelcomeCard
                onStartQuestion={openWizard}
                onWatchDemo={() => openTour(true)}
                onDismiss={dismissWelcome}
              />
            )}
          </div>

          <Timeline
            year={simulatedYear}
            onYearChange={setSimulatedYear}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying((v) => !v)}
            speed={playbackSpeed}
            onCycleSpeed={() => setPlaybackSpeed((prev) => (prev === 1 ? 5 : prev === 5 ? 10 : 1))}
            onReset={() => setSimulatedYear(TIMELINE_LAST_OBSERVED)}
          />

          <div className="shrink-0 flex flex-wrap items-center gap-x-5 gap-y-0.5 px-4 py-1.5 bg-canvas border-t border-line text-caption text-ink-3">
            <span>Observed: NASA GRACE and GRACE-FO (JPL mascons), {period}</span>
            {simulatedYear > TIMELINE_LAST_OBSERVED ? (
              <span className="text-warn">
                {simulatedYear}: straight-line extrapolation of the observed trends, for illustration only
                {forwardDrying > 0 && ` (${forwardDrying} significant regions are losing more than 1 cm/yr)`}
              </span>
            ) : (
              <span>
                Before {TIMELINE_LAST_OBSERVED}, the globe grows the single full-record trend from 2002; it is not
                year-by-year data. The 2D map does not change with the year.
              </span>
            )}
            <span className="ml-auto tnum">{utcClockStr}</span>
          </div>
        </main>

        {showRightDock && (
          <aside
            aria-label="Region details"
            className="w-[368px] 2xl:w-96 shrink-0 flex flex-col min-h-0 bg-surface-1 border-l border-line"
          >
            <div className="px-5 pt-4 flex flex-col gap-3 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <h2 className="m-0 text-title font-semibold text-ink-1 min-w-0 break-words">{rightTitle}</h2>
                <div className="flex items-center gap-1 shrink-0">
                  <div className="seg" role="group" aria-label="Label style">
                    <button
                      type="button"
                      className="seg-item h-6 px-2 text-caption"
                      aria-pressed={isStudentMode}
                      onClick={() => setIsStudentMode(true)}
                    >
                      Plain
                    </button>
                    <button
                      type="button"
                      className="seg-item h-6 px-2 text-caption"
                      aria-pressed={!isStudentMode}
                      onClick={() => setIsStudentMode(false)}
                    >
                      Technical
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm px-1.5"
                    aria-label="Hide region details panel"
                    title="Hide panel"
                    onClick={() => setShowRightDock(false)}
                  >
                    <PanelRightClose size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <ModeSwitcherHUD activeMode={activeMode} onChangeMode={handleChangeMode} />
            </div>

            <div
              id="right-panel-tabpanel"
              role="tabpanel"
              aria-labelledby={activeMode === 'GIS' ? 'tab-region-select' : activeMode === 'AGENT' ? 'tab-ask' : 'tab-inspect'}
              className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4"
            >
              {activeMode === 'REMOTE_SENSING' &&
                (selectedBasin ? (
                  <>
                    <AnswerPanel
                      basin={selectedBasin}
                      plain={isStudentMode}
                      onFlyTo={() => setCameraTarget(selectedBasin.properties.centroid)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button id="voxel-view-btn" type="button" className="btn btn-secondary btn-sm" onClick={openSubsurface}>
                        <Layers size={14} aria-hidden="true" />
                        Subsurface view
                      </button>
                      {partner && (
                        <button
                          id="dual-compare-btn"
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() =>
                            handleCompareCustomBasins(
                              selectedBasin,
                              partner,
                              selectedBasin.properties.dipole_system || undefined,
                              selectedBasin.properties.dipole_mechanism
                            )
                          }
                        >
                          <ArrowRightLeft size={14} aria-hidden="true" />
                          Compare with its pair
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col border-b border-line">
                      <Disclosure title="Statistics">
                        <InspectorStats basin={selectedBasin} plain={isStudentMode} />
                        <p className="m-0 text-caption text-ink-3">
                          The side-by-side comparison of the Theil-Sen and ordinary least-squares estimates is under
                          Other variables.
                        </p>
                      </Disclosure>
                      <Disclosure title="Evidence and cross-checks">
                        <TriangulationBadges basin={selectedBasin} isStudentMode={isStudentMode} />
                      </Disclosure>
                      <Disclosure title="Other variables">
                        <MultiSensorStack
                          basin={selectedBasin}
                          simulatedYear={simulatedYear}
                          activeVariable={activeVariable}
                          onVariableChange={setActiveVariable}
                          onSelectLayer={handleChangeLayer}
                          isStudentMode={isStudentMode}
                          stripSeasonality={stripSeasonality}
                          onStripSeasonalityChange={setStripSeasonality}
                        />
                        <EcologicalPhasePortrait basin={selectedBasin} />
                      </Disclosure>
                      <Disclosure title="Compare with another region">
                        {partner ? (
                          <p className="m-0 text-label text-ink-2">
                            {selectedBasin.properties.dipole_system ? `${selectedBasin.properties.dipole_system}: ` : ''}
                            studied together with {partner.properties.basin_name} (
                            <span className="tnum">{fmtSigned(partner.properties.theil_sen_slope)} cm/yr</span>).
                          </p>
                        ) : (
                          <p className="m-0 text-label text-ink-2">
                            Pick any other region to compare the two side by side.
                          </p>
                        )}
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor="pair-select" className="text-label font-medium text-ink-2">
                            Compare with
                          </label>
                          <select
                            id="pair-select"
                            className="field w-full"
                            defaultValue=""
                            onChange={(e) => {
                              const targetBasin = allBasins.find((b) => b.properties.basin_id === e.target.value);
                              if (targetBasin) {
                                handleCompareCustomBasins(
                                  selectedBasin,
                                  targetBasin,
                                  `Custom Pair: ${selectedBasin.properties.basin_name} vs. ${targetBasin.properties.basin_name}`
                                );
                                e.target.value = '';
                              }
                            }}
                          >
                            <option value="" disabled>
                              Choose a region
                            </option>
                            {allBasins
                              .filter((b) => b.properties.basin_id !== selectedBasin.properties.basin_id)
                              .map((b) => (
                                <option key={b.properties.basin_id} value={b.properties.basin_id}>
                                  {b.properties.basin_name} ({fmtSigned(b.properties.theil_sen_slope)} cm/yr)
                                </option>
                              ))}
                          </select>
                        </div>
                      </Disclosure>
                      <Disclosure title="Trend scanner">{trendScanner}</Disclosure>
                      <Disclosure title="All regions overview">{regionsOverview}</Disclosure>
                    </div>
                  </>
                ) : probeLocation ? (
                  <>
                    <div className="flex flex-col">
                      <VirtualStationProbe
                        lat={probeLocation.lat}
                        lon={probeLocation.lon}
                        allBasins={allBasins}
                        onInspectBasin={selectBasin}
                        onClose={() => setProbeLocation(null)}
                      />
                    </div>
                    <div className="flex flex-col border-b border-line">
                      <Disclosure title="Trend scanner">{trendScanner}</Disclosure>
                      <Disclosure title="All regions overview">{regionsOverview}</Disclosure>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="m-0 text-body text-ink-2">
                      Pick a region in the list or on the map to see what is changing there, by how much, and whether
                      the change is significant.
                    </p>
                    <div className="flex flex-col border-b border-line">
                      <Disclosure title="All regions overview" defaultOpen>
                        {regionsOverview}
                      </Disclosure>
                      <Disclosure title="Trend scanner">{trendScanner}</Disclosure>
                    </div>
                  </>
                ))}

              {activeMode === 'GIS' && (
                <>
                  <section aria-label="Draw an area" className="flex flex-col gap-2">
                    <h3 className="m-0 text-body font-semibold text-ink-1">Draw an area</h3>
                    <p className="m-0 text-caption text-ink-3">
                      Drag on the map to draw a box. The regions it touches are summarised here, with a live count.
                    </p>
                    <GISAnalysisPanel
                      mode="GIS"
                      allBasins={allBasins}
                      selectedEarthClass={selectedEarthClass}
                      aoiSelection={aoiSelection}
                      onClearAOI={() => setAoiSelection(null)}
                      onFlyToBasin={(b) => {
                        setActiveCaseStudy(null);
                        setSelectedBasin(b);
                        setCameraTarget(b.properties.centroid);
                        setProbeLocation(null);
                      }}
                      onHoverBasin={(b) => setHighlightedBasinId(b ? b.properties.basin_id : null)}
                    />
                  </section>
                  <div className="border-b border-line">
                    <Disclosure key={pairsKey} id="paired-regions" title="Paired regions" meta={`${pairs.length} pairs`} defaultOpen={pairsKey > 0}>
                      <p className="m-0 text-caption text-ink-3">
                        Regions studied together because their water trends may be linked. Opens a side-by-side
                        comparison. Only pairs whose trends have opposite signs are true see-saws.
                      </p>
                      <ul className="m-0 p-0 list-none flex flex-col gap-0.5">
                        {pairs.map((p) => {
                          const opposite = p.a.properties.theil_sen_slope * p.b.properties.theil_sen_slope < 0;
                          return (
                            <li key={`${p.a.properties.basin_id}-${p.b.properties.basin_id}`}>
                              <button
                                type="button"
                                className="w-full text-left px-2 py-1.5 rounded-md bg-transparent border-0 hover:bg-surface-2 cursor-pointer"
                                onClick={() => handleCompareCustomBasins(p.a, p.b, p.name, p.mechanism)}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-body text-ink-1">{p.name}</span>
                                  <span className="tag shrink-0">{opposite ? 'Opposite signs' : 'Same sign'}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 text-caption text-ink-3">
                                  {[p.a, p.b].map((b) => (
                                    <span key={b.properties.basin_id} className="inline-flex items-center gap-1.5 min-w-0">
                                      <span aria-hidden="true" className={`w-2 h-2 rounded-xs ${trendSwatchClass(b)}`} />
                                      <span className="truncate">{b.properties.basin_name}</span>
                                      <span className="tnum text-ink-2">{fmtSigned(b.properties.theil_sen_slope)}</span>
                                    </span>
                                  ))}
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </Disclosure>
                  </div>
                </>
              )}

              {activeMode === 'AGENT' && (
                <section aria-label="Ask the analyst" className="flex flex-col gap-3">
                  <p className="m-0 text-body text-ink-2">
                    Ask questions about{' '}
                    {selectedBasin ? selectedBasin.properties.basin_name : 'the selected region'}
                    {aoiSelection ? ' and the area you drew' : ''}. Answers come from a built-in template summary unless
                    an AI model is connected.
                  </p>
                  <div>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowDetectiveModal(true)}>
                      Open the analyst
                    </button>
                  </div>
                </section>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Hover tooltip */}
      {showHoverTooltip && (
        <div
          className="fixed pointer-events-none z-30 px-3 py-2 popover"
          style={{ left: hoverPos.x + 12, top: hoverPos.y - 12 }}
        >
          <div className="text-label font-medium text-ink-1">{hoveredBasin.properties.basin_name}</div>
          <div className="text-caption text-ink-2 tnum">
            {fmtSigned(hoveredBasin.properties.theil_sen_slope)} cm/yr ·{' '}
            {isSignificant(hoveredBasin) ? 'significant' : 'not significant'} (FDR q ={' '}
            {hoveredBasin.properties.p_value_fdr.toFixed(3)})
          </div>
        </div>
      )}

      <OmniboxSearch
        isOpen={showOmniboxSearch}
        onClose={() => setShowOmniboxSearch(false)}
        allBasins={allBasins}
        summaryMeta={summaryMeta}
        onSelectBasin={selectBasin}
        onSelectCase={handleSelectCase}
        onTriggerProbe={(lat, lon) => {
          setActiveCaseStudy(null);
          setSelectedBasin(null);
          setProbeLocation({ lat, lon });
          setActiveMode('REMOTE_SENSING');
          setShowRightDock(true);
        }}
        onFlyCamera={(lat, lon) => setCameraTarget([lon, lat])}
        commands={commands}
      />

      {/* Subsurface block view (full-screen) */}
      {showBlockView && (selectedBasin || (allBasins.length > 0 ? allBasins[0] : null)) && (
        <StratifiedBlockView
          basin={selectedBasin || allBasins[0]}
          simulatedYear={simulatedYear}
          onYearChange={(y) => setSimulatedYear(y)}
          isStudentMode={isStudentMode}
          onClose={closeBlockView}
        />
      )}

      {compareData && (
        <DualCompareInspector
          regionA={compareData.regionA}
          regionB={compareData.regionB}
          allBasins={allBasins}
          dipoleName={compareData.dipoleName}
          driverMechanism={compareData.mechanism}
          onChangeRegionA={(b) => setCompareData((prev) => (prev ? { ...prev, regionA: b } : null))}
          onChangeRegionB={(b) => setCompareData((prev) => (prev ? { ...prev, regionB: b } : null))}
          onSwapRegions={() =>
            setCompareData((prev) => (prev ? { ...prev, regionA: prev.regionB, regionB: prev.regionA } : null))
          }
          onClose={() => setCompareData(null)}
        />
      )}

      {showCaseFilesModal && (
        <CaseFilesModal
          allBasins={allBasins}
          onSelectCase={handleSelectCase}
          onClose={() => setShowCaseFilesModal(false)}
        />
      )}

      {showNarrativeModal && (
        <AboutDialog allBasins={allBasins} summaryMeta={summaryMeta} onClose={() => setShowNarrativeModal(false)} />
      )}

      <TrendDetectiveAIModal
        isOpen={showDetectiveModal}
        onClose={() => setShowDetectiveModal(false)}
        basin={selectedBasin}
        aoiData={
          aoiSelection
            ? {
                bounds: aoiSelection.bounds,
                areaKm2: aoiSelection.areaKm2,
                basins: aoiSelection.intersectingBasins,
              }
            : null
        }
        onSelectBasin={(b) => {
          setSelectedBasin(b);
          setCameraTarget(b.properties.centroid);
          setShowDetectiveModal(false);
        }}
        activeEonetEvents={activeEonetEvent}
        activeCaseStudy={activeCaseStudy}
        partnerName={
          allBasins.find((b) => b.properties.basin_id === (selectedBasin?.properties as { dipole_partner_id?: string } | undefined)?.dipole_partner_id)
            ?.properties.basin_name
        }
      />

      {showUltimateDashboard && (
        <UltimateDashboard
          allBasins={allBasins}
          summaryMeta={summaryMeta}
          onSelectBasin={(b) => {
            selectBasin(b);
            setShowUltimateDashboard(false);
          }}
          onOpenBlockView={(b) => {
            setSelectedBasin(b);
            openBlockView();
            setShowUltimateDashboard(false);
          }}
          onClose={() => setShowUltimateDashboard(false)}
        />
      )}

      {showGuidedTour && (
        <GuidedDetectiveTour
          isOpen={showGuidedTour}
          onApplyStep={handleApplyTourStep}
          initialAutoPlay={tourAutoPlay}
          onAutoPlayChange={setTourAutoPlay}
          currentAppState={{
            isExtruded,
            significanceLock,
            epochDeltaMode,
            compareData: Boolean(compareData),
            showBlockView,
            activeCaseStudy,
            activeLayer,
            simulatedYear,
            stripSeasonality,
            viewMode,
            activeVariable,
            showIntakeWizard,
            isStudentMode,
          }}
          onClose={() => {
            setShowGuidedTour(false);
            setTourAutoPlay(false);
            setHighlightedBasinId(null);
            rememberKey('stratum4d_has_seen_tour');
          }}
        />
      )}

      {showIntakeWizard && (
        <DetectiveIntakeWizard
          isOpen={showIntakeWizard}
          onClose={() => setShowIntakeWizard(false)}
          onComplete={handleCompleteWizard}
          allBasins={allBasins}
        />
      )}

      {/* Interface map, on demand from Learn */}
      <StartupOnboardingOverlay
        isOpen={showOnboardingGuide}
        onClose={handleCloseOnboardingGuide}
        onStartTour={() => openTour(false)}
        onStartAutoDemo={() => openTour(true)}
        onOpenIntakeWizard={openWizard}
      />
    </div>
  );
}
