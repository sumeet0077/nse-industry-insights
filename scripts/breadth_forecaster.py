#!/usr/bin/env python3
"""
breadth_forecaster.py
=====================
Quantitative research, predictive scanner, and empirical backtesting engine
for sector and industry breadth thrusts using master daily historical breadth data.

Usage:
    # 1. Scan current market for highest probability breadth thrusts
    python3 scripts/breadth_forecaster.py --scan-thrust

    # 2. Backtest custom rule (e.g. 1W >= 70% and 1M <= 35% over 10-day horizon)
    python3 scripts/breadth_forecaster.py --backtest --w1 70 --m1 35 --horizon 10

    # 3. Export full panel or scanned setups to CSV
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
RESET_COLOR = "\033[0m"

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

def scan_thrusts(df: pd.DataFrame, target_date: str | None = None, min_velocity: float = 20.0):
    """Scan latest market session (or given date) for breadth velocity & thrust signals."""
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

    session_df = session_df.sort_values("velocity", ascending=False)

    print("==========================================================================================")
    print(f"⚡ Breadth Forecaster — Predictive Market Scanner (Session: {target_date})")
    print("==========================================================================================")
    print(f"{'Theme / Index':<32} {'1W%':<6} {'1M%':<6} {'Velo':<7} {'Odds':<7} {'>200':<6} {'Regime / Setup':<24}")
    print("-" * 92)

    for _, r in session_df.iterrows():
        regime_info = REGIME_DETAILS.get(r["regime"], REGIME_DETAILS["neutral"])
        badge = regime_info["badge"]
        color = regime_info["color"]

        # Highlight if velocity >= min_velocity or active regime
        velo_str = f"{r['velocity']:+5.1f}%"
        odds_str = f"{r['expansion_odds']:5.1f}%"
        
        # Colorize high velocity
        if r["velocity"] >= 40:
            velo_display = f"\033[92m{velo_str}\033[0m"
        elif r["velocity"] <= -40:
            velo_display = f"\033[91m{velo_str}\033[0m"
        else:
            velo_display = velo_str

        regime_display = f"{color}{badge:<24}{RESET_COLOR}"
        print(f"{r['theme_title']:<32} {r['gainers_1w_pct']:<6.1f} {r['gainers_1m_pct']:<6.1f} {velo_display:<16} {odds_str:<7} {r['pct_200sma']:<6.1f} {regime_display}")

    # Summary breakdown
    print("\n📊 Regime Distribution Summary:")
    counts = session_df["regime"].value_counts()
    for reg, cnt in counts.items():
        info = REGIME_DETAILS.get(reg, REGIME_DETAILS["neutral"])
        print(f"  {info['badge']:<26}: {cnt:>2} themes ({cnt/len(session_df)*100:.1f}%)")

    return session_df

def backtest_strategy(df: pd.DataFrame, w1_thresh: float = 70.0, m1_thresh: float = 35.0, horizon: int = 10, export_csv: str | None = None):
    """
    Empirical quantitative backtesting of Breadth Thrusts and Model 1 Calibration.
    Evaluates:
    1. Forward breadth expansion rate (delta B_1M >= +15%)
    2. Forward price return distribution (T+5, T+10, T+20)
    3. Model 1 ROC-AUC, Brier score, and Lift
    4. In-Sample (2014-2022) vs Out-of-Sample (2023-2026) split
    """
    print("==========================================================================================")
    print(f"🔬 Breadth Thrust & Model 1 Empirical Backtesting Engine (Horizon: {horizon} Trading Days)")
    print(f"   Condition: 1-Week Gainers (B_1W) >= {w1_thresh}%  AND  1-Month Gainers (B_1M) <= {m1_thresh}%")
    print("==========================================================================================")

    # Compute forward metrics per theme
    df = df.copy()
    grouped = df.groupby("theme_id")
    
    # Forward 1M gainers at T+horizon
    df["future_g_1m"] = grouped["gainers_1m_pct"].shift(-horizon)
    df["delta_1m_horizon"] = df["future_g_1m"] - df["gainers_1m_pct"]
    df["expansion_target"] = (df["delta_1m_horizon"] >= 15.0).astype(int)

    # Forward index returns at T+5, T+10, T+20
    c_curr = df["index_close"]
    c_5 = grouped["index_close"].shift(-5)
    c_10 = grouped["index_close"].shift(-10)
    c_20 = grouped["index_close"].shift(-20)

    df["ret_fwd_5"] = np.where((c_curr > 0) & (c_5 > 0), (c_5 - c_curr) / c_curr * 100.0, np.nan)
    df["ret_fwd_10"] = np.where((c_curr > 0) & (c_10 > 0), (c_10 - c_curr) / c_curr * 100.0, np.nan)
    df["ret_fwd_20"] = np.where((c_curr > 0) & (c_20 > 0), (c_20 - c_curr) / c_curr * 100.0, np.nan)

    # Filter valid rows (where forward data exists)
    valid_df = df.dropna(subset=["delta_1m_horizon", "ret_fwd_10", "ret_fwd_20"]).copy()
    
    # Train / Test Split
    is_mask = valid_df["date"] <= pd.Timestamp("2022-12-31")
    oos_mask = valid_df["date"] > pd.Timestamp("2022-12-31")

    print(f"  Total Valid Observations: {len(valid_df):,}")
    print(f"  In-Sample (2014–2022)   : {is_mask.sum():,} observations")
    print(f"  Out-of-Sample (2023–2026): {oos_mask.sum():,} observations\n")

    # 1. Model 1 Calibration Metrics (ROC-AUC & Brier Score)
    def eval_model(subset_df, label):
        y_true = subset_df["expansion_target"].values
        y_prob = subset_df["expansion_odds"].values / 100.0
        
        # Brier Score: mean((prob - true)^2)
        brier = float(np.mean((y_prob - y_true) ** 2))

        # ROC-AUC (fast rank-sum formulation)
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

    # 2. Setup Evaluation: Breadth Thrust vs All Other Sessions
    thrust_mask = (valid_df["gainers_1w_pct"] >= w1_thresh) & (valid_df["gainers_1m_pct"] <= m1_thresh)
    thrust_df = valid_df[thrust_mask]
    non_thrust_df = valid_df[~thrust_mask]

    print("\n------------------------------------------------------------------------------------------")
    print(f"🎯 Thrust Setup Performance vs Unconditioned Market:")
    print(f"   Triggers Detected: {len(thrust_df):,} out of {len(valid_df):,} sessions ({len(thrust_df)/len(valid_df)*100:.2f}%)")
    print("------------------------------------------------------------------------------------------")

    def print_performance_table(label, t_df):
        exp_rate = (t_df["expansion_target"].mean()) * 100.0
        
        # Forward returns
        r5_med = t_df["ret_fwd_5"].median()
        r10_med = t_df["ret_fwd_10"].median()
        r20_med = t_df["ret_fwd_20"].median()

        w5 = (t_df["ret_fwd_5"] > 0).mean() * 100.0
        w10 = (t_df["ret_fwd_10"] > 0).mean() * 100.0
        w20 = (t_df["ret_fwd_20"] > 0).mean() * 100.0

        # Profit Factor at T+20
        pos_sum = t_df.loc[t_df["ret_fwd_20"] > 0, "ret_fwd_20"].sum()
        neg_sum = abs(t_df.loc[t_df["ret_fwd_20"] < 0, "ret_fwd_20"].sum())
        pf_20 = (pos_sum / neg_sum) if neg_sum > 0 else 0.0
        pf_str = f"{pf_20:4.2f}" if neg_sum > 0 else " N/A"

        print(f"{label:<30} | Expansion: {exp_rate:5.1f}% | 10D Win: {w10:5.1f}% (Med: {r10_med:+5.2f}%) | 20D Win: {w20:5.1f}% (Med: {r20_med:+5.2f}%, PF: {pf_str})")

    print_performance_table("🚀 All Breadth Thrusts", thrust_df)
    print_performance_table("   • Bull Pullback (>200 >= 50%)", thrust_df[thrust_df["pct_200sma"] >= 50.0])
    print_performance_table("   • Bear Bounce (<200 < 35%)", thrust_df[thrust_df["pct_200sma"] < 35.0])
    print_performance_table("⚖️ Unconditioned Baseline", non_thrust_df)

    # 3. Recent Historical Precedents
    print("\n📅 Top 5 Recent Historical Precedents of Breadth Thrust:")
    recent_thrusts = thrust_df.sort_values("date", ascending=False).drop_duplicates(subset=["theme_id"]).head(5)
    for _, r in recent_thrusts.iterrows():
        d_str = r["date"].strftime("%Y-%m-%d")
        reg_info = REGIME_DETAILS.get(r["regime"], REGIME_DETAILS["neutral"])
        print(f"  • {d_str} — {r['theme_title']:<26}: 1W: {r['gainers_1w_pct']:.1f}%, 1M: {r['gainers_1m_pct']:.1f}% -> 10D Exp: {r['delta_1m_horizon']:+5.1f}%, Ret T+20: {r['ret_fwd_20']:+5.2f}% ({reg_info['badge']})")

    if export_csv:
        csv_path = Path(export_csv)
        cols_to_export = [
            "date", "theme_id", "theme_title", "gainers_1w_pct", "gainers_1m_pct",
            "velocity", "pct_200sma", "expansion_odds", "regime",
            "future_g_1m", "delta_1m_horizon", "expansion_target",
            "ret_fwd_5", "ret_fwd_10", "ret_fwd_20"
        ]
        thrust_df[cols_to_export].to_csv(csv_path, index=False)
        print(f"\n✓ Exported {len(thrust_df):,} triggered backtest setups to {csv_path.resolve()}")

    print("\n✅ Backtest completed successfully.")

def main():
    parser = argparse.ArgumentParser(description="Breadth Forecaster CLI & Backtesting Engine")
    parser.add_argument("--scan-thrust", action="store_true", help="Scan latest market session for thrust setups")
    parser.add_argument("--backtest", action="store_true", help="Run 12-year empirical backtest on thrust setups")
    parser.add_argument("--w1", type=float, default=70.0, help="1W Gainers threshold (default: 70)")
    parser.add_argument("--m1", type=float, default=35.0, help="1M Gainers threshold (default: 35)")
    parser.add_argument("--horizon", type=int, default=10, help="Forward evaluation horizon in trading days (default: 10)")
    parser.add_argument("--date", type=str, default=None, help="Specific session date YYYY-MM-DD")
    parser.add_argument("--export-csv", type=str, default=None, help="Export output to CSV file")
    args = parser.parse_args()

    default_data_dir = Path(__file__).resolve().parent.parent / "data"
    df = load_master_data(default_data_dir)

    if args.backtest:
        backtest_strategy(df, w1_thresh=args.w1, m1_thresh=args.m1, horizon=args.horizon, export_csv=args.export_csv)
    else:
        # Default action: scan thrusts
        result_df = scan_thrusts(df, target_date=args.date)
        if args.export_csv:
            csv_path = Path(args.export_csv)
            result_df.to_csv(csv_path, index=False)
            print(f"\n✓ Exported {len(result_df)} scanned themes to {csv_path.resolve()}")

if __name__ == "__main__":
    main()
