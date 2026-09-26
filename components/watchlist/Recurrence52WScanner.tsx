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
    ExternalLink,
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

type Direction = "high" | "low";
type Lookback = 5 | 10 | 20 | 60;
type PresetFilter = "all" | "streak" | "persistent" | "fresh" | "high_rs" | "rs_lead";
type SortField = "frequency" | "streak" | "rs_rating" | "pct_1d" | "pct_5d" | "turnover" | "close" | "symbol" | "theme";
type SortOrder = "asc" | "desc";

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
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
    const [sortField, setSortField] = useState<SortField>("frequency");
    const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
    const [saveListName, setSaveListName] = useState<string>("");

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
    }, [rawItems, lookback, presetFilter, searchQuery, getRSMetrics, getStockTheme]);

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

    // Active counts
    const inWindowCount = useMemo(() => {
        return rawItems.filter((i) => {
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
    }, [rawItems, lookback]);

    const streakCount = useMemo(() => rawItems.filter((i) => i.streak >= 2).length, [rawItems]);
    const freshCount = useMemo(() => rawItems.filter((i) => i.is_fresh_20d).length, [rawItems]);

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
                                    <td colSpan={12} className="p-8 text-center text-gray-500 font-sans">
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
                                                <div className="flex items-center gap-1.5">
                                                    <a
                                                        href={makeTradingViewUrl(item.symbol)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 underline font-medium transition-colors group"
                                                        title={`Open ${item.clean_symbol} on TradingView`}
                                                    >
                                                        <span>{item.clean_symbol}</span>
                                                        <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                                                    </a>
                                                    {item.is_fresh_20d && (
                                                        <span className="text-[9px] font-sans px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                                            Fresh
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
