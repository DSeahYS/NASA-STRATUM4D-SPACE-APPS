import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Cpu,
  X,
  Play,
  Pause,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Send,
  RefreshCw,
  Copy,
  Check,
  Flame,
  Filter,
  ShieldAlert,
} from 'lucide-react';
import { useModalDialog } from './shell/useModalDialog';
import { askPlanetaryTriage, FREE_MODELS, AI_LABEL_TEMPLATE, getTriageLabel } from '../lib/openrouter';
import { fetchActiveEONETEvents, enrichEonetEvents, type EONETEvent } from '../lib/eonet';
import type { BasinFeature } from './Globe';

interface AutonomousTriageSentinelProps {
  selectedBasin: BasinFeature | null;
  allBasins: BasinFeature[];
  onSelectBasin: (basin: BasinFeature) => void;
  className?: string;
  eonetEvents?: EONETEvent[];
  isStudentMode?: boolean;
}

interface TriageLogEntry {
  id: string;
  timestamp: string;
  basinId: string;
  basinName: string;
  wseZ: number;
  cov: number;
  decisionHead: string;
  probability: number;
  routedToSystem2: boolean;
  system2Status?: 'PENDING' | 'SUMMARISED' | 'EQUILIBRIUM';
  pValue: number;
  theilSenSlope: number;
  isNoise: boolean;
}

// No invented sample rows: the feed is filled from the shipped basin statistics (see the scan effect below).
const INITIAL_LOGS: TriageLogEntry[] = [];

// One clock format for every log entry: HH:MM:SS, 24-hour, UTC
function formatClock(): string {
  return new Date().toISOString().slice(11, 19);
}

// Heuristic screening score (0 to 1) from the Mann-Kendall Z. It is not a probability.
function screeningScore(z: number, isNoise: boolean): number {
  return isNoise
    ? Math.max(0.08, 0.15 + Math.abs(z) * 0.02)
    : Math.min(0.99, 0.75 + Math.abs(z) * 0.05);
}

// Tab count text: empty counts are hidden; counts are partial while the replay runs
function countLabel(n: number, partial: boolean, always: boolean): string {
  if (n === 0 && !always) return '';
  return ` (${n}${partial ? ' so far' : ''})`;
}

export default function AutonomousTriageSentinel({
  selectedBasin,
  allBasins,
  onSelectBasin,
  className,
  eonetEvents: externalEonetEvents,
  isStudentMode = false,
}: AutonomousTriageSentinelProps) {
  const [isDeepInferenceOpen, setIsDeepInferenceOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(true);
  const [logs, setLogs] = useState<TriageLogEntry[]>(INITIAL_LOGS);
  const [activeTab, setActiveTab] = useState<'active' | 'noise' | 'compound'>('active');
  const [rawEonetEvents, setRawEonetEvents] = useState<EONETEvent[]>([]);
  const [activeInferenceLog, setActiveInferenceLog] = useState<TriageLogEntry | null>(null);
  const [system2Response, setSystem2Response] = useState<string>('');
  const [isInferring, setIsInferring] = useState(false);
  const [modelUsed, setModelUsed] = useState<string>(FREE_MODELS[0]);
  const [responseLabel, setResponseLabel] = useState<string>(AI_LABEL_TEMPLATE);
  const [responseIsLive, setResponseIsLive] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load and enrich active EONET events for compound hazard detection
  useEffect(() => {
    if (externalEonetEvents && externalEonetEvents.length > 0) return;
    let active = true;
    fetchActiveEONETEvents().then((evs) => {
      if (active) {
        const enriched = enrichEonetEvents(evs, allBasins);
        setRawEonetEvents(enriched);
      }
    });
    return () => {
      active = false;
    };
  }, [externalEonetEvents, allBasins]);

  const activeEonetEvents = (externalEonetEvents && externalEonetEvents.length > 0)
    ? externalEonetEvents
    : rawEonetEvents;

  // Event overlap: an EONET wildfire or drought event inside a basin with FDR q < 0.05 and a negative slope
  const compoundAlerts = useMemo(() => {
    if (!allBasins.length || !activeEonetEvents.length) return [];
    const alerts: Array<{
      event: EONETEvent;
      basin: BasinFeature;
      pVal: number;
      slope: number;
      zScore: number;
    }> = [];

    for (const ev of activeEonetEvents) {
      if (ev.category !== 'wildfires' && ev.category !== 'drought') continue;
      const targetId = ev.hostBasinId || ev.nearestBasinId;
      const hostBasin = allBasins.find((b) => b.properties.basin_id === targetId);
      if (!hostBasin) continue;

      const p = hostBasin.properties;
      const pVal = p.p_value_fdr ?? p.p_value_raw ?? (p.significant ? 0.0008 : 0.42);
      const slope = p.theil_sen_slope ?? 0.0;

      // Condition: p < 0.05 and beta < 0
      if (pVal < 0.05 && slope < 0) {
        alerts.push({
          event: ev,
          basin: hostBasin,
          pVal,
          slope,
          zScore: p.mann_kendall_z ?? -3.5,
        });
      }
    }
    return alerts;
  }, [allBasins, activeEonetEvents]);

  const scanIndexRef = useRef(0);

  // Screening replay: steps through the shipped basin statistics one basin at a time (not live monitoring)
  useEffect(() => {
    if (!isStreaming || allBasins.length === 0) return;

    const scanNext = () => {
      const scanIndex = scanIndexRef.current % allBasins.length;
      scanIndexRef.current = scanIndex + 1;
      const scannedBasin = allBasins[scanIndex];
      if (!scannedBasin) return;

      const p = scannedBasin.properties;
      const z = p.mann_kendall_z || 0;
      const pVal = p.p_value_fdr ?? (Math.abs(z) > 1.96 ? 0.005 : 0.42);
      const slope = p.theil_sen_slope ?? 0.0;
      const isNoise = pVal >= 0.05;
      const isSignificant = !isNoise;
      const prob = screeningScore(z, !isSignificant);

      const decisionHead =
        isNoise
          ? 'not significant'
          : slope < 0
          ? 'significant drying'
          : 'significant wetting';

      const newEntry: TriageLogEntry = {
        id: `log-${Date.now()}-${scanIndex}`,
        timestamp: formatClock(),
        basinId: p.basin_id,
        basinName: p.basin_name,
        wseZ: parseFloat(z.toFixed(2)),
        cov: parseFloat((1.0 + Math.abs(z) * 0.15).toFixed(2)),
        decisionHead,
        probability: parseFloat(prob.toFixed(3)),
        routedToSystem2: prob >= 0.85 && !isNoise,
        system2Status: prob >= 0.85 && !isNoise ? 'PENDING' : 'EQUILIBRIUM',
        pValue: pVal,
        theilSenSlope: slope,
        isNoise,
      };

      setLogs((prev) => [newEntry, ...prev.slice(0, 40)]);
    };

    // Seed the feed with the first four basins straight away, then continue every 5.5 seconds
    const seed = setTimeout(() => {
      for (let k = 0; k < 4; k++) scanNext();
    }, 0);
    const interval = setInterval(scanNext, 5500);

    return () => {
      clearTimeout(seed);
      clearInterval(interval);
    };
  }, [isStreaming, allBasins]);

  // When user selects a basin from globe, inject active triage entry
  useEffect(() => {
    if (!selectedBasin) return;
    const p = selectedBasin.properties;
    const z = p.mann_kendall_z;
    const pVal = p.p_value_fdr ?? (p.significant ? 0.001 : 0.35);
    const slope = p.theil_sen_slope ?? 0.0;
    const isNoise = pVal >= 0.05;
    const prob = screeningScore(z, isNoise);
    const entry: TriageLogEntry = {
      id: `target-${Date.now()}`,
      timestamp: formatClock(),
      basinId: p.basin_id,
      basinName: p.basin_name,
      wseZ: parseFloat(z.toFixed(2)),
      cov: parseFloat((1.0 + Math.abs(z) * 0.15).toFixed(2)),
      decisionHead: isNoise
        ? 'not significant'
        : slope < 0
        ? 'significant drying'
        : 'significant wetting',
      probability: prob,
      routedToSystem2: !isNoise,
      system2Status: !isNoise ? 'PENDING' : 'EQUILIBRIUM',
      pValue: pVal,
      theilSenSlope: slope,
      isNoise,
    };
    const timer = setTimeout(() => {
      setLogs((prev) => [entry, ...prev.slice(0, 40)]);
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedBasin]);

  const handleTriggerSystem2 = async (logEntry: TriageLogEntry) => {
    setActiveInferenceLog(logEntry);
    setIsDeepInferenceOpen(true);
    setIsInferring(true);
    setSystem2Response('');

    const targetBasin = allBasins.find((b) => b.properties.basin_id === logEntry.basinId) || selectedBasin;
    if (targetBasin) {
      onSelectBasin(targetBasin);
    }

    const promptText = `Summarise this screening result for a student audience.
Screening result: ${logEntry.decisionHead} (heuristic score ${(logEntry.probability * 100).toFixed(0)} out of 100, not a probability)
Target basin: ${logEntry.basinName} (${logEntry.basinId})
Mann-Kendall Z of the GRACE water-storage series: ${logEntry.wseZ}

Please cover:
1. What the GRACE / GRACE-FO trend shows, using the supplied statistics.
2. Possible explanations (monsoon shifts, orographic barriers, groundwater use), labelled clearly as hypotheses.
3. A linear extrapolation to 2035 and its limits.
4. What these statistics do not show.`;

    try {
      const res = await askPlanetaryTriage(promptText, targetBasin);
      setSystem2Response(res.text);
      setModelUsed(res.modelUsed);
      setResponseIsLive(res.isLive);
      setResponseLabel(getTriageLabel(res.isLive));
      setLogs((prev) =>
        prev.map((l) => (l.id === logEntry.id ? { ...l, system2Status: 'SUMMARISED' } : l))
      );
    } catch (err: any) {
      setSystem2Response(`Summary failed: ${err?.message || 'could not complete the request.'}`);
    } finally {
      setIsInferring(false);
    }
  };

  const handleCustomQuery = async () => {
    if (!customPrompt.trim() || isInferring) return;
    setIsInferring(true);
    const p = customPrompt;
    setCustomPrompt('');

    try {
      const res = await askPlanetaryTriage(p, selectedBasin);
      setSystem2Response(res.text);
      setModelUsed(res.modelUsed);
      setResponseIsLive(res.isLive);
      setResponseLabel(getTriageLabel(res.isLive));
    } catch (err: any) {
      setSystem2Response(`Request failed: ${err?.message || 'unknown error'}`);
    } finally {
      setIsInferring(false);
    }
  };

  const copyText = (txt: string) => {
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeLogs = logs.filter((l) => !l.isNoise);
  const noiseLogs = logs.filter((l) => l.isNoise);

  const zClass = (z: number) => (z < 0 ? 'text-dry-3' : 'text-wet-3');
  const tabClass = (selected: boolean) =>
    `flex min-h-[32px] items-center justify-center gap-1.5 border-0 border-b-2 bg-transparent px-2 py-1.5 text-label cursor-pointer ${
      selected
        ? 'border-accent font-medium text-ink-1'
        : 'border-transparent text-ink-2 hover:text-ink-1'
    }`;

  return (
    <>
      <div className={className || 'flex w-full flex-col text-label'}>
        {/* Replay controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex min-w-0 flex-col">
            <span className="text-label font-medium text-ink-1">
              {isStudentMode ? 'Trend screening (signal vs. noise)' : 'Region screening'}
            </span>
            <span className="tnum text-caption text-ink-3">
              Screens the shipped statistics: {allBasins.length} regions, {isStreaming ? 'replaying' : 'paused'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsStreaming(!isStreaming)}
            className="btn btn-secondary btn-sm shrink-0"
          >
            {isStreaming ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
            <span>{isStreaming ? 'Pause' : 'Resume'}</span>
          </button>
        </div>

        {/* Tabs: significant, not significant, event overlap */}
        <div role="tablist" aria-label="Screening results" className="flex flex-wrap items-center border-b border-line">
          <button
            type="button"
            role="tab"
            id="scanner-tab-active"
            aria-selected={activeTab === 'active'}
            aria-controls="scanner-panel"
            onClick={() => setActiveTab('active')}
            className={tabClass(activeTab === 'active')}
          >
            <span className="tnum">{isStudentMode ? 'Significant trends' : 'Significant'}{countLabel(activeLogs.length, isStreaming, true)}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="scanner-tab-noise"
            aria-selected={activeTab === 'noise'}
            aria-controls="scanner-panel"
            onClick={() => setActiveTab('noise')}
            className={tabClass(activeTab === 'noise')}
          >
            <span className="tnum">Not significant{countLabel(noiseLogs.length, isStreaming, false)}</span>
          </button>
          <button
            type="button"
            role="tab"
            id="scanner-tab-compound"
            aria-selected={activeTab === 'compound'}
            aria-controls="scanner-panel"
            onClick={() => setActiveTab('compound')}
            className={tabClass(activeTab === 'compound')}
          >
            <Flame size={14} aria-hidden="true" />
            <span className="tnum">
              {isStudentMode ? 'Events in drying regions' : 'Event overlap'}{countLabel(compoundAlerts.length, false, false)}
            </span>
          </button>
        </div>

        <div
          id="scanner-panel"
          role="tabpanel"
          aria-labelledby={`scanner-tab-${activeTab}`}
          ref={scrollRef}
          className="custom-scrollbar flex max-h-80 flex-col overflow-y-auto"
        >
          {/* TAB 1: significant results (q < 0.05) */}
          {activeTab === 'active' && (
            <div className="flex flex-col">
              {compoundAlerts.length > 0 && (
                <div className="flex flex-col gap-1 border-b border-line py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-label font-medium text-ink-1">
                      <Flame size={14} className="shrink-0 text-ink-2" aria-hidden="true" />
                      <span className="tnum">Event inside a significantly drying region ({compoundAlerts.length})</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('compound')}
                      className="btn btn-ghost btn-sm shrink-0 text-accent"
                    >
                      View
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 text-label text-ink-1">
                    <span className="truncate">{compoundAlerts[0].event.title}</span>
                    {compoundAlerts[0].event.curated && <span className="tag tag-warn shrink-0">Curated scenario</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-caption text-ink-3">
                    <span className="truncate">{compoundAlerts[0].basin.properties.basin_name}</span>
                    <span className="tnum shrink-0 text-dry-3">
                      β {compoundAlerts[0].slope.toFixed(3)} cm/yr, FDR q &lt; 0.05
                    </span>
                  </div>
                </div>
              )}

              {activeLogs.length === 0 && (
                <p className="m-0 py-6 text-center text-caption text-ink-3">No significant regions screened yet.</p>
              )}

              <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
                {activeLogs.map((log) => {
                  const isOverThreshold = log.probability >= 0.85;

                  return (
                    <li key={log.id} className="flex flex-col gap-1 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-label font-medium text-ink-1">{log.basinName}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-2">
                        <span className="tnum">
                          Mann-Kendall Z{' '}
                          <strong className={`font-semibold ${zClass(log.wseZ)}`}>
                            {log.wseZ > 0 ? '+' : ''}
                            {log.wseZ}
                          </strong>
                        </span>
                        <span>{log.decisionHead}</span>
                        <span className="tnum">q &lt; 0.05</span>
                        <span className="tnum">Screening score {(log.probability * 100).toFixed(0)}</span>
                      </div>

                      {log.routedToSystem2 && (
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-caption text-ink-2">
                            <AlertTriangle size={14} className="shrink-0 text-warn" aria-hidden="true" />
                            {isOverThreshold ? 'Flagged for an AI summary' : 'Available for an AI summary'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleTriggerSystem2(log)}
                            className="btn btn-secondary btn-sm shrink-0"
                          >
                            <span>Summarise</span>
                            <ArrowRight size={14} aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* TAB 2: not significant (FDR q >= 0.05) */}
          {activeTab === 'noise' && (
            <div className="flex flex-col">
              <div className="flex flex-col gap-1 border-b border-line py-3">
                <h4 className="m-0 flex items-center gap-1.5 text-label font-medium text-ink-1">
                  <Filter size={14} className="text-ink-3" aria-hidden="true" />
                  False-discovery control (α = 0.05)
                </h4>
                <p className="m-0 text-caption text-ink-3">
                  Regions with an FDR q-value of 0.05 or more fail the Hamed-Rao modified Mann-Kendall test with Benjamini-Hochberg correction. For these regions the data cannot rule out no trend. FDR control limits false discoveries but cannot eliminate them.
                </p>
              </div>

              {noiseLogs.length === 0 ? (
                <p className="m-0 py-6 text-center text-caption text-ink-3">
                  No non-significant regions screened yet.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
                  {noiseLogs.map((log) => (
                    <li key={log.id} className="flex flex-col gap-1 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-label font-medium text-ink-1">{log.basinName}</span>
                        <span className="tag tnum shrink-0">q = {log.pValue.toFixed(3)} (≥ 0.05)</span>
                      </div>
                      <div className="tnum flex flex-wrap items-center gap-x-3 text-caption text-ink-2">
                        <span>Mann-Kendall Z {log.wseZ > 0 ? '+' : ''}{log.wseZ}</span>
                        <span>Slope {log.theilSenSlope.toFixed(3)} cm/yr</span>
                        <span>Null not rejected</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-caption text-ink-3">
                        <span>Not flagged for an AI summary</span>
                        <button
                          type="button"
                          onClick={() => {
                            const b = allBasins.find((basin) => basin.properties.basin_id === log.basinId);
                            if (b) onSelectBasin(b);
                          }}
                          className="btn btn-ghost btn-sm text-accent"
                        >
                          Inspect region
                          <ArrowRight size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* TAB 3: events inside significantly drying regions */}
          {activeTab === 'compound' && (
            <div className="flex flex-col">
              <div className="flex flex-col gap-1 border-b border-line py-3">
                <h4 className="m-0 flex items-center gap-1.5 text-label font-medium text-ink-1">
                  <ShieldAlert size={14} className="text-ink-3" aria-hidden="true" />
                  Events inside significantly drying regions
                </h4>
                <p className="m-0 text-caption text-ink-3">
                  Flags open NASA EONET wildfire or drought events that fall inside a region with significant GRACE water-storage loss (FDR q &lt; 0.05, β &lt; 0). Curated scenario events are marked and are not live data.
                </p>
              </div>

              {compoundAlerts.length === 0 ? (
                <p className="m-0 py-6 text-center text-caption text-ink-3">
                  No wildfire or drought events found inside significantly drying regions.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
                  {compoundAlerts.map((alert) => (
                    <li key={alert.event.id} className="flex flex-col gap-2 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-caption text-ink-2">
                          {alert.event.category === 'wildfires' ? (
                            <Flame size={14} aria-hidden="true" />
                          ) : (
                            <AlertTriangle size={14} aria-hidden="true" />
                          )}
                          <span className="capitalize">{alert.event.category}</span>
                        </span>
                        {alert.event.curated && <span className="tag tag-warn">Curated scenario</span>}
                      </div>

                      <div>
                        <h4 className="m-0 text-label font-semibold text-ink-1">{alert.event.title}</h4>
                        <p className="m-0 mt-0.5 text-caption text-ink-2">
                          Region containing the event:{' '}
                          <strong className="font-semibold text-ink-1">{alert.basin.properties.basin_name}</strong>
                        </p>
                      </div>

                      <dl className="m-0 grid grid-cols-2 gap-2 text-caption">
                        <div>
                          <dt className="text-ink-3">Storage trend (β)</dt>
                          <dd className="tnum m-0 font-semibold text-dry-3">{alert.slope.toFixed(4)} cm/yr</dd>
                        </div>
                        <div>
                          <dt className="text-ink-3">FDR q-value</dt>
                          <dd className="tnum m-0 text-ink-1">q = {alert.pVal.toFixed(5)} (&lt; 0.05)</dd>
                        </div>
                      </dl>

                      <p className="m-0 text-caption text-ink-3">
                        Possible link (hypothesis, not tested here): a long-running water-storage deficit may leave vegetation drier and more flammable. This app does not test whether the event is connected to the trend.
                      </p>

                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectBasin(alert.basin)}
                          className="btn btn-secondary btn-sm"
                        >
                          <span>Focus region</span>
                          <ArrowRight size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const pseudoLog: TriageLogEntry = {
                              id: `compound-${alert.event.id}`,
                              timestamp: formatClock(),
                              basinId: alert.basin.properties.basin_id,
                              basinName: alert.basin.properties.basin_name,
                              wseZ: alert.zScore,
                              cov: 0,
                              decisionHead: `${alert.event.category} event inside a significantly drying basin`,
                              probability: screeningScore(alert.zScore, false),
                              routedToSystem2: true,
                              system2Status: 'PENDING',
                              pValue: alert.pVal,
                              theilSenSlope: alert.slope,
                              isNoise: false,
                            };
                            handleTriggerSystem2(pseudoLog);
                          }}
                          className="btn btn-secondary btn-sm"
                        >
                          <Sparkles size={14} aria-hidden="true" />
                          <span>AI summary</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-3 text-caption text-ink-3">
          <span>Significance: Benjamini-Hochberg FDR (α = 0.05)</span>
          <button
            type="button"
            onClick={() => {
              const firstAnom = logs.find((l) => l.routedToSystem2) || logs[0];
              if (firstAnom) handleTriggerSystem2(firstAnom);
            }}
            className="btn btn-ghost btn-sm shrink-0 text-accent"
          >
            Open AI summary
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* AI summary console (modal) */}
      {isDeepInferenceOpen && (
        <SummaryDialog
          onClose={() => setIsDeepInferenceOpen(false)}
          responseIsLive={responseIsLive}
          modelUsed={modelUsed}
          activeInferenceLog={activeInferenceLog}
          isInferring={isInferring}
          system2Response={system2Response}
          responseLabel={responseLabel}
          copied={copied}
          onCopy={() => copyText(system2Response)}
          customPrompt={customPrompt}
          setCustomPrompt={setCustomPrompt}
          onSubmit={handleCustomQuery}
        />
      )}
    </>
  );
}

interface SummaryDialogProps {
  onClose: () => void;
  responseIsLive: boolean;
  modelUsed: string;
  activeInferenceLog: TriageLogEntry | null;
  isInferring: boolean;
  system2Response: string;
  responseLabel: string;
  copied: boolean;
  onCopy: () => void;
  customPrompt: string;
  setCustomPrompt: (v: string) => void;
  onSubmit: () => void;
}

function SummaryDialog({
  onClose,
  responseIsLive,
  modelUsed,
  activeInferenceLog,
  isInferring,
  system2Response,
  responseLabel,
  copied,
  onCopy,
  customPrompt,
  setCustomPrompt,
  onSubmit,
}: SummaryDialogProps) {
  const dialog = useModalDialog<HTMLDivElement>(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        {...dialog.props}
        aria-labelledby="ai-summary-title"
        onClick={(e) => e.stopPropagation()}
        className="popover flex max-h-[90vh] w-[820px] max-w-[95vw] flex-col overflow-hidden text-label"
      >
        {/* Title bar */}
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <Cpu size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="ai-summary-title" className="m-0 text-body font-semibold text-ink-1">
                  AI summary
                </h2>
                <span className="tag">
                  {responseIsLive ? `${modelUsed.split(':')[0]} (free tier)` : 'Template, no AI model'}
                </span>
              </div>
              <p className="m-0 text-caption text-ink-3">
                OpenRouter free-tier model when a key is set; otherwise a fixed template filled from the statistics
              </p>
            </div>
          </div>

          <button type="button" onClick={onClose} aria-label="Close AI summary" className="btn btn-ghost btn-sm shrink-0">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {/* Target region */}
        {activeInferenceLog && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-caption">
            <div className="flex items-center gap-2">
              <span className="text-ink-3">Target region</span>
              <span className="font-semibold text-ink-1">{activeInferenceLog.basinName}</span>
            </div>
            <div className="tnum flex items-center gap-3 text-ink-2">
              <span>Mann-Kendall Z {activeInferenceLog.wseZ}</span>
              <span>Screening score (heuristic) {(activeInferenceLog.probability * 100).toFixed(0)}</span>
            </div>
          </div>
        )}

        {/* Output body */}
        <div className="flex flex-1 select-text flex-col gap-3 overflow-y-auto bg-canvas p-4 text-ink-2">
          {isInferring ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" role="status">
              <RefreshCw size={24} className="animate-spin text-ink-3" aria-hidden="true" />
              <div className="text-body font-semibold text-ink-1">Preparing summary...</div>
              <p className="m-0 max-w-md text-label text-ink-3">
                Sending the region statistics to an OpenRouter free-tier model. If no key is set, or the model does not answer, a fixed template is shown instead.
              </p>
            </div>
          ) : system2Response ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
                <span className="flex items-center gap-1.5 text-caption text-ink-3">
                  <Sparkles size={14} aria-hidden="true" />
                  {responseLabel}
                </span>
                <button type="button" onClick={onCopy} className="btn btn-secondary btn-sm">
                  {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="whitespace-pre-wrap text-body text-ink-1">{system2Response}</div>
            </div>
          ) : (
            <div className="py-8 text-center text-label text-ink-3">
              Choose Summarise on a flagged region or submit a question below.
            </div>
          )}
        </div>

        {/* Custom question */}
        <div className="flex items-center gap-2 border-t border-line p-3">
          <input
            type="text"
            aria-label="Ask the AI model a hydrological question"
            placeholder="Ask the AI model a hydrological question..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            disabled={isInferring}
            className="field min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={onSubmit}
            disabled={isInferring || !customPrompt.trim()}
            className="btn btn-primary"
          >
            <Send size={14} aria-hidden="true" />
            <span>Ask</span>
          </button>
        </div>
      </div>
    </div>
  );
}
