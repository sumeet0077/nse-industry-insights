// lib/data.ts
// Functions to load JSON data files from the /data/ directory
// These run at build time (Server Components) for SSG

import path from "path";
import fs from "fs";
import type {
    BreadthDataPoint,
    PerformanceRow,
    MarketStatus,
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
