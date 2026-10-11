#!/usr/bin/env python3
"""
Builds market_cost_benchmarks: per-ZIP and per-state luxury thresholds derived from
Zillow Research public data (free, monthly, no API key):
  - ZORI  (observed rent index, all home types)      -> local typical rent
  - ZHVI  (single-family, top-tier 67th-100th pct)   -> local top-tier home value

  luxury home value = clamp(min(TOP_MULT x top-tier value, ZORI_CAP_MULT x rent / YIELD), SALE_FLOOR, SALE_CAP)
  luxury monthly rent = clamp(min(YIELD x TOP_MULT x top-tier value, ZORI_CAP_MULT x rent), RENT_FLOOR, RENT_CAP)

The ZORI cap stops condo-heavy resort ZIPs (where single-family estates skew the top tier)
from getting unreachable thresholds. ZIPs without a rent index get one estimated from their
home value using their state's median rent-to-value ratio. Re-run monthly; use --dry-run to
preview without writing.

  python3 scripts/refresh_market_benchmarks.py --dry-run
  python3 scripts/refresh_market_benchmarks.py            # needs .env with Supabase keys
"""
import csv, io, json, os, statistics, subprocess, sys

BASE = "https://files.zillowstatic.com/research/public_csvs"
ZORI_ZIP = f"{BASE}/zori/Zip_zori_uc_sfrcondomfr_sm_month.csv"
ZHVI_ZIP = f"{BASE}/zhvi/Zip_zhvi_uc_sfr_tier_0.67_1.0_sm_sa_month.csv"
ZHVI_STATE = f"{BASE}/zhvi/State_zhvi_uc_sfr_tier_0.67_1.0_sm_sa_month.csv"

TOP_MULT = 1.5          # luxury = 1.5x the average top-third home in the area
YIELD = 0.005           # monthly gross rent as a share of value for high-end homes
ZORI_CAP_MULT = 4.0     # never require more than 4x the area's typical rent
RENT_FLOOR, RENT_CAP = 6000, 30000   # floor sits above the $5K "standard" tier
SALE_FLOOR, SALE_CAP = 750_000, 25_000_000


def fetch(url):
    # curl uses the system trust store; Python's urllib lacks a CA bundle on some Macs.
    out = subprocess.run(["curl", "-sfL", "--max-time", "240", url], capture_output=True, check=True)
    return out.stdout.decode("utf-8", errors="replace")


def latest(row, header):
    """Most recent non-empty monthly value, and its date."""
    for i in range(len(header) - 1, 0, -1):
        if header[i][:2] == "20" and row[i] not in ("", None):
            try:
                return float(row[i]), header[i]
            except ValueError:
                continue
    return None, None


def read_series(url):
    rows = list(csv.reader(io.StringIO(fetch(url))))
    header, data = rows[0], rows[1:]
    out, as_of = [], ""
    for r in data:
        v, d = latest(r, header)
        if v is not None:
            out.append((dict(zip(header, r)), v))
            as_of = max(as_of, d)
    return out, as_of


def round50(x):
    return int(round(x / 50.0) * 50)


def main(dry_run):
    zori, zori_date = read_series(ZORI_ZIP)
    zhvi, zhvi_date = read_series(ZHVI_ZIP)
    zhvi_state, _ = read_series(ZHVI_STATE)
    as_of = min(zori_date, zhvi_date)

    rent = {r["RegionName"].zfill(5): (v, r["State"]) for r, v in zori}
    val = {r["RegionName"].zfill(5): (v, r["State"]) for r, v in zhvi}

    ratios = {}
    for z, (rv, st) in rent.items():
        if z in val and val[z][0] > 0:
            ratios.setdefault(st, []).append(rv / val[z][0])
    all_ratios = [x for xs in ratios.values() for x in xs]
    national_ratio = statistics.median(all_ratios)
    state_ratio = {st: (statistics.median(xs) if len(xs) >= 3 else national_ratio) for st, xs in ratios.items()}

    def build(geo_type, key, st, rent_idx, basis, top_val):
        ratio = state_ratio.get(st, national_ratio)
        if rent_idx is None and top_val:
            rent_idx, basis = top_val * ratio, "ESTIMATED_FROM_HOME_VALUE"
        if top_val is None and rent_idx:
            top_val = rent_idx / ratio
        lux_rent = min(RENT_CAP, max(RENT_FLOOR, min(YIELD * TOP_MULT * top_val, ZORI_CAP_MULT * rent_idx)))
        lux_sale = min(SALE_CAP, max(SALE_FLOOR, min(TOP_MULT * top_val, ZORI_CAP_MULT * rent_idx / YIELD)))
        return {
            "geo_type": geo_type, "geo_key": key, "state_code": st,
            "rent_index": round(rent_idx, 2), "rent_index_basis": basis,
            "home_value_top_tier": round(top_val, 2),
            "luxury_rent_threshold": round50(lux_rent),
            "luxury_sale_threshold": int(round(lux_sale / 1000.0) * 1000),
            "data_as_of": as_of,
        }

    records = []
    for z in sorted(set(rent) | set(val)):
        st = (rent.get(z) or val.get(z))[1]
        records.append(build("zip", z, st, rent[z][0] if z in rent else None,
                             "ZORI_ZIP" if z in rent else None, val[z][0] if z in val else None))

    by_state = {}
    for rec in records:
        by_state.setdefault(rec["state_code"], []).append(rec)

    # 3-digit prefix tier: median of the ZIPs that share a prefix (needs at least 2 to be meaningful).
    by_prefix = {}
    for rec in records:
        by_prefix.setdefault(rec["geo_key"][:3], []).append(rec)
    for prefix, recs in sorted(by_prefix.items()):
        if len(recs) < 2:
            continue
        med = lambda f: statistics.median(r[f] for r in recs)
        records.append({
            "geo_type": "zip3", "geo_key": prefix, "state_code": recs[0]["state_code"],
            "rent_index": round(med("rent_index"), 2), "rent_index_basis": "MEDIAN_OF_PREFIX_ZIPS",
            "home_value_top_tier": round(med("home_value_top_tier"), 2),
            "luxury_rent_threshold": round50(med("luxury_rent_threshold")),
            "luxury_sale_threshold": int(round(med("luxury_sale_threshold") / 1000.0) * 1000),
            "data_as_of": as_of,
        })
    state_top = {r["StateName"]: v for r, v in zhvi_state}
    for st, recs in sorted(by_state.items()):
        med_rent = statistics.median(r["rent_index"] for r in recs)
        records.append(build("state", st, st, med_rent, "STATE_MEDIAN_OF_ZIPS", state_top.get(st)))

    states = sorted((r for r in records if r["geo_type"] == "state"), key=lambda r: r["state_code"])
    print(f"data as of {as_of}; {len(records) - len(states)} ZIP/prefix rows, {len(states)} states/DC; national rent/value ratio {national_ratio:.4f}")
    print(f"\n{'ST':3} {'rent idx':>9} {'top-tier val':>13} {'lux rent':>9} {'lux sale':>11}")
    for r in states:
        print(f"{r['state_code']:3} {r['rent_index']:>9,.0f} {r['home_value_top_tier']:>13,.0f} {r['luxury_rent_threshold']:>9,} {r['luxury_sale_threshold']:>11,}")
    print("\nsample ZIPs:")
    idx = {r["geo_key"]: r for r in records if r["geo_type"] == "zip"}
    for z, label in [("99516", "Anchorage AK"), ("99654", "Wasilla AK"), ("90210", "Beverly Hills CA"), ("93706", "Fresno CA"),
                     ("10001", "Manhattan NY"), ("14604", "Rochester NY"), ("81611", "Aspen CO"), ("63101", "St Louis MO"),
                     ("33139", "Miami Beach FL"), ("25301", "Charleston WV"), ("83001", "Jackson WY"), ("96815", "Waikiki HI")]:
        r = idx.get(z)
        print(f"  {z} {label:18}", "n/a" if not r else f"rent idx {r['rent_index']:>7,.0f} -> lux rent {r['luxury_rent_threshold']:>6,}  lux sale {r['luxury_sale_threshold']:>10,}  ({r['rent_index_basis']})")

    if dry_run:
        return
    env = {}
    for line in open(os.path.join(os.path.dirname(__file__), "..", ".env")):
        if "=" in line and not line.startswith("#"):
            k, v = line.rstrip("\n").split("=", 1)
            env[k] = v
    url, key = env["NEXT_PUBLIC_SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]
    for i in range(0, len(records), 1000):
        subprocess.run([
            "curl", "-sf", "--max-time", "120", "-X", "POST",
            f"{url}/rest/v1/market_cost_benchmarks?on_conflict=geo_type,geo_key",
            "-H", f"apikey: {key}", "-H", f"Authorization: Bearer {key}",
            "-H", "Content-Type: application/json",
            "-H", "Prefer: resolution=merge-duplicates,return=minimal",
            "--data-binary", "@-"],
            input=json.dumps(records[i:i + 1000]).encode(), check=True)
    print(f"\nupserted {len(records)} rows")


if __name__ == "__main__":
    main("--dry-run" in sys.argv)
