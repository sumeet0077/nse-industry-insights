"""
🛡️ ETF Exclusion & Rights Entitlements Filter Utility.
Maintains the canonical registry of active & historical ETFs and Rights Entitlements (-RE),
enforcing strict Whitelist-Precedence for protected corporate equities.
Supports automated daily synchronization with NSE archives.
"""

import os
import json
import re
import urllib.request
import csv
import io
import polars as pl
import duckdb

DEFAULT_ETF_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "etf_symbols.json")
DEFAULT_THEMES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "industry_themes.json")
NSE_ETF_URL = "https://archives.nseindia.com/content/equities/eq_etfseclist.csv"

# Protected corporate equity registry: Operating companies strictly immune from exclusion
PROTECTED_EQUITIES = {
    # Explicit user requirements & common false-positive risks
    "SKYGOLD", "GOLDIAM", "SILVERTUC", "EUROBOND", "CHEMBOND", "PNBGILTS",
    # Operating companies with Gold / Silver / Bond / Gilt / Logistics / Jewel substrings
    "BHARATFORG", "BHARATGEAR", "BHARATRAS", "BHARATWIRE", "BHARTIARTL",
    "GOLDENTOBC", "GOLDKENTO", "GOLDTECH", "SILVEROAK", "BOMDYEING",
    "JETFREIGHT", "SHANTIGOLD", "GICRE", "NEWINDIA",
    "CHEMBONDCH", "DECNGOLD", "GOLDKART", "GOLDSTAR", "PENTAGOLD",
    "SBIFUNDS", "GROWW", "MUTHOOTMF", "JMFINANCIL", "EDELWEISS", "SSDL",
    # Scheduled commercial banks & financial institutions
    "ICICIBANK", "HDFCBANK", "AXISBANK", "KOTAKBANK", "SBIN", "CANBK",
    "BANKBARODA", "UNIONBANK", "INDIANB", "IOB", "UCOBANK", "CENTRALBK",
    "BANKINDIA", "MAHABANK", "PSB", "IDFCFIRSTB", "RBLBANK", "FEDERALBNK",
    "INDUSINDBK", "BANDHANBNK", "YESBANK", "J&KBANK", "SOUTHBANK",
    "KARURVYSYA", "CSBBANK", "CUB", "UJJIVANSFB", "EQUITASBNK", "AUBANK",
    "MOTILALOFS", "HDFCAMC", "UTIAMC", "RELIANCE", "RELINFRA", "RELCAPITAL",
    "TATAMOTORS", "TATASTEEL", "TATACONSUM", "TATAPOWER", "TATACOMM",
    "TATAELXSI", "TATATECH", "TATAINVEST", "IDBI", "LICI", "SBICARD",
    "SBILIFE", "ICICIGI", "ICICIPRULI",
    # Historic merged operating equities
    "HDFC", "IDFC", "IDFCBANK", "ICICIBANKN", "ICICIBANKP",
    "TATACOFFEE", "TATAGLOBAL", "TATAMETALI", "TATAMTRDVR", "TATASPONGE",
    "TATASTLBSL", "TATASTLLP", "ALPSINDUS", "AXIS-IT&T", "GISOLUTION",
    "INDUSFILA", "SAMINDUS"
}

_cached_whitelist = None
_cached_etf_symbols = None

def get_protected_whitelist(themes_path=None) -> set:
    """
    Returns the comprehensive set of protected corporate equity symbols.
    Combines PROTECTED_EQUITIES with all 597 clean symbols from industry_themes.json.
    """
    global _cached_whitelist
    if _cached_whitelist is not None and themes_path is None:
        return _cached_whitelist

    whitelist = set(PROTECTED_EQUITIES)
    t_path = themes_path or DEFAULT_THEMES_PATH
    if os.path.exists(t_path):
        try:
            with open(t_path, "r") as f:
                themes_data = json.load(f)
            for theme_info in themes_data.values():
                if isinstance(theme_info, dict) and "clean_symbols" in theme_info:
                    for s in theme_info["clean_symbols"]:
                        whitelist.add(s.strip().upper())
        except Exception as e:
            print(f"Warning: Could not read industry themes for whitelist: {e}")

    if themes_path is None:
        _cached_whitelist = whitelist
    return whitelist

def load_etf_symbols(file_path=None) -> set:
    """
    Loads canonical ETF symbols from data/etf_symbols.json.
    Supports both list and dictionary schemas.
    """
    global _cached_etf_symbols
    if _cached_etf_symbols is not None and file_path is None:
        return _cached_etf_symbols

    path = file_path or DEFAULT_ETF_PATH
    if not os.path.exists(path):
        return set()

    with open(path, "r") as f:
        data = json.load(f)

    if isinstance(data, list):
        syms = {str(s).strip().upper() for s in data if s}
    elif isinstance(data, dict):
        raw_list = data.get("etf_symbols", data.get("symbols", []))
        syms = {str(s).strip().upper() for s in raw_list if s}
    else:
        syms = set()

    if file_path is None:
        _cached_etf_symbols = syms
    return syms

def save_etf_symbols(symbols: set, file_path=None):
    """Saves updated ETF symbols set to data/etf_symbols.json."""
    global _cached_etf_symbols
    path = file_path or DEFAULT_ETF_PATH
    sorted_syms = sorted(list(symbols))
    payload = {
        "description": "NSE Active and Historical Exchange Traded Funds (ETFs) and Exclusion Registry",
        "count": len(sorted_syms),
        "re_pattern": "-RE.*",
        "etf_symbols": sorted_syms
    }
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w") as f:
        json.dump(payload, f, indent=2)
    _cached_etf_symbols = set(sorted_syms)

def sync_etfs_from_nse(file_path=None, url=NSE_ETF_URL, daily_file=None) -> list:
    """
    Downloads active ETF securities from NSE archives (eq_etfseclist.csv),
    detects any newly listed ETFs not present in etf_symbols.json,
    and appends them. Also inspects daily bhavcopy files if provided.
    Enforces Whitelist-Precedence.
    Returns list of newly added ETF symbols.
    """
    print(f"🔄 Syncing latest ETF listings from NSE ({url})...")
    path = file_path or DEFAULT_ETF_PATH
    existing_etfs = load_etf_symbols(path)
    whitelist = get_protected_whitelist()
    new_etfs = []

    # 1. Sync from NSE archives eq_etfseclist.csv
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            content = resp.read().decode("latin-1")

        reader = csv.DictReader(io.StringIO(content))
        for raw_row in reader:
            row = {k.strip(): v for k, v in raw_row.items() if k}
            sym = (row.get("Symbol") or row.get("SYMBOL") or "").strip().upper()
            if not sym:
                continue
            if sym in whitelist:
                continue
            if sym not in existing_etfs:
                new_etfs.append(sym)
                existing_etfs.add(sym)

    except Exception as e:
        print(f"  ⚠️ Warning: Unable to sync ETFs from NSE ({e}). Using existing canonical ETF registry.")

    # 2. Inspect incoming daily file (or raw_bhavcopies) for any newly listed ETFs
    files_to_check = []
    if daily_file and os.path.exists(daily_file):
        files_to_check.append(daily_file)
    else:
        raw_dir = os.path.join(os.path.dirname(__file__), "..", "data", "raw_bhavcopies")
        if os.path.exists(raw_dir):
            for f in sorted(os.listdir(raw_dir)):
                if f.endswith(".csv"):
                    files_to_check.append(os.path.join(raw_dir, f))

    for df_path in files_to_check:
        try:
            with open(df_path, "r", encoding="latin-1") as f:
                d_reader = csv.DictReader(f)
                for raw_row in d_reader:
                    row = {k.strip(): v for k, v in raw_row.items() if k}
                    sym = (row.get("SYMBOL") or row.get("Symbol") or "").strip().upper()
                    series = (row.get("SERIES") or row.get("Series") or "").strip().upper()
                    if not sym or series not in ("EQ", "BE", "BZ"):
                        continue
                    if sym in whitelist:
                        continue
                    if is_etf_or_re(sym, etf_set=existing_etfs, whitelist=whitelist):
                        if sym not in existing_etfs and not sym.endswith(("-RE", "-RE1", "-RE2")):
                            new_etfs.append(sym)
                            existing_etfs.add(sym)
        except Exception as e:
            pass

    if new_etfs:
        save_etf_symbols(existing_etfs, path)
        print(f"  ✅ Synced and appended {len(new_etfs)} new ETF(s): {new_etfs}")
    else:
        print(f"  ✅ ETF registry up to date. ({len(existing_etfs)} total ETFs)")

    return new_etfs

def is_etf_or_re(symbol: str, etf_set=None, whitelist=None) -> bool:
    """
    Evaluates whether a symbol is an ETF or Rights Entitlement (-RE).
    Strict Whitelist-Precedence: Returns False if symbol is in the protected registry.
    """
    if not symbol:
        return False
    sym = symbol.strip().upper()

    wl = whitelist if whitelist is not None else get_protected_whitelist()
    if sym in wl:
        return False

    # Rights Entitlements check (-RE, -RE1, -RE2, etc.)
    if "-RE" in sym or re.search(r"-RE\d*$", sym):
        return True

    etfs = etf_set if etf_set is not None else load_etf_symbols()
    if sym in etfs:
        return True

    # Standard ETF naming pattern fallback
    if sym.endswith(("BEES", "ETF", "IETF", "GETF", "BETF", "IWIN")):
        return True
    if sym.startswith(("SETF", "NETF", "BBETF", "EBBETF")) or sym in ("BHARAT22", "CPSEETF"):
        return True

    return False

def filter_etfs_polars(df: pl.DataFrame, symbol_col: str = "Symbol", file_path=None) -> pl.DataFrame:
    """
    Filters out ETFs and Rights Entitlements (-RE) from a Polars DataFrame.
    Guarantees that protected whitelisted corporate equities are retained.
    """
    if symbol_col not in df.columns:
        return df

    whitelist = get_protected_whitelist()
    etfs = load_etf_symbols(file_path)

    before_count = len(df)

    # Exclude conditions: NOT whitelisted AND (is -RE OR is in ETF set OR matches ETF naming pattern)
    is_whitelisted = pl.col(symbol_col).is_in(list(whitelist))
    is_re = pl.col(symbol_col).str.contains(r"-RE")
    is_known_etf = pl.col(symbol_col).is_in(list(etfs))
    is_pattern_etf = (
        pl.col(symbol_col).str.ends_with("BEES") |
        pl.col(symbol_col).str.ends_with("ETF") |
        pl.col(symbol_col).str.ends_with("IETF") |
        pl.col(symbol_col).str.ends_with("GETF") |
        pl.col(symbol_col).str.ends_with("BETF") |
        pl.col(symbol_col).str.ends_with("IWIN") |
        pl.col(symbol_col).str.starts_with("SETF") |
        pl.col(symbol_col).str.starts_with("NETF") |
        pl.col(symbol_col).str.starts_with("BBETF") |
        pl.col(symbol_col).str.starts_with("EBBETF") |
        pl.col(symbol_col).is_in(["BHARAT22", "CPSEETF"])
    )

    exclude_condition = (~is_whitelisted) & (is_re | is_known_etf | is_pattern_etf)
    filtered_df = df.filter(~exclude_condition)

    after_count = len(filtered_df)
    excluded_count = before_count - after_count
    if excluded_count > 0:
        print(f"Filtered out ETFs & -REs: {before_count} -> {after_count} rows ({excluded_count} excluded)")

    return filtered_df

def register_etf_filter_duckdb(con, file_path=None, table_name="excluded_etfs", whitelist_table="protected_whitelist"):
    """
    Registers a table of excluded ETF symbols and a table of protected corporate equities in DuckDB.
    Excludes any whitelisted symbols from the excluded table.
    """
    whitelist = get_protected_whitelist()
    etfs = load_etf_symbols(file_path)
    clean_etf_list = [s for s in etfs if s not in whitelist]

    con.register("temp_etf_df", pl.DataFrame({"symbol": clean_etf_list}))
    con.execute(f"CREATE OR REPLACE TEMP TABLE {table_name} AS SELECT symbol FROM temp_etf_df")

    con.register("temp_wl_df", pl.DataFrame({"symbol": sorted(list(whitelist))}))
    con.execute(f"CREATE OR REPLACE TEMP TABLE {whitelist_table} AS SELECT symbol FROM temp_wl_df")

def get_etf_exclusion_sql_clause(symbol_col="symbol", table_name="excluded_etfs", whitelist_table="protected_whitelist") -> str:
    """
    Returns SQL WHERE clause fragment enforcing:
    1. Strict Whitelist-Precedence: If symbol is in protected_whitelist, it is retained.
    2. Exclusion of known ETFs in excluded_etfs.
    3. Exclusion of Rights Entitlements (-RE, -RE1, etc.).
    4. Exclusion of ETF naming patterns (BEES, ETF, IETF, GETF, BETF, IWIN, SETF, NETF, BBETF, EBBETF, BHARAT22, CPSEETF).
    """
    return f"""(
        TRIM({symbol_col}) IN (SELECT symbol FROM {whitelist_table})
        OR (
            TRIM({symbol_col}) NOT IN (SELECT symbol FROM {table_name})
            AND TRIM({symbol_col}) NOT LIKE '%-RE%'
            AND TRIM({symbol_col}) NOT LIKE '%BEES'
            AND TRIM({symbol_col}) NOT LIKE '%ETF'
            AND TRIM({symbol_col}) NOT LIKE '%IETF'
            AND TRIM({symbol_col}) NOT LIKE '%GETF'
            AND TRIM({symbol_col}) NOT LIKE '%BETF'
            AND TRIM({symbol_col}) NOT LIKE '%IWIN'
            AND TRIM({symbol_col}) NOT LIKE 'SETF%'
            AND TRIM({symbol_col}) NOT LIKE 'NETF%'
            AND TRIM({symbol_col}) NOT LIKE 'BBETF%'
            AND TRIM({symbol_col}) NOT LIKE 'EBBETF%'
            AND TRIM({symbol_col}) NOT IN ('BHARAT22', 'CPSEETF')
        )
    )"""
