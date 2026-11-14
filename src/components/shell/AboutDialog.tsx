import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { BasinFeature } from '../Globe';
import { fmtSigned, isSignificant } from './shellUtils';
import { useModalDialog } from './useModalDialog';

export interface AboutDialogProps {
  allBasins: BasinFeature[];
  /** summary.json; used for the observed period. */
  summaryMeta?: { temporal_range?: [string, string] } | null;
  onClose: () => void;
}

function monthYear(iso?: string) {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 7)}-01T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "About this project": the challenge's four questions, answered from the loaded data only. */
export default function AboutDialog({ allBasins, summaryMeta, onClose }: AboutDialogProps) {
  const dialog = useModalDialog<HTMLDivElement>(onClose);

  const facts = useMemo(() => {
    const sorted = [...allBasins].sort((a, b) => a.properties.theil_sen_slope - b.properties.theil_sen_slope);
    const sig = allBasins.filter(isSignificant);
    const drying = sorted.filter((b) => isSignificant(b) && b.properties.theil_sen_slope < 0).slice(0, 3);
    const wetting = [...sorted]
      .reverse()
      .filter((b) => isSignificant(b) && b.properties.theil_sen_slope > 0)
      .slice(0, 2);
    const cv = allBasins.find((b) => b.properties.basin_id === 'BASIN_CALIFORNIA_CV');
    return { total: allBasins.length, sig: sig.length, drying, wetting, cv };
  }, [allBasins]);

  const range = summaryMeta?.temporal_range;
  const period = range ? `${monthYear(range[0])} to ${monthYear(range[1])}` : '2002 to 2024';
  const names = (list: BasinFeature[]) =>
    list.map((b) => `${b.properties.basin_name} (${fmtSigned(b.properties.theil_sen_slope)} cm/yr)`).join(', ');
  const loaded = facts.total > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        {...dialog.props}
        aria-labelledby="about-title"
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-surface-1 border border-line rounded-lg popover"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-line">
          <div>
            <h2 id="about-title" className="m-0 text-title font-semibold text-ink-1">
              About this project
            </h2>
            <p className="m-0 mt-1 text-label text-ink-2">
              An entry for the 2026 NASA Space Apps challenge “Be An Earth System Trend Detective!”
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm px-1.5" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 flex flex-col gap-5 text-body text-ink-2">
          <p className="m-0">
            Stratum-4D looks for long-term change in how much water is stored on land, measured from orbit by NASA’s
            GRACE and GRACE-FO satellites, and tests whether each change is larger than ordinary year-to-year swings.
          </p>

          <dl className="m-0 flex flex-col gap-4">
            <div>
              <dt className="text-label font-semibold text-ink-1">What is changing?</dt>
              <dd className="m-0 mt-1">
                Water stored on land (terrestrial water storage), in centimetres of liquid water equivalent. Each region’s
                trend is given in cm/yr, observed from {period}.
              </dd>
            </div>
            <div>
              <dt className="text-label font-semibold text-ink-1">Where is it changing?</dt>
              <dd className="m-0 mt-1">
                {loaded ? (
                  <>
                    Across {facts.total} regions. Strongest significant drying: {names(facts.drying)}. Strongest
                    significant wetting: {names(facts.wetting)}.
                  </>
                ) : (
                  'Loading regions…'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-label font-semibold text-ink-1">How much is it changing?</dt>
              <dd className="m-0 mt-1">
                Measured with the Theil-Sen median slope, which resists outliers.
                {facts.cv && (
                  <>
                    {' '}
                    For example, {facts.cv.properties.basin_name} changes by{' '}
                    <span className="tnum">{fmtSigned(facts.cv.properties.theil_sen_slope)} cm/yr</span> (likely range{' '}
                    <span className="tnum">
                      {fmtSigned(facts.cv.properties.theil_sen_ci_low)} to {fmtSigned(facts.cv.properties.theil_sen_ci_high)}
                    </span>
                    ).
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-label font-semibold text-ink-1">Is it significant?</dt>
              <dd className="m-0 mt-1">
                The seasonal cycle is removed first (STL). Each trend is then tested with a Mann-Kendall test corrected
                for month-to-month autocorrelation (Hamed-Rao), and the results are corrected for testing many regions at
                once (Benjamini-Hochberg false discovery rate).
                {loaded && (
                  <>
                    {' '}
                    <span className="tnum">
                      {facts.sig} of {facts.total}
                    </span>{' '}
                    regions have FDR q below 0.05; the other <span className="tnum">{facts.total - facts.sig}</span> do
                    not.
                  </>
                )}
              </dd>
            </div>
          </dl>

          <section aria-labelledby="about-sources" className="pt-4 border-t border-line flex flex-col gap-2">
            <h3 id="about-sources" className="m-0 text-label font-semibold text-ink-1">
              Data sources
            </h3>
            <ul className="m-0 pl-5 flex flex-col gap-1.5">
              <li>
                Water storage: GRACE and GRACE-FO JPL mascons RL06.1M (PO.DAAC), DOI{' '}
                <span className="font-mono text-label">10.5067/TEMSC-3JC62</span>.
              </li>
              <li>Rainfall, temperature and soil moisture: NASA POWER monthly reanalysis, at one point per region.</li>
              <li>Satellite image layers: NASA GIBS. Natural events: NASA EONET.</li>
              <li>
                Some series under “Other variables” (vegetation, ground sinking, river height) are modelled stand-ins
                built from GRACE and other inputs, not satellite measurements.
              </li>
            </ul>
          </section>
        </div>

        <div className="px-6 py-3 border-t border-line flex justify-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
