// components/watchlist/Recurrence52WScanner.tsx
"use client";

import { useState, useMemo, useCallback } from "react";
import type { Stock52WItem, Market52WHistory, StockSearchIndex } from "@/lib/data";
import type { ConstituentPerformanceMap } from "@/types";
import { cleanTicker, normalizeTickerSymbol, makeTradingViewUrl, formatReturn, getReturnColor } from "@/lib/utils";
import {
    Flame,
    TrendingUp,
    TrendingDown,
    Calendar,
    Filter,
    Sparkles,
    Copy,
    Plus,
    Check,
    Search,
    Layers,
    Table as TableIcon,
    Save,
    CheckSquare,
    Square,
    ArrowUpDown,
    ChevronDown,
    Activity,
    Info,
    ShieldCheck,
    SlidersHorizontal,
} from "lucide-react";

interface Recurrence52WScannerProps {
    historyData: Market52WHistory;
    stockSearchIndex?: StockSearchIndex;
    constituentPerformanceMap?: ConstituentPerformanceMap | null;
    onOpenInRRG?: (tickers: string[], suggestedName?: string) => void;
    onOpenInTable?: (tickers: string[], suggestedName?: string) => void;
    onSaveAsWatchlist?: (name: string, tickers: string[], folder?: string) => void;
    onAddTickerToActiveWatchlist?: (ticker: string) => void;
    activeWatchlistTickers?: string[];
    activeWatchlistName?: string;
}

export type Direction = "high" | "low";
export type Lookback = 5 | 10 | 20 | 60;
export type PresetFilter = "all" | "streak" | "persistent" | "fresh" | "high_rs" | "rs_lead";
export type TradabilityPreset = "tradeable" | "fno_liquid" | "all" | "custom";
export type CircuitFilterOption = "exclude_low" | "ge_10" | "fno_20" | "fno" | "all";
export type SortField = "frequency" | "streak" | "rs_rating" | "pct_1d" | "pct_5d" | "turnover" | "close" | "symbol" | "theme" | "band";
export type SortOrder = "asc" | "desc";

function getBandBadgeStyle(band?: string): string {
    const b = (band || "20").trim();
    if (b === "No Band") return "bg-purple-500/20 text-purple-300 border-purple-500/40";
    if (b === "20") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    if (b === "10") return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
    if (b === "5") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    if (b === "2") return "bg-rose-500/20 text-rose-300 border-rose-500/40";
    return "bg-gray-800 text-gray-300 border-gray-700";
}

function getBandLabel(band?: string): string {
    const b = (band || "20").trim();
    if (b === "No Band") return "F&O";
    if (b === "20" || b === "10" || b === "5" || b === "2") return `${b}%`;
    return b ? `${b}%` : "20%";
}

function copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard
            .writeText(text)
            .then(() => true)
            .catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textarea);
        return successful;
    } catch {
        return false;
    }
}

export function Recurrence52WScanner({
    historyData,
    stockSearchIndex = {},
    constituentPerformanceMap,
    onOpenInRRG,
    onOpenInTable,
    onSaveAsWatchlist,
    onAddTickerToActiveWatchlist,
    activeWatchlistTickers = [],
    activeWatchlistName = "Active Watchlist",
}: Recurrence52WScannerProps) {
    const [direction, setDirection] = useState<Direction>("high");
    const [lookback, setLookback] = useState<Lookback>(20);
    const [presetFilter, setPresetFilter] = useState<PresetFilter>("all");
    const [tradabilityPreset, setTradabilityPreset] = useState<TradabilityPreset>("tradeable");
    const [showGranularFilters, setShowGranularFilters] = useState<boolean>(false);
    const [minTurnover, setMinTurnover] = useState<number>(1.0);
    const [minPrice, setMinPrice] = useState<number>(20.0);
    const [circuitFilter, setCircuitFilter] = useState<CircuitFilterOption>("exclude_low");
    const [seriesFilter, setSeriesFilter] = useState<"EQ" | "all">("EQ");
    const [excludeCircuitLocked, setExcludeCircuitLocked] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
    const [sortField, setSortField] = useState<SortField>("frequency");
    const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
    const [saveListName, setSaveListName] = useState<string>("");

    const applyTradabilityPreset = useCallback((preset: "tradeable" | "fno_liquid" | "all") => {
        setTradabilityPreset(preset);
        if (preset === "tradeable") {
            setMinTurnover(1.0);
            setMinPrice(20.0);
            setCircuitFilter("exclude_low");
            setSeriesFilter("EQ");
            setExcludeCircuitLocked(true);
        } else if (preset === "fno_liquid") {
            setMinTurnover(10.0);
            setMinPrice(0);
            setCircuitFilter("fno_20");
            setSeriesFilter("EQ");
            setExcludeCircuitLocked(true);
        } else if (preset === "all") {
            setMinTurnover(0);
            setMinPrice(0);
            setCircuitFilter("all");
            setSeriesFilter("all");
            setExcludeCircuitLocked(false);
        }
    }, []);

    const activeCustomFilterCount = useMemo(() => {
        let count = 0;
        if (minTurnover > 0) count++;
        if (minPrice > 0) count++;
        if (circuitFilter !== "all") count++;
        if (seriesFilter !== "all") count++;
        if (excludeCircuitLocked) count++;
        return count;
    }, [minTurnover, minPrice, circuitFilter, seriesFilter, excludeCircuitLocked]);

    const activeCleanSet = useMemo(() => {
        return new Set(activeWatchlistTickers.map((t) => cleanTicker(t).toUpperCase()));
    }, [activeWatchlistTickers]);

    // Helper to get theme for symbol
    const getStockTheme = useCallback(
        (cleanSym: string): string => {
            const entries = stockSearchIndex[cleanSym];
            if (!entries || entries.length === 0) return "—";
            const ind = entries.find((e) => e.category === "industries");
            return ind ? ind.title : entries[0]?.title || "—";
        },
        [stockSearchIndex]
    );

    // Helper to get IBD RS metrics
    const getRSMetrics = useCallback(
        (sym: string, cleanSym: string) => {
            if (!constituentPerformanceMap) return { rs: null, lead: false };
            const data =
                constituentPerformanceMap[sym] ||
                constituentPerformanceMap[cleanSym] ||
                constituentPerformanceMap[`${cleanSym}.NS`];
            if (!data) return { rs: null, lead: false };
            return {
                rs: typeof data.ibd_rs_rating === "number" ? data.ibd_rs_rating : null,
                lead: Boolean(data.rs_lead_breakout),
            };
        },
        [constituentPerformanceMap]
    );

    // Source pool according to direction
    const rawItems = direction === "high" ? historyData.highs : historyData.lows;

    // Filter items
    const filteredItems = useMemo(() => {
        return rawItems.filter((item) => {
            // 0. Tradability & Circuit Filters
            if (excludeCircuitLocked && item.is_circuit_locked) return false;
            if ((item.turnover_cr ?? 0) < minTurnover) return false;
            if ((item.close ?? 0) < minPrice) return false;
            if (seriesFilter === "EQ" && item.series && item.series !== "EQ") return false;

            const band = (item.circuit_band || "20").trim();
            if (circuitFilter === "exclude_low") {
                if (band === "2" || band === "5") return false;
            } else if (circuitFilter === "ge_10") {
                if (band === "2" || band === "5") return false;
            } else if (circuitFilter === "fno_20") {
                if (band !== "No Band" && band !== "20") return false;
            } else if (circuitFilter === "fno") {
                if (band !== "No Band") return false;
            }

            // 1. Lookback window activity filter
            const countInWindow =
                lookback === 5
                    ? item.count_5d
                    : lookback === 10
                    ? item.count_10d
                    : lookback === 20
                    ? item.count_20d
                    : item.count_60d;

            if (countInWindow <= 0) return false;

            // 2. Preset Filter Chips
            if (presetFilter === "streak") {
                if (item.streak < 2) return false;
            } else if (presetFilter === "persistent") {
                if (countInWindow < 3) return false;
            } else if (presetFilter === "fresh") {
                if (!item.is_fresh_20d) return false;
            } else if (presetFilter === "high_rs") {
                const { rs } = getRSMetrics(item.symbol, item.clean_symbol);
                if (rs === null || rs < 80) return false;
            } else if (presetFilter === "rs_lead") {
                const { lead } = getRSMetrics(item.symbol, item.clean_symbol);
                if (!lead) return false;
            }

            // 3. Search query
            if (searchQuery.trim()) {
                const q = searchQuery.trim().toLowerCase();
                const matchSym = item.clean_symbol.toLowerCase().includes(q);
                const theme = getStockTheme(item.clean_symbol).toLowerCase();
                const matchTheme = theme.includes(q);
                if (!matchSym && !matchTheme) return false;
            }

            return true;
        });
    }, [rawItems, excludeCircuitLocked, minTurnover, minPrice, seriesFilter, circuitFilter, lookback, presetFilter, searchQuery, getRSMetrics, getStockTheme]);

    // Sort items
    const sortedItems = useMemo(() => {
        const sorted = [...filteredItems];
        sorted.sort((a, b) => {
            let valA = 0;
            let valB = 0;

            if (sortField === "frequency") {
                valA =
                    lookback === 5
                        ? a.count_5d
                        : lookback === 10
                        ? a.count_10d
                        : lookback === 20
                        ? a.count_20d
                        : a.count_60d;
                valB =
                    lookback === 5
                        ? b.count_5d
                        : lookback === 10
                        ? b.count_10d
                        : lookback === 20
                        ? b.count_20d
                        : b.count_60d;
            } else if (sortField === "streak") {
                valA = a.streak;
                valB = b.streak;
            } else if (sortField === "rs_rating") {
                valA = getRSMetrics(a.symbol, a.clean_symbol).rs ?? -1;
                valB = getRSMetrics(b.symbol, b.clean_symbol).rs ?? -1;
            } else if (sortField === "pct_1d") {
                valA = a.pct_1d;
                valB = b.pct_1d;
            } else if (sortField === "pct_5d") {
                valA = a.pct_5d;
                valB = b.pct_5d;
            } else if (sortField === "turnover") {
                valA = a.turnover_cr;
                valB = b.turnover_cr;
            } else if (sortField === "close") {
                valA = a.close;
                valB = b.close;
            } else if (sortField === "band") {
                const getBandVal = (b?: string) => {
                    const cleanB = (b || "20").trim();
                    if (cleanB === "No Band") return 999;
                    const parsed = parseFloat(cleanB);
                    return isNaN(parsed) ? 20 : parsed;
                };
                valA = getBandVal(a.circuit_band);
                valB = getBandVal(b.circuit_band);
            } else if (sortField === "symbol") {
                const cmp = a.clean_symbol.localeCompare(b.clean_symbol);
                return sortOrder === "desc" ? -cmp : cmp;
            } else if (sortField === "theme") {
                const themeA = getStockTheme(a.clean_symbol);
                const themeB = getStockTheme(b.clean_symbol);
                const cmp = themeA.localeCompare(themeB);
                return sortOrder === "desc" ? -cmp : cmp;
            }

            if (valA === valB) {
                // Secondary sort by streak then turnover
                if (a.streak !== b.streak) return b.streak - a.streak;
                return b.turnover_cr - a.turnover_cr;
            }

            return sortOrder === "desc" ? valB - valA : valA - valB;
        });
        return sorted;
    }, [filteredItems, sortField, sortOrder, lookback, getRSMetrics, getStockTheme]);

    // Toggle sort
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
        } else {
            setSortField(field);
            setSortOrder("desc");
        }
    };

    // Selection handlers
    const toggleSelectTicker = (ticker: string) => {
        setSelectedTickers((prev) => {
            const next = new Set(prev);
            if (next.has(ticker)) {
                next.delete(ticker);
            } else {
                next.add(ticker);
            }
            return next;
        });
    };

    const selectAllVisible = () => {
        const next = new Set(sortedItems.map((i) => i.symbol));
        setSelectedTickers(next);
    };

    const clearSelection = () => {
        setSelectedTickers(new Set());
    };

    // Copy to TradingView formatting
    const copyTradingView = (batchSize?: number, batchIndex = 0) => {
        const sourceList = selectedTickers.size > 0
            ? Array.from(selectedTickers)
            : sortedItems.map((i) => i.symbol);

        if (sourceList.length === 0) return;

        let exportList = sourceList;
        if (batchSize && batchSize > 0) {
            const start = batchIndex * batchSize;
            exportList = sourceList.slice(start, start + batchSize);
        }

        const tvFormatted = exportList
            .map((t) => `NSE:${cleanTicker(t).replace(/[&\-\s]/g, "_")}`)
            .join(", ");

        copyToClipboard(tvFormatted).then((success) => {
            if (success) {
                const label = batchSize
                    ? `Copied batch of ${exportList.length} tickers to clipboard!`
                    : `Copied all ${exportList.length} tickers to clipboard!`;
                setCopyFeedback(label);
                setTimeout(() => setCopyFeedback(null), 3000);
            }
        });
    };

    // Open Save Watchlist Modal
    const handleSaveWatchlistModal = () => {
        const count = selectedTickers.size > 0 ? selectedTickers.size : sortedItems.length;
        const defaultName = `${direction === "high" ? "52W High" : "52W Low"} ${lookback}D Scan (${historyData.metadata.latest_session})`;
        setSaveListName(defaultName);
        setIsSaveModalOpen(true);
    };

    const confirmSaveWatchlist = () => {
        const tickersToSave = selectedTickers.size > 0
            ? Array.from(selectedTickers)
            : sortedItems.map((i) => i.symbol);

        if (onSaveAsWatchlist && tickersToSave.length > 0) {
            onSaveAsWatchlist(saveListName || "52W Scan", tickersToSave, "52W Scans");
        }
        setIsSaveModalOpen(false);
    };

    const targetTickersForActions = useMemo(() => {
        return selectedTickers.size > 0
            ? Array.from(selectedTickers)
            : sortedItems.map((i) => i.symbol);
    }, [selectedTickers, sortedItems]);

    // Active counts matching tradability filters
    const inWindowCount = useMemo(() => {
        return rawItems.filter((i) => {
            if (excludeCircuitLocked && i.is_circuit_locked) return false;
            if ((i.turnover_cr ?? 0) < minTurnover) return false;
            if ((i.close ?? 0) < minPrice) return false;
            if (seriesFilter === "EQ" && i.series && i.series !== "EQ") return false;
            const band = (i.circuit_band || "20").trim();
            if (circuitFilter === "exclude_low" && (band === "2" || band === "5")) return false;
            if (circuitFilter === "ge_10" && (band === "2" || band === "5")) return false;
            if (circuitFilter === "fno_20" && band !== "No Band" && band !== "20") return false;
            if (circuitFilter === "fno" && band !== "No Band") return false;

            const count =
                lookback === 5
                    ? i.count_5d
                    : lookback === 10
                    ? i.count_10d
                    : lookback === 20
                    ? i.count_20d
                    : i.count_60d;
            return count > 0;
        }).length;
    }, [rawItems, lookback, excludeCircuitLocked, minTurnover, minPrice, seriesFilter, circuitFilter]);

    const streakCount = useMemo(() => {
        return rawItems.filter((i) => {
            if (excludeCircuitLocked && i.is_circuit_locked) return false;
            if ((i.turnover_cr ?? 0) < minTurnover) return false;
            if ((i.close ?? 0) < minPrice) return false;
            if (seriesFilter === "EQ" && i.series && i.series !== "EQ") return false;
            const band = (i.circuit_band || "20").trim();
            if (circuitFilter === "exclude_low" && (band === "2" || band === "5")) return false;
            if (circuitFilter === "ge_10" && (band === "2" || band === "5")) return false;
            if (circuitFilter === "fno_20" && band !== "No Band" && band !== "20") return false;
            if (circuitFilter === "fno" && band !== "No Band") return false;
            return i.streak >= 2;
        }).length;
    }, [rawItems, excludeCircuitLocked, minTurnover, minPrice, seriesFilter, circuitFilter]);

    const freshCount = useMemo(() => {
        return rawItems.filter((i) => {
            if (excludeCircuitLocked && i.is_circuit_locked) return false;
            if ((i.turnover_cr ?? 0) < minTurnover) return false;
            if ((i.close ?? 0) < minPrice) return false;
            if (seriesFilter === "EQ" && i.series && i.series !== "EQ") return false;
            const band = (i.circuit_band || "20").trim();
            if (circuitFilter === "exclude_low" && (band === "2" || band === "5")) return false;
            if (circuitFilter === "ge_10" && (band === "2" || band === "5")) return false;
            if (circuitFilter === "fno_20" && band !== "No Band" && band !== "20") return false;
            if (circuitFilter === "fno" && band !== "No Band") return false;
            return i.is_fresh_20d;
        }).length;
    }, [rawItems, excludeCircuitLocked, minTurnover, minPrice, seriesFilter, circuitFilter]);

    const dates20 = useMemo(() => {
        return historyData.dates ? historyData.dates.slice(-20) : [];
    }, [historyData.dates]);

    return (
        <div className="space-y-4">
            {/* Top Controls Bar */}
            <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-4 shadow-xl backdrop-blur-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Direction Toggle */}
                    <div className="flex items-center p-1 bg-gray-950/80 rounded-lg border border-gray-800">
                        <button
                            type="button"
                            onClick={() => {
                                setDirection("high");
                                setSelectedTickers(new Set());
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                direction === "high"
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm"
                                    : "text-gray-400 hover:text-gray-200"
                            }`}
                        >
                            <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                            52W Highs (Momentum)
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">
                                {historyData.highs.length}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setDirection("low");
                                setSelectedTickers(new Set());
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                direction === "low"
                                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm"
                                    : "text-gray-400 hover:text-gray-200"
                            }`}
                        >
                            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                            52W Lows (Breakdowns)
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300">
                                {historyData.lows.length}
                            </span>
                        </button>
                    </div>

                    {/* Lookback Window Buttons */}
                    <div className="flex items-center gap-1 bg-gray-950/80 p-1 rounded-lg border border-gray-800">
                        <span className="text-[11px] text-gray-500 font-medium px-2 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-400" /> Window:
                        </span>
                        {([5, 10, 20, 60] as Lookback[]).map((days) => (
                            <button
                                key={days}
                                type="button"
                                onClick={() => setLookback(days)}
                                className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${
                                    lookback === days
                                        ? "bg-blue-600 text-white shadow-sm font-semibold"
                                        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
                                }`}
                            >
                                {days}D {days === 20 ? "(1M)" : days === 60 ? "(3M)" : ""}
                            </button>
                        ))}
                    </div>

                    {/* Search Input */}
                    <div className="relative min-w-[200px]">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Filter symbol or theme..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-gray-950/80 border border-gray-800 text-gray-200 pl-8 pr-3 py-1.5 rounded-lg text-xs focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>
                </div>

                {/* 1-Click Primary Tradability Presets & Granular Drawer Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-800/80">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-gray-500 font-medium flex items-center gap-1 mr-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            Tradability:
                        </span>
                        <button
                            type="button"
                            onClick={() => applyTradabilityPreset("tradeable")}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                                tradabilityPreset === "tradeable"
                                    ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-sm shadow-emerald-500/10"
                                    : "text-gray-400 bg-gray-950 hover:bg-gray-800/60 border border-gray-800"
                            }`}
                            title="Active by default: Excludes 2% & 5% price bands, turnover < ₹1 Cr, price < ₹20, BE/BZ series, and circuit locked stocks"
                        >
                            <span>⚡ Tradeable Only</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => applyTradabilityPreset("fno_liquid")}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                                tradabilityPreset === "fno_liquid"
                                    ? "bg-purple-500/25 text-purple-300 border border-purple-500/50 shadow-sm shadow-purple-500/10"
                                    : "text-gray-400 bg-gray-950 hover:bg-gray-800/60 border border-gray-800"
                            }`}
                            title="High conviction institutional: Turnover >= ₹10 Cr, F&O (No Band) or 20% Band"
                        >
                            <span>💎 F&O & Liquid</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => applyTradabilityPreset("all")}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                                tradabilityPreset === "all"
                                    ? "bg-blue-500/25 text-blue-300 border border-blue-500/50 shadow-sm"
                                    : "text-gray-400 bg-gray-950 hover:bg-gray-800/60 border border-gray-800"
                            }`}
                            title="Raw, unfiltered universe including all bands and micro-caps"
                        >
                            <span>🌐 All Stocks</span>
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowGranularFilters((prev) => !prev)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                            showGranularFilters || tradabilityPreset === "custom"
                                ? "bg-slate-800 text-slate-200 border-slate-600"
                                : "bg-gray-950/80 text-gray-400 border-gray-800 hover:text-gray-200 hover:bg-gray-800/50"
                        }`}
                        title="Open granular filters drawer"
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                        <span>Fine-Tune</span>
                        {tradabilityPreset === "custom" && activeCustomFilterCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 font-mono">
                                {activeCustomFilterCount}
                            </span>
                        )}
                        <ChevronDown className={`w-3 h-3 transition-transform ${showGranularFilters ? "rotate-180" : ""}`} />
                    </button>
                </div>

                {/* Collapsible Granular Controls Drawer */}
                {showGranularFilters && (
                    <div className="p-3 bg-gray-950/90 rounded-xl border border-gray-800/90 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 animate-in fade-in duration-100 text-xs">
                        {/* Turnover Floor */}
                        <div className="space-y-1">
                            <label className="text-[11px] text-gray-400 font-medium block">Min Turnover</label>
                            <div className="flex items-center gap-1 bg-gray-900 p-0.5 rounded-lg border border-gray-800">
                                {[
                                    { label: "None", val: 0 },
                                    { label: "₹1 Cr", val: 1.0 },
                                    { label: "₹5 Cr", val: 5.0 },
                                    { label: "₹10 Cr", val: 10.0 },
                                ].map((opt) => (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        onClick={() => {
                                            setMinTurnover(opt.val);
                                            setTradabilityPreset("custom");
                                        }}
                                        className={`flex-1 py-1 rounded text-[11px] font-medium transition-all ${
                                            minTurnover === opt.val
                                                ? "bg-blue-600 text-white font-semibold"
                                                : "text-gray-400 hover:text-white"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Price Floor */}
                        <div className="space-y-1">
                            <label className="text-[11px] text-gray-400 font-medium block">Min Price</label>
                            <div className="flex items-center gap-1 bg-gray-900 p-0.5 rounded-lg border border-gray-800">
                                {[
                                    { label: "None", val: 0 },
                                    { label: "₹20", val: 20 },
                                    { label: "₹50", val: 50 },
                                    { label: "₹100", val: 100 },
                                ].map((opt) => (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        onClick={() => {
                                            setMinPrice(opt.val);
                                            setTradabilityPreset("custom");
                                        }}
                                        className={`flex-1 py-1 rounded text-[11px] font-medium transition-all ${
                                            minPrice === opt.val
                                                ? "bg-blue-600 text-white font-semibold"
                                                : "text-gray-400 hover:text-white"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Price Band Filter */}
                        <div className="space-y-1">
                            <label className="text-[11px] text-gray-400 font-medium block">Circuit Band</label>
                            <select
                                value={circuitFilter}
                                onChange={(e) => {
                                    setCircuitFilter(e.target.value as CircuitFilterOption);
                                    setTradabilityPreset("custom");
                                }}
                                className="w-full bg-gray-900 border border-gray-800 text-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                            >
                                <option value="exclude_low">Exclude 2% &amp; 5% Bands</option>
                                <option value="fno_20">Tradeable (20% &amp; F&amp;O)</option>
                                <option value="fno">F&amp;O Only (No Band)</option>
                                <option value="all">All Bands (2%, 5%, 10%, 20%, F&amp;O)</option>
                            </select>
                        </div>

                        {/* Series Filter */}
                        <div className="space-y-1">
                            <label className="text-[11px] text-gray-400 font-medium block">Security Series</label>
                            <div className="flex items-center gap-1 bg-gray-900 p-0.5 rounded-lg border border-gray-800">
                                {[
                                    { label: "EQ Only", val: "EQ" as const },
                                    { label: "All Series", val: "all" as const },
                                ].map((opt) => (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        onClick={() => {
                                            setSeriesFilter(opt.val);
                                            setTradabilityPreset("custom");
                                        }}
                                        className={`flex-1 py-1 rounded text-[11px] font-medium transition-all ${
                                            seriesFilter === opt.val
                                                ? "bg-blue-600 text-white font-semibold"
                                                : "text-gray-400 hover:text-white"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Circuit Lock Status */}
                        <div className="space-y-1">
                            <label className="text-[11px] text-gray-400 font-medium block">Circuit Lock</label>
                            <button
                                type="button"
                                onClick={() => {
                                    setExcludeCircuitLocked((prev) => !prev);
                                    setTradabilityPreset("custom");
                                }}
                                className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                                    excludeCircuitLocked
                                        ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                                        : "bg-gray-900 text-gray-400 border-gray-800"
                                }`}
                            >
                                <span>{excludeCircuitLocked ? "🔒 Exclude Locked" : "🔓 Allow Locked"}</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Preset Filter Chips */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-800/80">
                    <span className="text-[11px] text-gray-500 font-medium flex items-center gap-1">
                        <Filter className="w-3 h-3 text-gray-400" /> Presets:
                    </span>
                    <button
                        type="button"
                        onClick={() => setPresetFilter("all")}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            presetFilter === "all"
                                ? "bg-gray-800 text-white border border-gray-700 font-semibold"
                                : "text-gray-400 bg-gray-950 hover:bg-gray-800/50 border border-gray-800"
                        }`}
                    >
                        All ({inWindowCount})
                    </button>
                    <button
                        type="button"
                        onClick={() => setPresetFilter("streak")}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            presetFilter === "streak"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold"
                                : "text-gray-400 bg-gray-950 hover:bg-gray-800/50 border border-gray-800"
                        }`}
                    >
                        <Flame className="w-3 h-3 text-amber-400" />
                        Active Streak (≥ 2d)
                        <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">
                            {streakCount}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setPresetFilter("persistent")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            presetFilter === "persistent"
                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-semibold"
                                : "text-gray-400 bg-gray-950 hover:bg-gray-800/50 border border-gray-800"
                        }`}
                    >
                        ⭐ Persistent (≥ 3 in {lookback}D)
                    </button>
                    <button
                        type="button"
                        onClick={() => setPresetFilter("fresh")}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            presetFilter === "fresh"
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold"
                                : "text-gray-400 bg-gray-950 hover:bg-gray-800/50 border border-gray-800"
                        }`}
                    >
                        {direction === "high" ? "🚀 Fresh Breakouts (1st in 20d)" : "🧊 Fresh Breakdowns (1st in 20d)"}
                        <span className="text-[10px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
                            {freshCount}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setPresetFilter("high_rs")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            presetFilter === "high_rs"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold"
                                : "text-gray-400 bg-gray-950 hover:bg-gray-800/50 border border-gray-800"
                        }`}
                    >
                        💎 High RS (≥ 80)
                    </button>
                    <button
                        type="button"
                        onClick={() => setPresetFilter("rs_lead")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            presetFilter === "rs_lead"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold"
                                : "text-gray-400 bg-gray-950 hover:bg-gray-800/50 border border-gray-800"
                        }`}
                    >
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        RS Lead Breakout (*)
                    </button>
                </div>
            </div>

            {/* Batch Action Toolbar */}
            <div className="bg-gray-900/80 border border-gray-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            if (selectedTickers.size === sortedItems.length && sortedItems.length > 0) {
                                clearSelection();
                            } else {
                                selectAllVisible();
                            }
                        }}
                        className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white transition-colors"
                    >
                        {selectedTickers.size > 0 && selectedTickers.size === sortedItems.length ? (
                            <CheckSquare className="w-4 h-4 text-blue-400" />
                        ) : selectedTickers.size > 0 ? (
                            <div className="w-4 h-4 rounded bg-blue-500/20 border border-blue-400 flex items-center justify-center text-[10px] text-blue-300 font-bold">
                                -
                            </div>
                        ) : (
                            <Square className="w-4 h-4 text-gray-500" />
                        )}
                        <span className="font-medium">
                            {selectedTickers.size > 0
                                ? `${selectedTickers.size} of ${sortedItems.length} selected`
                                : `Select All (${sortedItems.length})`}
                        </span>
                    </button>
                    {selectedTickers.size > 0 && (
                        <button
                            type="button"
                            onClick={clearSelection}
                            className="text-[11px] text-gray-500 hover:text-gray-300 underline"
                        >
                            Clear
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Open in RRG */}
                    {onOpenInRRG && (
                        <button
                            type="button"
                            onClick={() => {
                                const suggestedScanName = `${direction === "high" ? "52W High" : "52W Low"} ${lookback}D Scan (${targetTickersForActions.length} stocks)`;
                                onOpenInRRG(targetTickersForActions, suggestedScanName);
                            }}
                            disabled={targetTickersForActions.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Load repeaters into RRG Chart"
                        >
                            <Layers className="w-3.5 h-3.5" />
                            Open in RRG
                        </button>
                    )}

                    {/* Open in Table */}
                    {onOpenInTable && (
                        <button
                            type="button"
                            onClick={() => {
                                const suggestedScanName = `${direction === "high" ? "52W High" : "52W Low"} ${lookback}D Scan (${targetTickersForActions.length} stocks)`;
                                onOpenInTable(targetTickersForActions, suggestedScanName);
                            }}
                            disabled={targetTickersForActions.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title="View constituent metrics in table"
                        >
                            <TableIcon className="w-3.5 h-3.5" />
                            Open in Table
                        </button>
                    )}

                    {/* Save as Watchlist */}
                    {onSaveAsWatchlist && (
                        <button
                            type="button"
                            onClick={handleSaveWatchlistModal}
                            disabled={targetTickersForActions.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Save into 52W Scans folder"
                        >
                            <Save className="w-3.5 h-3.5" />
                            Save as Watchlist
                        </button>
                    )}

                    {/* TradingView Copy Batches */}
                    <div className="relative group">
                        <button
                            type="button"
                            onClick={() => copyTradingView()}
                            disabled={targetTickersForActions.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Copy className="w-3.5 h-3.5 text-gray-400" />
                            Copy TV Batches
                            <ChevronDown className="w-3 h-3 text-gray-400" />
                        </button>
                        {targetTickersForActions.length > 0 && (
                            <div className="absolute right-0 top-full mt-1 hidden group-hover:block w-52 max-h-72 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-1 z-50">
                                <button
                                    type="button"
                                    onClick={() => copyTradingView()}
                                    className="w-full text-left px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-800 rounded flex items-center justify-between"
                                >
                                    <span>Copy All</span>
                                    <span className="text-[10px] text-gray-500 font-mono">
                                        {targetTickersForActions.length}
                                    </span>
                                </button>
                                {targetTickersForActions.length > 15 && (
                                    <div className="border-t border-gray-800 my-1 pt-1">
                                        <div className="px-2 py-0.5 text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
                                            Batches of 15
                                        </div>
                                        {Array.from(
                                            { length: Math.ceil(targetTickersForActions.length / 15) },
                                            (_, idx) => {
                                                const start = idx * 15 + 1;
                                                const end = Math.min((idx + 1) * 15, targetTickersForActions.length);
                                                return (
                                                    <button
                                                        key={`b15-${idx}`}
                                                        type="button"
                                                        onClick={() => copyTradingView(15, idx)}
                                                        className="w-full text-left px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-800 rounded flex items-center justify-between"
                                                    >
                                                        <span>Batch {idx + 1} ({start}–{end})</span>
                                                        <span className="text-[10px] text-gray-500 font-mono">
                                                            {end - start + 1}
                                                        </span>
                                                    </button>
                                                );
                                            }
                                        )}
                                    </div>
                                )}
                                {targetTickersForActions.length > 30 && (
                                    <div className="border-t border-gray-800 my-1 pt-1">
                                        <div className="px-2 py-0.5 text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
                                            Batches of 30
                                        </div>
                                        {Array.from(
                                            { length: Math.ceil(targetTickersForActions.length / 30) },
                                            (_, idx) => {
                                                const start = idx * 30 + 1;
                                                const end = Math.min((idx + 1) * 30, targetTickersForActions.length);
                                                return (
                                                    <button
                                                        key={`b30-${idx}`}
                                                        type="button"
                                                        onClick={() => copyTradingView(30, idx)}
                                                        className="w-full text-left px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-800 rounded flex items-center justify-between"
                                                    >
                                                        <span>Batch {idx + 1} ({start}–{end})</span>
                                                        <span className="text-[10px] text-gray-500 font-mono">
                                                            {end - start + 1}
                                                        </span>
                                                    </button>
                                                );
                                            }
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {copyFeedback && (
                        <div className="text-xs text-emerald-400 font-medium flex items-center gap-1 animate-fade-in">
                            <Check className="w-3.5 h-3.5" />
                            {copyFeedback}
                        </div>
                    )}
                </div>
            </div>

            {/* Recurrence Table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-300">
                        <thead className="bg-gray-950/80 text-gray-400 font-semibold border-b border-gray-800 uppercase text-[10px] tracking-wider">
                            <tr>
                                <th className="p-3 w-10 text-center">
                                    <span className="sr-only">Select</span>
                                </th>
                                <th
                                    className="p-3 cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort("symbol")}
                                >
                                    <div className="flex items-center gap-1">
                                        Symbol
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th
                                    className="p-3 text-center cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort("band")}
                                >
                                    <div className="flex items-center justify-center gap-1">
                                        Band
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th
                                    className="p-3 cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort("theme")}
                                >
                                    <div className="flex items-center gap-1">
                                        Theme
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th
                                    className="p-3 cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort("streak")}
                                >
                                    <div className="flex items-center gap-1">
                                        Active Streak
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th
                                    className="p-3 cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort("frequency")}
                                >
                                    <div className="flex items-center gap-1">
                                        Frequency ({lookback}D)
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th className="p-3">
                                    <div className="flex items-center gap-1">
                                        20-Day Timeline
                                        <span className="text-[9px] text-gray-500 normal-case">(Oldest → Newest)</span>
                                    </div>
                                </th>
                                <th
                                    className="p-3 cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort("rs_rating")}
                                >
                                    <div className="flex items-center gap-1">
                                        IBD RS
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th
                                    className="p-3 text-right cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort("close")}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Close (₹)
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th
                                    className="p-3 text-right cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort("pct_1d")}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        1D %
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th
                                    className="p-3 text-right cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort("pct_5d")}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        5D %
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th
                                    className="p-3 text-right cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort("turnover")}
                                >
                                    <div className="flex items-center justify-end gap-1">
                                        Turnover (Cr)
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th className="p-3 text-center w-16">Quick Add</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/60 font-mono">
                            {sortedItems.length === 0 ? (
                                <tr>
                                    <td colSpan={13} className="p-8 text-center text-gray-500 font-sans">
                                        No qualifying stocks found matching the active filters.
                                    </td>
                                </tr>
                            ) : (
                                sortedItems.map((item) => {
                                    const isSelected = selectedTickers.has(item.symbol);
                                    const inActiveWl = activeCleanSet.has(item.clean_symbol);
                                    const theme = getStockTheme(item.clean_symbol);
                                    const { rs, lead } = getRSMetrics(item.symbol, item.clean_symbol);

                                    const countInWindow =
                                        lookback === 5
                                            ? item.count_5d
                                            : lookback === 10
                                            ? item.count_10d
                                            : lookback === 20
                                            ? item.count_20d
                                            : item.count_60d;

                                    return (
                                        <tr
                                            key={item.symbol}
                                            className={`hover:bg-gray-800/40 transition-colors ${
                                                isSelected ? "bg-blue-950/20" : ""
                                            }`}
                                        >
                                            {/* Checkbox */}
                                            <td className="p-3 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSelectTicker(item.symbol)}
                                                    className="text-gray-400 hover:text-gray-200"
                                                >
                                                    {isSelected ? (
                                                        <CheckSquare className="w-4 h-4 text-blue-400" />
                                                    ) : (
                                                        <Square className="w-4 h-4 text-gray-600" />
                                                    )}
                                                </button>
                                            </td>

                                            {/* Symbol */}
                                            <td className="p-3 font-semibold whitespace-nowrap">
                                                <div className="flex items-center gap-1.5 font-sans">
                                                    <a
                                                        href={makeTradingViewUrl(item.symbol)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-400 hover:text-blue-300 underline font-medium transition-colors"
                                                        title={`Open ${item.clean_symbol} on TradingView`}
                                                    >
                                                        {item.clean_symbol}
                                                    </a>
                                                    {item.is_fresh_20d && (
                                                        <span className="text-[9px] font-sans px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                                            Fresh
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Band */}
                                            <td className="p-3 text-center whitespace-nowrap">
                                                <div className="flex items-center justify-center gap-1 font-sans">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getBandBadgeStyle(item.circuit_band)}`}>
                                                        {getBandLabel(item.circuit_band)}
                                                    </span>
                                                    {item.is_circuit_locked && (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/25 text-rose-300 border border-rose-500/50" title="Locked at Price Band Circuit (High == Low)">
                                                            🔒 Lock
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Theme */}
                                            <td className="p-3 font-sans text-gray-400 whitespace-nowrap text-[11px]">
                                                <span className="px-2 py-0.5 rounded bg-gray-800/70 border border-gray-700/60 text-gray-300">
                                                    {theme}
                                                </span>
                                            </td>

                                            {/* Active Streak */}
                                            <td className="p-3 whitespace-nowrap">
                                                {item.streak >= 2 ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                        <Flame className="w-3 h-3 text-amber-400 fill-amber-400 animate-pulse" />
                                                        {item.streak}d
                                                    </span>
                                                ) : item.streak === 1 ? (
                                                    <span className="text-gray-300 text-xs">1d</span>
                                                ) : (
                                                    <span className="text-gray-600">—</span>
                                                )}
                                            </td>

                                            {/* Frequency */}
                                            <td className="p-3 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-gray-100">
                                                        {countInWindow}/{lookback}d
                                                    </span>
                                                    <span className="text-[10px] text-gray-500">
                                                        ({Math.round((countInWindow / lookback) * 100)}%)
                                                    </span>
                                                </div>
                                            </td>

                                            {/* 20-Day Hit Timeline (Micro-dots) */}
                                            <td className="p-3 whitespace-nowrap">
                                                <div
                                                    className="flex items-center gap-1 py-1"
                                                    title={`Hits across last 20 sessions: ${item.count_20d}/20`}
                                                >
                                                    {item.history_20d.map((hit, idx) => {
                                                        const dateStr = dates20[idx] || `Session ${idx + 1}`;
                                                        return (
                                                            <span
                                                                key={idx}
                                                                className={`w-2 h-2 rounded-full transition-transform hover:scale-150 ${
                                                                    hit === 1
                                                                        ? direction === "high"
                                                                            ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]"
                                                                            : "bg-rose-400 shadow-[0_0_4px_rgba(251,113,133,0.8)]"
                                                                        : "bg-gray-800"
                                                                }`}
                                                                title={`${dateStr}: ${hit === 1 ? (direction === "high" ? "52W High" : "52W Low") : "No hit"}`}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </td>

                                            {/* IBD RS */}
                                            <td className="p-3 whitespace-nowrap">
                                                {rs !== null ? (
                                                    <div className="flex items-center gap-1">
                                                        <span
                                                            className={`font-bold ${
                                                                rs >= 80
                                                                    ? "text-emerald-400"
                                                                    : rs >= 60
                                                                    ? "text-blue-400"
                                                                    : "text-gray-400"
                                                            }`}
                                                        >
                                                            {rs}
                                                        </span>
                                                        {lead && (
                                                            <span
                                                                className="text-amber-400 text-sm font-bold animate-pulse"
                                                                title="RS Lead Breakout"
                                                            >
                                                                *
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-600">—</span>
                                                )}
                                            </td>

                                            {/* Close Price */}
                                            <td className="p-3 text-right whitespace-nowrap font-medium text-gray-200">
                                                ₹{item.close.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                            </td>

                                            {/* 1D % */}
                                            <td className={`p-3 text-right whitespace-nowrap font-semibold ${getReturnColor(item.pct_1d)}`}>
                                                {formatReturn(item.pct_1d)}
                                            </td>

                                            {/* 5D % */}
                                            <td className={`p-3 text-right whitespace-nowrap font-semibold ${getReturnColor(item.pct_5d)}`}>
                                                {formatReturn(item.pct_5d)}
                                            </td>

                                            {/* Turnover (Cr) */}
                                            <td className="p-3 text-right whitespace-nowrap text-gray-400">
                                                {item.turnover_cr.toFixed(2)}
                                            </td>

                                            {/* Quick Add Button */}
                                            <td className="p-3 text-center whitespace-nowrap">
                                                {onAddTickerToActiveWatchlist && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onAddTickerToActiveWatchlist(item.symbol)}
                                                        disabled={inActiveWl}
                                                        className={`p-1.5 rounded transition-all ${
                                                            inActiveWl
                                                                ? "text-emerald-400 bg-emerald-500/10 cursor-default"
                                                                : "text-gray-400 hover:text-white hover:bg-gray-800"
                                                        }`}
                                                        title={
                                                            inActiveWl
                                                                ? `Already in ${activeWatchlistName}`
                                                                : `Add to ${activeWatchlistName}`
                                                        }
                                                    >
                                                        {inActiveWl ? (
                                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                        ) : (
                                                            <Plus className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Save Watchlist Modal */}
            {isSaveModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
                        <h3 className="text-base font-semibold text-gray-100 flex items-center gap-2">
                            <Save className="w-4 h-4 text-emerald-400" />
                            Save as New Watchlist
                        </h3>
                        <p className="text-xs text-gray-400">
                            Saving {targetTickersForActions.length} tickers into folder{" "}
                            <span className="text-emerald-400 font-semibold font-mono">52W Scans</span>.
                        </p>
                        <div>
                            <label className="text-xs text-gray-400 block mb-1">Watchlist Name</label>
                            <input
                                type="text"
                                value={saveListName}
                                onChange={(e) => setSaveListName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        confirmSaveWatchlist();
                                    }
                                }}
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                                placeholder="Enter watchlist name..."
                                autoFocus
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsSaveModalOpen(false)}
                                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmSaveWatchlist}
                                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                            >
                                Save Watchlist
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
