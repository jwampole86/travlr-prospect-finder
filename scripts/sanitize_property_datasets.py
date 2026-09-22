#!/usr/bin/env python3
"""Extract only allowlisted property fields from homeowner CSV exports.

This script intentionally excludes all names, phone numbers, emails, ages,
gender, income, mortgage, purchasing, and behavioral fields.
"""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path

SAFE_FIELDS = [
    "Address",
    "City",
    "State",
    "ZIP",
    "County",
    "Residence_Type",
    "Home_Age",
    "Est_Home_Value",
    "Own/Rent",
]
QUALIFIED_RESIDENCE_TYPES = {"single family dwelling", "multi-family dwelling"}
OUTPUT_ROWS_PER_FILE = 50_000


def decode_row(line: str) -> list[str]:
    row = next(csv.reader([line]))
    if len(row) == 1 and '","' in row[0]:
        row = next(csv.reader([row[0]]))
    return row


def estimated_value_floor(value: str) -> int:
    numbers = re.findall(r"[\d,]+", value or "")
    return int(numbers[0].replace(",", "")) if numbers else 0


def fingerprint(row: dict[str, str]) -> str:
    parts = [row["Address"], row["City"], row["State"], row["ZIP"][:5]]
    return "|".join(re.sub(r"[^a-z0-9]", "", part.lower()) for part in parts)


def qualified(row: dict[str, str]) -> bool:
    return (
        bool(row["Address"].strip() and row["State"].strip())
        and "owner" in row["Own/Rent"].lower()
        and row["Residence_Type"].strip().lower() in QUALIFIED_RESIDENCE_TYPES
        and estimated_value_floor(row["Est_Home_Value"]) >= 400_000
    )


def sanitize(source_dir: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for old_output in output_dir.glob("qualified-properties-*.csv"):
        old_output.unlink()

    seen: set[str] = set()
    inspected = qualified_count = duplicate_count = malformed_count = 0
    output_index = 0
    output_rows = 0
    output_file = None
    writer = None

    def ensure_writer() -> csv.DictWriter:
        nonlocal output_index, output_rows, output_file, writer
        if writer is None or output_rows >= OUTPUT_ROWS_PER_FILE:
            if output_file is not None:
                output_file.close()
            output_index += 1
            output_rows = 0
            output_path = output_dir / f"qualified-properties-{output_index:03d}.csv"
            output_file = output_path.open("w", encoding="utf-8", newline="")
            writer = csv.DictWriter(output_file, fieldnames=SAFE_FIELDS)
            writer.writeheader()
        return writer

    try:
        for path in sorted(source_dir.glob("Home Owners *.csv")):
            file_inspected = file_qualified = 0
            with path.open("r", encoding="latin-1", errors="replace", newline="") as source:
                header_line = source.readline()
                headers = decode_row(header_line)
                indexes = {field: headers.index(field) for field in SAFE_FIELDS if field in headers}
                if not set(SAFE_FIELDS).issubset(indexes):
                    print(f"SKIP {path.name}: required safe property columns not found")
                    continue

                for line in source:
                    inspected += 1
                    file_inspected += 1
                    try:
                        values = decode_row(line)
                        safe_row = {field: values[indexes[field]].strip() for field in SAFE_FIELDS}
                    except (IndexError, csv.Error):
                        malformed_count += 1
                        continue
                    if not qualified(safe_row):
                        continue
                    key = fingerprint(safe_row)
                    if not key or key in seen:
                        duplicate_count += 1
                        continue
                    seen.add(key)
                    ensure_writer().writerow(safe_row)
                    output_rows += 1
                    qualified_count += 1
                    file_qualified += 1
            print(f"{path.name}: inspected={file_inspected:,} qualified={file_qualified:,}")
    finally:
        if output_file is not None:
            output_file.close()

    print(
        f"COMPLETE inspected={inspected:,} qualified={qualified_count:,} "
        f"duplicates={duplicate_count:,} malformed={malformed_count:,} files={output_index}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    sanitize(args.source, args.output)


if __name__ == "__main__":
    main()
