#!/usr/bin/env python3
"""Import a listing-source CSV export (e.g. Trulia/Zillow/Apartments.com) into
the `leads` table via the app's /api/leads/csv-import endpoint.

Usage:
    python3 scripts/import_generic_csv_leads.py path/to/export.csv \\
        [--api-base http://localhost:4028] [--source Trulia] [--imported-by <user-id>]

Requires a running `npm run dev` server (the script posts to its REST API so
all existing dedup/enrichment/scoring/portfolio logic in csv-import/route.ts
is reused rather than duplicated here).
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
import urllib.error
import urllib.request

CHUNK_SIZE = 50


def to_float(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return float(value)
    except ValueError:
        return 0.0


def build_notes(row: dict[str, str]) -> str:
    parts = []
    building = (row.get("Community / Building") or "").strip()
    if building:
        parts.append(building)
    prop_type = (row.get("Property Type") or "").strip()
    listing_type = (row.get("Listing Type") or "").strip()
    combined_type = " / ".join(p for p in (prop_type, listing_type) if p)
    if combined_type:
        parts.append(combined_type)
    sqft = (row.get("Square Feet") or "").strip()
    if sqft:
        parts.append(f"{sqft} sqft")
    tags = (row.get("Tags") or "").strip()
    if tags:
        parts.append(tags)
    desc = (row.get("Description") or "").strip()
    if desc:
        parts.append(desc)
    return " | ".join(parts)[:2000]


def row_to_lead(row: dict[str, str], source: str) -> dict[str, object]:
    beds_min, beds_max = to_float(row.get("Beds Min")), to_float(row.get("Beds Max"))
    beds = round((beds_min + beds_max) / 2) if (beds_min or beds_max) else 3
    baths_min, baths_max = to_float(row.get("Baths Min")), to_float(row.get("Baths Max"))
    baths = round(((baths_min + baths_max) / 2) * 2) / 2 if (baths_min or baths_max) else 2.0
    price_min, price_max = to_float(row.get("Price Min")), to_float(row.get("Price Max"))
    price = round((price_min + price_max) / 2) if (price_min or price_max) else 0
    return {
        "source": source,
        "address": (row.get("Street Address") or "").strip(),
        "city": (row.get("City") or "").strip(),
        "state": (row.get("State") or "").strip(),
        "zip": (row.get("Zip") or "").strip(),
        "beds": beds,
        "baths": baths,
        "price": price,
        "notes": build_notes(row),
        "link": (row.get("Trulia URL") or row.get("URL") or "").strip(),
        "stage": "New Lead",
        "source_property_id": (row.get("Trulia Listing ID") or "").strip() or None,
    }


def chunked(seq: list, size: int):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path")
    parser.add_argument("--api-base", default="http://localhost:4028")
    parser.add_argument("--source", default="Trulia")
    parser.add_argument("--imported-by", default=None)
    args = parser.parse_args()

    # utf-8-sig strips a leading BOM if present (some exports prepend one to the
    # first header, e.g. "\ufeffState", which would otherwise silently break the
    # Street Address/State filter below).
    with open(args.csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = [
            row_to_lead(r, args.source)
            for r in reader
            if (r.get("Street Address") or "").strip() and (r.get("State") or "").strip()
        ]

    if not rows:
        print("No valid rows found (need Street Address + State columns).")
        sys.exit(1)

    batch_id = f"batch-{args.source.lower()}-{int(time.time())}"
    totals: dict[str, float] = {}
    filename = args.csv_path.rsplit("/", 1)[-1]

    for i, chunk in enumerate(chunked(rows, CHUNK_SIZE)):
        payload = json.dumps(
            {
                "rows": chunk,
                "importFilename": filename,
                "importedBy": args.imported_by,
                "importBatchId": batch_id,
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{args.api_base}/api/leads/csv-import",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            print(f"Chunk {i + 1} FAILED: HTTP {e.code} {e.read().decode(errors='replace')}")
            sys.exit(1)

        summary = data.get("summary", {})
        for k, v in summary.items():
            if isinstance(v, (int, float)):
                totals[k] = totals.get(k, 0) + v
        print(f"Chunk {i + 1}/{(len(rows) + CHUNK_SIZE - 1) // CHUNK_SIZE}: {summary}")

    print("\n=== TOTALS ===")
    for k, v in totals.items():
        print(f"{k}: {v}")
    print(f"Batch ID: {batch_id}")


if __name__ == "__main__":
    main()
