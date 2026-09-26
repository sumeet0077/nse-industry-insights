"""
🛡️ NSE Price Band & Security Master Registry Utility.
Loads canonical price bands and series for NSE equities from data/sec_bands.json,
with autonomous live sync fallback against official NSE security master archives (sec_list.csv).
Provides first-principles tradability evaluation.
"""

import os
import json
import urllib.request
import csv
import io
from pathlib import Path

DEFAULT_BANDS_PATH = Path(__file__).resolve().parent.parent / "data" / "sec_bands.json"
NSE_SEC_LIST_URLS = [
    "https://archives.nseindia.com/content/equities/sec_list.csv",
    "https://nsearchives.nseindia.com/content/equities/sec_list.csv",
]

_cached_sec_bands = None


def load_sec_bands(file_path=None) -> dict:
    """
    Loads canonical security price bands and series from data/sec_bands.json.
    Returns dict mapping clean symbol -> {"series": str, "band": str, "remarks": str}.
    """
    global _cached_sec_bands
    if _cached_sec_bands is not None and file_path is None:
        return _cached_sec_bands

    path = Path(file_path) if file_path else DEFAULT_BANDS_PATH
    if not path.exists():
        return {}

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                if file_path is None:
                    _cached_sec_bands = data
                return data
    except Exception as e:
        print(f"Warning: Could not read sec_bands.json: {e}")

    return {}


def sync_sec_bands_from_nse(file_path=None, timeout=3.0) -> dict:
    """
    Attempts to download latest sec_list.csv from official NSE archives with a tight timeout.
    Falls back gracefully to local cached sec_bands.json if offline or network unavailable.
    """
    global _cached_sec_bands
    path = Path(file_path) if file_path else DEFAULT_BANDS_PATH

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }

    content = None
    for url in NSE_SEC_LIST_URLS:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    content = resp.read().decode("utf-8", errors="ignore")
                    break
        except Exception:
            continue

    if content:
        try:
            reader = csv.DictReader(io.StringIO(content))
            bands_map = {}
            for r in reader:
                sym = r.get("Symbol", "").strip().upper()
                if sym:
                    bands_map[sym] = {
                        "series": r.get("Series", "").strip(),
                        "band": r.get("Band", "").strip(),
                        "remarks": r.get("Remarks", "").strip()
                    }
            if bands_map:
                path.parent.mkdir(parents=True, exist_ok=True)
                with open(path, "w", encoding="utf-8") as f:
                    json.dump(bands_map, f, indent=2)
                _cached_sec_bands = bands_map
                print(f"  ✅ Synced {len(bands_map)} price bands from official NSE security master")
                return bands_map
        except Exception as e:
            print(f"  ⚠️ Warning: Failed to parse NSE sec_list.csv ({e}). Falling back to local cache.")

    return load_sec_bands(file_path=path)


def get_security_info(symbol: str, bands_map=None) -> dict:
    """
    Returns security master info for a symbol: {"series": str, "band": str, "remarks": str}.
    Clean symbol resolution (strips '.NS' and whitespace).
    """
    if not symbol:
        return {"series": "EQ", "band": "20", "remarks": "-"}
    clean = symbol.strip().upper().replace(".NS", "")
    bands = bands_map if bands_map is not None else load_sec_bands()
    return bands.get(clean, {"series": "EQ", "band": "20", "remarks": "-"})


def get_security_band(symbol: str, bands_map=None) -> str:
    """Returns official price band ('20', '10', '5', '2', 'No Band') or '20' default."""
    info = get_security_info(symbol, bands_map)
    band = info.get("band", "").strip()
    return band if band else "20"


def get_security_series(symbol: str, bands_map=None) -> str:
    """Returns official security series ('EQ', 'BE', 'BZ', etc.) or 'EQ' default."""
    info = get_security_info(symbol, bands_map)
    series = info.get("series", "").strip()
    return series if series else "EQ"


def is_tradeable(
    symbol: str,
    turnover_cr: float = 0.0,
    close: float = 0.0,
    is_circuit_locked: bool = False,
    bands_map=None,
    min_turnover: float = 1.0,
    min_price: float = 20.0,
) -> bool:
    """
    First-Principles Tradability Filter:
    - Excludes 2% and 5% circuit bands (illiquid operator traps)
    - Requires Daily Turnover >= min_turnover (default ₹1.00 Cr)
    - Requires Close Price >= min_price (default ₹20)
    - Requires Series 'EQ' (excludes Trade-to-Trade 'BE'/'BZ')
    - Excludes currently circuit-locked stocks
    """
    if is_circuit_locked:
        return False
    if close < min_price:
        return False
    if turnover_cr < min_turnover:
        return False

    info = get_security_info(symbol, bands_map)
    band = str(info.get("band", "")).strip()
    series = str(info.get("series", "")).strip().upper()

    # Series must be EQ
    if series and series != "EQ":
        return False

    # Exclude 2% and 5% price bands
    if band in ("2", "5"):
        return False

    return True
