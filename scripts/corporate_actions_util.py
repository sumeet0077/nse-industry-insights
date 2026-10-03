import os
import json
from datetime import datetime, timedelta
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
    
    try:
        from symbol_change_util import get_terminal_symbol_map
        terminal_map = get_terminal_symbol_map()
    except Exception:
        terminal_map = {}

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
            # Also add mapped terminal symbol if renamed (e.g. HEG -> HEGAM)
            mapped_sym = terminal_map.get(sym)
            if mapped_sym and mapped_sym != sym:
                intervals.append({
                    'symbol': mapped_sym,
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
        try:
            import polars as pl
            df_intervals = pl.DataFrame(intervals).with_columns([
                pl.col('start_date').str.to_date(),
                pl.col('end_date').str.to_date(),
                pl.col('adj_factor').cast(pl.Float64)
            ])
            con.register("temp_ca_df", df_intervals)
            con.execute(f"CREATE OR REPLACE TEMP TABLE {table_name} AS SELECT symbol, start_date, end_date, adj_factor FROM temp_ca_df")
        except ImportError:
            con.execute(f"CREATE OR REPLACE TEMP TABLE {table_name} (symbol VARCHAR, start_date DATE, end_date DATE, adj_factor DOUBLE)")
            con.executemany(f"INSERT INTO {table_name} VALUES (?, CAST(? AS DATE), CAST(? AS DATE), ?)",
                            [(i['symbol'], i['start_date'], i['end_date'], float(i['adj_factor'])) for i in intervals])
    else:
        con.execute(f"CREATE OR REPLACE TEMP TABLE {table_name} (symbol VARCHAR, start_date DATE, end_date DATE, adj_factor DOUBLE)")

def apply_corporate_actions_polars(df, file_path=None):
    """
    Applies cumulative backward split adjustment to Polars DataFrame.
    Expects columns: Symbol, Date, High, Low, Close (and optionally Open).
    Adds 'AdjFactor', 'AdjOpen', 'AdjHigh', 'AdjLow', 'AdjClose'.
    """
    import polars as pl
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

def apply_corporate_actions_pandas(df_pivot, file_path=None):
    """
    Applies cumulative backward corporate action adjustments to a pandas DataFrame pivot
    (Index: DatetimeIndex of trading dates, Columns: symbols, Values: prices).
    Uses exact floating-point compounding, transitive terminal symbol resolution,
    and a distance-minimization pre-adjustment guardrail to prevent double adjustment.
    """
    import pandas as pd
    if df_pivot is None or df_pivot.empty:
        return df_pivot

    actions = load_corporate_actions(file_path)
    if not actions:
        return df_pivot

    df_pivot = df_pivot.copy()

    # Ensure index is DatetimeIndex without timezone
    if not isinstance(df_pivot.index, pd.DatetimeIndex):
        df_pivot.index = pd.to_datetime(df_pivot.index)
    if hasattr(df_pivot.index, 'tz') and df_pivot.index.tz is not None:
        df_pivot.index = df_pivot.index.tz_localize(None)

    try:
        from symbol_change_util import get_terminal_symbol_map
        terminal_map = get_terminal_symbol_map()
    except Exception:
        terminal_map = {}

    # Build mapping from terminal symbol to matching columns in df_pivot
    term_to_cols = {}
    for col in df_pivot.columns:
        clean = str(col).strip().upper().replace(".NS", "").replace(".BO", "")
        term = terminal_map.get(clean, clean)
        term_to_cols.setdefault(term, []).append(col)

    # Group actions by terminal symbol
    actions_by_term = {}
    for a in actions:
        sym = a.get("symbol", "").strip().upper()
        if not sym:
            continue
        term = terminal_map.get(sym, sym)
        actions_by_term.setdefault(term, []).append(a)

    for term, sym_actions in actions_by_term.items():
        cols = term_to_cols.get(term)
        if not cols:
            continue

        # Compound multiple actions sharing the same ex_date
        by_date = {}
        for a in sym_actions:
            d = a.get("ex_date", "").strip()
            if not d:
                continue
            try:
                r = float(a.get("ratio", 1.0))
            except (ValueError, TypeError):
                continue
            if r > 0:
                by_date[d] = by_date.get(d, 1.0) * r

        sorted_dates = sorted(by_date.keys())
        for col in cols:
            for ex_date_str in sorted_dates:
                factor = by_date[ex_date_str]
                if factor == 1.0 or factor <= 0:
                    continue

                ex_dt = pd.to_datetime(ex_date_str)
                s = df_pivot[col]
                s_valid = s.dropna()
                if s_valid.empty:
                    continue

                sub_prev = s_valid.loc[s_valid.index < ex_dt]
                sub_curr = s_valid.loc[s_valid.index >= ex_dt]

                if len(sub_prev) > 0 and len(sub_curr) > 0:
                    p_prev = float(sub_prev.iloc[-1])
                    p_curr = float(sub_curr.iloc[0])
                    if p_prev > 0 and p_curr > 0:
                        observed_ratio = p_curr / p_prev
                        expected_ratio = 1.0 / factor
                        dist_adjusted = abs(observed_ratio - 1.0)
                        dist_unadjusted = abs(observed_ratio - expected_ratio)
                        # Distance-minimization guardrail:
                        # If price step is closer to 1.0 than to expected split drop (1/factor),
                        # the series is already adjusted — skip to prevent double adjustment.
                        if dist_adjusted < dist_unadjusted:
                            continue

                # Apply backward adjustment: divide prices prior to ex_date by factor
                mask = df_pivot.index < ex_dt
                df_pivot.loc[mask, col] = df_pivot.loc[mask, col] / factor

    return df_pivot

