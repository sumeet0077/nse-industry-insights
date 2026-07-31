// components/CustomWatchlistRRGClient.tsx
"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { RRGChart } from "@/components/charts/RRGChart";
import type { RRGDataPoint, TimeframeType, QuadrantType, TrendDirectionType, TrendMetricType } from "@/types";
import { BROAD_MARKET, SECTORS, QUADRANTS, QUADRANT_COLORS, TIMEFRAMES } from "@/lib/config";
import { CaptureScreenshot } from "@/components/common/CaptureScreenshot";
import { useWatchlists } from "@/hooks/useWatchlists";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { StockRRGPayload, StockSearchIndex } from "@/lib/data";
import {
    BookmarkCheck,
    Plus,
    Trash2,
    Edit3,
    Check,
    X,
    Search,
    Download,
    Upload,
    RotateCcw,
    Copy,
    ExternalLink,
    Filter,
    Layers,
    ChevronDown,
    Sparkles,
} from "lucide-react";

interface CustomWatchlistRRGClientProps {
    stockSearchIndex?: StockSearchIndex;
    allStockRRGMap?: Record<string, StockRRGPayload | null>;
}

function cleanTicker(ticker: string): string {
    return ticker.replace(/\.NS$/i, "").replace(/\.BO$/i, "");
}

function toTVSymbol(ticker: string): string {
    const clean = cleanTicker(ticker);
    return `NSE:${clean.replace(/[&\-\s]/g, "_")}`;
}

export function CustomWatchlistRRGClient({ stockSearchIndex = {}, allStockRRGMap = {} }: CustomWatchlistRRGClientProps) {
    const {
        watchlists,
        activeWatchlist,
        activeId,
        isLoaded,
        setActiveId,
        createWatchlist,
        renameWatchlist,
        deleteWatchlist,
        addTicker,
        removeTicker,
        clearActiveWatchlist,
        resetToDefaults,
        exportWatchlistsJson,
        importWatchlistsJson,
    } = useWatchlists();

    // Benchmark selection (Default to Nifty 50)
    const [benchmarkId, setBenchmarkId] = useLocalStorage<string>("cw_benchmark", "market_breadth_nifty50");
    const [timeframe, setTimeframe] = useLocalStorage<TimeframeType>("cw_timeframe", "W");
    const [tailLength, setTailLength] = useLocalStorage<number>("cw_tailLength", 5);

    // Watchlist Management UI Modal / inline states
    const [isCreating, setIsCreating] = useState(false);
    const [newWatchlistName, setNewWatchlistName] = useState("");
    const [isRenaming, setIsRenaming] = useState(false);
    const [editName, setEditName] = useState("");
    const [stockSearchQuery, setStockSearchQuery] = useState("");
    const [isSearchOpen, setIsSearchOpen] = useState(false);

    // Filters
    const [selectedQuadrants, setSelectedQuadrants] = useLocalStorage<QuadrantType[]>("cw_selectedQuadrants", [...QUADRANTS]);
    const [expandedQuadrant, setExpandedQuadrant] = useState<QuadrantType | null>(null);
    const [hoverOnlyLabels, setHoverOnlyLabels] = useLocalStorage("cw_hoverOnlyLabels", false);
    const [topNCount, setTopNCount] = useLocalStorage<number | "All">("cw_topNCount", "All");
    const [copiedQuadrant, setCopiedQuadrant] = useState<string | null>(null);

    // Trend Scanner state
    const [trendDirection, setTrendDirection] = useLocalStorage<TrendDirectionType>("cw_trendDirection", "off");
    const [trendMetric, setTrendMetric] = useLocalStorage<TrendMetricType>("cw_trendMetric", "momentum");
    const [trendLookback, setTrendLookback] = useLocalStorage("cw_trendLookback", 5);

    // Table filter & search
    const [tableSearchQuery, setTableSearchQuery] = useState("");
    const [tableSortField, setTableSortField] = useState<"ticker" | "ratio" | "momentum" | "quadrant">("ratio");
    const [tableSortAsc, setTableSortAsc] = useState(false);

    const chartRef = useRef<HTMLDivElement>(null);

    // Get stock universe tickers list from search index
    const allUniverseTickers = useMemo(() => {
        const set = new Set<string>();
        for (const [sym, entries] of Object.entries(stockSearchIndex)) {
            const formatted = sym.endsWith(".NS") ? sym : `${sym}.NS`;
            set.add(formatted);
        }
        return Array.from(set).sort();
    }, [stockSearchIndex]);

    // Filter stock search results for autocomplete
    const searchResults = useMemo(() => {
        const q = stockSearchQuery.trim().toUpperCase();
        if (!q) return [];
        const cleanQ = q.replace(/\.NS$/, "");
        return allUniverseTickers
            .filter((t) => {
                const clean = cleanTicker(t);
                return clean.includes(cleanQ) && !activeWatchlist.tickers.includes(t);
            })
            .slice(0, 8);
    }, [stockSearchQuery, allUniverseTickers, activeWatchlist.tickers]);

    // Active stock RRG payload for the selected benchmark
    const activeBenchmarkPayload = useMemo(() => {
        return allStockRRGMap[benchmarkId] || null;
    }, [allStockRRGMap, benchmarkId]);

    // Raw RRG points for selected benchmark & timeframe
    const benchmarkRawData: RRGDataPoint[] = useMemo(() => {
        if (!activeBenchmarkPayload) return [];
        return activeBenchmarkPayload[timeframe] || [];
    }, [activeBenchmarkPayload, timeframe]);

    // Filter RRG points to include ONLY stocks present in the active watchlist
    const watchlistRawData = useMemo(() => {
        if (activeWatchlist.tickers.length === 0) return [];
        const activeSet = new Set(activeWatchlist.tickers.map((t) => t.toUpperCase()));
        const cleanSet = new Set(activeWatchlist.tickers.map((t) => cleanTicker(t).toUpperCase()));

        return benchmarkRawData.filter((pt) => {
            const ptUpper = pt.Ticker.toUpperCase();
            const ptClean = cleanTicker(pt.Ticker).toUpperCase();
            return activeSet.has(ptUpper) || cleanSet.has(ptClean);
        });
    }, [benchmarkRawData, activeWatchlist.tickers]);

    // Latest point per ticker for quadrant calculation
    const latestPoints = useMemo(() => {
        const map: Record<string, RRGDataPoint> = {};
        for (const pt of watchlistRawData) {
            if (!map[pt.Ticker] || pt.Date > map[pt.Ticker].Date) {
                map[pt.Ticker] = pt;
            }
        }
        return map;
    }, [watchlistRawData]);

    // Ticker -> Quadrant mapping
    const tickerQuadrants = useMemo(() => {
        const map: Record<string, QuadrantType> = {};
        for (const [ticker, last] of Object.entries(latestPoints)) {
            if (last) {
                const ratio = last.RS_Ratio;
                const mom = last.RS_Momentum;
                if (ratio >= 100 && mom >= 100) map[ticker] = "Leading";
                else if (ratio >= 100 && mom < 100) map[ticker] = "Weakening";
                else if (ratio < 100 && mom < 100) map[ticker] = "Lagging";
                else map[ticker] = "Improving";
            }
        }
        return map;
    }, [latestPoints]);

    // Calculate Top N tickers per quadrant
    const topNActiveTickers = useMemo(() => {
        if (topNCount === "All") return null;

        const activeSet = new Set<string>();
        for (const q of selectedQuadrants) {
            const quadTickers = Object.entries(tickerQuadrants)
                .filter(([_, quad]) => quad === q)
                .map(([t]) => t);

            const sortedByDistance = quadTickers
                .map((t) => {
                    const pt = latestPoints[t];
                    const dist = Math.sqrt(Math.pow(pt.RS_Ratio - 100, 2) + Math.pow(pt.RS_Momentum - 100, 2));
                    return { ticker: t, dist };
                })
                .sort((a, b) => b.dist - a.dist)
                .slice(0, topNCount)
                .map((item) => item.ticker);

            sortedByDistance.forEach((t) => activeSet.add(t));
        }

        return activeSet;
    }, [topNCount, selectedQuadrants, tickerQuadrants, latestPoints]);

    // Trend Scanner matching tickers
    const trendScannerActiveTickers = useMemo(() => {
        if (trendDirection === "off") return null;

        const historyByTicker: Record<string, RRGDataPoint[]> = {};
        for (const pt of watchlistRawData) {
            if (!historyByTicker[pt.Ticker]) historyByTicker[pt.Ticker] = [];
            historyByTicker[pt.Ticker].push(pt);
        }

        const activeSet = new Set<string>();

        for (const [t, points] of Object.entries(historyByTicker)) {
            if (points.length < 2) continue;
            points.sort((a, b) => a.Date.localeCompare(b.Date));

            const sliced = points.slice(-trendLookback);
            if (sliced.length < 2) continue;

            const first = sliced[0];
            const last = sliced[sliced.length - 1];

            if (trendMetric === "momentum") {
                const diff = last.RS_Momentum - first.RS_Momentum;
                if (trendDirection === "rising" && diff > 0) activeSet.add(t);
                if (trendDirection === "falling" && diff < 0) activeSet.add(t);
            } else {
                const diff = last.RS_Ratio - first.RS_Ratio;
                if (trendDirection === "rising" && diff > 0) activeSet.add(t);
                if (trendDirection === "falling" && diff < 0) activeSet.add(t);
            }
        }

        return activeSet;
    }, [trendDirection, trendMetric, trendLookback, watchlistRawData]);

    // Final filtered data to pass into RRGChart
    const finalChartData = useMemo(() => {
        return watchlistRawData.filter((pt) => {
            const quad = tickerQuadrants[pt.Ticker];
            if (!quad || !selectedQuadrants.includes(quad)) return false;
            if (topNActiveTickers && !topNActiveTickers.has(pt.Ticker)) return false;
            if (trendScannerActiveTickers && !trendScannerActiveTickers.has(pt.Ticker)) return false;
            return true;
        });
    }, [watchlistRawData, tickerQuadrants, selectedQuadrants, topNActiveTickers, trendScannerActiveTickers]);

    // Group tickers by quadrant for summary cards
    const quadrantLists = useMemo(() => {
        const res: Record<QuadrantType, { ticker: string; ratio: number; mom: number }[]> = {
            Leading: [],
            Weakening: [],
            Lagging: [],
            Improving: [],
        };
        for (const [t, pt] of Object.entries(latestPoints)) {
            const quad = tickerQuadrants[t];
            if (quad) {
                res[quad].push({ ticker: t, ratio: pt.RS_Ratio, mom: pt.RS_Momentum });
            }
        }
        for (const q of QUADRANTS) {
            res[q].sort((a, b) => b.ratio - a.ratio);
        }
        return res;
    }, [latestPoints, tickerQuadrants]);

    // Copy tickers to clipboard
    const copyTickers = (quadrant: QuadrantType) => {
        const list = quadrantLists[quadrant].map((i) => cleanTicker(i.ticker)).join(", ");
        navigator.clipboard.writeText(list);
        setCopiedQuadrant(quadrant);
        setTimeout(() => setCopiedQuadrant(null), 2000);
    };

    // Toggle quadrant selection
    const toggleQuadrant = (q: QuadrantType) => {
        setSelectedQuadrants((prev) => (prev.includes(q) ? prev.filter((item) => item !== q) : [...prev, q]));
    };

    // Watchlist creation handler
    const handleCreateWatchlist = () => {
        if (!newWatchlistName.trim()) return;
        createWatchlist(newWatchlistName.trim());
        setNewWatchlistName("");
        setIsCreating(false);
    };

    // Watchlist rename handler
    const handleRenameWatchlist = () => {
        if (!editName.trim()) return;
        renameWatchlist(activeWatchlist.id, editName.trim());
        setIsRenaming(false);
    };

    // Import Watchlists JSON
    const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            if (content) {
                const ok = importWatchlistsJson(content);
                if (ok) alert("Watchlists imported successfully!");
                else alert("Failed to import watchlists. Please check file format.");
            }
        };
        reader.readAsText(file);
    };

    // Export Watchlists JSON
    const handleExportJson = () => {
        const json = exportWatchlistsJson();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `custom_rrg_watchlists_${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Get title of selected benchmark
    const activeBenchmarkTitle = useMemo(() => {
        const bMatch = BROAD_MARKET.find((b) => b.dataFile === benchmarkId || b.id === benchmarkId);
        if (bMatch) return bMatch.title;
        const sMatch = SECTORS.find((s) => s.dataFile === benchmarkId || s.id === benchmarkId);
        if (sMatch) return sMatch.title;
        return benchmarkId;
    }, [benchmarkId]);

    // Filtered constituent table items
    const tableRows = useMemo(() => {
        const query = tableSearchQuery.trim().toLowerCase();
        let rows = Object.entries(latestPoints).map(([ticker, pt]) => {
            return {
                ticker,
                clean: cleanTicker(ticker),
                ratio: pt.RS_Ratio,
                momentum: pt.RS_Momentum,
                quadrant: tickerQuadrants[ticker] || "Lagging",
            };
        });

        if (query) {
            rows = rows.filter((r) => r.clean.toLowerCase().includes(query));
        }

        rows.sort((a, b) => {
            let res = 0;
            if (tableSortField === "ticker") res = a.clean.localeCompare(b.clean);
            else if (tableSortField === "ratio") res = b.ratio - a.ratio;
            else if (tableSortField === "momentum") res = b.momentum - a.momentum;
            else if (tableSortField === "quadrant") res = a.quadrant.localeCompare(b.quadrant);
            return tableSortAsc ? -res : res;
        });

        return rows;
    }, [latestPoints, tickerQuadrants, tableSearchQuery, tableSortField, tableSortAsc]);

    return (
        <div className="space-y-6">
            {/* Header Title & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111118] p-5 rounded-xl border border-[#1e1e2e]">
                <div>
                    <div className="flex items-center gap-2.5">
                        <BookmarkCheck className="h-6 w-6 text-blue-400" />
                        <h1 className="text-xl font-bold text-white tracking-tight">Custom Watchlist RRG</h1>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                        Build your custom stock watchlists and visualize Sector Rotation Graphs relative to any Broad Market or Sectoral Benchmark.
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <CaptureScreenshot targetRef={chartRef} filename={`Custom_RRG_${activeWatchlist.name}_vs_${benchmarkId}`} />

                    <button
                        onClick={handleExportJson}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a2e] hover:bg-[#252542] border border-slate-700/60 rounded-lg text-xs font-medium text-slate-300 transition-colors"
                        title="Export watchlists to JSON file"
                    >
                        <Download className="h-3.5 w-3.5" />
                        <span>Export</span>
                    </button>

                    <label className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a2e] hover:bg-[#252542] border border-slate-700/60 rounded-lg text-xs font-medium text-slate-300 cursor-pointer transition-colors">
                        <Upload className="h-3.5 w-3.5" />
                        <span>Import</span>
                        <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
                    </label>

                    <button
                        onClick={resetToDefaults}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a2e] hover:bg-[#252542] border border-slate-700/60 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
                        title="Reset watchlists to factory defaults"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reset</span>
                    </button>
                </div>
            </div>

            {/* Watchlist Bar & Selector */}
            <div className="bg-[#111118] p-4 rounded-xl border border-[#1e1e2e] space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Watchlist Tabs / Dropdown */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
                        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 shrink-0">
                            <Layers className="h-3.5 w-3.5 text-blue-400" />
                            Watchlist:
                        </span>

                        {watchlists.map((w) => {
                            const isActive = w.id === activeId;
                            return (
                                <button
                                    key={w.id}
                                    onClick={() => setActiveId(w.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap flex items-center gap-1.5 border ${
                                        isActive
                                            ? "bg-blue-600/20 text-blue-300 border-blue-500/50 shadow-sm"
                                            : "bg-[#1a1a2e] text-slate-400 border-slate-800 hover:bg-[#252542] hover:text-slate-200"
                                    }`}
                                >
                                    <span>{w.name}</span>
                                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 text-slate-400">
                                        {w.tickers.length}
                                    </span>
                                </button>
                            );
                        })}

                        {/* Create Watchlist Button */}
                        {!isCreating ? (
                            <button
                                onClick={() => {
                                    setIsCreating(true);
                                    setNewWatchlistName("");
                                }}
                                className="px-2.5 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 shrink-0"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                <span>New List</span>
                            </button>
                        ) : (
                            <div className="flex items-center gap-1.5 bg-[#1a1a2e] border border-blue-500/50 rounded-lg p-1">
                                <input
                                    type="text"
                                    placeholder="Watchlist Name..."
                                    value={newWatchlistName}
                                    onChange={(e) => setNewWatchlistName(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleCreateWatchlist()}
                                    className="bg-transparent border-none text-xs text-white px-2 py-0.5 focus:outline-none w-36"
                                    autoFocus
                                />
                                <button
                                    onClick={handleCreateWatchlist}
                                    className="p-1 bg-blue-600 text-white rounded hover:bg-blue-500"
                                >
                                    <Check className="h-3 w-3" />
                                </button>
                                <button
                                    onClick={() => setIsCreating(false)}
                                    className="p-1 text-slate-400 hover:text-white"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Rename / Delete Active Watchlist */}
                    <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                        {isRenaming ? (
                            <div className="flex items-center gap-1 bg-[#1a1a2e] border border-slate-700 rounded-lg p-1">
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleRenameWatchlist()}
                                    className="bg-transparent text-xs text-white px-2 py-0.5 focus:outline-none w-32"
                                    autoFocus
                                />
                                <button onClick={handleRenameWatchlist} className="p-1 bg-blue-600 text-white rounded">
                                    <Check className="h-3 w-3" />
                                </button>
                                <button onClick={() => setIsRenaming(false)} className="p-1 text-slate-400">
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => {
                                    setEditName(activeWatchlist.name);
                                    setIsRenaming(true);
                                }}
                                className="p-1.5 bg-[#1a1a2e] hover:bg-[#252542] text-slate-400 hover:text-white border border-slate-800 rounded-lg text-xs transition-colors"
                                title="Rename current watchlist"
                            >
                                <Edit3 className="h-3.5 w-3.5" />
                            </button>
                        )}

                        {watchlists.length > 1 && (
                            <button
                                onClick={() => {
                                    if (confirm(`Delete watchlist "${activeWatchlist.name}"?`)) {
                                        deleteWatchlist(activeWatchlist.id);
                                    }
                                }}
                                className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs transition-colors"
                                title="Delete current watchlist"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Stock Picker Input & Stock Badges */}
                <div className="pt-2 border-t border-[#1e1e2e] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Search & Add Stock */}
                        <div className="relative flex-1 max-w-md">
                            <div className="flex items-center bg-[#1a1a2e] border border-slate-700/60 rounded-lg px-3 py-1.5 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/30 transition-colors">
                                <Search className="h-3.5 w-3.5 text-slate-400 mr-2 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Add stock (e.g. RELIANCE, TATASTEEL, DELHIVERY)..."
                                    value={stockSearchQuery}
                                    onChange={(e) => {
                                        setStockSearchQuery(e.target.value);
                                        setIsSearchOpen(true);
                                    }}
                                    onFocus={() => setIsSearchOpen(true)}
                                    className="bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none w-full"
                                />
                                {stockSearchQuery && (
                                    <button
                                        onClick={() => {
                                            setStockSearchQuery("");
                                            setIsSearchOpen(false);
                                        }}
                                        className="text-slate-500 hover:text-slate-300"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>

                            {/* Autocomplete Dropdown */}
                            {isSearchOpen && searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-[#181824] border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden max-h-56 overflow-y-auto">
                                    {searchResults.map((t) => (
                                        <button
                                            key={t}
                                            onClick={() => {
                                                addTicker(t);
                                                setStockSearchQuery("");
                                                setIsSearchOpen(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-blue-600/20 hover:text-blue-300 flex items-center justify-between transition-colors"
                                        >
                                            <span className="font-semibold">{cleanTicker(t)}</span>
                                            <span className="text-[10px] text-slate-500">{t}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Quick Actions */}
                        <div className="flex items-center gap-2">
                            {activeWatchlist.tickers.length > 0 && (
                                <button
                                    onClick={clearActiveWatchlist}
                                    className="px-2.5 py-1 bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded text-[11px] font-medium border border-slate-700/40 transition-colors"
                                >
                                    Clear Tickers
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Stock Badges Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 max-h-28 overflow-y-auto pr-1">
                        {activeWatchlist.tickers.length === 0 ? (
                            <p className="text-xs text-slate-500 italic py-1">
                                No stocks in this watchlist. Use the search bar above to add stocks!
                            </p>
                        ) : (
                            activeWatchlist.tickers.map((t) => (
                                <span
                                    key={t}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20 group hover:border-blue-500/40 transition-colors"
                                >
                                    <span>{cleanTicker(t)}</span>
                                    <button
                                        onClick={() => removeTicker(t)}
                                        className="text-slate-400 group-hover:text-red-400 p-0.5 rounded transition-colors"
                                        title={`Remove ${t}`}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </span>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Benchmark Selector & Chart Controls */}
            <div className="bg-[#111118] p-4 rounded-xl border border-[#1e1e2e] space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    {/* Benchmark Selection (Grouped Optgroups) */}
                    <div className="md:col-span-5 flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Layers className="h-3 w-3 text-blue-400" />
                            Benchmark Index
                        </label>
                        <div className="relative">
                            <select
                                value={benchmarkId}
                                onChange={(e) => setBenchmarkId(e.target.value)}
                                className="w-full bg-[#1a1a2e] border border-slate-700/60 rounded-lg px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-colors appearance-none cursor-pointer pr-8"
                            >
                                <optgroup label="Broad Market Indices">
                                    {BROAD_MARKET.map((b) => (
                                        <option key={b.dataFile} value={b.dataFile}>
                                            {b.title} ({b.description})
                                        </option>
                                    ))}
                                </optgroup>

                                <optgroup label="Sectoral Indices">
                                    {SECTORS.map((s) => (
                                        <option key={s.dataFile} value={s.dataFile}>
                                            {s.title} ({s.description})
                                        </option>
                                    ))}
                                </optgroup>
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Timeframe Toggles */}
                    <div className="md:col-span-4 flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Timeframe
                        </label>
                        <div className="flex bg-[#1a1a2e] p-1 rounded-lg border border-slate-800">
                            {(["D", "W", "M"] as TimeframeType[]).map((tf) => (
                                <button
                                    key={tf}
                                    onClick={() => setTimeframe(tf)}
                                    className={`flex-1 py-1 text-xs font-semibold rounded-md transition-colors ${
                                        timeframe === tf
                                            ? "bg-blue-600 text-white shadow-sm"
                                            : "text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    {TIMEFRAMES[tf]} ({tf})
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tail Length & Hover Mode */}
                    <div className="md:col-span-3 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            <span>Tail Length: {tailLength}</span>
                            <button
                                onClick={() => setHoverOnlyLabels(!hoverOnlyLabels)}
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                    hoverOnlyLabels
                                        ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
                                        : "bg-slate-800 text-slate-400 border-slate-700"
                                }`}
                            >
                                {hoverOnlyLabels ? "Hover Only" : "Always Show Labels"}
                            </button>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="15"
                            value={tailLength}
                            onChange={(e) => setTailLength(Number(e.target.value))}
                            className="w-full h-2 bg-[#1a1a2e] rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                    </div>
                </div>
            </div>

            {/* Quadrant Badges & Filters Bar */}
            <div className="bg-[#111118] p-4 rounded-xl border border-[#1e1e2e] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
                            <Filter className="h-3.5 w-3.5 text-blue-400" />
                            Quadrants:
                        </span>
                        {QUADRANTS.map((q) => {
                            const isSelected = selectedQuadrants.includes(q);
                            const count = quadrantLists[q].length;
                            const color = QUADRANT_COLORS[q];
                            return (
                                <button
                                    key={q}
                                    onClick={() => toggleQuadrant(q)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5 ${
                                        isSelected
                                            ? color === "emerald"
                                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                                : color === "yellow"
                                                ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/40"
                                                : color === "red"
                                                ? "bg-red-500/20 text-red-300 border-red-500/40"
                                                : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                                            : "bg-[#1a1a2e] text-slate-500 border-slate-800 opacity-60 hover:opacity-100"
                                    }`}
                                >
                                    <span>{q}</span>
                                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40">
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Top N Filter */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 self-start sm:self-center">
                        <span className="font-semibold">Top N Filter:</span>
                        <div className="flex bg-[#1a1a2e] rounded-lg p-0.5 border border-slate-800">
                            {(["All", 3, 5, 10] as (number | "All")[]).map((n) => (
                                <button
                                    key={String(n)}
                                    onClick={() => setTopNCount(n)}
                                    className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                                        topNCount === n
                                            ? "bg-blue-600 text-white"
                                            : "text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    {n === "All" ? "All" : `Top ${n}`}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Trend Scanner */}
                <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#1e1e2e] text-xs">
                    <span className="font-semibold text-slate-400 flex items-center gap-1">
                        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                        Trend Scanner:
                    </span>

                    <div className="flex items-center gap-1.5 bg-[#1a1a2e] p-1 rounded-lg border border-slate-800">
                        <button
                            onClick={() => setTrendDirection("off")}
                            className={`px-2.5 py-0.5 text-[11px] font-medium rounded ${
                                trendDirection === "off" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            Off
                        </button>
                        <button
                            onClick={() => setTrendDirection("rising")}
                            className={`px-2.5 py-0.5 text-[11px] font-medium rounded ${
                                trendDirection === "rising" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            Rotating Up ↗
                        </button>
                        <button
                            onClick={() => setTrendDirection("falling")}
                            className={`px-2.5 py-0.5 text-[11px] font-medium rounded ${
                                trendDirection === "falling" ? "bg-red-600 text-white" : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            Rotating Down ↘
                        </button>
                    </div>

                    {trendDirection !== "off" && (
                        <div className="flex items-center gap-2">
                            <select
                                value={trendMetric}
                                onChange={(e) => setTrendMetric(e.target.value as TrendMetricType)}
                                className="bg-[#1a1a2e] border border-slate-700 text-white text-xs px-2 py-1 rounded"
                            >
                                <option value="momentum">RS-Momentum</option>
                                <option value="ratio">RS-Ratio</option>
                            </select>

                            <span className="text-slate-500">over</span>

                            <select
                                value={trendLookback}
                                onChange={(e) => setTrendLookback(Number(e.target.value))}
                                className="bg-[#1a1a2e] border border-slate-700 text-white text-xs px-2 py-1 rounded"
                            >
                                <option value={3}>3 Bars</option>
                                <option value={5}>5 Bars</option>
                                <option value={10}>10 Bars</option>
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* RRG Chart Display Container */}
            <div ref={chartRef} className="bg-[#111118] p-4 rounded-xl border border-[#1e1e2e] shadow-xl">
                <div className="flex items-center justify-between mb-3 px-2">
                    <div>
                        <h2 className="text-sm font-bold text-white flex items-center gap-2">
                            <span>Watchlist: {activeWatchlist.name}</span>
                            <span className="text-xs font-normal text-slate-400">vs {activeBenchmarkTitle}</span>
                        </h2>
                    </div>
                    <span className="text-xs font-semibold text-blue-400">
                        {finalChartData.length > 0 ? `${new Set(finalChartData.map(d => d.Ticker)).size} Stocks Plotted` : "No stocks matching filter"}
                    </span>
                </div>

                {activeWatchlist.tickers.length === 0 ? (
                    <div className="h-96 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-800 rounded-xl bg-[#161622]">
                        <BookmarkCheck className="h-10 w-10 text-slate-600 mb-2" />
                        <p className="text-sm font-medium text-slate-400">Watchlist is Empty</p>
                        <p className="text-xs text-slate-500 mt-1 max-w-sm">
                            Add stocks to &ldquo;{activeWatchlist.name}&rdquo; using the search box above to plot their Relative Rotation Graph trajectories.
                        </p>
                    </div>
                ) : (
                    <RRGChart
                        data={finalChartData}
                        tailLength={tailLength}
                        timeframe={timeframe}
                    />
                )}
            </div>

            {/* Quadrant Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {QUADRANTS.map((quadrant) => {
                    const list = quadrantLists[quadrant];
                    const color = QUADRANT_COLORS[quadrant];
                    const isCopied = copiedQuadrant === quadrant;

                    return (
                        <div
                            key={quadrant}
                            className={`bg-[#111118] p-4 rounded-xl border transition-all ${
                                color === "emerald"
                                    ? "border-emerald-500/30 hover:border-emerald-500/50"
                                    : color === "yellow"
                                    ? "border-yellow-500/30 hover:border-yellow-500/50"
                                    : color === "red"
                                    ? "border-red-500/30 hover:border-red-500/50"
                                    : "border-blue-500/30 hover:border-blue-500/50"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#1e1e2e]">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`w-2.5 h-2.5 rounded-full ${
                                            color === "emerald"
                                                ? "bg-emerald-400"
                                                : color === "yellow"
                                                ? "bg-yellow-400"
                                                : color === "red"
                                                ? "bg-red-400"
                                                : "bg-blue-400"
                                        }`}
                                    />
                                    <h3 className="font-bold text-sm text-white">{quadrant}</h3>
                                    <span className="text-xs text-slate-500">({list.length})</span>
                                </div>

                                {list.length > 0 && (
                                    <button
                                        onClick={() => copyTickers(quadrant)}
                                        className="p-1 text-slate-500 hover:text-slate-200 transition-colors"
                                        title="Copy tickers to clipboard"
                                    >
                                        {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                    </button>
                                )}
                            </div>

                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                {list.length === 0 ? (
                                    <p className="text-xs text-slate-500 italic py-2 text-center">No stocks in {quadrant}</p>
                                ) : (
                                    list.map((item) => (
                                        <div
                                            key={item.ticker}
                                            className="flex items-center justify-between p-2 rounded-lg bg-[#161622] border border-slate-800/80 hover:border-slate-700 text-xs transition-colors"
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <a
                                                    href={`https://www.tradingview.com/chart/?symbol=${toTVSymbol(item.ticker)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-bold text-slate-200 hover:text-blue-400 flex items-center gap-1"
                                                >
                                                    <span>{cleanTicker(item.ticker)}</span>
                                                    <ExternalLink className="h-2.5 w-2.5 text-slate-500" />
                                                </a>
                                            </div>
                                            <div className="text-right font-mono text-[11px] text-slate-400">
                                                <span className="text-slate-300">{item.ratio.toFixed(1)}</span>
                                                <span className="text-slate-600 mx-1">/</span>
                                                <span>{item.mom.toFixed(1)}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Watchlist Constituent Data Table */}
            <div className="bg-[#111118] p-4 rounded-xl border border-[#1e1e2e] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Watchlist Constituents Data</span>
                        <span className="text-xs text-slate-400">({tableRows.length} stocks)</span>
                    </h3>

                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Filter table stocks..."
                            value={tableSearchQuery}
                            onChange={(e) => setTableSearchQuery(e.target.value)}
                            className="w-full bg-[#1a1a2e] border border-slate-700/60 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-[#1e1e2e] text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                                <th
                                    onClick={() => {
                                        setTableSortField("ticker");
                                        setTableSortAsc(!tableSortAsc);
                                    }}
                                    className="pb-2 cursor-pointer hover:text-white"
                                >
                                    Stock Ticker
                                </th>
                                <th
                                    onClick={() => {
                                        setTableSortField("quadrant");
                                        setTableSortAsc(!tableSortAsc);
                                    }}
                                    className="pb-2 cursor-pointer hover:text-white"
                                >
                                    Quadrant
                                </th>
                                <th
                                    onClick={() => {
                                        setTableSortField("ratio");
                                        setTableSortAsc(!tableSortAsc);
                                    }}
                                    className="pb-2 text-right cursor-pointer hover:text-white"
                                >
                                    RS-Ratio
                                </th>
                                <th
                                    onClick={() => {
                                        setTableSortField("momentum");
                                        setTableSortAsc(!tableSortAsc);
                                    }}
                                    className="pb-2 text-right cursor-pointer hover:text-white"
                                >
                                    RS-Momentum
                                </th>
                                <th className="pb-2 text-right">Chart</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e1e2e]">
                            {tableRows.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-4 text-center text-slate-500 italic">
                                        No constituents found matching search query
                                    </td>
                                </tr>
                            ) : (
                                tableRows.map((row) => {
                                    const quadColor = QUADRANT_COLORS[row.quadrant as QuadrantType];
                                    return (
                                        <tr key={row.ticker} className="hover:bg-[#161622] transition-colors">
                                            <td className="py-2.5 font-bold text-white">{row.clean}</td>
                                            <td className="py-2.5">
                                                <span
                                                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                                        quadColor === "emerald"
                                                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                                            : quadColor === "yellow"
                                                            ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                                                            : quadColor === "red"
                                                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                                            : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                                    }`}
                                                >
                                                    {row.quadrant}
                                                </span>
                                            </td>
                                            <td className="py-2.5 text-right font-mono font-medium text-slate-200">
                                                {row.ratio.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 text-right font-mono font-medium text-slate-200">
                                                {row.momentum.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 text-right">
                                                <a
                                                    href={`https://www.tradingview.com/chart/?symbol=${toTVSymbol(row.ticker)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-medium"
                                                >
                                                    <span>View</span>
                                                    <ExternalLink className="h-3 w-3" />
                                                </a>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
