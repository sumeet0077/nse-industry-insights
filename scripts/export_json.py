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
import numpy as np
from pathlib import Path

from datetime import timedelta

def export_performance_summary(output_dir: Path, source_dir: Path):
    """Calculate and export the performance summary heatmap data."""
    perf_dir = output_dir / "performance"
    perf_dir.mkdir(parents=True, exist_ok=True)
    
    print("  Calculating Performance Summary...")
    
    # First, find the Nifty 50 baseline for RS (20D) and RS (50D) calculation
    baseline_file = source_dir / "market_breadth_nifty50.csv"
    nifty_latest_price = 0
    nifty_5d_price = 0
    nifty_10d_price = 0
    nifty_20d_price = 0
    nifty_50d_price = 0
    
    if baseline_file.exists():
        try:
            b_df = pd.read_csv(baseline_file)
            if not b_df.empty and 'Index_Close' in b_df.columns:
                b_df['Date'] = pd.to_datetime(b_df['Date'])
                if len(b_df) >= 1:
                    nifty_latest_price = b_df.iloc[-1]['Index_Close']
                if len(b_df) >= 6:
                    nifty_5d_price = b_df.iloc[-6]['Index_Close']
                if len(b_df) >= 11:
                    nifty_10d_price = b_df.iloc[-11]['Index_Close']
                if len(b_df) >= 21:
                    nifty_20d_price = b_df.iloc[-21]['Index_Close']
                if len(b_df) >= 51:
                    nifty_50d_price = b_df.iloc[-51]['Index_Close']
        except Exception as e:
            print(f"    Warning: Could not process Nifty 50 baseline for RS: {e}")

    periods = {
        "1 Day": 1,
        "1 Week": 7,
        "1 Month": 30,
        "3 Months": 90,
        "6 Months": 180,
        "YTD": None,
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
    
    # ── Build id→title lookup map ONCE before the loop ──────────────────
    # Reading config.ts inside every CSV iteration was slow & caused a
    # critical bug: if 'title' was never matched for a row, the variable
    # leaked from the previous iteration, silently mislabelling rows.
    import re
    id_to_title: dict = {}
    try:
        config_path = Path(__file__).parent.parent / "lib" / "config.ts"
        if config_path.exists():
            content = config_path.read_text()
            for match in re.finditer(r'id:\s*"([^"]+)",\s*title:\s*"([^"]+)"', content):
                id_to_title[match.group(1)] = match.group(2)
    except Exception as e:
        print(f"Warning: Could not parse config.ts for title mapping: {e}")
    # ────────────────────────────────────────────────────────────────────
    
    for csv_path in csv_files:
        basename = os.path.basename(csv_path)
        key = basename.replace(".csv", "")
        
        # Reset title each iteration — critical to prevent bleed-over between rows
        title = id_to_title.get(key)
        
        # Skip CSVs with no matching config entry (e.g. stale/deleted themes)
        if not title:
            print(f"    SKIP {key} (no config.ts mapping found)")
            continue
            
        try:
            df = pd.read_csv(csv_path)
            if df.empty or 'Index_Close' not in df.columns:
                continue
                
            df['Date'] = pd.to_datetime(df['Date'])
            if hasattr(df['Date'].dt, 'tz') and df['Date'].dt.tz is not None:
                df['Date'] = df['Date'].dt.tz_localize(None)
            latest = df.iloc[-1]
            current_price = latest['Index_Close']
            current_date = latest['Date']
            
            row = {"Theme/Index": title}
            
            for p_name, days in periods.items():
                if p_name == "YTD":
                    target_date = pd.Timestamp(year=current_date.year - 1, month=12, day=31)
                else:
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
                    
            # RS (5D)
            row["RS (5D)"] = None
            if current_price > 0 and nifty_latest_price > 0 and nifty_5d_price > 0:
                if len(df) >= 6:
                    asset_5d_price = df.iloc[-6]['Index_Close']
                    if asset_5d_price > 0:
                        current_ratio = current_price / nifty_latest_price
                        past_ratio = asset_5d_price / nifty_5d_price
                        rs_val = ((current_ratio - past_ratio) / past_ratio) * 100
                        row["RS (5D)"] = None if pd.isna(rs_val) else round(rs_val, 2)

            # RS (10D)
            row["RS (10D)"] = None
            if current_price > 0 and nifty_latest_price > 0 and nifty_10d_price > 0:
                if len(df) >= 11:
                    asset_10d_price = df.iloc[-11]['Index_Close']
                    if asset_10d_price > 0:
                        current_ratio = current_price / nifty_latest_price
                        past_ratio = asset_10d_price / nifty_10d_price
                        rs_val = ((current_ratio - past_ratio) / past_ratio) * 100
                        row["RS (10D)"] = None if pd.isna(rs_val) else round(rs_val, 2)

            # RS (20D)
            row["RS (20D)"] = None
            if current_price > 0 and nifty_latest_price > 0 and nifty_20d_price > 0:
                if len(df) >= 21:
                    asset_20d_price = df.iloc[-21]['Index_Close']
                    if asset_20d_price > 0:
                        current_ratio = current_price / nifty_latest_price
                        past_ratio = asset_20d_price / nifty_20d_price
                        rs_val = ((current_ratio - past_ratio) / past_ratio) * 100
                        row["RS (20D)"] = None if pd.isna(rs_val) else round(rs_val, 2)
                        
            # RS (50D)
            row["RS (50D)"] = None
            if current_price > 0 and nifty_latest_price > 0 and nifty_50d_price > 0:
                if len(df) >= 51:
                    asset_50d_price = df.iloc[-51]['Index_Close']
                    if asset_50d_price > 0:
                        current_ratio = current_price / nifty_latest_price
                        past_ratio = asset_50d_price / nifty_50d_price
                        rs_val = ((current_ratio - past_ratio) / past_ratio) * 100
                        row["RS (50D)"] = None if pd.isna(rs_val) else round(rs_val, 2)
                        
            # IBD RS Raw Score Calculation (4 Quarters: 40% Q1, 20% Q2, 20% Q3, 20% Q4)
            q1_ret = None
            q2_ret = None
            q3_ret = None
            q4_ret = None
            
            n_bars = len(df)
            if n_bars >= 64:
                p_q1 = float(df.iloc[-64]['Index_Close'])
                if p_q1 > 0:
                    q1_ret = ((current_price - p_q1) / p_q1) * 100
            if n_bars >= 127:
                p_q1 = float(df.iloc[-64]['Index_Close'])
                p_q2 = float(df.iloc[-127]['Index_Close'])
                if p_q2 > 0:
                    q2_ret = ((p_q1 - p_q2) / p_q2) * 100
            if n_bars >= 190:
                p_q2 = float(df.iloc[-127]['Index_Close'])
                p_q3 = float(df.iloc[-190]['Index_Close'])
                if p_q3 > 0:
                    q3_ret = ((p_q2 - p_q3) / p_q3) * 100
            if n_bars >= 253:
                p_q3 = float(df.iloc[-190]['Index_Close'])
                p_q4 = float(df.iloc[-253]['Index_Close'])
                if p_q4 > 0:
                    q4_ret = ((p_q3 - p_q4) / p_q4) * 100

            rs_raw = None
            if q1_ret is not None and q2_ret is not None and q3_ret is not None and q4_ret is not None:
                rs_raw = (0.4 * q1_ret) + (0.2 * q2_ret) + (0.2 * q3_ret) + (0.2 * q4_ret)
            elif q1_ret is not None and q2_ret is not None and q3_ret is not None:
                rs_raw = (0.5 * q1_ret) + (0.25 * q2_ret) + (0.25 * q3_ret)
            elif q1_ret is not None and q2_ret is not None:
                rs_raw = (0.6 * q1_ret) + (0.4 * q2_ret)
            elif q1_ret is not None:
                rs_raw = 1.0 * q1_ret

            row["rs_raw_score"] = round(rs_raw, 2) if rs_raw is not None else None
            
            summary_data.append(row)
            
        except Exception as e:
            print(f"    Error processing {key}: {e}")
            
    if summary_data:
        out_path = perf_dir / "performance_summary.json"
        
        # Calculate Percentile-Ranked RS Rating (1-99) across all sectors/themes
        raw_scores = {r["Theme/Index"]: r["rs_raw_score"] for r in summary_data if r.get("rs_raw_score") is not None}
        if raw_scores:
            score_series = pd.Series(raw_scores)
            ranks = score_series.rank(pct=True, method="average")
            rs_ratings = (ranks * 98).round().astype(int) + 1
            for r in summary_data:
                t = r["Theme/Index"]
                if t in rs_ratings:
                    rating_val = int(np.clip(rs_ratings[t], 1, 99))
                    r["RS Rating"] = rating_val
                    r["IBD RS Rating"] = rating_val
                else:
                    r["RS Rating"] = None
                    r["IBD RS Rating"] = None
        else:
            for r in summary_data:
                r["RS Rating"] = None
                r["IBD RS Rating"] = None
        
        # We must serialize via Pandas to guarantee strictly compliant JSON (NaN -> null). 
        # Python's built-in json.dump writes literal 'NaN' which breaks JS parsers.
        df_summary = pd.DataFrame(summary_data)
        
        # Deduplicate rows by Theme/Index to prevent duplicate table rows
        df_summary = df_summary.drop_duplicates(subset=["Theme/Index"], keep="first")
        
        # Replace python NaNs to None for safe serialization just in case
        df_summary = df_summary.where(pd.notna(df_summary), None)
        df_summary.to_json(out_path, orient="records", date_format="iso", indent=2)
        
        print(f"  OK   performance_summary.json ({len(df_summary)} rows)")
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
        str(source_dir / "market_breadth_*.csv"),
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


def export_constituent_performance(output_dir: Path, source_dir: Path):
    """Calculate constituent performance directly from master NSE Bhavcopy parquet file with corporate action ratio adjustments."""
    perf_dir = output_dir / "constituent_performance"
    perf_dir.mkdir(parents=True, exist_ok=True)
    out_file = perf_dir / "constituent_performance_latest.json"

    parquet_paths = [
        source_dir / "nse_master_adjusted_2014_onwards.parquet",
        Path("/home/ubuntu/NSE_data/nse_master_adjusted_2014_onwards.parquet"),
        Path("/Users/sumeetdas/Antigravity_NSE_Data/nse_master_bhav_with_delivery_2014_onwards.parquet"),
    ]
    parquet_file = next((p for p in parquet_paths if p.exists()), None)

    if not parquet_file:
        print("  WARN Parquet file not found. Falling back to source JSON.")
        export_json_file(output_dir, source_dir, "constituent_performance_latest.json", "constituent_performance", "constituent_performance_latest.json")
        return

    print("  Calculating Constituent Performance from Parquet Bhavcopy...")
    try:
        # ── Read parquet with 'series' column for proper multi-series dedup ──
        # Partitioned parquet datasets can overflow pyarrow's int8 dictionary
        # indices when unifying the 'series' column across year partitions.
        # Workaround: read each partition file individually and concatenate.
        has_series = False
        _want_cols = ["symbol", "trade_date", "close", "series"]
        _want_cols_adj = ["symbol", "trade_date", "adj_close", "series"]

        if parquet_file.is_dir():
            # Partitioned dataset — read per-partition to avoid int8 overflow
            import glob as _glob
            _parts = sorted(_glob.glob(str(parquet_file / "**" / "*.parquet"), recursive=True))
            if _parts:
                _frames = []
                for _pf in _parts:
                    try:
                        _frames.append(pd.read_parquet(_pf, columns=_want_cols))
                    except Exception:
                        try:
                            _df_tmp = pd.read_parquet(_pf, columns=_want_cols_adj)
                            _df_tmp = _df_tmp.rename(columns={"adj_close": "close"})
                            _frames.append(_df_tmp)
                        except Exception:
                            try:
                                _frames.append(pd.read_parquet(_pf, columns=["symbol", "trade_date", "close"]))
                            except Exception:
                                _df_tmp = pd.read_parquet(_pf, columns=["symbol", "trade_date", "adj_close"])
                                _df_tmp = _df_tmp.rename(columns={"adj_close": "close"})
                                _frames.append(_df_tmp)
                df_master = pd.concat(_frames, ignore_index=True)
                has_series = "series" in df_master.columns
            else:
                df_master = pd.read_parquet(parquet_file, columns=["symbol", "trade_date", "close"])
        else:
            # Single file
            try:
                df_master = pd.read_parquet(parquet_file, columns=_want_cols)
                has_series = True
            except Exception:
                try:
                    df_master = pd.read_parquet(parquet_file, columns=["symbol", "trade_date", "close"])
                except Exception:
                    df_master = pd.read_parquet(parquet_file, columns=["symbol", "trade_date", "adj_close"])
                    df_master = df_master.rename(columns={"adj_close": "close"})

        df_master["symbol_ns"] = df_master["symbol"].astype(str).apply(lambda s: s if s.endswith(".NS") else f"{s}.NS")

        # Prefer EQ series when multiple series (EQ, BL, P1, T0, etc.) exist for the
        # same (symbol, date).  Block-deal (BL) and auction (P1) close prices differ
        # from the regular EQ close — using them silently corrupts 1D/1W returns.
        if has_series:
            # Strictly filter to equity series (EQ, BE, BZ for Mainboard, SM, ST, SZ for SME) to purge debt/bond
            # instruments (N1-N9, NC, Y*, Z*, etc.) which trade at debt face values (₹1,000+) and corrupt equity price histories (e.g. TATACAP).
            equity_series = ["EQ", "BE", "BZ", "SM", "ST", "SZ"]
            df_master = df_master[df_master["series"].isin(equity_series)]
            _series_priority = {"EQ": 0, "BE": 1, "BZ": 2, "SM": 3, "ST": 4, "SZ": 5}
            df_master["_sprio"] = df_master["series"].map(lambda s: _series_priority.get(s, 99) if isinstance(s, str) else 99)
            df_master = df_master.sort_values(["symbol_ns", "trade_date", "_sprio"])
            df_master = df_master.drop_duplicates(subset=["symbol_ns", "trade_date"], keep="first")
            df_master = df_master.drop(columns=["_sprio", "series"])
            print(f"    (Series-aware dedup applied — strictly equity series {equity_series} retained)")
        else:
            df_master = df_master.drop_duplicates(subset=["symbol_ns", "trade_date"])
        df_pivot = df_master.pivot(index="trade_date", columns="symbol_ns", values="close").sort_index()
        df_pivot.index = pd.to_datetime(df_pivot.index)
        if hasattr(df_pivot.index, 'tz') and df_pivot.index.tz is not None:
            df_pivot.index = df_pivot.index.tz_localize(None)

        # Apply corporate action split/bonus ratio adjustments (pct < -0.45 and pct > +0.80)
        for col in df_pivot.columns:
            ser = df_pivot[col].dropna()
            if len(ser) > 2:
                pct = ser.pct_change()
                # 1. Splits / Bonuses (price drop > 45%)
                split_dates = pct[pct < -0.45].index
                if len(split_dates) > 0:
                    s_copy = df_pivot[col].copy()
                    for d in split_dates:
                        idx = s_copy.index.get_loc(d)
                        if idx > 0:
                            prev_raw = s_copy.iloc[idx - 1]
                            curr_raw = s_copy.iloc[idx]
                            if pd.notna(prev_raw) and pd.notna(curr_raw):
                                prev_val = float(prev_raw)
                                curr_val = float(curr_raw)
                                if curr_val > 0:
                                    factor = round(prev_val / curr_val)
                                    if factor >= 2:
                                        s_copy.iloc[:idx] = s_copy.iloc[:idx] / factor
                    df_pivot[col] = s_copy

                # 2. Reverse Splits (price surge > 80%)
                rev_dates = pct[pct > 0.80].index
                if len(rev_dates) > 0:
                    s_copy = df_pivot[col].copy()
                    for d in rev_dates:
                        idx = s_copy.index.get_loc(d)
                        if idx > 0:
                            prev_raw = s_copy.iloc[idx - 1]
                            curr_raw = s_copy.iloc[idx]
                            if pd.notna(prev_raw) and pd.notna(curr_raw):
                                prev_val = float(prev_raw)
                                curr_val = float(curr_raw)
                                if prev_val > 0:
                                    factor = round(curr_val / prev_val)
                                    if factor >= 2:
                                        s_copy.iloc[:idx] = s_copy.iloc[:idx] * factor
                    df_pivot[col] = s_copy

        # Load Nifty 50 for Relative Strength calculations
        nifty_paths = [
            source_dir / "market_breadth_nifty50.csv",
            source_dir / "breadth" / "market_breadth_nifty50.csv",
            source_dir / "market_breadth_nifty50.json",
            source_dir / "breadth" / "market_breadth_nifty50.json",
            Path("/home/ubuntu/nifty-breadth/market_breadth_nifty50.csv"),
            Path("/Users/sumeetdas/Projects/nifty-breadth/market_breadth_nifty50.csv"),
        ]
        nifty_ser = None
        for n_path in nifty_paths:
            if n_path.exists():
                try:
                    if n_path.suffix == ".json":
                        with open(n_path) as f:
                            b_data = json.load(f)
                        b_df = pd.DataFrame(b_data)
                    else:
                        b_df = pd.read_csv(n_path)
                    if not b_df.empty and 'Index_Close' in b_df.columns:
                        b_df['Date'] = pd.to_datetime(b_df['Date'])
                        nifty_ser = b_df.set_index('Date')['Index_Close'].dropna()
                        break
                except Exception as e:
                    print(f"  WARN Failed to load Nifty baseline from {n_path}: {e}")

        nifty_latest = float(nifty_ser.iloc[-1]) if nifty_ser is not None and len(nifty_ser) >= 1 else 0
        nifty_5d = float(nifty_ser.iloc[-6]) if nifty_ser is not None and len(nifty_ser) >= 6 else 0
        nifty_10d = float(nifty_ser.iloc[-11]) if nifty_ser is not None and len(nifty_ser) >= 11 else 0
        nifty_20d = float(nifty_ser.iloc[-21]) if nifty_ser is not None and len(nifty_ser) >= 21 else 0
        nifty_50d = float(nifty_ser.iloc[-51]) if nifty_ser is not None and len(nifty_ser) >= 51 else 0

        latest_date = df_pivot.index[-1]
        periods = {
            "1D": 1,
            "1W": 7,
            "1M": 30,
            "3M": 90,
            "6M": 180,
            "YTD": None,
            "1Y": 365,
            "3Y": 365 * 3,
            "5Y": 365 * 5,
        }

        result = {}
        raw_scores = {}

        for col in df_pivot.columns:
            ser = df_pivot[col].dropna()
            if ser.empty:
                continue
            curr_price = float(ser.iloc[-1])
            if curr_price <= 0:
                continue

            listing_days = int(len(ser))
            is_ipo = bool(listing_days < 252)

            c_row = {
                "listing_days": listing_days,
                "is_ipo": is_ipo,
            }
            for p_name, days in periods.items():
                if p_name == "1D":
                    if len(ser) >= 2:
                        prev_p = float(ser.iloc[-2])
                        c_row["1D"] = round(((curr_price - prev_p) / prev_p) * 100, 2) if prev_p > 0 else None
                    else:
                        c_row["1D"] = None
                elif p_name == "YTD":
                    ytd_target = pd.Timestamp(year=latest_date.year - 1, month=12, day=31)
                    mask = ser.index <= ytd_target
                    if mask.any():
                        past_p = float(ser[mask].iloc[-1])
                        c_row["YTD"] = round(((curr_price - past_p) / past_p) * 100, 2) if past_p > 0 else None
                    else:
                        c_row["YTD"] = None
                else:
                    target_d = latest_date - timedelta(days=days)
                    mask = ser.index <= target_d
                    if mask.any():
                        past_p = float(ser[mask].iloc[-1])
                        c_row[p_name] = round(((curr_price - past_p) / past_p) * 100, 2) if past_p > 0 else None
                    else:
                        c_row[p_name] = None

            # Relative Strength against Nifty 50
            for num_days, label in [(6, "RS (5D)"), (11, "RS (10D)"), (21, "RS (20D)"), (51, "RS (50D)")]:
                nifty_past = nifty_5d if num_days == 6 else (nifty_10d if num_days == 11 else (nifty_20d if num_days == 21 else nifty_50d))
                if nifty_latest > 0 and nifty_past > 0 and len(ser) >= num_days:
                    past_p = float(ser.iloc[-num_days])
                    if past_p > 0:
                        curr_ratio = curr_price / nifty_latest
                        past_ratio = past_p / nifty_past
                        rs_val = ((curr_ratio - past_ratio) / past_ratio) * 100
                        c_row[label] = round(rs_val, 2) if pd.notna(rs_val) else None
                    else:
                        c_row[label] = None
                else:
                    c_row[label] = None

            # IBD RS 4-Quarter Weighted Score
            # Q1 (63 trading days), Q2 (126 trading days), Q3 (189 trading days), Q4 (252 trading days)
            q1_ret, q2_ret, q3_ret, q4_ret = None, None, None, None
            if listing_days >= 64:
                p_q1 = float(ser.iloc[-64])
                if p_q1 > 0:
                    q1_ret = ((curr_price - p_q1) / p_q1) * 100
            if listing_days >= 127:
                p_q1 = float(ser.iloc[-64])
                p_q2 = float(ser.iloc[-127])
                if p_q2 > 0:
                    q2_ret = ((p_q1 - p_q2) / p_q2) * 100
            if listing_days >= 190:
                p_q2 = float(ser.iloc[-127])
                p_q3 = float(ser.iloc[-190])
                if p_q3 > 0:
                    q3_ret = ((p_q2 - p_q3) / p_q3) * 100
            if listing_days >= 253:
                p_q3 = float(ser.iloc[-190])
                p_q4 = float(ser.iloc[-253])
                if p_q4 > 0:
                    q4_ret = ((p_q3 - p_q4) / p_q4) * 100

            rs_raw = None
            if q1_ret is not None and q2_ret is not None and q3_ret is not None and q4_ret is not None:
                rs_raw = (0.4 * q1_ret) + (0.2 * q2_ret) + (0.2 * q3_ret) + (0.2 * q4_ret)
            elif q1_ret is not None and q2_ret is not None and q3_ret is not None:
                rs_raw = (0.5 * q1_ret) + (0.25 * q2_ret) + (0.25 * q3_ret)
            elif q1_ret is not None and q2_ret is not None:
                rs_raw = (0.6 * q1_ret) + (0.4 * q2_ret)
            elif q1_ret is not None:
                rs_raw = 1.0 * q1_ret

            c_row["rs_raw_score"] = round(rs_raw, 2) if rs_raw is not None else None
            if rs_raw is not None:
                raw_scores[col] = rs_raw

            # Absolute RS Line vs Nifty 50 & 52-Week Lead Breakout Detection
            rs_52w_high = False
            price_52w_high = False
            rs_lead = False
            rs_dist_pct = None
            price_dist_pct = None

            if nifty_ser is not None and len(nifty_ser) > 0:
                # Align on common trading dates
                aligned = pd.concat([ser.rename("stock"), nifty_ser.rename("nifty")], axis=1, join="inner").dropna()
                if len(aligned) >= 20:
                    rs_line = (aligned["stock"] / aligned["nifty"]) * 1000.0
                    lookback_len = min(252, len(rs_line))
                    
                    rs_curr = float(rs_line.iloc[-1])
                    price_curr = float(aligned["stock"].iloc[-1])
                    
                    if lookback_len > 1:
                        rs_prior_max = float(rs_line.iloc[-lookback_len:-1].max())
                        price_prior_max = float(aligned["stock"].iloc[-lookback_len:-1].max())
                        
                        rs_52w_high = bool(rs_curr >= rs_prior_max)
                        price_52w_high = bool(price_curr >= price_prior_max)
                        # RS Lead: RS line is at/above 52W high while stock price is at least 0.5% below its 52W high
                        rs_lead = bool(rs_52w_high and price_curr < price_prior_max * 0.995)
                        
                        if rs_prior_max > 0:
                            rs_dist_pct = round(((rs_curr - rs_prior_max) / rs_prior_max) * 100, 2)
                        if price_prior_max > 0:
                            price_dist_pct = round(((price_curr - price_prior_max) / price_prior_max) * 100, 2)

            c_row["rs_line_52w_high"] = rs_52w_high
            c_row["price_52w_high"] = price_52w_high
            c_row["rs_lead_breakout"] = rs_lead
            c_row["rs_dist_52w_pct"] = rs_dist_pct
            c_row["price_dist_52w_pct"] = price_dist_pct

            result[col] = c_row

        # Calculate Percentile-Ranked IBD RS Rating (1-99)
        if raw_scores:
            score_series = pd.Series(raw_scores)
            ranks = score_series.rank(pct=True, method="average")
            rs_ratings = (ranks * 98).round().astype(int) + 1
            for sym, rating in rs_ratings.items():
                if sym in result:
                    result[sym]["ibd_rs_rating"] = int(np.clip(rating, 1, 99))

        for sym, r in result.items():
            if "ibd_rs_rating" not in r:
                r["ibd_rs_rating"] = None

        with open(out_file, "w") as f:
            json.dump(result, f, indent=2)

        ytd_valid = sum(1 for r in result.values() if r.get("YTD") is not None)
        rs20_valid = sum(1 for r in result.values() if r.get("RS (20D)") is not None)
        ibd_valid = sum(1 for r in result.values() if r.get("ibd_rs_rating") is not None)
        rs_lead_count = sum(1 for r in result.values() if r.get("rs_lead_breakout") is True)
        ipo_count = sum(1 for r in result.values() if r.get("is_ipo") is True)
        print(f"  OK   constituent_performance_latest.json ({len(result)} stocks | IBD RS valid: {ibd_valid} | RS Lead Breakouts: {rs_lead_count} | IPOs: {ipo_count} | YTD valid: {ytd_valid})")
    except Exception as e:
        print(f"  ERR  Calculating constituent performance: {e}")
        export_json_file(output_dir, source_dir, "constituent_performance_latest.json", "constituent_performance", "constituent_performance_latest.json")


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


def export_stock_search_index(output_dir: Path):
    """Build a reverse index: ticker → [themes/sectors it belongs to].
    
    Reads market_status_latest.json (already exported) and config.ts (for id/category mapping)
    to produce a compact JSON that powers the global stock search on the frontend.
    """
    import re
    
    search_dir = output_dir / "search"
    search_dir.mkdir(parents=True, exist_ok=True)
    
    # 1. Load market status
    ms_path = output_dir / "market_status" / "market_status_latest.json"
    if not ms_path.exists():
        print("  SKIP stock_search_index.json (market_status not found)")
        return
    
    with open(ms_path) as f:
        market_status = json.load(f)
    
    # 2. Build id→{title, category} from config.ts
    config_path = Path(__file__).parent.parent / "lib" / "config.ts"
    id_to_meta: dict = {}
    if config_path.exists():
        content = config_path.read_text()
        # Match patterns like: id: "breadth_theme_paints", title: "Paints", ... category: "industries"
        for match in re.finditer(
            r'id:\s*"([^"]+)",\s*title:\s*"([^"]+)",\s*description:\s*"[^"]*",\s*dataFile:\s*"[^"]*",\s*category:\s*"([^"]+)"',
            content
        ):
            id_to_meta[match.group(2)] = {
                "id": match.group(1),
                "title": match.group(2),
                "category": match.group(3),
            }
    
    # 3. Also try case-insensitive matching for sector names like "NIFTY AUTO" → "Nifty Auto"
    title_lower_map = {k.lower(): v for k, v in id_to_meta.items()}
    
    # 4. Build reverse index: ticker → [theme entries]
    reverse_index: dict = {}  # ticker_clean → [{id, title, category}]
    
    for theme_name, entry in market_status.items():
        # Resolve theme_name to config meta
        meta = id_to_meta.get(theme_name)
        if not meta:
            meta = title_lower_map.get(theme_name.lower())
        if not meta:
            # Try partial matches for sectors (e.g. "NIFTY AUTO" → find "Nifty Auto")
            for config_title, config_meta in id_to_meta.items():
                if config_title.upper() == theme_name.upper():
                    meta = config_meta
                    break
        
        if not meta:
            continue  # Skip themes with no config mapping
        
        theme_entry = {"id": meta["id"], "title": meta["title"], "category": meta["category"]}
        
        all_tickers = entry.get("above", []) + entry.get("below", []) + entry.get("new_stock", [])
        for ticker in all_tickers:
            clean = ticker.replace(".NS", "").replace(".BO", "")
            if clean not in reverse_index:
                reverse_index[clean] = []
            # Avoid duplicate entries
            if theme_entry not in reverse_index[clean]:
                reverse_index[clean].append(theme_entry)
    
    # 5. Sort tickers alphabetically and write
    sorted_index = dict(sorted(reverse_index.items()))
    
    out_path = search_dir / "stock_search_index.json"
    with open(out_path, "w") as f:
        json.dump(sorted_index, f, indent=2)
    
    print(f"  OK   stock_search_index.json ({len(sorted_index)} tickers)")


def export_52w_high_low_history(output_dir: Path, source_dir: Path):
    """
    Exports rolling 60-day 52-Week High and Low recurrence, streak, and timeline data.
    Ensures 100% parity with Stock_market drilldowns, with an autonomous DuckDB fallback.
    Runs Section 8 Audit Harness before persisting.
    """
    market_status_dir = output_dir / "market_status"
    market_status_dir.mkdir(parents=True, exist_ok=True)
    out_file = market_status_dir / "market_52w_history.json"

    # Ensure scripts directory is in sys.path for vendored utilities
    scripts_dir = Path(__file__).parent
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))

    try:
        from etf_util import is_etf_or_re
    except ImportError:
        def is_etf_or_re(sym):
            return False

    try:
        from price_bands_util import load_sec_bands, get_security_info
    except ImportError:
        def load_sec_bands():
            return {}
        def get_security_info(sym, bands=None):
            return {"series": "EQ", "band": "20", "remarks": "-"}

    sec_bands = load_sec_bands()

    parquet_paths = []
    env_pq_path = os.environ.get("NSE_PARQUET_PATH", "").strip()
    if env_pq_path:
        parquet_paths.append(Path(env_pq_path))
    env_pq_dir = os.environ.get("NSE_PARQUET_DIR", "").strip()
    if env_pq_dir:
        parquet_paths.append(Path(env_pq_dir))
    parquet_paths.extend([
        source_dir / "nse_master_adjusted_2014_onwards.parquet",
        source_dir / "parquet",
        source_dir.parent / "Stock_market/data/parquet/master_copy.parquet",
        source_dir.parent / "Stock_market/NSE Master parquet/nse_master_adjusted_2014_onwards.parquet",
        Path("data/parquet"),
        Path("/Users/sumeetdas/Desktop/Antigravity Workspaces/Stock_market/data/parquet/master_copy.parquet"),
        Path("/Users/sumeetdas/Antigravity_NSE_Data/nse_master_adjusted_2014_onwards.parquet"),
        Path("/home/ubuntu/NSE_data/nse_master_adjusted_2014_onwards.parquet"),
    ])

    drilldown_data = {}

    # 1. Check candidate paths for Stock_market drilldowns
    candidate_dirs = []
    env_sm = os.environ.get("STOCK_MARKET_DRILLDOWNS", "").strip()
    if env_sm:
        candidate_dirs.append(Path(env_sm))
    candidate_dirs.extend([
        Path("/Users/sumeetdas/Desktop/Antigravity Workspaces/Stock_market/data/drilldowns"),
        Path("../Stock_market/data/drilldowns"),
        Path("../../Stock_market/data/drilldowns"),
        source_dir / "drilldowns",
        source_dir.parent / "Stock_market/data/drilldowns",
    ])

    drilldown_dir = None
    for p in candidate_dirs:
        if p and p.is_dir():
            year_files = [f for f in p.glob("*.json") if f.stem.isdigit()]
            if year_files:
                drilldown_dir = p
                break

    if drilldown_dir:
        print(f"  Found drilldowns directory: {drilldown_dir}")
        # Identify year files
        year_files = sorted([f for f in drilldown_dir.glob("*.json") if f.stem.isdigit()], key=lambda f: int(f.stem), reverse=True)
        if year_files:
            latest_year_file = year_files[0]
            with open(latest_year_file, "r") as f:
                drilldown_data.update(json.load(f))

            # If sessions < 60 and there is a previous year, load previous year too
            if len(drilldown_data) < 60 and len(year_files) > 1:
                prev_year_file = year_files[1]
                with open(prev_year_file, "r") as f:
                    prev_data = json.load(f)
                    for dt_k, dt_v in prev_data.items():
                        if dt_k not in drilldown_data:
                            drilldown_data[dt_k] = dt_v

    # 2. DuckDB fallback if drilldown data is empty
    if not drilldown_data:
        print("  Drilldowns not found; attempting DuckDB fallback on master parquet...")
        parquet_paths = []
        env_pq_path = os.environ.get("NSE_PARQUET_PATH", "").strip()
        if env_pq_path:
            parquet_paths.append(Path(env_pq_path))
        env_pq_dir = os.environ.get("NSE_PARQUET_DIR", "").strip()
        if env_pq_dir:
            parquet_paths.append(Path(env_pq_dir))
        parquet_paths.extend([
            source_dir / "nse_master_adjusted_2014_onwards.parquet",
            source_dir / "parquet",
            source_dir.parent / "Stock_market/data/parquet/master_copy.parquet",
            source_dir.parent / "Stock_market/NSE Master parquet/nse_master_adjusted_2014_onwards.parquet",
            Path("data/parquet"),
            Path("/Users/sumeetdas/Desktop/Antigravity Workspaces/Stock_market/data/parquet/master_copy.parquet"),
            Path("/Users/sumeetdas/Antigravity_NSE_Data/nse_master_adjusted_2014_onwards.parquet"),
            Path("/home/ubuntu/NSE_data/nse_master_adjusted_2014_onwards.parquet"),
        ])
        chosen_parquet = None
        for p in parquet_paths:
            if p and (p.is_file() or (p.is_dir() and list(p.glob("**/*.parquet")))):
                chosen_parquet = p
                break

        if chosen_parquet:
            print(f"  Calculating 52W history using DuckDB from {chosen_parquet}...")
            try:
                import duckdb
                con = duckdb.connect()
                try:
                    from corporate_actions_util import register_corporate_actions_duckdb
                    register_corporate_actions_duckdb(con)
                    has_ca = True
                except Exception as e:
                    print(f"  Notice: Corporate actions DuckDB table: {e}")
                    has_ca = False

                parquet_pattern = f"{chosen_parquet}/**/*.parquet" if chosen_parquet.is_dir() else str(chosen_parquet)

                ca_join = """
                LEFT JOIN corporate_action_intervals cai
                  ON b.symbol = cai.symbol
                 AND b.d >= cai.start_date
                 AND b.d <= cai.end_date
                """ if has_ca else ""
                adj_factor_expr = "COALESCE(cai.adj_factor, 1.0)" if has_ca else "1.0"

                query = f"""
                WITH base AS (
                    SELECT 
                        TRIM(symbol) as symbol,
                        CAST(trade_date AS DATE) as d,
                        close,
                        open,
                        high,
                        low,
                        volume
                    FROM read_parquet('{parquet_pattern}', union_by_name=true)
                    WHERE series IN ('EQ', 'BE', 'BZ')
                ),
                adjusted AS (
                    SELECT 
                        b.symbol,
                        b.d,
                        b.close * {adj_factor_expr} as adj_close,
                        b.high * {adj_factor_expr} as adj_high,
                        b.low * {adj_factor_expr} as adj_low,
                        b.close as raw_close,
                        b.volume,
                        ROW_NUMBER() OVER (PARTITION BY b.symbol ORDER BY b.d) as session_num,
                        LAG(b.close * {adj_factor_expr}, 1) OVER (PARTITION BY b.symbol ORDER BY b.d) as prev_close,
                        LAG(b.close * {adj_factor_expr}, 5) OVER (PARTITION BY b.symbol ORDER BY b.d) as prev_5d_close,
                        MAX(b.high * {adj_factor_expr}) OVER (
                            PARTITION BY b.symbol 
                            ORDER BY b.d 
                            ROWS BETWEEN 252 PRECEDING AND 1 PRECEDING
                        ) as high_52w,
                        MIN(b.low * {adj_factor_expr}) OVER (
                            PARTITION BY b.symbol 
                            ORDER BY b.d 
                            ROWS BETWEEN 252 PRECEDING AND 1 PRECEDING
                        ) as low_52w
                    FROM base b
                    {ca_join}
                )
                SELECT 
                    symbol,
                    d::VARCHAR as date_str,
                    raw_close,
                    ROUND(((adj_close - prev_close) / prev_close) * 100.0, 2) as pct_1d,
                    ROUND(((adj_close - prev_5d_close) / prev_5d_close) * 100.0, 2) as pct_5d,
                    volume,
                    ROUND(raw_close * volume / 10000000.0, 2) as turnover_cr,
                    CASE WHEN session_num >= 252 AND adj_high >= high_52w THEN 1 ELSE 0 END as is_high,
                    CASE WHEN session_num >= 252 AND adj_low <= low_52w AND NOT (adj_high >= high_52w) THEN 1 ELSE 0 END as is_low
                FROM adjusted
                WHERE d >= (SELECT MAX(d) - INTERVAL 120 DAY FROM base)
                ORDER BY d ASC
                """
                rows = con.execute(query).fetchall()
                con.close()

                for sym, d_str, c, p1, p5, v, t, is_h, is_l in rows:
                    if is_etf_or_re(sym):
                        continue
                    if d_str not in drilldown_data:
                        drilldown_data[d_str] = {"high52w": [], "low52w": []}
                    if is_h:
                        drilldown_data[d_str]["high52w"].append([sym, c, p1 or 0.0, p5 or 0.0, v or 0, t or 0.0])
                    if is_l:
                        drilldown_data[d_str]["low52w"].append([sym, c, p1 or 0.0, p5 or 0.0, v or 0, t or 0.0])
            except Exception as e:
                print(f"  DuckDB fallback error: {e}")

    if not drilldown_data:
        print("  WARN: No 52-Week High/Low history data could be calculated.")
        if out_file.exists():
            print(f"  Retaining existing {out_file}")
            return
        payload = {
            "metadata": {"latest_session": "", "window_sessions": 0, "start_date": "", "end_date": ""},
            "dates": [],
            "highs": [],
            "lows": [],
            "daily_lists": {}
        }
        with open(out_file, "w") as f:
            json.dump(payload, f, indent=2)
        return

    # Sanitize drilldown entries (deduplicate, filter ETFs, REs, unseasoned stocks, and enforce mutual exclusion)
    for dt in list(drilldown_data.keys()):
        session = drilldown_data[dt]
        raw_highs = session.get("high52w", [])
        raw_lows = session.get("low52w", [])

        clean_highs = []
        seen_highs = set()
        for row in raw_highs:
            if not row or not row[0]:
                continue
            sym = str(row[0]).strip().upper().replace(".NS", "")
            if not sym or sym in seen_highs or is_etf_or_re(sym) or sym.endswith("-RE") or sym in ("LUMINO", "SKYWAYS"):
                continue
            seen_highs.add(sym)
            clean_highs.append(row)

        clean_lows = []
        seen_lows = set()
        for row in raw_lows:
            if not row or not row[0]:
                continue
            sym = str(row[0]).strip().upper().replace(".NS", "")
            if not sym or sym in seen_lows or sym in seen_highs or is_etf_or_re(sym) or sym.endswith("-RE") or sym in ("LUMINO", "SKYWAYS"):
                continue
            seen_lows.add(sym)
            clean_lows.append(row)

        drilldown_data[dt]["high52w"] = clean_highs
        drilldown_data[dt]["low52w"] = clean_lows

    # 3. Process sessions and calculate streaks & recurrence
    all_dates = sorted(drilldown_data.keys())
    selected_dates = all_dates[-60:] if len(all_dates) >= 60 else all_dates
    latest_date = selected_dates[-1]
    dates_20 = selected_dates[-20:]
    dates_10 = selected_dates[-10:]
    dates_5 = selected_dates[-5:]

    daily_lists = {}
    for dt in selected_dates:
        session_highs = [f"{row[0].strip().upper().replace('.NS', '')}.NS" for row in drilldown_data[dt].get("high52w", [])]
        session_lows = [f"{row[0].strip().upper().replace('.NS', '')}.NS" for row in drilldown_data[dt].get("low52w", [])]
        daily_lists[dt] = {
            "highs": session_highs,
            "lows": session_lows
        }

    # Load High/Low mapping from parquet if available for circuit lock detection
    hl_lookup = {}
    chosen_pq = None
    for p in parquet_paths:
        if p and (p.is_file() or (p.is_dir() and list(p.glob("**/*.parquet")))):
            chosen_pq = p
            break

    if chosen_pq and selected_dates:
        try:
            import duckdb
            con = duckdb.connect()
            pq_pattern = f"{chosen_pq}/**/*.parquet" if chosen_pq.is_dir() else str(chosen_pq)
            min_date = selected_dates[0]
            q = f"""
            SELECT TRIM(symbol), STRFTIME(CAST(trade_date AS DATE), '%Y-%m-%d'), high, low, series
            FROM read_parquet('{pq_pattern}', union_by_name=true)
            WHERE trade_date >= '{min_date}'
            """
            rows = con.execute(q).fetchall()
            con.close()
            for s, dt_str, h, l, ser in rows:
                hl_lookup[(s, dt_str)] = (float(h) if h is not None else None, float(l) if l is not None else None, ser)
        except Exception as e:
            print(f"  Notice: High/Low parquet lookup: {e}")

    def process_side(list_key, sort_desc=True):
        sym_to_tuples = {}
        for dt in selected_dates:
            sym_to_tuples[dt] = {}
            for row in drilldown_data[dt].get(list_key, []):
                clean = row[0].strip().upper().replace(".NS", "")
                sym_to_tuples[dt][clean] = row

        all_symbols = set()
        for dt in selected_dates:
            all_symbols.update(sym_to_tuples[dt].keys())

        items = []
        for clean in all_symbols:
            hit_dates = [dt for dt in selected_dates if clean in sym_to_tuples[dt]]
            last_hit = max(hit_dates)
            last_row = sym_to_tuples[last_hit][clean]

            close = round(float(last_row[1]), 2) if len(last_row) > 1 and last_row[1] is not None else 0.0
            pct_1d = round(float(last_row[2]), 2) if len(last_row) > 2 and last_row[2] is not None else 0.0
            pct_5d = round(float(last_row[3]), 2) if len(last_row) > 3 and last_row[3] is not None else 0.0
            vol = float(last_row[4]) if len(last_row) > 4 and last_row[4] is not None else 0.0
            t_cr = round(float(last_row[5]), 2) if len(last_row) > 5 and last_row[5] is not None else round(close * vol / 10000000.0, 2)

            c5 = sum(1 for dt in dates_5 if clean in sym_to_tuples[dt])
            c10 = sum(1 for dt in dates_10 if clean in sym_to_tuples[dt])
            c20 = sum(1 for dt in dates_20 if clean in sym_to_tuples[dt])
            c60 = len(hit_dates)

            streak = 0
            if last_hit == latest_date:
                for dt in reversed(selected_dates):
                    if clean in sym_to_tuples[dt]:
                        streak += 1
                    else:
                        break

            is_fresh = (last_hit == latest_date and c20 == 1)
            raw_h20 = [1 if clean in sym_to_tuples[dt] else 0 for dt in dates_20]
            # Ensure history_20d always has exactly 20 elements (padded with leading zeros if fewer than 20 sessions available)
            h20 = ([0] * max(0, 20 - len(raw_h20))) + raw_h20

            raw_h60 = [1 if clean in sym_to_tuples[dt] else 0 for dt in selected_dates]
            # Ensure history_60d has exactly len(selected_dates) elements (up to 60)
            target_len = len(selected_dates)
            h60 = ([0] * max(0, target_len - len(raw_h60))) + raw_h60

            band_info = get_security_info(clean, sec_bands)
            series = band_info.get("series", "EQ") or "EQ"
            circuit_band = band_info.get("band", "20") or "20"

            # Check circuit lock
            hl_info = hl_lookup.get((clean, last_hit))
            if hl_info and hl_info[0] is not None and hl_info[1] is not None:
                raw_high, raw_low = hl_info[0], hl_info[1]
                is_circuit_locked = bool(raw_high == raw_low and abs(pct_1d) >= 1.9)
            else:
                is_circuit_locked = bool(circuit_band in ("2", "5") and abs(pct_1d) >= (float(circuit_band) - 0.1))

            recency_days = (len(selected_dates) - 1) - selected_dates.index(last_hit) if last_hit in selected_dates else 0

            items.append({
                "symbol": f"{clean}.NS",
                "clean_symbol": clean,
                "series": series,
                "circuit_band": circuit_band,
                "is_circuit_locked": is_circuit_locked,
                "close": close,
                "pct_1d": pct_1d,
                "pct_5d": pct_5d,
                "volume": vol,
                "turnover_cr": t_cr,
                "count_5d": c5,
                "count_10d": c10,
                "count_20d": c20,
                "count_60d": c60,
                "streak": streak,
                "is_fresh_20d": is_fresh,
                "last_hit_date": last_hit,
                "recency_days": recency_days,
                "history_20d": h20,
                "history_60d": h60,
            })

        if sort_desc:
            items.sort(key=lambda x: (-x["count_20d"], -x["streak"], -x["count_60d"], -x["pct_1d"]))
        else:
            items.sort(key=lambda x: (-x["count_20d"], -x["streak"], -x["count_60d"], x["pct_1d"]))
        return items

    high_items = process_side("high52w", sort_desc=True)
    low_items = process_side("low52w", sort_desc=False)

    # 4. Enrich high_items and low_items with microstructure & confluence indicators
    print("  Enriching 52W recurrence items with market microstructure, Monthly CPR, 20 EMA & Sector Waves...")

    # 4.1 10D Sector Wave calculation using industry_themes.py
    root_dir = Path(__file__).resolve().parent.parent
    if str(root_dir) not in sys.path:
        sys.path.insert(0, str(root_dir))
    try:
        from industry_themes import INDUSTRY_THEMES
    except ImportError:
        INDUSTRY_THEMES = {}

    active_high_10d = {item["clean_symbol"] for item in high_items if item.get("count_10d", 0) >= 1}
    active_low_10d = {item["clean_symbol"] for item in low_items if item.get("count_10d", 0) >= 1}

    theme_waves_high = {}
    sector_waves_meta = {}
    for theme_name, constituents in INDUSTRY_THEMES.items():
        theme_clean_syms = [s.replace(".NS", "").strip().upper() for s in constituents]
        active_in_theme = [s for s in theme_clean_syms if s in active_high_10d]
        theme_waves_high[theme_name] = len(active_in_theme)
        if active_in_theme:
            sector_waves_meta[theme_name] = [f"{s}.NS" for s in sorted(active_in_theme)]

    theme_waves_low = {}
    sector_waves_low_meta = {}
    for theme_name, constituents in INDUSTRY_THEMES.items():
        theme_clean_syms = [s.replace(".NS", "").strip().upper() for s in constituents]
        active_in_theme_low = [s for s in theme_clean_syms if s in active_low_10d]
        theme_waves_low[theme_name] = len(active_in_theme_low)
        if active_in_theme_low:
            sector_waves_low_meta[theme_name] = [f"{s}.NS" for s in sorted(active_in_theme_low)]

    sym_to_themes = {}
    for theme_name, constituents in INDUSTRY_THEMES.items():
        for s in constituents:
            c = s.replace(".NS", "").strip().upper()
            sym_to_themes.setdefault(c, []).append(theme_name)

    # 4.2 Parquet microstructure calculation (Monthly CPR, 20 EMA, Volume & Delivery, Candle Anatomy)
    if not chosen_pq:
        for p in parquet_paths:
            if p and (p.is_file() or (p.is_dir() and list(p.glob("**/*.parquet")))):
                chosen_pq = p
                break

    micro_lookup = {}
    cpr_lookup = {}

    if chosen_pq and selected_dates:
        try:
            import duckdb
            import polars as pl

            con = duckdb.connect()
            pq_pattern = f"{chosen_pq}/**/*.parquet" if chosen_pq.is_dir() else str(chosen_pq)
            min_date = selected_dates[0]

            # Monthly CPR query (anchored to prior calendar month)
            q_cpr = f"""
            SELECT 
                TRIM(symbol) as symbol,
                DATE_TRUNC('month', CAST(trade_date AS DATE)) as month_start,
                MAX(high) as m_high,
                MIN(low) as m_low,
                ARG_MAX(close, CAST(trade_date AS DATE)) as m_close
            FROM read_parquet('{pq_pattern}', union_by_name=true)
            WHERE series IN ('EQ', 'BE', 'BZ')
              AND trade_date >= (CAST('{min_date}' AS DATE) - INTERVAL 120 DAY)
            GROUP BY TRIM(symbol), DATE_TRUNC('month', CAST(trade_date AS DATE))
            """
            cpr_rows = con.execute(q_cpr).fetchall()
            for sym, m_start, mh, ml, mc in cpr_rows:
                if m_start and mh is not None and ml is not None and mc is not None:
                    cpr_lookup[(sym, m_start.year, m_start.month)] = (float(mh), float(ml), float(mc))

            # Daily warmup query (90-day warmup before selected_dates[0])
            q_daily = f"""
            SELECT 
                TRIM(symbol) as symbol,
                STRFTIME(CAST(trade_date AS DATE), '%Y-%m-%d') as trade_date,
                open,
                high,
                low,
                close,
                volume,
                deliv_qty,
                deliv_pct,
                series
            FROM read_parquet('{pq_pattern}', union_by_name=true)
            WHERE series IN ('EQ', 'BE', 'BZ')
              AND trade_date >= (CAST('{min_date}' AS DATE) - INTERVAL 90 DAY)
            ORDER BY symbol, trade_date ASC
            """
            daily_df = con.execute(q_daily).pl()
            con.close()

            if len(daily_df) > 0:
                daily_df = daily_df.unique(subset=["symbol", "trade_date"], keep="last")
                daily_df = daily_df.sort(["symbol", "trade_date"])
                daily_df = daily_df.with_columns(
                    pl.col("close").ewm_mean(span=20, adjust=False).over("symbol").alias("ema_20"),
                    pl.col("volume").rolling_mean(window_size=20, min_samples=1).over("symbol").alias("vol_sma20"),
                    pl.col("deliv_qty").rolling_mean(window_size=20, min_samples=1).over("symbol").alias("deliv_qty_sma20"),
                    pl.col("open").shift(1).over("symbol").alias("prev_open"),
                    pl.col("close").shift(1).over("symbol").alias("prev_close"),
                    pl.col("close").shift(5).over("symbol").alias("prev_5d_close"),
                )

                all_target_syms = set(item["clean_symbol"] for item in high_items + low_items)
                filtered_df = daily_df.filter(pl.col("symbol").is_in(list(all_target_syms)))
                micro_lookup = {(r["symbol"], r["trade_date"]): r for r in filtered_df.to_dicts()}

        except Exception as e:
            print(f"  Notice: Microstructure parquet extraction failed: {e}")

    def enrich_items(items, is_high=True):
        theme_waves = theme_waves_high if is_high else theme_waves_low

        for item in items:
            clean = item["clean_symbol"]
            last_hit = item["last_hit_date"]
            r_days = item.get("recency_days", 0)

            # Dominant theme assignment (argmax_T W(T))
            st_themes = sym_to_themes.get(clean, [])
            if st_themes:
                best_theme = max(st_themes, key=lambda t: (theme_waves.get(t, 0), t))
                item["sector_wave_theme"] = best_theme
                item["sector_wave_count"] = theme_waves.get(best_theme, 0)
            else:
                item["sector_wave_theme"] = None
                item["sector_wave_count"] = None

            # Get latest market session data (T), falling back to last_hit_date only if delisted prior to latest_date
            m_data = micro_lookup.get((clean, latest_date))
            if not m_data:
                m_data = micro_lookup.get((clean, last_hit))

            if m_data:
                c = float(m_data["close"]) if m_data.get("close") is not None else None
                v = float(m_data["volume"]) if m_data.get("volume") is not None else None
                p_close = float(m_data["prev_close"]) if m_data.get("prev_close") is not None else None
                p5_close = float(m_data["prev_5d_close"]) if m_data.get("prev_5d_close") is not None else None

                if c is not None:
                    item["close"] = round(c, 2)
                    if p_close is not None and p_close > 0:
                        item["pct_1d"] = round(((c - p_close) / p_close) * 100.0, 2)
                    if p5_close is not None and p5_close > 0:
                        item["pct_5d"] = round(((c - p5_close) / p5_close) * 100.0, 2)
                    if v is not None:
                        item["volume"] = v
                        item["turnover_cr"] = round(c * v / 10000000.0, 2)

            # Monthly CPR anchored to latest session's (or last_hit's) prior calendar month
            m_date = m_data.get("trade_date", latest_date) if m_data else latest_date
            try:
                y, m, _ = map(int, m_date.split("-"))
                prev_y, prev_m = (y - 1, 12) if m == 1 else (y, m - 1)
                cpr_tuple = cpr_lookup.get((clean, prev_y, prev_m))
            except Exception:
                cpr_tuple = None

            item_close = item.get("close")

            if cpr_tuple and cpr_tuple[0] is not None and cpr_tuple[1] is not None and cpr_tuple[2] is not None:
                mh, ml, mc = cpr_tuple
                pivot = (mh + ml + mc) / 3.0
                bc = (mh + ml) / 2.0
                tc = 2.0 * pivot - bc
                cpr_top = max(tc, bc)
                cpr_bot = min(tc, bc)
                cpr_width = ((cpr_top - cpr_bot) / pivot) * 100.0 if pivot > 0 else 0.0

                if item_close is not None:
                    if item_close > cpr_top:
                        cpr_pos = "above"
                    elif item_close < cpr_bot:
                        cpr_pos = "below"
                    else:
                        cpr_pos = "inside"
                    cpr_dist_top = ((item_close - cpr_top) / cpr_top) * 100.0 if cpr_top > 0 else 0.0
                else:
                    cpr_pos = None
                    cpr_dist_top = None

                item["cpr_pivot"] = round(pivot, 2)
                item["cpr_top"] = round(cpr_top, 2)
                item["cpr_bot"] = round(cpr_bot, 2)
                item["cpr_width_pct"] = round(cpr_width, 2)
                item["cpr_pos"] = cpr_pos
                item["cpr_dist_top"] = round(cpr_dist_top, 2) if cpr_dist_top is not None else None
            else:
                item["cpr_pivot"] = None
                item["cpr_top"] = None
                item["cpr_bot"] = None
                item["cpr_width_pct"] = None
                item["cpr_pos"] = None
                item["cpr_dist_top"] = None

            # Daily microstructure metrics evaluated on latest session (T)
            if m_data:
                o = m_data.get("open")
                h = m_data.get("high")
                l = m_data.get("low")
                c = m_data.get("close")
                v = m_data.get("volume")
                dq = m_data.get("deliv_qty")
                dp = m_data.get("deliv_pct")
                ema20 = m_data.get("ema_20")
                v_sma20 = m_data.get("vol_sma20")
                dq_sma20 = m_data.get("deliv_qty_sma20")
                p_open = m_data.get("prev_open")
                p_close = m_data.get("prev_close")

                # EMA 20 & Extension
                if ema20 is not None and ema20 > 0 and c is not None:
                    item["ema_20"] = round(float(ema20), 2)
                    item["ema_20_ext"] = round(((c - ema20) / ema20) * 100.0, 2)
                else:
                    item["ema_20"] = None
                    item["ema_20_ext"] = None

                # Volume Surge
                if v is not None and v_sma20 is not None and v_sma20 > 0:
                    item["vol_surge"] = round(float(v) / float(v_sma20), 2)
                else:
                    item["vol_surge"] = None

                # Delivery % and Delivery Surge
                item["deliv_pct"] = round(float(dp), 2) if dp is not None else None
                if dq is not None and dq_sma20 is not None and dq_sma20 > 0:
                    item["deliv_surge"] = round(float(dq) / float(dq_sma20), 2)
                else:
                    item["deliv_surge"] = None

                # Candle Pattern
                rng = (h - l) if (h is not None and l is not None) else 0.0
                if rng > 0 and c is not None and c > 0 and (rng / c) >= 0.0075 and o is not None and h is not None and l is not None:
                    cr = (c - l) / rng
                    lw = (min(o, c) - l) / rng
                    uw = (h - max(o, c)) / rng
                    body = abs(c - o) / rng

                    if cr >= 0.70 and lw >= 0.50 and uw <= 0.20:
                        item["candle_pattern"] = "hammer"
                    elif c > o and body >= 0.65 and cr >= 0.75:
                        item["candle_pattern"] = "thrust"
                    elif cr <= 0.30 and uw >= 0.50 and lw <= 0.20:
                        item["candle_pattern"] = "rejection"
                    else:
                        item["candle_pattern"] = "normal"
                else:
                    item["candle_pattern"] = "normal"

                # Prior Day Candle Color
                if p_close is not None and p_open is not None:
                    if p_close < p_open:
                        item["prev_color"] = "red"
                    elif p_close > p_open:
                        item["prev_color"] = "green"
                    else:
                        item["prev_color"] = "flat"
                else:
                    item["prev_color"] = None

                # Execution helper levels
                item["today_high"] = round(float(h), 2) if h is not None else None
                item["today_low"] = round(float(l), 2) if l is not None else None
                if item["today_high"] is not None and item["today_low"] is not None and item["today_high"] > 0:
                    item["risk_pct"] = round(((item["today_high"] - item["today_low"]) / item["today_high"]) * 100.0, 2)
                else:
                    item["risk_pct"] = None

                # Circuit lock update for session T
                if h is not None and l is not None:
                    item["is_circuit_locked"] = bool(h == l and abs(item["pct_1d"]) >= 1.9)
                elif item.get("circuit_band") in ("2", "5"):
                    item["is_circuit_locked"] = bool(abs(item["pct_1d"]) >= (float(item["circuit_band"]) - 0.1))
            else:
                item["ema_20"] = None
                item["ema_20_ext"] = None
                item["vol_surge"] = None
                item["deliv_pct"] = None
                item["deliv_surge"] = None
                item["candle_pattern"] = "normal"
                item["prev_color"] = None
                item["today_high"] = None
                item["today_low"] = None
                item["risk_pct"] = None

            # Setup classification
            if is_high:
                c_pat = item.get("candle_pattern")
                prev_c = item.get("prev_color")
                p1d = item.get("pct_1d") or 0.0
                ema_ext = item.get("ema_20_ext")
                cpr_dist = item.get("cpr_dist_top")
                cpr_pos = item.get("cpr_pos")

                prev_color_desc = "🔴 Red" if prev_c == "red" else ("🟢 Green" if prev_c == "green" else ("⚪ Flat" if prev_c == "flat" else "—"))

                # 1. hammer_bounce: Today is a Hammer bouncing near 20 EMA or CPR Top
                near_ema_tight = ema_ext is not None and abs(ema_ext) <= 2.5
                near_cpr_tight = cpr_dist is not None and abs(cpr_dist) <= 2.0
                is_hammer = (c_pat == "hammer")

                # 2. shakeout_breakout: Today is 52W High (or thrust >= 1.5%), Yesterday was Red
                is_52w_today = (r_days == 0)
                is_thrust = (c_pat == "thrust" and p1d >= 1.5)

                # 3. one_day_pause: 52W High hit yesterday (recency_days == 1), Today is a rest/pullback bar near 20 EMA / CPR
                near_ema_cpr = (ema_ext is not None and -2.0 <= ema_ext <= 8.0) or (cpr_dist is not None and -2.0 <= cpr_dist <= 6.0) or (cpr_pos in ("above", "inside"))
                is_rest_bar = (c_pat in ("normal", "hammer") or p1d <= 2.5) and (c_pat != "rejection" or p1d >= -3.0)

                if is_hammer and (near_ema_tight or near_cpr_tight):
                    item["setup_type"] = "hammer_bounce"
                    item["setup_label"] = "🔨 Hammer @ Support"
                    item["setup_bar_desc"] = f"T: 🔨 Pin Bar | T-1: {prev_color_desc}"
                elif prev_c == "red" and (is_52w_today or is_thrust):
                    item["setup_type"] = "shakeout_breakout"
                    item["setup_label"] = "⚡ Shakeout Breakout"
                    item["setup_bar_desc"] = "T: 🚀 Thrust | T-1: 🔴 Red"
                elif r_days == 1 and near_ema_cpr and is_rest_bar:
                    item["setup_type"] = "one_day_pause"
                    item["setup_label"] = "🎯 1D Pause / Retest"
                    item["setup_bar_desc"] = "T: 🔴 Rest | T-1: ⭐ 52W"
                elif r_days == 0 and c_pat == "thrust":
                    item["setup_type"] = "fresh_thrust"
                    item["setup_label"] = "🚀 Fresh Thrust"
                    item["setup_bar_desc"] = "T: 🚀 Thrust | T-1: 🟢 Green"
                elif 2 <= r_days <= 5 and ema_ext is not None and 0.0 <= ema_ext <= 6.0:
                    item["setup_type"] = "consolidation_base"
                    item["setup_label"] = f"⏳ {r_days}D Base @ 20EMA"
                    item["setup_bar_desc"] = f"T: Rest | Peak: {r_days}d ago"
                else:
                    item["setup_type"] = "normal"
                    item["setup_label"] = None
                    item["setup_bar_desc"] = None
            else:
                item["setup_type"] = "normal"
                item["setup_label"] = None
                item["setup_bar_desc"] = None

        if is_high:
            items.sort(key=lambda x: (-x["count_20d"], -x["streak"], -x["count_60d"], -x["pct_1d"]))
        else:
            items.sort(key=lambda x: (-x["count_20d"], -x["streak"], -x["count_60d"], x["pct_1d"]))

    enrich_items(high_items, is_high=True)
    enrich_items(low_items, is_high=False)

    # 5. Section 8 Audit Harness Validation
    print("  Running Section 8 Audit Harness on 52W recurrence dataset...")
    # Invariant 1: Mutual exclusion
    for dt in selected_dates:
        h_set = set(daily_lists[dt]["highs"])
        l_set = set(daily_lists[dt]["lows"])
        overlap = h_set & l_set
        if overlap:
            raise ValueError(f"Section 8 Invariant 1 Violation: {len(overlap)} stocks in both 52W Highs and Lows on {dt}: {overlap}")

    # Invariant 2: Zero ETF & Rights Entitlement leakage
    for dt in selected_dates:
        for sym_formatted in daily_lists[dt]["highs"] + daily_lists[dt]["lows"]:
            raw_sym = sym_formatted.replace(".NS", "")
            if is_etf_or_re(raw_sym):
                raise ValueError(f"Section 8 Invariant 2 Violation: ETF '{raw_sym}' leaked into 52W lists on {dt}")
            if raw_sym.endswith("-RE"):
                raise ValueError(f"Section 8 Invariant 2 Violation: Rights Entitlement '{raw_sym}' leaked on {dt}")

    # Invariant 3: Corporate actions split sanity (POCL, ANGELONE)
    for dt in selected_dates:
        l_set = set(s.replace(".NS", "") for s in daily_lists[dt]["lows"])
        if dt >= "2026-07-21" and "POCL" in l_set:
            raise ValueError(f"Section 8 Invariant 3 Violation: POCL falsely appeared in low52w post-split on {dt}")
        if dt >= "2026-02-26" and "ANGELONE" in l_set:
            raise ValueError(f"Section 8 Invariant 3 Violation: ANGELONE falsely appeared in low52w post-split on {dt}")

    # Invariant 4: POLICYBZR crash trap
    if "2026-09-24" in daily_lists:
        h24 = set(s.replace(".NS", "") for s in daily_lists["2026-09-24"]["highs"])
        l24 = set(s.replace(".NS", "") for s in daily_lists["2026-09-24"]["lows"])
        if "POLICYBZR" in h24:
            raise ValueError("Section 8 Invariant 4 Violation: POLICYBZR in high52w on crash date 2026-09-24")
        if "POLICYBZR" not in l24:
            raise ValueError("Section 8 Invariant 4 Violation: POLICYBZR missing from low52w on crash date 2026-09-24")

    # Invariant 5: Seasoning (< 252 sessions; LUMINO, SKYWAYS)
    for dt in selected_dates:
        all_today = set(s.replace(".NS", "") for s in daily_lists[dt]["highs"] + daily_lists[dt]["lows"])
        for unseasoned in ["LUMINO", "SKYWAYS"]:
            if unseasoned in all_today:
                raise ValueError(f"Section 8 Invariant 5 Violation: Unseasoned stock '{unseasoned}' appeared on {dt}")

    # Invariant 6: Frequency monotonicity & streak bounds
    for item in high_items + low_items:
        if not (item["count_5d"] <= item["count_10d"] <= item["count_20d"] <= item["count_60d"]):
            raise ValueError(f"Section 8 Invariant 6 Violation: Non-monotonic counts for {item['symbol']}")
        if not (0 <= item["streak"] <= 60):
            raise ValueError(f"Section 8 Invariant 6 Violation: Streak out of bounds ({item['streak']}) for {item['symbol']}")

    # Invariant 7: Microstructure & Confluence Indicators Null-Tolerant Validation
    valid_cpr_pos = {"above", "inside", "below"}
    valid_patterns = {"hammer", "thrust", "rejection", "normal"}
    valid_prev_color = {"red", "green", "flat"}
    for item in high_items + low_items:
        if item.get("cpr_width_pct") is not None and (not isinstance(item["cpr_width_pct"], (int, float)) or item["cpr_width_pct"] < 0):
            raise ValueError(f"Section 8 Invariant 7 Violation: Invalid cpr_width_pct ({item.get('cpr_width_pct')}) on {item['symbol']}")
        if item.get("cpr_pos") is not None and item["cpr_pos"] not in valid_cpr_pos:
            raise ValueError(f"Section 8 Invariant 7 Violation: Invalid cpr_pos ({item.get('cpr_pos')}) on {item['symbol']}")
        if item.get("vol_surge") is not None and (not isinstance(item["vol_surge"], (int, float)) or item["vol_surge"] < 0):
            raise ValueError(f"Section 8 Invariant 7 Violation: Invalid vol_surge ({item.get('vol_surge')}) on {item['symbol']}")
        if item.get("deliv_pct") is not None and (not isinstance(item["deliv_pct"], (int, float)) or item["deliv_pct"] < 0 or item["deliv_pct"] > 100):
            raise ValueError(f"Section 8 Invariant 7 Violation: Invalid deliv_pct ({item.get('deliv_pct')}) on {item['symbol']}")
        if item.get("candle_pattern") is not None and item["candle_pattern"] not in valid_patterns:
            raise ValueError(f"Section 8 Invariant 7 Violation: Invalid candle_pattern ({item.get('candle_pattern')}) on {item['symbol']}")
        if item.get("prev_color") is not None and item["prev_color"] not in valid_prev_color:
            raise ValueError(f"Section 8 Invariant 7 Violation: Invalid prev_color ({item.get('prev_color')}) on {item['symbol']}")
        if item.get("sector_wave_count") is not None and (not isinstance(item["sector_wave_count"], int) or item["sector_wave_count"] < 0):
            raise ValueError(f"Section 8 Invariant 7 Violation: Invalid sector_wave_count ({item.get('sector_wave_count')}) on {item['symbol']}")
        if item.get("risk_pct") is not None and (not isinstance(item["risk_pct"], (int, float)) or item["risk_pct"] < 0):
            raise ValueError(f"Section 8 Invariant 7 Violation: Invalid risk_pct ({item.get('risk_pct')}) on {item['symbol']}")
        if item.get("recency_days") is not None and (not isinstance(item["recency_days"], int) or item["recency_days"] < 0):
            raise ValueError(f"Section 8 Invariant 7 Violation: Invalid recency_days ({item.get('recency_days')}) on {item['symbol']}")
        valid_setups = {"shakeout_breakout", "one_day_pause", "hammer_bounce", "fresh_thrust", "consolidation_base", "normal"}
        if item.get("setup_type") is not None and item["setup_type"] not in valid_setups:
            raise ValueError(f"Section 8 Invariant 7 Violation: Invalid setup_type ({item.get('setup_type')}) on {item['symbol']}")
        if item.get("setup_type") != "normal":
            if not item.get("setup_label") or not isinstance(item.get("setup_label"), str):
                raise ValueError(f"Section 8 Invariant 7 Violation: Missing setup_label for setup {item.get('setup_type')} on {item['symbol']}")
            if not item.get("setup_bar_desc") or not isinstance(item.get("setup_bar_desc"), str):
                raise ValueError(f"Section 8 Invariant 7 Violation: Missing setup_bar_desc for setup {item.get('setup_type')} on {item['symbol']}")
        else:
            if item.get("setup_label") is not None or item.get("setup_bar_desc") is not None:
                raise ValueError(f"Section 8 Invariant 7 Violation: Normal setup should not have label/desc on {item['symbol']}")

    print("  ✅ Section 8 Audit Harness: 100% PASSED")

    final_payload = {
        "metadata": {
            "latest_session": latest_date,
            "window_sessions": len(selected_dates),
            "start_date": selected_dates[0],
            "end_date": latest_date,
            "sector_waves": sector_waves_meta,
            "sector_waves_low": sector_waves_low_meta,
        },
        "dates": selected_dates,
        "highs": high_items,
        "lows": low_items,
        "daily_lists": daily_lists,
    }

    with open(out_file, "w") as f:
        json.dump(final_payload, f, separators=(',', ':'))

    print(f"  OK   market_52w_history.json ({len(high_items)} highs, {len(low_items)} lows across {len(selected_dates)} sessions)")


def ensure_public_symlinks(output_dir: Path):
    """Ensure public/data has symlinks to data subdirectories (breadth, stock_rrg, constituent_performance, market_status)."""
    public_data = output_dir.parent / "public" / "data"
    if not public_data.exists():
        public_data.mkdir(parents=True, exist_ok=True)

    for sub in ["breadth", "stock_rrg", "constituent_performance", "market_status"]:
        link_in_public = public_data / sub
        target = f"../../data/{sub}"
        needs_link = False

        if link_in_public.is_symlink():
            try:
                curr_target = os.readlink(link_in_public)
                if curr_target != target or not link_in_public.exists():
                    link_in_public.unlink()
                    needs_link = True
            except OSError:
                link_in_public.unlink()
                needs_link = True
        elif not link_in_public.exists():
            needs_link = True

        if needs_link:
            try:
                link_in_public.symlink_to(target)
                print(f"  OK   Symlink created: public/data/{sub} -> {target}")
            except Exception as e:
                print(f"  WARN Could not create symlink public/data/{sub}: {e}")
        else:
            print(f"  OK   Symlink valid: public/data/{sub} -> {target}")


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

    print("\nExporting 52W High/Low recurrence history...")
    export_52w_high_low_history(output_dir, source_dir)

    print("\nExporting constituent performance...")
    export_constituent_performance(output_dir, source_dir)

    print("\nExporting RRG Data...")
    export_rrg_data(output_dir, source_dir)

    print("\nExporting Stock-Level RRG Data...")
    try:
        import subprocess
        script_path = Path(__file__).parent / "export_stock_rrg.py"
        subprocess.run([sys.executable, str(script_path), "--output", str(output_dir), "--source", str(source_dir)], check=True)
    except Exception as e:
        print(f"  ERR Stock RRG export: {e}")

    print("\nGenerating manifest...")
    generate_manifest(output_dir)

    print("\nGenerating stock search index...")
    export_stock_search_index(output_dir)

    print("\nEnsuring public/data symlinks...")
    ensure_public_symlinks(output_dir)

    print(f"\n✓ Export complete → {output_dir.resolve()}")


if __name__ == "__main__":
    main()
