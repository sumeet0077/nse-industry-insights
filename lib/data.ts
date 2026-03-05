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
    RRGDataPoint,
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

export function getLatestDataDate(): string | null {
    const data = getBreadthData("market_breadth_nifty500");
    if (data.length === 0) return null;
    return data[data.length - 1].Date;
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

    // Map UI config titles to JSON dataset keys if they differ
    const ALIASES: Record<string, string> = {
        "amc": "asset management",
        "renewable energy": "renewable energy generation",
        "nifty oil & gas": "nifty oil and gas",
        "jewellery & gold": "jewellery (gold)",
        "tyres & rubber": "tyres & rubber products",
        "auto ancillary": "auto ancillary",
    };

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
    const resolvedTitle = ALIASES[lowerTitle] || lowerTitle;

    for (const key of Object.keys(status)) {
        if (key.toLowerCase() === resolvedTitle) return status[key];
    }

    return null;
}

export function getRRGData(timeframe: "D" | "W" | "M"): RRGDataPoint[] {
    return readJson<RRGDataPoint[]>(`rrg/rrg_${timeframe}.json`) ?? [];
}
