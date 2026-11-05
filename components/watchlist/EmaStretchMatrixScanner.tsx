// components/watchlist/EmaStretchMatrixScanner.tsx
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import type { EMAStretchMatrix, EMAStretchUniverseData, EMAStretchUniverseItem, EMAStretchCell } from "@/types";
import type { StockSearchIndex, Market52WHistory } from "@/lib/data";
import type { ConstituentPerformanceMap } from "@/types";
import { cleanTicker, normalizeTickerSymbol, makeTradingViewUrl } from "@/lib/utils";
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
} from "lucide-react";
import { EmaStretchMatrixModal } from "@/components/modals/EmaStretchMatrixModal";

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

export type StretchPreset = "all" | "climax" | "hook" | "dip_buy" | "squeeze";
export type StretchSortField = "symbol" | "pct_1d" | "turnover" | "daily_s20" | "weekly_s20" | "monthly_s20" | "velocity";

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
            if (h.ema_stretch && !map.has(h.clean_symbol)) {
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

    useEffect(() => {
        let isMounted = true;
        async function fetchUniverse() {
            try {
                const res = await fetch("/data/market_status/ema_stretch_universe.json");
                if (res.ok) {
                    const data: EMAStretchUniverseData = await res.json();
                    if (isMounted && data && Array.isArray(data.items)) {
                        setUniverseItems(data.items);
                        setLatestDate(data.metadata?.latest_session || "");
                        setIsLoading(false);
                        return;
                    }
                }
            } catch (err) {
                console.warn("Could not fetch /data/market_status/ema_stretch_universe.json:", err);
            }

            // Fallback: build from historyData if available
            if (isMounted) {
                if (initialFallbackItems.length > 0) {
                    setUniverseItems(initialFallbackItems);
                    setLatestDate(historyData?.metadata?.latest_session || "");
                }
                setIsLoading(false);
            }
        }
        fetchUniverse();
        return () => {
            isMounted = false;
        };
    }, [historyData, initialFallbackItems]);

    // 2. Filter & Search State
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedSector, setSelectedSector] = useState<string>("all");
    const [activePreset, setActivePreset] = useState<StretchPreset>("all");
    const [sortField, setSortField] = useState<StretchSortField>("daily_s20");
    const [sortAsc, setSortAsc] = useState<boolean>(false);
    const [pageSize, setPageSize] = useState<number>(50);
    const [currentPage, setCurrentPage] = useState<number>(1);

    // Modal state
    const [selectedStockForModal, setSelectedStockForModal] = useState<EMAStretchUniverseItem | null>(null);

    // Copy notification state
    const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null);

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

    // Preset matching helpers
    const matchesPreset = useCallback((item: EMAStretchUniverseItem, preset: StretchPreset): boolean => {
        const m = item.ema_stretch;
        if (!m) return false;

        const d20 = m.daily?.ema_20;
        const w20 = m.weekly?.ema_20;

        switch (preset) {
            case "climax":
                // Daily & Weekly >= +P90
                return Boolean(
                    d20?.is_above && (d20?.percentile ?? 0) >= 90 &&
                    w20?.is_above && (w20?.percentile ?? 0) >= 90
                );
            case "hook":
                // >= +P90 with velocity rollover (V_t < 0)
                return Boolean(m.is_exhaustion_hook);
            case "dip_buy":
                // Weekly >= +P70 (powerful trend) while Daily is pulling back to 20 EMA (-P or mild stretch <= 0.8 ATR)
                return Boolean(
                    w20?.is_above && (w20?.percentile ?? 0) >= 70 &&
                    (!d20?.is_above || (d20?.stretch_atr ?? 99) <= 0.8 || (d20?.percentile ?? 0) <= 40)
                );
            case "squeeze":
                // Squeeze Before Stretch: Volatility compression (TTM Squeeze bar or high SBS) AND coiled near EMA (<= 1.2 ATR)
                return Boolean(
                    (m.is_squeeze || (m.sbs_score != null && m.sbs_score >= 8.0)) &&
                    (d20?.stretch_atr != null && d20.stretch_atr <= 1.2)
                );
            case "all":
            default:
                return true;
        }
    }, []);

    // Preset counts
    const presetCounts = useMemo(() => {
        const counts = { all: universeItems.length, climax: 0, hook: 0, dip_buy: 0, squeeze: 0 };
        for (const item of universeItems) {
            if (matchesPreset(item, "climax")) counts.climax++;
            if (matchesPreset(item, "hook")) counts.hook++;
            if (matchesPreset(item, "dip_buy")) counts.dip_buy++;
            if (matchesPreset(item, "squeeze")) counts.squeeze++;
        }
        return counts;
    }, [universeItems, matchesPreset]);

    // Filter items
    const filteredItems = useMemo(() => {
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

            // Preset filter
            if (activePreset !== "all" && !matchesPreset(item, activePreset)) {
                return false;
            }

            return true;
        });
    }, [universeItems, searchQuery, selectedSector, activePreset, matchesPreset, stockSearchIndex]);

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
            }
            return sortAsc ? valA - valB : valB - valA;
        });
    }, [filteredItems, sortField, sortAsc]);

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

    // Compact Cell Chip Renderer
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

        return (
            <div
                className={`flex flex-col items-center justify-center px-1.5 py-0.5 rounded border text-[10px] font-mono leading-tight whitespace-nowrap ${bg}`}
                title={`${label}: ${cell.formatted}`}
            >
                <div className="text-[9px] text-gray-400 font-sans">{label}</div>
                <div className="font-semibold whitespace-nowrap">
                    {valStr}A{cell.is_above ? "*" : ""}
                </div>
                <div className={`text-[9px] font-bold ${isIpo ? "text-amber-400" : ""}`}>{cell.percentile_str}</div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {/* 1. Header & System Intro Banner */}
            <div className="bg-[#12121d] border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-[#581845]/30 border border-[#8a246a]/50 text-[#ffb3d9]">
                        <Zap className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                                EMA Stretch Matrix Hub
                                <span className="text-xs px-2 py-0.5 rounded font-sans font-semibold bg-[#38062b] text-[#f3e8ff] border border-[#670038]">
                                    9-Cell Multi-Timeframe Screener
                                </span>
                            </h2>
                            {latestDate && (
                                <span className="text-xs text-gray-400 font-mono bg-gray-800/80 px-2 py-0.5 rounded border border-gray-700">
                                    {latestDate}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Institutional ATR-normalized stretch across Daily, Weekly, and Monthly EMAs with Kinetic Velocity and Landing Zones.
                        </p>
                    </div>
                </div>

                {/* Bulk Actions */}
                <div className="flex items-center gap-2 flex-wrap">
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

            {/* 2. Preset Filter Toolbar */}
            <div className="flex flex-wrap gap-2 items-center bg-[#111118] p-2.5 rounded-xl border border-gray-800">
                <button
                    type="button"
                    onClick={() => { setActivePreset("all"); setCurrentPage(1); }}
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

                <button
                    type="button"
                    onClick={() => { setActivePreset("climax"); setCurrentPage(1); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        activePreset === "climax"
                            ? "bg-[#670038] text-[#fce7f3] border border-[#8a144e] shadow-md"
                            : "bg-[#38062b]/40 text-[#fbcfe8] hover:bg-[#38062b]/80 border border-[#5a1040]/50"
                    }`}
                >
                    <Flame className="w-3.5 h-3.5 text-rose-400" />
                    <span>🔥 Climax Exhaustion</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                        {presetCounts.climax}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => { setActivePreset("hook"); setCurrentPage(1); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        activePreset === "hook"
                            ? "bg-amber-600 text-white shadow-md border border-amber-400"
                            : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30"
                    }`}
                >
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>⚡ Exhaustion Hook</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                        {presetCounts.hook}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => { setActivePreset("dip_buy"); setCurrentPage(1); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        activePreset === "dip_buy"
                            ? "bg-emerald-600 text-white shadow-md border border-emerald-400"
                            : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30"
                    }`}
                >
                    <Target className="w-3.5 h-3.5 text-emerald-400" />
                    <span>🎯 Bull Dip-Buy</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                        {presetCounts.dip_buy}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => { setActivePreset("squeeze"); setCurrentPage(1); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        activePreset === "squeeze"
                            ? "bg-cyan-600 text-white shadow-md border border-cyan-400"
                            : "bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/30"
                    }`}
                >
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    <span>🌀 Squeeze Expansion</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                        {presetCounts.squeeze}
                    </span>
                </button>
            </div>

            {/* 3. Search & Sector Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-[#0e0e17] p-3 rounded-xl border border-gray-800 text-xs">
                <div className="flex items-center gap-2.5 w-full sm:w-auto flex-1">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search by Symbol or Name..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="w-full bg-[#161622] border border-gray-700 rounded-lg pl-9 pr-3 py-1.5 text-gray-200 placeholder-gray-500 text-xs focus:outline-none focus:border-blue-500 font-mono"
                        />
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Filter className="w-3.5 h-3.5 text-gray-500" />
                        <select
                            value={selectedSector}
                            onChange={(e) => { setSelectedSector(e.target.value); setCurrentPage(1); }}
                            className="bg-[#161622] border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-200 text-xs focus:outline-none focus:border-blue-500"
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
                        Showing <strong className="text-gray-200 font-mono">{filteredItems.length}</strong> matching stocks
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

            {/* 4. Screener Table */}
            {isLoading ? (
                <div className="bg-[#12121d] border border-gray-800 rounded-xl p-16 text-center text-gray-400 space-y-3">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
                    <p className="text-sm font-semibold text-gray-200">Loading EMA Stretch Universe Telemetry...</p>
                    <p className="text-xs text-gray-500">Vectorizing multi-timeframe percentiles and kinetic vectors</p>
                </div>
            ) : sortedItems.length === 0 ? (
                <div className="bg-[#12121d] border border-gray-800 rounded-xl p-16 text-center text-gray-400 space-y-2">
                    <p className="text-base font-semibold text-gray-200">No stocks match your filter criteria</p>
                    <p className="text-xs text-gray-500">Try clearing your search query or selecting a different preset.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-800 bg-[#0e0e17] shadow-xl">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead>
                            <tr className="bg-[#151522] border-b border-gray-800 text-gray-400 font-semibold uppercase text-[10px] tracking-wider">
                                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort("symbol")}>
                                    <div className="flex items-center gap-1">
                                        <span>Symbol</span>
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
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
                                <th className="p-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort("daily_s20")}>
                                    <div className="flex items-center justify-center gap-1">
                                        <span>Daily Stretch (10 / 20 / 50)</span>
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th className="p-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort("weekly_s20")}>
                                    <div className="flex items-center justify-center gap-1">
                                        <span>Weekly Stretch (10 / 20 / 50)</span>
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th className="p-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort("monthly_s20")}>
                                    <div className="flex items-center justify-center gap-1">
                                        <span>Monthly Stretch (10 / 20 / 50)</span>
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th className="p-3 text-center cursor-pointer hover:text-white" onClick={() => handleSort("velocity")}>
                                    <div className="flex items-center justify-center gap-1">
                                        <span>Kinetic Vector</span>
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th className="p-3 text-right">
                                    <span>Landing EMA20</span>
                                </th>
                                <th className="p-3 text-center">
                                    <span>Matrix HUD</span>
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

                                        {/* 2. Price & 1D % */}
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

                                        {/* 3. Turnover */}
                                        <td className="p-3 text-right font-mono text-gray-300">
                                            <div>₹{(item.turnover_cr ?? 0).toFixed(1)} Cr</div>
                                            <div className="text-[10px] text-gray-500 font-sans">
                                                {item.volume ? `${(item.volume / 1000).toFixed(0)}k vol` : "—"}
                                            </div>
                                        </td>

                                        {/* 4. Daily Stretch (10 / 20 / 50) */}
                                        <td className="p-2 text-center">
                                            <div className="inline-flex items-center gap-1">
                                                {renderMiniChip(m?.daily?.ema_10, "10")}
                                                {renderMiniChip(m?.daily?.ema_20, "20")}
                                                {renderMiniChip(m?.daily?.ema_50, "50")}
                                            </div>
                                        </td>

                                        {/* 5. Weekly Stretch (10 / 20 / 50) */}
                                        <td className="p-2 text-center">
                                            <div className="inline-flex items-center gap-1">
                                                {renderMiniChip(m?.weekly?.ema_10, "10")}
                                                {renderMiniChip(m?.weekly?.ema_20, "20")}
                                                {renderMiniChip(m?.weekly?.ema_50, "50")}
                                            </div>
                                        </td>

                                        {/* 6. Monthly Stretch (10 / 20 / 50) */}
                                        <td className="p-2 text-center">
                                            <div className="inline-flex items-center gap-1">
                                                {renderMiniChip(m?.monthly?.ema_10, "10")}
                                                {renderMiniChip(m?.monthly?.ema_20, "20")}
                                                {renderMiniChip(m?.monthly?.ema_50, "50")}
                                            </div>
                                        </td>

                                        {/* 7. Kinetic Vector */}
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

                                        {/* 8. Landing EMA20 */}
                                        <td className="p-3 text-right font-mono font-semibold text-cyan-300">
                                            {m?.landing_ema_20 ? `₹${m.landing_ema_20.toFixed(2)}` : "—"}
                                        </td>

                                        {/* 9. Action / Open HUD */}
                                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedStockForModal(item)}
                                                    className="px-2.5 py-1 rounded bg-[#38062b] hover:bg-[#581845] text-[#fce7f3] border border-[#670038] text-[11px] font-semibold transition-colors flex items-center gap-1"
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

            {/* 5. Pagination Controls */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between bg-[#12121d] px-4 py-3 rounded-xl border border-gray-800 text-xs">
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

            {/* 6. TradingView 9-Cell Matrix Popover Modal */}
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
