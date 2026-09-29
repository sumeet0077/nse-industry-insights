# scripts/symbol_change_util.py
"""
Utility for resolving NSE symbol changes and corporate rebranding transitions.
Loads official NSE symbol changes from data/symbol_changes.json (with online update fallback).
Provides transitive resolution (A -> B -> C -> Terminal) and date-aware resolution.
"""

import os
import json
from pathlib import Path
from datetime import datetime

DEFAULT_SYMBOL_CHANGES_PATH = Path(__file__).resolve().parent.parent / "data" / "symbol_changes.json"

_CACHED_SYMBOL_CHANGES = None
_CACHED_TERMINAL_MAP = None

def load_symbol_changes(file_path=None):
    """
    Loads list of symbol change dicts:
    [{'company': str, 'old_symbol': str, 'new_symbol': str, 'effective_date': 'YYYY-MM-DD'}, ...]
    """
    global _CACHED_SYMBOL_CHANGES
    if _CACHED_SYMBOL_CHANGES is not None and file_path is None:
        return _CACHED_SYMBOL_CHANGES

    p = Path(file_path) if file_path else DEFAULT_SYMBOL_CHANGES_PATH
    if not p.exists():
        return []

    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
            _CACHED_SYMBOL_CHANGES = data
            return data
    except Exception as e:
        print(f"  WARN: Failed to load symbol changes from {p}: {e}")
        return []

def get_terminal_symbol_map():
    """
    Returns a dictionary mapping every old/historical symbol directly to its terminal active symbol.
    Resolves multi-hop chains transitively (e.g., A -> B -> C becomes A -> C and B -> C).
    Detects and breaks any potential circular loops.
    """
    global _CACHED_TERMINAL_MAP
    if _CACHED_TERMINAL_MAP is not None:
        return _CACHED_TERMINAL_MAP

    changes = load_symbol_changes()
    direct_map = {}
    for item in changes:
        old_s = item.get("old_symbol", "").strip().upper()
        new_s = item.get("new_symbol", "").strip().upper()
        if old_s and new_s and old_s != new_s:
            direct_map[old_s] = new_s

    terminal_map = {}
    for sym in direct_map:
        visited = set()
        curr = sym
        while curr in direct_map and curr not in visited:
            visited.add(curr)
            curr = direct_map[curr]
        terminal_map[sym] = curr

    _CACHED_TERMINAL_MAP = terminal_map
    return terminal_map

def resolve_symbol(symbol: str, trade_date: str = None) -> str:
    """
    Resolves a ticker symbol to its active/terminal symbol.
    If trade_date is provided (YYYY-MM-DD), checks whether the trade_date was before the effective date.
    """
    if not symbol:
        return symbol

    clean = symbol.replace(".NS", "").replace(".BO", "").strip().upper()
    terminal_map = get_terminal_symbol_map()

    if trade_date:
        # Check date-specific effective date if needed
        changes = load_symbol_changes()
        # Find if this symbol was changed after trade_date
        relevant_new = None
        for c in changes:
            if c.get("old_symbol") == clean:
                eff_d = c.get("effective_date", "")
                if eff_d and trade_date < eff_d:
                    # The trade happened BEFORE the change became effective;
                    # in unified continuous series, we want to forward-map it to the terminal symbol
                    relevant_new = terminal_map.get(clean, clean)
                    break
        target = relevant_new or terminal_map.get(clean, clean)
    else:
        target = terminal_map.get(clean, clean)

    if symbol.endswith(".NS"):
        return f"{target}.NS"
    elif symbol.endswith(".BO"):
        return f"{target}.BO"
    return target
