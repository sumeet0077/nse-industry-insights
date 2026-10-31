#!/usr/bin/env python3
"""
breadth_forecaster.py
=====================
Quantitative research, predictive scanner, and empirical backtesting engine
for sector and industry breadth thrusts using master daily historical breadth data.

Usage:
    # 1. Scan current market for highest probability breadth thrusts & swing timing
    python3 scripts/breadth_forecaster.py --scan-thrust

    # 2. Filter scanned market by next-day swing timing signal
    python3 scripts/breadth_forecaster.py --scan-thrust --swing-timing prime_dip

    # 3. Backtest Next-Day trade execution across swing horizons (2, 5, 10 days)
    python3 scripts/breadth_forecaster.py --backtest --horizon 5 --next-day
    python3 scripts/breadth_forecaster.py --backtest --horizon 2 --next-day
    python3 scripts/breadth_forecaster.py --backtest --horizon 10 --next-day

    # 4. Export full panel or scanned setups to CSV
    python3 scripts/breadth_forecaster.py --export-csv breadth_predictions_latest.csv
"""

import sys
import argparse
from pathlib import Path
import numpy as np
import pandas as pd

REGIME_DETAILS = {
    "pullback_thrust": {
        "badge": "🚀 Pullback Thrust",
        "description": "Bull Trend Pullback Thrust",
        "guidance": "High conviction (61% 20D win rate, 1.88 PF, 70% breadth expansion)",
        "color": "\033[92m"  # Green
    },
    "bear_bounce": {
        "badge": "⚠️ Bear Bounce Thrust",
        "description": "Bear Market Oversold Bounce",
        "guidance": "High expansion (65%), near-term supply digestion (48%-50% 10D win rate)",
        "color": "\033[93m"  # Yellow
    },
    "early_thrust": {
        "badge": "🚀 Early Thrust",
        "description": "Early Breadth Thrust",
        "guidance": "Rapid thrust into oversold base (65%-70% expansion odds)",
        "color": "\033[96m"  # Cyan
    },
    "sustained_bull": {
        "badge": "🔥 Sustained Bull",
        "description": "Sustained Bull Trend",
        "guidance": "Max price alpha (67.5% win rate, +2.67% med return, 3.15 PF at T+20)",
        "color": "\033[92m"  # Green
    },
    "rollover_alert": {
        "badge": "⚠️ Rollover Alert",
        "description": "Breadth Rollover Alert",
        "guidance": "Internal decay; high risk of sector pullback in 5-10 sessions",
        "color": "\033[91m"  # Red
    },
    "capitulation": {
        "badge": "🩸 Capitulation Slump",
        "description": "Capitulation Slump",
        "guidance": "Deep oversold base; wait for 1W thrust before entering",
        "color": "\033[95m"  # Magenta
    },
    "accumulation": {
        "badge": "🌱 Oversold Accumulation",
        "description": "Oversold Accumulation",
        "guidance": "Bottom-fishing reversal taking root; monitor for 1W thrust",
        "color": "\033[94m"  # Blue
    },
    "neutral": {
        "badge": "⚖️ Neutral / Mixed",
        "description": "Neutral / Mixed",
        "guidance": "Balanced participation; rotational churn",
        "color": "\033[90m"  # Gray
    }
}

SWING_TIMING_DETAILS = {
    "prime_dip": {
        "badge": "🎯 Prime Dip (Next Day)",
        "description": "Pullback / Dip in Bull Trend",
        "action": "Ideal low-risk Day T+1 dip entry after 1D cooling (20%-45% gainers)",
        "color": "\033[92m"  # Green
    },
    "trend_buy": {
        "badge": "🔥 Trend Buy (Next Day)",
        "description": "Sustained Bull Participation",
        "action": "Strong macro tailwinds (B1W, B1M, B200 >= 60%); buy leading momentum stocks on T+1",
        "color": "\033[96m"  # Cyan
    },
    "extended_wait": {
        "badge": "⚠️ Extended (Wait 1-2D)",
        "description": "Short-Term Overbought",
        "action": "B1W >= 75% & B1D >= 75%; elevated pullback risk, wait 1-2 days for dip",
        "color": "\033[93m"  # Yellow
    },
    "avoid_bear_trap": {
        "badge": "🚫 Avoid (Bear Trap)",
        "description": "Bear Market Relief Rally",
        "action": "B200 < 35%; relief bounce inside structural downtrend, avoid longs",
        "color": "\033[91m"  # Red
    },
    "neutral": {
        "badge": "⚖️ Neutral",
        "description": "Rotational / Mixed",
        "action": "Selective stock picking; wait for breadth trend confirmation",
        "color": "\033[90m"  # Gray
    }
}

RESET_COLOR = "\033[0m"

def classify_swing_timing(b1w: float, b1d: float, b200: float, b1m: float = 0.0) -> str:
    """Classify EOD breadth state into Next-Day actionable swing timing badge."""
    if b200 < 35.0:
        return "avoid_bear_trap"
    if b1w >= 75.0 and b1d >= 75.0:
        return "extended_wait"
    if (b200 >= 50.0 or b1w >= 70.0) and (20.0 <= b1d <= 45.0):
        return "prime_dip"
    if b1w >= 60.0 and b1m >= 60.0 and b200 >= 60.0:
        return "trend_buy"
    return "neutral"

def load_master_data(data_dir: Path) -> pd.DataFrame:
    """Load master daily breadth history from parquet (or fallback)."""
    parquet_path = data_dir / "history" / "master_daily_breadth_history.parquet"
    if not parquet_path.exists():
        raise FileNotFoundError(
            f"Master history parquet not found at {parquet_path}. "
            f"Please run 'python3 scripts/export_daily_breadth_history.py' first."
        )
    df = pd.read_parquet(parquet_path)
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values(["theme_id", "date"]).reset_index(drop=True)

def scan_thrusts(
    df: pd.DataFrame,
    target_date: str | None = None,
    min_velocity: float = 20.0,
    swing_timing_filter: str | None = None
):
    """Scan latest market session (or given date) for breadth velocity, thrusts, & swing timing."""
    if target_date:
        d = pd.to_datetime(target_date)
        session_df = df[df["date"] == d].copy()
        if session_df.empty:
            min_d = df["date"].min()
            max_d = df["date"].max()
            if d < min_d or d > max_d:
                print(f"Date {target_date} is out of bounds (dataset spans {min_d.strftime('%Y-%m-%d')} to {max_d.strftime('%Y-%m-%d')}).")
                return session_df
            preceding = df[df["date"] <= d]
            if not preceding.empty:
                nearest_d = preceding["date"].max()
                nearest_str = nearest_d.strftime("%Y-%m-%d")
                print(f"Notice: {target_date} was a non-trading session (weekend/holiday). Replaying nearest preceding trading session ({nearest_str}).")
                session_df = df[df["date"] == nearest_d].copy()
                target_date = nearest_str
            else:
                print(f"No records found for date {target_date}")
                return session_df
    else:
        latest_d = df["date"].max()
        session_df = df[df["date"] == latest_d].copy()
        target_date = latest_d.strftime("%Y-%m-%d")

    # Add Swing Timing Signal column
    session_df["swing_timing"] = session_df.apply(
        lambda r: classify_swing_timing(r["gainers_1w_pct"], r["gainers_1d_pct"], r["pct_200sma"], r.get("gainers_1m_pct", 0.0)),
        axis=1
    )

    # Optional swing timing filter
    if swing_timing_filter and swing_timing_filter != "all":
        session_df = session_df[session_df["swing_timing"] == swing_timing_filter]

    session_df = session_df.sort_values("velocity", ascending=False)

    print("==========================================================================================================")
    print(f"⚡ Breadth Forecaster — Predictive Market & Next-Day Swing Scanner (Session: {target_date})")
    print(f"   [EOD Data: Signals computed for trade execution on Next Trading Day (T+1)]")
    if swing_timing_filter:
        print(f"   Filtered by Swing Timing: {swing_timing_filter.upper()}")
    print("==========================================================================================================")
    print(f"{'Theme / Index':<28} {'1W%':<6} {'1D%':<6} {'Velo':<7} {'Odds':<7} {'>200':<6} {'Swing Timing (T+1)':<26} {'Regime Setup':<22}")
    print("-" * 110)

    for _, r in session_df.iterrows():
        regime_info = REGIME_DETAILS.get(r["regime"], REGIME_DETAILS["neutral"])
        timing_info = SWING_TIMING_DETAILS.get(r["swing_timing"], SWING_TIMING_DETAILS["neutral"])
        
        regime_badge = regime_info["badge"]
        regime_color = regime_info["color"]

        timing_badge = timing_info["badge"]
        timing_color = timing_info["color"]

        velo_str = f"{r['velocity']:+5.1f}%"
        odds_str = f"{r['expansion_odds']:5.1f}%"
        velo_padded = f"{velo_str:>7}"
        
        # Colorize high velocity
        if r["velocity"] >= 40:
            velo_display = f"\033[92m{velo_padded}\033[0m"
        elif r["velocity"] <= -40:
            velo_display = f"\033[91m{velo_padded}\033[0m"
        else:
            velo_display = velo_padded

        timing_display = f"{timing_color}{timing_badge:<26}{RESET_COLOR}"
        regime_display = f"{regime_color}{regime_badge:<22}{RESET_COLOR}"

        print(f"{r['theme_title']:<28} {r['gainers_1w_pct']:<6.1f} {r['gainers_1d_pct']:<6.1f} {velo_display}  {odds_str:<7} {r['pct_200sma']:<6.1f} {timing_display} {regime_display}")

    # Summary breakdown
    print("\n🎯 Next-Day Swing Timing Distribution Summary:")
    t_counts = session_df["swing_timing"].value_counts()
    for code, cnt in t_counts.items():
        t_info = SWING_TIMING_DETAILS.get(code, SWING_TIMING_DETAILS["neutral"])
        print(f"  {t_info['badge']:<28}: {cnt:>2} themes ({cnt/len(session_df)*100:.1f}%)")

    print("\n📊 Two-Stage Regime Distribution Summary:")
    r_counts = session_df["regime"].value_counts()
    for reg, cnt in r_counts.items():
        info = REGIME_DETAILS.get(reg, REGIME_DETAILS["neutral"])
        print(f"  {info['badge']:<28}: {cnt:>2} themes ({cnt/len(session_df)*100:.1f}%)")

    return session_df

def backtest_strategy(
    df: pd.DataFrame,
    w1_thresh: float = 70.0,
    m1_thresh: float = 35.0,
    horizon: int = 5,
    next_day: bool = False,
    export_csv: str | None = None
):
    """
    Empirical quantitative backtesting of Breadth Setups, Model 1 Calibration,
    and Next-Day Execution Simulation (T+1 -> T+1+H).
    """
    exec_mode_str = "NEXT-DAY EXECUTION (T+1 -> T+1+H)" if next_day else "SAME-DAY CLOSE (T -> T+H)"
    print("==========================================================================================")
    print(f"🔬 Empirical Swing Backtesting Engine (Holding Horizon: {horizon} Trading Days)")
    print(f"   Execution Mode: {exec_mode_str}")
    print(f"   Evaluation Set: All Master Themes ({horizon}D Forward Price Return & MAE Drawdown)")
    print("==========================================================================================")

    # Compute forward metrics per theme
    df = df.copy()
    grouped = df.groupby("theme_id")
    
    # Forward 1M gainers at T+horizon
    df["future_g_1m"] = grouped["gainers_1m_pct"].shift(-horizon)
    df["delta_1m_horizon"] = df["future_g_1m"] - df["gainers_1m_pct"]
    df["expansion_target"] = (df["delta_1m_horizon"] >= 15.0).astype(int)

    # Classify Swing Timing
    df["swing_timing"] = df.apply(
        lambda r: classify_swing_timing(r["gainers_1w_pct"], r["gainers_1d_pct"], r["pct_200sma"], r.get("gainers_1m_pct", 0.0)),
        axis=1
    )

    # Forward price returns and MAE
    if next_day:
        # Next-Day Execution: Entry at C_T+1, exit at C_T+1+H
        c_entry = grouped["index_close"].shift(-1)
        c_exit = grouped["index_close"].shift(-(1 + horizon))
        df[f"ret_fwd_{horizon}"] = np.where((c_entry > 0) & (c_exit > 0), (c_exit - c_entry) / c_entry * 100.0, np.nan)
        
        # Drawdown (MAE) over [T+1 .. T+1+H]
        closes = [grouped["index_close"].shift(-i) for i in range(1, 1 + horizon + 1)]
        min_close = pd.concat(closes, axis=1).min(axis=1)
        df[f"mae_{horizon}"] = np.where(c_entry > 0, (min_close - c_entry) / c_entry * 100.0, np.nan)
    else:
        # Same-day close: Entry at C_T, exit at C_T+H
        c_entry = df["index_close"]
        c_exit = grouped["index_close"].shift(-horizon)
        df[f"ret_fwd_{horizon}"] = np.where((c_entry > 0) & (c_exit > 0), (c_exit - c_entry) / c_entry * 100.0, np.nan)
        
        closes = [grouped["index_close"].shift(-i) for i in range(0, horizon + 1)]
        min_close = pd.concat(closes, axis=1).min(axis=1)
        df[f"mae_{horizon}"] = np.where(c_entry > 0, (min_close - c_entry) / c_entry * 100.0, np.nan)

    # Filter valid rows
    valid_df = df.dropna(subset=["delta_1m_horizon", f"ret_fwd_{horizon}", f"mae_{horizon}"]).copy()
    
    # Train / Test Split
    is_mask = valid_df["date"] <= pd.Timestamp("2022-12-31")
    oos_mask = valid_df["date"] > pd.Timestamp("2022-12-31")

    print(f"  Total Valid Observations: {len(valid_df):,}")
    print(f"  In-Sample (2014–2022)   : {is_mask.sum():,} observations")
    print(f"  Out-of-Sample (2023–2026): {oos_mask.sum():,} observations\n")

    # 1. Model 1 Calibration Metrics
    def eval_model(subset_df, label):
        y_true = subset_df["expansion_target"].values
        y_prob = subset_df["expansion_odds"].values / 100.0
        
        brier = float(np.mean((y_prob - y_true) ** 2))
        n_pos = int(y_true.sum())
        n_neg = len(y_true) - n_pos
        if n_pos == 0 or n_neg == 0:
            auc = 0.5
        else:
            rank = pd.Series(y_prob).rank().values
            auc = float((rank[y_true == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))

        baseline_rate = float(np.mean(y_true) * 100.0)
        top_decile_rate = float(y_true[y_prob >= np.percentile(y_prob, 90)].mean() * 100.0)
        lift = top_decile_rate / baseline_rate if baseline_rate > 0 else 1.0

        print(f"  📈 Model 1 Metrics [{label}]:")
        print(f"     • ROC-AUC Score   : {auc:.4f}")
        print(f"     • Brier Score     : {brier:.4f}")
        print(f"     • Baseline Rate   : {baseline_rate:.2f}%")
        print(f"     • Top Decile Rate : {top_decile_rate:.2f}% (Lift: {lift:.2f}x)")

    eval_model(valid_df[is_mask], "In-Sample: 2014-2022")
    eval_model(valid_df[oos_mask], "Out-of-Sample: 2023-2026")

    # 2. Performance Tables Helper
    def print_performance_row(label, t_df):
        if len(t_df) == 0:
            return
        exp_rate = (t_df["expansion_target"].mean()) * 100.0
        r_col = f"ret_fwd_{horizon}"
        m_col = f"mae_{horizon}"
        
        r_med = t_df[r_col].median()
        w_pct = (t_df[r_col] > 0).mean() * 100.0
        mae_med = t_df[m_col].median()
        suggested_stop = max(round(abs(mae_med) * 2.0, 1), 2.0 if horizon <= 5 else 3.5)

        pos_sum = t_df.loc[t_df[r_col] > 0, r_col].sum()
        neg_sum = abs(t_df.loc[t_df[r_col] < 0, r_col].sum())
        pf = (pos_sum / neg_sum) if neg_sum > 0 else 0.0

        print(f"{label:<32} | Count: {len(t_df):>6,} | Win: {w_pct:5.1f}% | Med Ret: {r_med:+5.2f}% | PF: {pf:4.2f} | Med MAE: {mae_med:+5.2f}% | Stop: {suggested_stop:4.1f}%")

    print("\n---------------------------------------------------------------------------------------------------------------------")
    print(f"🎯 Empirical Results by Next-Day Swing Timing Setup ({horizon}D Horizon, {exec_mode_str}):")
    print("---------------------------------------------------------------------------------------------------------------------")
    for code, info in SWING_TIMING_DETAILS.items():
        sub = valid_df[valid_df["swing_timing"] == code]
        print_performance_row(info["badge"], sub)

    print("\n---------------------------------------------------------------------------------------------------------------------")
    print(f"📊 Empirical Results by Two-Stage Macro Regime ({horizon}D Horizon, {exec_mode_str}):")
    print("---------------------------------------------------------------------------------------------------------------------")
    for reg, info in REGIME_DETAILS.items():
        sub = valid_df[valid_df["regime"] == reg]
        print_performance_row(info["badge"], sub)

    print_performance_row("⚖️ Unconditioned Null Baseline", valid_df)

    if export_csv:
        csv_path = Path(export_csv)
        cols_to_export = [
            "date", "theme_id", "theme_title", "gainers_1w_pct", "gainers_1d_pct",
            "gainers_1m_pct", "velocity", "pct_200sma", "expansion_odds", "regime",
            "swing_timing", "future_g_1m", "delta_1m_horizon",
            f"ret_fwd_{horizon}", f"mae_{horizon}"
        ]
        valid_df[cols_to_export].to_csv(csv_path, index=False)
        print(f"\n✓ Exported {len(valid_df):,} records to {csv_path.resolve()}")

    print("\n✅ Backtest completed successfully.")

def main():
    parser = argparse.ArgumentParser(description="Breadth Forecaster CLI, Swing Scanner & Backtesting Engine")
    parser.add_argument("--scan-thrust", action="store_true", help="Scan latest market session for thrust setups & swing timing")
    parser.add_argument("--backtest", action="store_true", help="Run 12-year empirical backtest on swing trading setups")
    parser.add_argument("--horizon", type=int, choices=[2, 5, 10, 20], default=5, help="Forward evaluation horizon in trading days (default: 5)")
    parser.add_argument("--next-day", action="store_true", help="Simulate Next-Day (Day T+1) trade execution instead of same-day close")
    parser.add_argument("--swing-timing", type=str, default=None, choices=["prime_dip", "trend_buy", "extended_wait", "avoid_bear_trap", "neutral", "all"], help="Filter scanned themes by swing timing setup")
    parser.add_argument("--w1", type=float, default=70.0, help="1W Gainers threshold (default: 70)")
    parser.add_argument("--m1", type=float, default=35.0, help="1M Gainers threshold (default: 35)")
    parser.add_argument("--date", type=str, default=None, help="Specific session date YYYY-MM-DD")
    parser.add_argument("--export-csv", type=str, default=None, help="Export output to CSV file")
    args = parser.parse_args()

    default_data_dir = Path(__file__).resolve().parent.parent / "data"
    df = load_master_data(default_data_dir)

    if args.backtest:
        backtest_strategy(
            df,
            w1_thresh=args.w1,
            m1_thresh=args.m1,
            horizon=args.horizon,
            next_day=args.next_day,
            export_csv=args.export_csv
        )
    else:
        # Default action: scan thrusts
        result_df = scan_thrusts(
            df,
            target_date=args.date,
            swing_timing_filter=args.swing_timing
        )
        if args.export_csv:
            csv_path = Path(args.export_csv)
            result_df.to_csv(csv_path, index=False)
            print(f"\n✓ Exported {len(result_df)} scanned themes to {csv_path.resolve()}")

if __name__ == "__main__":
    main()
