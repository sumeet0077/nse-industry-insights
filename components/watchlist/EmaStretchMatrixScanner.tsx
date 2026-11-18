// components/watchlist/EmaStretchMatrixScanner.tsx
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type {
    EMAStretchMatrix,
    EMAStretchUniverseData,
    EMAStretchUniverseItem,
    EMAStretchCell,
    SupportAnchorTarget,
    SupportTimeframeTarget,
    TrendRegimeOption,
} from "@/types";
import type { StockSearchIndex, Market52WHistory } from "@/lib/data";
import type { ConstituentPerformanceMap } from "@/types";
import { cleanTicker, makeTradingViewUrl } from "@/lib/utils";
import {
    Zap,
    Flame,
    Target,
    Compass,
    Search,
    Filter,
    ArrowUpDown,
    ExternalLink,
    Plus,
    Check,
    Copy,
    Layers,
    SlidersHorizontal,
    Table as TableIcon,
    Sparkles,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Activity,
    Download,
    Bookmark,
    Trash2,
    X,
    RotateCcw,
    ChevronDown,
    ChevronUp,
    Eye,
    CheckCircle2,
    Shield,
} from "lucide-react";
import { EmaStretchMatrixModal, getSetupVerdict, calcLandingDiscount } from "@/components/modals/EmaStretchMatrixModal";

interface EmaStretchMatrixScannerProps {
    historyData?: Market52WHistory | null;
    stockSearchIndex?: StockSearchIndex;
    constituentPerformanceMap?: ConstituentPerformanceMap | null;
    onOpenInRRG?: (tickers: string[], suggestedName?: string) => void;
    onOpenInTable?: (tickers: string[], suggestedName?: string) => void;
    onSaveAsWatchlist?: (name: string, tickers: string[], folder?: string) => void;
    onAddTickerToActiveWatchlist?: (ticker: string) => void;
    activeWatchlistTickers?: string[];
    activeWatchlistName?: string;
}

export type StretchPreset =
    | "all"
    | "holy_grail"
    | "support_50"
    | "cpr_bounce"
    | "momentum_8"
    | "hook"
    | "climax"
    | "squeeze"
    | "thrust"
    | "landing";

export type StretchSortField = "symbol" | "pct_1d" | "turnover" | "daily_s20" | "weekly_s20" | "monthly_s20" | "velocity" | "landing_dist";
export type ViewMode = "focus" | "matrix";
export type IndexUniverseOption = "all" | "nifty50" | "nifty500" | "midcap" | "smallcap" | "fno";
export type VelocityDirectionOption = "all" | "positive" | "negative" | "accelerating" | "hook";
export type LandingProximityOption = "all" | "at_support" | "near_support" | "extended" | "deep_pullback";

export interface StretchFilterState {
    indexUniverse: IndexUniverseOption;
    minTurnoverCr: number; // 0, 10, 25, 50, 100
    dailyStretchMin: number | null; // e.g. -2.0 ATR
    dailyStretchMax: number | null; // e.g. +1.0 ATR
    weeklyPercentileMin: number | null; // e.g. 70
    velocityDirection: VelocityDirectionOption;
    landingProximity: LandingProximityOption;
    squeezeOnly: boolean;
    // Enhanced Multi-Level Pullback & MTF Controls
    targetAnchor: SupportAnchorTarget;
    targetTimeframe: SupportTimeframeTarget;
    monthlyTrend: TrendRegimeOption;
    weeklyTrend: TrendRegimeOption;
    dailyTrend: TrendRegimeOption;
}

export const DEFAULT_FILTER_STATE: StretchFilterState = {
    indexUniverse: "all",
    minTurnoverCr: 0,
    dailyStretchMin: null,
    dailyStretchMax: null,
    weeklyPercentileMin: null,
    velocityDirection: "all",
    landingProximity: "all",
    squeezeOnly: false,
    targetAnchor: "ema_20",
    targetTimeframe: "daily",
    monthlyTrend: "any",
    weeklyTrend: "any",
    dailyTrend: "any",
};

export interface CustomPreset {
    id: string;
    name: string;
    filters: StretchFilterState;
    createdAt: number;
}

const LOCAL_STORAGE_KEY = "EMA_STRETCH_CUSTOM_PRESETS_V1";

// Explicit non-equity blacklist (REITs, InvITs, and GILTs)
export const EXCLUDED_NON_EQUITY = new Set([
    "EMBASSY", "MINDSPACE", "BIRET", "NXST", "PGINVIT", "IRBINVIT", "INDIGRID", "SBI10YGILT"
]);

export function isExcludedNonEquity(clean: string): boolean {
    if (clean === "PNBGILTS") return false;
    if (EXCLUDED_NON_EQUITY.has(clean)) return true;
    if (/REIT|INVIT|GILT/i.test(clean)) return true;
    return false;
}

export interface AnchorInfo {
    label: string;
    level: number | null;
    distancePct: number | null;
}

export function getEmaAnchorInfo(
    item: EMAStretchUniverseItem,
    targetAnchor: SupportAnchorTarget = "ema_20",
    targetTf: SupportTimeframeTarget = "daily"
): AnchorInfo {
    const m = item.ema_stretch;
    const close = item.close;
    if (!m || close == null || close <= 0) {
        return { label: "Support", level: null, distancePct: null };
    }

    if (targetAnchor === "any") {
        const d8 = m.landing_ema_8 ?? m.landing_ema_10 ?? null;
        const d20 = m.landing_ema_20 ?? null;
        const d50 = m.landing_ema_50 ?? null;
        const cpr = m.landing_cpr_pivot ?? m.landing_cpr_top ?? null;

        const candidates: { label: string; level: number | null }[] = [
            { label: "8 EMA", level: d8 },
            { label: "20 EMA", level: d20 },
            { label: "50 EMA", level: d50 },
            { label: "Central Pivot", level: cpr },
        ];

        let best: { label: string; level: number; distPct: number } | null = null;
        for (const c of candidates) {
            if (c.level != null && c.level > 0) {
                const dist = ((close - c.level) / c.level) * 100;
                if (best === null || Math.abs(dist) < Math.abs(best.distPct)) {
                    best = { label: c.label, level: c.level, distPct: dist };
                }
            }
        }
        if (best) {
            return { label: best.label, level: best.level, distancePct: best.distPct };
        }
        return { label: "Support", level: null, distancePct: null };
    }

    let level: number | null = null;
    let label = "20 EMA";

    if (targetTf === "weekly") {
        if (targetAnchor === "ema_8") {
            level = m.weekly?.ema_8?.ema_val ?? m.weekly?.ema_10?.ema_val ?? null;
            label = "Weekly 8 EMA";
        } else if (targetAnchor === "ema_20") {
            level = m.weekly?.ema_20?.ema_val ?? null;
            label = "Weekly 20 EMA";
        } else if (targetAnchor === "ema_50") {
            level = m.weekly?.ema_50?.ema_val ?? null;
            label = "Weekly 50 EMA";
        } else if (targetAnchor === "cpr_pivot") {
            level = m.landing_cpr_pivot ?? m.landing_cpr_top ?? null;
            label = "Central Pivot";
        }
    } else {
        if (targetAnchor === "ema_8") {
            level = m.landing_ema_8 ?? m.landing_ema_10 ?? null;
            label = "8 EMA";
        } else if (targetAnchor === "ema_20") {
            level = m.landing_ema_20 ?? null;
            label = "20 EMA";
        } else if (targetAnchor === "ema_50") {
            level = m.landing_ema_50 ?? null;
            label = "50 EMA";
        } else if (targetAnchor === "cpr_pivot") {
            level = m.landing_cpr_pivot ?? m.landing_cpr_top ?? null;
            label = "Central Pivot";
        }
    }

    if (level == null || level <= 0) {
        return { label, level: null, distancePct: null };
    }

    const distPct = ((close - level) / level) * 100;
    return { label, level, distancePct: distPct };
}

export function getEmaDistancePct(
    item: EMAStretchUniverseItem,
    targetAnchor: SupportAnchorTarget = "ema_20",
    targetTf: SupportTimeframeTarget = "daily"
): number | null {
    return getEmaAnchorInfo(item, targetAnchor, targetTf).distancePct;
}

// Helper to evaluate timeframe micro glyph
export function getTfMicroGlyph(
    cell8: EMAStretchCell | undefined,
    cell20: EMAStretchCell | undefined,
    cell50: EMAStretchCell | undefined,
    forceIpo: boolean = false
) {
    const isIpo = forceIpo || cell20?.percentile_str === "IPO" || cell20?.color_tier === "ipo" || !cell20;
    if (isIpo) {
        return {
            glyph: "—",
            label: "IPO",
            style: "bg-gray-800 text-amber-400 border-amber-500/30",
            detail: "IPO / <20 bars",
        };
    }

    const isAbove20 = cell20.is_above;
    const s20 = cell20.stretch_atr ?? 0;
    const p20 = cell20.percentile ?? 50;

    // 1. Climax Overextension (>= 2.5 ATR or >= P95)
    if (isAbove20 && (s20 >= 2.5 || p20 >= 95)) {
        return {
            glyph: "★",
            label: "Climax",
            style: "bg-[#670038] text-[#fce7f3] border-[#8a144e] shadow-sm",
            detail: `Climax (+${s20.toFixed(1)} ATR · +P${p20})`,
        };
    }

    // 2. Thrust (above 8 & 20 EMA)
    const isAbove8 = cell8 ? cell8.is_above : isAbove20;
    if (isAbove8 && isAbove20) {
        return {
            glyph: "▲",
            label: "Thrust",
            style: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm",
            detail: `Thrust: Above 8 & 20 EMA (+${s20.toFixed(1)} ATR · +P${p20})`,
        };
    }

    // 3. Pullback (below 8 EMA, above/near 20 EMA)
    if (!isAbove8 && (isAbove20 || s20 <= 0.8)) {
        return {
            glyph: "◆",
            label: "Pullback",
            style: "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm",
            detail: `Pullback: Below 8 EMA, resting near 20 EMA`,
        };
    }

    // 4. Resting near 50 EMA (within 0.8 ATR)
    if (cell50 && Math.abs(cell50.stretch_atr) <= 0.8) {
        return {
            glyph: "■",
            label: "50 EMA",
            style: "bg-indigo-900/30 text-indigo-300 border-indigo-700/50 shadow-sm",
            detail: `Resting near 50 EMA (${cell50.is_above ? "+" : "-"}${cell50.stretch_atr.toFixed(1)} ATR)`,
        };
    }

    // 5. Bearish (below 20 EMA)
    return {
        glyph: "▼",
        label: "Bear",
        style: "bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm",
        detail: `Bearish: Below 20 EMA (-${s20.toFixed(1)} ATR · -P${p20})`,
    };
}

export function getMtfConfluenceStatus(m: EMAStretchMatrix | undefined, close: number = 0) {
    if (!m) return { text: "No Data", style: "bg-gray-800 text-gray-500 border-gray-700", tooltip: "No stretch data" };

    const isWeeklyIpo = m.weekly?.ema_20?.percentile_str === "IPO" || m.weekly?.ema_20?.color_tier === "ipo";
    if (isWeeklyIpo) {
        return { text: "⚪ IPO", style: "bg-gray-800 text-amber-300 border-amber-500/30", tooltip: "IPO / Insufficient Active History (<20 bars)" };
    }

    const d20 = m.daily?.ema_20;
    const w20 = m.weekly?.ema_20;
    const m20 = m.monthly?.ema_20;
    const d50 = m.daily?.ema_50;
    const w50 = m.weekly?.ema_50;
    const vel = m.velocity ?? 0;

    const isDailyBull = Boolean(d20?.is_above);
    const isWeeklyBull = Boolean(w20?.is_above);
    const isMonthlyBull = Boolean(m20?.is_above);

    // 1. Climax
    if (
        (d20?.is_above && (d20.percentile ?? 0) >= 90 && w20?.is_above && (w20.percentile ?? 0) >= 90) ||
        (d20?.is_above && (d20.stretch_atr >= 2.5 || (d20.percentile ?? 0) >= 95) && vel > 0.2)
    ) {
        return { text: "⚡ Climax", style: "bg-[#670038] text-[#fce7f3] border-[#8a144e] font-bold shadow-sm", tooltip: "Simultaneous Multi-Timeframe Climax Overextension" };
    }

    // 2. 20 EMA Dip (Holy Grail)
    const dStretchSigned = d20 ? (d20.is_above ? d20.stretch_atr : -d20.stretch_atr) : 99;
    if (isMonthlyBull && isWeeklyBull && dStretchSigned >= -0.5 && dStretchSigned <= 0.8 && vel >= 0) {
        return { text: "🎯 20 EMA Dip", style: "bg-emerald-600/30 text-emerald-300 border-emerald-500/60 font-bold", tooltip: "Holy Grail: Monthly & Weekly Bull + Daily resting at 20 EMA" };
    }

    // 3. 50 EMA Support
    if (isMonthlyBull && ((d50 && Math.abs(d50.stretch_atr) <= 0.8) || (w50 && Math.abs(w50.stretch_atr) <= 0.8))) {
        return { text: "🛡️ 50 EMA Support", style: "bg-indigo-900/30 text-indigo-300 border-indigo-600/50 font-bold", tooltip: "50 EMA Support: Monthly Bull + Daily/Weekly testing 50 EMA structural baseline" };
    }

    // 4. CPR Pivot Bounce
    const cprPivot = m.landing_cpr_pivot ?? m.landing_cpr_top;
    if ((isMonthlyBull || isWeeklyBull) && cprPivot != null && close > 0 && Math.abs((close - cprPivot) / cprPivot * 100) <= 1.5) {
        return { text: "🏛️ CPR Pivot Bounce", style: "bg-cyan-900/30 text-cyan-300 border-cyan-600/50 font-bold", tooltip: "CPR Pivot Bounce: Macro Bull + Resting at Monthly Central Pivot (P)" };
    }

    // 5. 3/3 Full Bull
    if (isDailyBull && isWeeklyBull && isMonthlyBull) {
        return { text: "3/3 Full Bull", style: "bg-emerald-950/40 text-emerald-300 border-emerald-700/50 font-semibold", tooltip: "Full Multi-Timeframe Bullish Alignment across Daily, Weekly, and Monthly" };
    }

    // 6. 0/3 Bear
    if (!isDailyBull && !isWeeklyBull && !isMonthlyBull) {
        return { text: "🔴 0/3 Bear", style: "bg-rose-950/40 text-rose-300 border-rose-700/50 font-semibold", tooltip: "Full Multi-Timeframe Bearish Alignment across Daily, Weekly, and Monthly" };
    }

    // 7. Counter-Rally (Daily bull but Weekly and Monthly bear)
    if (isDailyBull && !isWeeklyBull && !isMonthlyBull) {
        return { text: "⚠️ Counter-Rally", style: "bg-amber-950/40 text-amber-300 border-amber-700/50 font-semibold", tooltip: "Counter-Trend Daily Rally against Bearish Weekly and Monthly Regimes" };
    }

    // 8. Mixed Confluence
    const bullCount = (isDailyBull ? 1 : 0) + (isWeeklyBull ? 1 : 0) + (isMonthlyBull ? 1 : 0);
    return {
        text: `${bullCount}/3 Bull`,
        style: "bg-gray-800 text-gray-300 border-gray-700",
        tooltip: `${bullCount} of 3 timeframes trading above 20 EMA`,
    };
}

export interface IndexSets {
    nifty50: Set<string>;
    nifty500: Set<string>;
    midcap: Set<string>;
    smallcap: Set<string>;
    fno: Set<string>;
}

// Power Filter Drawer matching helper
export function matchesPowerFilters(
    item: EMAStretchUniverseItem,
    f: StretchFilterState,
    idxSets: IndexSets
): boolean {
    const m = item.ema_stretch;
    const clean = item.clean_symbol.trim().toUpperCase();

    // 1. Index Universe Filter
    if (f.indexUniverse !== "all") {
        const targetSet = idxSets[f.indexUniverse];
        if (targetSet && targetSet.size > 0 && !targetSet.has(clean)) {
            return false;
        }
    }

    // 2. Min Turnover (Cr)
    if (f.minTurnoverCr > 0 && (item.turnover_cr ?? 0) < f.minTurnoverCr) {
        return false;
    }

    // 3. Quantitative Daily Stretch (ATR Range)
    if (f.dailyStretchMin !== null || f.dailyStretchMax !== null) {
        const d20 = m?.daily?.ema_20;
        if (!d20) return false;
        const dStretchSigned = d20.is_above ? d20.stretch_atr : -d20.stretch_atr;
        if (f.dailyStretchMin !== null && dStretchSigned < f.dailyStretchMin) {
            return false;
        }
        if (f.dailyStretchMax !== null && dStretchSigned > f.dailyStretchMax) {
            return false;
        }
    }

    // 4. Weekly Trend Strength (Percentile Min)
    if (f.weeklyPercentileMin !== null) {
        const w20 = m?.weekly?.ema_20;
        if (!w20 || !w20.is_above || (w20.percentile ?? 0) < f.weeklyPercentileMin) {
            return false;
        }
    }

    // 5. Kinetic Velocity Filter
    if (f.velocityDirection !== "all") {
        const vel = m?.velocity ?? 0;
        const d20 = m?.daily?.ema_20;
        switch (f.velocityDirection) {
            case "positive":
                if (vel <= 0) return false;
                break;
            case "negative":
                if (vel >= 0) return false;
                break;
            case "accelerating":
                if (vel <= 0.20) return false;
                break;
            case "hook":
                if (!m?.is_exhaustion_hook && !(d20?.is_above && (d20?.percentile ?? 0) >= 90 && vel < 0)) {
                    return false;
                }
                break;
        }
    }

    // 6. Landing Zone Proximity Filter
    if (f.landingProximity !== "all") {
        const dist = getEmaDistancePct(item, f.targetAnchor, f.targetTimeframe);
        if (dist == null) return false;
        switch (f.landingProximity) {
            case "at_support":
                // within [-1.5%, +0.5%]
                if (dist < -1.5 || dist > 0.5) return false;
                break;
            case "near_support":
                // within [-3.0%, +1.5%]
                if (dist < -3.0 || dist > 1.5) return false;
                break;
            case "extended":
                // > +5.0%
                if (dist <= 5.0) return false;
                break;
            case "deep_pullback":
                // < -5.0%
                if (dist >= -5.0) return false;
                break;
        }
    }

    // 7. Volatility Squeeze Compression
    if (f.squeezeOnly) {
        if (!m?.is_squeeze && (m?.sbs_score == null || m.sbs_score < 8.0)) {
            return false;
        }
    }

    // 8. Independent Multi-Timeframe Trend Pickers
    if (f.monthlyTrend !== "any") {
        const m20 = m?.monthly?.ema_20;
        const isIpo = !m20 || m20.percentile_str === "IPO" || m20.color_tier === "ipo";
        if (isIpo) return false;
        if (f.monthlyTrend === "bull" && !m20.is_above) return false;
        if (f.monthlyTrend === "bear" && m20.is_above) return false;
    }
    if (f.weeklyTrend !== "any") {
        const w20 = m?.weekly?.ema_20;
        const isIpo = !w20 || w20.percentile_str === "IPO" || w20.color_tier === "ipo";
        if (isIpo) return false;
        if (f.weeklyTrend === "bull" && !w20.is_above) return false;
        if (f.weeklyTrend === "bear" && w20.is_above) return false;
    }
    if (f.dailyTrend !== "any") {
        const d20 = m?.daily?.ema_20;
        const isIpo = !d20 || d20.percentile_str === "IPO" || d20.color_tier === "ipo";
        if (isIpo) return false;
        if (f.dailyTrend === "bull" && !d20.is_above) return false;
        if (f.dailyTrend === "bear" && d20.is_above) return false;
    }

    return true;
}

export function EmaStretchMatrixScanner({
    historyData,
    stockSearchIndex = {},
    constituentPerformanceMap,
    onOpenInRRG,
    onOpenInTable,
    onSaveAsWatchlist,
    onAddTickerToActiveWatchlist,
    activeWatchlistTickers = [],
    activeWatchlistName,
}: EmaStretchMatrixScannerProps) {
    // 1. Data Loading: Universe with fallback to 52W history items
    const initialFallbackItems = useMemo(() => {
        if (!historyData) return [];
        const map = new Map<string, EMAStretchUniverseItem>();
        const allItems = [...(historyData.highs || []), ...(historyData.lows || [])];
        for (const h of allItems) {
            if (h.ema_stretch && !map.has(h.clean_symbol) && !isExcludedNonEquity(h.clean_symbol)) {
                map.set(h.clean_symbol, {
                    symbol: h.symbol,
                    clean_symbol: h.clean_symbol,
                    close: h.close,
                    pct_1d: h.pct_1d,
                    volume: h.volume,
                    turnover_cr: h.turnover_cr,
                    themes: h.sector_wave_theme ? [h.sector_wave_theme] : [],
                    ema_stretch: h.ema_stretch,
                });
            }
        }
        return Array.from(map.values());
    }, [historyData]);

    const [universeItems, setUniverseItems] = useState<EMAStretchUniverseItem[]>(initialFallbackItems);
    const [isLoading, setIsLoading] = useState(initialFallbackItems.length === 0);
    const [latestDate, setLatestDate] = useState<string>(historyData?.metadata?.latest_session || "");

    // Index & F&O Universe Sets
    const [indexSets, setIndexSets] = useState<IndexSets>({
        nifty50: new Set(),
        nifty500: new Set(),
        midcap: new Set(),
        smallcap: new Set(),
        fno: new Set(),
    });

    // 2. Fetch Universe & Market Index Data
    useEffect(() => {
        let isMounted = true;
        async function fetchUniverseAndIndices() {
            let universeSymbols: Set<string> | null = null;
            try {
                // Fetch EMA stretch universe data
                const res = await fetch("/data/market_status/ema_stretch_universe.json");
                if (res.ok) {
                    const data: EMAStretchUniverseData = await res.json();
                    if (isMounted && data && Array.isArray(data.items)) {
                        const sanitized = data.items.filter((i) => !isExcludedNonEquity(i.clean_symbol));
                        setUniverseItems(sanitized);
                        universeSymbols = new Set(sanitized.map((i) => i.clean_symbol));
                        setLatestDate(data.metadata?.latest_session || "");
                        setIsLoading(false);
                    }
                }
            } catch (err) {
                console.warn("Could not fetch /data/market_status/ema_stretch_universe.json:", err);
                if (isMounted && initialFallbackItems.length > 0) {
                    const sanitized = initialFallbackItems.filter((i) => !isExcludedNonEquity(i.clean_symbol));
                    setUniverseItems(sanitized);
                    universeSymbols = new Set(sanitized.map((i) => i.clean_symbol));
                    setLatestDate(historyData?.metadata?.latest_session || "");
                    setIsLoading(false);
                }
            }

            // Fetch Market Status for Index constituent sets
            try {
                const resMs = await fetch("/data/market_status/market_status_latest.json");
                if (resMs.ok) {
                    const ms = await resMs.json();
                    const extractSymbols = (entry: { above?: string[]; below?: string[]; new_stock?: string[] } | undefined): Set<string> => {
                        if (!entry) return new Set();
                        const list = [...(entry.above || []), ...(entry.below || []), ...(entry.new_stock || [])];
                        return new Set(list.map((s) => cleanTicker(s)));
                    };

                    const n50 = extractSymbols(ms["Nifty 50"]);
                    const n500 = extractSymbols(ms["Nifty 500"]);
                    const mid = extractSymbols(ms["Nifty Midcap 150"]);
                    const small = extractSymbols(ms["Nifty Smallcap 250"]);

                    // F&O set: populate from sec_bands filtered to active equity universe
                    const fnoSet = new Set<string>();

                    try {
                        const resBands = await fetch("/data/sec_bands.json");
                        if (resBands.ok) {
                            const bands = await resBands.json();
                            for (const [sym, info] of Object.entries(bands)) {
                                const bInfo = info as { series?: string; band?: string };
                                if (bInfo.band === "No Band" && bInfo.series === "EQ") {
                                    const clean = cleanTicker(sym);
                                    if (!universeSymbols || universeSymbols.has(clean)) {
                                        fnoSet.add(clean);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        // Ignore sec_bands fetch failure; fallback below
                    }

                    // Also supplement from historyData if available
                    if (historyData) {
                        const allH = [...(historyData.highs || []), ...(historyData.lows || [])];
                        for (const h of allH) {
                            if (h.circuit_band === "No Band") {
                                if (!universeSymbols || universeSymbols.has(h.clean_symbol)) {
                                    fnoSet.add(h.clean_symbol);
                                }
                            }
                        }
                    }

                    if (isMounted) {
                        setIndexSets({
                            nifty50: n50,
                            nifty500: n500,
                            midcap: mid,
                            smallcap: small,
                            fno: fnoSet,
                        });
                    }
                }
            } catch (err) {
                console.warn("Could not fetch index sets from market_status_latest.json:", err);
            }
        }

        fetchUniverseAndIndices();
        return () => {
            isMounted = false;
        };
    }, [historyData, initialFallbackItems]);

    // 3. User Controls State
    const [viewMode, setViewMode] = useState<ViewMode>("focus");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedSector, setSelectedSector] = useState<string>("all");
    const [activePreset, setActivePreset] = useState<StretchPreset>("all");
    const [filters, setFilters] = useState<StretchFilterState>(DEFAULT_FILTER_STATE);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Sorting & Pagination
    const [sortField, setSortField] = useState<StretchSortField>("daily_s20");
    const [sortAsc, setSortAsc] = useState<boolean>(false);
    const [pageSize, setPageSize] = useState<number>(50);
    const [currentPage, setCurrentPage] = useState<number>(1);

    // Modal state
    const [selectedStockForModal, setSelectedStockForModal] = useState<EMAStretchUniverseItem | null>(null);

    // Clipboard and export notifications
    const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null);
    const [copyTvToast, setCopyTvToast] = useState<string | null>(null);

    // Custom Presets State (localStorage)
    const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
    const [activeCustomPresetId, setActiveCustomPresetId] = useState<string | null>(null);
    const [newPresetName, setNewPresetName] = useState("");
    const [showSaveInput, setShowSaveInput] = useState(false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    setCustomPresets(parsed);
                }
            }
        } catch (e) {
            console.warn("Could not read custom presets from localStorage:", e);
        }
    }, []);

    const handleSaveCustomPreset = () => {
        if (!newPresetName.trim()) return;
        const preset: CustomPreset = {
            id: `preset_${Date.now()}`,
            name: newPresetName.trim(),
            filters: { ...filters },
            createdAt: Date.now(),
        };
        const updated = [preset, ...customPresets.filter((p) => p.name !== preset.name)];
        setCustomPresets(updated);
        setActiveCustomPresetId(preset.id);
        setNewPresetName("");
        setShowSaveInput(false);
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {
            console.warn("Could not save preset to localStorage:", e);
        }
    };

    const handleDeleteCustomPreset = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = customPresets.filter((p) => p.id !== id);
        setCustomPresets(updated);
        if (activeCustomPresetId === id) {
            setActiveCustomPresetId(null);
        }
        try {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        } catch (err) {
            console.warn("Could not delete preset from localStorage:", err);
        }
    };

    const handleApplyCustomPreset = (preset: CustomPreset) => {
        setFilters(preset.filters);
        setActivePreset("all");
        setActiveCustomPresetId(preset.id);
        setCurrentPage(1);
    };

    const handleResetFilters = () => {
        setFilters(DEFAULT_FILTER_STATE);
        setActivePreset("all");
        setActiveCustomPresetId(null);
        setSearchQuery("");
        setSelectedSector("all");
        setCurrentPage(1);
    };

    const handleSelectPreset = (preset: StretchPreset) => {
        setActivePreset(preset);
        setActiveCustomPresetId(null);
        setCurrentPage(1);
        if (preset !== "all") {
            // Reset conflicting micro-sliders while preserving macro universe & liquidity gates
            setFilters((prev) => ({
                ...prev,
                dailyStretchMin: null,
                dailyStretchMax: null,
                weeklyPercentileMin: null,
                velocityDirection: "all",
                landingProximity: "all",
                squeezeOnly: false,
                monthlyTrend: "any",
                weeklyTrend: "any",
                dailyTrend: "any",
            }));
        }
    };

    // Extract unique sectors/themes
    const uniqueSectors = useMemo(() => {
        const sectors = new Set<string>();
        for (const item of universeItems) {
            if (item.sector) sectors.add(item.sector);
            if (item.themes) {
                for (const t of item.themes) sectors.add(t);
            }
        }
        return Array.from(sectors).sort();
    }, [universeItems]);

    // Active power filter count
    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filters.indexUniverse !== "all") count++;
        if (filters.minTurnoverCr > 0) count++;
        if (filters.dailyStretchMin !== null || filters.dailyStretchMax !== null) count++;
        if (filters.weeklyPercentileMin !== null) count++;
        if (filters.velocityDirection !== "all") count++;
        if (filters.landingProximity !== "all") count++;
        if (filters.squeezeOnly) count++;
        if (filters.targetAnchor !== "ema_20") count++;
        if (filters.targetTimeframe !== "daily") count++;
        if (filters.monthlyTrend !== "any") count++;
        if (filters.weeklyTrend !== "any") count++;
        if (filters.dailyTrend !== "any") count++;
        return count;
    }, [filters]);

    // Preset matching helpers
    const matchesPreset = useCallback((item: EMAStretchUniverseItem, preset: StretchPreset): boolean => {
        const m = item.ema_stretch;
        if (!m) return false;

        const d8 = m.daily?.ema_8 ?? m.daily?.ema_10;
        const d20 = m.daily?.ema_20;
        const d50 = m.daily?.ema_50;
        const w20 = m.weekly?.ema_20;
        const w50 = m.weekly?.ema_50;
        const m20 = m.monthly?.ema_20;
        const vel = m.velocity ?? 0;
        const close = item.close ?? 0;

        switch (preset) {
            case "holy_grail": {
                // Monthly Bull + Weekly Bull + Daily resting at 20 EMA (-0.5 to +0.8 ATR) and vel >= 0
                if (!m20?.is_above || !w20?.is_above) return false;
                if (vel < 0) return false;
                const dStretchSigned = d20 ? (d20.is_above ? d20.stretch_atr : -d20.stretch_atr) : 99;
                return dStretchSigned >= -0.5 && dStretchSigned <= 0.8;
            }
            case "support_50": {
                // Monthly Bull + Daily or Weekly resting within +/-0.8 ATR of 50 EMA
                if (!m20?.is_above) return false;
                const d50Signed = d50 ? (d50.is_above ? d50.stretch_atr : -d50.stretch_atr) : 99;
                const w50Signed = w50 ? (w50.is_above ? w50.stretch_atr : -w50.stretch_atr) : 99;
                const dNear = Math.abs(d50Signed) <= 0.8;
                const wNear = Math.abs(w50Signed) <= 0.8;
                return dNear || wNear;
            }
            case "cpr_bounce": {
                // Monthly or Weekly Bull + Price resting within +/-1.5% of Monthly Central Pivot (P)
                if (!m20?.is_above && !w20?.is_above) return false;
                const pivot = m.landing_cpr_pivot ?? m.landing_cpr_top;
                if (pivot == null || close <= 0) return false;
                const distPct = Math.abs(((close - pivot) / pivot) * 100);
                return distPct <= 1.5;
            }
            case "momentum_8": {
                // Daily resting on 8 EMA (within +/-0.8 ATR) with positive velocity (Vt > 0)
                if (vel <= 0) return false;
                const d8Signed = d8 ? (d8.is_above ? d8.stretch_atr : -d8.stretch_atr) : 99;
                return Math.abs(d8Signed) <= 0.8;
            }
            case "hook": {
                // Daily stretch >= +P90 with kinetic velocity rollover (Vt < 0) or is_exhaustion_hook flag
                return Boolean(m.is_exhaustion_hook || (d20?.is_above && (d20?.percentile ?? 0) >= 90 && vel < 0));
            }
            case "climax": {
                // Triple Climax: Daily, Weekly, Monthly all >= P90
                return Boolean(
                    d20?.is_above && (d20?.percentile ?? 0) >= 90 &&
                    w20?.is_above && (w20?.percentile ?? 0) >= 90 &&
                    m20?.is_above && ((m20?.percentile ?? 0) >= 90 || (m20?.percentile ?? 0) >= 85 || m20.stretch_atr >= 2.5)
                );
            }
            case "squeeze": {
                // Bollinger Band inside Keltner Channel
                return Boolean(
                    m.is_squeeze || (m.sbs_score != null && m.sbs_score >= 8.0)
                );
            }
            case "thrust": {
                // Momentum Thrust: Daily >= +P90 + Accelerating velocity Vt > +0.20 ATR/d
                return Boolean(
                    d20?.is_above && (d20?.percentile ?? 0) >= 90 && vel > 0.20
                );
            }
            case "landing": {
                // In Landing Zone: Distance to EMA 20 within [-2.0%, +1.0%]
                const dist = getEmaDistancePct(item, "ema_20", "daily");
                return dist != null && dist >= -2.0 && dist <= 1.0;
            }
            case "all":
            default:
                return true;
        }
    }, []);

    // Base filtered items (applying search, sector, and power drawer filters)
    const baseFilteredItems = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return universeItems.filter((item) => {
            // Search query
            if (query) {
                const sym = item.clean_symbol.toLowerCase();
                const themeTitle = stockSearchIndex[item.clean_symbol]?.[0]?.title || "";
                const name = (item.name || themeTitle).toLowerCase();
                if (!sym.includes(query) && !name.includes(query)) return false;
            }

            // Sector filter
            if (selectedSector !== "all") {
                const matchesSec = item.sector === selectedSector || (item.themes && item.themes.includes(selectedSector));
                if (!matchesSec) return false;
            }

            // Power Filter Drawer controls
            if (!matchesPowerFilters(item, filters, indexSets)) {
                return false;
            }

            return true;
        });
    }, [universeItems, searchQuery, selectedSector, filters, indexSets, stockSearchIndex]);

    // Dynamic preset counts reflecting current universe, search, sector & liquidity filters
    const presetCounts = useMemo(() => {
        const counts: Record<StretchPreset, number> = {
            all: baseFilteredItems.length,
            holy_grail: 0,
            support_50: 0,
            cpr_bounce: 0,
            momentum_8: 0,
            hook: 0,
            climax: 0,
            squeeze: 0,
            thrust: 0,
            landing: 0,
        };
        for (const item of baseFilteredItems) {
            if (matchesPreset(item, "holy_grail")) counts.holy_grail++;
            if (matchesPreset(item, "support_50")) counts.support_50++;
            if (matchesPreset(item, "cpr_bounce")) counts.cpr_bounce++;
            if (matchesPreset(item, "momentum_8")) counts.momentum_8++;
            if (matchesPreset(item, "hook")) counts.hook++;
            if (matchesPreset(item, "climax")) counts.climax++;
            if (matchesPreset(item, "squeeze")) counts.squeeze++;
            if (matchesPreset(item, "thrust")) counts.thrust++;
            if (matchesPreset(item, "landing")) counts.landing++;
        }
        return counts;
    }, [baseFilteredItems, matchesPreset]);

    // Final filtered items (further filtered by active confluence preset)
    const filteredItems = useMemo(() => {
        if (activePreset === "all") return baseFilteredItems;
        return baseFilteredItems.filter((item) => matchesPreset(item, activePreset));
    }, [baseFilteredItems, activePreset, matchesPreset]);

    // Sort items
    const sortedItems = useMemo(() => {
        return [...filteredItems].sort((a, b) => {
            let valA = 0;
            let valB = 0;
            switch (sortField) {
                case "symbol":
                    return sortAsc
                        ? a.clean_symbol.localeCompare(b.clean_symbol)
                        : b.clean_symbol.localeCompare(a.clean_symbol);
                case "pct_1d":
                    valA = a.pct_1d ?? 0;
                    valB = b.pct_1d ?? 0;
                    break;
                case "turnover":
                    valA = a.turnover_cr ?? 0;
                    valB = b.turnover_cr ?? 0;
                    break;
                case "daily_s20":
                    valA = a.ema_stretch?.daily?.ema_20?.stretch_atr ?? 0;
                    if (!a.ema_stretch?.daily?.ema_20?.is_above) valA = -valA;
                    valB = b.ema_stretch?.daily?.ema_20?.stretch_atr ?? 0;
                    if (!b.ema_stretch?.daily?.ema_20?.is_above) valB = -valB;
                    break;
                case "weekly_s20":
                    valA = a.ema_stretch?.weekly?.ema_20?.stretch_atr ?? 0;
                    if (!a.ema_stretch?.weekly?.ema_20?.is_above) valA = -valA;
                    valB = b.ema_stretch?.weekly?.ema_20?.stretch_atr ?? 0;
                    if (!b.ema_stretch?.weekly?.ema_20?.is_above) valB = -valB;
                    break;
                case "monthly_s20":
                    valA = a.ema_stretch?.monthly?.ema_20?.stretch_atr ?? 0;
                    if (!a.ema_stretch?.monthly?.ema_20?.is_above) valA = -valA;
                    valB = b.ema_stretch?.monthly?.ema_20?.stretch_atr ?? 0;
                    if (!b.ema_stretch?.monthly?.ema_20?.is_above) valB = -valB;
                    break;
                case "velocity":
                    valA = a.ema_stretch?.velocity ?? 0;
                    valB = b.ema_stretch?.velocity ?? 0;
                    break;
                case "landing_dist": {
                    const fallback = sortAsc ? Infinity : -Infinity;
                    valA = getEmaDistancePct(a, filters.targetAnchor, filters.targetTimeframe) ?? fallback;
                    valB = getEmaDistancePct(b, filters.targetAnchor, filters.targetTimeframe) ?? fallback;
                    break;
                }
            }
            return sortAsc ? valA - valB : valB - valA;
        });
    }, [filteredItems, sortField, sortAsc, filters.targetAnchor, filters.targetTimeframe]);

    // Pagination
    const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
    const paginatedItems = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedItems.slice(start, start + pageSize);
    }, [sortedItems, currentPage, pageSize]);

    const handleSort = (field: StretchSortField) => {
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(false);
        }
        setCurrentPage(1);
    };

    const copyToClipboard = (text: string, cleanSym: string) => {
        if (navigator?.clipboard) {
            navigator.clipboard.writeText(text);
            setCopiedSymbol(cleanSym);
            setTimeout(() => setCopiedSymbol(null), 1500);
        }
    };

    // Copy TradingView tickers for all filtered items
    const handleCopyTradingViewTickers = () => {
        if (!filteredItems || filteredItems.length === 0 || typeof navigator === "undefined" || !navigator.clipboard) return;
        const tickers = filteredItems.map((item) => `NSE:${item.clean_symbol}`).join(",");
        navigator.clipboard.writeText(tickers)
            .then(() => {
                setCopyTvToast(`Copied ${filteredItems.length} tickers for TradingView!`);
                setTimeout(() => setCopyTvToast(null), 2500);
            })
            .catch((err) => {
                console.warn("Could not copy tickers via clipboard API:", err);
            });
    };

    // CSV Export
    const handleExportCsv = () => {
        if (filteredItems.length === 0) return;
        const headers = [
            "Symbol",
            "Name",
            "Sector",
            "Price",
            "1D %",
            "Turnover (Cr)",
            "Setup Verdict",
            "Daily 8 ATR",
            "Daily 8 %ile",
            "Daily 20 ATR",
            "Daily 20 %ile",
            "Daily 50 ATR",
            "Daily 50 %ile",
            "Weekly 20 ATR",
            "Weekly 20 %ile",
            "Monthly 20 ATR",
            "Monthly 20 %ile",
            "Velocity (ATR/d)",
            "Decay Mode",
            "Target Anchor Level",
            "Distance to Support %",
        ];

        const rows = filteredItems.map((item) => {
            const m = item.ema_stretch;
            const verdict = getSetupVerdict(m);
            const anchorInfo = getEmaAnchorInfo(item, filters.targetAnchor, filters.targetTimeframe);
            const d8 = m?.daily?.ema_8 ?? m?.daily?.ema_10;
            const d20 = m?.daily?.ema_20;
            const d50 = m?.daily?.ema_50;
            const w20 = m?.weekly?.ema_20;
            const m20 = m?.monthly?.ema_20;

            return [
                item.clean_symbol,
                `"${(item.name || stockSearchIndex[item.clean_symbol]?.[0]?.title || "").replace(/"/g, '""')}"`,
                `"${(item.sector || "").replace(/"/g, '""')}"`,
                item.close != null ? item.close.toFixed(2) : "",
                item.pct_1d != null ? item.pct_1d.toFixed(2) : "",
                item.turnover_cr != null ? item.turnover_cr.toFixed(2) : "",
                `"${verdict.badge.replace(/"/g, '""')}"`,
                d8 ? (d8.is_above ? d8.stretch_atr : -d8.stretch_atr).toFixed(2) : "",
                d8?.percentile_str?.replace(/\*/g, "").trim() ?? "",
                d20 ? (d20.is_above ? d20.stretch_atr : -d20.stretch_atr).toFixed(2) : "",
                d20?.percentile_str?.replace(/\*/g, "").trim() ?? "",
                d50 ? (d50.is_above ? d50.stretch_atr : -d50.stretch_atr).toFixed(2) : "",
                d50?.percentile_str?.replace(/\*/g, "").trim() ?? "",
                w20 ? (w20.is_above ? w20.stretch_atr : -w20.stretch_atr).toFixed(2) : "",
                w20?.percentile_str?.replace(/\*/g, "").trim() ?? "",
                m20 ? (m20.is_above ? m20.stretch_atr : -m20.stretch_atr).toFixed(2) : "",
                m20?.percentile_str?.replace(/\*/g, "").trim() ?? "",
                m?.velocity != null ? m.velocity.toFixed(2) : "",
                m?.decay_mode ?? "",
                anchorInfo.level != null ? anchorInfo.level.toFixed(2) : "",
                anchorInfo.distancePct != null ? anchorInfo.distancePct.toFixed(2) : "",
            ].join(",");
        });

        const csvString = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `ema_stretch_${activePreset}_${latestDate || "scan"}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Compact Cell Chip Renderer (Cleaned of asterisks & trailing noise)
    const renderMiniChip = (cell: EMAStretchCell | undefined, label: string) => {
        if (!cell) {
            return (
                <div className="flex flex-col items-center justify-center p-1 rounded bg-[#111118] border border-gray-800 text-[10px] text-gray-500 font-mono">
                    <span>{label}</span>
                    <span>—</span>
                </div>
            );
        }

        const isIpo = cell.percentile_str === "IPO" || cell.color_tier === "ipo";
        const isExtremePos = !isIpo && (cell.color_tier === "extreme_pos" || (cell.is_above && (cell.percentile ?? 0) >= 95));
        const isPos = !isIpo && cell.is_above;
        const isExtremeNeg = !isIpo && (cell.color_tier === "extreme_neg" || (!cell.is_above && (cell.percentile ?? 0) >= 70));
        const isNeg = !isIpo && !cell.is_above;

        let bg = "bg-[#181824] text-gray-300 border-gray-800";
        if (isIpo) {
            bg = "bg-[#181824] text-gray-400 border-gray-800";
        } else if (isExtremePos) {
            bg = "bg-[#670038] text-[#fce7f3] border-[#8a144e]";
        } else if (isPos) {
            bg = "bg-[#38062b] text-[#fbcfe8] border-[#581845]";
        } else if (isExtremeNeg) {
            bg = "bg-[#071d3b] text-[#7dd3fc] border-[#0369a1]";
        } else if (isNeg) {
            bg = "bg-[#0a1c38] text-[#93c5fd] border-[#1e3a5f]";
        }

        const valAbs = cell.stretch_atr;
        const valStr = Number.isInteger(valAbs) ? `${valAbs}` : valAbs.toFixed(1);
        const dirSign = cell.is_above ? "▲" : "▼";
        const cleanPct = (cell.percentile_str || "").replace(/\*/g, "").trim();

        return (
            <div
                className={`flex flex-col items-center justify-center px-1.5 py-0.5 rounded border text-[10px] font-mono leading-tight whitespace-nowrap ${bg}`}
                title={`${label}: ${cell.is_above ? "+" : "-"}${valStr} ATR (${cleanPct})`}
            >
                <div className="text-[9px] text-gray-400 font-sans">{label}</div>
                <div className="font-semibold whitespace-nowrap flex items-center justify-center gap-0.5">
                    <span className="text-[8px]">{dirSign}</span>
                    <span>{valStr}A</span>
                </div>
                <div className={`text-[9px] font-bold ${isIpo ? "text-amber-400" : ""}`}>{cleanPct}</div>
            </div>
        );
    };

    // Focus Mode Primary Anchor Card (Daily 20, Weekly 20, Monthly 20)
    const renderFocusAnchorChip = (cell: EMAStretchCell | undefined, label: string, forceIpo: boolean = false) => {
        if (!cell) {
            return (
                <div className="flex flex-col items-center justify-center px-2 py-1 rounded bg-[#111118] border border-gray-800 text-[10px] text-gray-500 font-mono min-w-[76px]">
                    <span className="text-[9px] text-gray-500 font-sans">{label}</span>
                    <span>—</span>
                </div>
            );
        }

        const isIpo = forceIpo || cell.percentile_str === "IPO" || cell.color_tier === "ipo";
        const isExtremePos = !isIpo && (cell.color_tier === "extreme_pos" || (cell.is_above && (cell.percentile ?? 0) >= 95));
        const isPos = !isIpo && cell.is_above;
        const isExtremeNeg = !isIpo && (cell.color_tier === "extreme_neg" || (!cell.is_above && (cell.percentile ?? 0) >= 70));
        const isNeg = !isIpo && !cell.is_above;

        let bg = "bg-[#181824] text-gray-300 border-gray-800";
        if (isIpo) {
            bg = "bg-[#181824] text-gray-400 border-gray-800";
        } else if (isExtremePos) {
            bg = "bg-[#670038] text-[#fce7f3] border-[#8a144e]";
        } else if (isPos) {
            bg = "bg-[#38062b] text-[#fbcfe8] border-[#581845]";
        } else if (isExtremeNeg) {
            bg = "bg-[#071d3b] text-[#7dd3fc] border-[#0369a1]";
        } else if (isNeg) {
            bg = "bg-[#0a1c38] text-[#93c5fd] border-[#1e3a5f]";
        }

        const valAbs = cell.stretch_atr;
        const valStr = Number.isInteger(valAbs) ? `${valAbs}.0` : valAbs.toFixed(1);
        const dirSign = cell.is_above ? "▲ +" : "▼ -";
        const cleanPct = isIpo ? "IPO" : (cell.percentile_str || (cell.percentile != null ? `${cell.is_above ? "+P" : "-P"}${cell.percentile}` : "")).replace(/\*/g, "").trim();

        return (
            <div
                className={`flex flex-col items-center justify-center px-2 py-1 rounded-lg border font-mono text-[11px] leading-tight min-w-[80px] transition-all hover:scale-105 shadow-sm ${bg}`}
                title={`${label}: ${dirSign}${valStr} ATR (${cleanPct})`}
            >
                <div className="text-[9px] text-gray-400 font-sans tracking-wide">{label}</div>
                <div className="font-bold flex items-center justify-center gap-0.5 text-xs whitespace-nowrap mt-0.5">
                    <span>{dirSign}{valStr} ATR</span>
                </div>
                <div className={`text-[10px] font-bold mt-0.5 ${isIpo ? "text-amber-400" : ""}`}>{cleanPct}</div>
            </div>
        );
    };

    // 2-Tier MTF Confluence Bar: Tier 1 Pill + Tier 2 Micro-Badges [1D glyph] [1W glyph] [1M glyph]
    const renderMtfConfluenceBar = (m: EMAStretchMatrix | undefined, close: number = 0) => {
        if (!m) return <span className="text-gray-500 font-mono text-[10px]">—</span>;

        const isWeeklyIpo = m.weekly?.ema_20?.percentile_str === "IPO" || m.weekly?.ema_20?.color_tier === "ipo";
        const d8 = m.daily?.ema_8 ?? m.daily?.ema_10;
        const w8 = m.weekly?.ema_8 ?? m.weekly?.ema_10;
        const m8 = m.monthly?.ema_8 ?? m.monthly?.ema_10;

        const dGlyph = getTfMicroGlyph(d8, m.daily?.ema_20, m.daily?.ema_50);
        const wGlyph = getTfMicroGlyph(w8, m.weekly?.ema_20, m.weekly?.ema_50);
        const mGlyph = getTfMicroGlyph(m8, m.monthly?.ema_20, m.monthly?.ema_50, isWeeklyIpo);

        const status = getMtfConfluenceStatus(m, close);

        const d20 = m.daily?.ema_20;
        const w20 = m.weekly?.ema_20;
        const m20 = m.monthly?.ema_20;

        const calcDistStr = (lvl: number | null | undefined) => {
            if (close <= 0 || lvl == null || lvl <= 0) return null;
            const dist = ((close - lvl) / lvl) * 100;
            return `${dist >= 0 ? "+" : ""}${dist.toFixed(1)}%`;
        };

        const dDist = calcDistStr(m.landing_ema_20 ?? d20?.ema_val);
        const wDist = calcDistStr(w20?.ema_val);
        const mDist = calcDistStr(m20?.ema_val);

        const d20Str = d20 ? `${dDist ? `${dDist} · ` : ""}${d20.is_above ? "+" : "-"}${d20.stretch_atr.toFixed(1)} ATR (${d20.percentile_str || ""})` : "—";
        const w20Str = w20 ? `${wDist ? `${wDist} · ` : ""}${w20.is_above ? "+" : "-"}${w20.stretch_atr.toFixed(1)} ATR (${w20.percentile_str || ""})` : "—";
        const m20Str = m20 ? `${mDist ? `${mDist} · ` : ""}${m20.is_above ? "+" : "-"}${m20.stretch_atr.toFixed(1)} ATR (${m20.percentile_str || ""})` : "—";

        const popoverTitle = `MTF Confluence: ${status.text}\n• 1D: ${dGlyph.detail} [${d20Str}]\n• 1W: ${wGlyph.detail} [${w20Str}]\n• 1M: ${mGlyph.detail} [${m20Str}]`;

        return (
            <div className="flex flex-col items-center gap-1 cursor-help group/mtf relative" title={popoverTitle}>
                {/* Tier 1: Confluence status pill */}
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${status.style}`}>
                    {status.text}
                </span>

                {/* Tier 2: Interactive micro-badges with directional glyphs */}
                <div className="inline-flex items-center gap-1 font-mono text-[9px]">
                    <span className={`px-1 py-0.2 rounded font-bold border ${dGlyph.style}`} title={`1D: ${dGlyph.detail}`}>
                        1D {dGlyph.glyph}
                    </span>
                    <span className={`px-1 py-0.2 rounded font-bold border ${wGlyph.style}`} title={`1W: ${wGlyph.detail}`}>
                        1W {wGlyph.glyph}
                    </span>
                    <span className={`px-1 py-0.2 rounded font-bold border ${mGlyph.style}`} title={`1M: ${mGlyph.detail}`}>
                        1M {mGlyph.glyph}
                    </span>
                </div>
            </div>
        );
    };

    // Actionable Dynamic Landing Zone Proximity Badge
    const renderLandingProximityBadge = (item: EMAStretchUniverseItem) => {
        const info = getEmaAnchorInfo(item, filters.targetAnchor, filters.targetTimeframe);
        const dist = info.distancePct;
        const landing = info.level;
        if (dist == null || landing == null) {
            return <span className="text-gray-500 font-mono text-[11px]">—</span>;
        }

        let badgeStyle = "bg-gray-800 text-gray-300 border-gray-700";
        let label = `${dist >= 0 ? "+" : ""}${dist.toFixed(1)}%`;
        let desc = "Near Support";

        if (dist >= -1.5 && dist <= 0.5) {
            badgeStyle = "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.15)]";
            desc = "At Support";
        } else if (dist > 0.5 && dist <= 2.0) {
            badgeStyle = "bg-emerald-900/30 text-emerald-300 border-emerald-700/40";
            desc = "Near Support";
        } else if (dist >= -3.0 && dist < -1.5) {
            badgeStyle = "bg-sky-500/20 text-sky-300 border-sky-500/40";
            desc = "Mild Dip";
        } else if (dist > 5.0) {
            badgeStyle = "bg-amber-500/20 text-amber-300 border-amber-500/40";
            desc = "Extended";
        } else if (dist > 2.0 && dist <= 5.0) {
            badgeStyle = "bg-indigo-950/40 text-indigo-300 border-indigo-700/40";
            desc = "Stretched";
        } else if (dist < -5.0) {
            badgeStyle = "bg-rose-500/20 text-rose-300 border-rose-500/40";
            desc = "Deep Dip";
        } else if (dist < -3.0 && dist >= -5.0) {
            badgeStyle = "bg-slate-800 text-slate-300 border-slate-700";
            desc = "Pullback";
        }

        return (
            <div className="flex flex-col items-end font-mono">
                <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] border whitespace-nowrap ${badgeStyle}`}
                    title={`Distance to ${info.label} (${desc}): ${dist >= 0 ? "+" : ""}${dist.toFixed(2)}% (Level: ₹${landing.toFixed(2)})`}
                >
                    <span>{dist >= 0 ? "▲" : "▼"}</span>
                    <span>{label}</span>
                </span>
                <span className="text-[10px] text-cyan-300/80 mt-0.5 flex items-center gap-1">
                    <span className="text-[9px] text-gray-500 font-sans">{info.label}:</span>
                    <span>₹{landing.toFixed(2)}</span>
                </span>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {/* 1. Header & System Intro Banner */}
            <div className="bg-[#12121d] border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-[#581845]/30 border border-[#8a246a]/50 text-[#ffb3d9]">
                        <Zap className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                                EMA Stretch Matrix Hub
                                <span className="text-xs px-2 py-0.5 rounded font-sans font-semibold bg-[#38062b] text-[#f3e8ff] border border-[#670038]">
                                    Institutional Multi-Timeframe Telemetry
                                </span>
                            </h2>
                            {latestDate && (
                                <span className="text-xs text-gray-400 font-mono bg-gray-800/80 px-2 py-0.5 rounded border border-gray-700">
                                    {latestDate}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                            ATR-normalized stretch across Daily, Weekly, and Monthly EMAs with kinetic velocity vectors and execution landing zones.
                        </p>
                    </div>
                </div>

                {/* Bulk Actions & View Mode Toggle */}
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* View Mode Toggle */}
                    <div className="flex items-center bg-[#0a0a10] p-0.5 rounded-lg border border-gray-800">
                        <button
                            type="button"
                            onClick={() => setViewMode("focus")}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                                viewMode === "focus"
                                    ? "bg-blue-600 text-white shadow"
                                    : "text-gray-400 hover:text-gray-200"
                            }`}
                            title="Focus Mode: 3 Core Anchors (Daily 20, Weekly 20, Monthly 20) with MTF Confluence Bar"
                        >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Focus (3 Anchors)</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode("matrix")}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                                viewMode === "matrix"
                                    ? "bg-blue-600 text-white shadow"
                                    : "text-gray-400 hover:text-gray-200"
                            }`}
                            title="Full Matrix Mode: All 9 cells (10 / 20 / 50 across Daily, Weekly, Monthly)"
                        >
                            <TableIcon className="w-3.5 h-3.5" />
                            <span>Full Matrix (9 Cells)</span>
                        </button>
                    </div>

                    {/* Copy TradingView Tickers */}
                    <button
                        type="button"
                        onClick={handleCopyTradingViewTickers}
                        disabled={filteredItems.length === 0}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        title="Copy comma-separated ticker list for TradingView watchlists"
                    >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy TV Tickers</span>
                    </button>

                    {/* Export CSV */}
                    <button
                        type="button"
                        onClick={handleExportCsv}
                        disabled={filteredItems.length === 0}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        title="Download filtered matrix results to CSV"
                    >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export CSV</span>
                    </button>

                    {/* Open in RRG */}
                    {onOpenInRRG && filteredItems.length > 0 && (
                        <button
                            type="button"
                            onClick={() => onOpenInRRG(filteredItems.slice(0, 30).map((i) => i.symbol), `Stretch: ${activePreset}`)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition-colors flex items-center gap-1.5"
                        >
                            <Compass className="w-3.5 h-3.5" />
                            <span>Open Top 30 in RRG</span>
                        </button>
                    )}

                    {/* Save Watchlist */}
                    {onSaveAsWatchlist && filteredItems.length > 0 && (
                        <button
                            type="button"
                            onClick={() => onSaveAsWatchlist(`Stretch ${activePreset} (${latestDate})`, filteredItems.slice(0, 50).map((i) => i.symbol), "EMA Stretch Scans")}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors flex items-center gap-1.5"
                        >
                            <Layers className="w-3.5 h-3.5" />
                            <span>Save Watchlist ({Math.min(50, filteredItems.length)})</span>
                        </button>
                    )}
                </div>
            </div>

            {/* TradingView Copy Toast Notification */}
            {copyTvToast && (
                <div className="bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center justify-between shadow-lg animate-in fade-in duration-150">
                    <span className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        {copyTvToast}
                    </span>
                    <button type="button" onClick={() => setCopyTvToast(null)} className="text-white/80 hover:text-white">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* 2. Expanded Confluence Presets (8 Strategy Presets) & Power Drawer Trigger */}
            <div className="flex flex-wrap gap-2 items-center justify-between bg-[#111118] p-2.5 rounded-xl border border-gray-800">
                <div className="flex flex-wrap gap-2 items-center">
                    {/* 1. All Stocks */}
                    <button
                        type="button"
                        onClick={() => handleSelectPreset("all")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            activePreset === "all"
                                ? "bg-blue-600 text-white shadow-md"
                                : "bg-gray-800/60 text-gray-400 hover:text-white hover:bg-gray-800"
                        }`}
                    >
                        <span>All Stocks</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                            {presetCounts.all}
                        </span>
                    </button>

                    {/* 2. Holy Grail (Bull Dip-Buy) */}
                    <button
                        type="button"
                        onClick={() => handleSelectPreset("holy_grail")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            activePreset === "holy_grail"
                                ? "bg-emerald-600 text-white shadow-md border border-emerald-400"
                                : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30"
                        }`}
                        title="Monthly Bull + Weekly Bull + Daily resting at 20 EMA (-0.5 to +0.8 ATR) with positive velocity"
                    >
                        <Target className="w-3.5 h-3.5 text-emerald-400" />
                        <span>🎯 Holy Grail</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                            {presetCounts.holy_grail}
                        </span>
                    </button>

                    {/* 3. 50 EMA Support */}
                    <button
                        type="button"
                        onClick={() => handleSelectPreset("support_50")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            activePreset === "support_50"
                                ? "bg-blue-600 text-white shadow-md border border-blue-400"
                                : "bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 border border-blue-500/30"
                        }`}
                        title="Monthly Bull + Daily or Weekly resting at 50 EMA (+/-0.8 ATR)"
                    >
                        <Shield className="w-3.5 h-3.5 text-blue-400" />
                        <span>🛡️ 50 EMA Support</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                            {presetCounts.support_50}
                        </span>
                    </button>

                    {/* 4. CPR Pivot Bounce */}
                    <button
                        type="button"
                        onClick={() => handleSelectPreset("cpr_bounce")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            activePreset === "cpr_bounce"
                                ? "bg-indigo-600 text-white shadow-md border border-indigo-400"
                                : "bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 border border-indigo-500/30"
                        }`}
                        title="Monthly or Weekly Bull + Price resting within +/-1.5% of Monthly Central Pivot (P)"
                    >
                        <span>🏛️</span>
                        <span>CPR Pivot Bounce</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                            {presetCounts.cpr_bounce}
                        </span>
                    </button>

                    {/* 5. 8 EMA Momentum Flag */}
                    <button
                        type="button"
                        onClick={() => handleSelectPreset("momentum_8")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            activePreset === "momentum_8"
                                ? "bg-purple-600 text-white shadow-md border border-purple-400"
                                : "bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 border border-purple-500/30"
                        }`}
                        title="Daily resting on 8 EMA (within +/-0.8 ATR) with positive velocity (Vt > 0)"
                    >
                        <span>🚀</span>
                        <span>8 EMA Momentum</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                            {presetCounts.momentum_8}
                        </span>
                    </button>

                    {/* 6. Exhaustion Hook */}
                    <button
                        type="button"
                        onClick={() => handleSelectPreset("hook")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            activePreset === "hook"
                                ? "bg-amber-600 text-white shadow-md border border-amber-400"
                                : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30"
                        }`}
                        title="Daily stretch >= +P90 with kinetic velocity rollover (Vt < 0)"
                    >
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>⚡ Exhaustion Hook</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                            {presetCounts.hook}
                        </span>
                    </button>

                    {/* 7. Triple Climax */}
                    <button
                        type="button"
                        onClick={() => handleSelectPreset("climax")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            activePreset === "climax"
                                ? "bg-[#670038] text-[#fce7f3] border border-[#8a144e] shadow-md"
                                : "bg-[#38062b]/40 text-[#fbcfe8] hover:bg-[#38062b]/80 border border-[#5a1040]/50"
                        }`}
                        title="Daily >= +P90 AND Weekly >= +P90 AND Monthly >= +P85 (Simultaneous Blow-off top)"
                    >
                        <Flame className="w-3.5 h-3.5 text-rose-400" />
                        <span>🔥 Triple Climax</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                            {presetCounts.climax}
                        </span>
                    </button>

                    {/* 8. Squeeze Expansion */}
                    <button
                        type="button"
                        onClick={() => handleSelectPreset("squeeze")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            activePreset === "squeeze"
                                ? "bg-cyan-600 text-white shadow-md border border-cyan-400"
                                : "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30"
                        }`}
                        title="Daily Stretch <= 1.0 ATR with active TTM Squeeze compression or SBS >= 8.0"
                    >
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        <span>🌀 Squeeze Expansion</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                            {presetCounts.squeeze}
                        </span>
                    </button>
                </div>

                {/* Power Filter Drawer Toggle Button */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsDrawerOpen(!isDrawerOpen)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                            isDrawerOpen || activeFilterCount > 0
                                ? "bg-cyan-600/20 text-cyan-300 border-cyan-500/50"
                                : "bg-gray-800/60 text-gray-400 hover:text-white border-gray-700"
                        }`}
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>Power Filters</span>
                        {activeFilterCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full bg-cyan-500 text-slate-950 font-mono font-bold text-[10px]">
                                {activeFilterCount}
                            </span>
                        )}
                        {isDrawerOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                </div>
            </div>

            {/* 3. Collapsible Power Filter Drawer */}
            {isDrawerOpen && (
                <div className="bg-[#12121e] border border-cyan-500/30 rounded-xl p-4 space-y-4 shadow-2xl animate-in slide-in-from-top-2 duration-150">
                    <div className="flex items-center justify-between border-b border-gray-800/80 pb-3">
                        <div className="flex items-center gap-2">
                            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                            <h3 className="text-sm font-bold text-white tracking-wide">
                                Precision Quantitative Matrix Filters
                            </h3>
                            <span className="text-[11px] text-gray-400 font-mono">
                                (Adjust multi-dimensional thresholds in real time)
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {activeFilterCount > 0 && (
                                <button
                                    type="button"
                                    onClick={handleResetFilters}
                                    className="px-2.5 py-1 text-xs rounded-lg text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors flex items-center gap-1"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Reset Filters</span>
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setIsDrawerOpen(false)}
                                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* 1. Target Pullback Anchor & MTF Regime Selection */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs pb-3 border-b border-gray-800/80">
                        {/* Target Support Anchor */}
                        <div className="space-y-1.5 bg-[#0e0e17] p-3 rounded-lg border border-gray-800">
                            <label className="font-semibold text-gray-300 block">
                                Target Support Anchor
                            </label>
                            <div className="grid grid-cols-3 gap-1 font-mono text-[10px]">
                                {[
                                    { id: "ema_8", label: "8 EMA" },
                                    { id: "ema_20", label: "20 EMA" },
                                    { id: "ema_50", label: "50 EMA" },
                                    { id: "cpr_pivot", label: "Central Pivot (P)" },
                                    { id: "any", label: "Any Support" },
                                ].map((anchor) => (
                                    <button
                                        key={anchor.id}
                                        type="button"
                                        onClick={() => {
                                            setFilters({ ...filters, targetAnchor: anchor.id as SupportAnchorTarget });
                                            setCurrentPage(1);
                                        }}
                                        className={`py-1 px-1 text-center font-semibold rounded transition-all ${
                                            anchor.id === "cpr_pivot" ? "col-span-2" : ""
                                        } ${
                                            filters.targetAnchor === anchor.id
                                                ? "bg-cyan-600 text-white shadow-sm"
                                                : "bg-[#161622] text-gray-400 hover:text-white"
                                        }`}
                                    >
                                        {anchor.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Target Timeframe */}
                        <div className="space-y-1.5 bg-[#0e0e17] p-3 rounded-lg border border-gray-800">
                            <label className="font-semibold text-gray-300 block">
                                Target Timeframe
                            </label>
                            <div className="grid grid-cols-2 gap-1 font-mono text-[11px]">
                                {[
                                    { id: "daily", label: "Daily (1D)" },
                                    { id: "weekly", label: "Weekly (1W)" },
                                ].map((tf) => (
                                    <button
                                        key={tf.id}
                                        type="button"
                                        onClick={() => {
                                            setFilters({ ...filters, targetTimeframe: tf.id as SupportTimeframeTarget });
                                            setCurrentPage(1);
                                        }}
                                        className={`py-1.5 font-semibold rounded text-center transition-all ${
                                            filters.targetTimeframe === tf.id
                                                ? "bg-cyan-600 text-white shadow-sm"
                                                : "bg-[#161622] text-gray-400 hover:text-white"
                                        }`}
                                    >
                                        {tf.label}
                                    </button>
                                ))}
                            </div>
                            <span className="text-[10px] text-gray-500 block pt-1">
                                Resolves anchor level from {filters.targetTimeframe === "daily" ? "Daily" : "Weekly"} candles.
                            </span>
                        </div>

                        {/* Independent Multi-Timeframe Trend Pickers */}
                        <div className="space-y-1.5 bg-[#0e0e17] p-3 rounded-lg border border-gray-800 md:col-span-2">
                            <label className="font-semibold text-gray-300 block">
                                Independent MTF Trend Pickers (Price vs 20 EMA)
                            </label>
                            <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
                                {/* Monthly */}
                                <div className="space-y-1 bg-[#161622] p-2 rounded border border-gray-800">
                                    <span className="text-gray-400 font-sans block text-[10px]">Monthly (1M)</span>
                                    <div className="grid grid-cols-3 gap-1">
                                        {(["any", "bull", "bear"] as const).map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => {
                                                    setFilters({ ...filters, monthlyTrend: t });
                                                    setCurrentPage(1);
                                                }}
                                                className={`py-0.5 rounded text-center font-bold ${
                                                    filters.monthlyTrend === t
                                                        ? t === "bull" ? "bg-emerald-600 text-white" : t === "bear" ? "bg-rose-600 text-white" : "bg-cyan-600 text-white"
                                                        : "bg-gray-800 text-gray-400 hover:text-white"
                                                }`}
                                            >
                                                {t === "any" ? "Any" : t === "bull" ? "🟢 Bull" : "🔴 Bear"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Weekly */}
                                <div className="space-y-1 bg-[#161622] p-2 rounded border border-gray-800">
                                    <span className="text-gray-400 font-sans block text-[10px]">Weekly (1W)</span>
                                    <div className="grid grid-cols-3 gap-1">
                                        {(["any", "bull", "bear"] as const).map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => {
                                                    setFilters({ ...filters, weeklyTrend: t });
                                                    setCurrentPage(1);
                                                }}
                                                className={`py-0.5 rounded text-center font-bold ${
                                                    filters.weeklyTrend === t
                                                        ? t === "bull" ? "bg-emerald-600 text-white" : t === "bear" ? "bg-rose-600 text-white" : "bg-cyan-600 text-white"
                                                        : "bg-gray-800 text-gray-400 hover:text-white"
                                                }`}
                                            >
                                                {t === "any" ? "Any" : t === "bull" ? "🟢 Bull" : "🔴 Bear"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Daily */}
                                <div className="space-y-1 bg-[#161622] p-2 rounded border border-gray-800">
                                    <span className="text-gray-400 font-sans block text-[10px]">Daily (1D)</span>
                                    <div className="grid grid-cols-3 gap-1">
                                        {(["any", "bull", "bear"] as const).map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => {
                                                    setFilters({ ...filters, dailyTrend: t });
                                                    setCurrentPage(1);
                                                }}
                                                className={`py-0.5 rounded text-center font-bold ${
                                                    filters.dailyTrend === t
                                                        ? t === "bull" ? "bg-emerald-600 text-white" : t === "bear" ? "bg-rose-600 text-white" : "bg-cyan-600 text-white"
                                                        : "bg-gray-800 text-gray-400 hover:text-white"
                                                }`}
                                            >
                                                {t === "any" ? "Any" : t === "bull" ? "🟢 Bull" : "🔴 Bear"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Filter Controls Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                        {/* 1. Index Universe */}
                        <div className="space-y-1.5 bg-[#0e0e17] p-3 rounded-lg border border-gray-800">
                            <label className="font-semibold text-gray-300 block">
                                Index Universe
                            </label>
                            <select
                                value={filters.indexUniverse}
                                onChange={(e) => {
                                    setFilters({ ...filters, indexUniverse: e.target.value as IndexUniverseOption });
                                    setCurrentPage(1);
                                }}
                                className="w-full bg-[#161622] border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-cyan-500"
                            >
                                <option value="all">All NSE Equities (3,000+)</option>
                                <option value="nifty50">Nifty 50 ({indexSets.nifty50.size})</option>
                                <option value="nifty500">Nifty 500 ({indexSets.nifty500.size})</option>
                                <option value="midcap">Nifty Midcap 150 ({indexSets.midcap.size})</option>
                                <option value="smallcap">Nifty Smallcap 250 ({indexSets.smallcap.size})</option>
                                <option value="fno">F&O Universe ({indexSets.fno.size})</option>
                            </select>
                        </div>

                        {/* 2. Min Turnover */}
                        <div className="space-y-1.5 bg-[#0e0e17] p-3 rounded-lg border border-gray-800">
                            <label className="font-semibold text-gray-300 block">
                                Min Daily Turnover
                            </label>
                            <div className="grid grid-cols-5 gap-1 font-mono">
                                {[0, 10, 25, 50, 100].map((cr) => (
                                    <button
                                        key={cr}
                                        type="button"
                                        onClick={() => {
                                            setFilters({ ...filters, minTurnoverCr: cr });
                                            setCurrentPage(1);
                                        }}
                                        className={`py-1 text-[11px] font-semibold rounded text-center transition-all ${
                                            filters.minTurnoverCr === cr
                                                ? "bg-cyan-600 text-white"
                                                : "bg-[#161622] text-gray-400 hover:text-white"
                                        }`}
                                    >
                                        {cr === 0 ? "All" : `₹${cr}C`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 3. Daily Stretch Range (ATR) */}
                        <div className="space-y-1.5 bg-[#0e0e17] p-3 rounded-lg border border-gray-800">
                            <div className="flex items-center justify-between">
                                <label className="font-semibold text-gray-300 block">
                                    Daily Stretch ATR Range
                                </label>
                                {(filters.dailyStretchMin !== null || filters.dailyStretchMax !== null) && (
                                    <button
                                        type="button"
                                        onClick={() => setFilters({ ...filters, dailyStretchMin: null, dailyStretchMax: null })}
                                        className="text-[10px] text-cyan-400 hover:underline"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2 font-mono">
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="Min ATR (-3)"
                                    value={filters.dailyStretchMin ?? ""}
                                    onChange={(e) => {
                                        const v = e.target.value === "" ? null : parseFloat(e.target.value);
                                        setFilters({ ...filters, dailyStretchMin: v });
                                        setCurrentPage(1);
                                    }}
                                    className="w-1/2 bg-[#161622] border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-cyan-500"
                                />
                                <span className="text-gray-500">to</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="Max ATR (+5)"
                                    value={filters.dailyStretchMax ?? ""}
                                    onChange={(e) => {
                                        const v = e.target.value === "" ? null : parseFloat(e.target.value);
                                        setFilters({ ...filters, dailyStretchMax: v });
                                        setCurrentPage(1);
                                    }}
                                    className="w-1/2 bg-[#161622] border border-gray-700 rounded px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-cyan-500"
                                />
                            </div>
                            <div className="flex items-center gap-1 font-sans text-[10px] pt-0.5">
                                <button
                                    type="button"
                                    onClick={() => setFilters({ ...filters, dailyStretchMin: -0.5, dailyStretchMax: 0.8 })}
                                    className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-cyan-300"
                                >
                                    Dip [-0.5, 0.8]
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFilters({ ...filters, dailyStretchMin: 2.0, dailyStretchMax: null })}
                                    className="px-1.5 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-rose-300"
                                >
                                    Ext [≥ +2.0]
                                </button>
                            </div>
                        </div>

                        {/* 4. Weekly Trend Strength */}
                        <div className="space-y-1.5 bg-[#0e0e17] p-3 rounded-lg border border-gray-800">
                            <label className="font-semibold text-gray-300 block">
                                Weekly Trend Strength (%ile)
                            </label>
                            <div className="grid grid-cols-3 gap-1 font-mono">
                                {[
                                    { label: "Any", val: null },
                                    { label: "≥ +P70", val: 70 },
                                    { label: "≥ +P90", val: 90 },
                                ].map((opt) => (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        onClick={() => {
                                            setFilters({ ...filters, weeklyPercentileMin: opt.val });
                                            setCurrentPage(1);
                                        }}
                                        className={`py-1 text-[11px] font-semibold rounded text-center transition-all ${
                                            filters.weeklyPercentileMin === opt.val
                                                ? "bg-cyan-600 text-white"
                                                : "bg-[#161622] text-gray-400 hover:text-white"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 5. Kinetic Velocity Vector */}
                        <div className="space-y-1.5 bg-[#0e0e17] p-3 rounded-lg border border-gray-800">
                            <label className="font-semibold text-gray-300 block">
                                Kinetic Velocity Vector (Vt)
                            </label>
                            <select
                                value={filters.velocityDirection}
                                onChange={(e) => {
                                    setFilters({ ...filters, velocityDirection: e.target.value as VelocityDirectionOption });
                                    setCurrentPage(1);
                                }}
                                className="w-full bg-[#161622] border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-cyan-500"
                            >
                                <option value="all">All Velocity Vectors</option>
                                <option value="positive">Positive (Vt &gt; 0 ATR/d)</option>
                                <option value="negative">Negative (Vt &lt; 0 ATR/d)</option>
                                <option value="accelerating">Accelerating (Vt &gt; +0.20 ATR/d)</option>
                                <option value="hook">Rolling Hook (Vt &lt; 0 at ≥ +P90)</option>
                            </select>
                        </div>

                        {/* 6. Landing Zone Proximity */}
                        <div className="space-y-1.5 bg-[#0e0e17] p-3 rounded-lg border border-gray-800">
                            <label className="font-semibold text-gray-300 block">
                                Landing Proximity ({filters.targetAnchor === "any" ? "Any Support" : filters.targetAnchor === "cpr_pivot" ? "Central Pivot" : filters.targetAnchor.toUpperCase().replace("_", " ")})
                            </label>
                            <select
                                value={filters.landingProximity}
                                onChange={(e) => {
                                    setFilters({ ...filters, landingProximity: e.target.value as LandingProximityOption });
                                    setCurrentPage(1);
                                }}
                                className="w-full bg-[#161622] border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-cyan-500"
                            >
                                <option value="all">All Proximities</option>
                                <option value="at_support">At Support ([-1.5%, +0.5%])</option>
                                <option value="near_support">Near Support ([-3.0%, +1.5%])</option>
                                <option value="extended">Extended (&gt; +5.0%)</option>
                                <option value="deep_pullback">Deep Pullback (&lt; -5.0%)</option>
                            </select>
                        </div>

                        {/* 7. Volatility Squeeze Compression */}
                        <div className="space-y-1.5 bg-[#0e0e17] p-3 rounded-lg border border-gray-800 flex flex-col justify-between">
                            <label className="font-semibold text-gray-300 block">
                                Volatility Squeeze State
                            </label>
                            <button
                                type="button"
                                onClick={() => {
                                    setFilters({ ...filters, squeezeOnly: !filters.squeezeOnly });
                                    setCurrentPage(1);
                                }}
                                className={`w-full py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 border ${
                                    filters.squeezeOnly
                                        ? "bg-cyan-600 text-white border-cyan-400"
                                        : "bg-[#161622] text-gray-400 border-gray-700 hover:text-white"
                                }`}
                            >
                                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                                <span>{filters.squeezeOnly ? "Active Squeeze Only" : "Any Volatility State"}</span>
                            </button>
                        </div>

                        {/* 8. Custom Preset Persistence */}
                        <div className="space-y-1.5 bg-[#0e0e17] p-3 rounded-lg border border-gray-800 flex flex-col justify-between">
                            <label className="font-semibold text-gray-300 block">
                                Save Filter Preset
                            </label>
                            {!showSaveInput ? (
                                <button
                                    type="button"
                                    onClick={() => setShowSaveInput(true)}
                                    className="w-full py-1.5 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-cyan-300 border border-gray-700 transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <Bookmark className="w-3.5 h-3.5" />
                                    <span>Save Active Scan</span>
                                </button>
                            ) : (
                                <div className="flex items-center gap-1.5">
                                    <input
                                        type="text"
                                        placeholder="Preset Name..."
                                        value={newPresetName}
                                        onChange={(e) => setNewPresetName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleSaveCustomPreset();
                                            if (e.key === "Escape") setShowSaveInput(false);
                                        }}
                                        className="w-full bg-[#161622] border border-cyan-500 rounded px-2 py-1 text-gray-200 text-xs focus:outline-none"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={handleSaveCustomPreset}
                                        className="p-1 rounded bg-cyan-600 text-white hover:bg-cyan-500"
                                        title="Save preset"
                                    >
                                        <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowSaveInput(false)}
                                        className="p-1 rounded bg-gray-800 text-gray-400 hover:text-white"
                                        title="Cancel"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Custom Presets Shelf */}
                    {customPresets.length > 0 && (
                        <div className="border-t border-gray-800/80 pt-3 flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-gray-400 font-semibold flex items-center gap-1">
                                <Bookmark className="w-3 h-3 text-cyan-400" />
                                Saved Custom Scans:
                            </span>
                            {customPresets.map((preset) => {
                                const isActive = activeCustomPresetId === preset.id;
                                return (
                                    <div
                                        key={preset.id}
                                        onClick={() => handleApplyCustomPreset(preset)}
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer transition-all group ${
                                            isActive
                                                ? "bg-cyan-600/30 border-cyan-400 text-white font-semibold ring-1 ring-cyan-500/50 shadow-sm"
                                                : "bg-[#161624] hover:bg-[#1f1f33] border-gray-700 text-cyan-300"
                                        }`}
                                    >
                                        <Bookmark className={`w-3 h-3 ${isActive ? "text-cyan-300 fill-cyan-300" : "text-cyan-400"}`} />
                                        <span>{preset.name}</span>
                                        <button
                                            type="button"
                                            onClick={(e) => handleDeleteCustomPreset(preset.id, e)}
                                            className="text-gray-500 hover:text-rose-400 transition-colors ml-0.5"
                                            title="Delete preset"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* 4. Search & Sector Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-[#0e0e17] p-3 rounded-xl border border-gray-800 text-xs shadow-md">
                <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search by Symbol or Name..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="w-full bg-[#161622] border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-gray-200 placeholder-gray-500 text-xs focus:outline-none focus:border-cyan-500 font-mono"
                        />
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Filter className="w-3.5 h-3.5 text-gray-500" />
                        <select
                            value={selectedSector}
                            onChange={(e) => { setSelectedSector(e.target.value); setCurrentPage(1); }}
                            className="bg-[#161622] border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-cyan-500"
                        >
                            <option value="all">All Sectors & Themes ({uniqueSectors.length})</option>
                            {uniqueSectors.map((sec) => (
                                <option key={sec} value={sec}>{sec}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-3 text-gray-400 text-xs w-full sm:w-auto justify-between sm:justify-end">
                    <span>
                        Showing <strong className="text-gray-200 font-mono">{filteredItems.length}</strong> of{" "}
                        <strong className="text-gray-400 font-mono">{universeItems.length}</strong> stocks
                    </span>
                    <div className="flex items-center gap-1.5">
                        <span className="text-gray-500">Rows:</span>
                        <select
                            value={pageSize}
                            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                            className="bg-[#161622] border border-gray-700 rounded-lg px-2 py-1 text-gray-200 text-xs"
                        >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* 5. Screener Table */}
            {isLoading ? (
                <div className="bg-[#12121d] border border-gray-800 rounded-xl p-16 text-center text-gray-400 space-y-3">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-cyan-400" />
                    <p className="text-sm font-semibold text-gray-200">Loading EMA Stretch Universe Telemetry...</p>
                    <p className="text-xs text-gray-500">Vectorizing multi-timeframe percentiles, kinetic velocity, and landing zones</p>
                </div>
            ) : sortedItems.length === 0 ? (
                <div className="bg-[#12121d] border border-gray-800 rounded-xl p-16 text-center text-gray-400 space-y-3">
                    <p className="text-base font-semibold text-gray-200">No stocks match your filter criteria</p>
                    <p className="text-xs text-gray-500">Try widening your stretch range, lowering turnover threshold, or resetting filters.</p>
                    <button
                        type="button"
                        onClick={handleResetFilters}
                        className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors inline-flex items-center gap-1.5"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset All Filters</span>
                    </button>
                </div>
            ) : (
                <div className="overflow-auto max-h-[72vh] rounded-xl border border-gray-800 bg-[#0e0e17] shadow-xl overscroll-contain relative">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead className="sticky top-0 z-20 bg-[#151522] shadow-md border-b border-gray-800">
                            <tr className="text-gray-400 font-semibold uppercase text-[10px] tracking-wider">
                                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort("symbol")}>
                                    <div className="flex items-center gap-1">
                                        <span>Symbol</span>
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th className="p-3 text-center">
                                    <span>Setup Verdict</span>
                                </th>
                                <th className="p-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort("pct_1d")}>
                                    <div className="flex items-center justify-end gap-1">
                                        <span>Price / 1D %</span>
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th className="p-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort("turnover")}>
                                    <div className="flex items-center justify-end gap-1">
                                        <span>Turnover</span>
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>

                                {viewMode === "focus" ? (
                                    <>
                                        <th className="p-3 text-center">
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span className="text-gray-300 font-semibold" title="Multi-Timeframe Trend Confluence (Price vs 20 EMA across Daily, Weekly, Monthly)">
                                                    MTF Trend
                                                </span>
                                                <span className="text-[9px] text-gray-400 font-mono font-normal tracking-tight">
                                                    [1D · 1W · 1M]
                                                </span>
                                            </div>
                                        </th>
                                        <th className="p-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort("daily_s20")}>
                                            <div className="flex items-center justify-center gap-1">
                                                <span>Daily 20 EMA</span>
                                                <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                            </div>
                                        </th>
                                        <th className="p-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort("weekly_s20")}>
                                            <div className="flex items-center justify-center gap-1">
                                                <span>Weekly 20 EMA</span>
                                                <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                            </div>
                                        </th>
                                        <th className="p-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort("monthly_s20")}>
                                            <div className="flex items-center justify-center gap-1">
                                                <span>Monthly 20 EMA</span>
                                                <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                            </div>
                                        </th>
                                        <th className="p-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort("velocity")}>
                                            <div className="flex items-center justify-center gap-1">
                                                <span>Kinetic Pulse</span>
                                                <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                            </div>
                                        </th>
                                        <th className="p-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort("landing_dist")}>
                                            <div className="flex items-center justify-end gap-1">
                                                <span>Landing Proximity</span>
                                                <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                            </div>
                                        </th>
                                    </>
                                ) : (
                                    <>
                                        <th className="p-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort("daily_s20")}>
                                            <div className="flex items-center justify-center gap-1">
                                                <span>Daily (8 / 20 / 50)</span>
                                                <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                            </div>
                                        </th>
                                        <th className="p-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort("weekly_s20")}>
                                            <div className="flex items-center justify-center gap-1">
                                                <span>Weekly (8 / 20 / 50)</span>
                                                <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                            </div>
                                        </th>
                                        <th className="p-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort("monthly_s20")}>
                                            <div className="flex items-center justify-center gap-1">
                                                <span>Monthly (8 / 20 / 50)</span>
                                                <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                            </div>
                                        </th>
                                        <th className="p-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort("velocity")}>
                                            <div className="flex items-center justify-center gap-1">
                                                <span>Kinetic Vector</span>
                                                <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                            </div>
                                        </th>
                                        <th className="p-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort("landing_dist")}>
                                            <div className="flex items-center justify-end gap-1">
                                                <span>Landing Proximity</span>
                                                <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                            </div>
                                        </th>
                                    </>
                                )}

                                <th className="p-3 text-center">
                                    <span>HUD</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/60 font-sans">
                            {paginatedItems.map((item) => {
                                const clean = item.clean_symbol;
                                const m = item.ema_stretch;
                                const companyName = item.name || stockSearchIndex[clean]?.[0]?.title;
                                const isHook = m?.is_exhaustion_hook;
                                const isCopied = copiedSymbol === clean;
                                const isInActiveWatchlist = activeWatchlistTickers.includes(item.symbol) || activeWatchlistTickers.includes(clean);
                                const verdict = getSetupVerdict(m);

                                return (
                                    <tr
                                        key={clean}
                                        className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                                        onClick={() => setSelectedStockForModal(item)}
                                    >
                                        {/* 1. Symbol & Name */}
                                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center gap-2">
                                                <div>
                                                    <div className="flex items-center gap-1.5 font-mono font-bold text-gray-100 text-xs">
                                                        <span
                                                            className="hover:text-cyan-400 cursor-pointer"
                                                            onClick={() => setSelectedStockForModal(item)}
                                                        >
                                                            {clean}
                                                        </span>
                                                        <a
                                                            href={makeTradingViewUrl(clean)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-gray-500 hover:text-cyan-300 transition-colors"
                                                            title="Open TradingView"
                                                        >
                                                            <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyToClipboard(`NSE:${clean}`, clean)}
                                                            className="text-gray-500 hover:text-gray-300"
                                                            title="Copy ticker"
                                                        >
                                                            {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                    {companyName && (
                                                        <div className="text-[11px] text-gray-400 truncate max-w-[170px]">
                                                            {companyName}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>

                                        {/* 2. Setup Verdict */}
                                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                            <div
                                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border whitespace-nowrap ${verdict.bgClass} ${verdict.textClass} ${verdict.borderClass} ${verdict.key === "hook" ? "animate-pulse" : ""}`}
                                                title={verdict.tooltip}
                                            >
                                                <span>{verdict.badge}</span>
                                            </div>
                                        </td>

                                        {/* 3. Price & 1D % */}
                                        <td className="p-3 text-right font-mono">
                                            <div className="font-semibold text-gray-200">
                                                ₹{item.close?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                            </div>
                                            <div
                                                className={`text-[11px] font-semibold ${
                                                    (item.pct_1d ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                                                }`}
                                            >
                                                {(item.pct_1d ?? 0) >= 0 ? `+${(item.pct_1d ?? 0).toFixed(2)}%` : `${(item.pct_1d ?? 0).toFixed(2)}%`}
                                            </div>
                                        </td>

                                        {/* 4. Turnover */}
                                        <td className="p-3 text-right font-mono text-gray-300">
                                            <div>₹{(item.turnover_cr ?? 0).toFixed(1)} Cr</div>
                                            <div className="text-[10px] text-gray-500 font-sans">
                                                {item.volume ? `${(item.volume / 1000).toFixed(0)}k vol` : "—"}
                                            </div>
                                        </td>

                                        {viewMode === "focus" ? (
                                            <>
                                                {/* 5. MTF Confluence Bar */}
                                                <td className="p-2 text-center">
                                                    {renderMtfConfluenceBar(m, item.close)}
                                                </td>

                                                {/* 6. Daily 20 EMA */}
                                                <td className="p-2 text-center">
                                                    <div className="inline-flex justify-center">
                                                        {renderFocusAnchorChip(m?.daily?.ema_20, "Daily 20")}
                                                    </div>
                                                </td>

                                                {/* 7. Weekly 20 EMA */}
                                                <td className="p-2 text-center">
                                                    <div className="inline-flex justify-center">
                                                        {renderFocusAnchorChip(m?.weekly?.ema_20, "Weekly 20")}
                                                    </div>
                                                </td>

                                                {/* 8. Monthly 20 EMA */}
                                                <td className="p-2 text-center">
                                                    <div className="inline-flex justify-center">
                                                        {renderFocusAnchorChip(
                                                            m?.monthly?.ema_20,
                                                            "Monthly 20",
                                                            m?.weekly?.ema_20?.percentile_str === "IPO" || m?.weekly?.ema_20?.color_tier === "ipo"
                                                        )}
                                                    </div>
                                                </td>

                                                {/* 9. Kinetic Pulse */}
                                                <td className="p-3 text-center font-mono">
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        {isHook ? (
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse flex items-center gap-1">
                                                                <span>⚡</span> Hook
                                                            </span>
                                                        ) : (
                                                            <span
                                                                className={`text-[11px] font-semibold ${
                                                                    (m?.velocity ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                                                                }`}
                                                            >
                                                                {(m?.velocity ?? 0) >= 0 ? "+" : ""}
                                                                {(m?.velocity ?? 0).toFixed(2)} ATR/d
                                                            </span>
                                                        )}
                                                        <span className="text-[9px] text-gray-500 font-sans">
                                                            {m?.decay_mode || "Digestion"}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* 10. Landing Proximity */}
                                                <td className="p-3 text-right">
                                                    {renderLandingProximityBadge(item)}
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                {/* Full Matrix: Daily (8 / 20 / 50) */}
                                                <td className="p-2 text-center">
                                                    <div className="inline-flex items-center gap-1">
                                                        {renderMiniChip(m?.daily?.ema_8 || m?.daily?.ema_10, "8")}
                                                        {renderMiniChip(m?.daily?.ema_20, "20")}
                                                        {renderMiniChip(m?.daily?.ema_50, "50")}
                                                    </div>
                                                </td>

                                                {/* Full Matrix: Weekly (8 / 20 / 50) */}
                                                <td className="p-2 text-center">
                                                    <div className="inline-flex items-center gap-1">
                                                        {renderMiniChip(m?.weekly?.ema_8 || m?.weekly?.ema_10, "8")}
                                                        {renderMiniChip(m?.weekly?.ema_20, "20")}
                                                        {renderMiniChip(m?.weekly?.ema_50, "50")}
                                                    </div>
                                                </td>

                                                {/* Full Matrix: Monthly (8 / 20 / 50) */}
                                                <td className="p-2 text-center">
                                                    <div className="inline-flex items-center gap-1">
                                                        {renderMiniChip(m?.monthly?.ema_8 || m?.monthly?.ema_10, "8")}
                                                        {renderMiniChip(m?.monthly?.ema_20, "20")}
                                                        {renderMiniChip(m?.monthly?.ema_50, "50")}
                                                    </div>
                                                </td>

                                                {/* Kinetic Vector */}
                                                <td className="p-3 text-center font-mono">
                                                    <div className="flex flex-col items-center gap-0.5">
                                                        {isHook ? (
                                                             <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse flex items-center gap-1">
                                                                <span>⚡</span> Hook
                                                            </span>
                                                        ) : (
                                                            <span
                                                                className={`text-[11px] font-semibold ${
                                                                    (m?.velocity ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                                                                }`}
                                                            >
                                                                {(m?.velocity ?? 0) >= 0 ? "+" : ""}
                                                                {(m?.velocity ?? 0).toFixed(2)} ATR/d
                                                            </span>
                                                        )}
                                                        <span className="text-[9px] text-gray-500 font-sans">
                                                            {m?.decay_mode || "Digestion"}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Dynamic Landing Proximity */}
                                                <td className="p-3 text-right">
                                                    {renderLandingProximityBadge(item)}
                                                </td>
                                            </>
                                        )}

                                        {/* Action / Open HUD */}
                                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedStockForModal(item)}
                                                    className="px-2.5 py-1 rounded bg-[#38062b] hover:bg-[#581845] text-[#fce7f3] border border-[#670038] text-[11px] font-semibold transition-colors flex items-center gap-1 shadow-sm"
                                                    title="Open TradingView 9-Cell Matrix HUD"
                                                >
                                                    <span>⚡</span>
                                                    <span>HUD</span>
                                                </button>

                                                {onAddTickerToActiveWatchlist && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onAddTickerToActiveWatchlist(clean)}
                                                        disabled={isInActiveWatchlist}
                                                        className={`p-1 rounded transition-colors ${
                                                            isInActiveWatchlist
                                                                ? "text-emerald-400 cursor-default"
                                                                : "text-gray-400 hover:text-white hover:bg-gray-800"
                                                        }`}
                                                        title={isInActiveWatchlist ? `In ${activeWatchlistName}` : `Add to ${activeWatchlistName || "Active Watchlist"}`}
                                                    >
                                                        {isInActiveWatchlist ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* 6. Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between bg-[#12121d] px-4 py-3 rounded-xl border border-gray-800 text-xs shadow-md">
                    <div className="text-gray-400">
                        Page <strong className="text-gray-200 font-mono">{currentPage}</strong> of{" "}
                        <strong className="text-gray-200 font-mono">{totalPages}</strong> ({sortedItems.length} stocks)
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-1.5 rounded-lg bg-gray-800 text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="font-mono text-gray-300 px-2">{currentPage} / {totalPages}</span>
                        <button
                            type="button"
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="p-1.5 rounded-lg bg-gray-800 text-gray-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* 7. TradingView 9-Cell Matrix Popover Modal */}
            {selectedStockForModal && (
                <EmaStretchMatrixModal
                    isOpen={Boolean(selectedStockForModal)}
                    onClose={() => setSelectedStockForModal(null)}
                    symbol={selectedStockForModal.symbol}
                    cleanSymbol={selectedStockForModal.clean_symbol}
                    companyName={selectedStockForModal.name || stockSearchIndex[selectedStockForModal.clean_symbol]?.[0]?.title}
                    currentPrice={selectedStockForModal.close}
                    pct1d={selectedStockForModal.pct_1d}
                    sector={selectedStockForModal.sector || (selectedStockForModal.themes && selectedStockForModal.themes[0])}
                    matrix={selectedStockForModal.ema_stretch}
                />
            )}
        </div>
    );
}
