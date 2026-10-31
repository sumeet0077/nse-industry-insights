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
    TimeframeGainersStat,
    ThemeBreadthSummaryMetrics,
    AllThemesBreadthMap,
    DailyBreadthHistory1Y,
} from "@/types";
import { BROAD_MARKET, INDUSTRIES, SECTORS } from "@/lib/config";
import { resolveDataKey, resolveMarketStatusEntry } from "./utils";
import { ConstituentLeader, getTopConstituentLeaders } from "./swingTiming";


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

export interface AppVersionInfo {
    version: string;
    commitHash: string;
    timestamp: string;
    displayVersion: string;
}

export function getAppVersionInfo(): AppVersionInfo {
    try {
        const fullPath = path.join(process.cwd(), "lib", "version.json");
        const raw = fs.readFileSync(fullPath, "utf-8");
        return JSON.parse(raw) as AppVersionInfo;
    } catch {
        return {
            version: "1.0.4",
            commitHash: "main",
            timestamp: "",
            displayVersion: "v1.0.4 (main)",
        };
    }
}

export function getPerformanceSummary(): PerformanceRow[] {
    const raw = readJson<PerformanceRow[]>("performance/performance_summary.json") ?? [];
    const seen = new Set<string>();
    const unique: PerformanceRow[] = [];
    for (const row of raw) {
        const title = row["Theme/Index"];
        if (title && !seen.has(title)) {
            seen.add(title);
            unique.push(row);
        }
    }
    return unique;
}

export function getMarketStatus(): MarketStatus {
    return readJson<MarketStatus>("market_status/market_status_latest.json") ?? {};
}

export interface Stock52WItem {
    symbol: string;         // e.g. "WELCORP.NS"
    clean_symbol: string;   // e.g. "WELCORP"
    series?: string;        // e.g. "EQ", "BE", "BZ"
    circuit_band?: string;  // e.g. "20", "10", "5", "2", "No Band"
    is_circuit_locked?: boolean; // true if locked at upper/lower circuit limit
    close: number;
    pct_1d: number;
    pct_5d: number;
    volume: number;
    turnover_cr: number;
    count_5d: number;
    count_10d: number;
    count_20d: number;
    count_60d: number;
    streak: number;
    is_fresh_20d: boolean;
    last_hit_date: string;
    history_20d: number[];  // 1 = hit, 0 = no hit across last 20 sessions
    history_60d?: number[]; // 1 = hit, 0 = no hit across up to 60 sessions

    // Microstructure & Confluence Extensions
    ema_20?: number | null;
    ema_20_ext?: number | null;
    cpr_pivot?: number | null;
    cpr_top?: number | null;
    cpr_bot?: number | null;
    cpr_width_pct?: number | null;
    cpr_pos?: 'above' | 'inside' | 'below' | null;
    cpr_dist_top?: number | null;
    vol_surge?: number | null;
    deliv_pct?: number | null;
    deliv_surge?: number | null;
    prev_color?: 'red' | 'green' | 'flat' | null;
    candle_pattern?: 'hammer' | 'thrust' | 'rejection' | 'normal' | null;
    sector_wave_count?: number | null;
    sector_wave_theme?: string | null;
    today_high?: number | null;
    today_low?: number | null;
    risk_pct?: number | null;
    recency_days?: number | null;
    setup_type?: string | null;
    setup_label?: string | null;
    setup_bar_desc?: string | null;
    multi_year_level?: 'ATH' | '5Y' | '3Y' | '2Y' | null;
    base_gap_days?: number | null;
}

export interface Market52WHistory {
    metadata: {
        latest_session: string;
        window_sessions: number;
        start_date: string;
        end_date: string;
        sector_waves?: Record<string, string[]>;
        sector_waves_low?: Record<string, string[]>;
    };
    dates: string[];
    highs: Stock52WItem[];
    lows: Stock52WItem[];
    daily_lists: Record<string, { highs: string[]; lows: string[] }>;
}

export function getMarket52WHistory(): Market52WHistory | null {
    return readJson<Market52WHistory>("market_status/market_52w_history.json");
}

export function getConstituentPerformance(): ConstituentPerformanceMap {
    return (
        readJson<ConstituentPerformanceMap>(
            "constituent_performance/constituent_performance_latest.json"
        ) ?? {}
    );
}

export function getDailyBreadthHistory1Y(): DailyBreadthHistory1Y | null {
    return readJson<DailyBreadthHistory1Y>("history/daily_breadth_history_1y.json");
}

export function getAvailableHistoricalDates(): string[] {
    const hist = getDailyBreadthHistory1Y();
    return hist?.dates ?? [];
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

    // Try all keys case-insensitive using centralized resolveDataKey
    const resolvedTitle = resolveDataKey(configTitle);

    for (const key of Object.keys(status)) {
        if (key.toLowerCase() === resolvedTitle) return status[key];
    }

    return null;
}

export function getRRGData(timeframe: "D" | "W" | "M"): RRGDataPoint[] {
    return readJson<RRGDataPoint[]>(`rrg/rrg_${timeframe}.json`) ?? [];
}

export interface ThemeBreadthSummary {
    id: string;
    title: string;
    category: string;
    data: { Date: string; Index_Close: number }[];
}

/**
 * Load Index_Close time series for every industry theme.
 * Runs at build time (SSG). Slices history to the last N entries (default 600)
 * to keep RSC payload size optimal and prevent client hydration crashes.
 */
export function getAllThemeBreadthData(limit: number = 600): ThemeBreadthSummary[] {
    const results: ThemeBreadthSummary[] = [];
    const configs = [...BROAD_MARKET, ...SECTORS, ...INDUSTRIES];

    for (const config of configs) {
        const raw = getBreadthData(config.dataFile);
        if (!raw || raw.length === 0) continue;

        let trimmed = raw
            .filter((d) => d.Index_Close != null)
            .map((d) => ({ Date: d.Date, Index_Close: d.Index_Close! }));

        if (limit > 0 && trimmed.length > limit) {
            trimmed = trimmed.slice(-limit);
        }

        if (trimmed.length > 0) {
            results.push({ id: config.id, title: config.title, category: config.category, data: trimmed });
        }
    }

    return results;
}

export interface StockSearchEntry {
    id: string;
    title: string;
    category: string;
}

export type StockSearchIndex = Record<string, StockSearchEntry[]>;

/**
 * Load the pre-built reverse index: ticker → themes/sectors it belongs to.
 * Generated by export_json.py → stock_search_index.json
 */
export function getStockSearchIndex(): StockSearchIndex {
    return readJson<StockSearchIndex>("search/stock_search_index.json") ?? {};
}

export interface StockRRGPayload {
    constituents?: string[];
    D: RRGDataPoint[];
    W: RRGDataPoint[];
    M: RRGDataPoint[];
    skipped?: {
        D: string[];
        W: string[];
        M: string[];
    };
}

/**
 * Load pre-computed constituent stock RRG metrics for a specific index or theme.
 */
export function getStockRRGData(dataFile: string): StockRRGPayload | null {
    return readJson<StockRRGPayload>(`stock_rrg/${dataFile}.json`);
}

import { GAINER_TIMEFRAMES, type GainerTimeframe } from "@/lib/metrics";
export { GAINER_TIMEFRAMES, type GainerTimeframe };

/**
 * Computes comprehensive breadth participation and timeframe gainer metrics
 * across all 96 themes, sectors, and indices.
 * Runs in-memory (< 15ms) during SSG build.
 */
export function getAllThemesBreadthMetrics(): AllThemesBreadthMap {
    const marketStatus = getMarketStatus();
    const constituentPerf = getConstituentPerformance();
    const map: AllThemesBreadthMap = {};

    for (const [themeKey, entry] of Object.entries(marketStatus)) {
        const tickers = [...(entry.above || []), ...(entry.below || []), ...(entry.new_stock || [])];
        const totalStocks = tickers.length;
        const above200Sma = entry.above?.length || 0;
        const below200Sma = entry.below?.length || 0;
        const pctAbove200Sma = totalStocks > 0 ? Number(((above200Sma / totalStocks) * 100).toFixed(1)) : 0;

        const timeframes: Record<string, TimeframeGainersStat> = {};

        for (const tf of GAINER_TIMEFRAMES) {
            let gained = 0;
            let declined = 0;
            let flat = 0;
            let active = 0;

            for (const ticker of tickers) {
                const perf = constituentPerf[ticker];
                if (!perf) continue;
                const ret = perf[tf];
                if (ret === null || ret === undefined || isNaN(Number(ret))) {
                    continue; // unseasoned / IPO not active for this period
                }
                active++;
                const val = Number(ret);
                if (val > 0) gained++;
                else if (val < 0) declined++;
                else flat++;
            }

            const unlisted = totalStocks - active;
            const pct = active > 0 ? Number(((gained / active) * 100).toFixed(1)) : 0;

            timeframes[tf] = {
                gained,
                declined,
                flat,
                total: active,
                unlisted,
                pct,
            };
        }

        const metricObj: ThemeBreadthSummaryMetrics = {
            theme: themeKey,
            totalStocks,
            above200Sma,
            below200Sma,
            pctAbove200Sma,
            timeframes,
        };

        map[themeKey] = metricObj;
        map[themeKey.toLowerCase()] = metricObj;
        map[themeKey.toUpperCase()] = metricObj;
        map[resolveDataKey(themeKey)] = metricObj;
    }

    // Ensure all config titles resolve directly
    const configs = [...BROAD_MARKET, ...SECTORS, ...INDUSTRIES];
    for (const c of configs) {
        if (!map[c.title]) {
            const found = getThemeBreadthMetrics(c.title, map);
            if (found) {
                map[c.title] = found;
            }
        }
    }

    return map;
}

/**
 * Look up breadth summary metrics for a given config title.
 * Handles aliases, casing, and prefix variances.
 */
export function getThemeBreadthMetrics(
    configTitle: string,
    allMetrics?: AllThemesBreadthMap
): ThemeBreadthSummaryMetrics | null {
    const metrics = allMetrics || getAllThemesBreadthMetrics();
    if (metrics[configTitle]) return metrics[configTitle];
    const upper = configTitle.toUpperCase();
    if (metrics[upper]) return metrics[upper];
    if (configTitle.startsWith("Nifty ")) {
        const niftyUpper = "NIFTY " + configTitle.slice(6).toUpperCase();
        if (metrics[niftyUpper]) return metrics[niftyUpper];
    }
    const resolvedTitle = resolveDataKey(configTitle);
    for (const key of Object.keys(metrics)) {
        if (key.toLowerCase() === resolvedTitle) return metrics[key];
    }
    return null;
}

export interface ThemeWaveContext {
    rrgQuadrant: "Leading" | "Improving" | "Weakening" | "Lagging";
    headingNE: boolean;
    breakouts10d: number;
}

/**
 * Precomputes RRG quadrant, trajectory heading, and 10-day 52W high breakout count
 * for every theme across the universe for instant Next-Day wave classification.
 */
export function getThemeWaveContext(): Record<string, ThemeWaveContext> {
    const rrg = getRRGData("D");
    const m52w = getMarket52WHistory();
    const marketStatus = getMarketStatus();
    const constituents = getConstituentPerformance();

    const rrgMap: Record<string, RRGDataPoint[]> = {};
    for (const pt of rrg) {
        if (!rrgMap[pt.Ticker]) rrgMap[pt.Ticker] = [];
        rrgMap[pt.Ticker].push(pt);
    }

    const last10Highs = new Set<string>();
    if (m52w && m52w.dates && m52w.daily_lists) {
        const last10Dates = m52w.dates.slice(-10);
        for (const d of last10Dates) {
            const list = m52w.daily_lists[d];
            if (list?.highs) {
                for (const h of list.highs) last10Highs.add(h);
            }
        }
    }

    const configs = [...BROAD_MARKET, ...SECTORS, ...INDUSTRIES];
    const contextMap: Record<string, ThemeWaveContext> = {};

    for (const c of configs) {
        const points = rrgMap[c.dataFile] || rrgMap[c.id] || [];
        let rrgQuadrant: "Leading" | "Improving" | "Weakening" | "Lagging" = "Lagging";
        let headingNE = false;
        if (points.length >= 2) {
            const latest = points[points.length - 1];
            const prev = points[points.length - 2];
            if (latest.RS_Ratio >= 100 && latest.RS_Momentum >= 100) rrgQuadrant = "Leading";
            else if (latest.RS_Ratio < 100 && latest.RS_Momentum >= 100) rrgQuadrant = "Improving";
            else if (latest.RS_Ratio >= 100 && latest.RS_Momentum < 100) rrgQuadrant = "Weakening";
            else rrgQuadrant = "Lagging";

            headingNE = latest.RS_Ratio >= prev.RS_Ratio && latest.RS_Momentum >= prev.RS_Momentum;
        }

        const entry = resolveMarketStatusEntry(marketStatus, c.title);
        const tickers = entry ? [...(entry.above || []), ...(entry.below || []), ...(entry.new_stock || [])] : [];

        let breakouts10d = 0;
        for (const t of tickers) {
            const raw = t.replace(".NS", "");
            if (last10Highs.has(raw) || last10Highs.has(`${raw}.NS`)) {
                breakouts10d++;
            } else if (constituents[t]?.price_52w_high || constituents[`${t}.NS`]?.price_52w_high) {
                breakouts10d++;
            }
        }

        contextMap[c.title] = { rrgQuadrant, headingNE, breakouts10d };
    }

    return contextMap;
}

/**
 * Pre-extracts and ranks top 2 constituent swing candidate stocks per theme.
 */
export function getThemeTopLeaders(): Record<string, ConstituentLeader[]> {
    const marketStatus = getMarketStatus();
    const constituents = getConstituentPerformance();
    const configs = [...BROAD_MARKET, ...SECTORS, ...INDUSTRIES];
    const leadersMap: Record<string, ConstituentLeader[]> = {};

    for (const c of configs) {
        const entry = resolveMarketStatusEntry(marketStatus, c.title);
        const tickers = entry ? [...(entry.above || []), ...(entry.below || []), ...(entry.new_stock || [])] : [];
        leadersMap[c.title] = getTopConstituentLeaders(tickers, constituents, 2);
    }

    return leadersMap;
}


