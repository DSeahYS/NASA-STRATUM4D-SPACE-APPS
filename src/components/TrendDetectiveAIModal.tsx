import { useState, useMemo } from 'react';
import {
  X,
  Bot,
  Send,
  Check,
  Compass,
  Download,
  Loader2,
  BookOpen,
  ExternalLink,
} from 'lucide-react';
import { useModalDialog } from './shell/useModalDialog';
import type { BasinFeature } from './Globe';
import { fmtSigned } from './shell/shellUtils';
import { askPlanetaryTriage, CASE_07_LAYA_SYSTEM1_PAYLOAD, AI_LABEL_TEMPLATE, AI_LABEL_MODEL, getTriageLabel } from '../lib/openrouter';
import { gradeDipoleCorrelation } from '../lib/statistics';
import { getLiteratureForBasin, type ScientificPublication } from '../lib/scientificLiterature';

/** p-values as 0.015 or p < 0.001, never scientific notation. */
const fmtP = (p: number | null | undefined) => (typeof p !== 'number' ? 'n/a' : p < 0.001 ? '< 0.001' : p.toFixed(3));

export interface AOIData {
  bounds: [number, number, number, number];
  areaKm2: number;
  basins: BasinFeature[];
}

export interface TrendDetectiveAIModalProps {
  basin: BasinFeature | null;
  aoiData?: AOIData | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectBasin?: (basin: BasinFeature) => void;
  activeEonetEvents?: any;
  activeCaseStudy?: string | null;
  /** Display name of the selected basin's paired region, if it has one. */
  partnerName?: string;
}

interface ChatMessage {
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  /** For assistant messages: says whether an AI model or the fixed template wrote the text. */
  label?: string;
}

export default function TrendDetectiveAIModal({
  basin,
  aoiData,
  isOpen,
  onClose,
  onSelectBasin,
  activeEonetEvents,
  activeCaseStudy,
  partnerName,
}: TrendDetectiveAIModalProps) {
  const [query, setQuery] = useState('');
  const [copiedBriefing, setCopiedBriefing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [engineStatus, setEngineStatus] = useState<string>(AI_LABEL_TEMPLATE);
  const dialog = useModalDialog<HTMLDivElement>(onClose, isOpen);

  const activeTargetName = activeCaseStudy === 'case-07-sea-co-plume'
    ? 'SE Asia Peatland Dewatering & 5,500m CO Plume (Case 07)'
    : basin
    ? basin.properties.basin_name
    : aoiData
    ? `Custom Area of Interest (${aoiData.areaKm2.toLocaleString()} km²)`
    : 'Global Terrestrial Water System';

  // Grounding Peer-Reviewed Literature for Active Target
  const relevantLiterature: ScientificPublication[] = useMemo(() => {
    const targetId = activeCaseStudy === 'case-07-sea-co-plume'
      ? 'CASE_07_SEA_CO_PLUME'
      : basin?.properties.basin_id || null;
    const biome = basin?.properties.anomaly_class || basin?.properties.trend_category || null;
    return getLiteratureForBasin(targetId, biome);
  }, [activeCaseStudy, basin]);

  // Scientific metrics synthesis
  const investigationReport = useMemo(() => {
    if (activeCaseStudy === 'case-07-sea-co-plume') {
      const p7 = CASE_07_LAYA_SYSTEM1_PAYLOAD;
      return {
        target: 'SE Asia Peatland Dewatering & 5,500m CO Plume (Case 07)',
        targetId: 'CASE_07_SEA_CO_PLUME',
        continent: 'Equatorial Southeast Asia (Indonesia, Malaysia, Singapore)',
        areaKm2: 2450000,
        observedAnomaly: 'Illustrative scenario: carbon monoxide above 250 ppbv at 500 hPa (5,500 m); not measured by this app',
        ciRange: 'Scenario peak: 2026-10-13 to 2026-10-15',
        megalitersPerYear: 0,
        fdrQ: null as number | null,
        significance: 'Not statistically tested (illustrative scenario)',
        prewhitened: 'No statistical test applied',
        causalAttribution: p7.fourDetectiveAnswers.whatChanged,
        teleconnection: p7.fourDetectiveAnswers.where,
        satellites: p7.provenanceDOIs,
      };
    }

    if (basin) {
      const p = basin.properties;
      const slope = p.theil_sen_slope;
      const z = p.mann_kendall_z;
      const q = p.p_value_fdr;
      const annualM3 = Math.abs(slope) * 0.01 * (p.area_sqkm * 1e6);
      const megalitersPerYear = Math.round(annualM3 * 0.001);
      const isDepleted = slope < 0;

      const attribution =
        p.theil_sen_slope < -0.8 && p.triangulation?.irreversible_subsidence
          ? 'Possible explanation (hypothesis, not tested here): groundwater use exceeding recharge'
          : p.theil_sen_slope < -0.2
          ? 'Possible explanation (hypothesis, not tested here): reduced precipitation or higher evaporative demand'
          : p.theil_sen_slope > 0.4
          ? 'Possible explanation (hypothesis, not tested here): increased precipitation or recharge'
          : 'Near-flat trend: no clear drying or wetting in this record';

      return {
        target: p.basin_name,
        targetId: p.basin_id,
        continent: p.continent,
        areaKm2: p.area_sqkm,
        observedAnomaly: `${fmtSigned(slope)} cm/yr (${isDepleted ? 'storage falling' : 'storage rising'})`,
        ciRange: `95% CI ${fmtSigned(p.theil_sen_ci_low)} to ${fmtSigned(p.theil_sen_ci_high)} cm/yr`,
        megalitersPerYear,
        fdrQ: q as number | null,
        significance: `Mann-Kendall Z = ${fmtSigned(z)}, p* = ${fmtP(p.p_value_corrected ?? q)}, n* = ${p.n_star ?? 'n/a'} (${q < 0.05 ? 'significant at FDR q < 0.05' : 'not significant at FDR q < 0.05'})`,
        prewhitened: p.yue_pilon_prewhitened ? 'Yue-Pilon Trend-Preserving Pre-Whitened' : 'Standard Autocorrelation',
        causalAttribution: attribution,
        teleconnection: p.dipole_system
          ? `Listed pair: ${p.dipole_system}, with ${partnerName || 'a partner basin'}. ${
              typeof p.dipole_r === 'number'
                ? gradeDipoleCorrelation(p.dipole_r).sentence
                : 'No correlation is available to test it.'
            }`
          : 'No paired region is listed for this basin.',
        satellites: [
          'Observed (GRACE / GRACE-FO, JPL RL06.1M): water storage, doi:10.5067/TEMSC-3JC62',
          'Reanalysis (NASA POWER, MERRA-2): temperature, precipitation and root-zone soil moisture, doi:10.5067/0J5LP0MT95Q7',
          'Modelled proxy: surface water elevation (GRACE plus 0.05 times the precipitation anomaly; not SWOT)',
          'Modelled proxy: subsidence (Terzaghi model from the GRACE slope; not InSAR)',
          'Modelled proxy: NDVI (seasonal formula plus random noise; not MODIS)',
        ],
      };
    }

    if (aoiData) {
      const basinsCount = aoiData.basins.length;
      const totalSlope = aoiData.basins.reduce((acc, b) => acc + b.properties.theil_sen_slope, 0);
      const avgSlope = basinsCount ? totalSlope / basinsCount : 0;

      return {
        target: `User Custom AOI [${aoiData.bounds.map((v) => v.toFixed(2)).join(', ')}]`,
        targetId: 'AOI_CUSTOM',
        continent: 'Multi-Regional Custom Polygon',
        areaKm2: aoiData.areaKm2,
        observedAnomaly: `Mean catchment rate: ${fmtSigned(avgSlope)} cm/yr`,
        ciRange: `Intersects ${basinsCount} distinct hydrological catchments`,
        megalitersPerYear: Math.round(Math.abs(avgSlope) * 0.01 * (aoiData.areaKm2 * 1e6) * 0.001),
        fdrQ: null as number | null,
        significance: `${aoiData.basins.filter((b) => b.properties.significant).length} of ${basinsCount} basins have a significant trend (FDR q < 0.05)`,
        prewhitened: 'STL decomposition, basin by basin',
        causalAttribution: 'No single explanation: each basin has its own trend (hypotheses are not tested for the area as a whole)',
        teleconnection: 'No cross-basin teleconnection is tested for a custom area.',
        satellites: [
          'Suggested validation, not used in this analysis: SWOT surface water elevation (2023 onward)',
          'Suggested validation, not used in this analysis: Sentinel-1 and NISAR SAR land deformation',
          'Observed series used for every basin: GRACE / GRACE-FO (JPL RL06.1M)',
        ],
      };
    }

    return null;
  }, [basin, aoiData, activeCaseStudy, partnerName]);

  // Pass full statistical context to askPlanetaryTriage: breakpointYear, sensSlope, pValue, pCorrected, rho1, nStar, toeYear, driverR, driverAttributionPct, laggedDriver, activeEonetEvents
  const fullStatisticalContext = useMemo(() => {
    if (activeCaseStudy === 'case-07-sea-co-plume') {
      return {
        id: 'case-07-sea-co-plume',
        activeCaseStudy: 'case-07-sea-co-plume',
        basin_name: 'Central Kalimantan & Sumatra Peat Dome Complex',
        basin_id: 'case-07-sea-co-plume',
        continent: 'Southeast Asia',
        target: 'SE Asia Peatland Dewatering & 5,500m CO Plume',
        activeEonetEvents: activeEonetEvents || null,
      };
    }

    if (!basin) return null;
    const p = basin.properties;
    // No invented defaults: a missing statistic stays undefined and is reported as N/A.
    const pCorrected = p.p_value_corrected ?? p.p_value_fdr;
    const rho1 = p.rho_1_autocorr;
    const nStar = p.n_star;
    const toeYear = p.time_of_emergence_year ?? null;
    const driverR = p.driver_r;
    const driverAttributionPct = p.driver_r ? Math.round(Math.pow(p.driver_r, 2) * 100) : undefined;

    return {
      ...basin,
      properties: p,
      basin_name: p.basin_name,
      basin_id: p.basin_id,
      continent: p.continent,
      area_sqkm: p.area_sqkm,
      breakpointYear: p.breakpoint_year,
      sensSlope: p.theil_sen_slope,
      pValue: p.p_value_fdr ?? p.p_value_raw ?? 1.0,
      pCorrected,
      rho1,
      nStar,
      toeYear,
      driverR,
      driverAttributionPct,
      laggedDriver: p.optimal_driver
        ? `${p.optimal_driver} (lag=${p.driver_lag_months ?? 0}mo, r=${p.driver_r ?? 'n/a'})`
        : undefined,
      activeEonetEvents: activeEonetEvents || null,
    };
  }, [basin, activeEonetEvents, activeCaseStudy]);

  const handleSendMessage = async () => {
    if (!query.trim() || isLoading) return;
    const userText = query.trim();
    setQuery('');

    const newMessages: ChatMessage[] = [
      ...messages,
      { sender: 'user', text: userText, timestamp: new Date().toLocaleTimeString() },
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const triageTarget = fullStatisticalContext || basin || aoiData;
      const res = await askPlanetaryTriage(triageTarget, userText);
      setEngineStatus(getTriageLabel(res.isLive));
      setMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: res.text,
          timestamp: new Date().toLocaleTimeString(),
          label: getTriageLabel(res.isLive),
        },
      ]);
    } catch (err) {
      console.warn('AI Triage error:', err);
      setEngineStatus(AI_LABEL_TEMPLATE);
      if (activeCaseStudy === 'case-07-sea-co-plume') {
        const p7 = CASE_07_LAYA_SYSTEM1_PAYLOAD;
        setMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: `[Case 07, illustrative scenario]\n• Status: ${p7.triageStatus}\n• Mechanism: ${p7.fourDetectiveAnswers.whatChanged}\n• Location: ${p7.fourDetectiveAnswers.where}\n• Lofting: ${p7.fourDetectiveAnswers.howMuch}\n• Possible mitigation: ${p7.civilDefenseAction}`,
            timestamp: new Date().toLocaleTimeString(),
            label: AI_LABEL_TEMPLATE,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: `Summary for ${activeTargetName}:\n• Observed rate: ${investigationReport?.observedAnomaly || 'N/A'}\n• Possible explanation: ${investigationReport?.causalAttribution || 'N/A'}\n• Significance: ${investigationReport?.significance || 'N/A'}`,
            timestamp: new Date().toLocaleTimeString(),
            label: AI_LABEL_TEMPLATE,
          },
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportDetectiveDossier = () => {
    if (activeCaseStudy === 'case-07-sea-co-plume') {
      const p7 = CASE_07_LAYA_SYSTEM1_PAYLOAD;
      const md = `# STRATUM-4D PLANETARY DIGITAL TWIN · TREND DETECTIVE DOSSIER
**Investigation Target:** Case File #07: SE Asia Peatland Dewatering & 5,500m CO Plume
**Status:** ${p7.triageStatus}
**Event Window:** ${p7.eventWindow}
**Generated (UTC):** ${new Date().toISOString()}

---

### 1. WHAT CHANGED
${p7.fourDetectiveAnswers.whatChanged}

### 2. WHERE IS IT CHANGING
${p7.fourDetectiveAnswers.where}

### 3. HOW MUCH
${p7.fourDetectiveAnswers.howMuch}

### 4. IS IT SIGNIFICANT
${p7.fourDetectiveAnswers.isItSignificant}

### 5. POSSIBLE MITIGATION
${p7.civilDefenseAction}

### 6. DATA SOURCES & DOIS
${p7.provenanceDOIs.map((doi) => `- ${doi}`).join('\n')}

---
*NASA Space Apps Challenge 2026: Be An Earth System Trend Detective · Stratum-4D. Illustrative scenario; not a verified event.*`;

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'stratum-4d-detective-dossier-case-07-sea-co-plume.md');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      navigator.clipboard.writeText(md).then(() => {
        setCopiedBriefing(true);
        setTimeout(() => setCopiedBriefing(false), 2400);
      });
      return;
    }

    if (!investigationReport) return;
    const p = basin?.properties;

    const md = `# STRATUM-4D PLANETARY DIGITAL TWIN · TREND DETECTIVE DOSSIER
**Investigation Target:** ${investigationReport.target} (${investigationReport.targetId})
**Generated (UTC):** ${new Date().toISOString()}
**Text source:** ${engineStatus}

---

### 1. WHAT: OBSERVED CHANGE & POSSIBLE EXPLANATION
- **Possible explanation:** ${investigationReport.causalAttribution}
- **Observed Rate & Dynamic:** ${investigationReport.observedAnomaly}
- **Regime Shift (Pettitt Change-Point Test):** Breakpoint year ${p?.breakpoint_year ?? 'n/a'} (p = ${fmtP(p?.pettitt_p)})
- **Climatic Teleconnection Coupling:** ${investigationReport.teleconnection}
- **Coupled Driver:** ${p?.optimal_driver ? `${p.optimal_driver} (lag=${p.driver_lag_months ?? 0} months, r=${p.driver_r ?? 'n/a'})` : 'not available'}

### 2. WHERE: GEODETIC SPATIAL BOUNDARIES
- **Hydrological Catchment:** ${investigationReport.target}
- **Continent / Region:** ${investigationReport.continent}
- **Drainage Footprint:** ${investigationReport.areaKm2.toLocaleString()} km²
- **Centroid Coordinates (WGS84 Lon, Lat):** [${p?.centroid?.[0] ?? 'N/A'}°, ${p?.centroid?.[1] ?? 'N/A'}°]
- **Bounding Box [MinLon, MinLat, MaxLon, MaxLat]:** [${p?.bbox?.join(', ') ?? 'N/A'}]

### 3. HOW MUCH: RATE & UNCERTAINTY
- **Theil-Sen Robust Median Rate (β_Sen):** ${investigationReport.observedAnomaly}
- **95% Sen's Non-Parametric Confidence Interval:** ${investigationReport.ciRange}
- **Volume if the rate applied evenly over the basin:** ~${investigationReport.megalitersPerYear.toLocaleString()} megaliters per year
- **Same, in mass:** ~${(Math.abs(p?.theil_sen_slope ?? 0) * (investigationReport.areaKm2) * 1e-5).toFixed(2)} Gt/yr
- **Signal-to-Noise Ratio (SNR):** ${p?.signal_to_noise_ratio ?? 'n/a'}

### 4. IS IT SIGNIFICANT: HYPOTHESIS TESTING
- **Test Metric:** ${investigationReport.significance}
- **Pre-Whitening:** ${investigationReport.prewhitened}
- **Lag-1 Autocorrelation (ρ₁):** ${p?.rho_1_autocorr ?? 'n/a'}
- **Effective Sample Size (n*):** n* = ${p?.n_star ?? 'n/a'} (effective sample size after allowing for serial correlation)
- **Benjamini-Hochberg False Discovery Rate:** q = ${fmtP(p?.p_value_fdr)} (Benjamini-Hochberg across all 30 basins, α = 0.05)
- **Hypothesis Verdict:** ${(p?.p_value_fdr ?? 1) < 0.05 ? 'Null hypothesis of no trend rejected (FDR q < 0.05)' : 'Not significant: the data cannot rule out no trend'}
- **Time of Emergence (ToE):** ${p?.time_of_emergence_year ?? 'not available'} (year the signal-to-noise ratio first exceeds 2).

### 5. DATA SOURCES: OBSERVED, REANALYSIS AND MODELLED SERIES
- **Observed (GRACE / GRACE-FO, JPL RL06.1M):** water storage, doi:10.5067/TEMSC-3JC62
- **Reanalysis (NASA POWER, MERRA-2):** temperature, precipitation and root-zone soil moisture, doi:10.5067/0J5LP0MT95Q7
- **Modelled proxy, surface water elevation:** GRACE plus 0.05 times the precipitation anomaly (not SWOT)
- **Modelled proxy, subsidence:** Terzaghi model from the GRACE slope (not InSAR)
- **Modelled proxy, NDVI:** seasonal formula plus random noise (not MODIS)
- **NASA Earth Observatory Natural Event Tracker (EONET v3):** https://eonet.gsfc.nasa.gov/api/v3/events (event markers only)

### 6. SCIENTIFIC LITERATURE FOR THIS BIOME
${relevantLiterature.map((pub) => `- **${pub.authors.split(',')[0]} et al. (${pub.year})** "${pub.title}", *${pub.journal}*, doi:[${pub.doi}](${pub.url})\n  - *Finding:* ${pub.keyFinding}`).join('\n')}

---
*NASA Space Apps Challenge 2026: Be An Earth System Trend Detective · Stratum-4D. Generated from the shipped statistics; check it against the data.*`;

    // Download file
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `stratum-4d-detective-dossier-${investigationReport.targetId || 'basin'}.md`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Also copy to clipboard
    navigator.clipboard.writeText(md).then(() => {
      setCopiedBriefing(true);
      setTimeout(() => setCopiedBriefing(false), 2400);
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <div
        {...dialog.props}
        aria-labelledby="ask-analyst-title"
        onClick={(e) => e.stopPropagation()}
        className="popover w-full max-w-5xl flex flex-col max-h-[90vh] overflow-hidden outline-none"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="ask-analyst-title" className="text-title text-ink-1 font-semibold">
                Ask the analyst
              </h2>
              <span className="tag tag-warn">Hypotheses, not proof</span>
              <span className="tag">{engineStatus}</span>
            </div>
            <p className="text-label text-ink-2 mt-1">
              Answers what is changing, where, how much and whether it is significant, from the statistics shipped with the app.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportDetectiveDossier}
              className="btn btn-secondary btn-sm"
              title="Download and copy a Markdown dossier covering what, where, how much and significance, with data sources and DOIs"
            >
              {copiedBriefing ? <Check size={14} strokeWidth={1.75} /> : <Download size={14} strokeWidth={1.75} />}
              <span>{copiedBriefing ? 'Dossier downloaded' : 'Export dossier (.md)'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the analyst"
              className="btn btn-ghost btn-sm w-7 px-0"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Target line */}
        <div className="px-5 py-2 border-b border-line bg-surface-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-label">
          <p className="text-ink-2">
            Investigating: <strong className="text-ink-1 font-medium">{activeTargetName}</strong>
          </p>
          <p className="text-caption text-ink-3">Method: Theil-Sen slope, Mann-Kendall test</p>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 flex flex-col lg:flex-row bg-surface-1">
          {/* Left: dossier */}
          {investigationReport ? (
            <div className="flex-1 min-w-0 px-5 flex flex-col">
              <section aria-labelledby="ask-s1" className="py-4 flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="ask-s1" className="text-body font-semibold text-ink-1">1. Observed change and rate</h3>
                  <span className="text-caption text-ink-3">GRACE / GRACE-FO mascon</span>
                </div>
                <p className="text-body text-ink-1 tnum">
                  {investigationReport.observedAnomaly}
                  <span className="text-label text-ink-2"> ({investigationReport.ciRange})</span>
                </p>
                {investigationReport.targetId !== 'CASE_07_SEA_CO_PLUME' && (
                  <p className="text-label text-ink-2">
                    Volume if the rate applied evenly over the area: about <strong className="text-ink-1 font-medium tnum">{investigationReport.megalitersPerYear.toLocaleString()}</strong> megaliters per year across <span className="tnum">{investigationReport.areaKm2.toLocaleString()}</span> km².
                  </p>
                )}
                {aoiData && aoiData.basins.length > 0 && onSelectBasin && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {aoiData.basins.slice(0, 8).map((b) => (
                      <button
                        type="button"
                        key={b.properties.basin_id}
                        onClick={() => {
                          onSelectBasin(b);
                          onClose();
                        }}
                        className="chip"
                        title={`Inspect ${b.properties.basin_name}`}
                      >
                        {b.properties.basin_name}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section aria-labelledby="ask-s2" className="py-4 border-t border-line flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="ask-s2" className="text-body font-semibold text-ink-1">2. Significance test</h3>
                  <span className="text-caption text-ink-3 tnum">
                    {investigationReport.fdrQ === null
                      ? 'Not tested'
                      : investigationReport.fdrQ < 0.05
                      ? 'q < 0.05 (FDR)'
                      : 'q ≥ 0.05 (FDR)'}
                  </span>
                </div>
                <p className="text-label text-ink-1 tnum">{investigationReport.significance}</p>
                <p className="text-caption text-ink-3">
                  Method: {investigationReport.prewhitened}, with Hamed-Rao variance inflation Var*(S) where a test was run.
                </p>
              </section>

              <section aria-labelledby="ask-s3" className="py-4 border-t border-line flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="ask-s3" className="text-body font-semibold text-ink-1">3. Possible explanation (hypothesis)</h3>
                  <span className="tag tag-warn">Not tested</span>
                </div>
                <p className="text-label text-ink-1">{investigationReport.causalAttribution}</p>
                <p className="text-caption text-ink-3">
                  Suggested by the size of the trend and by modelled subsidence and evaporative-deficit indicators. None of these tests a cause.
                </p>
              </section>

              <section aria-labelledby="ask-s4" className="py-4 border-t border-line flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="ask-s4" className="text-body font-semibold text-ink-1">4. Possible teleconnection</h3>
                  <span className="text-caption text-ink-3">ENSO MEI / IOD</span>
                </div>
                <p className="text-label text-ink-1">{investigationReport.teleconnection}</p>
              </section>

              <section aria-labelledby="ask-s5" className="py-4 border-t border-line flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="ask-s5" className="text-body font-semibold text-ink-1">5. Data sources and checks</h3>
                  <span className="text-caption text-ink-3">Provenance</span>
                </div>
                <ul className="text-label text-ink-2 flex flex-col gap-1 list-disc pl-4">
                  {investigationReport.satellites.map((s, idx) => (
                    <li key={idx}>{s}</li>
                  ))}
                </ul>
              </section>

              <section aria-labelledby="ask-s6" className="py-4 border-t border-line flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 id="ask-s6" className="text-body font-semibold text-ink-1 flex items-center gap-1.5">
                    <BookOpen size={14} strokeWidth={1.75} className="text-ink-2" />
                    6. Scientific literature for this biome
                  </h3>
                  <span className="text-caption text-ink-3">Peer-reviewed</span>
                </div>
                <p className="text-caption text-ink-3">
                  Published literature and NASA datasets relevant to this biome (background reading; the app does not test these explanations).
                </p>

                <ul className="flex flex-col">
                  {relevantLiterature.map((pub) => (
                    <li key={pub.id} className="py-3 border-t border-line first:border-t-0 flex flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="text-label font-medium text-ink-1">{pub.title}</h4>
                          <p className="text-caption text-ink-2 mt-0.5">
                            {pub.authors.split(',')[0]} et al. (<span className="tnum">{pub.year}</span>) &middot;{' '}
                            <span className="italic">{pub.journal}</span>
                          </p>
                        </div>
                        <a
                          href={pub.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 min-h-6 text-caption text-accent hover:underline shrink-0 font-mono"
                          title="Open the publication via its DOI link"
                        >
                          <span>doi:{pub.doi}</span>
                          <ExternalLink size={12} strokeWidth={1.75} />
                        </a>
                      </div>
                      <p className="text-label text-ink-2">
                        <span className="text-ink-1 font-medium">Key finding: </span>
                        {pub.keyFinding}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="tag">{pub.category}</span>
                        {pub.instruments.map((inst, i) => (
                          <span key={i} className="tag">{inst}</span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          ) : (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
              <Compass size={28} strokeWidth={1.5} className="text-ink-3 mb-2" />
              <p className="text-body font-semibold text-ink-1">No region selected</p>
              <p className="text-label text-ink-2 max-w-sm mt-1">
                Select a region on the map, search for a place, or draw an area to generate a hypothesis dossier.
              </p>
            </div>
          )}

          {/* Right: chat */}
          <div className="w-full lg:w-96 shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-line bg-surface-1">
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <h3 className="text-body font-semibold text-ink-1 flex items-center gap-1.5">
                <Bot size={14} strokeWidth={1.75} className="text-ink-2" /> Ask about this region
              </h3>
              <span className="text-caption text-ink-3">{engineStatus === AI_LABEL_MODEL ? 'AI model' : 'Template'}</span>
            </div>

            {/* Messages */}
            <div
              className="flex-1 px-4 py-3 overflow-y-auto flex flex-col gap-3 min-h-40 max-h-72"
              role="log"
              aria-live="polite"
              aria-label="Conversation"
            >
              <p className="text-label text-ink-2">
                This is the <strong className="text-ink-1 font-medium">Trend Detective assistant</strong>. Ask about the statistics for <strong className="text-ink-1 font-medium">{activeTargetName}</strong>. With an OpenRouter key set, an AI model answers; without one, a fixed template filled from the statistics does. Each answer is labelled.
              </p>

              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`px-3 py-2 rounded-md text-label ${
                    m.sender === 'user'
                      ? 'bg-surface-2 border border-line-strong text-ink-1 self-end max-w-[85%]'
                      : 'border border-line text-ink-1 self-start max-w-[92%]'
                  }`}
                >
                  <div className="text-caption text-ink-3 mb-0.5">{m.sender === 'user' ? 'You' : 'Trend Detective'} · <span className="tnum">{m.timestamp}</span></div>
                  {m.sender === 'assistant' && m.label && (
                    <div className="text-caption text-ink-2 font-medium mb-1">{m.label}</div>
                  )}
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              ))}
            </div>

            {/* Quick prompts */}
            <div className="px-3 py-2 border-t border-line flex flex-wrap gap-2">
              <button type="button" onClick={() => setQuery('Is this drying driven by rainfall or irrigation?')} className="chip">
                Rainfall or irrigation?
              </button>
              <button type="button" onClick={() => setQuery('How significant is this trend?')} className="chip">
                How significant?
              </button>
              <button type="button" onClick={() => setQuery('Which series here are observed and which are modelled?')} className="chip">
                Observed or modelled?
              </button>
            </div>

            {/* Input */}
            <div className="p-3 border-t border-line flex items-center gap-2">
              <input
                type="text"
                aria-label="Ask a question about the statistics"
                placeholder="Ask a question about the statistics..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                className="field flex-1 min-w-0"
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={isLoading}
                aria-label={isLoading ? 'Sending' : 'Send question'}
                className="btn btn-primary w-9 px-0"
              >
                {isLoading ? <Loader2 size={16} strokeWidth={1.75} className="animate-spin" /> : <Send size={16} strokeWidth={1.75} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
