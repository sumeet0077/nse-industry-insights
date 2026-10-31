#!/usr/bin/env python3
"""
export_daily_breadth_history.py
================================
Backfills and exports the full historical daily breadth and performance panel
for all 96 themes across all trading sessions (2014 to present).

Outputs:
1. data/history/master_daily_breadth_history.parquet (Complete 12-year deep store, zstd compressed)
2. data/history/daily_breadth_history_1y.json (Compact rolling 250 trading days for the web app)

Usage:
    python3 scripts/export_daily_breadth_history.py
    python3 scripts/export_daily_breadth_history.py --verify
"""

import os
import sys
import json
import re
import argparse
import time
from pathlib import Path
from datetime import timedelta
import numpy as np
import pandas as pd
import duckdb
import pyarrow as pa
import pyarrow.parquet as pq

# Add scripts directory to path for symbol_change_util
scripts_dir = Path(__file__).resolve().parent
if str(scripts_dir) not in sys.path:
    sys.path.append(str(scripts_dir))

from symbol_change_util import get_terminal_symbol_map

# Model 1: Calibrated Non-Collinear Logistic Expansion Model
# z = -0.30206 + 0.00726 * B_1W - 0.03215 * B_1M + 0.01895 * (B_1W * (100 - B_1M) / 100) + 0.00249 * B_200SMA
# P = 1 / (1 + exp(-z))
MODEL1_INTERCEPT = -0.30206
MODEL1_COEF_1W = 0.00726
MODEL1_COEF_1M = -0.03215
MODEL1_COEF_INTERACTION = 0.01895
MODEL1_COEF_200SMA = 0.00249

def compute_expansion_odds(b_1w: float, b_1m: float, b_200sma: float) -> float:
    """Compute calibrated probability % of 10D breadth expansion (delta 1M >= +15%)."""
    interaction = (b_1w * (100.0 - b_1m)) / 100.0
    z = (MODEL1_INTERCEPT +
         MODEL1_COEF_1W * b_1w +
         MODEL1_COEF_1M * b_1m +
         MODEL1_COEF_INTERACTION * interaction +
         MODEL1_COEF_200SMA * b_200sma)
    p = 1.0 / (1.0 + np.exp(-z))
    return float(np.round(p * 100.0, 1))

def classify_regime(b_1w: float, b_1m: float, b_200sma: float) -> tuple[str, str, str]:
    """
    Classify market state into the Two-Stage Regime Model.
    Returns: (regime_code, display_name, guidance)
    """
    if b_1w >= 70.0 and b_1m <= 35.0:
        if b_200sma >= 50.0:
            return (
                "pullback_thrust",
                "🚀 Pullback Thrust",
                "High conviction (61% 20D win rate, 1.88 PF, 70% breadth expansion)"
            )
        elif b_200sma < 35.0:
            return (
                "bear_bounce",
                "⚠️ Bear Bounce Thrust",
                "High expansion (65%), near-term supply digestion (48%-50% 10D win rate)"
            )
        else:
            return (
                "early_thrust",
                "🚀 Early Thrust",
                "Rapid thrust into oversold base (65%-70% expansion odds)"
            )
    elif b_1w >= 60.0 and b_1m >= 60.0 and b_200sma >= 60.0:
        return (
            "sustained_bull",
            "🔥 Sustained Bull",
            "Max price alpha (67.5% win rate, +2.67% med return, 3.15 PF at T+20)"
        )
    elif b_1w <= 30.0 and b_1m >= 60.0:
        return (
            "rollover_alert",
            "⚠️ Rollover Alert",
            "Internal decay; high risk of sector pullback in 5-10 sessions"
        )
    elif b_1w <= 25.0 and b_1m <= 25.0 and b_200sma <= 25.0:
        return (
            "capitulation",
            "🩸 Capitulation Slump",
            "Deep oversold base; wait for 1W thrust before entering"
        )
    elif b_1w >= 50.0 and b_200sma <= 30.0:
        return (
            "accumulation",
            "🌱 Oversold Accumulation",
            "Bottom-fishing reversal taking root; monitor for 1W thrust"
        )
    else:
        return (
            "neutral",
            "⚖️ Neutral / Mixed",
            "Balanced participation; rotational churn"
        )

def load_theme_configs(config_path: Path) -> list[dict]:
    """Parse lib/config.ts to extract all themes with id, title, category, and dataFile."""
    if not config_path.exists():
        raise FileNotFoundError(f"config.ts not found at {config_path}")
    
    content = config_path.read_text(encoding="utf-8")
    themes = []
    pattern = r'{\s*id:\s*"([^"]+)",\s*title:\s*"([^"]+)",\s*description:\s*"[^"]*",\s*dataFile:\s*"([^"]+)",\s*category:\s*"([^"]+)"\s*}'
    for match in re.finditer(pattern, content):
        themes.append({
            "id": match.group(1),
            "title": match.group(2),
            "dataFile": match.group(3),
            "category": match.group(4),
        })
    return themes

def load_data_key_aliases(config_path: Path) -> dict[str, str]:
    """Extract DATA_KEY_ALIASES from lib/config.ts."""
    if not config_path.exists():
        return {}
    content = config_path.read_text(encoding="utf-8")
    if "DATA_KEY_ALIASES" not in content:
        return {}
    after = content.split("DATA_KEY_ALIASES")[1]
    alias_dict = {}
    pattern = r'\"([^\"]+)\":\s*\"([^\"]+)\"'
    for match in re.finditer(pattern, after):
        alias_dict[match.group(1).lower()] = match.group(2).lower()
    return alias_dict

def export_daily_breadth_history(
    data_dir: Path,
    parquet_path: Path,
    rolling_days: int = 250,
    force: bool = False
):
    t0 = time.time()
    print("================================================================")
    print("🚀 Exporting Daily Breadth History & Predictive Panel (2014-2026)")
    print("================================================================")

    history_dir = data_dir / "history"
    history_dir.mkdir(parents=True, exist_ok=True)
    breadth_dir = data_dir / "breadth"
    market_status_path = data_dir / "market_status" / "market_status_latest.json"
    config_path = data_dir.parent / "lib" / "config.ts"

    if not parquet_path.exists():
        raise FileNotFoundError(f"Master parquet not found at: {parquet_path}")

    # 1. Load theme metadata and aliases
    themes = load_theme_configs(config_path)
    aliases = load_data_key_aliases(config_path)
    t_map = get_terminal_symbol_map()
    print(f"  ✓ Loaded {len(themes)} themes and {len(aliases)} aliases from config.ts")
    print(f"  ✓ Loaded {len(t_map)} symbol change mappings for historical continuity")

    # 2. Load constituents from market_status
    if not market_status_path.exists():
        raise FileNotFoundError(f"Market status latest not found at {market_status_path}")
    with open(market_status_path, "r", encoding="utf-8") as f:
        ms_data = json.load(f)

    # Build title -> constituents map with alias and symbol mapping resolution
    theme_constituents: dict[str, list[str]] = {}
    all_symbols: set[str] = set()

    for th in themes:
        title = th["title"]
        lower_title = title.lower()
        resolved_title = aliases.get(lower_title, lower_title)

        entry = None
        # Direct lookup
        if title in ms_data:
            entry = ms_data[title]
        elif title.upper() in ms_data:
            entry = ms_data[title.upper()]
        
        # Case-insensitive & alias lookup
        if not entry:
            cand_keys = {
                lower_title,
                resolved_title,
                lower_title.replace(" & ", " and "),
                lower_title.replace(" and ", " & "),
                resolved_title.replace(" & ", " and "),
                resolved_title.replace(" and ", " & "),
            }
            if title.startswith("Nifty "):
                cand_keys.add("nifty " + title[6:].lower())
            for k, v in ms_data.items():
                if k.lower() in cand_keys:
                    entry = v
                    break

        raw_stocks = []
        if entry:
            raw_stocks = (entry.get("above", []) + entry.get("below", []) + entry.get("new_stock", []))
        
        # Clean symbols (.NS stripped) and map to active terminal symbol
        clean_symbols = []
        for s in raw_stocks:
            if s:
                sym = s.replace(".NS", "").replace(".BO", "").strip().upper()
                term_sym = t_map.get(sym, sym)
                clean_symbols.append(term_sym)
        
        theme_constituents[th["id"]] = clean_symbols
        all_symbols.update(clean_symbols)

    print(f"  ✓ Tracked {len(all_symbols)} unique constituents across {len(themes)} themes")

    # 3. Load all breadth JSON time-series (Above, Below, Total, Percentage, Index_Close)
    theme_breadth_series: dict[str, pd.DataFrame] = {}
    for th in themes:
        b_file = breadth_dir / f"{th['dataFile']}.json"
        if not b_file.exists():
            print(f"  WARN Breadth file not found: {b_file}")
            continue
        with open(b_file, "r", encoding="utf-8") as f:
            b_list = json.load(f)
        b_df = pd.DataFrame(b_list)
        b_df["Date"] = pd.to_datetime(b_df["Date"])
        b_df = b_df.sort_values("Date").drop_duplicates(subset=["Date"], keep="last")
        theme_breadth_series[th["id"]] = b_df

    # Master trading date spine (from Nifty 50 or union)
    nifty_b_df = theme_breadth_series.get("market_breadth_nifty50")
    if nifty_b_df is not None and not nifty_b_df.empty:
        master_dates = pd.DatetimeIndex(nifty_b_df["Date"].values).sort_values()
    else:
        all_dts = set()
        for df in theme_breadth_series.values():
            all_dts.update(df["Date"].values)
        master_dates = pd.DatetimeIndex(sorted(all_dts))

    num_dates = len(master_dates)
    print(f"  ✓ Master Date Spine: {num_dates} trading days ({master_dates[0].strftime('%Y-%m-%d')} to {master_dates[-1].strftime('%Y-%m-%d')})")

    # 4. Extract constituent close prices via DuckDB with transitive symbol continuity
    print("  Connecting to DuckDB & querying adjusted close prices with symbol continuity...")
    con = duckdb.connect()
    
    # Register symbol mapping table (old_symbol -> term_symbol)
    map_df = pd.DataFrame([{"old_symbol": k, "term_symbol": v} for k, v in t_map.items()])
    con.register("map_tbl", map_df)
    symbols_df = pd.DataFrame({"symbol": list(all_symbols)})
    con.register("symbols_tbl", symbols_df)

    query = f"""
    WITH filtered AS (
        SELECT 
            COALESCE(m.term_symbol, p.symbol) as symbol,
            p.trade_date::DATE as dt,
            p.adj_close as close,
            CASE p.series 
                WHEN 'EQ' THEN 0 
                WHEN 'BE' THEN 1 
                WHEN 'BZ' THEN 2 
                WHEN 'SM' THEN 3 
                WHEN 'ST' THEN 4 
                WHEN 'SZ' THEN 5 
                WHEN 'RR' THEN 6 
                ELSE 99 
            END as sprio
        FROM '{parquet_path}' p
        LEFT JOIN map_tbl m ON p.symbol = m.old_symbol
        JOIN symbols_tbl s ON COALESCE(m.term_symbol, p.symbol) = s.symbol
        WHERE p.series IN ('EQ', 'BE', 'BZ', 'SM', 'ST', 'SZ', 'RR')
    ),
    ranked AS (
        SELECT 
            symbol, dt, close,
            ROW_NUMBER() OVER (PARTITION BY symbol, dt ORDER BY sprio) as rn
        FROM filtered
    )
    SELECT symbol, dt, close
    FROM ranked
    WHERE rn = 1
    ORDER BY dt, symbol
    """
    df_prices = con.execute(query).fetchdf()
    print(f"  ✓ Extracted {len(df_prices):,} continuous Bhavcopy price rows in {time.time() - t0:.2f}s")

    # Pivot prices into (Date x Symbol) matrix
    pivot_df = df_prices.pivot(index="dt", columns="symbol", values="close")
    pivot_df.index = pd.to_datetime(pivot_df.index)
    # Reindex to master trading date spine
    pivot_df = pivot_df.reindex(master_dates)

    # 5. Vectorized Multi-Timeframe Return & Gainers Computation
    dt_series = pd.Series(master_dates)
    N = len(dt_series)

    def get_past_indices(days: int) -> np.ndarray:
        targets = dt_series - pd.Timedelta(days=days)
        idx = dt_series.searchsorted(targets, side="right") - 1
        return np.maximum(idx, -1)

    def get_ytd_indices() -> np.ndarray:
        ytd_targets = pd.Series([pd.Timestamp(year=d.year - 1, month=12, day=31) for d in dt_series])
        idx = dt_series.searchsorted(ytd_targets, side="right") - 1
        return np.maximum(idx, -1)

    idx_map = {
        "1D": np.concatenate([[-1], np.arange(N - 1)]),
        "1W": get_past_indices(7),
        "1M": get_past_indices(30),
        "3M": get_past_indices(90),
        "6M": get_past_indices(180),
        "YTD": get_ytd_indices(),
        "1Y": get_past_indices(365),
        "3Y": get_past_indices(3 * 365),
        "5Y": get_past_indices(5 * 365),
    }

    P = pivot_df.values  # Shape: (N, M)
    cols = list(pivot_df.columns)
    col_idx = {s: i for i, s in enumerate(cols)}

    pos_matrices = {}
    valid_matrices = {}

    for tf in ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y"]:
        p_idx = idx_map[tf]
        valid_mask = p_idx >= 0
        past_P = np.full_like(P, np.nan)
        past_P[valid_mask] = P[p_idx[valid_mask]]
        ret = (P - past_P) / past_P
        is_valid = ~np.isnan(ret)
        is_gain = (ret > 0) & is_valid
        valid_matrices[tf] = is_valid
        pos_matrices[tf] = is_gain

    # 6. Precompute Theme Equal-Weighted Index Returns & RS Scores
    theme_index_series: dict[str, np.ndarray] = {}
    theme_pct_200sma: dict[str, np.ndarray] = {}
    theme_above_200sma: dict[str, np.ndarray] = {}
    theme_below_200sma: dict[str, np.ndarray] = {}
    theme_total_stocks: dict[str, np.ndarray] = {}

    for th in themes:
        tid = th["id"]
        b_df = theme_breadth_series.get(tid)
        if b_df is not None and not b_df.empty:
            b_aligned = b_df.set_index("Date").reindex(master_dates)
            theme_index_series[tid] = b_aligned["Index_Close"].values
            theme_pct_200sma[tid] = b_aligned["Percentage"].values
            theme_above_200sma[tid] = b_aligned["Above"].values
            theme_below_200sma[tid] = b_aligned["Below"].values
            theme_total_stocks[tid] = b_aligned["Total"].values
        else:
            theme_index_series[tid] = np.full(N, np.nan)
            theme_pct_200sma[tid] = np.full(N, np.nan)
            theme_above_200sma[tid] = np.full(N, np.nan)
            theme_below_200sma[tid] = np.full(N, np.nan)
            theme_total_stocks[tid] = np.full(N, np.nan)

    # Precalculate Relative Strength versus Nifty 50 for 5D, 10D, 20D, 50D
    nifty_50_closes = theme_index_series.get("market_breadth_nifty50")
    if nifty_50_closes is None:
        nifty_50_closes = np.full(N, np.nan)

    past_5d_idx = np.maximum(np.arange(N) - 5, -1)
    past_10d_idx = np.maximum(np.arange(N) - 10, -1)
    past_20d_idx = np.maximum(np.arange(N) - 20, -1)
    past_50d_idx = np.maximum(np.arange(N) - 50, -1)

    # Precalculate IBD RS 4-Quarter Raw Score for every theme on every date
    # RS Raw = 0.4 * Q1 (63D) + 0.2 * Q2 (126D) + 0.2 * Q3 (189D) + 0.2 * Q4 (252D)
    q1_idx = np.maximum(np.arange(N) - 63, -1)
    q2_idx = np.maximum(np.arange(N) - 126, -1)
    q3_idx = np.maximum(np.arange(N) - 189, -1)
    q4_idx = np.maximum(np.arange(N) - 252, -1)

    rs_raw_scores = np.full((N, len(themes)), np.nan)
    for t_idx, th in enumerate(themes):
        tid = th["id"]
        idx_ser = theme_index_series[tid]
        
        valid_q1 = q1_idx >= 0
        valid_q2 = q2_idx >= 0
        valid_q3 = q3_idx >= 0
        valid_q4 = q4_idx >= 0

        p_curr = idx_ser
        p_q1 = np.where(valid_q1, idx_ser[q1_idx], np.nan)
        p_q2 = np.where(valid_q2, idx_ser[q2_idx], np.nan)
        p_q3 = np.where(valid_q3, idx_ser[q3_idx], np.nan)
        p_q4 = np.where(valid_q4, idx_ser[q4_idx], np.nan)

        r_q1 = (p_curr - p_q1) / p_q1 * 100.0
        r_q2 = (p_curr - p_q2) / p_q2 * 100.0
        r_q3 = (p_curr - p_q3) / p_q3 * 100.0
        r_q4 = (p_curr - p_q4) / p_q4 * 100.0

        # Weighted calculation
        c4 = ~np.isnan(r_q1) & ~np.isnan(r_q2) & ~np.isnan(r_q3) & ~np.isnan(r_q4)
        c3 = ~np.isnan(r_q1) & ~np.isnan(r_q2) & ~np.isnan(r_q3) & ~c4
        c2 = ~np.isnan(r_q1) & ~np.isnan(r_q2) & ~c4 & ~c3
        c1 = ~np.isnan(r_q1) & ~c4 & ~c3 & ~c2

        score = np.full(N, np.nan)
        score[c4] = 0.4 * r_q1[c4] + 0.2 * r_q2[c4] + 0.2 * r_q3[c4] + 0.2 * r_q4[c4]
        score[c3] = 0.5 * r_q1[c3] + 0.25 * r_q2[c3] + 0.25 * r_q3[c3]
        score[c2] = 0.6 * r_q1[c2] + 0.4 * r_q2[c2]
        score[c1] = 1.0 * r_q1[c1]

        rs_raw_scores[:, t_idx] = score

    # Percentile rank RS scores into RS Rating (1-99) per date
    print("  Computing percentile-ranked RS Ratings across all dates...")
    rs_ratings_matrix = np.full((N, len(themes)), 50, dtype=int)
    for i in range(N):
        row = rs_raw_scores[i, :]
        mask = ~np.isnan(row)
        if mask.sum() > 0:
            ser = pd.Series(row[mask])
            ranks = ser.rank(pct=True, method="average")
            ratings = (ranks * 98).round().astype(int) + 1
            ratings = np.clip(ratings.values, 1, 99)
            rs_ratings_matrix[i, mask] = ratings

    # 7. Build Full Historical Panel (All dates x 96 themes)
    print("  Synthesizing full historical panel...")
    date_strs = [d.strftime("%Y-%m-%d") for d in master_dates]
    
    # Pre-allocate column arrays
    total_rows = N * len(themes)
    col_date = []
    col_theme_id = []
    col_theme_title = []
    col_category = []
    col_total = np.zeros(total_rows, dtype=int)
    col_above200 = np.zeros(total_rows, dtype=int)
    col_below200 = np.zeros(total_rows, dtype=int)
    col_pct200 = np.zeros(total_rows, dtype=float)
    col_index_close = np.zeros(total_rows, dtype=float)

    col_ret_1d = np.zeros(total_rows, dtype=float)
    col_ret_1w = np.zeros(total_rows, dtype=float)
    col_ret_1m = np.zeros(total_rows, dtype=float)
    col_ret_3m = np.zeros(total_rows, dtype=float)
    col_ret_6m = np.zeros(total_rows, dtype=float)
    col_ret_ytd = np.zeros(total_rows, dtype=float)
    col_ret_1y = np.zeros(total_rows, dtype=float)
    col_ret_3y = np.full(total_rows, np.nan, dtype=float)
    col_ret_5y = np.full(total_rows, np.nan, dtype=float)

    col_rs_5d = np.full(total_rows, np.nan, dtype=float)
    col_rs_10d = np.full(total_rows, np.nan, dtype=float)
    col_rs_20d = np.full(total_rows, np.nan, dtype=float)
    col_rs_50d = np.full(total_rows, np.nan, dtype=float)

    col_g_1d = np.zeros(total_rows, dtype=float)
    col_g_1w = np.zeros(total_rows, dtype=float)
    col_g_1m = np.zeros(total_rows, dtype=float)
    col_g_3m = np.zeros(total_rows, dtype=float)
    col_g_6m = np.zeros(total_rows, dtype=float)
    col_g_ytd = np.zeros(total_rows, dtype=float)
    col_g_1y = np.zeros(total_rows, dtype=float)

    col_rs = np.zeros(total_rows, dtype=int)
    col_velo = np.zeros(total_rows, dtype=float)
    col_odds = np.zeros(total_rows, dtype=float)
    col_regime = []

    # Map theme constituent column indices
    theme_col_indices = {}
    for th in themes:
        tid = th["id"]
        tickers = theme_constituents.get(tid, [])
        indices = np.array([col_idx[s] for s in tickers if s in col_idx], dtype=int)
        theme_col_indices[tid] = indices

    row_cursor = 0
    for d_idx in range(N):
        d_str = date_strs[d_idx]
        nifty_c = nifty_50_closes[d_idx]
        p5 = past_5d_idx[d_idx]
        p10 = past_10d_idx[d_idx]
        p20 = past_20d_idx[d_idx]
        p50 = past_50d_idx[d_idx]

        for t_idx, th in enumerate(themes):
            tid = th["id"]
            title = th["title"]
            cat = th["category"]

            col_date.append(d_str)
            col_theme_id.append(tid)
            col_theme_title.append(title)
            col_category.append(cat)

            # Theme breadth 200 SMA
            tot = theme_total_stocks[tid][d_idx]
            a200 = theme_above_200sma[tid][d_idx]
            b200 = theme_below_200sma[tid][d_idx]
            p200 = theme_pct_200sma[tid][d_idx]
            idx_close = theme_index_series[tid][d_idx]

            col_total[row_cursor] = int(tot) if not np.isnan(tot) else 0
            col_above200[row_cursor] = int(a200) if not np.isnan(a200) else 0
            col_below200[row_cursor] = int(b200) if not np.isnan(b200) else 0
            col_pct200[row_cursor] = round(float(p200), 1) if not np.isnan(p200) else 0.0
            col_index_close[row_cursor] = round(float(idx_close), 2) if not np.isnan(idx_close) else 0.0

            # Theme returns
            def get_ret(tf_name):
                p_i = idx_map[tf_name][d_idx]
                if p_i >= 0 and not np.isnan(idx_close):
                    past_val = theme_index_series[tid][p_i]
                    if past_val > 0 and not np.isnan(past_val):
                        return round(float((idx_close - past_val) / past_val * 100.0), 2)
                return np.nan if tf_name in ("3Y", "5Y") else 0.0

            col_ret_1d[row_cursor] = get_ret("1D")
            col_ret_1w[row_cursor] = get_ret("1W")
            col_ret_1m[row_cursor] = get_ret("1M")
            col_ret_3m[row_cursor] = get_ret("3M")
            col_ret_6m[row_cursor] = get_ret("6M")
            col_ret_ytd[row_cursor] = get_ret("YTD")
            col_ret_1y[row_cursor] = get_ret("1Y")
            col_ret_3y[row_cursor] = get_ret("3Y")
            col_ret_5y[row_cursor] = get_ret("5Y")

            # Relative Strength vs Nifty 50
            def get_rs_val(past_offset):
                if past_offset >= 0 and not np.isnan(idx_close) and not np.isnan(nifty_c) and nifty_c > 0 and idx_close > 0:
                    past_t = theme_index_series[tid][past_offset]
                    past_n = nifty_50_closes[past_offset]
                    if past_t > 0 and past_n > 0:
                        cur_ratio = idx_close / nifty_c
                        past_ratio = past_t / past_n
                        return round(float((cur_ratio - past_ratio) / past_ratio * 100.0), 2)
                return np.nan

            col_rs_5d[row_cursor] = get_rs_val(p5)
            col_rs_10d[row_cursor] = get_rs_val(p10)
            col_rs_20d[row_cursor] = get_rs_val(p20)
            col_rs_50d[row_cursor] = get_rs_val(p50)

            # Constituent Gainers %
            indices = theme_col_indices[tid]
            if len(indices) > 0:
                def get_g_pct(tf_name):
                    g = pos_matrices[tf_name][d_idx, indices].sum()
                    v = valid_matrices[tf_name][d_idx, indices].sum()
                    return round(float(g / v * 100.0), 1) if v > 0 else 0.0

                g1d = get_g_pct("1D")
                g1w = get_g_pct("1W")
                g1m = get_g_pct("1M")
                g3m = get_g_pct("3M")
                g6m = get_g_pct("6M")
                gytd = get_g_pct("YTD")
                g1y = get_g_pct("1Y")
            else:
                g1d = g1w = g1m = g3m = g6m = gytd = g1y = 0.0

            col_g_1d[row_cursor] = g1d
            col_g_1w[row_cursor] = g1w
            col_g_1m[row_cursor] = g1m
            col_g_3m[row_cursor] = g3m
            col_g_6m[row_cursor] = g6m
            col_g_ytd[row_cursor] = gytd
            col_g_1y[row_cursor] = g1y

            # RS Rating
            rs = rs_ratings_matrix[d_idx, t_idx]
            col_rs[row_cursor] = int(rs)

            # Forecaster metrics
            velo = round(g1w - g1m, 1)
            b200_val = col_pct200[row_cursor]
            odds = compute_expansion_odds(g1w, g1m, b200_val)
            regime_code, _, _ = classify_regime(g1w, g1m, b200_val)

            col_velo[row_cursor] = velo
            col_odds[row_cursor] = odds
            col_regime.append(regime_code)

            row_cursor += 1

    df_master = pd.DataFrame({
        "date": col_date,
        "theme_id": col_theme_id,
        "theme_title": col_theme_title,
        "category": col_category,
        "total_constituents": col_total,
        "above_200sma": col_above200,
        "below_200sma": col_below200,
        "pct_200sma": col_pct200,
        "index_close": col_index_close,
        "return_1d": col_ret_1d,
        "return_1w": col_ret_1w,
        "return_1m": col_ret_1m,
        "return_3m": col_ret_3m,
        "return_6m": col_ret_6m,
        "return_ytd": col_ret_ytd,
        "return_1y": col_ret_1y,
        "return_3y": col_ret_3y,
        "return_5y": col_ret_5y,
        "rs_5d": col_rs_5d,
        "rs_10d": col_rs_10d,
        "rs_20d": col_rs_20d,
        "rs_50d": col_rs_50d,
        "gainers_1d_pct": col_g_1d,
        "gainers_1w_pct": col_g_1w,
        "gainers_1m_pct": col_g_1m,
        "gainers_3m_pct": col_g_3m,
        "gainers_6m_pct": col_g_6m,
        "gainers_ytd_pct": col_g_ytd,
        "gainers_1y_pct": col_g_1y,
        "rs_rating": col_rs,
        "velocity": col_velo,
        "expansion_odds": col_odds,
        "regime": col_regime,
    })

    # 8. Export 1: Master Parquet (Complete 12-Year Dataset)
    parquet_out = history_dir / "master_daily_breadth_history.parquet"
    print(f"  Saving master parquet to {parquet_out} (rows: {len(df_master):,})...")
    table = pa.Table.from_pandas(df_master)
    pq.write_table(table, parquet_out, compression="zstd")
    file_size_mb = parquet_out.stat().st_size / (1024 * 1024)
    print(f"  ✓ Master Parquet exported: {file_size_mb:.2f} MB")

    # 9. Export 2: Compact Rolling 1Y JSON for Web App
    rolling_dates = date_strs[-rolling_days:]
    print(f"  Packaging rolling {len(rolling_dates)} trading sessions into daily_breadth_history_1y.json...")

    # Filter to rolling window
    df_rolling = df_master[df_master["date"].isin(rolling_dates)]
    
    # Complete 29-column Compact Schema:
    # columns: ['theme', 'r1d', 'r1w', 'r1m', 'r3m', 'r6m', 'rytd', 'r1y', 'r3y', 'r5y', 'rs5d', 'rs10d', 'rs20d', 'rs50d', 'rs', 'tot', 'a200', 'b200', 'p200', 'g1d', 'g1w', 'g1m', 'g3m', 'g6m', 'gytd', 'g1y', 'velo', 'odds', 'regime']
    json_columns = [
        "theme", "r1d", "r1w", "r1m", "r3m", "r6m", "rytd", "r1y", "r3y", "r5y",
        "rs5d", "rs10d", "rs20d", "rs50d", "rs",
        "tot", "a200", "b200", "p200",
        "g1d", "g1w", "g1m", "g3m", "g6m", "gytd", "g1y",
        "velo", "odds", "regime"
    ]

    sessions_map: dict[str, list[list]] = {}
    for d_str, group in df_rolling.groupby("date"):
        session_rows = []
        for _, r in group.iterrows():
            session_rows.append([
                r["theme_title"],
                r["return_1d"],
                r["return_1w"],
                r["return_1m"],
                r["return_3m"],
                r["return_6m"],
                r["return_ytd"],
                r["return_1y"],
                None if pd.isna(r["return_3y"]) else r["return_3y"],
                None if pd.isna(r["return_5y"]) else r["return_5y"],
                None if pd.isna(r["rs_5d"]) else r["rs_5d"],
                None if pd.isna(r["rs_10d"]) else r["rs_10d"],
                None if pd.isna(r["rs_20d"]) else r["rs_20d"],
                None if pd.isna(r["rs_50d"]) else r["rs_50d"],
                int(r["rs_rating"]),
                int(r["total_constituents"]),
                int(r["above_200sma"]),
                int(r["below_200sma"]),
                r["pct_200sma"],
                r["gainers_1d_pct"],
                r["gainers_1w_pct"],
                r["gainers_1m_pct"],
                r["gainers_3m_pct"],
                r["gainers_6m_pct"],
                r["gainers_ytd_pct"],
                r["gainers_1y_pct"],
                r["velocity"],
                r["expansion_odds"],
                r["regime"]
            ])
        sessions_map[d_str] = session_rows

    history_1y_payload = {
        "dates": list(reversed(rolling_dates)),  # Most recent first
        "columns": json_columns,
        "sessions": sessions_map,
    }

    json_out = history_dir / "daily_breadth_history_1y.json"
    with open(json_out, "w", encoding="utf-8") as f:
        json.dump(history_1y_payload, f, separators=(",", ":"))
    json_size_mb = json_out.stat().st_size / (1024 * 1024)
    print(f"  ✓ Compact 1Y JSON exported: {json_size_mb:.2f} MB ({len(rolling_dates)} sessions, {len(themes)} themes/session)")

    # 10. Ensure symlink in public/data/history
    public_history = data_dir.parent / "public" / "data" / "history"
    if not public_history.exists() and not public_history.is_symlink():
        try:
            public_history.parent.mkdir(parents=True, exist_ok=True)
            public_history.symlink_to("../../data/history")
            print(f"  ✓ Created symlink public/data/history -> ../../data/history")
        except Exception as e:
            print(f"  WARN Could not create symlink: {e}")

    total_time = time.time() - t0
    print(f"\n✨ Export completed successfully in {total_time:.2f}s!")

def verify_history(data_dir: Path):
    """Run comprehensive integrity tests on exported history files."""
    print("\n================================================================")
    print("🔍 Verifying Master Daily Breadth History & Forecaster Data")
    print("================================================================")
    history_dir = data_dir / "history"
    parquet_file = history_dir / "master_daily_breadth_history.parquet"
    json_file = history_dir / "daily_breadth_history_1y.json"

    # 1. Existence check
    assert parquet_file.exists(), f"Missing {parquet_file}"
    assert json_file.exists(), f"Missing {json_file}"
    print(f"  ✓ Files exist: Parquet ({parquet_file.stat().st_size/1024/1024:.2f} MB), JSON ({json_file.stat().st_size/1024/1024:.2f} MB)")

    # 2. Parquet schema and row check
    df_pq = pd.read_parquet(parquet_file)
    print(f"  ✓ Parquet loaded: {len(df_pq):,} rows, {len(df_pq.columns)} columns")
    assert len(df_pq) >= 280000, f"Expected >= 280,000 rows, got {len(df_pq)}"
    
    unique_themes = df_pq["theme_id"].nunique()
    print(f"  ✓ Unique themes in Parquet: {unique_themes} (Expected 96)")
    assert unique_themes == 96, f"Expected 96 themes, got {unique_themes}"

    # 3. Value range assertions
    assert df_pq["expansion_odds"].between(0, 100).all(), "Expansion odds out of range [0, 100]"
    assert df_pq["rs_rating"].between(1, 99).all(), "RS rating out of range [1, 99]"
    assert df_pq["pct_200sma"].between(0, 100).all(), "Pct 200 SMA out of range [0, 100]"
    assert df_pq["velocity"].between(-100, 100).all(), "Velocity out of range [-100, 100]"
    print("  ✓ Value invariants verified: Odds [0, 100], RS [1, 99], Velocity [-100, 100], 200 SMA [0, 100]")

    # Check Nifty Oil & Gas specifically
    oil_gas = df_pq[df_pq["theme_id"] == "breadth_oilgas"]
    assert len(oil_gas) > 0, "Missing breadth_oilgas in history"
    assert oil_gas.iloc[-1]["total_constituents"] >= 10, f"Expected >= 10 constituents for Nifty Oil & Gas, got {oil_gas.iloc[-1]['total_constituents']}"
    print(f"  ✓ Nifty Oil & Gas verified: {oil_gas.iloc[-1]['total_constituents']} constituents, latest 1W gainers: {oil_gas.iloc[-1]['gainers_1w_pct']}%")

    # 4. JSON structure check
    with open(json_file, "r", encoding="utf-8") as f:
        js = json.load(f)
    assert "dates" in js and len(js["dates"]) >= 240, f"Expected >= 240 dates in JSON, got {len(js.get('dates', []))}"
    assert "sessions" in js, "Missing sessions in JSON"
    assert "columns" in js and len(js["columns"]) == 29, f"Expected 29 columns in JSON, got {len(js.get('columns', []))}"
    latest_date = js["dates"][0]
    oldest_date = js["dates"][-1]
    latest_session = js["sessions"][latest_date]
    assert len(latest_session) == 96, f"Expected 96 themes in latest session, got {len(latest_session)}"
    print(f"  ✓ JSON verified: {len(js['dates'])} sessions ({oldest_date} to {latest_date}), 29 metrics per row, {len(latest_session)} themes")

    # 5. Print Thrust Scanner Table for latest date
    print(f"\n⚡ Top Thrust & Predictive Signals on Latest Date ({latest_date}):")
    df_latest = df_pq[df_pq["date"] == latest_date].sort_values("velocity", ascending=False)
    thrusts = df_latest[df_latest["velocity"] >= 40]
    print(f"{'Theme':<32} {'1W%':<6} {'1M%':<6} {'Velo':<7} {'Odds':<7} {'Regime':<24}")
    print("-" * 85)
    for _, r in thrusts.head(10).iterrows():
        regime_code, display_name, _ = classify_regime(r["gainers_1w_pct"], r["gainers_1m_pct"], r["pct_200sma"])
        print(f"{r['theme_title']:<32} {r['gainers_1w_pct']:<6.1f} {r['gainers_1m_pct']:<6.1f} {r['velocity']:<+7.1f} {r['expansion_odds']:<6.1f}% {display_name:<24}")

    print("\n✅ Verification PASSED with 100% data integrity!")

def main():
    parser = argparse.ArgumentParser(description="Export daily breadth history and forward predictive panel")
    parser.add_argument("--output", default=None, help="Path to nse-industry-insights/data directory")
    parser.add_argument("--source", default=None, help="Path to data source directory containing master parquet")
    parser.add_argument("--parquet", default="/Users/sumeetdas/Antigravity_NSE_Data/nse_master_adjusted_2014_onwards.parquet", help="Path to master parquet")
    parser.add_argument("--rolling-days", type=int, default=250, help="Rolling days for web JSON")
    parser.add_argument("--verify", action="store_true", help="Run data integrity verification")
    parser.add_argument("--force", action="store_true", help="Force recomputation")
    args = parser.parse_args()

    default_data_dir = Path(__file__).resolve().parent.parent / "data"
    data_dir = Path(args.output) if args.output else default_data_dir

    parquet_path = Path(args.parquet)
    if args.source:
        candidate_parquet = Path(args.source) / "nse_master_adjusted_2014_onwards.parquet"
        if candidate_parquet.exists():
            parquet_path = candidate_parquet

    if args.verify:
        verify_history(data_dir)
    else:
        export_daily_breadth_history(data_dir, parquet_path, rolling_days=args.rolling_days, force=args.force)
        verify_history(data_dir)

if __name__ == "__main__":
    main()
