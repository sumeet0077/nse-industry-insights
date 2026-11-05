# scripts/sync_symbol_changes.py
"""
Automated upstream synchronizer for NSE official symbol changes.
Fetches official corporate action symbol changes directly from NSE Archives,
merges new changes into data/symbol_changes.json, transitively resolves multi-hop
changes, and auto-generates lib/symbolChanges.ts for frontend O(1) resolution.
"""

import os
import csv
import io
import json
import ssl
import urllib.request
from pathlib import Path
from datetime import datetime

ROOT_DIR = Path(__file__).resolve().parent.parent
SYMBOL_CHANGES_JSON = ROOT_DIR / "data" / "symbol_changes.json"
SYMBOL_CHANGES_TS = ROOT_DIR / "lib" / "symbolChanges.ts"
NSE_SYMBOL_CHANGE_URL = "https://nsearchives.nseindia.com/content/equities/symbolchange.csv"


def parse_nse_date(date_str: str) -> str:
    """Converts NSE date string (e.g. '02-NOV-2026' or '2026-11-02') to ISO 'YYYY-MM-DD'."""
    date_str = date_str.strip()
    if not date_str:
        return ""
    for fmt in ("%d-%b-%Y", "%d-%B-%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return date_str


def fetch_nse_symbol_changes() -> list[dict]:
    """Fetches the official symbol change CSV from NSE archives."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        NSE_SYMBOL_CHANGE_URL,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )

    try:
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            text = resp.read().decode("utf-8", errors="ignore")
    except Exception as e:
        print(f"  WARN: Failed to download symbol changes from NSE ({e}). Using local database.")
        return []

    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return []

    parsed = []
    # Header check: NAME OF THE COMPANY,OLD SYMBOL,NEW SYMBOL,EFFECTIVE DATE
    header_skipped = False
    for row in rows:
        if not row or len(row) < 4:
            continue
        col0 = row[0].strip().upper()
        if not header_skipped and ("COMPANY" in col0 or "SYMBOL" in col0):
            header_skipped = True
            continue

        company = row[0].strip()
        old_sym = row[1].strip().upper()
        new_sym = row[2].strip().upper()
        eff_date = parse_nse_date(row[3].strip())

        if old_sym and new_sym and old_sym != new_sym:
            parsed.append({
                "company": company,
                "old_symbol": old_sym,
                "new_symbol": new_sym,
                "effective_date": eff_date,
            })

    return parsed


def sync_symbol_changes() -> tuple[int, int]:
    """
    Downloads latest symbol changes, merges with data/symbol_changes.json,
    and updates lib/symbolChanges.ts.
    Returns: (new_added_count, total_count)
    """
    existing: list[dict] = []
    if SYMBOL_CHANGES_JSON.exists():
        try:
            with open(SYMBOL_CHANGES_JSON, "r", encoding="utf-8") as f:
                existing = json.load(f)
        except Exception as e:
            print(f"  WARN: Failed to read {SYMBOL_CHANGES_JSON}: {e}")

    existing_map = {
        (x.get("old_symbol", "").strip().upper(), x.get("new_symbol", "").strip().upper()): x
        for x in existing
    }

    online_changes = fetch_nse_symbol_changes()
    added_count = 0

    for item in online_changes:
        key = (item["old_symbol"], item["new_symbol"])
        if key not in existing_map:
            existing.append(item)
            existing_map[key] = item
            added_count += 1
        else:
            # Update date if existing was missing or less precise
            curr = existing_map[key]
            if not curr.get("effective_date") and item.get("effective_date"):
                curr["effective_date"] = item["effective_date"]
            if not curr.get("company") and item.get("company"):
                curr["company"] = item["company"]

    # Sort deterministically by effective_date desc, old_symbol asc
    existing.sort(key=lambda x: (x.get("effective_date") or "0000-00-00", x.get("old_symbol") or ""), reverse=True)

    with open(SYMBOL_CHANGES_JSON, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2)

    # Regenerate lib/symbolChanges.ts
    rebuild_typescript_registry(existing)

    return added_count, len(existing)


def rebuild_typescript_registry(changes_list: list[dict]):
    """Recompiles lib/symbolChanges.ts with the transitive terminal symbol map."""
    direct_map: dict[str, str] = {}
    for item in changes_list:
        old_s = item.get("old_symbol", "").strip().upper()
        new_s = item.get("new_symbol", "").strip().upper()
        if old_s and new_s and old_s != new_s:
            direct_map[old_s] = new_s

    # Compute transitive terminal map
    terminal_map: dict[str, str] = {}
    for sym in direct_map:
        visited = set([sym])
        curr = sym
        while curr in direct_map and direct_map[curr] not in visited:
            curr = direct_map[curr]
            visited.add(curr)
        terminal_map[sym] = curr

    sorted_map = dict(sorted(terminal_map.items()))
    map_json = json.dumps(sorted_map, indent=2)

    ts_template = '''// Centralized NSE Symbol Change & Rebranding Registry
// Auto-generated from official NSE corporate action changes.
// Provides O(1) transitive resolution for former and renamed ticker symbols.

export const SYMBOL_TERMINAL_MAP: Record<string, string> = __MAP_JSON__;

/**
 * Resolves any NSE ticker or symbol (e.g. "AMARAJABAT", "CADILAHC", "WELSPUNIND")
 * to its current active terminal symbol (e.g. "ARE&M", "ZYDUSLIFE", "WELSPUNLIV").
 * Strips .NS and .BO suffix before lookup, returning the clean active symbol.
 */
export function resolveActiveSymbol(ticker: string): string {
    if (!ticker) return "";
    const clean = ticker.replace(/\\.(NS|BO)$/i, "").trim().toUpperCase();
    return SYMBOL_TERMINAL_MAP[clean] || clean;
}

/**
 * Resolves any ticker and preserves or attaches the exchange suffix (defaults to .NS).
 * E.g. "AMARAJABAT" -> "ARE&M.NS", "AMARAJABAT.NS" -> "ARE&M.NS", "AMARAJABAT.BO" -> "ARE&M.BO"
 */
export function resolveActiveTicker(ticker: string): string {
    if (!ticker) return "";
    const isBO = ticker.toUpperCase().endsWith(".BO");
    const active = resolveActiveSymbol(ticker);
    return isBO ? `${active}.BO` : `${active}.NS`;
}

// Reverse lookup map: ACTIVE_SYMBOL -> [HISTORICAL_SYMBOLS]
export const HISTORICAL_ALIASES_MAP: Record<string, string[]> = (() => {
    const map: Record<string, string[]> = {};
    for (const [oldSym, activeSym] of Object.entries(SYMBOL_TERMINAL_MAP)) {
        if (!map[activeSym]) {
            map[activeSym] = [];
        }
        map[activeSym].push(oldSym);
    }
    return map;
})();

/**
 * Returns all former/historical ticker symbols that transitioned into this active symbol.
 */
export function getHistoricalAliases(activeTicker: string): string[] {
    const clean = resolveActiveSymbol(activeTicker);
    return HISTORICAL_ALIASES_MAP[clean] || [];
}
'''

    ts_content = ts_template.replace("__MAP_JSON__", map_json)
    with open(SYMBOL_CHANGES_TS, "w", encoding="utf-8") as f:
        f.write(ts_content)

    print(f"  OK   Updated lib/symbolChanges.ts with {len(sorted_map)} terminal symbol mappings.")


if __name__ == "__main__":
    added, total = sync_symbol_changes()
    print(f"  OK   Synced official NSE symbol changes: {added} new entries merged. Total: {total}")
