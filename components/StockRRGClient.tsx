// components/StockRRGClient.tsx
"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { RRGChart } from "@/components/charts/RRGChart";
import type { RRGDataPoint, TimeframeType, QuadrantType, TrendDirectionType, TrendMetricType } from "@/types";
import { QUADRANTS, QUADRANT_COLORS, TIMEFRAMES } from "@/lib/config";
import { CaptureScreenshot } from "@/components/common/CaptureScreenshot";
import type { StockRRGPayload } from "@/lib/data";

interface StockRRGClientProps {
    title: string;
    stockRRGData: StockRRGPayload | null;
}

function cleanTicker(ticker: string): string {
    return ticker.replace(/\.NS$/i, "").replace(/\.BO$/i, "");
}

export function StockRRGClient({ title, stockRRGData }: StockRRGClientProps) {
    const [timeframe, setTimeframe] = useState<TimeframeType>("W");
    const [tailLength, setTailLength] = useState<number>(5);
    const [searchQuery, setSearchQuery] = useState("");
    const [gridQuadrantFilter, setGridQuadrantFilter] = useState<"All" | QuadrantType>("All");
    const [topNCount, setTopNCount] = useState<number | "All">("All");
    const [copiedQuadrant, setCopiedQuadrant] = useState<string | null>(null);

    const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
    const [selectedQuadrants, setSelectedQuadrants] = useState<QuadrantType[]>([...QUADRANTS]);
    const [expandedQuadrant, setExpandedQuadrant] = useState<QuadrantType | null>(null);

    // Trend Scanner state
    const [trendDirection, setTrendDirection] = useState<TrendDirectionType>("off");
    const [trendMetric, setTrendMetric] = useState<TrendMetricType>("momentum");
    const [trendLookback, setTrendLookback] = useState(5);

    const rawData: RRGDataPoint[] = useMemo(() => {
        if (!stockRRGData) return [];
        return stockRRGData[timeframe] || [];
    }, [stockRRGData, timeframe]);

    const skippedStocks: string[] = useMemo(() => {
        if (!stockRRGData || !stockRRGData.skipped) return [];
        return stockRRGData.skipped[timeframe] || [];
    }, [stockRRGData, timeframe]);

    // Extract all unique tickers available in the dataset
    const allTickers = useMemo(() => {
        const set = new Set<string>();
        for (const pt of rawData) {
            set.add(pt.Ticker);
        }
        return Array.from(set).sort();
    }, [rawData]);

    // Initialize selectedTickers to include all available tickers when dataset loads
    useEffect(() => {
        if (allTickers.length > 0) {
            setSelectedTickers(allTickers);
        }
    }, [allTickers]);

    // Latest points per ticker for quadrant calculation & distance ranking
    const latestPoints = useMemo(() => {
        const map: Record<string, RRGDataPoint> = {};
        for (const pt of rawData) {
            if (!map[pt.Ticker] || pt.Date > map[pt.Ticker].Date) {
                map[pt.Ticker] = pt;
            }
        }
        return map;
    }, [rawData]);

    // Map ticker -> quadrant for filtering
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

    // Calculate Top N tickers per selected quadrant
    const topNActiveTickers = useMemo(() => {
        if (topNCount === "All") return null;

        const activeSet = new Set<string>();
        for (const q of selectedQuadrants) {
            const tickersInQ = allTickers.filter((t) => tickerQuadrants[t] === q);
            tickersInQ.sort((a, b) => {
                const headA = latestPoints[a];
                const headB = latestPoints[b];
                const distA = headA ? Math.sqrt(Math.pow(headA.RS_Ratio - 100, 2) + Math.pow(headA.RS_Momentum - 100, 2)) : 0;
                const distB = headB ? Math.sqrt(Math.pow(headB.RS_Ratio - 100, 2) + Math.pow(headB.RS_Momentum - 100, 2)) : 0;
                return distB - distA;
            });
            const sliced = tickersInQ.slice(0, topNCount);
            sliced.forEach((t) => activeSet.add(t));
        }
        return Array.from(activeSet);
    }, [topNCount, selectedQuadrants, allTickers, tickerQuadrants, latestPoints]);

    const activeTopNSet = useMemo(() => {
        return topNActiveTickers ? new Set(topNActiveTickers) : null;
    }, [topNActiveTickers]);

    // Group data by ticker for trend scanner
    const groupedByTicker = useMemo(() => {
        const grouped: Record<string, RRGDataPoint[]> = {};
        for (const pt of rawData) {
            if (!grouped[pt.Ticker]) grouped[pt.Ticker] = [];
            grouped[pt.Ticker].push(pt);
        }
        return grouped;
    }, [rawData]);

    // Trend scanner logic
    const trendMatchingTickers = useMemo(() => {
        if (trendDirection === "off") return null;

        const matches: string[] = [];
        for (const ticker of allTickers) {
            const points = groupedByTicker[ticker];
            if (!points || points.length < trendLookback + 1) continue;

            const tail = points.slice(-(trendLookback + 1));
            let isMatch = true;

            for (let i = 1; i < tail.length; i++) {
                const currM = tail[i].RS_Momentum;
                const prevM = tail[i - 1].RS_Momentum;
                const currR = tail[i].RS_Ratio;
                const prevR = tail[i - 1].RS_Ratio;

                if (trendDirection === "rising") {
                    if (trendMetric === "momentum" && currM <= prevM) { isMatch = false; break; }
                    if (trendMetric === "ratio" && currR <= prevR) { isMatch = false; break; }
                    if (trendMetric === "both" && (currM <= prevM || currR <= prevR)) { isMatch = false; break; }
                } else {
                    if (trendMetric === "momentum" && currM > prevM) { isMatch = false; break; }
                    if (trendMetric === "ratio" && currR > prevR) { isMatch = false; break; }
                    if (trendMetric === "both" && (currM > prevM || currR > prevR)) { isMatch = false; break; }
                }
            }

            if (isMatch) matches.push(ticker);
        }
        return matches;
    }, [trendDirection, trendMetric, trendLookback, allTickers, groupedByTicker]);

    const applyTrendScanner = useCallback(() => {
        if (trendMatchingTickers) {
            setSelectedTickers(trendMatchingTickers);
        }
    }, [trendMatchingTickers]);

    useEffect(() => {
        if (trendDirection !== "off" && trendMatchingTickers) {
            applyTrendScanner();
        }
    }, [trendDirection, trendMetric, trendLookback, applyTrendScanner, trendMatchingTickers]);

    const filteredData = rawData.filter(
        (d) =>
            selectedTickers.includes(d.Ticker) &&
            selectedQuadrants.includes(tickerQuadrants[d.Ticker] as QuadrantType) &&
            (!activeTopNSet || activeTopNSet.has(d.Ticker))
    );

    const filteredAllTickers = useMemo(() => {
        return searchQuery.trim()
            ? allTickers.filter((t) =>
                  cleanTicker(t).toLowerCase().includes(searchQuery.toLowerCase()) ||
                  t.toLowerCase().includes(searchQuery.toLowerCase())
              )
            : allTickers;
    }, [allTickers, searchQuery]);

    const displayGridTickers = useMemo(() => {
        if (gridQuadrantFilter === "All") return filteredAllTickers;
        return filteredAllTickers.filter((t) => tickerQuadrants[t] === gridQuadrantFilter);
    }, [filteredAllTickers, gridQuadrantFilter, tickerQuadrants]);

    const toggleTicker = (ticker: string) => {
        if (trendDirection !== "off") setTrendDirection("off");
        if (selectedTickers.includes(ticker)) {
            setSelectedTickers(selectedTickers.filter((t) => t !== ticker));
        } else {
            setSelectedTickers([...selectedTickers, ticker]);
        }
    };

    const toggleQuadrant = (quadrant: QuadrantType) => {
        if (selectedQuadrants.includes(quadrant)) {
            setSelectedQuadrants(selectedQuadrants.filter((q) => q !== quadrant));
        } else {
            setSelectedQuadrants([...selectedQuadrants, quadrant]);
        }
    };

    const contentRef = useRef<HTMLDivElement>(null);
    const scannerIsActive = trendDirection !== "off";
    const matchCount = trendMatchingTickers?.length ?? 0;

    if (!rawData || rawData.length === 0) {
        return (
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-8 text-center text-slate-400 my-4">
                <p className="font-semibold text-lg text-slate-300 mb-2">No Stock RRG Data Available</p>
                <p className="text-sm">Constituent stock relative rotation data is not available for this index/theme.</p>
            </div>
        );
    }

    return (
        <div ref={contentRef} className="py-2">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-lg font-bold text-white mb-1">
                        Constituent Stock Rotation (vs {title})
                    </h2>
                    <p className="text-xs text-slate-400">
                        Relative rotation of constituent stocks compared to the {title} benchmark
                    </p>
                </div>
                <CaptureScreenshot
                    targetRef={contentRef}
                    filename={`${title.replace(/\s+/g, "_")}_Stock_RRG`}
                    label="Capture RRG"
                />
            </div>

            {/* Controls Bar */}
            <div className="flex flex-col gap-6 mb-6 bg-[#111118] border border-[#1e1e2e] p-4 rounded-lg">
                <div className="flex flex-col md:flex-row gap-6">
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

                {/* Trend Scanner */}
                <div className="border-t border-[#1e1e2e] pt-4">
                    <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Trend Scanner</h3>
                        {scannerIsActive && (
                            <span className="text-[11px] font-bold bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full animate-pulse">
                                {matchCount} match{matchCount !== 1 ? "es" : ""}
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Direction</label>
                            <div className="flex bg-[#1a1a2e] border border-slate-700 rounded p-0.5">
                                {(["off", "rising", "falling"] as TrendDirectionType[]).map((dir) => (
                                    <button
                                        key={dir}
                                        onClick={() => setTrendDirection(dir)}
                                        className={`flex-1 py-1 text-xs rounded font-medium capitalize transition-colors ${
                                            trendDirection === dir
                                                ? dir === "rising"
                                                    ? "bg-emerald-600 text-white"
                                                    : dir === "falling"
                                                    ? "bg-red-600 text-white"
                                                    : "bg-slate-700 text-white"
                                                : "text-slate-400 hover:text-slate-200"
                                        }`}
                                    >
                                        {dir}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">Metric</label>
                            <select
                                value={trendMetric}
                                onChange={(e) => setTrendMetric(e.target.value as TrendMetricType)}
                                disabled={!scannerIsActive}
                                className="w-full bg-[#1a1a2e] border border-slate-700 rounded px-3 py-1.5 text-xs text-white disabled:opacity-40"
                            >
                                <option value="momentum">Momentum Only</option>
                                <option value="ratio">Ratio Only</option>
                                <option value="both">Ratio & Momentum (Strict)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs text-slate-400 mb-1">
                                Lookback: <span className="text-blue-400 font-semibold">{trendLookback}</span> periods
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
            <div className="flex items-center gap-2 mb-4 bg-[#111118] border border-[#1e1e2e] p-3 rounded-lg w-fit">
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
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-[#111118] border border-[#1e1e2e] p-3 rounded-lg">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold text-slate-400">Chart Quadrants:</span>
                    {QUADRANTS.map((q) => {
                        const count = allTickers.filter((t) => tickerQuadrants[t] === q).length;
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
                        onClick={() => {
                            if (trendDirection !== "off") setTrendDirection("off");
                            setSelectedTickers([...allTickers]);
                        }}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-blue-400 px-3 py-1 rounded font-medium transition-colors"
                    >
                        Select All ({allTickers.length})
                    </button>
                    <button
                        onClick={() => {
                            if (trendDirection !== "off") setTrendDirection("off");
                            setSelectedTickers([]);
                        }}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-red-400 px-3 py-1 rounded font-medium transition-colors"
                    >
                        Deselect All
                    </button>
                </div>
            </div>

            {/* RRG Chart */}
            <div className="mb-6">
                <RRGChart data={filteredData} tailLength={tailLength} timeframe={TIMEFRAMES[timeframe]} />
            </div>

            {/* Premium Constituent Stock Chips Selector Grid with Quadrant Filter & Select/Deselect All */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-4 mb-6">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#1e1e2e]">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-300 font-bold uppercase tracking-wider">
                            Constituent Stocks
                        </span>
                        <span className="text-xs bg-blue-500/10 text-blue-400 font-bold px-2.5 py-0.5 rounded-full border border-blue-500/20">
                            {selectedTickers.length} of {allTickers.length} selected
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Quadrant Filter Buttons for Grid */}
                        <div className="flex flex-wrap bg-[#1a1a2e] border border-slate-700/80 rounded-lg p-0.5">
                            {(["All", "Leading", "Weakening", "Lagging", "Improving"] as const).map((q) => {
                                const count = q === "All" ? allTickers.length : allTickers.filter((t) => tickerQuadrants[t] === q).length;
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
                                    if (trendDirection !== "off") setTrendDirection("off");
                                    const toAdd = new Set([...selectedTickers, ...displayGridTickers]);
                                    setSelectedTickers(Array.from(toAdd));
                                }}
                                className="text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-lg font-medium transition-colors"
                            >
                                Select All
                            </button>
                            <button
                                onClick={() => {
                                    if (trendDirection !== "off") setTrendDirection("off");
                                    const removeSet = new Set(displayGridTickers);
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
                                placeholder="Search stock..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
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
                    {displayGridTickers.map((ticker) => {
                        const isSelected = selectedTickers.includes(ticker);
                        const q = tickerQuadrants[ticker];
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
                    {displayGridTickers.length === 0 && (
                        <div className="col-span-full text-center py-6 text-xs text-slate-500">
                            No stocks match the selected quadrant ({gridQuadrantFilter}) and search query ({searchQuery || "None"}).
                        </div>
                    )}
                </div>
            </div>

            {/* Selected Stocks Listed by Quadrant Cards + Expand Modal */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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

                    const handleCopyWatchlist = (quadrantName: string, tickers: string[]) => {
                        const watchlist = tickers.map((t) => `NSE:${cleanTicker(t)}`).join(", ");
                        navigator.clipboard.writeText(watchlist);
                        setCopiedQuadrant(quadrantName);
                        setTimeout(() => setCopiedQuadrant(null), 2000);
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
                                // Full overlay modal view
                                <div className="fixed inset-0 z-50 bg-[#0d0d14]/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8">
                                    <div className="bg-[#111118] border border-slate-800 rounded-xl p-6 max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl">
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
                                                return (
                                                    <a
                                                        key={ticker}
                                                        href={`https://in.tradingview.com/chart/?symbol=NSE:${clean}`}
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
                                        return (
                                            <a
                                                key={ticker}
                                                href={`https://in.tradingview.com/chart/?symbol=NSE:${clean}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={`Open ${clean} chart on TradingView`}
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

            {/* Recent Listings / Skipped Stocks Notice Banner */}
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
        </div>
    );
}
