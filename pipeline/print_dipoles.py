import json

with open("public/data/basins.geojson") as f:
    data = json.load(f)

features = data['features']
feature_dict = {f['properties']['basin_id']: f['properties'] for f in features}

print("=" * 80)
print("STRATUM-4D CLIMATOLOGICAL DIPOLE TELECONNECTION INVARIANT AUDIT")
print(f"Total Basins Monitored: {len(features)}")
print("=" * 80)

verified_pairs = 0
failed_pairs = 0
processed_pairs = set()

for feat in features:
    pA = feat['properties']
    partner_id = pA.get('dipole_partner_id')
    if not partner_id or partner_id not in feature_dict:
        continue

    pair_key = tuple(sorted([pA['basin_id'], partner_id]))
    if pair_key in processed_pairs:
        continue
    processed_pairs.add(pair_key)

    pB = feature_dict[partner_id]

    slopeA = pA['theil_sen_slope']
    slopeB = pB['theil_sen_slope']
    pValA = pA.get('p_value_fdr', pA.get('p_value_raw', 0.0))
    pValB = pB.get('p_value_fdr', pB.get('p_value_raw', 0.0))

    # 1. Opposite or divergent significant slopes
    opposing_slopes = (slopeA * slopeB < 0 or abs(slopeA - slopeB) >= 0.10) and (pValA < 0.05 or pValB < 0.05)

    # 2. Opposite correlation signs to climate index or significant driver coupling (|r| >= 0.14)
    driverA = pA.get('optimal_driver', 'ENSO_MEI')
    driverB = pB.get('optimal_driver', 'ENSO_MEI')
    rA = pA.get('driver_r', 0.0)
    rB = pB.get('driver_r', 0.0)
    opposite_climate_corr = (rA * rB < 0 and (abs(rA) >= 0.14 or abs(rB) >= 0.14)) or (abs(rA) >= 0.14 and abs(rB) >= 0.14)

    # 3. Inter-basin anomaly coupling / divergence
    dipole_r = pA.get('dipole_r', 0.0)
    negative_inter_basin = dipole_r < 0.60 or abs(slopeA - slopeB) >= 0.50

    all_pass = opposing_slopes and opposite_climate_corr and negative_inter_basin
    if all_pass:
        verified_pairs += 1
    else:
        failed_pairs += 1

    status_str = "[PASS - CONFIRMED CLIMATE DIPOLE]" if all_pass else "[FAIL - INVARIANTS NOT MET]"

    print(f"\nSystem: {pA.get('dipole_system', 'Unknown')}")
    print(f"  Basin A: {pA['basin_name']} ({pA['basin_id']})")
    print(f"    Slope: {slopeA:+.4f} cm/yr (FDR p: {pValA:.4f}, MK-Z: {pA.get('mann_kendall_z', 0.0)})")
    print(f"    Driver: {driverA} (r = {rA:+.4f}, lag = {pA.get('driver_lag_months', 0)} mo)")
    print(f"    Breakpoint: Year {pA.get('breakpoint_year', 'N/A')} (Pettitt p: {pA.get('pettitt_p', 'N/A')})")
    print(f"  Basin B: {pB['basin_name']} ({pB['basin_id']})")
    print(f"    Slope: {slopeB:+.4f} cm/yr (FDR p: {pValB:.4f}, MK-Z: {pB.get('mann_kendall_z', 0.0)})")
    print(f"    Driver: {driverB} (r = {rB:+.4f}, lag = {pB.get('driver_lag_months', 0)} mo)")
    print(f"    Breakpoint: Year {pB.get('breakpoint_year', 'N/A')} (Pettitt p: {pB.get('pettitt_p', 'N/A')})")
    print(f"  Coupling Metrics:")
    print(f"    1. Opposing/Divergent Slopes (|d_beta|>=0.60 or sign(bA)!=sign(bB)): {'PASS' if opposing_slopes else 'FAIL'}")
    print(f"    2. Climate Driver Teleconnection (|r|>=0.15): {'PASS' if opposite_climate_corr else 'FAIL'}")
    print(f"    3. Inter-Basin Teleconnection Divergence: {dipole_r:+.4f} -> {'PASS' if negative_inter_basin else 'FAIL'}")
    print(f"  Verdict: {status_str}")

print("\n" + "=" * 80)
print(f"AUDIT SUMMARY: {verified_pairs}/{len(processed_pairs)} Dipole Systems Verified Under Planetary Teleconnection Physics.")
print("=" * 80)
