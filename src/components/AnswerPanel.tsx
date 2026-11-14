import { Check, LocateFixed, Minus } from 'lucide-react';
import type { BasinFeature } from './Globe';
import RegionTrendChart from './RegionTrendChart';
import { GLOSSARY, fmtInt, fmtNum, fmtQ, fmtSigned, term } from '../lib/glossary';
import type { BasinProps } from '../lib/glossary';

export interface AnswerPanelProps {
  /** The selected basin. */
  basin: BasinFeature;
  /** true = plain-language labels first; false = technical names first. */
  plain: boolean;
  /** Called when the user asks to fly the map to this basin. */
  onFlyTo?: () => void;
}

/** Change along the trend line over the record, in cm, plus the first year. Null if not computable. */
function totalChange(p: BasinProps): { delta: number; startYear: number | null } | null {
  const ts = p.time_series;
  const line = ts?.trend_line?.filter((v) => Number.isFinite(v));
  const first = ts?.dates?.[0] ?? ts?.timestamps?.[0];
  const year = first ? Number(first.slice(0, 4)) : NaN;
  if (line && line.length >= 2) {
    return { delta: line[line.length - 1] - line[0], startYear: Number.isFinite(year) ? year : null };
  }
  return null;
}

/**
 * Answer-first summary for one basin: What / Where / How much / Significant,
 * followed by the one canonical trend chart.
 */
export default function AnswerPanel({ basin, plain, onFlyTo }: AnswerPanelProps) {
  const p = basin.properties as BasinProps;
  const slope = p.theil_sen_slope;
  const hasCi = Number.isFinite(p.theil_sen_ci_low) && Number.isFinite(p.theil_sen_ci_high);
  const q = p.p_value_fdr;
  const hasQ = Number.isFinite(q);
  const significant = hasQ && q < 0.05;
  const change = totalChange(p);
  const rounded = change ? Math.round(change.delta) : 0;
  const since = change?.startYear ? ` than in ${change.startYear}` : ' over the record';
  const changeText = !change
    ? null
    : plain
      ? rounded === 0
        ? `About the same${since}.`
        : `About ${fmtInt(Math.abs(rounded))} cm ${rounded < 0 ? 'lower' : 'higher'}${since}.`
      : `Trend line change: ${fmtSigned(change.delta, 0)} cm${change.startYear ? ` since ${change.startYear}` : ''}.`;

  const range = hasCi ? `${fmtNum(p.theil_sen_ci_low)} to ${fmtNum(p.theil_sen_ci_high)}` : null;

  const testParts = [
    Number.isFinite(p.mann_kendall_z) ? `Z = ${fmtNum(p.mann_kendall_z)}` : null,
    typeof p.n_star === 'number' && Number.isFinite(p.n_star) ? `n* = ${fmtNum(p.n_star)}` : null,
    hasQ ? `BH-FDR ${fmtQ(q)}` : null,
  ].filter(Boolean);

  return (
    <section aria-label="Trend summary" className="flex flex-col gap-4">
      <dl className="m-0 grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-3.5">
        <dt className="text-label/5 font-medium text-ink-2">What</dt>
        <dd className="m-0">
          <div className="text-body font-medium">{term(GLOSSARY.what, plain)}</div>
          <div className="text-caption text-ink-3">{term(GLOSSARY.whatNote, plain)}</div>
        </dd>

        <dt className="text-label/5 font-medium text-ink-2">Where</dt>
        <dd className="m-0 flex flex-wrap items-baseline gap-x-2.5">
          <span className="text-body font-medium">
            {p.basin_name}
            {p.continent ? <span className="font-normal text-ink-2">, {p.continent}</span> : null}
          </span>
          {onFlyTo && (
            <button
              type="button"
              onClick={onFlyTo}
              aria-label={`Fly to ${p.basin_name}`}
              className="inline-flex min-h-6 items-center gap-1 rounded-sm text-label text-accent hover:underline"
            >
              <LocateFixed size={12} aria-hidden="true" />
              Fly to
            </button>
          )}
        </dd>

        <dt className="text-label/8 font-medium text-ink-2">How much</dt>
        <dd className="m-0">
          <div className="tnum text-display font-semibold">{Number.isFinite(slope) ? `${fmtSigned(slope)} cm/yr` : 'No trend'}</div>
          <div className="tnum text-caption text-ink-3">
            {range && `${term(GLOSSARY.rangeLabel, plain)} ${range}${plain ? '' : ' cm/yr'}.`}
            {range && changeText ? ' ' : ''}
            {changeText}
          </div>
        </dd>

        <dt className="text-label/6 font-medium text-ink-2">Significant</dt>
        <dd className="m-0">
          {hasQ ? (
            <>
              <span className="inline-flex h-6 items-center gap-1.5 rounded border border-ink-3 px-2 text-label font-semibold text-ink-1">
                {significant ? <Check size={12} strokeWidth={1.75} aria-hidden="true" /> : <Minus size={12} strokeWidth={1.75} aria-hidden="true" />}
                {significant ? 'Yes' : 'Not yet'}
              </span>
              <div className="tnum mt-1 text-caption text-ink-3">
                {significant
                  ? `Unlikely to be chance (FDR ${fmtQ(q)}).`
                  : `This could still be chance (FDR ${fmtQ(q)}). A longer record may settle it.`}
              </div>
              {!plain && testParts.length > 0 && (
                <div className="tnum mt-1 text-caption text-ink-3">Mann-Kendall with Hamed-Rao correction, {testParts.join(', ')}.</div>
              )}
            </>
          ) : (
            <div className="text-caption text-ink-3">No significance test for this basin.</div>
          )}
        </dd>
      </dl>

      <div className="flex flex-col gap-2">
        <h3 className="m-0 text-label font-medium text-ink-2">{term(GLOSSARY.chartTitle, plain)}</h3>
        <RegionTrendChart basin={basin} plain={plain} height={190} />
      </div>
    </section>
  );
}
