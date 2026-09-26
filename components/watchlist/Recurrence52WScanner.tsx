// components/watchlist/Recurrence52WScanner.tsx
"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
    X,
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

export interface ColumnFilters {
    symbol: string;
    bands: string[];
    circuitLocked: "all" | "unlocked" | "locked";
    themes: string[];
    minStreak: number;
    minFrequency: number;
    minRS: number;
    rsLeadOnly: boolean;
    minClose: number;
    maxClose: number;
    minPct1d: number;
    maxPct1d: number;
    pct1dDirection: "all" | "positive" | "negative";
    minPct5d: number;
    maxPct5d: number;
    pct5dDirection: "all" | "positive" | "negative";
    minTurnover: number;
}

export const defaultColumnFilters: ColumnFilters = {
    symbol: "",
    bands: [],
    circuitLocked: "all",
    themes: [],
    minStreak: 0,
    minFrequency: 0,
    minRS: 0,
    rsLeadOnly: false,
    minClose: 0,
    maxClose: 0,
    minPct1d: 0,
    maxPct1d: 0,
    pct1dDirection: "all",
    minPct5d: 0,
    maxPct5d: 0,
    pct5dDirection: "all",
    minTurnover: 0,
};

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
    const [columnFilters, setColumnFilters] = useState<ColumnFilters>(defaultColumnFilters);
    const [activeFilterPopover, setActiveFilterPopover] = useState<string | null>(null);
    const [themeFilterSearch, setThemeFilterSearch] = useState<string>("");
    const filterPopoverRef = useRef<HTMLDivElement>(null);

    // Close column filter popover on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (filterPopoverRef.current && !filterPopoverRef.current.contains(event.target as Node)) {
                setActiveFilterPopover(null);
            }
        }
        if (activeFilterPopover) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [activeFilterPopover]);

    const hasColumnFilter = useCallback((col: string): boolean => {
        if (col === "symbol") return Boolean(columnFilters.symbol.trim());
        if (col === "band") return columnFilters.bands.length > 0 || columnFilters.circuitLocked !== "all";
        if (col === "theme") return columnFilters.themes.length > 0;
        if (col === "streak") return columnFilters.minStreak > 0;
        if (col === "frequency") return columnFilters.minFrequency > 0;
        if (col === "rs_rating") return columnFilters.minRS > 0 || columnFilters.rsLeadOnly;
        if (col === "close") return columnFilters.minClose > 0 || columnFilters.maxClose > 0;
        if (col === "pct_1d") return columnFilters.minPct1d !== 0 || columnFilters.maxPct1d !== 0 || columnFilters.pct1dDirection !== "all";
        if (col === "pct_5d") return columnFilters.minPct5d !== 0 || columnFilters.maxPct5d !== 0 || columnFilters.pct5dDirection !== "all";
        if (col === "turnover") return columnFilters.minTurnover > 0;
        return false;
    }, [columnFilters]);

    const activeColumnFilterCount = useMemo(() => {
        let count = 0;
        if (columnFilters.symbol.trim()) count++;
        if (columnFilters.bands.length > 0 || columnFilters.circuitLocked !== "all") count++;
        if (columnFilters.themes.length > 0) count++;
        if (columnFilters.minStreak > 0) count++;
        if (columnFilters.minFrequency > 0) count++;
        if (columnFilters.minRS > 0 || columnFilters.rsLeadOnly) count++;
        if (columnFilters.minClose > 0 || columnFilters.maxClose > 0) count++;
        if (columnFilters.minPct1d !== 0 || columnFilters.maxPct1d !== 0 || columnFilters.pct1dDirection !== "all") count++;
        if (columnFilters.minPct5d !== 0 || columnFilters.maxPct5d !== 0 || columnFilters.pct5dDirection !== "all") count++;
        if (columnFilters.minTurnover > 0) count++;
        return count;
    }, [columnFilters]);

    const clearSingleColumnFilter = useCallback((col: string) => {
        setColumnFilters((prev) => {
            const next = { ...prev };
            if (col === "symbol") next.symbol = "";
            else if (col === "band") {
                next.bands = [];
                next.circuitLocked = "all";
            } else if (col === "theme") next.themes = [];
            else if (col === "streak") next.minStreak = 0;
            else if (col === "frequency") next.minFrequency = 0;
            else if (col === "rs_rating") {
                next.minRS = 0;
                next.rsLeadOnly = false;
            } else if (col === "close") {
                next.minClose = 0;
                next.maxClose = 0;
            } else if (col === "pct_1d") {
                next.minPct1d = 0;
                next.maxPct1d = 0;
                next.pct1dDirection = "all";
            } else if (col === "pct_5d") {
                next.minPct5d = 0;
                next.maxPct5d = 0;
                next.pct5dDirection = "all";
            } else if (col === "turnover") next.minTurnover = 0;
            return next;
        });
    }, []);

    const clearAllColumnFilters = useCallback(() => {
        setColumnFilters(defaultColumnFilters);
    }, []);

    const getSortIcon = (field: SortField) => {
        if (sortField !== field) {
            return <ArrowUpDown className="w-3 h-3 text-gray-500 opacity-60 group-hover:opacity-100 transition-opacity" />;
        }
        return sortOrder === "desc" ? (
            <span className="text-cyan-400 font-bold text-xs">▼</span>
        ) : (
            <span className="text-cyan-400 font-bold text-xs">▲</span>
        );
    };

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

    // Items matching all global, window, and column filters EXCEPT the Theme column filter
    const themeBaseItems = useMemo(() => {
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

            // 4. Column Header Filters (excluding Theme)
            // Symbol filter
            if (columnFilters.symbol.trim()) {
                const sq = columnFilters.symbol.trim().toLowerCase();
                const mSym = item.clean_symbol.toLowerCase().includes(sq) || item.symbol.toLowerCase().includes(sq);
                if (!mSym) return false;
            }

            // Band filter
            if (columnFilters.bands.length > 0) {
                const b = (item.circuit_band || "20").trim();
                if (!columnFilters.bands.includes(b)) return false;
            }

            // Circuit Lock filter
            if (columnFilters.circuitLocked === "locked") {
                if (!item.is_circuit_locked) return false;
            } else if (columnFilters.circuitLocked === "unlocked") {
                if (item.is_circuit_locked) return false;
            }

            // Streak filter
            if (columnFilters.minStreak > 0) {
                if (item.streak < columnFilters.minStreak) return false;
            }

            // Frequency filter
            if (columnFilters.minFrequency > 0) {
                if (countInWindow < columnFilters.minFrequency) return false;
            }

            // IBD RS filter
            if (columnFilters.minRS > 0 || columnFilters.rsLeadOnly) {
                const { rs, lead } = getRSMetrics(item.symbol, item.clean_symbol);
                if (columnFilters.minRS > 0 && (rs === null || rs < columnFilters.minRS)) return false;
                if (columnFilters.rsLeadOnly && !lead) return false;
            }

            // Close price filter
            if (columnFilters.minClose > 0 && item.close < columnFilters.minClose) return false;
            if (columnFilters.maxClose > 0 && item.close > columnFilters.maxClose) return false;

            // 1D % filter
            if (columnFilters.pct1dDirection === "positive" && item.pct_1d <= 0) return false;
            if (columnFilters.pct1dDirection === "negative" && item.pct_1d >= 0) return false;
            if (columnFilters.minPct1d !== 0 && item.pct_1d < columnFilters.minPct1d) return false;
            if (columnFilters.maxPct1d !== 0 && item.pct_1d > columnFilters.maxPct1d) return false;

            // 5D % filter
            if (columnFilters.pct5dDirection === "positive" && item.pct_5d <= 0) return false;
            if (columnFilters.pct5dDirection === "negative" && item.pct_5d >= 0) return false;
            if (columnFilters.minPct5d !== 0 && item.pct_5d < columnFilters.minPct5d) return false;
            if (columnFilters.maxPct5d !== 0 && item.pct_5d > columnFilters.maxPct5d) return false;

            // Turnover filter
            if (columnFilters.minTurnover > 0 && item.turnover_cr < columnFilters.minTurnover) return false;

            return true;
        });
    }, [
        rawItems,
        excludeCircuitLocked,
        minTurnover,
        minPrice,
        seriesFilter,
        circuitFilter,
        lookback,
        presetFilter,
        searchQuery,
        columnFilters.symbol,
        columnFilters.bands,
        columnFilters.circuitLocked,
        columnFilters.minStreak,
        columnFilters.minFrequency,
        columnFilters.minRS,
        columnFilters.rsLeadOnly,
        columnFilters.minClose,
        columnFilters.maxClose,
        columnFilters.pct1dDirection,
        columnFilters.minPct1d,
        columnFilters.maxPct1d,
        columnFilters.pct5dDirection,
        columnFilters.minPct5d,
        columnFilters.maxPct5d,
        columnFilters.minTurnover,
        getRSMetrics,
        getStockTheme,
    ]);

    // Available themes computed dynamically from candidate universe with real counts
    const availableThemes = useMemo(() => {
        const counts: Record<string, number> = {};
        themeBaseItems.forEach((item) => {
            const t = getStockTheme(item.clean_symbol);
            counts[t] = (counts[t] || 0) + 1;
        });
        // Also ensure any currently selected theme is present so user can uncheck it
        columnFilters.themes.forEach((t) => {
            if (!(t in counts)) counts[t] = 0;
        });

        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }, [themeBaseItems, columnFilters.themes, getStockTheme]);

    // Final filtered items applying Theme selection on top of themeBaseItems
    const filteredItems = useMemo(() => {
        if (columnFilters.themes.length === 0) return themeBaseItems;
        return themeBaseItems.filter((item) => {
            const itemTheme = getStockTheme(item.clean_symbol);
            return columnFilters.themes.includes(itemTheme);
        });
    }, [themeBaseItems, columnFilters.themes, getStockTheme]);

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

    const windowDates = useMemo(() => {
        return historyData.dates ? historyData.dates.slice(-lookback) : [];
    }, [historyData.dates, lookback]);

    const filteredAvailableThemes = useMemo(() => {
        if (!themeFilterSearch.trim()) return availableThemes;
        const q = themeFilterSearch.trim().toLowerCase();
        return availableThemes.filter((t) => t.name.toLowerCase().includes(q));
    }, [availableThemes, themeFilterSearch]);

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

                    {activeColumnFilterCount > 0 && (
                        <button
                            type="button"
                            onClick={clearAllColumnFilters}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium transition-colors"
                            title="Reset all column filters"
                        >
                            <X className="w-3.5 h-3.5" />
                            <span>Clear Column Filters ({activeColumnFilterCount})</span>
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
            <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-xl flex flex-col">
                <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] min-h-[480px] rounded-xl overscroll-auto transition-all">
                    <table className="w-full text-left text-xs text-gray-300 border-collapse">
                        <thead className="sticky top-0 z-20 bg-[#0d0d14] text-gray-400 font-semibold border-b border-gray-800 uppercase text-[10px] tracking-wider shadow-sm select-none">
                            <tr>
                                <th className="p-3 w-10 text-center">
                                    <span className="sr-only">Select</span>
                                </th>
                                <th className="p-2.5 relative">
                                    <div className="flex items-center justify-between gap-1.5">
                                        <div
                                            className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleSort("symbol")}
                                        >
                                            <span>Symbol</span>
                                            {getSortIcon("symbol")}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveFilterPopover(activeFilterPopover === "symbol" ? null : "symbol");
                                            }}
                                            className={`p-1 rounded transition-colors ${
                                                hasColumnFilter("symbol")
                                                    ? "text-blue-400 bg-blue-500/20"
                                                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                            }`}
                                            title="Filter Symbol"
                                        >
                                            <Filter className={`w-3 h-3 ${hasColumnFilter("symbol") ? "fill-blue-400" : ""}`} />
                                        </button>
                                    </div>
                                    {activeFilterPopover === "symbol" && (
                                        <div
                                            ref={filterPopoverRef}
                                            className="absolute left-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                <span className="font-semibold text-xs text-gray-200">Filter Symbol</span>
                                                <div className="flex items-center gap-2">
                                                    {hasColumnFilter("symbol") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => clearSingleColumnFilter("symbol")}
                                                            className="text-[10px] text-red-400 hover:text-red-300"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveFilterPopover(null)}
                                                        className="text-gray-400 hover:text-gray-200"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="relative">
                                                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search symbol (e.g. TATA)..."
                                                        value={columnFilters.symbol}
                                                        onChange={(e) => setColumnFilters((prev) => ({ ...prev, symbol: e.target.value }))}
                                                        className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500 font-mono"
                                                        autoFocus
                                                    />
                                                </div>
                                                <p className="text-[10px] text-gray-500">Filter by symbol name or clean ticker.</p>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="p-2.5 relative text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                        <div
                                            className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleSort("band")}
                                        >
                                            <span>Band</span>
                                            {getSortIcon("band")}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveFilterPopover(activeFilterPopover === "band" ? null : "band");
                                            }}
                                            className={`p-1 rounded transition-colors ${
                                                hasColumnFilter("band")
                                                    ? "text-blue-400 bg-blue-500/20"
                                                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                            }`}
                                            title="Filter Price Band"
                                        >
                                            <Filter className={`w-3 h-3 ${hasColumnFilter("band") ? "fill-blue-400" : ""}`} />
                                        </button>
                                    </div>
                                    {activeFilterPopover === "band" && (
                                        <div
                                            ref={filterPopoverRef}
                                            className="absolute left-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                <span className="font-semibold text-xs text-gray-200">Filter Circuit Band</span>
                                                <div className="flex items-center gap-2">
                                                    {hasColumnFilter("band") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => clearSingleColumnFilter("band")}
                                                            className="text-[10px] text-red-400 hover:text-red-300"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveFilterPopover(null)}
                                                        className="text-gray-400 hover:text-gray-200"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2.5">
                                                <div className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">Circuit Bands</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {[
                                                        { id: "No Band", label: "F&O / No Band" },
                                                        { id: "20", label: "20%" },
                                                        { id: "10", label: "10%" },
                                                        { id: "5", label: "5%" },
                                                        { id: "2", label: "2%" },
                                                    ].map((b) => {
                                                        const active = columnFilters.bands.includes(b.id);
                                                        return (
                                                            <button
                                                                key={b.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setColumnFilters((prev) => ({
                                                                        ...prev,
                                                                        bands: active
                                                                            ? prev.bands.filter((x) => x !== b.id)
                                                                            : [...prev.bands, b.id],
                                                                    }));
                                                                }}
                                                                className={`px-2 py-1 rounded text-[11px] font-semibold border transition-all ${
                                                                    active
                                                                        ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                                                                        : "bg-gray-800/80 text-gray-300 border-gray-700 hover:bg-gray-700"
                                                                }`}
                                                            >
                                                                {b.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <div className="border-t border-gray-800 pt-2 space-y-1">
                                                    <div className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">Circuit Lock State</div>
                                                    <div className="flex gap-1.5">
                                                        {(["all", "unlocked", "locked"] as const).map((m) => (
                                                            <button
                                                                key={m}
                                                                type="button"
                                                                onClick={() => setColumnFilters((prev) => ({ ...prev, circuitLocked: m }))}
                                                                className={`flex-1 py-1 text-[11px] font-medium rounded border transition-colors ${
                                                                    columnFilters.circuitLocked === m
                                                                        ? "bg-blue-600 text-white border-blue-500"
                                                                        : "bg-gray-800/60 text-gray-300 border-gray-700 hover:bg-gray-700"
                                                                }`}
                                                            >
                                                                {m === "all" ? "All" : m === "unlocked" ? "Unlocked" : "🔒 Locked"}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="p-2.5 relative">
                                    <div className="flex items-center justify-between gap-1.5">
                                        <div
                                            className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleSort("theme")}
                                        >
                                            <span>Theme</span>
                                            {getSortIcon("theme")}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveFilterPopover(activeFilterPopover === "theme" ? null : "theme");
                                            }}
                                            className={`p-1 rounded transition-colors ${
                                                hasColumnFilter("theme")
                                                    ? "text-blue-400 bg-blue-500/20"
                                                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                            }`}
                                            title="Filter Theme"
                                        >
                                            <Filter className={`w-3 h-3 ${hasColumnFilter("theme") ? "fill-blue-400" : ""}`} />
                                        </button>
                                    </div>
                                    {activeFilterPopover === "theme" && (
                                        <div
                                            ref={filterPopoverRef}
                                            className="absolute left-0 top-full mt-1.5 w-72 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-semibold text-xs text-gray-200">Filter Theme</span>
                                                    {columnFilters.themes.length > 0 && (
                                                        <span className="text-[10px] text-blue-400 font-mono">({columnFilters.themes.length})</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {hasColumnFilter("theme") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => clearSingleColumnFilter("theme")}
                                                            className="text-[10px] text-red-400 hover:text-red-300"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveFilterPopover(null)}
                                                        className="text-gray-400 hover:text-gray-200"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <input
                                                    type="text"
                                                    placeholder="Search themes..."
                                                    value={themeFilterSearch}
                                                    onChange={(e) => setThemeFilterSearch(e.target.value)}
                                                    className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
                                                    autoFocus
                                                />
                                                <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
                                                    {filteredAvailableThemes.map(({ name, count }) => {
                                                        const active = columnFilters.themes.includes(name);
                                                        return (
                                                            <button
                                                                key={name}
                                                                type="button"
                                                                onClick={() => {
                                                                    setColumnFilters((prev) => ({
                                                                        ...prev,
                                                                        themes: active
                                                                            ? prev.themes.filter((x) => x !== name)
                                                                            : [...prev.themes, name],
                                                                    }));
                                                                }}
                                                                className={`w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between transition-colors ${
                                                                    active
                                                                        ? "bg-blue-600/25 text-blue-200 font-semibold"
                                                                        : "text-gray-300 hover:bg-gray-800/60"
                                                                }`}
                                                            >
                                                                <span className="truncate pr-2">{name}</span>
                                                                <span className="text-[10px] font-mono text-gray-500 shrink-0">({count})</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="p-2.5 relative">
                                    <div className="flex items-center justify-between gap-1.5">
                                        <div
                                            className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleSort("streak")}
                                        >
                                            <span>Active Streak</span>
                                            {getSortIcon("streak")}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveFilterPopover(activeFilterPopover === "streak" ? null : "streak");
                                            }}
                                            className={`p-1 rounded transition-colors ${
                                                hasColumnFilter("streak")
                                                    ? "text-blue-400 bg-blue-500/20"
                                                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                            }`}
                                            title="Filter Active Streak"
                                        >
                                            <Filter className={`w-3 h-3 ${hasColumnFilter("streak") ? "fill-blue-400" : ""}`} />
                                        </button>
                                    </div>
                                    {activeFilterPopover === "streak" && (
                                        <div
                                            ref={filterPopoverRef}
                                            className="absolute left-0 top-full mt-1.5 w-60 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                <span className="font-semibold text-xs text-gray-200">Filter Active Streak</span>
                                                <div className="flex items-center gap-2">
                                                    {hasColumnFilter("streak") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => clearSingleColumnFilter("streak")}
                                                            className="text-[10px] text-red-400 hover:text-red-300"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveFilterPopover(null)}
                                                        className="text-gray-400 hover:text-gray-200"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2.5">
                                                <label className="text-[11px] text-gray-400 block">Min Consecutive Days</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={60}
                                                    value={columnFilters.minStreak || ""}
                                                    onChange={(e) => setColumnFilters((prev) => ({ ...prev, minStreak: Math.max(0, parseInt(e.target.value) || 0) }))}
                                                    placeholder="e.g. 2"
                                                    className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                    autoFocus
                                                />
                                                <div className="flex flex-wrap gap-1">
                                                    {[0, 1, 2, 3, 5, 10].map((d) => (
                                                        <button
                                                            key={d}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, minStreak: d }))}
                                                            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                                                columnFilters.minStreak === d
                                                                    ? "bg-blue-600 text-white border-blue-500 font-bold"
                                                                    : "bg-gray-800 text-gray-400 border-gray-700 hover:text-white"
                                                            }`}
                                                        >
                                                            {d === 0 ? "All" : `≥${d}d`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="p-2.5 relative">
                                    <div className="flex items-center justify-between gap-1.5">
                                        <div
                                            className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleSort("frequency")}
                                        >
                                            <span>Frequency ({lookback}D)</span>
                                            {getSortIcon("frequency")}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveFilterPopover(activeFilterPopover === "frequency" ? null : "frequency");
                                            }}
                                            className={`p-1 rounded transition-colors ${
                                                hasColumnFilter("frequency")
                                                    ? "text-blue-400 bg-blue-500/20"
                                                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                            }`}
                                            title="Filter Frequency"
                                        >
                                            <Filter className={`w-3 h-3 ${hasColumnFilter("frequency") ? "fill-blue-400" : ""}`} />
                                        </button>
                                    </div>
                                    {activeFilterPopover === "frequency" && (
                                        <div
                                            ref={filterPopoverRef}
                                            className="absolute left-0 top-full mt-1.5 w-60 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                <span className="font-semibold text-xs text-gray-200">Filter Frequency</span>
                                                <div className="flex items-center gap-2">
                                                    {hasColumnFilter("frequency") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => clearSingleColumnFilter("frequency")}
                                                            className="text-[10px] text-red-400 hover:text-red-300"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveFilterPopover(null)}
                                                        className="text-gray-400 hover:text-gray-200"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2.5">
                                                <label className="text-[11px] text-gray-400 block">Min Hits in {lookback}D Window</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={lookback}
                                                    value={columnFilters.minFrequency || ""}
                                                    onChange={(e) => setColumnFilters((prev) => ({ ...prev, minFrequency: Math.max(0, parseInt(e.target.value) || 0) }))}
                                                    placeholder="e.g. 3"
                                                    className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                    autoFocus
                                                />
                                                <div className="flex flex-wrap gap-1">
                                                    {[0, 2, 3, 5, 10, 15].filter((f) => f <= lookback).map((f) => (
                                                        <button
                                                            key={f}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, minFrequency: f }))}
                                                            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                                                columnFilters.minFrequency === f
                                                                    ? "bg-blue-600 text-white border-blue-500 font-bold"
                                                                    : "bg-gray-800 text-gray-400 border-gray-700 hover:text-white"
                                                            }`}
                                                        >
                                                            {f === 0 ? "All" : `≥${f}`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="p-2.5">
                                    <div className="flex items-center gap-1">
                                        <span>{lookback}-Day Timeline</span>
                                        <span className="text-[9px] text-gray-500 normal-case font-normal">(Oldest → Newest)</span>
                                    </div>
                                </th>
                                <th className="p-2.5 relative">
                                    <div className="flex items-center justify-between gap-1.5">
                                        <div
                                            className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleSort("rs_rating")}
                                        >
                                            <span>IBD RS</span>
                                            {getSortIcon("rs_rating")}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveFilterPopover(activeFilterPopover === "rs_rating" ? null : "rs_rating");
                                            }}
                                            className={`p-1 rounded transition-colors ${
                                                hasColumnFilter("rs_rating")
                                                    ? "text-blue-400 bg-blue-500/20"
                                                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                            }`}
                                            title="Filter IBD RS"
                                        >
                                            <Filter className={`w-3 h-3 ${hasColumnFilter("rs_rating") ? "fill-blue-400" : ""}`} />
                                        </button>
                                    </div>
                                    {activeFilterPopover === "rs_rating" && (
                                        <div
                                            ref={filterPopoverRef}
                                            className="absolute left-0 top-full mt-1.5 w-60 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                <span className="font-semibold text-xs text-gray-200">Filter IBD RS</span>
                                                <div className="flex items-center gap-2">
                                                    {hasColumnFilter("rs_rating") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => clearSingleColumnFilter("rs_rating")}
                                                            className="text-[10px] text-red-400 hover:text-red-300"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveFilterPopover(null)}
                                                        className="text-gray-400 hover:text-gray-200"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2.5">
                                                <label className="text-[11px] text-gray-400 block">Min RS Rating (1–99)</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={99}
                                                    value={columnFilters.minRS || ""}
                                                    onChange={(e) => setColumnFilters((prev) => ({ ...prev, minRS: Math.max(0, parseInt(e.target.value) || 0) }))}
                                                    placeholder="e.g. 80"
                                                    className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                    autoFocus
                                                />
                                                <div className="flex flex-wrap gap-1">
                                                    {[0, 70, 80, 85, 90].map((r) => (
                                                        <button
                                                            key={r}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, minRS: r }))}
                                                            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                                                columnFilters.minRS === r
                                                                    ? "bg-blue-600 text-white border-blue-500 font-bold"
                                                                    : "bg-gray-800 text-gray-400 border-gray-700 hover:text-white"
                                                            }`}
                                                        >
                                                            {r === 0 ? "All" : `≥${r}`}
                                                        </button>
                                                    ))}
                                                </div>
                                                <label className="flex items-center gap-2 pt-1 border-t border-gray-800 cursor-pointer text-xs text-gray-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={columnFilters.rsLeadOnly}
                                                        onChange={(e) => setColumnFilters((prev) => ({ ...prev, rsLeadOnly: e.target.checked }))}
                                                        className="rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-0"
                                                    />
                                                    <span>RS Lead Breakout (*) Only</span>
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="p-2.5 relative text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                        <div
                                            className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleSort("close")}
                                        >
                                            <span>Close (₹)</span>
                                            {getSortIcon("close")}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveFilterPopover(activeFilterPopover === "close" ? null : "close");
                                            }}
                                            className={`p-1 rounded transition-colors ${
                                                hasColumnFilter("close")
                                                    ? "text-blue-400 bg-blue-500/20"
                                                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                            }`}
                                            title="Filter Close Price"
                                        >
                                            <Filter className={`w-3 h-3 ${hasColumnFilter("close") ? "fill-blue-400" : ""}`} />
                                        </button>
                                    </div>
                                    {activeFilterPopover === "close" && (
                                        <div
                                            ref={filterPopoverRef}
                                            className="absolute right-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                <span className="font-semibold text-xs text-gray-200">Filter Close Price</span>
                                                <div className="flex items-center gap-2">
                                                    {hasColumnFilter("close") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => clearSingleColumnFilter("close")}
                                                            className="text-[10px] text-red-400 hover:text-red-300"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveFilterPopover(null)}
                                                        className="text-gray-400 hover:text-gray-200"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2.5">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 block mb-1">Min Price (₹)</label>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={columnFilters.minClose || ""}
                                                            onChange={(e) => setColumnFilters((prev) => ({ ...prev, minClose: Math.max(0, parseFloat(e.target.value) || 0) }))}
                                                            placeholder="0"
                                                            className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 block mb-1">Max Price (₹)</label>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={columnFilters.maxClose || ""}
                                                            onChange={(e) => setColumnFilters((prev) => ({ ...prev, maxClose: Math.max(0, parseFloat(e.target.value) || 0) }))}
                                                            placeholder="Any"
                                                            className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {[
                                                        { label: "All", min: 0, max: 0 },
                                                        { label: "< ₹50", min: 0, max: 50 },
                                                        { label: "₹50–₹500", min: 50, max: 500 },
                                                        { label: "> ₹500", min: 500, max: 0 },
                                                        { label: "> ₹1,000", min: 1000, max: 0 },
                                                    ].map((p, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, minClose: p.min, maxClose: p.max }))}
                                                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                                                                columnFilters.minClose === p.min && columnFilters.maxClose === p.max
                                                                    ? "bg-blue-600 text-white border-blue-500 font-semibold"
                                                                    : "bg-gray-800 text-gray-400 border-gray-700 hover:text-white"
                                                            }`}
                                                        >
                                                            {p.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="p-2.5 relative text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                        <div
                                            className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleSort("pct_1d")}
                                        >
                                            <span>1D %</span>
                                            {getSortIcon("pct_1d")}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveFilterPopover(activeFilterPopover === "pct_1d" ? null : "pct_1d");
                                            }}
                                            className={`p-1 rounded transition-colors ${
                                                hasColumnFilter("pct_1d")
                                                    ? "text-blue-400 bg-blue-500/20"
                                                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                            }`}
                                            title="Filter 1D Return"
                                        >
                                            <Filter className={`w-3 h-3 ${hasColumnFilter("pct_1d") ? "fill-blue-400" : ""}`} />
                                        </button>
                                    </div>
                                    {activeFilterPopover === "pct_1d" && (
                                        <div
                                            ref={filterPopoverRef}
                                            className="absolute right-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                <span className="font-semibold text-xs text-gray-200">Filter 1D Return (%)</span>
                                                <div className="flex items-center gap-2">
                                                    {hasColumnFilter("pct_1d") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => clearSingleColumnFilter("pct_1d")}
                                                            className="text-[10px] text-red-400 hover:text-red-300"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveFilterPopover(null)}
                                                        className="text-gray-400 hover:text-gray-200"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2.5">
                                                <div className="flex gap-1.5">
                                                    {[
                                                        { id: "all", label: "All" },
                                                        { id: "positive", label: "Gainers (>0%)" },
                                                        { id: "negative", label: "Losers (<0%)" },
                                                    ].map((d) => (
                                                        <button
                                                            key={d.id}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, pct1dDirection: d.id as any }))}
                                                            className={`flex-1 py-1 text-[10px] font-semibold rounded border transition-colors ${
                                                                columnFilters.pct1dDirection === d.id
                                                                    ? "bg-blue-600 text-white border-blue-500"
                                                                    : "bg-gray-800/60 text-gray-400 border-gray-700 hover:text-white"
                                                            }`}
                                                        >
                                                            {d.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 block mb-1">Min %</label>
                                                        <input
                                                            type="number"
                                                            step="0.5"
                                                            value={columnFilters.minPct1d || ""}
                                                            onChange={(e) => setColumnFilters((prev) => ({ ...prev, minPct1d: parseFloat(e.target.value) || 0 }))}
                                                            placeholder="-20"
                                                            className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 block mb-1">Max %</label>
                                                        <input
                                                            type="number"
                                                            step="0.5"
                                                            value={columnFilters.maxPct1d || ""}
                                                            onChange={(e) => setColumnFilters((prev) => ({ ...prev, maxPct1d: parseFloat(e.target.value) || 0 }))}
                                                            placeholder="+20"
                                                            className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {[
                                                        { label: "≥ +2%", min: 2 },
                                                        { label: "≥ +5%", min: 5 },
                                                        { label: "≥ +10%", min: 10 },
                                                    ].map((preset, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, minPct1d: preset.min, pct1dDirection: "positive" }))}
                                                            className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20"
                                                        >
                                                            {preset.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="p-2.5 relative text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                        <div
                                            className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleSort("pct_5d")}
                                        >
                                            <span>5D %</span>
                                            {getSortIcon("pct_5d")}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveFilterPopover(activeFilterPopover === "pct_5d" ? null : "pct_5d");
                                            }}
                                            className={`p-1 rounded transition-colors ${
                                                hasColumnFilter("pct_5d")
                                                    ? "text-blue-400 bg-blue-500/20"
                                                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                            }`}
                                            title="Filter 5D Return"
                                        >
                                            <Filter className={`w-3 h-3 ${hasColumnFilter("pct_5d") ? "fill-blue-400" : ""}`} />
                                        </button>
                                    </div>
                                    {activeFilterPopover === "pct_5d" && (
                                        <div
                                            ref={filterPopoverRef}
                                            className="absolute right-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                <span className="font-semibold text-xs text-gray-200">Filter 5D Return (%)</span>
                                                <div className="flex items-center gap-2">
                                                    {hasColumnFilter("pct_5d") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => clearSingleColumnFilter("pct_5d")}
                                                            className="text-[10px] text-red-400 hover:text-red-300"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveFilterPopover(null)}
                                                        className="text-gray-400 hover:text-gray-200"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2.5">
                                                <div className="flex gap-1.5">
                                                    {[
                                                        { id: "all", label: "All" },
                                                        { id: "positive", label: "Gainers (>0%)" },
                                                        { id: "negative", label: "Losers (<0%)" },
                                                    ].map((d) => (
                                                        <button
                                                            key={d.id}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, pct5dDirection: d.id as any }))}
                                                            className={`flex-1 py-1 text-[10px] font-semibold rounded border transition-colors ${
                                                                columnFilters.pct5dDirection === d.id
                                                                    ? "bg-blue-600 text-white border-blue-500"
                                                                    : "bg-gray-800/60 text-gray-400 border-gray-700 hover:text-white"
                                                            }`}
                                                        >
                                                            {d.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 block mb-1">Min %</label>
                                                        <input
                                                            type="number"
                                                            step="0.5"
                                                            value={columnFilters.minPct5d || ""}
                                                            onChange={(e) => setColumnFilters((prev) => ({ ...prev, minPct5d: parseFloat(e.target.value) || 0 }))}
                                                            placeholder="-30"
                                                            className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 block mb-1">Max %</label>
                                                        <input
                                                            type="number"
                                                            step="0.5"
                                                            value={columnFilters.maxPct5d || ""}
                                                            onChange={(e) => setColumnFilters((prev) => ({ ...prev, maxPct5d: parseFloat(e.target.value) || 0 }))}
                                                            placeholder="+50"
                                                            className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {[
                                                        { label: "≥ +5%", min: 5 },
                                                        { label: "≥ +10%", min: 10 },
                                                        { label: "≥ +20%", min: 20 },
                                                    ].map((preset, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, minPct5d: preset.min, pct5dDirection: "positive" }))}
                                                            className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20"
                                                        >
                                                            {preset.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </th>
                                <th className="p-2.5 relative text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                        <div
                                            className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleSort("turnover")}
                                        >
                                            <span>Turnover (Cr)</span>
                                            {getSortIcon("turnover")}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveFilterPopover(activeFilterPopover === "turnover" ? null : "turnover");
                                            }}
                                            className={`p-1 rounded transition-colors ${
                                                hasColumnFilter("turnover")
                                                    ? "text-blue-400 bg-blue-500/20"
                                                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                            }`}
                                            title="Filter Turnover"
                                        >
                                            <Filter className={`w-3 h-3 ${hasColumnFilter("turnover") ? "fill-blue-400" : ""}`} />
                                        </button>
                                    </div>
                                    {activeFilterPopover === "turnover" && (
                                        <div
                                            ref={filterPopoverRef}
                                            className="absolute right-0 top-full mt-1.5 w-60 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                <span className="font-semibold text-xs text-gray-200">Filter Turnover (Cr)</span>
                                                <div className="flex items-center gap-2">
                                                    {hasColumnFilter("turnover") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => clearSingleColumnFilter("turnover")}
                                                            className="text-[10px] text-red-400 hover:text-red-300"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveFilterPopover(null)}
                                                        className="text-gray-400 hover:text-gray-200"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2.5">
                                                <label className="text-[11px] text-gray-400 block">Min Daily Turnover (₹ Crore)</label>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="1"
                                                    value={columnFilters.minTurnover || ""}
                                                    onChange={(e) => setColumnFilters((prev) => ({ ...prev, minTurnover: Math.max(0, parseFloat(e.target.value) || 0) }))}
                                                    placeholder="e.g. 5.0"
                                                    className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                    autoFocus
                                                />
                                                <div className="flex flex-wrap gap-1">
                                                    {[0, 1, 5, 10, 25, 50].map((t) => (
                                                        <button
                                                            key={t}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, minTurnover: t }))}
                                                            className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                                                columnFilters.minTurnover === t
                                                                    ? "bg-blue-600 text-white border-blue-500 font-bold"
                                                                    : "bg-gray-800 text-gray-400 border-gray-700 hover:text-white"
                                                            }`}
                                                        >
                                                            {t === 0 ? "All" : `≥₹${t}Cr`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
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

                                            {/* Dynamic Hit Timeline */}
                                            <td className="p-3 whitespace-nowrap">
                                                {(() => {
                                                    const fullHist = (item.history_60d && item.history_60d.length >= lookback)
                                                        ? item.history_60d
                                                        : item.history_20d;
                                                    const dots = fullHist.slice(-lookback);

                                                    return (
                                                        <div
                                                            className="flex items-center gap-1 py-1"
                                                            title={`Hits across last ${lookback} sessions: ${countInWindow}/${lookback}`}
                                                        >
                                                            {dots.map((hit, idx) => {
                                                                const dateStr = windowDates[idx] || `Session ${idx + 1}`;
                                                                const is10Divider = lookback === 60 && idx > 0 && idx % 10 === 0;

                                                                return (
                                                                    <div key={idx} className="flex items-center">
                                                                        {is10Divider && (
                                                                            <span className="w-1.5" />
                                                                        )}
                                                                        <span
                                                                            className={`transition-transform hover:scale-150 ${
                                                                                lookback === 60
                                                                                    ? "w-1 h-3 rounded-[1px]"
                                                                                    : lookback === 20
                                                                                    ? "w-2 h-2 rounded-full"
                                                                                    : "w-2.5 h-2.5 rounded-full"
                                                                            } ${
                                                                                hit === 1
                                                                                    ? direction === "high"
                                                                                        ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]"
                                                                                        : "bg-rose-400 shadow-[0_0_4px_rgba(251,113,133,0.8)]"
                                                                                    : "bg-gray-800"
                                                                            }`}
                                                                            title={`${dateStr}: ${hit === 1 ? (direction === "high" ? "52W High" : "52W Low") : "No hit"}`}
                                                                        />
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })()}
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
