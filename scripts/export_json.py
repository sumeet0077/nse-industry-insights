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


def ensure_public_symlinks(output_dir: Path):
    """Ensure public/data has symlinks to data subdirectories (breadth, stock_rrg, constituent_performance)."""
    public_data = output_dir.parent / "public" / "data"
    if not public_data.exists():
        public_data.mkdir(parents=True, exist_ok=True)

    for sub in ["breadth", "stock_rrg", "constituent_performance"]:
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
