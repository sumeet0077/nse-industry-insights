#!/usr/bin/env python3
"""
export_json.py
==============
Run this AFTER fetch_breadth_data.py completes on the OCI server.
Reads all CSV breadth files and exports compact JSON for the Next.js frontend.
Push the output to the nse-industry-insights/data/ directory.

Usage:
    python3 export_json.py --output /path/to/nse-industry-insights/data
"""

import os
import json
import argparse
import pandas as pd
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────────────

# These should match the dataFile values in lib/config.ts exactly
BREADTH_FILES = {
    "nifty50":              "data/nifty50_breadth.csv",
    "nifty500":             "data/nifty500_breadth.csv",
    "nifty_smallcap250":    "data/nifty_smallcap250_breadth.csv",
    "nifty_auto":           "data/nifty_auto_breadth.csv",
    "nifty_bank":           "data/nifty_bank_breadth.csv",
    "nifty_energy":         "data/nifty_energy_breadth.csv",
    "nifty_financial_services": "data/nifty_financial_services_breadth.csv",
    "nifty_fmcg":           "data/nifty_fmcg_breadth.csv",
    "nifty_healthcare":     "data/nifty_healthcare_breadth.csv",
    "nifty_it":             "data/nifty_it_breadth.csv",
    "nifty_media":          "data/nifty_media_breadth.csv",
    "nifty_metal":          "data/nifty_metal_breadth.csv",
    "nifty_pharma":         "data/nifty_pharma_breadth.csv",
    "nifty_private_bank":   "data/nifty_private_bank_breadth.csv",
    "nifty_psu_bank":       "data/nifty_psu_bank_breadth.csv",
    "nifty_realty":         "data/nifty_realty_breadth.csv",
    "copper":               "data/copper_breadth.csv",
    "oil_gas_downstream":   "data/oil_gas_downstream_breadth.csv",
    "defence":              "data/defence_breadth.csv",
    "railways":             "data/railways_breadth.csv",
    "power":                "data/power_breadth.csv",
    "insurance_life":       "data/insurance_life_breadth.csv",
    "insurance_general":    "data/insurance_general_breadth.csv",
    "private_banking":      "data/private_banking_breadth.csv",
    "psu_banking":          "data/psu_banking_breadth.csv",
    "housing_finance":      "data/housing_finance_breadth.csv",
    "nbfc":                 "data/nbfc_breadth.csv",
    "retail":               "data/retail_breadth.csv",
    "amc":                  "data/amc_breadth.csv",
    "wealth_management":    "data/wealth_management_breadth.csv",
    "capital_markets":      "data/capital_markets_breadth.csv",
    "alcohols_breweries":   "data/alcohols_breweries_breadth.csv",
}


def export_breadth_files(output_dir: Path, source_dir: Path):
    """Export all breadth CSVs to JSON."""
    breadth_dir = output_dir / "breadth"
    breadth_dir.mkdir(parents=True, exist_ok=True)

    for key, csv_rel_path in BREADTH_FILES.items():
        csv_path = source_dir / csv_rel_path
        if not csv_path.exists():
            print(f"  SKIP {key}: {csv_path} not found")
            continue

        try:
            df = pd.read_csv(csv_path)
            # Keep only needed columns, ensure date is string
            if "Date" in df.columns:
                df["Date"] = df["Date"].astype(str)
            out_path = breadth_dir / f"{key}.json"
            df.to_json(out_path, orient="records", date_format="iso")
            print(f"  OK   {key} → {out_path.name} ({len(df)} rows)")
        except Exception as e:
            print(f"  ERR  {key}: {e}")


def export_performance_summary(output_dir: Path, source_dir: Path):
    """Export performance summary JSON."""
    perf_dir = output_dir / "performance"
    perf_dir.mkdir(parents=True, exist_ok=True)

    # Try loading the performance summary JSON if it exists
    src = source_dir / "performance_summary_latest.json"
    if src.exists():
        import shutil
        shutil.copy(src, perf_dir / "performance_summary.json")
        print(f"  OK   performance_summary.json")
    else:
        print(f"  SKIP performance_summary: {src} not found")


def export_market_status(output_dir: Path, source_dir: Path):
    """Export market status JSON."""
    ms_dir = output_dir / "market_status"
    ms_dir.mkdir(parents=True, exist_ok=True)

    src = source_dir / "market_status_latest.json"
    if src.exists():
        import shutil
        shutil.copy(src, ms_dir / "market_status_latest.json")
        print(f"  OK   market_status_latest.json")
    else:
        print(f"  SKIP market_status: {src} not found")


def export_constituent_performance(output_dir: Path, source_dir: Path):
    """Export constituent performance JSON."""
    cp_dir = output_dir / "constituent_performance"
    cp_dir.mkdir(parents=True, exist_ok=True)

    src = source_dir / "constituent_performance_latest.json"
    if src.exists():
        import shutil
        shutil.copy(src, cp_dir / "constituent_performance_latest.json")
        print(f"  OK   constituent_performance_latest.json")
    else:
        print(f"  SKIP constituent_performance: {src} not found")


def main():
    parser = argparse.ArgumentParser(description="Export CSVs to JSON for nse-industry-insights")
    parser.add_argument(
        "--output",
        required=True,
        help="Path to nse-industry-insights/data directory",
    )
    parser.add_argument(
        "--source",
        default=".",
        help="Path to nifty-breadth project directory (default: current dir)",
    )
    args = parser.parse_args()

    output_dir = Path(args.output)
    source_dir = Path(args.source)

    print(f"\n{'='*50}")
    print(f"NSE Industry Insights — JSON Export")
    print(f"Source : {source_dir.resolve()}")
    print(f"Output : {output_dir.resolve()}")
    print(f"{'='*50}\n")

    print("Exporting breadth CSV files...")
    export_breadth_files(output_dir, source_dir)

    print("\nExporting performance summary...")
    export_performance_summary(output_dir, source_dir)

    print("\nExporting market status...")
    export_market_status(output_dir, source_dir)

    print("\nExporting constituent performance...")
    export_constituent_performance(output_dir, source_dir)

    print(f"\n✓ Export complete → {output_dir.resolve()}")


if __name__ == "__main__":
    main()
