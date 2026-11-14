import type { BasinFeature } from '../Globe';
import { fmtSigned } from './shellUtils';

export interface InspectorStatsProps {
  basin: BasinFeature;
  plain: boolean;
}

interface Row {
  plain: string;
  tech: string;
  value: string;
  note?: string;
}

/** The full statistics for one region, plain label first (or technical first in Technical mode). */
export default function InspectorStats({ basin, plain }: InspectorStatsProps) {
  const p = basin.properties;
  const na = 'not available';
  const rows: Row[] = [
    { plain: 'Trend', tech: 'Theil-Sen slope', value: `${fmtSigned(p.theil_sen_slope, 3)} cm/yr` },
    {
      plain: 'Likely range',
      tech: '95% confidence interval',
      value: `${fmtSigned(p.theil_sen_ci_low, 3)} to ${fmtSigned(p.theil_sen_ci_high, 3)} cm/yr`,
    },
    {
      plain: 'Significance test (lower is stronger)',
      tech: 'FDR q (Benjamini-Hochberg)',
      value: p.p_value_fdr.toFixed(4),
      note: p.p_value_fdr < 0.05 ? 'Below 0.05: significant' : '0.05 or above: not significant',
    },
    {
      plain: 'Trend test score',
      tech: 'Mann-Kendall Z (Hamed-Rao)',
      value: p.mann_kendall_z.toFixed(2),
      note: '|Z| of 1.96 or more is the usual 5% threshold before correction',
    },
    {
      plain: 'Independent samples',
      tech: 'Effective n* and lag-1 autocorrelation ρ₁',
      value:
        p.n_star != null
          ? `n* = ${p.n_star.toFixed(1)}${p.rho_1_autocorr != null ? `, ρ₁ = ${p.rho_1_autocorr.toFixed(2)}` : ''}`
          : na,
    },
    {
      plain: 'Year of the step change',
      tech: 'Pettitt change point',
      value: p.breakpoint_year != null ? String(p.breakpoint_year) : na,
      note: p.pettitt_p != null ? `Pettitt p = ${p.pettitt_p.toFixed(3)}` : undefined,
    },
    {
      plain: 'Signal to noise',
      tech: 'SNR',
      value: p.signal_to_noise_ratio != null ? p.signal_to_noise_ratio.toFixed(2) : na,
    },
    {
      plain: 'Year the trend stood out',
      tech: 'Time of emergence',
      value: p.time_of_emergence_year != null ? String(Math.round(p.time_of_emergence_year)) : na,
    },
    { plain: 'Region area', tech: 'Catchment area', value: `${Math.round(p.area_sqkm).toLocaleString('en-US')} km²` },
  ];

  return (
    <dl className="m-0 grid grid-cols-2 gap-x-4">
      {rows.map((r) => (
        <div key={r.tech} className="py-2 border-b border-line min-w-0">
          <dt className="text-label text-ink-2">{plain ? r.plain : r.tech}</dt>
          <dd className="m-0">
            <div className="text-body font-medium text-ink-1 tnum break-words">{r.value}</div>
            <div className="text-caption text-ink-3">{plain ? r.tech : r.plain}</div>
            {r.note && <div className="text-caption text-ink-3">{r.note}</div>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
