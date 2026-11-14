"""
Recompute basin trend statistics from the SHIPPED time series.

Why this exists: basins.geojson ships 132 bimonthly epochs per basin
(Apr 2002 - Feb 2024), but the stored Mann-Kendall S/tau/Z were computed
on an unshipped 263-point monthly series with inverted sign relative to
the Theil-Sen slope. This script regenerates every derived statistic
from the series actually shipped, so all numbers are reproducible:

  python pipeline/recompute_stats.py

Method (on time_series.deseasonalized, n = 132):
  1. Yue-Pilon trend-free pre-whitening (TFPW) using the stored
     Theil-Sen slope (verified independently, left unchanged).
  2. Mann-Kendall S / tau with tie-corrected variance -> p_value_naive.
  3. Hamed-Rao (1998) variance inflation Var*(S) -> p_value_corrected,
     mann_kendall_z (signed consistently with the slope), n_star.
  4. Benjamini-Hochberg FDR across basins -> p_value_fdr, significant.
  5. Pettitt break-point test -> breakpoint_year, pettitt_p (floored
     at 1e-4; never stored as exactly 0).
  6. Lagged (0-12 mo) Pearson attribution of Theil-Sen-detrended
     anomalies vs NOAA indices in climate_indices.json
     -> optimal_driver, driver_r, driver_lag_months.
  7. Dipole partner correlation of detrended anomalies on common
     dates -> dipole_r. (Detrending is essential: correlating two
     trending series measures shared trend, not teleconnection.)
Also refreshes aggregate counts in summary.json.
"""

import json
import math
from pathlib import Path

import numpy as np
from scipy import stats

ROOT = Path(__file__).resolve().parent.parent
GEOJSON = ROOT / "public" / "data" / "basins.geojson"
SUMMARY = ROOT / "public" / "data" / "summary.json"
CLIMATE = ROOT / "public" / "data" / "climate_indices.json"


def ym(s):
    y, m = s.split("-")[:2]
    return int(y) * 12 + int(m)


def ym_str(v):
    y, m = divmod(v, 12)
    return f"{y:04d}-{m:02d}" if m else f"{y - 1:04d}-12"


def lag1_autocorr(x):
    x = np.asarray(x, float)
    a, b = x[:-1] - x.mean(), x[1:] - x.mean()
    return float(np.dot(a, b) / np.dot(x - x.mean(), x - x.mean()))


def mann_kendall(y):
    y = np.asarray(y, float)
    n = len(y)
    S = 0.0
    for i in range(n):
        S += float(np.sum(np.sign(y[i + 1:] - y[i])))
    _, counts = np.unique(y, return_counts=True)
    var = (n * (n - 1) * (2 * n + 5) - float(np.sum(counts * (counts - 1) * (2 * counts + 5)))) / 18.0
    tau = S / (0.5 * n * (n - 1))
    return S, tau, var


def z_and_p(S, var):
    if S > 0:
        z = (S - 1) / math.sqrt(var)
    elif S < 0:
        z = (S + 1) / math.sqrt(var)
    else:
        z = 0.0
    return z, float(2 * (1 - stats.norm.cdf(abs(z))))


def hamed_rao_cf(y):
    """Hamed & Rao (1998) variance correction factor from rank autocorrelations."""
    y = np.asarray(y, float)
    n = len(y)
    ranks = stats.rankdata(y)
    r = ranks - ranks.mean()
    denom = float(np.dot(r, r))
    total = 0.0
    for i in range(1, n):
        rho = float(np.dot(r[:-i], r[i:])) / denom
        total += (n - i) * (n - i - 1) * (n - i - 2) * rho
    return 1.0 + (2.0 / (n * (n - 1) * (n - 2))) * total


def pettitt(y, dates):
    y = np.asarray(y, float)
    n = len(y)
    U = np.zeros(n)
    for t in range(n):
        # U_t = sum_{i<=t} sum_{j>t} sign(x_i - x_j)
        U[t] = float(sum(np.sign(y[i] - y[j]) for i in range(t + 1) for j in range(t + 1, n)))
    k = int(np.argmax(np.abs(U)))
    K = abs(U[k])
    p = 2.0 * math.exp(-6.0 * K * K / (n ** 3 + n ** 2))
    return int(dates[k].split("-")[0]), max(min(p, 1.0), 1e-4)


def bh_fdr(pvals):
    p = np.asarray(pvals, float)
    n = len(p)
    order = np.argsort(p)
    q = p[order] * n / (np.arange(n) + 1)
    q = np.minimum.accumulate(q[::-1])[::-1]
    out = np.empty(n)
    out[order] = np.minimum(q, 1.0)
    return out


def main():
    geo = json.loads(GEOJSON.read_text(encoding="utf-8"))
    climate = json.loads(CLIMATE.read_text(encoding="utf-8"))
    cidx = {d: i for i, d in enumerate(climate["dates"])}
    drivers = {"ENSO_MEI": climate["enso_mei"], "IOD_DMI": climate["iod_dmi"], "NAO": climate["nao"]}

    feats = geo["features"]
    p_corr_list = []

    for f in feats:
        p = f["properties"]
        ts = p["time_series"]
        dates, y = ts["dates"], np.array(ts["deseasonalized"], float)
        n = len(y)
        t = np.array([ym(d) for d in dates], float)
        t = t - t[0]

        # --- Yue-Pilon TFPW (slope kept from stored, verified Theil-Sen) ---
        slope_per_month = p["theil_sen_slope"] / 12.0
        detrended = y - slope_per_month * t
        r1 = lag1_autocorr(detrended)
        p["rho_1_autocorr"] = round(r1, 4)
        if abs(r1) > 1.96 / math.sqrt(n):
            pw = detrended[1:] - r1 * detrended[:-1]
            y_test = np.concatenate([[y[0]], pw + slope_per_month * t[1:]])
            p["yue_pilon_prewhitened"] = True
        else:
            y_test = y
            p["yue_pilon_prewhitened"] = False

        # --- Mann-Kendall + Hamed-Rao ---
        S, tau, var = mann_kendall(y_test)
        _, p_naive = z_and_p(S, var)
        cf = max(hamed_rao_cf(y_test), 1e-9)
        var_star = var * cf
        z_corr, p_corr = z_and_p(S, var_star)
        p["mann_kendall_s"] = float(S)
        p["mann_kendall_tau"] = round(float(tau), 4)
        p["mann_kendall_var_s"] = round(float(var_star), 4)
        p["mann_kendall_z"] = round(float(z_corr), 4)
        p["p_value_naive"] = round(float(p_naive), 5)
        p["p_value_corrected"] = round(float(p_corr), 5)
        p["p_value_raw"] = p["p_value_corrected"]
        p["n_star"] = round(n / cf, 2)
        p_corr_list.append(p_corr)

        # --- Pettitt ---
        year, pp = pettitt(y, dates)
        p["breakpoint_year"] = year
        p["pettitt_p"] = round(float(pp), 4)
        p["is_significant_shift"] = bool(pp < 0.05)

        # --- Driver attribution on detrended anomalies (lags 0-12 months) ---
        best = None
        for name, series in drivers.items():
            for lag in range(13):
                xs, ys = [], []
                for d, v in zip(dates, detrended):
                    j = cidx.get(ym_str(ym(d) - lag))
                    if j is not None:
                        xs.append(series[j]); ys.append(v)
                if len(xs) > 20:
                    r = float(np.corrcoef(xs, ys)[0, 1])
                    if best is None or abs(r) > abs(best[1]):
                        best = (name, r, lag)
        p["optimal_driver"], r_best, lag_best = best
        p["driver_r"] = round(r_best, 4)
        p["driver_lag_months"] = int(lag_best)

    # --- Benjamini-Hochberg FDR + verdicts ---
    qvals = bh_fdr(p_corr_list)
    for f, q in zip(feats, qvals):
        p = f["properties"]
        p["p_value_fdr"] = round(float(q), 5)
        p["significant"] = bool(q < 0.05)
        if p["significant"]:
            p["verdict"] = "SIGNIFICANT_TREND"
        elif p["p_value_naive"] < 0.05:
            p["verdict"] = "RED_NOISE_ILLUSION"
        else:
            p["verdict"] = "INTERNAL_VARIABILITY"

    # --- Dipole partner correlations of detrended anomalies on common dates ---
    def detrended_anom(p):
        ts = p["time_series"]
        t = np.array([ym(d) for d in ts["dates"]], float)
        t -= t[0]
        return np.array(ts["deseasonalized"], float) - (p["theil_sen_slope"] / 12.0) * t

    by_id = {f["properties"]["basin_id"]: f["properties"] for f in feats}
    for f in feats:
        p = f["properties"]
        partner = by_id.get(p.get("dipole_partner_id") or "")
        if partner is None:
            continue
        da = dict(zip(p["time_series"]["dates"], detrended_anom(p)))
        db = dict(zip(partner["time_series"]["dates"], detrended_anom(partner)))
        common = sorted(set(da) & set(db))
        r = float(np.corrcoef([da[c] for c in common], [db[c] for c in common])[0, 1])
        p["dipole_r"] = round(r, 4)

    GEOJSON.write_text(json.dumps(geo, ensure_ascii=False, indent=2), encoding="utf-8")

    # --- Refresh summary aggregates ---
    s = json.loads(SUMMARY.read_text(encoding="utf-8"))
    n_sig = sum(1 for f in feats if f["properties"]["significant"])
    s["epochs_processed"] = len(feats[0]["properties"]["time_series"]["dates"])
    s["basins_significant"] = n_sig
    s["basins_inconclusive"] = len(feats) - n_sig
    s["significance_rate_pct"] = round(100.0 * n_sig / len(feats), 1)
    s["regime_shifts_detected"] = [
        {
            "basin_id": p["basin_id"],
            "name": p["name"],
            "breakpoint_year": p["breakpoint_year"],
            "pettitt_p": p["pettitt_p"],
            "optimal_driver": p["optimal_driver"],
            "driver_r": p["driver_r"],
        }
        for p in (f["properties"] for f in feats)
        if p["is_significant_shift"]
    ]
    for d in s.get("dipoles_detected", []):
        pa, pb = by_id[d["basin_a"]], by_id[d["basin_b"]]
        d["inverse_correlation_r"] = pa["dipole_r"]
        d["opposing_divergence"] = round(abs(pa["theil_sen_slope"] - pb["theil_sen_slope"]), 4)
    SUMMARY.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"basins={len(feats)} epochs={s['epochs_processed']} significant={n_sig} "
          f"inconclusive={s['basins_inconclusive']} rate={s['significance_rate_pct']}%")
    changed = [f["properties"]["basin_id"] for f in feats
               if f["properties"]["verdict"] == "SIGNIFICANT_TREND"]
    print("significant:", ", ".join(sorted(changed)))


if __name__ == "__main__":
    main()

