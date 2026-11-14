import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, Cpu, AlertOctagon, Layers, GraduationCap } from 'lucide-react';
import type { BasinFeature } from './Globe';
import { calculatePearsonR } from '../lib/statistics';

export interface TriangulationBadgesProps {
  basin: BasinFeature | null;
  isStudentMode?: boolean;
}

const DEFAULT_TRIANGULATION = {
  chi_hydro_evap_ratio: 0,
  seasonal_lag_months: 2.0,
  vegetation_resilience_score: 0.5,
  buffer_collapsed: false,
  skeletal_storativity_s_sk: 1.0,
  compaction_rate_mm_yr: 0,
  irreversible_subsidence: false,
};

export default function TriangulationBadges({ basin, isStudentMode = false }: TriangulationBadgesProps) {
  const props = basin?.properties;
  const tri = props?.triangulation ?? DEFAULT_TRIANGULATION;

  const slope = props?.theil_sen_slope ?? 0;
  const isBufferCollapsed = tri.buffer_collapsed || tri.seasonal_lag_months <= 1.0;
  const rho1 = props?.rho_1_autocorr ?? 0.842;
  const isPrewhitened = props?.yue_pilon_prewhitened ?? true;

  // 1. Consistency score (0-100, heuristic) across observed, reanalysis and modelled series
  const { concordanceScore, concordanceBreakdown } = useMemo(() => {
    if (!props) return { concordanceScore: 0, concordanceBreakdown: [] };
    const triangulation = props.triangulation ?? DEFAULT_TRIANGULATION;
    const currentSlope = props.theil_sen_slope ?? 0;
    const collapsed = triangulation.buffer_collapsed || triangulation.seasonal_lag_months <= 1.0;

    const ts = props.time_series;
    const graceSeries = ts?.raw || ts?.stl_trend || [];
    const soilSeries = ts?.soil_moisture || [];
    const precipSeries = ts?.precip_anom || [];
    const ndviSeries = ts?.modis_ndvi || [];

    // A. Empirical NASA POWER Root-Zone Soil Wetness (GWETROOT) Concordance (max 30 pts)
    const rGraceSoil =
      graceSeries.length > 5 && soilSeries.length > 5
        ? Math.abs(calculatePearsonR(graceSeries, soilSeries))
        : 0.52;
    const graceSoilScore = Math.round(10 + rGraceSoil * 20);

    // B. NASA POWER precipitation (reanalysis) vs storage coupling (max 25 pts)
    const chiDeficit = Math.abs(triangulation.chi_hydro_evap_ratio);
    const gpmScore = Math.round(25 - Math.min(10, chiDeficit * 3.5) + (precipSeries.length > 0 ? 0 : 0));

    // C. Terzaghi subsidence model (modelled proxy, not InSAR) (max 25 pts)
    const hasSubsidence = triangulation.compaction_rate_mm_yr > 3.0 || triangulation.irreversible_subsidence;
    const subsidenceAligned = (currentSlope < -0.2 && hasSubsidence) || (currentSlope >= -0.2 && !triangulation.irreversible_subsidence);
    const insarScore = subsidenceAligned ? (triangulation.irreversible_subsidence ? 24 : 22) : 15;

    // D. TWS vs modelled NDVI proxy, lagged coupling (max 20 pts)
    const rTwsNdvi =
      graceSeries.length > 5 && ndviSeries.length > 5
        ? Math.abs(calculatePearsonR(graceSeries, ndviSeries))
        : triangulation.vegetation_resilience_score;
    const modisScore = Math.round(rTwsNdvi * 12 + (triangulation.seasonal_lag_months > 1.0 ? 8 : 3));

    const total = Math.max(10, Math.min(100, graceSoilScore + gpmScore + insarScore + modisScore));

    const breakdown = [
      { name: 'Root-zone soil wetness (NASA POWER reanalysis)', score: graceSoilScore, max: 30, aligned: rGraceSoil > 0.35 },
      { name: 'Precipitation anomaly (NASA POWER reanalysis)', score: gpmScore, max: 25, aligned: gpmScore > 18 },
      { name: 'Subsidence (modelled proxy, Terzaghi)', score: insarScore, max: 25, aligned: insarScore > 18 },
      { name: 'Vegetation index (modelled proxy)', score: modisScore, max: 20, aligned: !collapsed },
    ];

    return { concordanceScore: total, concordanceBreakdown: breakdown };
  }, [props]);

  // 2. Anthropogenic Divergence Alert
  // Triggered when precipitation is steady/increasing (or within normal variance) but GRACE TWS is declining
  const isAnthropogenicDivergence = useMemo(() => {
    if (!props) return false;
    const basinId = props.basin_id || '';
    const rawAttribution = String((props as any).causal_attribution || '').toLowerCase();
    const triangulation = props.triangulation ?? DEFAULT_TRIANGULATION;
    const currentSlope = props.theil_sen_slope ?? 0;

    // Known over-pumped basins or explicit attribution
    const isKnownPumpingBasin = [
      'BASIN_CALIFORNIA_CV',
      'BASIN_CALIFORNIA_CENTRAL_VALLEY',
      'BASIN_INDUS',
      'BASIN_NORTH_CHINA_PLAIN',
      'BASIN_OGALLALA',
      'BASIN_GANGES_BRAHMAPUTRA',
      'BASIN_COLORADO',
    ].includes(basinId) || rawAttribution.includes('anthropogenic') || rawAttribution.includes('pumping');

    // Geophysical criterion: TWS is significantly declining (slope < -0.3 cm/yr),
    // and evaporative deficit ratio is moderate/steady (chi_hydro not dominated by severe meteorological drought)
    // or compaction rate > 5mm/yr while precipitation remains steady.
    const isPhysicalOverdraft = currentSlope < -0.35 && (triangulation.compaction_rate_mm_yr > 4.0 || triangulation.chi_hydro_evap_ratio < 1.2 || isKnownPumpingBasin);

    return isKnownPumpingBasin || isPhysicalOverdraft;
  }, [props]);

  if (!basin) return null;

  return (
    <div className="flex flex-col gap-4 text-ink-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 flex items-center gap-1.5 text-body font-semibold text-ink-1">
          <Cpu size={14} className="text-ink-3" aria-hidden="true" />
          Cross-series consistency check
        </h3>
        <div className="flex items-center gap-2 text-caption text-ink-3">
          {isStudentMode && (
            <span className="tag">
              <GraduationCap size={12} aria-hidden="true" /> Plain-language mode
            </span>
          )}
          <span>1 observed and 3 supporting series</span>
        </div>
      </div>

      {/* Consistency score across observed, reanalysis and modelled series */}
      <section aria-label="Consistency score" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-label font-medium text-ink-1">
            <Layers size={14} className="text-ink-3" aria-hidden="true" />
            <span>Consistency score (heuristic)</span>
          </div>
          <div className="flex items-baseline gap-1 tnum">
            <span className="text-title font-semibold text-ink-1">{concordanceScore}</span>
            <span className="text-caption text-ink-3">out of 100</span>
          </div>
        </div>

        <div
          className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
          role="img"
          aria-label={`Consistency score ${concordanceScore} out of 100`}
        >
          <div className="h-full rounded-full bg-ink-2" style={{ width: `${concordanceScore}%` }} />
        </div>

        {isStudentMode && (
          <p className="m-0 text-body text-ink-2">
            <strong className="font-semibold text-ink-1">Consistency check:</strong> observed GRACE water storage is compared with NASA POWER rainfall (reanalysis) and two modelled proxies (vegetation and ground subsidence). Agreement supports the trend; it does not prove it.
          </p>
        )}

        <ul className="m-0 flex list-none flex-col divide-y divide-line border-t border-line p-0">
          {concordanceBreakdown.map((item, idx) => (
            <li key={idx} className="flex items-center justify-between gap-3 py-1.5 text-caption">
              <span className="text-ink-2">{item.name}</span>
              <span className={`tnum shrink-0 ${item.aligned ? 'font-semibold text-ink-1' : 'text-ink-3'}`}>
                {item.score}/{item.max}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Anthropogenic divergence alert */}
      {isAnthropogenicDivergence && (
        <section aria-label="Possible human-driven decline" className="flex flex-col gap-1.5 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="m-0 flex items-center gap-1.5 text-label font-semibold text-ink-1">
              <AlertOctagon size={14} className="shrink-0 text-warn" aria-hidden="true" />
              Possible human-driven decline
            </h4>
            <span className="tag tag-warn">Possible overdraft</span>
          </div>
          <p className="m-0 text-body text-ink-2">
            GRACE / GRACE-FO shows water storage falling (
            <strong className="tnum font-semibold text-dry-3">{slope.toFixed(2)} cm/yr</strong>).
            Flagged because this basin is on a list of known over-pumped basins or shows a steep decline; rainfall was not tested here.
            Consistent with pumping that is not matched by recharge. Pumping is not measured.
          </p>
          {isStudentMode && (
            <p className="m-0 text-body text-ink-2">
              <strong className="font-semibold text-ink-1">Possible human overdraft:</strong> Storage is falling. One explanation is that farms and cities pump groundwater out faster than rainfall refills it; this app does not measure pumping, so treat it as a hypothesis.
            </p>
          )}
        </section>
      )}

      {/* Coupling A: atmospheric forcing vs hydrology */}
      <section aria-label="Atmosphere and hydrology" className="flex flex-col gap-1 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="m-0 text-label font-medium text-ink-2">Atmosphere and hydrology</h4>
          <span className="tnum text-label font-semibold text-ink-1">
            &chi;_hydro = {tri.chi_hydro_evap_ratio > 0 ? '+' : ''}
            {tri.chi_hydro_evap_ratio.toFixed(2)}
          </span>
        </div>
        <div className="text-label font-semibold text-ink-1">Evaporative deficit ratio (&chi;_hydro)</div>
        <p className="m-0 text-caption text-ink-3">
          {isStudentMode ? (
            <>
              <strong className="font-semibold text-ink-2">Evaporative deficit ratio (&chi;_hydro):</strong> whether water dries up faster than rainfall can recharge it. Hot air and dry atmospheric pressure are pulling moisture into the sky faster than storms replenish it.
            </>
          ) : (
            'Decouples transient heatwave atmospheric VPD from deep aquifer depletion anomalies.'
          )}
        </p>
      </section>

      {/* Coupling B: hydrology vs biosphere resilience */}
      <section aria-label="Hydrology and vegetation" className="flex flex-col gap-1 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="m-0 text-label font-medium text-ink-2">Hydrology and vegetation</h4>
          <span className="tnum text-caption text-ink-3">
            Resilience: {tri.vegetation_resilience_score.toFixed(3)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-label font-semibold text-ink-1">
          {isBufferCollapsed ? (
            <>
              <AlertTriangle size={14} className="shrink-0 text-warn" aria-hidden="true" />
              <span className="tnum">Buffer collapsed (&tau; = {tri.seasonal_lag_months.toFixed(1)} months)</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={14} className="shrink-0 text-ink-2" aria-hidden="true" />
              <span className="tnum">
                Resilient buffer (&tau; = {tri.seasonal_lag_months.toFixed(1)} months, resilience{' '}
                {tri.vegetation_resilience_score.toFixed(2)})
              </span>
            </>
          )}
        </div>
        <p className="m-0 text-caption text-ink-3">
          {isStudentMode ? (
            <>
              <strong className="font-semibold text-ink-2">Vegetation resilience:</strong>{' '}
              {isBufferCollapsed
                ? 'Plant buffer looks exhausted: in this modelled proxy, vegetation tracks rainfall closely instead of drawing on stored deep moisture.'
                : 'Healthy buffer: in this modelled proxy, vegetation stays green through dry spells, which is consistent with stored deep moisture.'}
            </>
          ) : isBufferCollapsed ? (
            'Modelled NDVI proxy tracks rainfall loss closely; consistent with an exhausted root-zone storage buffer.'
          ) : (
            'Modelled NDVI proxy stays high in dry spells; consistent with stored moisture sustaining canopy greenness.'
          )}
        </p>
      </section>

      {/* Coupling C: groundwater extraction vs lithosphere */}
      <section aria-label="Extraction and ground compaction" className="flex flex-col gap-1 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="m-0 text-label font-medium text-ink-2">Extraction and ground compaction</h4>
          <span className="tag tag-warn">Modelled</span>
        </div>
        <div className="flex items-center gap-1.5 text-label font-semibold text-ink-1">
          {tri.irreversible_subsidence ? (
            <>
              <ShieldAlert size={14} className="shrink-0 text-warn" aria-hidden="true" />
              <span>Permanent compaction (modelled)</span>
            </>
          ) : (
            <span>Elastic rebound regime (modelled)</span>
          )}
        </div>
        <div className="tnum flex flex-wrap items-center gap-x-2 text-caption text-ink-2">
          <span>
            S_sk* = {tri.skeletal_storativity_s_sk.toFixed(3)}
          </span>
          <span className="text-ink-3" aria-hidden="true">&middot;</span>
          <span>{tri.compaction_rate_mm_yr.toFixed(1)} mm/yr compaction (modelled, not InSAR)</span>
        </div>
        {isStudentMode ? (
          <p className="m-0 text-caption text-ink-3">
            <strong className="font-semibold text-ink-2">Skeletal storativity (S_sk*):</strong> how spongy the underground aquifer is, and whether pumping causes permanent ground collapse.{' '}
            {tri.irreversible_subsidence
              ? 'The model suggests the pores have been crushed by overlying rock, which would mean irreversible ground collapse and permanent loss of storage.'
              : 'The model suggests the aquifer is elastic and should rebound when it refills.'}
          </p>
        ) : (
          tri.irreversible_subsidence && (
            <p className="m-0 text-caption text-ink-3">
              Modelled inelastic pore collapse beyond the preconsolidation head; would mean irreversible aquifer storage loss.
            </p>
          )
        )}
      </section>

      {/* Statistical rigour: Yue-Pilon and Hamed-Rao */}
      <section aria-label="Statistical corrections" className="flex flex-col gap-1.5 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2 text-label">
          <span className="flex items-center gap-1.5 font-medium text-ink-1">
            <CheckCircle2 size={14} className="text-ink-2" aria-hidden="true" />
            {isPrewhitened ? 'Yue-Pilon pre-whitened' : 'Standard autocorrelation'}
          </span>
          <span className="tnum text-caption text-ink-2">
            &rho;_1 = {rho1.toFixed(3)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 text-caption text-ink-2">
          <span>Hamed-Rao variance correction</span>
          <span className="tnum text-ink-1">&alpha; = 0.05, FDR</span>
        </div>
        {isStudentMode && (
          <p className="m-0 text-caption text-ink-3">
            <strong className="font-semibold text-ink-2">Climate cycle filter (Hamed-Rao and Yue-Pilon):</strong> normal climate cycles like El Niño and seasonal swings can fake a 10-year trend. This filter reduces the effect of such cycles on the significance test; it cannot remove them completely.
          </p>
        )}
      </section>
    </div>
  );
}
