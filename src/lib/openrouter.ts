import { getLiteratureForBasin } from './scientificLiterature';

export const FREE_MODELS = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'dots-studio/dots-3-note-preview:free',
] as const;

export type FreeModel = (typeof FREE_MODELS)[number];

export interface PlanetaryTriageResult {
  text: string;
  modelUsed: string;
  isLive: boolean;
}

/** Label shown with output when no AI model produced it (no key, or every model failed): a fixed template filled from the statistics. */
export const AI_LABEL_TEMPLATE = 'Template summary (no AI model connected)';
/** Label shown with output produced by a language model. */
export const AI_LABEL_MODEL = 'AI-generated summary. Check it against the statistics.';
export const getTriageLabel = (isLive: boolean): string => (isLive ? AI_LABEL_MODEL : AI_LABEL_TEMPLATE);

export function sanitizePlainTextReport(raw: string): string {
  return raw
    .replace(/\$\$([^$]+)\$\$/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^---\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const CASE_07_LAYA_SYSTEM1_PAYLOAD = {
  triageStatus: 'Illustrative scenario: peatland dewatering and carbon monoxide',
  eventWindow: 'Scenario window 2026-08-01 to 2026-10-19 (illustrative peak 2026-10-13 to 2026-10-15)',
  fourDetectiveAnswers: {
    whatChanged:
      'Scenario: drawdown of the peat water table can allow underground smouldering, which releases carbon monoxide (CO) that deep convection can loft to mid-troposphere levels.',
    where:
      'Scenario locations: peat domes in South Sumatra (-2.99°S, 104.76°E) and Central Kalimantan (-2.21°S, 113.92°E), with smoke able to drift across the Strait of Malacca towards Malaysia and Singapore (1.35°N, 103.82°E).',
    howMuch:
      'Illustrative: a plume lofted to about 5,500 m (500 hPa). The AIRS map layer in this app shows archive imagery from 14 October 2015, not a 2026 measurement.',
    isItSignificant:
      'Not statistically tested in this app. The case combines archive NASA Aqua AIRS 500 hPa CO imagery (14 October 2015), NASA POWER (MERRA-2) evaporative-stress context and a curated set of scenario events. Hotspot data from the ASEAN Specialised Meteorological Centre (ASMC) is not used.'
  },
  civilDefenseAction:
    'A commonly proposed mitigation is canal blocking and rewetting of drained peat to raise water tables toward the surface. This app does not model its effect.',
  provenanceDOIs: [
    'NASA Aqua AIRS L3 CO (500 hPa), used as map imagery only: 10.5067/Aqua/AIRS/DATA301',
    'NASA POWER MERRA-2: 10.5067/QBZ6MG944HW0',
    'NASA EONET v3 feed: eonet.gsfc.nasa.gov/api/v3 (the Case 07 events are curated, not from this feed)'
  ]
};

const SYSTEM_PROMPT = `You are the Stratum-4D analysis assistant, part of a student entry to the NASA Space Apps Challenge (Earth System Trend Detective). You are not an official NASA product.

Your role is to help students and science-literate readers interpret the water-storage statistics supplied below.

CORE SCIENTIFIC FOUNDATIONS:
1. Terrestrial Water Storage Anomaly (ΔTWS): Measured via Liquid Water Equivalent (LWE) thickness in centimeters from GRACE and GRACE-FO twin satellite microwave ranging.
2. Robust Trend Estimation: Theil-Sen Median Slope Estimator (β in cm/yr) with 95% Sen's non-parametric confidence intervals, impervious to outliers.
3. Signal Decomposition: STL (Seasonal and Trend decomposition using Loess) to strip annual/semi-annual hydrologic seasonal oscillations (S_t) from long-term secular trends (T_t).
4. Statistical Significance: Hamed-Rao Modified Mann-Kendall test correcting for temporal lag-1 autocorrelation in residual series. Multiple hypothesis testing adjusted via Benjamini-Hochberg False Discovery Rate (FDR q-value < 0.05).
5. Candidate regional dipoles (hypotheses to test against the supplied correlation, not established facts):
   - South American Monsoon Dipole (Lower Amazon accumulation vs. São Francisco depletion via SACZ shifts)
   - East Asian Monsoon Dipole (Yangtze surplus vs. Yellow River deficit via Western Pacific Subtropical High deflection)
   - Sierra Nevada Orographic Dipole (Pacific Atmospheric River blocking vs. Central Valley overdraft)
6. Solid-Earth context:
   - Viscoelastic lithospheric rebound from deglaciation and mass loss.
   - Inelastic aquifer compaction triggering land subsidence and infrastructure strain.
7. PEER-REVIEWED LITERATURE & BIOME GROUNDING:
   - California Central Valley: Famiglietti et al. (2011) "Satellites measure recent groundwater depletion in California's Central Valley", Geophys. Res. Lett., doi:10.1029/2010GL046442
   - Indus & Ganges-Brahmaputra: Rodell et al. (2009, 2018) "Satellite-based estimates of groundwater depletion in India" & "Emerging trends in global freshwater availability", Nature, doi:10.1038/nature08238 / doi:10.1038/s41586-018-0123-1
   - Amazon & South America: Wiese et al. (2016) "Alternative mascon formulation for GRACE (JPL Mascon RL06 CRI)", J. Geophys. Res., doi:10.1002/2016JB013008
   - General Gravimetry: Tapley et al. (2019) "Contributions of GRACE to understanding climate change", Nature Climate Change, doi:10.1038/s41558-019-0456-2
   - Polar Ice Sheets: Velicogna et al. (2020) "Continuity of ice sheet mass loss in Greenland and Antarctica from GRACE & GRACE-FO", Geophys. Res. Lett., doi:10.1029/2020GL087291

STYLE & OUTPUT GUIDELINES:
- Tone: precise, concise and plain-spoken. Define technical terms briefly.
- Use clear bullet points and quantitative references.
- Always contextualize slopes, Z-scores, and FDR significance when basin data is present.
- Say which series are observed (GRACE / GRACE-FO), reanalysis (NASA POWER) or modelled proxies (NDVI, subsidence, upper-air, water balance). Never present a modelled proxy as a measurement.
- Do not state a cause as confirmed unless the supplied statistics support it; call explanations hypotheses.
- When asked for forward risk (2025-2035), say it is a linear extrapolation of the trend and give the uncertainty.`;

export function formatBasinContext(basin: any): string {
  if (!basin) return '';
  const p = basin.properties || basin;
  if (!p || (!p.basin_name && !basin.basin_name && !basin.target)) return '';

  const basinName = p.basin_name || basin.basin_name || basin.target || 'Monitored Catchment';
  const basinId = p.basin_id || basin.basin_id || basin.targetId || 'ID_UNKNOWN';
  const continent = p.continent || basin.continent || 'Global';
  const areaSqkm = p.area_sqkm || basin.areaKm2;

  const slope = basin.sensSlope !== undefined ? basin.sensSlope : p.theil_sen_slope;
  const pVal = basin.pValue !== undefined ? basin.pValue : (p.p_value_fdr ?? p.p_value_raw);
  const pCorrected = basin.pCorrected !== undefined ? basin.pCorrected : (p.p_value_corrected ?? pVal);
  const rho1 = basin.rho1 !== undefined ? basin.rho1 : p.rho_1_autocorr;
  const nStar = basin.nStar !== undefined ? basin.nStar : p.n_star;
  const breakYear = basin.breakpointYear ?? p.breakpoint_year;
  const toe = basin.toeYear ?? p.time_of_emergence_year;
  const lagDriver = basin.laggedDriver ?? (p.optimal_driver ? `${p.optimal_driver} (lag=${p.driver_lag_months ?? 0}mo, r=${p.driver_r ?? 0})` : undefined);
  const driverAttributionPct = basin.driverAttributionPct ?? (p.driver_r ? Math.round(Math.pow(p.driver_r, 2) * 100) : undefined);

  const parts = [
    `BASIN IDENTIFIER: ${basinName} (${basinId})`,
    `CONTINENT: ${continent}`,
    `AREA: ${areaSqkm ? areaSqkm.toLocaleString() + ' km²' : 'Unknown'}`,
    `THEIL-SEN SLOPE: ${slope !== undefined ? `${slope > 0 ? '+' : ''}${slope.toFixed(4)} cm/yr` : 'N/A'}`,
    `SEN'S 95% CONFIDENCE INTERVAL: [${p.theil_sen_ci_low !== undefined ? p.theil_sen_ci_low.toFixed(3) : 'N/A'}, ${p.theil_sen_ci_high !== undefined ? p.theil_sen_ci_high.toFixed(3) : 'N/A'}]`,
    `HAMED-RAO MANN-KENDALL Z: ${p.mann_kendall_z !== undefined ? p.mann_kendall_z.toFixed(3) : 'N/A'}`,
    `LAG-1 AUTOCORRELATION (ρ₁): ${rho1 !== undefined ? (typeof rho1 === 'number' ? rho1.toFixed(3) : rho1) : 'N/A'}`,
    `EFFECTIVE SAMPLE SIZE (n* / N_eff): ${nStar !== undefined ? nStar : 'N/A'}`,
    `AUTOCORRELATION-CORRECTED p*-VALUE: ${pCorrected !== undefined ? (typeof pCorrected === 'number' ? pCorrected.toFixed(5) : pCorrected) : 'N/A'}`,
    `BENJAMINI-HOCHBERG FDR q-VALUE / p-VALUE: ${pVal !== undefined ? (typeof pVal === 'number' ? pVal.toFixed(5) : pVal) : 'N/A'}`,
    `STATISTICAL VERDICT: ${p.significant ? 'STATISTICALLY SIGNIFICANT DEVIATION (q < 0.05)' : 'INCONCLUSIVE / EQUILIBRIUM'}`,
    `PETTITT REGIME-SHIFT BREAKPOINT YEAR: ${breakYear ?? 'N/A'}`,
    `TIME OF EMERGENCE (ToE, SNR > 2): ${toe ? `${toe}` : 'Not yet emerged / after 2035'}`,
    `TREND CLASSIFICATION: ${p.trend_category || (slope < -0.2 ? 'Depletion' : slope > 0.2 ? 'Surplus' : 'Equilibrium')}`,
  ];

  if (lagDriver) {
    parts.push(`COUPLED CLIMATIC DRIVER: ${lagDriver}`);
  }

  if (driverAttributionPct !== undefined) {
    parts.push(`CLIMATE DRIVER CORRELATION: r² = ${driverAttributionPct}% of variance shared with ${p.optimal_driver || 'a climate oscillation index'} (an association, not a proven cause)`);
  }

  if (p.dipole_system) {
    parts.push(`CLIMATIC DIPOLE DYNAMICS: ${p.dipole_system}`);
    if (p.dipole_partner_id) {
      parts.push(`DIPOLE OPPOSING PARTNER: ${p.dipole_partner_id}`);
    }
  }

  const eonet = basin.activeEonetEvents || basin.activeEonetEvent;
  if (eonet) {
    const list = Array.isArray(eonet) ? eonet : [eonet];
    const eventSummaries = list
      .map((e: any) => `${e.title || e.id || 'Event'} (${e.categories?.[0]?.title || 'Earth Event'})`)
      .join('; ');
    parts.push(`ACTIVE NASA EONET NATURAL DISASTERS: ${eventSummaries}`);
  }

  const pubs = getLiteratureForBasin(basinId, p.anomaly_class || p.trend_category);
  if (pubs.length > 0) {
    const pubCitations = pubs.map((pub) => `${pub.authors} (${pub.year}) "${pub.title}", ${pub.journal}, doi:${pub.doi}`).join('; ');
    parts.push(`GROUNDING SCIENTIFIC LITERATURE: ${pubCitations}`);
  }

  return parts.join('\n');
}

export function generateDeterministicReport(
  basin: any,
  _prompt?: string,
  _modelPreference?: string
): PlanetaryTriageResult {
  const p = basin?.properties || basin || {};

  const isCase07 =
    basin?.id === 'case-07-sea-co-plume' ||
    basin?.properties?.basin_id === 'case-07-sea-co-plume' ||
    basin?.activeCaseStudy === 'case-07-sea-co-plume' ||
    basin?.targetId === 'CASE_07_SEA_CO_PLUME' ||
    p.basin_name?.includes('Kalimantan') ||
    p.basin_name?.includes('Sebangau') ||
    p.basin_name?.includes('Peatland');

  if (isCase07) {
    const p7 = CASE_07_LAYA_SYSTEM1_PAYLOAD;
    const text = AI_LABEL_TEMPLATE + '\n' +
      'Case 07: Southeast Asia peatland dewatering and carbon monoxide at 500 hPa (illustrative scenario)\n' +
      'Status: ' + p7.triageStatus + '\n' +
      'Event window: ' + p7.eventWindow + '\n\n' +
      '1. What changed\n' + p7.fourDetectiveAnswers.whatChanged + '\n\n' +
      '2. Where it is changing\n' + p7.fourDetectiveAnswers.where + '\n\n' +
      '3. How much\n' + p7.fourDetectiveAnswers.howMuch + '\n\n' +
      '4. Is it significant (statistically tested?)\n' + p7.fourDetectiveAnswers.isItSignificant + '\n\n' +
      'Possible mitigation\n' + p7.civilDefenseAction + '\n\n' +
      'Data sources and DOIs\n' + p7.provenanceDOIs.map((doi) => '• ' + doi).join('\n');

    return {
      text,
      modelUsed: 'template:no-ai-model',
      isLive: false,
    };
  }
  const basinName = p.basin_name || 'Global Terrestrial Catchment';
  const basinId = p.basin_id || 'CAT-GLOBAL-REF';
  const continent = p.continent || 'Global';
  const area = p.area_sqkm ? `${p.area_sqkm.toLocaleString()} km²` : 'not available';
  const na = 'not available';
  const hasSlope = typeof p.theil_sen_slope === 'number';
  const slope: number = hasSlope ? p.theil_sen_slope : 0;
  const slopeSign = slope > 0 ? '+' : '';
  const slopeFormatted = hasSlope ? `${slopeSign}${slope.toFixed(4)} cm/yr` : na;
  const ciLow = typeof p.theil_sen_ci_low === 'number' ? p.theil_sen_ci_low.toFixed(3) : na;
  const ciHigh = typeof p.theil_sen_ci_high === 'number' ? p.theil_sen_ci_high.toFixed(3) : na;
  const zScore = typeof p.mann_kendall_z === 'number' ? p.mann_kendall_z.toFixed(2) : na;
  const qVal = typeof p.p_value_fdr === 'number' ? p.p_value_fdr.toFixed(4) : na;
  const pCorr = typeof p.p_value_corrected === 'number' ? p.p_value_corrected.toFixed(4) : na;
  const isSig = typeof p.p_value_fdr === 'number' ? p.p_value_fdr < 0.05 : (p.significant ?? false);
  const isDepleted = slope < 0;

  const annualM3 = Math.abs(slope) * 0.01 * ((p.area_sqkm || 0) * 1e6);
  const megaLiters = Math.round(annualM3 * 0.001);

  // Possible explanations are hypotheses chosen from simple rules on the statistics; none is tested here.
  let causalAttribution: string;
  if (p.dipole_system) {
    causalAttribution = `Possible explanation (not tested here): a regional dipole (${p.dipole_system}) with partner basin ${p.dipole_partner_id || 'n/a'}. Check the correlation between the two records before relying on it.`;
  } else if (slope < -0.8 && p.triangulation?.irreversible_subsidence) {
    causalAttribution = `Possible explanation (not tested here): groundwater use exceeding recharge. The subsidence figure (${p.triangulation?.compaction_rate_mm_yr ?? 'n/a'} mm/yr) is a modelled proxy, not a measurement.`;
  } else if (slope < -0.2) {
    causalAttribution = 'Possible explanation (not tested here): reduced precipitation or higher evaporative demand across the catchment.';
  } else if (slope > 0.2) {
    causalAttribution = 'Possible explanation (not tested here): increased precipitation or recharge.';
  } else {
    causalAttribution = 'Near-flat trend: no clear drying or wetting in this record.';
  }

  const model = 'template:no-ai-model';
  const literature = getLiteratureForBasin(basinId, p.anomaly_class || p.trend_category);
  const literatureLines = literature.length
    ? literature.map((pub) => `• ${pub.authors.split(',')[0]} et al. (${pub.year}) "${pub.title}", ${pub.journal}, doi:${pub.doi}`).join('\n')
    : '• No curated references for this basin.';

  const text = `### ${AI_LABEL_TEMPLATE}
**Region:** ${basinName} · ${continent}
**Area:** ${area}
**Source:** a fixed template filled from the shipped statistics. No AI model wrote this text.

---

#### 1. Water storage rate (Theil-Sen median, GRACE / GRACE-FO)
- **Rate (β):** ${slopeFormatted}${hasSlope ? ` (${isDepleted ? 'storage falling' : 'storage rising'})` : ''}
- **95% confidence interval (Sen):** ${ciLow} to ${ciHigh} cm/yr
- **Volume if the rate applied evenly over the whole basin:** ~${megaLiters.toLocaleString()} megaliters per year
- **Decomposition:** STL (Seasonal and Trend decomposition using Loess) separates the long-term trend T_t from the seasonal cycle S_t.

#### 2. Statistics from the shipped data
- **Hamed-Rao Mann-Kendall Z:** ${zScore}
- **Autocorrelation-corrected p*:** ${pCorr}
- **Lag-1 autocorrelation (ρ₁):** ${p.rho_1_autocorr !== undefined ? Number(p.rho_1_autocorr).toFixed(3) : na}
- **Effective sample size (n*):** ${p.n_star ?? na}
- **Benjamini-Hochberg FDR q-value:** ${qVal}
- **Result:** ${isSig ? 'Statistically significant at α = 0.05 (FDR q < 0.05)' : 'Not significant at α = 0.05'}
- **Pettitt regime-shift year:** ${p.breakpoint_year ?? na}
- **Time of emergence (ToE):** ${p.time_of_emergence_year ?? 'not yet emerged or not available'}
- **Autocorrelation control:** Yue-Pilon trend-preserving pre-whitening on lag-1 autocorrelation (ρ₁).
${p.driver_r ? `- **Climate index correlation:** ${p.optimal_driver || 'ENSO'} (lag ${p.driver_lag_months ?? 0} mo, r = ${Number(p.driver_r).toFixed(2)}, r² = ${Math.round(Math.pow(p.driver_r, 2) * 100)}%). This is an association, not proof of cause.` : ''}

#### 3. Possible explanations (hypotheses)
- ${causalAttribution}
${p.dipole_system ? `- **Dipole system:** ${p.dipole_system}\n- **Partner basin:** ${p.dipole_partner_id || 'n/a'}` : '- No regional dipole is listed for this basin.'}
- **Subsidence indicator (modelled proxy, not InSAR):** ${p.triangulation?.irreversible_subsidence ? 'the model flags possible inelastic compaction.' : 'the model flags no inelastic compaction.'}

#### 4. Linear extrapolation to 2035 (not a forecast)
- **If the trend continued unchanged for 10 years:** ${hasSlope ? `${(slope * 10).toFixed(2)} cm of water thickness` : na}.
- **Exposure:** ${hasSlope ? (isDepleted ? 'Falling storage could affect irrigation, reservoirs and wells; this app does not quantify that.' : 'Rising storage could raise flood and drainage pressure; this app does not quantify that.') : na}

#### 5. References
${literatureLines}`;

  return {
    text: sanitizePlainTextReport(text),
    modelUsed: model,
    isLive: false,
  };
}

export async function askPlanetaryTriage(
  arg1: any,
  arg2?: any,
  modelPreference?: string
): Promise<PlanetaryTriageResult> {
  let prompt: string;
  let basinContext: any;
  if (typeof arg1 === 'string') {
    prompt = arg1;
    basinContext = arg2;
  } else {
    basinContext = arg1;
    prompt = typeof arg2 === 'string' ? arg2 : 'Perform planetary gravimetric triage and hypothesis investigation.';
  }

  const token =
    (typeof window !== 'undefined' ? localStorage.getItem('stratum4d_openrouter_token') || '' : '') ||
    (typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env as any).VITE_OPENROUTER_TOKEN || '' : '') ||
    '';

  const primary = (modelPreference && (FREE_MODELS as readonly string[]).includes(modelPreference))
    ? modelPreference
    : FREE_MODELS[0];

  // Without a key the output is the fixed template (label: AI_LABEL_TEMPLATE)
  if (!token || token.trim() === '' || token === 'your_openrouter_api_key_here') {
    return generateDeterministicReport(basinContext, prompt, primary);
  }

  const modelsToTry: string[] = [primary];
  for (const model of FREE_MODELS) {
    if (!modelsToTry.includes(model)) {
      modelsToTry.push(model);
    }
  }

  const contextStr = basinContext ? formatBasinContext(basinContext) : '';
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(contextStr ? [{ role: 'system', content: `[CURRENT BASIN TELEMETRY]\n${contextStr}` }] : []),
    { role: 'user', content: prompt },
  ];

  for (const model of modelsToTry) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'HTTP-Referer':
            typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
          'X-Title': 'Stratum-4D NASA Space Apps',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
        }),
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        console.warn(`[AI Triage] Rate limit HTTP 429 on model ${model}. Falling back.`);
        continue;
      }

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        console.warn(`[AI Triage] OpenRouter HTTP ${response.status}: ${errBody || response.statusText}`);
        continue;
      }

      const data = await response.json();
      const content =
        data?.choices?.[0]?.message?.content ||
        data?.choices?.[0]?.text ||
        '';

      if (!content) {
        continue;
      }

      return {
        text: sanitizePlainTextReport(content),
        modelUsed: model,
        isLive: true, // model-written: label with AI_LABEL_MODEL
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        console.warn(`[AI Triage] Model ${model} timed out after 5,000ms.`);
      } else {
        console.warn(`[AI Triage] Model ${model} fetch failed:`, err);
      }
    }
  }

  // Fallback to deterministic report if all models or network fail
  return generateDeterministicReport(basinContext, prompt, primary);
}

/**
 * Generates a Detective Brief within about 5,000 ms. If no key is set, or the model is rate-limited or
 * times out, it returns the fixed template from generateDeterministicReport (labelled AI_LABEL_TEMPLATE).
 */
export async function generateDetectiveBrief(
  basin: any,
  prompt?: string,
  modelPreference?: string
): Promise<PlanetaryTriageResult> {
  const primary = (modelPreference && (FREE_MODELS as readonly string[]).includes(modelPreference))
    ? modelPreference
    : FREE_MODELS[0];

  const timeoutPromise = new Promise<PlanetaryTriageResult>((resolve) => {
    setTimeout(() => {
      resolve(generateDeterministicReport(basin, prompt, primary));
    }, 5000);
  });

  try {
    const briefPromise = askPlanetaryTriage(basin, prompt, modelPreference);
    return await Promise.race([briefPromise, timeoutPromise]);
  } catch {
    return generateDeterministicReport(basin, prompt, primary);
  }
}
