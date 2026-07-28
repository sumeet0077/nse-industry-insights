#!/usr/bin/env python3
"""
scripts/export_stock_rrg.py
===========================
Exports stock-level Relative Rotation Graph (RRG) JSON payloads for all 
Broad Market Indices, Sectoral Indices, and Industry Themes.

Each output JSON (data/stock_rrg/{dataFile}.json) contains:
- "D": Daily stock RRG points vs parent index benchmark
- "W": Weekly stock RRG points vs parent index benchmark
- "M": Monthly stock RRG points vs parent index benchmark
- "skipped": { "D": [...], "W": [...], "M": [...] } listing recently listed stocks (< 22 periods)
"""

import os
import sys
import json
import glob
import argparse
from pathlib import Path
import pandas as pd

# Add source directory to sys.path to import rrg_helper and nifty_themes if needed
def main():
    parser = argparse.ArgumentParser(description="Export constituent stock RRG data for Next.js app")
    parser.add_argument("--output", type=str, default="data", help="Output data directory")
    parser.add_argument("--source", type=str, default="../nifty-breadth", help="Source directory containing CSVs and Parquet")
    args = parser.parse_args()

    output_dir = Path(args.output).resolve()
    source_dir = Path(args.source).resolve()
    stock_rrg_dir = output_dir / "stock_rrg"
    stock_rrg_dir.mkdir(parents=True, exist_ok=True)

    if str(source_dir) not in sys.path:
        sys.path.insert(0, str(source_dir))
        sys.path.insert(0, str(source_dir.resolve()))

    try:
        from rrg_helper import RRGCalculator
        from nifty_themes import THEMES
    except ImportError as e:
        print(f"Error importing helper modules: {e}")
        return

    # Look for parquet master database
    parquet_paths = [
        source_dir / "nse_master_adjusted_2014_onwards.parquet",
        Path("/home/ubuntu/NSE_data/nse_master_adjusted_2014_onwards.parquet"),
        Path("/Users/sumeetdas/Antigravity_NSE_Data/nse_master_adjusted_2014_onwards.parquet"),
    ]
    parquet_file = next((p for p in parquet_paths if p.exists()), None)

    if not parquet_file:
        print("ERROR: Parquet database nse_master_adjusted_2014_onwards.parquet not found.")
        return

    print(f"Loading stock master price history from {parquet_file.name}...")
    df_master = pd.read_parquet(parquet_file, columns=["symbol", "trade_date", "adj_close"])
    df_master["symbol"] = df_master["symbol"].astype(str)
    df_eq = df_master.drop_duplicates(subset=["symbol", "trade_date"])

    symbols_dict = {
        sym: group[["trade_date", "adj_close"]].rename(columns={"trade_date": "Date", "adj_close": "Index_Close"})
        for sym, group in df_eq.groupby("symbol")
    }
    print(f"Indexed price history for {len(symbols_dict)} symbols.")

    # Load market_status to map titles/keys to constituents
    ms_file = output_dir / "market_status" / "market_status_latest.json"
    market_status = {}
    if ms_file.exists():
        try:
            with open(ms_file) as f:
                market_status = json.load(f)
        except Exception:
            pass

    # Build title -> constituents map
    title_constituents = {}
    for key, val in market_status.items():
        if isinstance(val, dict):
            above = val.get("above", [])
            below = val.get("below", [])
            new_s = val.get("new_stock", [])
            title_constituents[key.lower()] = sorted(list(set(above + below + new_s)))

    # Discover all breadth CSV files
    csv_files = sorted(glob.glob(str(source_dir / "market_breadth_*.csv")) + glob.glob(str(source_dir / "breadth_*.csv")))
    print(f"Processing stock RRG for {len(csv_files)} breadth files...")

    # Build config id -> title mapping
    config_path = Path(__file__).parent.parent / "lib" / "config.ts"
    id_to_title = {}
    if config_path.exists():
        import re
        content = config_path.read_text()
        for match in re.finditer(r'id:\s*"([^"]+)",\s*title:\s*"([^"]+)"', content):
            id_to_title[match.group(1)] = match.group(2)

    success_count = 0

    for csv_path in csv_files:
        basename = os.path.basename(csv_path)
        dataFile = basename.replace(".csv", "")
        title = id_to_title.get(dataFile)

        # Get list of constituent tickers
        tickers = []
        if dataFile.startswith("breadth_theme_"):
            theme_key_raw = dataFile.replace("breadth_theme_", "")
            # Try to match THEMES dictionary
            for t_name, t_list in THEMES.items():
                safe_name = t_name.lower().replace(' ', '_').replace('&', 'and').replace('-', '_').replace('(', '').replace(')', '').replace('__', '_')
                if safe_name == theme_key_raw:
                    tickers = t_list
                    break
        
        if not tickers and title:
            tickers = title_constituents.get(title.lower(), [])
        
        if not tickers and dataFile in title_constituents:
            tickers = title_constituents[dataFile]

        if not tickers:
            continue

        try:
            bench_df = pd.read_csv(csv_path)[["Date", "Index_Close"]]
            if bench_df.empty:
                continue

            calc = RRGCalculator(bench_df)

            df_dict = {}
            for t in tickers:
                clean_sym = t.replace(".NS", "").replace(".BO", "")
                if clean_sym in symbols_dict:
                    df_dict[t] = symbols_dict[clean_sym]

            if not df_dict:
                continue

            theme_payload = {"D": [], "W": [], "M": [], "skipped": {"D": [], "W": [], "M": []}}

            for tf in ["D", "W", "M"]:
                res = calc.calculate_rrg_metrics(df_dict, timeframe=tf)
                processed_tickers = set(res["Ticker"].unique()) if not res.empty else set()
                
                # Check for skipped tickers with < 22 periods
                skipped = [t for t in tickers if t not in processed_tickers]
                theme_payload["skipped"][tf] = skipped

                if not res.empty:
                    res = res.copy()
                    res["Date"] = res["Date"].dt.strftime("%Y-%m-%d")
                    res["RS_Ratio"] = res["RS_Ratio"].round(2)
                    res["RS_Momentum"] = res["RS_Momentum"].round(2)
                    theme_payload[tf] = res.to_dict(orient="records")

            out_file = stock_rrg_dir / f"{dataFile}.json"
            with open(out_file, "w") as f:
                json.dump(theme_payload, f)
            
            success_count += 1
        except Exception as e:
            print(f"  ERR {dataFile}: {e}")

    print(f"OK: Exported stock RRG data for {success_count} index/theme pages.")

if __name__ == "__main__":
    main()
