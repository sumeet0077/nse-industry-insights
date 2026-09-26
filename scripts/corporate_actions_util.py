import os
import json
from datetime import datetime, timedelta
import polars as pl
import duckdb

DEFAULT_CA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "corporate_actions.json")

def load_corporate_actions(file_path=None):
    path = file_path or DEFAULT_CA_PATH
    if not os.path.exists(path):
        return []
    with open(path, "r") as f:
        return json.load(f)

def build_corporate_action_intervals(actions):
    """
    Computes cumulative backward split adjustment intervals.
    For each symbol, orders actions chronologically: D_1 < D_2 < ... < D_k
    AdjFactor(t) = prod_{D_i > t} (1 / Ratio_i)
    Collapses multiple actions sharing the same ex_date by compounding their ratios.
    Returns list of dicts: [{'symbol': sym, 'start_date': '1900-01-01', 'end_date': 'YYYY-MM-DD', 'adj_factor': float}]
    """
    by_sym = {}
    for a in actions:
        sym = a['symbol'].strip().upper()
        by_sym.setdefault(sym, []).append(a)
    
    intervals = []
    for sym, sym_actions in by_sym.items():
        by_date = {}
        for a in sym_actions:
            d = a['ex_date'].strip()
            r = float(a['ratio'])
            by_date[d] = by_date.get(d, 1.0) * r

        unique_dates = sorted(by_date.keys())
        k = len(unique_dates)
        for j in range(k):
            end_d = unique_dates[j]
            end_dt = datetime.strptime(end_d, '%Y-%m-%d').date() - timedelta(days=1)
            end_d_str = end_dt.strftime('%Y-%m-%d')
            start_d_str = '1900-01-01' if j == 0 else unique_dates[j-1]
            
            factor = 1.0
            for i in range(j, k):
                factor *= (1.0 / by_date[unique_dates[i]])
                
            intervals.append({
                'symbol': sym,
                'start_date': start_d_str,
                'end_date': end_d_str,
                'adj_factor': factor
            })
    return intervals

def register_corporate_actions_duckdb(con, file_path=None, table_name="corporate_action_intervals"):
    """
    Registers corporate_action_intervals table in DuckDB connection.
    Columns: symbol VARCHAR, start_date DATE, end_date DATE, adj_factor DOUBLE
    """
    actions = load_corporate_actions(file_path)
    intervals = build_corporate_action_intervals(actions)
    if intervals:
        df_intervals = pl.DataFrame(intervals).with_columns([
            pl.col('start_date').str.to_date(),
            pl.col('end_date').str.to_date(),
            pl.col('adj_factor').cast(pl.Float64)
        ])
        con.register("temp_ca_df", df_intervals)
        con.execute(f"CREATE OR REPLACE TEMP TABLE {table_name} AS SELECT symbol, start_date, end_date, adj_factor FROM temp_ca_df")
    else:
        con.execute(f"CREATE OR REPLACE TEMP TABLE {table_name} (symbol VARCHAR, start_date DATE, end_date DATE, adj_factor DOUBLE)")

def apply_corporate_actions_polars(df, file_path=None):
    """
    Applies cumulative backward split adjustment to Polars DataFrame.
    Expects columns: Symbol, Date, High, Low, Close (and optionally Open).
    Adds 'AdjFactor', 'AdjOpen', 'AdjHigh', 'AdjLow', 'AdjClose'.
    """
    actions = load_corporate_actions(file_path)
    intervals = build_corporate_action_intervals(actions)
    if not intervals:
        cols_to_add = [pl.lit(1.0).alias("AdjFactor")]
        for c in ["Open", "High", "Low", "Close"]:
            if c in df.columns:
                cols_to_add.append(pl.col(c).alias(f"Adj{c}"))
        return df.with_columns(cols_to_add)
    
    # Ensure Date column is cast to Date type for safe comparisons
    if "Date" in df.columns and df["Date"].dtype != pl.Date:
        df = df.with_columns(pl.col("Date").cast(pl.Date))

    expr = pl.lit(1.0)
    for iv in reversed(intervals):
        sym = iv['symbol']
        start_d = datetime.strptime(iv['start_date'], '%Y-%m-%d').date()
        end_d = datetime.strptime(iv['end_date'], '%Y-%m-%d').date()
        factor = float(iv['adj_factor'])
        cond = (pl.col("Symbol") == sym) & (pl.col("Date") >= start_d) & (pl.col("Date") <= end_d)
        expr = pl.when(cond).then(pl.lit(factor)).otherwise(expr)
        
    df = df.with_columns(expr.alias("AdjFactor"))
    cols_to_add = []
    for c in ["Open", "High", "Low", "Close"]:
        if c in df.columns:
            cols_to_add.append((pl.col(c) * pl.col("AdjFactor")).alias(f"Adj{c}"))
    return df.with_columns(cols_to_add)
