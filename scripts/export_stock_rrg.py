#!/usr/bin/env python3
"""
scripts/export_stock_rrg.py
===========================
Ultra-fast vectorized exporter for stock-level Relative Rotation Graph (RRG) 
JSON payloads for all Broad Market Indices, Sectoral Indices, and Industry Themes.

Exports stock RRG metrics (D, W, M) for ALL 729 universe stocks relative to
every benchmark index so custom watchlists can plot ANY stock vs ANY benchmark.
"""

import os
import sys
import json
import glob
import argparse
from pathlib import Path
import pandas as pd
import numpy as np

def resample_pivot(df_pivot, tf):
    if tf == "D":
        return df_pivot
    rule = "W-FRI" if tf == "W" else "ME"
    res = df_pivot.resample(rule).last()
    return res.dropna(how="all")

def compute_rrg_matrix(df_stock_close, ser_bench_close, tail_length=35):
    # Align dates between stocks and benchmark
    combined_bench = ser_bench_close.reindex(df_stock_close.index).dropna()
    df_aligned = df_stock_close.reindex(combined_bench.index).dropna(how="all")
    
    if len(combined_bench) < 23:
        return []

    # 1. RS = 100 * (Asset / Benchmark)
    df_rs = 100.0 * df_aligned.div(combined_bench, axis=0)

    # 2. RS_Ratio = 100 * (RS / SMA(RS, 14))
    df_rs_ma = df_rs.rolling(window=14, min_periods=14).mean()
    df_ratio = 100.0 * (df_rs / df_rs_ma)

    # 3. RS_Momentum = 100 * (RS_Ratio / SMA(RS_Ratio, 9))
    df_ratio_ma = df_ratio.rolling(window=9, min_periods=9).mean()
    df_mom = 100.0 * (df_ratio / df_ratio_ma)

    # Filter tail
    df_r_tail = df_ratio.iloc[-tail_length:]
    df_m_tail = df_mom.iloc[-tail_length:]

    # Unstack into long DataFrame in 1 ms
    df_long = df_r_tail.unstack().reset_index()
    df_long.columns = ["Ticker", "Date", "RS_Ratio"]
    df_long["RS_Momentum"] = df_m_tail.unstack().values
    
    df_long = df_long.dropna(subset=["RS_Ratio", "RS_Momentum"])
    df_long["Date"] = df_long["Date"].dt.strftime("%Y-%m-%d")
    df_long["RS_Ratio"] = df_long["RS_Ratio"].round(2)
    df_long["RS_Momentum"] = df_long["RS_Momentum"].round(2)

    return df_long[["Date", "Ticker", "RS_Ratio", "RS_Momentum"]].to_dict(orient="records")

def main():
    parser = argparse.ArgumentParser(description="Export constituent stock RRG data for Next.js app")
    parser.add_argument("--output", type=str, default="data", help="Output data directory")
    parser.add_argument("--source", type=str, default="../nifty-breadth", help="Source directory containing CSVs and Parquet")
    args = parser.parse_args()

    output_dir = Path(args.output).resolve()
    source_dir = Path(args.source).resolve()
    stock_rrg_dir = output_dir / "stock_rrg"
    stock_rrg_dir.mkdir(parents=True, exist_ok=True)

    # Load market_status to map titles/keys to universe constituents
    ms_file = output_dir / "market_status" / "market_status_latest.json"
    market_status = {}
    if ms_file.exists():
        try:
            with open(ms_file) as f:
                market_status = json.load(f)
        except Exception:
            pass

    all_universe_tickers = set()
    for key, val in market_status.items():
        if isinstance(val, dict):
            all_universe_tickers.update(val.get("above", []))
            all_universe_tickers.update(val.get("below", []))
            all_universe_tickers.update(val.get("new_stock", []))

    all_universe_tickers_list = sorted(list(all_universe_tickers))
    print(f"Total unique universe tickers for RRG export: {len(all_universe_tickers_list)}", flush=True)

    # Look for parquet master database
    parquet_paths = [
        source_dir / "nse_master_adjusted_2014_onwards.parquet",
        Path("/Users/sumeetdas/Antigravity_NSE_Data/nse_master_bhav_with_delivery_2014_onwards.parquet"),
    ]
    parquet_file = next((p for p in parquet_paths if p.exists()), None)

    if not parquet_file:
        print("ERROR: Parquet database not found.", flush=True)
        return

    print(f"Loading stock master price history from {parquet_file.name}...", flush=True)
    try:
        df_master = pd.read_parquet(parquet_file, columns=["symbol", "trade_date", "close"], filters=[("year", ">=", 2024)])
    except Exception:
        df_master = pd.read_parquet(parquet_file, columns=["symbol", "trade_date", "adj_close"])
        df_master = df_master.rename(columns={"adj_close": "close"})

    df_master["symbol_ns"] = df_master["symbol"].astype(str).apply(lambda s: s if s.endswith(".NS") else f"{s}.NS")
    clean_universe_set = set(all_universe_tickers_list)
    df_eq = df_master[df_master["symbol_ns"].isin(clean_universe_set)].drop_duplicates(subset=["symbol_ns", "trade_date"])

    # Pivot into single wide DataFrame: Date x Ticker
    df_pivot_daily = df_eq.pivot(index="trade_date", columns="symbol_ns", values="close").sort_index()
    df_pivot_daily.index = pd.to_datetime(df_pivot_daily.index)
    print(f"Pivoted stock price history matrix: {df_pivot_daily.shape[0]} dates x {df_pivot_daily.shape[1]} stocks.", flush=True)

    # Pre-resample stock matrix for W and M
    df_pivot_weekly = resample_pivot(df_pivot_daily, "W")
    df_pivot_monthly = resample_pivot(df_pivot_daily, "M")

    stock_matrices = {
        "D": df_pivot_daily,
        "W": df_pivot_weekly,
        "M": df_pivot_monthly,
    }

    # Discover all breadth CSV files
    csv_files = sorted(glob.glob(str(source_dir / "market_breadth_*.csv")) + glob.glob(str(source_dir / "breadth_*.csv")))
    print(f"Vectorized stock RRG processing for {len(csv_files)} benchmark CSV files...", flush=True)

    success_count = 0

    for csv_path in csv_files:
        dataFile = os.path.basename(csv_path).replace(".csv", "")
        try:
            bench_df = pd.read_csv(csv_path)[["Date", "Index_Close"]]
            if bench_df.empty:
                continue

            bench_df["Date"] = pd.to_datetime(bench_df["Date"])
            bench_pivot_d = bench_df.set_index("Date")["Index_Close"].sort_index()

            bench_pivots = {
                "D": bench_pivot_d,
                "W": resample_pivot(bench_pivot_d.to_frame(), "W")["Index_Close"],
                "M": resample_pivot(bench_pivot_d.to_frame(), "M")["Index_Close"],
            }

            payload = {"D": [], "W": [], "M": [], "skipped": {"D": [], "W": [], "M": []}}

            for tf in ["D", "W", "M"]:
                records = compute_rrg_matrix(stock_matrices[tf], bench_pivots[tf])
                processed = set(r["Ticker"] for r in records)
                skipped = [t for t in all_universe_tickers_list if t not in processed]
                payload[tf] = records
                payload["skipped"][tf] = skipped

            out_file = stock_rrg_dir / f"{dataFile}.json"
            with open(out_file, "w") as f:
                json.dump(payload, f)

            success_count += 1
        except Exception as e:
            print(f"  ERR {dataFile}: {e}", flush=True)

    print(f"✓ Export complete: Vectorized stock RRG data exported for {success_count} index/theme pages.", flush=True)

if __name__ == "__main__":
    main()
