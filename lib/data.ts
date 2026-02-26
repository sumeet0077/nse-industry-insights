// lib/data.ts
// Functions to load JSON data files from the /data/ directory
// These run at build time (Server Components) for SSG

import path from "path";
import fs from "fs";
import type {
    BreadthDataPoint,
    PerformanceRow,
    MarketStatus,
    MarketStatusEntry,
    ConstituentPerformanceMap,
} from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson<T>(filePath: string): T | null {
    try {
        const fullPath = path.join(DATA_DIR, filePath);
        const raw = fs.readFileSync(fullPath, "utf-8");
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function getBreadthData(indexId: string): BreadthDataPoint[] {
    return readJson<BreadthDataPoint[]>(`breadth/${indexId}.json`) ?? [];
}

export function getPerformanceSummary(): PerformanceRow[] {
    return readJson<PerformanceRow[]>("performance/performance_summary.json") ?? [];
}

export function getMarketStatus(): MarketStatus {
    return readJson<MarketStatus>("market_status/market_status_latest.json") ?? {};
}

export function getConstituentPerformance(): ConstituentPerformanceMap {
    return (
        readJson<ConstituentPerformanceMap>(
            "constituent_performance/constituent_performance_latest.json"
        ) ?? {}
    );
}

/**
 * Look up market status for a given config title.
 * The market_status JSON uses varied key formats:
 *  - Broad market: "Nifty 50", "Nifty 500", "Nifty Smallcap 250"
 *  - Sectors: "NIFTY AUTO", "NIFTY BANK", etc.
 *  - Industries: "Copper", "Defence & Aerospace", "Railways & Infrastructure" etc.
 *
 * We need to match the config title to the market status key.
 */
export function getMarketStatusForIndex(configTitle: string): MarketStatusEntry | null {
    const status = getMarketStatus();

    // Direct match
    if (status[configTitle]) return status[configTitle];

    // Try uppercase (e.g., "Nifty Auto" → "NIFTY AUTO")
    const upperKey = configTitle.toUpperCase();
    if (status[upperKey]) return status[upperKey];

    // Try removing "Nifty " prefix (e.g., "Nifty Consumer Durables" → "NIFTY CONSUMER DURABLES")
    if (configTitle.startsWith("Nifty ")) {
        const niftyUpper = "NIFTY " + configTitle.slice(6).toUpperCase();
        if (status[niftyUpper]) return status[niftyUpper];
    }

    // Try all keys case-insensitive
    const lowerTitle = configTitle.toLowerCase();
    for (const key of Object.keys(status)) {
        if (key.toLowerCase() === lowerTitle) return status[key];
    }

    return null;
}
