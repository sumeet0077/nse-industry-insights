#!/usr/bin/env python3
"""
export_json.py
==============
Run this AFTER fetch_breadth_data.py completes on the OCI server.
Auto-discovers all breadth CSV files and exports compact JSON for the Next.js frontend.

Usage:
    python3 export_json.py --output /path/to/nse-industry-insights/data --source /path/to/nifty-dashboard
"""

import os
import sys
import json
import argparse
import glob
import shutil
import pandas as pd
from pathlib import Path

from datetime import timedelta

def export_performance_summary(output_dir: Path, source_dir: Path):
    """Calculate and export the performance summary heatmap data."""
    perf_dir = output_dir / "performance"
    perf_dir.mkdir(parents=True, exist_ok=True)
    
    print("  Calculating Performance Summary...")
    
    # First, find the Nifty 50 baseline for RS (20D) calculation
    baseline_file = source_dir / "market_breadth_nifty50.csv"
    nifty_latest_price = 0
    nifty_20d_price = 0
    nifty_rs_base = 0
    
    if baseline_file.exists():
        try:
            b_df = pd.read_csv(baseline_file)
            if not b_df.empty and 'Index_Close' in b_df.columns:
                b_df['Date'] = pd.to_datetime(b_df['Date'])
                latest = b_df.iloc[-1]
                nifty_latest_price = latest['Index_Close']
                target_date = latest['Date'] - timedelta(days=20)
                mask = b_df['Date'] <= target_date
                if mask.any():
                    nifty_20d_price = b_df[mask].iloc[-1]['Index_Close']
                    if nifty_20d_price > 0:
                        nifty_rs_base = (nifty_latest_price - nifty_20d_price) / nifty_20d_price
        except Exception as e:
            print(f"    Warning: Could not process Nifty 50 baseline for RS: {e}")

    periods = {
        "1 Day": 1,
        "1 Week": 7,
        "1 Month": 30,
        "3 Months": 90,
        "6 Months": 180,
        "1 Year": 365,
        "3 Years": 365*3,
        "5 Years": 365*5
    }
    
    # Load all themes
    patterns = [
        str(source_dir / "market_breadth_*.csv"),
        str(source_dir / "breadth_*.csv"),
    ]
    csv_files = []
    for pattern in patterns:
        csv_files.extend(glob.glob(pattern))
        
    csv_files = sorted(set(csv_files))
    summary_data = []
    
    for csv_path in csv_files:
        basename = os.path.basename(csv_path)
        key = basename.replace(".csv", "")
        # Parse titles safely from the Next.js config.ts
        try:
            config_path = Path(__file__).parent.parent / "lib" / "config.ts"
            import re
            if config_path.exists():
                with open(config_path, "r") as f:
                    content = f.read()
                matches = re.finditer(r'id:\s*"([^"]+)",\s*title:\s*"([^"]+)"', content)
                for match in matches:
                    if match.group(1) == key:
                        title = match.group(2)
                        break
        except Exception as e:
            print(f"Warning mapping {key}: {e}")
            
        try:
            df = pd.read_csv(csv_path)
            if df.empty or 'Index_Close' not in df.columns:
                continue
                
            df['Date'] = pd.to_datetime(df['Date'])
            latest = df.iloc[-1]
            current_price = latest['Index_Close']
            current_date = latest['Date']
            
            row = {"Theme/Index": title}
            
            for p_name, days in periods.items():
                target_date = current_date - timedelta(days=days)
                mask = df['Date'] <= target_date
                if mask.any():
                    past_row = df[mask].iloc[-1]
                    past_price = past_row['Index_Close']
                    if past_price > 0:
                        ret = ((current_price - past_price) / past_price) * 100
                        row[p_name] = round(ret, 2)
                    else:
                        row[p_name] = None
                else:
                    row[p_name] = None
                    
            # RS (20D)
            row["RS (20D)"] = None
            if current_price > 0 and nifty_latest_price > 0 and nifty_20d_price > 0:
                target_date = current_date - timedelta(days=20)
                mask = df['Date'] <= target_date
                if mask.any():
                    asset_20d_price = df[mask].iloc[-1]['Index_Close']
                    if asset_20d_price > 0:
                        current_ratio = current_price / nifty_latest_price
                        past_ratio = asset_20d_price / nifty_20d_price
                        rs_val = ((current_ratio - past_ratio) / past_ratio) * 100
                        row["RS (20D)"] = None if pd.isna(rs_val) else round(rs_val, 2)
                        
            summary_data.append(row)
            
        except Exception as e:
            print(f"    Error processing {key}: {e}")
            
    if summary_data:
        out_path = perf_dir / "performance_summary.json"
        
        # We must serialize via Pandas to guarantee strictly compliant JSON (NaN -> null). 
        # Python's built-in json.dump writes literal 'NaN' which breaks JS parsers.
        df_summary = pd.DataFrame(summary_data)
        
        # Replace python NaNs to None for safe serialization just in case
        df_summary = df_summary.where(pd.notna(df_summary), None)
        df_summary.to_json(out_path, orient="records", date_format="iso", indent=2)
        
        print(f"  OK   performance_summary.json ({len(summary_data)} rows)")
    else:
        print("  ERR  Could not generate performance_summary.json")

def export_rrg_data(output_dir: Path, source_dir: Path):
    """Calculate and export RRG data for D, W, M timeframes."""
    rrg_dir = output_dir / "rrg"
    rrg_dir.mkdir(parents=True, exist_ok=True)
    
    # Try to import RRGCalculator from source_dir
    if str(source_dir.resolve()) not in sys.path:
        sys.path.insert(0, str(source_dir.resolve()))
    
    try:
        from rrg_helper import RRGCalculator
    except ImportError:
        print("  SKIP RRG calculation (rrg_helper.py not found in source_dir)")
        return
        
    print("  Calculating RRG Data (Daily, Weekly, Monthly)...")
    
    # Load Benchmark (Nifty 50)
    benchmark_file = source_dir / "market_breadth_nifty50.csv"
    if not benchmark_file.exists():
        print("  SKIP RRG calculation (Benchmark Nifty 50 not found)")
        return
        
    benchmark_df = pd.read_csv(benchmark_file)
    calculator = RRGCalculator(benchmark_df)
    
    # Load all themes
    patterns = [
        str(source_dir / "breadth_*.csv"),
    ]
    csv_files = []
    for pattern in patterns:
        csv_files.extend(glob.glob(pattern))
    
    df_dict = {}
    for csv_path in csv_files:
        basename = os.path.basename(csv_path)
        key = basename.replace(".csv", "")
        # Use a nice name or just use the key. Streamlit uses actual names, we can use the key for now
        # and map it in the frontend. Let's use the key (e.g., breadth_auto, breadth_theme_copper)
        try:
            df = pd.read_csv(csv_path)
            if not df.empty:
                df_dict[key] = df
        except Exception:
            pass
            
    if not df_dict:
        print("  SKIP RRG calculation (No theme data found)")
        return
        
    for tf, tf_name in [('D', 'Daily'), ('W', 'Weekly'), ('M', 'Monthly')]:
        try:
            rrg_df = calculator.calculate_rrg_metrics(df_dict, timeframe=tf)
            if not rrg_df.empty:
                out_path = rrg_dir / f"rrg_{tf}.json"
                # Export with date_format="iso"
                if "Date" in rrg_df.columns:
                    rrg_df["Date"] = rrg_df["Date"].astype(str)
                rrg_df.to_json(out_path, orient="records", date_format="iso")
                print(f"  OK   rrg_{tf}.json ({len(rrg_df)} rows)")
            else:
                print(f"  ERR  rrg_{tf}.json is empty")
        except Exception as e:
            print(f"  ERR  rrg_{tf}.json calculation failed: {e}")



def export_all_breadth_files(output_dir: Path, source_dir: Path):
    """Auto-discover and export ALL breadth CSV files as JSON."""
    breadth_dir = output_dir / "breadth"
    breadth_dir.mkdir(parents=True, exist_ok=True)

    # Find all breadth CSVs in the source directory
    patterns = [
        str(source_dir / "market_breadth_*.csv"),
        str(source_dir / "breadth_*.csv"),
    ]

    csv_files = []
    for pattern in patterns:
        csv_files.extend(glob.glob(pattern))

    csv_files = sorted(set(csv_files))
    print(f"  Found {len(csv_files)} breadth CSV files")

    for csv_path in csv_files:
        basename = os.path.basename(csv_path)  # e.g. breadth_auto.csv
        key = basename.replace(".csv", "")  # e.g. breadth_auto

        try:
            df = pd.read_csv(csv_path)
            if "Date" in df.columns:
                df["Date"] = df["Date"].astype(str)
            out_path = breadth_dir / f"{key}.json"
            df.to_json(out_path, orient="records", date_format="iso")
            print(f"  OK   {key} ({len(df)} rows)")
        except Exception as e:
            print(f"  ERR  {key}: {e}")


def export_json_file(output_dir: Path, source_dir: Path, src_name: str, dest_subdir: str, dest_name: str):
    """Copy a JSON file from source to output."""
    dest_dir = output_dir / dest_subdir
    dest_dir.mkdir(parents=True, exist_ok=True)

    src = source_dir / src_name
    if src.exists():
        shutil.copy(src, dest_dir / dest_name)
        print(f"  OK   {dest_name}")
        return True
    else:
        print(f"  SKIP {src_name} not found")
        return False


def generate_manifest(output_dir: Path):
    """Generate a manifest of all available data files for the frontend."""
    breadth_dir = output_dir / "breadth"
    manifest = {"breadth": [], "has_performance": False, "has_market_status": False, "has_constituent_perf": False}

    if breadth_dir.exists():
        for f in sorted(breadth_dir.glob("*.json")):
            manifest["breadth"].append(f.stem)

    manifest["has_performance"] = (output_dir / "performance" / "performance_summary.json").exists()
    manifest["has_market_status"] = (output_dir / "market_status" / "market_status_latest.json").exists()
    manifest["has_constituent_perf"] = (output_dir / "constituent_performance" / "constituent_performance_latest.json").exists()

    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"  OK   manifest.json ({len(manifest['breadth'])} breadth files)")


def main():
    parser = argparse.ArgumentParser(description="Export CSVs to JSON for nse-industry-insights")
    parser.add_argument("--output", required=True, help="Path to nse-industry-insights/data directory")
    parser.add_argument("--source", default=".", help="Path to nifty-breadth project directory")
    args = parser.parse_args()

    output_dir = Path(args.output)
    source_dir = Path(args.source)

    print(f"\n{'='*50}")
    print(f"NSE Industry Insights — JSON Export")
    print(f"Source : {source_dir.resolve()}")
    print(f"Output : {output_dir.resolve()}")
    print(f"{'='*50}\n")

    print("Exporting breadth CSV files...")
    export_all_breadth_files(output_dir, source_dir)

    print("\nExporting performance summary...")
    export_performance_summary(output_dir, source_dir)

    print("\nExporting market status...")
    export_json_file(output_dir, source_dir, "market_status_latest.json", "market_status", "market_status_latest.json")

    print("\nExporting constituent performance...")
    export_json_file(output_dir, source_dir, "constituent_performance_latest.json", "constituent_performance", "constituent_performance_latest.json")

    print("\nExporting RRG Data...")
    export_rrg_data(output_dir, source_dir)

    print("\nGenerating manifest...")
    generate_manifest(output_dir)

    print(f"\n✓ Export complete → {output_dir.resolve()}")


if __name__ == "__main__":
    main()
