// components/CustomWatchlistRRGClient.tsx
"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { RRGChart } from "@/components/charts/RRGChart";
import type { RRGDataPoint, TimeframeType, QuadrantType, TrendMetricDirectionType, OriginDistanceType, SuperTrendPresetType } from "@/types";
import { BROAD_MARKET, SECTORS, QUADRANTS, QUADRANT_COLORS, TIMEFRAMES, ORIGIN_RADIUS_MAP } from "@/lib/config";
import { calculateOriginDistance, calculateSuperTrendScore } from "@/lib/rrg";
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
    Layers,
    ChevronDown,
    ExternalLink,
    Filter,
    Sparkles,
    Copy,
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

    // Chart Filters & Controls
    const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
    const [selectedQuadrants, setSelectedQuadrants] = useLocalStorage<QuadrantType[]>("cw_selectedQuadrants", [...QUADRANTS]);
    const [expandedQuadrant, setExpandedQuadrant] = useState<QuadrantType | null>(null);
    const [gridQuadrantFilter, setGridQuadrantFilter] = useState<"All" | QuadrantType>("All");
    const [topNCount, setTopNCount] = useLocalStorage<number | "All">("cw_topNCount", "All");
    const [copiedQuadrant, setCopiedQuadrant] = useState<string | null>(null);
    const [chipSearchQuery, setChipSearchQuery] = useState("");

    // Trend Scanner state — independent per-metric direction & Origin Distance
    const [momentumDir, setMomentumDir] = useLocalStorage<TrendMetricDirectionType>("cw_momentumDir", "off");
    const [ratioDir, setRatioDir] = useLocalStorage<TrendMetricDirectionType>("cw_ratioDir", "off");
    const [originDist, setOriginDist] = useLocalStorage<OriginDistanceType>("cw_originDist", "off");
    const [superTrendPreset, setSuperTrendPreset] = useLocalStorage<SuperTrendPresetType>("cw_preset", "off");
    const [trendLookback, setTrendLookback] = useLocalStorage<number>("cw_trendLookback", 3);
    const [isCopied, setIsCopied] = useState(false);


    // Leaderboard sorting & filtering state
    type LeaderboardSortField = "ticker" | "quadrant" | "ratio" | "momentum" | "distance" | "accel" | "score";
    const [leaderboardSortField, setLeaderboardSortField] = useState<LeaderboardSortField>("score");
    const [leaderboardSortAsc, setLeaderboardSortAsc] = useState<boolean>(false);
    const [leaderboardQuadFilter, setLeaderboardQuadFilter] = useState<"All" | QuadrantType>("All");

    // Table filter & search
    const [tableSearchQuery, setTableSearchQuery] = useState("");
    const [tableSortField, setTableSortField] = useState<"ticker" | "ratio" | "momentum" | "quadrant">("ratio");
    const [tableSortAsc, setTableSortAsc] = useState(false);

    const contentRef = useRef<HTMLDivElement>(null);

    // Get stock universe tickers list from search index
    const allUniverseTickers = useMemo(() => {
        const set = new Set<string>();
        for (const [sym] of Object.entries(stockSearchIndex)) {
            const formatted = sym.endsWith(".NS") ? sym : `${sym}.NS`;
            set.add(formatted);
        }
        return Array.from(set).sort();
    }, [stockSearchIndex]);

    // Dynamic client-side fetch cache for benchmark stock RRG JSON payloads
    const [dynamicRRGMap, setDynamicRRGMap] = useState<Record<string, StockRRGPayload | null>>(allStockRRGMap);

    useEffect(() => {
        if (!dynamicRRGMap[benchmarkId]) {
            fetch(`/data/stock_rrg/${benchmarkId}.json`)
                .then((res) => (res.ok ? res.json() : null))
                .then((data: StockRRGPayload | null) => {
                    if (data) {
                        setDynamicRRGMap((prev) => ({ ...prev, [benchmarkId]: data }));
                    }
                })
                .catch(() => {});
        }
    }, [benchmarkId, dynamicRRGMap]);

    // Active stock RRG payload for the selected benchmark
    const activeBenchmarkPayload = useMemo(() => {
        return dynamicRRGMap[benchmarkId] || allStockRRGMap[benchmarkId] || null;
    }, [dynamicRRGMap, allStockRRGMap, benchmarkId]);

    // Raw RRG points for selected benchmark & timeframe
    const benchmarkRawData: RRGDataPoint[] = useMemo(() => {
        if (!activeBenchmarkPayload) return [];
        return activeBenchmarkPayload[timeframe] || [];
    }, [activeBenchmarkPayload, timeframe]);

    const skippedStocks: string[] = useMemo(() => {
        if (!activeBenchmarkPayload || !activeBenchmarkPayload.skipped) return [];
        return activeBenchmarkPayload.skipped[timeframe] || [];
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

    // Initialize selectedTickers to include all active watchlist tickers when watchlist changes
    useEffect(() => {
        if (activeWatchlist.tickers.length > 0) {
            setSelectedTickers(activeWatchlist.tickers);
        } else {
            setSelectedTickers([]);
        }
    }, [activeWatchlist.tickers]);

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

    // Group data by ticker for trend scanner
    const groupedByTicker = useMemo(() => {
        const grouped: Record<string, RRGDataPoint[]> = {};
        for (const pt of watchlistRawData) {
            if (!grouped[pt.Ticker]) grouped[pt.Ticker] = [];
            grouped[pt.Ticker].push(pt);
        }
        for (const ticker of Object.keys(grouped)) {
            grouped[ticker].sort((a, b) => a.Date.localeCompare(b.Date));
        }
        return grouped;
    }, [watchlistRawData]);

    // Calculate Top N tickers per quadrant (ranked by distance magnitude from 100,100)
    const topNActiveTickers = useMemo(() => {
        if (topNCount === "All") return null;

        const activeSet = new Set<string>();
        for (const q of selectedQuadrants) {
            const quadTickers = activeWatchlist.tickers.filter((t) => tickerQuadrants[t] === q);

            const sortedByDistance = quadTickers
                .map((t) => {
                    const pt = latestPoints[t];
                    const dist = pt ? Math.sqrt(Math.pow(pt.RS_Ratio - 100, 2) + Math.pow(pt.RS_Momentum - 100, 2)) : 0;
                    return { ticker: t, dist };
                })
                .sort((a, b) => b.dist - a.dist)
                .slice(0, topNCount)
                .map((item) => item.ticker);

            sortedByDistance.forEach((t) => activeSet.add(t));
        }

        return activeSet;
    }, [topNCount, selectedQuadrants, activeWatchlist.tickers, tickerQuadrants, latestPoints]);

    const activeTopNSet = useMemo(() => {
        return topNActiveTickers ? new Set(topNActiveTickers) : null;
    }, [topNActiveTickers]);

    // Trend Scanner: independent per-metric direction & Origin Distance
    const scannerIsActive = momentumDir !== "off" || ratioDir !== "off" || originDist !== "off" || superTrendPreset !== "off";

    const resetScanner = useCallback(() => {
        setMomentumDir("off");
        setRatioDir("off");
        setOriginDist("off");
        setSuperTrendPreset("off");
    }, [setMomentumDir, setRatioDir, setOriginDist, setSuperTrendPreset]);

    const trendMatchingTickers = useMemo(() => {
        if (momentumDir === "off" && ratioDir === "off" && originDist === "off" && superTrendPreset === "off") return null;

        const matches: string[] = [];
        const radiusLimit = ORIGIN_RADIUS_MAP[originDist as keyof typeof ORIGIN_RADIUS_MAP] ?? null;

        for (const ticker of activeWatchlist.tickers) {
            const points = groupedByTicker[ticker];
            if (!points || points.length < 2) continue;

            const effectiveLookback = Math.min(trendLookback, points.length - 1);
            const tail = points.slice(-(effectiveLookback + 1));
            const head = tail[tail.length - 1];
            const start = tail[0];
            const prev = tail.length >= 2 ? tail[tail.length - 2] : start;

            // 1. Origin Distance Check
            if (radiusLimit !== null) {
                const dist = calculateOriginDistance(head.RS_Ratio, head.RS_Momentum);
                if (dist > radiusLimit) continue;
            }

            // 2. Net Vector Trajectory & Recency Check
            const deltaM = head.RS_Momentum - start.RS_Momentum;
            const deltaR = head.RS_Ratio - start.RS_Ratio;
            const recencyM = head.RS_Momentum - prev.RS_Momentum;
            const recencyR = head.RS_Ratio - prev.RS_Ratio;

            let isMatch = true;

            if (momentumDir === "rising") {
                if (deltaM <= 0 && recencyM <= 0) isMatch = false;
            } else if (momentumDir === "falling") {
                if (deltaM >= 0 && recencyM >= 0) isMatch = false;
            }

            if (ratioDir === "rising") {
                if (deltaR <= 0 && recencyR <= 0) isMatch = false;
            } else if (ratioDir === "falling") {
                if (deltaR >= 0 && recencyR >= 0) isMatch = false;
            }

            if (isMatch) matches.push(ticker);
        }
        return matches;
    }, [momentumDir, ratioDir, originDist, superTrendPreset, trendLookback, activeWatchlist.tickers, groupedByTicker]);

    // Derive active preset from current toggle states
    const activePreset = useMemo(() => {
        if (superTrendPreset !== "off") return superTrendPreset;
        if (momentumDir === "rising"  && ratioDir === "rising" && originDist === "off")  return "improving";
        if (momentumDir === "falling" && ratioDir === "rising" && originDist === "off")  return "leading";
        if (momentumDir === "falling" && ratioDir === "falling" && originDist === "off") return "weakening";
        if (momentumDir === "rising"  && ratioDir === "falling" && originDist === "off") return "lagging";
        return "off";
    }, [superTrendPreset, momentumDir, ratioDir, originDist]);

    const applyTrendScanner = useCallback(() => {
        if (trendMatchingTickers) {
            setSelectedTickers(trendMatchingTickers);
        }
    }, [trendMatchingTickers]);

    useEffect(() => {
        if (scannerIsActive && trendMatchingTickers) {
            applyTrendScanner();
        }
    }, [momentumDir, ratioDir, originDist, superTrendPreset, trendLookback, applyTrendScanner, trendMatchingTickers, scannerIsActive]);


    // Final filtered chart dataset
    const finalChartData = useMemo(() => {
        if (!watchlistRawData || watchlistRawData.length === 0) return [];
        if (!selectedQuadrants || selectedQuadrants.length === 0) return [];
        if (!selectedTickers || selectedTickers.length === 0) return [];

        const quadSet = new Set(selectedQuadrants);
        const tickerSet = new Set(selectedTickers);

        return watchlistRawData.filter((pt) => {
            if (!pt || !pt.Ticker) return false;
            const quad = tickerQuadrants[pt.Ticker];
            if (!quad || !quadSet.has(quad)) return false;
            if (!tickerSet.has(pt.Ticker)) return false;
            if (activeTopNSet && !activeTopNSet.has(pt.Ticker)) return false;
            return true;
        });
    }, [watchlistRawData, tickerQuadrants, selectedQuadrants, selectedTickers, activeTopNSet]);

    // Stock Chip Grid Tickers Search & Quadrant Filter
    const filteredGridTickers = useMemo(() => {
        let list = activeWatchlist.tickers;
        if (chipSearchQuery.trim()) {
            const q = chipSearchQuery.trim().toLowerCase();
            list = list.filter((t) => cleanTicker(t).toLowerCase().includes(q) || t.toLowerCase().includes(q));
        }
        if (gridQuadrantFilter !== "All") {
            list = list.filter((t) => tickerQuadrants[t] === gridQuadrantFilter);
        }
        return list;
    }, [activeWatchlist.tickers, chipSearchQuery, gridQuadrantFilter, tickerQuadrants]);

    const toggleTicker = (ticker: string) => {
        if (scannerIsActive) resetScanner();
        if (selectedTickers.includes(ticker)) {
            setSelectedTickers(selectedTickers.filter((t) => t !== ticker));
        } else {
            setSelectedTickers([...selectedTickers, ticker]);
        }
    };

    const toggleQuadrant = (q: QuadrantType) => {
        if (selectedQuadrants.includes(q)) {
            setSelectedQuadrants(selectedQuadrants.filter((item) => item !== q));
        } else {
            setSelectedQuadrants([...selectedQuadrants, q]);
        }
    };

    // Copy TradingView Watchlist format
    const handleCopyWatchlist = (quadrantName: string, tickers: string[]) => {
        const watchlist = tickers.map(toTVSymbol).join(", ");
        navigator.clipboard.writeText(watchlist);
        setCopiedQuadrant(quadrantName);
        setTimeout(() => setCopiedQuadrant(null), 2000);
    };

    // Get title of selected benchmark
    const activeBenchmarkTitle = useMemo(() => {
        const bMatch = BROAD_MARKET.find((b) => b.dataFile === benchmarkId || b.id === benchmarkId);
        if (bMatch) return bMatch.title;
        const sMatch = SECTORS.find((s) => s.dataFile === benchmarkId || s.id === benchmarkId);
        if (sMatch) return sMatch.title;
        return benchmarkId;
    }, [benchmarkId]);

    // Watchlist management handlers
    const handleCreateWatchlist = () => {
        if (!newWatchlistName.trim()) return;
        createWatchlist(newWatchlistName.trim());
        setNewWatchlistName("");
        setIsCreating(false);
    };

    const handleRenameWatchlist = () => {
        if (!editName.trim()) return;
        renameWatchlist(activeWatchlist.id, editName.trim());
        setIsRenaming(false);
    };

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

    // Filtered constituent table items
    const tableRows = useMemo(() => {
        const query = tableSearchQuery.trim().toLowerCase();
        let rows = Object.entries(latestPoints).map(([ticker, pt]) => {
            const quad = tickerQuadrants[ticker] || "Lagging";
            const dist = Math.sqrt(Math.pow(pt.RS_Ratio - 100, 2) + Math.pow(pt.RS_Momentum - 100, 2));
            return {
                ticker,
                clean: cleanTicker(ticker),
                ratio: pt.RS_Ratio,
                momentum: pt.RS_Momentum,
                distance: dist,
                quadrant: quad,
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

    const matchCount = trendMatchingTickers?.length ?? 0;

    return (
        <div ref={contentRef} className="py-2 space-y-6">
            {/* Header Title & Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111118] p-5 rounded-xl border border-[#1e1e2e]">
                <div>
                    <div className="flex items-center gap-2.5">
                        <BookmarkCheck className="h-6 w-6 text-blue-400" />
                        <h1 className="text-xl font-bold text-white tracking-tight">
                            Custom Stock Watchlist Rotation (vs {activeBenchmarkTitle})
                        </h1>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                        Build your custom stock watchlists and analyze Relative Rotation Graphs compared to any Broad Market or Sectoral Benchmark.
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <CaptureScreenshot targetRef={contentRef} filename={`Custom_RRG_${activeWatchlist.name}_vs_${benchmarkId}`} label="Capture RRG" />

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

            {/* Watchlist Bar & Stock Picker */}
            <div className="bg-[#111118] p-4 rounded-xl border border-[#1e1e2e] space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Watchlist Tabs */}
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

                {/* Stock Picker Input & Stock Pills */}
                <div className="pt-2 border-t border-[#1e1e2e] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="relative flex-1 max-w-md">
                            <div className="flex items-center bg-[#1a1a2e] border border-slate-700/60 rounded-lg px-3 py-1.5 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/30 transition-colors">
                                <Search className="h-3.5 w-3.5 text-slate-400 mr-2 shrink-0" />
                                <input
                                    type="text"
                                    placeholder="Add stock to watchlist (e.g. INFY, PSPPROJECT, OFSS, RELIANCE)..."
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

                        {activeWatchlist.tickers.length > 0 && (
                            <button
                                onClick={clearActiveWatchlist}
                                className="px-2.5 py-1 bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded text-[11px] font-medium border border-slate-700/40 transition-colors"
                            >
                                Clear Tickers
                            </button>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto pr-1">
                        {activeWatchlist.tickers.length === 0 ? (
                            <p className="text-xs text-slate-500 italic py-1">
                                No stocks in this watchlist. Search and add stocks using the input above!
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

            {/* Controls Bar matching StockRRGClient */}
            <div className="flex flex-col gap-6 bg-[#111118] border border-[#1e1e2e] p-4 rounded-lg">
                <div className="flex flex-col md:flex-row gap-6">
                    {/* Benchmark Selection (Grouped Optgroups) */}
                    <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-2 font-semibold flex items-center gap-1">
                            <span>Benchmark Index</span>
                        </label>
                        <select
                            value={benchmarkId}
                            onChange={(e) => setBenchmarkId(e.target.value)}
                            className="w-full bg-[#1a1a2e] border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                    </div>

                    {/* Timeframe Selector */}
                    <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-2 font-semibold">
                            Timeframe
                        </label>
                        <select
                            value={timeframe}
                            onChange={(e) => setTimeframe(e.target.value as TimeframeType)}
                            className="w-full bg-[#1a1a2e] border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="D">Daily</option>
                            <option value="W">Weekly</option>
                            <option value="M">Monthly</option>
                        </select>
                    </div>

                    {/* Tail Length Slider */}
                    <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-2 font-semibold flex justify-between">
                            <span>Tail Length (Periods)</span>
                            <span className="text-blue-400 font-bold">{tailLength}</span>
                        </label>
                        <input
                            type="range"
                            min="1"
                            max="12"
                            value={tailLength}
                            onChange={(e) => {
                                const newTail = parseInt(e.target.value);
                                setTailLength(newTail);
                                if (trendLookback > newTail) setTrendLookback(newTail);
                            }}
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-2"
                        />
                    </div>
                </div>

                {/* Trend Scanner Section */}
                <div className="border-t border-[#1e1e2e] pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                        <div className="flex items-center gap-2">
                            <h3 className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Trend Scanner & Super Trend Suite</h3>
                            {scannerIsActive && (
                                <span className="text-[11px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/40 px-2 py-0.5 rounded-full animate-pulse">
                                    {matchCount} candidate{matchCount !== 1 ? "s" : ""}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {scannerIsActive && matchCount > 0 && (
                                <button
                                    onClick={() => {
                                        if (!trendMatchingTickers) return;
                                        const formatted = trendMatchingTickers.map(t => toTVSymbol(t)).join(", ");
                                        navigator.clipboard.writeText(formatted).then(() => {
                                            setIsCopied(true);
                                            setTimeout(() => setIsCopied(false), 2000);
                                        });
                                    }}
                                    className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-all ${
                                        isCopied ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300" : "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20"
                                    }`}
                                >
                                    {isCopied ? "✓ Copied!" : "📋 Copy Matches"}
                                </button>
                            )}
                            {scannerIsActive && (
                                <button
                                    onClick={resetScanner}
                                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    Reset ✕
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 mb-4">
                        {[
                            { id: "near_origin", label: "Near Origin 🎯", origin: "moderate" as const, mDir: "rising" as const, rDir: "off" as const, color: "text-violet-400 border-violet-500/50", activeBg: "bg-violet-500/20 shadow-sm shadow-violet-500/20" },
                            { id: "mtf_aligned", label: "⚡ MTF Aligned", origin: "off" as const, mDir: "rising" as const, rDir: "rising" as const, color: "text-cyan-400 border-cyan-500/50", activeBg: "bg-cyan-500/20 shadow-sm shadow-cyan-500/20" },
                            { id: "super_trend", label: "🚀 Super Trend 🔥", origin: "moderate" as const, mDir: "rising" as const, rDir: "rising" as const, color: "text-emerald-300 border-emerald-500/50", activeBg: "bg-emerald-500/25 shadow-sm shadow-emerald-500/20" },
                            { id: "improving",  label: "Improving ↗",  origin: "off" as const, mDir: "rising" as const,  rDir: "rising" as const,  color: "text-emerald-400 border-emerald-500/40", activeBg: "bg-emerald-500/20" },
                            { id: "leading",    label: "Leading ★",    origin: "off" as const, mDir: "falling" as const, rDir: "rising" as const,  color: "text-blue-400 border-blue-500/40",    activeBg: "bg-blue-500/20" },
                            { id: "weakening",  label: "Weakening ↘",  origin: "off" as const, mDir: "falling" as const, rDir: "falling" as const, color: "text-red-400 border-red-500/40",     activeBg: "bg-red-500/20" },
                            { id: "lagging",    label: "Lagging ↙",    origin: "off" as const, mDir: "rising" as const,  rDir: "falling" as const, color: "text-amber-400 border-amber-500/40",  activeBg: "bg-amber-500/20" },
                        ].map(p => (
                            <button
                                key={p.id}
                                onClick={() => {
                                    if (activePreset === p.id) {
                                        resetScanner();
                                    } else {
                                        setOriginDist(p.origin);
                                        setMomentumDir(p.mDir);
                                        setRatioDir(p.rDir);
                                        setSuperTrendPreset(p.id as SuperTrendPresetType);
                                    }
                                }}
                                className={`text-[11px] font-semibold py-2 px-2.5 rounded-lg border transition-all duration-200 ${
                                    activePreset === p.id
                                        ? `${p.color} ${p.activeBg}`
                                        : "text-slate-400 border-slate-700/60 bg-[#1a1a2e]/60 hover:border-slate-600 hover:text-slate-200"
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Origin Distance Radius */}
                        <div>
                            <label className="block text-[11px] text-slate-400 mb-1.5 font-semibold">Origin Distance <span className="text-violet-400">(Launchpad Zone)</span></label>
                            <div className="flex gap-1">
                                {[
                                    { value: "off" as const, label: "Off", activeColor: "text-white bg-slate-700 border-slate-500" },
                                    { value: "tight" as const, label: "Tight ±1.5", activeColor: "text-violet-300 bg-violet-500/20 border-violet-500/50" },
                                    { value: "moderate" as const, label: "Mod ±3.0", activeColor: "text-violet-300 bg-violet-500/20 border-violet-500/50" },
                                    { value: "broad" as const, label: "Broad ±5.0", activeColor: "text-violet-300 bg-violet-500/20 border-violet-500/50" },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => {
                                            setOriginDist(opt.value);
                                            if (superTrendPreset !== "off") setSuperTrendPreset("off");
                                        }}
                                        className={`flex-1 text-[11px] font-semibold py-1.5 px-1.5 rounded border transition-all duration-200 ${
                                            originDist === opt.value
                                                ? opt.activeColor
                                                : "text-slate-500 border-slate-700 bg-[#1a1a2e] hover:text-slate-300"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* RS-Momentum Direction */}
                        <div>
                            <label className="block text-[11px] text-slate-400 mb-1.5 font-semibold">RS-Momentum <span className="text-slate-500">(Y-axis)</span></label>
                            <div className="flex gap-1">
                                {[
                                    { value: "off" as const, label: "Off", icon: "⊘", color: "text-slate-400 border-slate-600 bg-slate-800/50", activeColor: "text-white bg-slate-700 border-slate-500" },
                                    { value: "rising" as const, label: "Rising", icon: "↑", color: "text-slate-500 border-slate-700 bg-[#1a1a2e]", activeColor: "text-emerald-300 bg-emerald-500/20 border-emerald-500/40" },
                                    { value: "falling" as const, label: "Falling", icon: "↓", color: "text-slate-500 border-slate-700 bg-[#1a1a2e]", activeColor: "text-red-300 bg-red-500/20 border-red-500/40" },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => {
                                            setMomentumDir(opt.value);
                                            if (superTrendPreset !== "off") setSuperTrendPreset("off");
                                        }}
                                        className={`flex-1 text-[11px] font-semibold py-1.5 px-1.5 rounded border transition-all duration-200 ${
                                            momentumDir === opt.value ? opt.activeColor : opt.color
                                        } hover:brightness-110`}
                                    >
                                        <span className="mr-0.5">{opt.icon}</span>{opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* RS-Ratio Direction */}
                        <div>
                            <label className="block text-[11px] text-slate-400 mb-1.5 font-semibold">RS-Ratio <span className="text-slate-500">(X-axis)</span></label>
                            <div className="flex gap-1">
                                {[
                                    { value: "off" as const, label: "Off", icon: "⊘", color: "text-slate-400 border-slate-600 bg-slate-800/50", activeColor: "text-white bg-slate-700 border-slate-500" },
                                    { value: "rising" as const, label: "Rising", icon: "↑", color: "text-slate-500 border-slate-700 bg-[#1a1a2e]", activeColor: "text-emerald-300 bg-emerald-500/20 border-emerald-500/40" },
                                    { value: "falling" as const, label: "Falling", icon: "↓", color: "text-slate-500 border-slate-700 bg-[#1a1a2e]", activeColor: "text-red-300 bg-red-500/20 border-red-500/40" },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => {
                                            setRatioDir(opt.value);
                                            if (superTrendPreset !== "off") setSuperTrendPreset("off");
                                        }}
                                        className={`flex-1 text-[11px] font-semibold py-1.5 px-1.5 rounded border transition-all duration-200 ${
                                            ratioDir === opt.value ? opt.activeColor : opt.color
                                        } hover:brightness-110`}
                                    >
                                        <span className="mr-0.5">{opt.icon}</span>{opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Lookback Slider */}
                        <div className={`transition-opacity duration-200 ${scannerIsActive ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                            <label className="block text-[11px] text-slate-400 mb-1.5 font-semibold flex justify-between">
                                <span>Lookback Periods</span>
                                <span className="text-violet-400">{trendLookback} <span className="text-slate-600">(max {tailLength})</span></span>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max={tailLength}
                                value={trendLookback}
                                disabled={!scannerIsActive}
                                onChange={(e) => setTrendLookback(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 disabled:opacity-40 mt-1"
                            />
                        </div>
                    </div>

                </div>
            </div>

            {/* Top N Filter Toolbar */}
            <div className="flex items-center gap-2 bg-[#111118] border border-[#1e1e2e] p-3 rounded-lg w-fit">
                <span className="text-xs text-slate-300 font-semibold uppercase tracking-wider">
                    Top N Per Quadrant:
                </span>
                <div className="flex bg-[#1a1a2e] border border-slate-700/80 rounded-lg p-0.5">
                    {(["All", 5, 10, 15] as const).map((n) => (
                        <button
                            key={String(n)}
                            onClick={() => setTopNCount(n)}
                            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${
                                topNCount === n
                                    ? "bg-blue-600 text-white font-semibold shadow-sm"
                                    : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            {n === "All" ? "Show All" : `Top ${n}`}
                        </button>
                    ))}
                </div>
            </div>

            {/* Quadrant Quick Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#111118] border border-[#1e1e2e] p-3 rounded-lg">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold text-slate-400">Chart Quadrants:</span>
                    {QUADRANTS.map((q) => {
                        const count = activeWatchlist.tickers.filter((t) => tickerQuadrants[t] === q).length;
                        const isChecked = selectedQuadrants.includes(q);
                        const dotColors: Record<QuadrantType, string> = {
                            Leading: "bg-emerald-400",
                            Weakening: "bg-yellow-400",
                            Lagging: "bg-red-400",
                            Improving: "bg-blue-400",
                        };
                        return (
                            <label
                                key={q}
                                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded cursor-pointer border transition-colors ${
                                    isChecked
                                        ? "bg-slate-800 border-slate-600 text-white font-medium"
                                        : "bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300"
                                }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleQuadrant(q)}
                                    className="hidden"
                                />
                                <span className={`w-2 h-2 rounded-full ${dotColors[q]}`}></span>
                                {q} ({count})
                            </label>
                        );
                    })}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setSelectedQuadrants([...QUADRANTS])}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-blue-400 px-3 py-1 rounded font-medium transition-colors"
                    >
                        Select All (4 Quadrants)
                    </button>
                    <button
                        onClick={() => setSelectedQuadrants([])}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-red-400 px-3 py-1 rounded font-medium transition-colors"
                    >
                        Deselect All Quadrants
                    </button>
                </div>
            </div>

            {/* RRG Chart */}
            <div>
                {activeWatchlist.tickers.length === 0 ? (
                    <div className="h-96 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-800 rounded-xl bg-[#111118]">
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
                        timeframe={TIMEFRAMES[timeframe]}
                        benchmarkName={
                            [...BROAD_MARKET, ...SECTORS].find(
                                (b) => b.dataFile === benchmarkId || b.id === benchmarkId
                            )?.title || benchmarkId
                        }
                        originRadius={ORIGIN_RADIUS_MAP[originDist as keyof typeof ORIGIN_RADIUS_MAP] ?? null}
                    />
                )}
            </div>

            {/* Super Trend Candidate Leaderboard Table */}
            {scannerIsActive && matchCount > 0 && (() => {
                const rawCandidates = (trendMatchingTickers || []).map((ticker) => {
                    const pts = groupedByTicker[ticker] || [];
                    const metrics = calculateSuperTrendScore(pts);
                    const head = pts[pts.length - 1];
                    const quad = tickerQuadrants[ticker] || "Unknown";
                    const cleanName = cleanTicker(ticker);
                    const tvUrl = `https://in.tradingview.com/chart/?symbol=${toTVSymbol(ticker)}`;
                    return { ticker, cleanName, pts, metrics, head, quad, tvUrl };
                });

                const quadCounts: Record<"All" | QuadrantType, number> = {
                    All: rawCandidates.length,
                    Leading: 0,
                    Improving: 0,
                    Weakening: 0,
                    Lagging: 0,
                };
                for (const c of rawCandidates) {
                    if (c.quad in quadCounts) {
                        quadCounts[c.quad as QuadrantType]++;
                    }
                }

                let filtered = rawCandidates;
                if (leaderboardQuadFilter !== "All") {
                    filtered = filtered.filter(c => c.quad === leaderboardQuadFilter);
                }

                const quadrantRank: Record<string, number> = { Leading: 4, Improving: 3, Weakening: 2, Lagging: 1, Unknown: 0 };

                const sorted = [...filtered].sort((a, b) => {
                    let diff = 0;
                    switch (leaderboardSortField) {
                        case "ticker":
                            diff = a.cleanName.localeCompare(b.cleanName);
                            break;
                        case "quadrant":
                            diff = (quadrantRank[b.quad] || 0) - (quadrantRank[a.quad] || 0);
                            break;
                        case "ratio":
                            diff = (a.head?.RS_Ratio ?? 0) - (b.head?.RS_Ratio ?? 0);
                            break;
                        case "momentum":
                            diff = (a.head?.RS_Momentum ?? 0) - (b.head?.RS_Momentum ?? 0);
                            break;
                        case "distance":
                            diff = (a.metrics?.distance ?? 0) - (b.metrics?.distance ?? 0);
                            break;
                        case "accel":
                            diff = (a.metrics?.accel ?? 0) - (b.metrics?.accel ?? 0);
                            break;
                        case "score":
                        default:
                            diff = (a.metrics?.score ?? 0) - (b.metrics?.score ?? 0);
                            break;
                    }
                    return leaderboardSortAsc ? diff : -diff;
                });

                const handleSort = (field: typeof leaderboardSortField) => {
                    if (leaderboardSortField === field) {
                        setLeaderboardSortAsc(!leaderboardSortAsc);
                    } else {
                        setLeaderboardSortField(field);
                        setLeaderboardSortAsc(field === "ticker" || field === "distance");
                    }
                };

                const renderSortIcon = (field: typeof leaderboardSortField) => {
                    if (leaderboardSortField !== field) {
                        return <span className="text-slate-600 ml-1 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">↕</span>;
                    }
                    return <span className="text-blue-400 ml-1 font-bold">{leaderboardSortAsc ? "▲" : "▼"}</span>;
                };

                return (
                    <div className="bg-[#111118] border border-violet-500/30 rounded-lg p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3 border-b border-slate-800/80 pb-3">
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                                    🏆 Super Trend Candidates Leaderboard
                                </h3>
                                <span className="text-[10px] bg-violet-500/20 text-violet-300 font-semibold px-2 py-0.5 rounded-full border border-violet-500/30">
                                    {filtered.length} of {matchCount} candidates
                                </span>
                            </div>

                            {/* Quadrant Filter Pills */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] text-slate-400 font-semibold mr-1">Filter Quadrant:</span>
                                {(["All", "Leading", "Improving", "Weakening", "Lagging"] as const).map((q) => {
                                    const count = quadCounts[q] || 0;
                                    const isActive = leaderboardQuadFilter === q;
                                    const colorMap: Record<string, string> = {
                                        All: isActive ? "bg-violet-600 text-white border-violet-500" : "text-slate-400 border-slate-700 bg-[#1a1a2e]",
                                        Leading: isActive ? "bg-emerald-600 text-white border-emerald-500" : "text-emerald-400 border-slate-700 bg-[#1a1a2e]",
                                        Improving: isActive ? "bg-blue-600 text-white border-blue-500" : "text-blue-400 border-slate-700 bg-[#1a1a2e]",
                                        Weakening: isActive ? "bg-yellow-600 text-white border-yellow-500" : "text-yellow-400 border-slate-700 bg-[#1a1a2e]",
                                        Lagging: isActive ? "bg-red-600 text-white border-red-500" : "text-red-400 border-slate-700 bg-[#1a1a2e]",
                                    };
                                    return (
                                        <button
                                            key={q}
                                            onClick={() => setLeaderboardQuadFilter(q)}
                                            className={`text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-all ${colorMap[q]} hover:brightness-110 flex items-center gap-1`}
                                        >
                                            <span>{q}</span>
                                            <span className="text-[9px] opacity-75 font-mono">({count})</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="text-[11px] text-slate-400 uppercase bg-[#1a1a2e] border-b border-slate-700/60 select-none">
                                    <tr>
                                        <th
                                            onClick={() => handleSort("ticker")}
                                            className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors group"
                                        >
                                            <div className="flex items-center">
                                                <span>Stock Ticker</span>
                                                {renderSortIcon("ticker")}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleSort("quadrant")}
                                            className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors group"
                                        >
                                            <div className="flex items-center">
                                                <span>Quadrant</span>
                                                {renderSortIcon("quadrant")}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleSort("ratio")}
                                            className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors group"
                                        >
                                            <div className="flex items-center">
                                                <span>RS-Ratio</span>
                                                {renderSortIcon("ratio")}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleSort("momentum")}
                                            className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors group"
                                        >
                                            <div className="flex items-center">
                                                <span>RS-Mom</span>
                                                {renderSortIcon("momentum")}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleSort("distance")}
                                            className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors group"
                                        >
                                            <div className="flex items-center">
                                                <span>Origin Distance</span>
                                                {renderSortIcon("distance")}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleSort("accel")}
                                            className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors group"
                                        >
                                            <div className="flex items-center">
                                                <span>Tail Accel</span>
                                                {renderSortIcon("accel")}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleSort("score")}
                                            className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors group"
                                        >
                                            <div className="flex items-center">
                                                <span>Super Trend Score</span>
                                                {renderSortIcon("score")}
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60">
                                    {sorted.map(({ ticker, cleanName, metrics, head, quad, tvUrl }) => {
                                        return (
                                            <tr key={ticker} className="hover:bg-slate-800/40 transition-colors font-mono">
                                                <td className="py-2.5 px-3 font-semibold font-sans">
                                                    <a
                                                        href={tvUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-400 hover:text-blue-300 hover:underline transition-colors inline-flex items-center gap-1 group"
                                                        title={`Open ${cleanName} chart on TradingView`}
                                                    >
                                                        <span>{cleanName}</span>
                                                        <span className="text-[10px] text-blue-500 group-hover:text-blue-300 transition-colors">↗</span>
                                                    </a>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                                        quad === "Leading" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" :
                                                        quad === "Weakening" ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30" :
                                                        quad === "Lagging" ? "bg-red-500/20 text-red-300 border border-red-500/30" :
                                                        "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                                    }`}>{quad}</span>
                                                </td>
                                                <td className="py-2.5 px-3 text-slate-200">{typeof head?.RS_Ratio === "number" ? head.RS_Ratio.toFixed(2) : "—"}</td>
                                                <td className="py-2.5 px-3 text-slate-200">{typeof head?.RS_Momentum === "number" ? head.RS_Momentum.toFixed(2) : "—"}</td>
                                                <td className="py-2.5 px-3 text-violet-300">{typeof metrics?.distance === "number" ? metrics.distance.toFixed(2) : "—"} pts</td>
                                                <td className="py-2.5 px-3 text-emerald-400">{typeof metrics?.accel === "number" ? metrics.accel.toFixed(2) : "—"}x</td>
                                                <td className="py-2.5 px-3 font-bold text-emerald-300">
                                                    {metrics?.score ?? 50} / 100 🔥
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {sorted.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="py-6 text-center text-slate-500 text-xs font-sans">
                                                No candidates in the {leaderboardQuadFilter} quadrant.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })()}

            {/* Constituent Stock Chips Selector Grid */}
            {activeWatchlist.tickers.length > 0 && (
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-4">
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#1e1e2e]">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-300 font-bold uppercase tracking-wider">
                                Watchlist Stock Selector
                            </span>
                            <span className="text-xs bg-blue-500/10 text-blue-400 font-bold px-2.5 py-0.5 rounded-full border border-blue-500/20">
                                {selectedTickers.length} of {activeWatchlist.tickers.length} selected
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            {/* Quadrant Filter Buttons for Grid */}
                            <div className="flex flex-wrap bg-[#1a1a2e] border border-slate-700/80 rounded-lg p-0.5">
                                {(["All", "Leading", "Weakening", "Lagging", "Improving"] as const).map((q) => {
                                    const count = q === "All" ? activeWatchlist.tickers.length : activeWatchlist.tickers.filter((t) => tickerQuadrants[t] === q).length;
                                    const activeColor: Record<string, string> = {
                                        All: "bg-slate-700 text-white font-semibold shadow-sm",
                                        Leading: "bg-emerald-600/30 text-emerald-300 font-semibold border border-emerald-500/40 shadow-sm",
                                        Weakening: "bg-yellow-600/30 text-yellow-300 font-semibold border border-yellow-500/40 shadow-sm",
                                        Lagging: "bg-red-600/30 text-red-300 font-semibold border border-red-500/40 shadow-sm",
                                        Improving: "bg-blue-600/30 text-blue-300 font-semibold border border-blue-500/40 shadow-sm",
                                    };
                                    return (
                                        <button
                                            key={q}
                                            onClick={() => setGridQuadrantFilter(q)}
                                            className={`text-[11px] px-2.5 py-1 rounded-md transition-all ${
                                                gridQuadrantFilter === q
                                                    ? activeColor[q]
                                                    : "text-slate-400 hover:text-slate-200"
                                            }`}
                                        >
                                            {q} ({count})
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Select All / Deselect All for grid */}
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={() => {
                                        if (scannerIsActive) resetScanner();
                                        const toAdd = new Set([...selectedTickers, ...filteredGridTickers]);
                                        setSelectedTickers(Array.from(toAdd));
                                    }}
                                    className="text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-lg font-medium transition-colors"
                                >
                                    Select All
                                </button>
                                <button
                                    onClick={() => {
                                        if (scannerIsActive) resetScanner();
                                        const removeSet = new Set(filteredGridTickers);
                                        setSelectedTickers(selectedTickers.filter((t) => !removeSet.has(t)));
                                    }}
                                    className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-lg font-medium transition-colors"
                                >
                                    Deselect All
                                </button>
                            </div>

                            {/* Search Input */}
                            <div className="relative w-full sm:w-44">
                                <input
                                    type="text"
                                    placeholder="Filter stock..."
                                    value={chipSearchQuery}
                                    onChange={(e) => setChipSearchQuery(e.target.value)}
                                    className="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <svg
                                    className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                        {filteredGridTickers.map((ticker) => {
                            const isSelected = selectedTickers.includes(ticker);
                            const q = tickerQuadrants[ticker] || "Lagging";
                            const cleanName = cleanTicker(ticker);

                            const borderAccent: Record<QuadrantType, string> = {
                                Leading: "border-emerald-500/40 hover:border-emerald-500",
                                Weakening: "border-yellow-500/40 hover:border-yellow-500",
                                Lagging: "border-red-500/40 hover:border-red-500",
                                Improving: "border-blue-500/40 hover:border-blue-500",
                            };

                            const badgeAccent: Record<QuadrantType, string> = {
                                Leading: "bg-emerald-500/20 text-emerald-300",
                                Weakening: "bg-yellow-500/20 text-yellow-300",
                                Lagging: "bg-red-500/20 text-red-300",
                                Improving: "bg-blue-500/20 text-blue-300",
                            };

                            return (
                                <button
                                    key={ticker}
                                    onClick={() => toggleTicker(ticker)}
                                    className={`text-left text-xs px-3 py-2 rounded-lg border transition-all duration-150 flex items-center justify-between group ${
                                        isSelected
                                            ? `bg-[#1a1a2e] ${borderAccent[q] || "border-blue-500/50"} shadow-sm`
                                            : "bg-[#111118]/60 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300 opacity-60"
                                    }`}
                                >
                                    <span className={`font-semibold tracking-wide truncate ${isSelected ? "text-slate-100" : "text-slate-500"}`}>
                                        {cleanName}
                                    </span>
                                    {q && (
                                        <span
                                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded ml-1 uppercase shrink-0 ${badgeAccent[q]}`}
                                        >
                                            {q[0]}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                        {filteredGridTickers.length === 0 && (
                            <div className="col-span-full text-center py-6 text-xs text-slate-500">
                                No stocks match the selected quadrant ({gridQuadrantFilter}) and search query ({chipSearchQuery || "None"}).
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Selected Stocks Listed by Quadrant Cards + Expand Modal */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {QUADRANTS.map((q) => {
                    if (!selectedQuadrants.includes(q)) return null;

                    const activeTickersInQuadrant = selectedTickers.filter((t) => tickerQuadrants[t] === q);
                    if (activeTickersInQuadrant.length === 0) return null;

                    const tabStyles: Record<string, string> = {
                        Leading: "border-emerald-500/20 bg-emerald-500/5",
                        Weakening: "border-yellow-500/20 bg-yellow-500/5",
                        Lagging: "border-red-500/20 bg-red-500/5",
                        Improving: "border-blue-500/20 bg-blue-500/5",
                    };
                    const textStyles: Record<string, string> = {
                        Leading: "text-emerald-400",
                        Weakening: "text-yellow-400",
                        Lagging: "text-red-400",
                        Improving: "text-blue-400",
                    };

                    return (
                        <div key={q} className={`border rounded-lg p-3 ${tabStyles[q]}`}>
                            <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-2 gap-1">
                                <h3 className={`text-sm font-bold flex items-center gap-2 ${textStyles[q]}`}>
                                    {q}
                                    <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white font-mono">
                                        {activeTickersInQuadrant.length}
                                    </span>
                                </h3>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => handleCopyWatchlist(q, activeTickersInQuadrant)}
                                        className="text-[10px] text-blue-300 hover:text-white transition-colors bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/40 px-2 py-1 rounded flex items-center gap-1 font-semibold"
                                        title="Copy TradingView formatted watchlist (NSE:SYMBOL1, NSE:SYMBOL2...)"
                                    >
                                        {copiedQuadrant === q ? "✓ Copied!" : "📋 Watchlist"}
                                    </button>
                                    <button
                                        onClick={() => setExpandedQuadrant(expandedQuadrant === q ? null : q)}
                                        className="text-[10px] text-slate-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-2 py-1 rounded flex items-center gap-1 font-semibold"
                                    >
                                        {expandedQuadrant === q ? "Close" : "Expand"}
                                    </button>
                                </div>
                            </div>

                            {expandedQuadrant === q ? (
                                // Full overlay modal view matching StockRRGClient
                                <div className="fixed inset-0 z-50 bg-[#0d0d14]/95 flex items-center justify-center p-4 sm:p-8 overscroll-contain">
                                    <div className="bg-[#111118] border border-slate-800 rounded-xl p-6 max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl transform-gpu">
                                        <div className="flex justify-between items-center mb-4 border-b border-slate-800 pb-3">
                                            <div className="flex items-center gap-3">
                                                <h2 className={`text-xl font-bold ${textStyles[q]}`}>{q} Quadrant Stocks</h2>
                                                <span className="text-xs bg-slate-800 text-slate-300 font-mono font-bold px-2.5 py-0.5 rounded-full">
                                                    {activeTickersInQuadrant.length} stocks
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleCopyWatchlist(q, activeTickersInQuadrant)}
                                                    className="text-xs bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/40 text-blue-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors font-semibold flex items-center gap-1.5"
                                                >
                                                    {copiedQuadrant === q ? "✓ Watchlist Copied!" : "📋 Copy Watchlist for TradingView"}
                                                </button>
                                                <button
                                                    onClick={() => setExpandedQuadrant(null)}
                                                    className="text-slate-400 hover:text-white text-sm bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                                                >
                                                    ✕ Close
                                                </button>
                                            </div>
                                        </div>

                                        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-1 custom-scrollbar">
                                            {activeTickersInQuadrant.map((ticker) => {
                                                const clean = cleanTicker(ticker);
                                                const tvSym = toTVSymbol(ticker);
                                                return (
                                                    <a
                                                        key={ticker}
                                                        href={`https://in.tradingview.com/chart/?symbol=${encodeURIComponent(tvSym)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="bg-[#1a1a2e] hover:bg-[#252542] border border-slate-800 hover:border-blue-500/50 p-3 rounded-lg transition-all group"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-sm font-bold text-white group-hover:text-blue-400 font-mono">{clean}</p>
                                                            <span className="text-xs text-slate-500 group-hover:text-blue-400">↗</span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider">{q} Quadrant • Open Chart</p>
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                // Compact card list view with TradingView chart links
                                <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                                    {activeTickersInQuadrant.map((ticker) => {
                                        const clean = cleanTicker(ticker);
                                        const tvSym = toTVSymbol(ticker);
                                        return (
                                            <a
                                                key={ticker}
                                                href={`https://in.tradingview.com/chart/?symbol=${encodeURIComponent(tvSym)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={`Open ${clean} (${tvSym}) chart on TradingView`}
                                                className="text-xs bg-[#1a1a2e] hover:bg-[#252542] border border-slate-800 hover:border-blue-500/50 px-2 py-0.5 rounded text-slate-300 hover:text-blue-400 font-mono font-medium transition-all flex items-center gap-1 group"
                                            >
                                                <span>{clean}</span>
                                                <span className="text-[9px] text-slate-500 group-hover:text-blue-400 opacity-60">↗</span>
                                            </a>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Skipped Stocks Notice Banner */}
            {skippedStocks && skippedStocks.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg p-3.5 text-xs flex items-start gap-2.5">
                    <span className="text-base leading-none">ℹ️</span>
                    <div>
                        <span className="font-semibold text-amber-200 block mb-0.5">
                            Notice on Recent Listings / Insufficient History:
                        </span>
                        <p className="text-amber-300/90 leading-relaxed">
                            The following constituent stock(s) have fewer than 22 trading periods for the selected{" "}
                            <strong>{TIMEFRAMES[timeframe]}</strong> timeframe and are excluded from trend rotation metrics:{" "}
                            <span className="font-mono font-semibold text-amber-200">
                                {skippedStocks.map(cleanTicker).join(", ")}
                            </span>.
                        </p>
                    </div>
                </div>
            )}

            {/* Sortable Constituent Data Table */}
            {tableRows.length > 0 && (
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl p-5 shadow-xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1e1e2e] pb-3">
                        <div>
                            <h3 className="text-sm font-bold text-white tracking-wide">
                                Watchlist Constituent Metrics (vs {activeBenchmarkTitle})
                            </h3>
                            <p className="text-xs text-slate-400">
                                Latest RS-Ratio, RS-Momentum, and distance from benchmark center (100, 100)
                            </p>
                        </div>

                        <div className="relative w-full sm:w-56">
                            <input
                                type="text"
                                placeholder="Filter table stocks..."
                                value={tableSearchQuery}
                                onChange={(e) => setTableSearchQuery(e.target.value)}
                                className="w-full bg-[#1a1a2e] border border-slate-700/60 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                            />
                            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-[#1e1e2e] text-slate-400 font-semibold bg-[#161622]">
                                    <th
                                        className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors"
                                        onClick={() => {
                                            if (tableSortField === "ticker") setTableSortAsc(!tableSortAsc);
                                            else { setTableSortField("ticker"); setTableSortAsc(true); }
                                        }}
                                    >
                                        Stock Ticker {tableSortField === "ticker" ? (tableSortAsc ? "▲" : "▼") : ""}
                                    </th>
                                    <th
                                        className="py-2.5 px-3 cursor-pointer hover:text-white transition-colors"
                                        onClick={() => {
                                            if (tableSortField === "quadrant") setTableSortAsc(!tableSortAsc);
                                            else { setTableSortField("quadrant"); setTableSortAsc(true); }
                                        }}
                                    >
                                        Quadrant {tableSortField === "quadrant" ? (tableSortAsc ? "▲" : "▼") : ""}
                                    </th>
                                    <th
                                        className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition-colors"
                                        onClick={() => {
                                            if (tableSortField === "ratio") setTableSortAsc(!tableSortAsc);
                                            else { setTableSortField("ratio"); setTableSortAsc(false); }
                                        }}
                                    >
                                        RS-Ratio {tableSortField === "ratio" ? (tableSortAsc ? "▲" : "▼") : ""}
                                    </th>
                                    <th
                                        className="py-2.5 px-3 text-right cursor-pointer hover:text-white transition-colors"
                                        onClick={() => {
                                            if (tableSortField === "momentum") setTableSortAsc(!tableSortAsc);
                                            else { setTableSortField("momentum"); setTableSortAsc(false); }
                                        }}
                                    >
                                        RS-Momentum {tableSortField === "momentum" ? (tableSortAsc ? "▲" : "▼") : ""}
                                    </th>
                                    <th className="py-2.5 px-3 text-right">Dist. from Center</th>
                                    <th className="py-2.5 px-3 text-center">Chart Link</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#1e1e2e]/60">
                                {tableRows.map((row) => {
                                    const badgeStyles: Record<string, string> = {
                                        Leading: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
                                        Weakening: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
                                        Lagging: "bg-red-500/20 text-red-300 border-red-500/40",
                                        Improving: "bg-blue-500/20 text-blue-300 border-blue-500/40",
                                    };
                                    const tvSym = toTVSymbol(row.ticker);

                                    return (
                                        <tr key={row.ticker} className="hover:bg-[#1a1a2e]/60 transition-colors">
                                            <td className="py-2 px-3 font-semibold text-white font-mono">{row.clean}</td>
                                            <td className="py-2 px-3">
                                                <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${badgeStyles[row.quadrant]}`}>
                                                    {row.quadrant}
                                                </span>
                                            </td>
                                            <td className={`py-2 px-3 text-right font-mono font-semibold ${row.ratio >= 100 ? "text-emerald-400" : "text-red-400"}`}>
                                                {row.ratio.toFixed(2)}
                                            </td>
                                            <td className={`py-2 px-3 text-right font-mono font-semibold ${row.momentum >= 100 ? "text-emerald-400" : "text-red-400"}`}>
                                                {row.momentum.toFixed(2)}
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-slate-400">
                                                {row.distance.toFixed(2)}
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                                <a
                                                    href={`https://in.tradingview.com/chart/?symbol=${encodeURIComponent(tvSym)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors font-medium"
                                                >
                                                    <span>View</span>
                                                    <ExternalLink className="h-3 w-3" />
                                                </a>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
