import { X, Compass, ChevronRight } from 'lucide-react';
import { useModalDialog } from './shell/useModalDialog';
import type { BasinFeature } from './Globe';
import { getAirsCoEffectiveDate } from '../lib/gibs';
import { fmtSigned } from './shell/shellUtils';

// The AIRS carbon-monoxide layer silently shows archive imagery for any 2026 date (see src/lib/gibs.ts).
const CASE_07_IMAGERY_DATE = new Date(`${getAirsCoEffectiveDate('2026-10-14')}T00:00:00Z`).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export interface CaseFile {
  id: string;
  caseNumber: string;
  title: string;
  subtitle: string;
  caseType: 'dipole' | 'aquifer' | 'cryosphere' | 'peatland';
  breakpointYear: number;
  regionAId: string;
  regionBId: string;
  cameraCenter: [number, number]; // [lon, lat]
  variable: string;
  unit: string;
  spatialBounds: string;
  rateA: string;
  rateB: string;
  significance: string;
  driverMechanism: string;
  description: string;
}

export interface CaseFilesModalProps {
  allBasins: BasinFeature[];
  onSelectCase: (caseItem: CaseFile) => void;
  onClose: () => void;
}

// oxlint-disable-next-line react/only-export-components
export const DETECTIVE_CASES: CaseFile[] = [
  {
    id: 'case-01',
    caseNumber: 'CASE 01',
    title: 'The Anthropogenic Irrigation Paradox',
    subtitle: 'California Central Valley vs. Great Basin Orographic Divide',
    caseType: 'aquifer',
    breakpointYear: 2014,
    regionAId: 'BASIN_CALIFORNIA_CV',
    regionBId: 'BASIN_GREAT_BASIN_EAST',
    cameraCenter: [-118.5, 38.5],
    variable: 'Terrestrial water storage (GRACE) vs vegetation index (modelled proxy)',
    unit: 'cm/yr vs NDVI units/yr',
    spatialBounds: 'Sierra Nevada Divide (35°N–42°N, 122°W–114°W)',
    rateA: '−1.60 cm/yr TWS (GRACE) vs −0.004 per year vegetation-index proxy (modelled)',
    rateB: '−0.63 cm/yr TWS (Great Basin)',
    significance: 'Central Valley MK Z = −2.44 (p* = 0.015, FDR q = 0.031); Great Basin East Z = −2.33 (FDR q = 0.031)',
    driverMechanism:
      'The Anthropogenic Irrigation Paradox (hypothesis): irrigated crops can stay green on pumped groundwater while storage falls, so a vegetation index alone can miss the loss. Here GRACE shows storage falling by about 1.60 cm/yr; the vegetation series in this app is a modelled proxy and does not show greening, so the pattern is illustrated, not demonstrated.',
    description:
      'Illustrates why a surface vegetation index can miss groundwater loss that gravimetry (GRACE) detects. The vegetation series here is modelled, so this is an illustration, not a test.',
  },
  {
    id: 'case-02',
    caseNumber: 'CASE 02',
    title: 'The South American Monsoon Dipole',
    subtitle: 'SACZ Moisture Deflection: Lower Amazon Tapajós vs. São Francisco Basin',
    caseType: 'dipole',
    breakpointYear: 2014,
    regionAId: 'BASIN_AMAZON_LOWER',
    regionBId: 'BASIN_SAO_FRANCISCO',
    cameraCenter: [-48.0, -8.5],
    variable: 'Terrestrial Water Storage Anomaly (Liquid Water Equivalent)',
    unit: 'cm/yr',
    spatialBounds: 'South American Monsoon System (0°S–20°S, 61°W–36°W)',
    rateA: '+0.66 cm/yr (Lower Amazon wetting)',
    rateB: '−1.19 cm/yr (São Francisco drying)',
    significance: 'Amazon MK Z = +2.19 (p* = 0.029, FDR q = 0.036); São Francisco MK Z = −2.34 (p* = 0.019, FDR q = 0.031)',
    driverMechanism:
      'Hypothesis from the literature: Pacific Walker Cell and South Atlantic Convergence Zone (SACZ) shifts could intensify rain over the Lower Amazon while blocking moisture transport into the eastern Brazilian Highlands. This app does not test it.',
    description:
      'The two basins have opposite-sign trends, but their records correlate only weakly (r = 0.22 in the shipped data; weak link, not supported by this record), so a shared ENSO / SACZ driver is not shown.',
  },
  {
    id: 'case-03',
    caseNumber: 'CASE 03',
    title: 'Gravitational Sea-Level Fingerprinting',
    subtitle: 'Cryospheric Ice Sheet Ablation vs. Barystatic Ocean Fingerprint',
    caseType: 'cryosphere',
    breakpointYear: 2016,
    regionAId: 'BASIN_WEST_ANTARCTICA',
    regionBId: 'BASIN_CASPIAN',
    cameraCenter: [-100.0, -75.0],
    variable: 'Cryospheric Gravimetric Mass Balance & Sea-Level Equivalent',
    unit: 'cm/yr (GRACE basin trend)',
    spatialBounds: 'Amundsen Sea Embayment (75°S, 105°W) & Global Oceans',
    rateA: '−20.66 cm/yr (West Antarctica basin, GRACE). Mass in Gt/yr is not computed here.',
    rateB: '−5.07 cm/yr (Caspian basin, GRACE). A sea-level fingerprint is not computed here.',
    significance: 'West Antarctica MK Z = −3.06 (FDR q = 0.031); Caspian MK Z = −2.95 (FDR q = 0.031)',
    driverMechanism:
      'Background physics (not modelled in this app): when a polar ice sheet loses mass, its gravitational pull on nearby ocean water weakens, so relative sea level falls near the sheet and rises faster far away.',
    description:
      'Illustrates gravitational sea-level fingerprints as background physics. This app shows only the GRACE basin trends, not sea-level fingerprints.',
  },
  {
    id: 'case-04',
    caseNumber: 'CASE 04',
    title: 'The Third Pole vs. Endorheic Desiccation Reversal',
    subtitle: 'Qinghai-Tibetan Plateau Alpine Equilibrium vs. Caspian Sea Drawdown',
    caseType: 'dipole',
    breakpointYear: 2012,
    regionAId: 'BASIN_TIBETAN_PLATEAU',
    regionBId: 'BASIN_CASPIAN',
    cameraCenter: [72.0, 38.0],
    variable: 'High-Altitude Cryospheric Balance vs. Endorheic Evaporative Loss',
    unit: 'cm/yr',
    spatialBounds: 'Eurasian Interior Corridor (30°N–47°N, 46°E–98°E)',
    rateA: '−0.12 cm/yr (Tibetan Plateau, small decline)',
    rateB: '−5.07 cm/yr (Caspian basin, large decline)',
    significance: 'Tibetan MK Z = −2.12 (FDR q = 0.040); Caspian MK Z = −2.95 (FDR q = 0.031)',
    driverMechanism:
      'Contrasts a small decline on the Tibetan Plateau with a large decline in the Caspian basin. Possible contributors to the Caspian loss (hypotheses, not tested here): upstream Volga impoundments and strong evaporation. The Caspian soil-moisture series is a synthetic fill.',
    description:
      'Compares a small and a large water-storage decline in two regions of Eurasia. The records correlate only weakly (r = 0.20).',
  },
  {
    id: 'case-05',
    caseNumber: 'CASE 05',
    title: 'The Himalayan Orographic Monsoon Dipole',
    subtitle: 'Indian Ocean Dipole (IOD) & Monsoon Track: Indus vs. Ganges-Brahmaputra',
    caseType: 'dipole',
    breakpointYear: 2013,
    regionAId: 'BASIN_INDUS',
    regionBId: 'BASIN_GANGES_BRAHMAPUTRA',
    cameraCenter: [78.0, 28.0],
    variable: 'Terrestrial Water Storage Anomaly (Liquid Water Equivalent)',
    unit: 'cm/yr',
    spatialBounds: 'Indo-Gangetic Basin Corridor (22°N–36°N, 67°E–95°E)',
    rateA: '−1.42 cm/yr (Indus drying)',
    rateB: '−1.25 cm/yr (Ganges-Brahmaputra drying)',
    significance: 'Indus MK Z = −2.74 (FDR q = 0.031); Ganges-Brahmaputra MK Z = −2.54 (FDR q = 0.031)',
    driverMechanism:
      'Both basins are drying in the shipped data. Groundwater pumping and monsoon variability are commonly cited contributors (hypotheses, not tested here). The two records are only weakly correlated (r = −0.12), so this is not a dipole.',
    description:
      'Compares two drying basins in South Asia. Extraction and monsoon variability are possible contributors, but this app does not separate them.',
  },
  {
    id: 'case-06',
    caseNumber: 'CASE 06',
    title: 'The African Hydrological Seesaw',
    subtitle: 'ITCZ Meridional Shift: Sahel / Lake Chad vs. Congo Rainforest Basin',
    caseType: 'dipole',
    breakpointYear: 2011,
    regionAId: 'BASIN_SAHEL',
    regionBId: 'BASIN_CONGO',
    cameraCenter: [18.5, 4.5],
    variable: 'Tropical Meridional Water Mass Redistribution',
    unit: 'cm/yr',
    spatialBounds: 'Equatorial & Sub-Saharan African Corridor (12°S–18°N, 11°E–31°E)',
    rateA: '+0.42 cm/yr (Sahel wetting)',
    rateB: '+0.55 cm/yr (Congo wetting)',
    significance: 'Sahel MK Z = +2.58 (FDR q = 0.031); Congo MK Z = +2.37 (FDR q = 0.031)',
    driverMechanism:
      'Hypothesis (not tested here): changes in the Intertropical Convergence Zone (ITCZ) and the West African Monsoon could contribute to the rising water storage in both regions.',
    description:
      'Both basins are wetting in the shipped data, so this is a same-sign comparison, not a seesaw. The correlation between the records is moderate (r = 0.54).',
  },
  {
    id: 'case-07-sea-co-plume',
    caseNumber: 'CASE 07',
    title: 'SE Asia Peatland Dewatering & 5,500m CO Plume',
    subtitle: 'Illustrative scenario: Indonesia (Sumatra & Kalimantan) → Malaysia & Singapore',
    caseType: 'peatland',
    breakpointYear: 2026,
    regionAId: 'BASIN_IOD_EAST',
    regionBId: 'BASIN_IOD_EAST',
    cameraCenter: [106.0, 0.5],
    variable: 'Subsurface Peat Dewatering vs Mid-Tropospheric Carbon Monoxide',
    unit: 'ppbv CO at 500 hPa vs cm/yr',
    spatialBounds: 'Equatorial Southeast Asia (10°S–10°N, 95°E–120°E)',
    rateA: 'Scenario peak 13 to 15 October 2026 (CO above 250 ppbv at 5,500 m; not measured here)',
    rateB: 'About −2.40 cm/yr peat drawdown (assumed for the scenario, not measured)',
    significance: 'Not statistically tested. Archive AIRS imagery shown as an illustration; events are a curated scenario.',
    driverMechanism:
      `Hypothesis: canal drainage and rainfall deficits can lower the peat water table, exposing deep peat to smouldering. The resulting carbon monoxide can be lofted by deep convection to about 5,500 m (500 hPa) and drift across the Strait of Malacca. This app does not model these steps. The carbon-monoxide imagery on the globe is archive imagery from ${CASE_07_IMAGERY_DATE}, shown as an illustration; the fire and plume events are a curated scenario.`,
    description:
      `Illustrative October 2026 scenario, not a live case. The carbon-monoxide imagery on the globe is archive imagery from ${CASE_07_IMAGERY_DATE} (NASA Aqua AIRS), shown as an illustration. The fire and plume events are a curated scenario, not data from the NASA EONET feed.`,
  },
];

export default function CaseFilesModal({
  allBasins,
  onSelectCase,
  onClose,
}: CaseFilesModalProps) {
  const dialog = useModalDialog<HTMLDivElement>(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <div
        {...dialog.props}
        aria-labelledby="case-studies-title"
        onClick={(e) => e.stopPropagation()}
        className="popover w-full max-w-4xl flex flex-col max-h-[88vh] overflow-hidden outline-none"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-4">
          <div>
            <h2 id="case-studies-title" className="text-title text-ink-1 font-semibold">
              Case studies
            </h2>
            <p className="text-label text-ink-2 mt-1">
              <span className="tnum">{allBasins.length}</span> regions, <span className="tnum">{DETECTIVE_CASES.length}</span> curated cases. Each walks through the four questions: what is changing, where, how much, and is it significant.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close case studies"
            className="btn btn-ghost btn-sm shrink-0 w-7 px-0"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* Case list */}
        <div className="overflow-y-auto bg-surface-1 px-5">
          {DETECTIVE_CASES.map((caseItem) => {
            const basinA = allBasins.find(
              (b) => b.properties.basin_id === caseItem.regionAId || b.id === caseItem.regionAId
            );
            const basinB = allBasins.find(
              (b) => b.properties.basin_id === caseItem.regionBId || b.id === caseItem.regionBId
            );

            // Dynamic resolution from allBasins, falling back to static strings
            const dynamicRate = (() => {
              if (basinA && basinB) {
                const sA = `${fmtSigned(basinA.properties.theil_sen_slope)} cm/yr`;
                const sB = `${fmtSigned(basinB.properties.theil_sen_slope)} cm/yr`;
                if (caseItem.id === 'case-07-sea-co-plume') {
                  return `${caseItem.rateA} vs. ${caseItem.rateB}`;
                }
                if (caseItem.id === 'case-01') {
                  return `${sA} TWS (GRACE) vs. ${sB}`;
                }
                return `${sA} vs. ${sB}`;
              }
              return `${caseItem.rateA} vs. ${caseItem.rateB}`;
            })();

            const dynamicSignificance = (() => {
              if (caseItem.id === 'case-07-sea-co-plume') {
                return caseItem.significance;
              }
              if (basinA && basinB) {
                const zA = basinA.properties.mann_kendall_z !== undefined ? fmtSigned(basinA.properties.mann_kendall_z) : null;
                const zB = basinB.properties.mann_kendall_z !== undefined ? fmtSigned(basinB.properties.mann_kendall_z) : null;
                const qA = basinA.properties.p_value_fdr !== undefined
                  ? (basinA.properties.p_value_fdr < 0.001 ? 'FDR q < 0.001' : `FDR q = ${basinA.properties.p_value_fdr.toFixed(3)}`)
                  : null;
                if (zA !== null && zB !== null) {
                  return `MK Z = ${zA} / ${zB} (${qA || 'FDR q < 0.05'})`;
                }
              }
              return caseItem.significance;
            })();

            const isScenario = caseItem.id === 'case-07-sea-co-plume';

            return (
              <section
                key={caseItem.id}
                aria-label={`${caseItem.caseNumber}: ${caseItem.title}`}
                className="py-5 border-t border-line first:border-t-0 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-caption text-ink-3 mb-1">
                      <span className="tnum">{caseItem.caseNumber}</span>
                      <span className="tag">{caseItem.caseType}</span>
                      <span className="tag tnum">
                        {isScenario
                          ? `Scenario year ${caseItem.breakpointYear}`
                          : `Breakpoint ${basinA?.properties.breakpoint_year ?? caseItem.breakpointYear}`}
                      </span>
                      {isScenario && <span className="tag tag-warn">Curated scenario</span>}
                    </div>
                    <h3 className="text-body font-semibold text-ink-1">{caseItem.title}</h3>
                    <p className="text-label text-ink-2 mt-0.5">{caseItem.subtitle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectCase(caseItem)}
                    className="btn btn-secondary btn-sm shrink-0"
                  >
                    <Compass size={14} strokeWidth={1.75} />
                    <span>Investigate case</span>
                    <ChevronRight size={14} strokeWidth={1.75} />
                  </button>
                </div>

                {/* The four questions */}
                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 text-label">
                  <div>
                    <dt className="text-caption text-ink-3">What is changing?</dt>
                    <dd className="text-ink-1 mt-0.5">{caseItem.variable}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-ink-3">Where?</dt>
                    <dd className="text-ink-1 mt-0.5">{caseItem.spatialBounds}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-ink-3">How much?</dt>
                    <dd className="text-ink-1 mt-0.5 tnum">{dynamicRate}</dd>
                  </div>
                  <div>
                    <dt className="text-caption text-ink-3">Is it significant?</dt>
                    <dd className="text-ink-1 mt-0.5 tnum">{dynamicSignificance}</dd>
                  </div>
                </dl>

                {/* Driver mechanism */}
                <p className="text-label text-ink-2 border-t border-line pt-3">
                  <span className="text-ink-1 font-medium">Driver: </span>
                  {caseItem.driverMechanism}
                </p>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
