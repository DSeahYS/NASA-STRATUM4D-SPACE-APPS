/**
 * Client-Side Non-Parametric Statistics & Teleconnection Math for Stratum-4D
 */

export interface CustomDipoleVerdict {
  pearsonR: number;
  spearmanRho: number;
  trendDivergence: number;
  dipoleStrength: number;
  verdictType: 'strong_inverse' | 'moderate_inverse' | 'secular_divergence' | 'decoupled' | 'moderate_inphase' | 'strong_inphase';
  badgeTitle: string;
  badgeColor: string; // Tailwind color classes
  description: string;
}

/**
 * Calculates Pearson correlation coefficient r between two series
 */
export function calculatePearsonR(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const denom = Math.sqrt(denX * denY);
  return denom === 0 ? 0 : num / denom;
}

/**
 * Calculates Spearman rank correlation coefficient rho between two series
 */
export function calculateSpearmanRho(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  function getRanks(arr: number[]): number[] {
    const indexed = arr.slice(0, n).map((v, i) => ({ v, i }));
    indexed.sort((a, b) => a.v - b.v);
    const ranks = new Array<number>(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j < n - 1 && indexed[j + 1].v === indexed[j].v) j++;
      const rank = (i + j + 2) / 2;
      for (let k = i; k <= j; k++) {
        ranks[indexed[k].i] = rank;
      }
      i = j + 1;
    }
    return ranks;
  }

  const rankX = getRanks(x);
  const rankY = getRanks(y);
  return calculatePearsonR(rankX, rankY);
}

export type DipoleGrade = 'strong' | 'moderate' | 'weak';

/**
 * Grades how well a correlation supports an opposite-phase dipole. Only a negative r can support one:
 * strong at r <= -0.7, moderate from -0.7 to -0.4. A positive r means the two records move together,
 * which is the opposite of a dipole, so it is never graded above weak.
 */
export function gradeDipoleCorrelation(r: number): { grade: DipoleGrade; sentence: string } {
  const shown = `r = ${r < 0 ? '−' : '+'}${Math.abs(r).toFixed(2)}`;
  if (r <= -0.7) {
    return { grade: 'strong', sentence: `The two records move in opposite directions (${shown}): consistent with a regional dipole.` };
  }
  if (r <= -0.4) {
    return { grade: 'moderate', sentence: `The two records tend to move in opposite directions (${shown}): suggestive of a dipole, not conclusive.` };
  }
  if (r >= 0.4) {
    return { grade: 'weak', sentence: `The two records move together (${shown}), so this pair does not behave as a dipole in this record.` };
  }
  return { grade: 'weak', sentence: `Weak link (${shown}); a dipole is not supported by this record.` };
}

/**
 * Evaluates custom dipole pairing metrics and outputs an interactive verdict badge
 */
export function evaluateCustomDipole(
  seriesA: number[],
  seriesB: number[],
  slopeA: number,
  slopeB: number
): CustomDipoleVerdict {
  const r = calculatePearsonR(seriesA, seriesB);
  const rho = calculateSpearmanRho(seriesA, seriesB);
  const divergence = Math.abs(slopeA - slopeB);
  const hasOpposingSlopes = slopeA * slopeB < 0;

  // Dipole strength score (0-100) combining anti-phase correlation, opposing slopes, and rate divergence
  const invR = Math.max(0, -r);
  const divTerm = Math.min(1.0, divergence / 2.5);
  const opposingBonus = hasOpposingSlopes ? 25 : 0;
  const strength = Math.min(
    100,
    Math.max(0, Math.round(45 * invR + 45 * divTerm + opposingBonus))
  );

  if (hasOpposingSlopes) {
    return {
      pearsonR: parseFloat(r.toFixed(3)),
      spearmanRho: parseFloat(rho.toFixed(3)),
      trendDivergence: parseFloat(divergence.toFixed(3)),
      dipoleStrength: strength,
      verdictType: 'strong_inverse',
      badgeTitle: 'Opposite-sign trends (dipole candidate)',
      badgeColor: '',
      description: `Opposite-sign trends in the two basins (sign(β_A) ≠ sign(β_B), Δβ = ${divergence.toFixed(2)} cm/yr; r = ${r.toFixed(2)}). ${gradeDipoleCorrelation(r).sentence}`,
    };
  }

  return {
    pearsonR: parseFloat(r.toFixed(3)),
    spearmanRho: parseFloat(rho.toFixed(3)),
    trendDivergence: parseFloat(divergence.toFixed(3)),
    dipoleStrength: strength,
    verdictType: 'secular_divergence',
    badgeTitle: 'Same-sign trends at different rates',
    badgeColor: '',
    description: `Both regions trend the same way at different rates (Δβ = ${divergence.toFixed(2)} cm/yr; r = ${r.toFixed(2)}). A rate difference like this is not a dipole, and its cause is not tested here.`,
  };
}

/**
 * Calculates Theil-Sen Robust Median Slope over a given time sub-slice
 * Returns slope in cm/yr (assuming monthly data * 12)
 */
export function calculateTheilSenSlope(
  series: number[],
  monthsPerStep: number = 2
): { slope: number; intercept: number; ciLow: number; ciHigh: number } {
  const n = series.length;
  if (n < 3) return { slope: 0, intercept: 0, ciLow: 0, ciHigh: 0 };

  const slopes: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dt = (j - i) * monthsPerStep; // time difference in months
      if (dt > 0) {
        slopes.push(((series[j] - series[i]) / dt) * 12.0); // annual rate in cm/yr
      }
    }
  }

  slopes.sort((a, b) => a - b);
  const mid = Math.floor(slopes.length / 2);
  const medianSlope = slopes.length % 2 === 0 ? (slopes[mid - 1] + slopes[mid]) / 2 : slopes[mid];

  // Intercept = median(y - slope * t)
  const intercepts: number[] = [];
  for (let i = 0; i < n; i++) {
    intercepts.push(series[i] - (medianSlope / 12.0) * (i * monthsPerStep));
  }
  intercepts.sort((a, b) => a - b);
  const intMid = Math.floor(intercepts.length / 2);
  const medianIntercept = intercepts.length % 2 === 0 ? (intercepts[intMid - 1] + intercepts[intMid]) / 2 : intercepts[intMid];

  // Sen's Non-Parametric 95% Confidence Interval
  // C_alpha = Z_0.025 * sqrt(Var(S)) = 1.96 * sqrt(n*(n-1)*(2n+5)/18)
  const varS = (n * (n - 1) * (2 * n + 5)) / 18.0;
  const cAlpha = 1.96 * Math.sqrt(varS);
  const nSlopes = slopes.length;
  const m1 = Math.max(0, Math.min(nSlopes - 1, Math.floor((nSlopes - cAlpha) / 2)));
  const m2 = Math.max(0, Math.min(nSlopes - 1, Math.floor((nSlopes + cAlpha) / 2) + 1));
  const ciLow = slopes[m1];
  const ciHigh = slopes[m2];

  return {
    slope: parseFloat(medianSlope.toFixed(4)),
    intercept: parseFloat(medianIntercept.toFixed(4)),
    ciLow: parseFloat(ciLow.toFixed(4)),
    ciHigh: parseFloat(ciHigh.toFixed(4)),
  };
}

/**
 * Mann-Kendall S and Z-score with Hamed-Rao variance correction for autocorrelation
 */
export function calculateMannKendallZ(
  series: number[],
  options?: { rho1?: number; monthsPerStep?: number; naive?: boolean }
): { s: number; z: number; p: number; rho1: number; varS: number; varSStar: number; nStar: number } {
  const n = series.length;
  if (n < 4) return { s: 0, z: 0, p: 1.0, rho1: 0, varS: 1, varSStar: 1, nStar: Math.max(1, n) };

  const monthsPerStep = options?.monthsPerStep ?? 2;

  let s = 0;
  for (let k = 0; k < n - 1; k++) {
    for (let j = k + 1; j < n; j++) {
      const diff = series[j] - series[k];
      if (diff > 0) s += 1;
      else if (diff < 0) s -= 1;
    }
  }

  const varS = (n * (n - 1) * (2 * n + 5)) / 18.0;

  if (options?.naive || options?.rho1 === 0) {
    let zNaive = 0;
    if (s > 0) zNaive = (s - 1) / Math.sqrt(varS);
    else if (s < 0) zNaive = (s + 1) / Math.sqrt(varS);
    const pNaive = 2 * (1 - normalCdf(Math.abs(zNaive)));
    return {
      s,
      z: parseFloat(zNaive.toFixed(2)),
      p: parseFloat(pNaive.toFixed(5)),
      rho1: 0,
      varS: parseFloat(varS.toFixed(2)),
      varSStar: parseFloat(varS.toFixed(2)),
      nStar: n,
    };
  }

  // 1. Detrend series using Theil-Sen slope
  const sen = calculateTheilSenSlope(series, monthsPerStep);
  const residuals = series.map((y, i) => y - (sen.slope / 12.0) * (i * monthsPerStep) - sen.intercept);

  // 2. Compute rank series of detrended residuals
  const indexed = residuals.map((val, idx) => ({ val, idx }));
  indexed.sort((a, b) => a.val - b.val);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n - 1 && indexed[j + 1].val === indexed[j].val) j++;
    const rank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k].idx] = rank;
    }
    i = j + 1;
  }

  const meanRank = (n + 1) / 2;
  const rankDev = ranks.map((r) => r - meanRank);
  const rankVar = rankDev.reduce((acc, d) => acc + d * d, 0);

  // 3. Hamed & Rao (1998): Sum significant rank autocorrelations rho_k* for k = 1..12 where |rho_k*| > 1.96 / sqrt(n)
  const maxK = Math.min(12, n - 2);
  const critVal = 1.96 / Math.sqrt(n);
  let etaSum = 0;
  let rho1 = options?.rho1 !== undefined && options?.rho1 !== 0 ? options.rho1 : 0;

  if (rankVar > 1e-12) {
    for (let k = 1; k <= maxK; k++) {
      let num = 0;
      for (let idx = 0; idx < n - k; idx++) {
        num += rankDev[idx] * rankDev[idx + k];
      }
      num /= (n - k);
      const den = rankVar / n;
      let rhoK = den > 1e-12 ? num / den : 0;
      if (k === 1) {
        if (options?.rho1 !== undefined && options?.rho1 !== 0) {
          rhoK = options.rho1;
          rho1 = options.rho1;
        } else {
          rho1 = rhoK;
        }
      }

      if (Math.abs(rhoK) > critVal) {
        const weight = (n - k) * (n - k - 1) * (n - k - 2);
        etaSum += weight * rhoK;
      }
    }
  }

  const eta = 1 + (2 / (n * (n - 1) * (n - 2))) * etaSum;
  const varianceInflation = Math.max(1.0, eta);
  const varSStar = Math.max(1e-6, varS * varianceInflation);
  const nStar = Math.max(3, Math.min(n, Math.round(n / varianceInflation)));

  let z = 0;
  if (s > 0) {
    z = (s - 1) / Math.sqrt(varSStar);
  } else if (s < 0) {
    z = (s + 1) / Math.sqrt(varSStar);
  }

  const p = 2 * (1 - normalCdf(Math.abs(z)));

  return {
    s,
    z: parseFloat(z.toFixed(2)),
    p: parseFloat(p.toFixed(5)),
    rho1: parseFloat(rho1.toFixed(3)),
    varS: parseFloat(varS.toFixed(2)),
    varSStar: parseFloat(varSStar.toFixed(2)),
    nStar,
  };
}

export interface PettittResult {
  breakpointYear: number;
  pValue: number;
  isSignificantShift: boolean;
}

/**
 * Pettitt change-point test identifying the exact regime shift breakpoint
 */
export function detectPettittChangePoint(
  values: number[],
  years: number[]
): PettittResult {
  const n = values.length;
  if (n < 4) return { breakpointYear: years[0] || 2002, pValue: 1.0, isSignificantShift: false };

  let maxU = 0;
  let breakIdx = 0;
  for (let t = 0; t < n - 1; t++) {
    let sum = 0;
    for (let i = 0; i <= t; i++) {
      for (let j = t + 1; j < n; j++) {
        sum += Math.sign(values[i] - values[j]);
      }
    }
    const u = Math.abs(sum);
    if (u > maxU) {
      maxU = u;
      breakIdx = t;
    }
  }

  const pValue = 2 * Math.exp((-6 * maxU * maxU) / (Math.pow(n, 3) + Math.pow(n, 2)));
  return {
    breakpointYear: years[breakIdx] || 2002,
    pValue: Math.min(1.0, Math.max(0.0, parseFloat(pValue.toFixed(5)))),
    isSignificantShift: pValue < 0.05,
  };
}

export interface LaggedCorrelationResult {
  maxR: number;
  laggedR: number;
  optimalLag: number;
  optimalLagSteps: number;
  correlationByLag: number[];
}

/**
 * Lagged cross-correlation with climate oscillation index (ENSO, IOD, NAO)
 * Positive lag: index leads basin catchment by tau months.
 * Each step in bi-monthly time series represents 2 months (monthsPerStep = 2).
 */
export function computeLaggedCorrelation(
  basinSeries: number[],
  indexSeries: number[],
  maxLagSteps = 6,
  monthsPerStep = 2
): LaggedCorrelationResult {
  const n = Math.min(basinSeries.length, indexSeries.length);
  if (n < 12) {
    return { maxR: 0, laggedR: 0, optimalLag: 0, optimalLagSteps: 0, correlationByLag: [] };
  }

  const correlationByLag: number[] = [];
  let bestR = 0;
  let bestLagSteps = 0;

  for (let lag = 0; lag <= maxLagSteps; lag++) {
    const idxSlice: number[] = [];
    const bsnSlice: number[] = [];
    for (let t = lag; t < n; t++) {
      idxSlice.push(indexSeries[t - lag]);
      bsnSlice.push(basinSeries[t]);
    }
    const r = calculatePearsonR(bsnSlice, idxSlice);
    correlationByLag.push(parseFloat(r.toFixed(4)));

    if (Math.abs(r) > Math.abs(bestR)) {
      bestR = r;
      bestLagSteps = lag;
    }
  }

  return {
    maxR: parseFloat(bestR.toFixed(4)),
    laggedR: parseFloat(bestR.toFixed(4)),
    optimalLag: bestLagSteps * monthsPerStep,
    optimalLagSteps: bestLagSteps,
    correlationByLag,
  };
}

function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob =
    d *
    t *
    (0.3193815 +
      t *
        (-0.3565638 +
          t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

/**
 * Calculates Effective Sample Size n* given lag-1 autocorrelation rho1
 * Clamps rho1 in [0, 0.95] and n* in [3, n]
 */
export function calculateEffectiveSampleSize(n: number, rho1: number): number {
  if (n < 3) return Math.max(1, n);
  const rho1Clamped = Math.max(0, Math.min(0.95, isNaN(rho1) ? 0 : rho1));
  const varianceInflation = (1 + rho1Clamped) / (1 - rho1Clamped);
  const nStar = Math.max(3, Math.min(n, n / varianceInflation));
  return Math.round(nStar);
}

/**
 * Strips cyclical oscillations driven by a lagged climate index (e.g. ENSO, IOD)
 * Regresses basin values against the lagged index series and subtracts the cyclical component.
 */
export function isolateSecularTrend(
  basinValues: number[],
  indexValues: number[],
  optimalLag: number = 0
): { cyclicalComponent: number[]; residualSeries: number[] } {
  const n = Math.min(basinValues.length, indexValues.length);
  if (n === 0) {
    return { cyclicalComponent: [], residualSeries: [] };
  }
  const lag = Math.max(0, Math.floor(optimalLag));

  // Align lagged index
  const xAligned: number[] = [];
  const yAligned: number[] = [];
  for (let t = lag; t < n; t++) {
    xAligned.push(indexValues[t - lag]);
    yAligned.push(basinValues[t]);
  }

  let beta = 0;
  let meanX = 0;
  if (xAligned.length > 2) {
    meanX = xAligned.reduce((a, b) => a + b, 0) / xAligned.length;
    const meanY = yAligned.reduce((a, b) => a + b, 0) / yAligned.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < xAligned.length; i++) {
      const dx = xAligned[i] - meanX;
      num += dx * (yAligned[i] - meanY);
      den += dx * dx;
    }
    beta = den > 1e-9 ? num / den : 0;
  }

  const cyclicalComponent: number[] = new Array(n);
  const residualSeries: number[] = new Array(n);

  for (let t = 0; t < n; t++) {
    const idxT = Math.max(0, t - lag);
    const xVal = indexValues[idxT];
    const cyc = parseFloat((beta * (xVal - meanX)).toFixed(4));
    cyclicalComponent[t] = cyc;
    residualSeries[t] = parseFloat((basinValues[t] - cyc).toFixed(4));
  }

  return { cyclicalComponent, residualSeries };
}

/**
 * Benjamini-Hochberg False Discovery Rate (FDR) procedure across array of p-values
 * Returns boolean array of same length indicating significance at given alpha (default 0.05).
 */
export function applyBenjaminiHochbergFDR(pValues: number[], alpha: number = 0.05): boolean[] {
  const m = pValues.length;
  if (m === 0) return [];

  const indexed = pValues.map((p, i) => ({ p: isNaN(p) ? 1.0 : p, i }));
  indexed.sort((a, b) => a.p - b.p);

  // Find largest rank k (1-indexed) where p <= (k / m) * alpha
  let maxK = -1;
  for (let rank = 1; rank <= m; rank++) {
    const threshold = (rank / m) * alpha;
    if (indexed[rank - 1].p <= threshold) {
      maxK = rank - 1;
    }
  }

  const results = new Array<boolean>(m).fill(false);
  if (maxK >= 0) {
    for (let k = 0; k <= maxK; k++) {
      results[indexed[k].i] = true;
    }
  }
  return results;
}

/**
 * Computes Time of Emergence (ToE):
 * The year when the cumulative secular trend signal permanently exceeds 2 * std of detrended residuals (SNR > 2.0).
 */
export function calculateTimeOfEmergence(
  values: number[],
  years: number[],
  slope: number
): number | null {
  const n = Math.min(values.length, years.length);
  if (n < 4 || Math.abs(slope) < 1e-5) return null;

  const startYear = years[0];
  const endYear = years[n - 1];
  const totalSpan = endYear - startYear;
  if (totalSpan <= 0) return null;

  // Compute detrended residuals: values[i] - (meanVal + slope * dt)
  const meanVal = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanT = (startYear + endYear) / 2;

  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const t = years[i] - meanT;
    const expected = meanVal + slope * t;
    const res = values[i] - expected;
    sumSq += res * res;
  }
  const stdRes = Math.sqrt(sumSq / n);
  if (stdRes < 1e-6) return Math.round(startYear);

  const noiseThreshold = 2.0 * stdRes; // 2 * std of residuals (SNR > 2.0)
  const absSlope = Math.abs(slope);

  // Check historical record step-by-step
  for (let i = 0; i < n; i++) {
    const elapsed = Math.max(0, years[i] - startYear);
    const signal = absSlope * elapsed;
    if (signal >= noiseThreshold) {
      let permanent = true;
      for (let j = i; j < n; j++) {
        if (absSlope * Math.max(0, years[j] - startYear) < noiseThreshold) {
          permanent = false;
          break;
        }
      }
      if (permanent) {
        return Math.round(years[i]);
      }
    }
  }

  // If not yet emerged within historical observation, calculate forward projection year
  const yearsNeeded = noiseThreshold / absSlope;
  const projectedYear = Math.round(startYear + yearsNeeded);
  if (projectedYear <= 2050) {
    return projectedYear;
  }

  return null;
}

export interface RigorousTrendResult {
  theilSenSlope: number; // rate per year
  pRaw: number; // naive p-value (uncorrected Mann-Kendall / OLS)
  pCorrected: number; // Hamed-Rao AR(1) corrected p-value (p*)
  rho1: number; // lag-1 autocorrelation
  nStar: number; // effective sample size N_eff
  varianceInflation: number;
  snr: number; // |slope| * duration / std(residuals)
  timeOfEmergence: number | null; // year when signal permanently exceeds 2*noise
  breakpointYear: number; // Pettitt regime shift year
  pettittP: number;
  verdict: 'SIGNIFICANT_TREND' | 'RED_NOISE_ILLUSION' | 'INTERNAL_VARIABILITY';
}

/**
 * Conducts full planetary rigorous trend analysis:
 * 1. Theil-Sen robust slope (rate per year)
 * 2. Naive Mann-Kendall p-value (pRaw)
 * 3. Detrended residuals, lag-1 autocorrelation (rho1), variance inflation, and Hamed-Rao corrected p-value (pCorrected)
 * 4. Signal-to-Noise Ratio (SNR)
 * 5. Time of Emergence (ToE)
 * 6. Pettitt Change-Point Test
 * 7. Verdict classification
 */
export function analyzeEarthTrend(years: number[], values: number[]): RigorousTrendResult {
  const n = Math.min(years.length, values.length);
  if (n < 3) {
    return {
      theilSenSlope: 0,
      pRaw: 1.0,
      pCorrected: 1.0,
      rho1: 0,
      nStar: Math.max(1, n),
      varianceInflation: 1.0,
      snr: 0,
      timeOfEmergence: null,
      breakpointYear: years[0] || 2002,
      pettittP: 1.0,
      verdict: 'INTERNAL_VARIABILITY',
    };
  }

  const startYear = years[0];
  const endYear = years[n - 1];
  const totalSpan = Math.abs(endYear - startYear);
  const avgDt = totalSpan > 0 && n > 1 ? totalSpan / (n - 1) : 1;
  const isMonthIndices = startYear < 1000 && Math.abs(avgDt - 1) < 0.2;
  const scaleMultiplier = isMonthIndices ? 12.0 : 1.0;

  // 1. Calculate Theil-Sen robust slope
  const slopes: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dt = years[j] - years[i];
      if (Math.abs(dt) > 1e-6) {
        slopes.push(((values[j] - values[i]) / dt) * scaleMultiplier);
      }
    }
  }

  let theilSenSlope = 0;
  if (slopes.length > 0) {
    slopes.sort((a, b) => a - b);
    const mid = Math.floor(slopes.length / 2);
    theilSenSlope = slopes.length % 2 === 0
      ? (slopes[mid - 1] + slopes[mid]) / 2
      : slopes[mid];
  }

  // 2. Mann-Kendall naive and Hamed-Rao corrected via unified calculateMannKendallZ
  const mkNaive = calculateMannKendallZ(values, { naive: true });
  const mkCorrected = calculateMannKendallZ(values);

  const pRaw = mkNaive.p;
  const pCorrected = mkCorrected.p;
  const rho1 = mkCorrected.rho1;
  const nStar = mkCorrected.nStar;
  const varianceInflation = mkCorrected.varSStar / (mkCorrected.varS || 1);

  // 3. Detrended residuals for SNR calculation
  const meanVal = values.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const meanYear = (startYear + endYear) / 2;

  let den = 0;
  for (let i = 0; i < n; i++) {
    const t = years[i] - meanYear;
    const dev = values[i] - (meanVal + theilSenSlope * t);
    den += dev * dev;
  }

  // 4. Calculate SNR = |slope| * duration / std(residuals)
  const stdRes = Math.sqrt(den / n);
  const duration = totalSpan > 0 ? totalSpan : (n > 1 ? n - 1 : 1);
  const snr = stdRes > 1e-6 ? (Math.abs(theilSenSlope) * duration) / stdRes : 0;

  // 5. Calculate Time of Emergence (ToE)
  const timeOfEmergence = calculateTimeOfEmergence(values, years, theilSenSlope);

  // 6. Pettitt regime shift test
  const pettitt = detectPettittChangePoint(values, years);
  const breakpointYear = pettitt.breakpointYear;
  const pettittP = pettitt.pValue;

  // 7. Determine 3-state verdict
  let verdict: 'SIGNIFICANT_TREND' | 'RED_NOISE_ILLUSION' | 'INTERNAL_VARIABILITY';
  if (pCorrected < 0.05) {
    verdict = 'SIGNIFICANT_TREND';
  } else if (pRaw < 0.05 && pCorrected >= 0.05) {
    verdict = 'RED_NOISE_ILLUSION';
  } else {
    verdict = 'INTERNAL_VARIABILITY';
  }

  return {
    theilSenSlope: parseFloat(theilSenSlope.toFixed(4)),
    pRaw,
    pCorrected,
    rho1: parseFloat(rho1.toFixed(3)),
    nStar,
    varianceInflation: parseFloat(varianceInflation.toFixed(3)),
    snr: parseFloat(snr.toFixed(2)),
    timeOfEmergence,
    breakpointYear,
    pettittP,
    verdict,
  };
}

/**
 * Calculates first-order partial correlation coefficient between X and Y controlling for Z:
 * r_XY.Z = (rXY - rXZ * rYZ) / sqrt((1 - rXZ^2) * (1 - rYZ^2))
 */
export function calculatePartialCorrelation(rXY: number, rXZ: number, rYZ: number): number {
  const term1 = 1 - rXZ * rXZ;
  const term2 = 1 - rYZ * rYZ;
  if (term1 <= 0 || term2 <= 0) return 0;
  const denom = Math.sqrt(term1 * term2);
  if (denom < 1e-6 || isNaN(denom)) return 0;
  const num = rXY - rXZ * rYZ;
  const rPartial = num / denom;
  const clamped = Math.max(-1, Math.min(1, isNaN(rPartial) ? 0 : rPartial));
  return parseFloat(clamped.toFixed(4));
}

/**
 * Calculates causal attribution percentage:
 * If |rXY| < 0.05, return 0.
 * Otherwise: max(0, min(100, round((1 - |rPartial| / |rXY|) * 100)))
 */
export function calculateAttributionPercentage(rXY: number, rPartial: number): number {
  if (Math.abs(rXY) < 0.05 || isNaN(rXY) || isNaN(rPartial)) {
    return 0;
  }
  const fraction = Math.abs(rPartial) / Math.abs(rXY);
  const attribution = (1 - fraction) * 100;
  return Math.max(0, Math.min(100, Math.round(attribution)));
}

export interface LinearRegressionTTestResult {
  slope: number;
  intercept: number;
  r: number;
  r2: number;
  se: number;
  tStat: number;
  pValue: number;
  df: number;
  sigmaResidual: number;
}

export interface ObservationHorizonResult {
  currentMonths: number;
  currentYears: number;
  requiredMonths: number;
  requiredYears: number;
  additionalMonths: number;
  additionalYears: number;
  targetYear: number;
  currentNStar: number;
  requiredNStar: number;
  isDetectable: boolean;
}

/**
 * Natural logarithm of the Gamma function via Lanczos approximation (g=7, n=9)
 */
function logGamma(z: number): number {
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109583654525,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = p[0];
  for (let i = 1; i < p.length; i++) {
    x += p[i] / (z + i);
  }
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Continued fraction evaluation for the incomplete beta function (Lentz's method)
 */
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 100;
  const EPS = 3.0e-7;
  const FPMIN = 1.0e-30;

  const qab = a + b;
  const qap = a + 1.0;
  const qam = a - 1.0;
  let c = 1.0;
  let d = 1.0 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1.0 / d;
  let h = d;

  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1.0) <= EPS) break;
  }
  return h;
}

/**
 * Regularized Incomplete Beta Function I_x(a, b)
 */
export function regularizedIncompleteBeta(a: number, b: number, x: number): number {
  if (x < 0 || x > 1 || isNaN(x)) {
    return NaN;
  }
  if (x === 0) return 0;
  if (x === 1) return 1;

  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) +
    a * Math.log(x) +
    b * Math.log(1.0 - x)
  );

  if (x < (a + 1.0) / (a + b + 2.0)) {
    return (bt * betacf(a, b, x)) / a;
  } else {
    return 1.0 - (bt * betacf(b, a, 1.0 - x)) / b;
  }
}

/**
 * Two-tailed p-value for Student's t-distribution.
 * Uses regularizedIncompleteBeta for exact computation, and normalCdf for df >= 120.
 */
export function studentTTwoTailedPValue(t: number, df: number): number {
  if (isNaN(t) || isNaN(df) || df <= 0) return 1.0;
  const absT = Math.abs(t);
  if (absT === 0) return 1.0;

  if (df >= 120) {
    // Large-sample asymptotic normal limit (df >= 120)
    const p = 2 * (1 - normalCdf(absT));
    return Math.max(0, Math.min(1.0, isNaN(p) ? 1.0 : p));
  }

  // Exact Student-t: I_x(df/2, 1/2) with x = df / (df + t^2)
  const x = df / (df + absT * absT);
  const p = regularizedIncompleteBeta(df / 2.0, 0.5, x);
  return Math.max(0, Math.min(1.0, isNaN(p) ? 1.0 : p));
}

/**
 * Ordinary Least Squares linear regression with two-tailed t-test for slope significance
 */
export function calculateLinearRegressionTTest(x: number[], y: number[]): LinearRegressionTTestResult {
  const n = Math.min(x.length, y.length);
  if (n < 3) {
    return {
      slope: 0,
      intercept: n > 0 ? y[0] : 0,
      r: 0,
      r2: 0,
      se: 0,
      tStat: 0,
      pValue: 1.0,
      df: Math.max(1, n - 2),
      sigmaResidual: 0,
    };
  }

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  if (sxx < 1e-12) {
    return {
      slope: 0,
      intercept: meanY,
      r: 0,
      r2: 0,
      se: 0,
      tStat: 0,
      pValue: 1.0,
      df: n - 2,
      sigmaResidual: 0,
    };
  }

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = intercept + slope * x[i];
    const res = y[i] - pred;
    ssRes += res * res;
  }

  const df = n - 2;
  const residualVariance = ssRes / df;
  const sigmaResidual = Math.sqrt(Math.max(0, residualVariance));
  const se = sigmaResidual / Math.sqrt(sxx);

  const tStat = se > 1e-12 ? slope / se : 0;
  const pValue = se > 1e-12 ? studentTTwoTailedPValue(tStat, df) : 1.0;

  const rRaw = (sxx > 1e-12 && syy > 1e-12) ? sxy / Math.sqrt(sxx * syy) : 0;
  const r = Math.max(-1.0, Math.min(1.0, isNaN(rRaw) ? 0 : rRaw));
  const r2 = r * r;

  return {
    slope,
    intercept,
    r,
    r2,
    se,
    tStat,
    pValue,
    df,
    sigmaResidual,
  };
}

/**
 * Calculates observation horizon (required observation period for trend detection at p < 0.05).
 * Grounded in Weatherhead et al. (1998) trend detection theory in serially correlated time series:
 *   t = |beta| / SE(beta), with SE(beta) proportional to T^(-3/2) * sqrt((1+rho1)/(1-rho1)).
 */
export function calculateObservationHorizon(
  currentMonths: number,
  currentYear: number,
  beta: number,
  sigmaResidual: number,
  rho1: number = 0,
  isAnnualBeta: boolean = true
): ObservationHorizonResult {
  const safeMonths = Math.max(12, isNaN(currentMonths) ? 264 : currentMonths);
  const safeYear = isNaN(currentYear) || currentYear < 1900 ? 2024 : currentYear;
  const currentYears = safeMonths / 12.0;

  const annualBeta = isAnnualBeta ? beta : beta * 12.0;
  const absBeta = Math.abs(annualBeta);
  const sigma = Math.max(1e-4, isNaN(sigmaResidual) ? 2.5 : sigmaResidual);

  const rhoClamped = Math.max(0, Math.min(0.95, isNaN(rho1) ? 0 : rho1));
  const vif = (1 + rhoClamped) / (1 - rhoClamped);

  const currentN = Math.max(3, Math.round(safeMonths / 2)); // Bi-monthly sampling
  const currentNStar = calculateEffectiveSampleSize(currentN, rhoClamped);

  // Discrete time spread over safeMonths (in years)
  const dt = currentYears / currentN;
  const sxx = ((currentN * (currentN * currentN - 1)) / 12) * dt * dt;
  const seBeta = (sigma / Math.sqrt(Math.max(1e-6, sxx))) * Math.sqrt(vif);

  const tCurr = seBeta > 1e-12 ? absBeta / seBeta : 0;
  const tTarget = 1.95996; // Critical t for two-tailed p = 0.05

  if (tCurr >= tTarget && absBeta > 1e-4) {
    return {
      currentMonths: safeMonths,
      currentYears: parseFloat(currentYears.toFixed(1)),
      requiredMonths: safeMonths,
      requiredYears: parseFloat(currentYears.toFixed(1)),
      additionalMonths: 0,
      additionalYears: 0,
      targetYear: Math.round(safeYear),
      currentNStar,
      requiredNStar: currentNStar,
      isDetectable: true,
    };
  }

  // To reach tTarget from tCurr: (T_req / T_curr)^(3/2) = tTarget / tCurr
  // T_req = T_curr * (tTarget / max(0.02, tCurr))^(2/3)
  const safeTCurr = Math.max(0.05, tCurr);
  const durationExpansionRatio = Math.min(10.0, Math.pow(tTarget / safeTCurr, 2.0 / 3.0));

  const requiredMonths = Math.round(safeMonths * durationExpansionRatio);
  const additionalMonths = Math.max(0, requiredMonths - safeMonths);
  const additionalYears = parseFloat((additionalMonths / 12.0).toFixed(1));
  const targetYear = parseFloat((safeYear + additionalYears).toFixed(1));
  const requiredNStar = Math.max(currentNStar, Math.round(currentNStar * durationExpansionRatio));

  return {
    currentMonths: safeMonths,
    currentYears: parseFloat(currentYears.toFixed(1)),
    requiredMonths,
    requiredYears: parseFloat((requiredMonths / 12.0).toFixed(1)),
    additionalMonths,
    additionalYears,
    targetYear,
    currentNStar,
    requiredNStar,
    isDetectable: false,
  };
}

export interface FormattedDecadalTrend {
  decadalSlopeText: string;
  annualSlopeText: string;
  ci95Text: string;
  significanceBadge: string;
}

export function formatDecadalTrend(
  slopePerYear: number,
  unit: string,
  pValue: number,
  qValue?: number,
  ciLowPerYear?: number,
  ciHighPerYear?: number
): FormattedDecadalTrend {
  const decadal = slopePerYear * 10;
  const sign = decadal >= 0 ? '+' : '';
  const precision = Math.abs(decadal) < 0.1 ? 4 : Math.abs(decadal) < 1 ? 3 : 2;

  const decadalSlopeText = `${sign}${decadal.toFixed(precision)} ${unit}/decade`;
  const annualSlopeText = `(${sign}${slopePerYear.toFixed(precision + 1)} ${unit}/yr)`;

  let ci95Text = '95% CI: Sen non-parametric';
  if (ciLowPerYear !== undefined && ciHighPerYear !== undefined) {
    const lowDec = (ciLowPerYear * 10).toFixed(precision);
    const highDec = (ciHighPerYear * 10).toFixed(precision);
    ci95Text = `95% CI [${lowDec}, ${highDec}] ${unit}/dec`;
  }

  const effectiveP = qValue ?? pValue;
  const pText = pValue < 0.001 ? 'p < 0.001' : `p = ${pValue.toFixed(3)}`;
  const qText = qValue !== undefined ? ` (FDR q = ${qValue.toFixed(3)})` : '';
  const significanceBadge = `${pText}${qText}, ${effectiveP < 0.05 ? 'significant' : 'not significant'}`;

  return { decadalSlopeText, annualSlopeText, ci95Text, significanceBadge };
}

