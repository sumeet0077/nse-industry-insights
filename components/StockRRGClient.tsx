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

export function StockRRGClient({ title, stockRRGData }: StockRRGClientProps) {
    const [timeframe, setTimeframe] = useState<TimeframeType>("W");
    const [tailLength, setTailLength] = useState<number>(12);
    const [searchQuery, setSearchQuery] = useState("");

    const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
    const [selectedQuadrants, setSelectedQuadrants] = useState<QuadrantType[]>([...QUADRANTS]);

    // Trend Scanner state
    const [trendDirection, setTrendDirection] = useState<TrendDirectionType>("off");
    const [trendMetric, setTrendMetric] = useState<TrendMetricType>("momentum");
    const [trendLookback, setTrendLookback] = useState(12);

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

    // Map ticker -> quadrant for filtering
    const tickerQuadrants = useMemo(() => {
        const map: Record<string, QuadrantType> = {};
        const grouped: Record<string, RRGDataPoint[]> = {};
        for (const pt of rawData) {
            if (!grouped[pt.Ticker]) grouped[pt.Ticker] = [];
            grouped[pt.Ticker].push(pt);
        }
        for (const [ticker, points] of Object.entries(grouped)) {
            points.sort((a, b) => a.Date.localeCompare(b.Date));
            const last = points[points.length - 1];
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
    }, [rawData]);

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
            selectedQuadrants.includes(tickerQuadrants[d.Ticker] as QuadrantType)
    );

    const filteredAllTickers = searchQuery.trim()
        ? allTickers.filter((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
        : allTickers;

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
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-6 text-center text-slate-400 my-4">
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
                            <span className="text-blue-400">{tailLength}</span>
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

            {/* Quadrant Filters & Stock Selection */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 bg-[#111118] border border-[#1e1e2e] p-3 rounded-lg">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-semibold text-slate-400">Quadrants:</span>
                    {QUADRANTS.map((q) => {
                        const count = allTickers.filter((t) => tickerQuadrants[t] === q).length;
                        const isChecked = selectedQuadrants.includes(q);
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
                                <span className={`w-2 h-2 rounded-full bg-${QUADRANT_COLORS[q]}-400`}></span>
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
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded font-medium transition-colors"
                    >
                        Select All ({allTickers.length})
                    </button>
                    <button
                        onClick={() => {
                            if (trendDirection !== "off") setTrendDirection("off");
                            setSelectedTickers([]);
                        }}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded font-medium transition-colors"
                    >
                        Deselect All
                    </button>
                </div>
            </div>

            {/* RRG Chart */}
            <div className="mb-6">
                <RRGChart data={filteredData} tailLength={tailLength} timeframe={TIMEFRAMES[timeframe]} />
            </div>

            {/* Stock Search & Multiselect */}
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                        Constituent Stocks ({selectedTickers.length}/{allTickers.length} selected)
                    </h3>
                    <input
                        type="text"
                        placeholder="Search stock..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-[#1a1a2e] border border-slate-700 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
                    />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-56 overflow-y-auto pr-1">
                    {filteredAllTickers.map((ticker) => {
                        const isSelected = selectedTickers.includes(ticker);
                        const q = tickerQuadrants[ticker];
                        return (
                            <button
                                key={ticker}
                                onClick={() => toggleTicker(ticker)}
                                className={`text-left text-xs p-2 rounded border transition-colors flex items-center justify-between ${
                                    isSelected
                                        ? "bg-blue-600/15 border-blue-500/40 text-blue-200"
                                        : "bg-slate-900/40 border-slate-800 text-slate-500 hover:text-slate-300"
                                }`}
                            >
                                <span className="font-mono font-medium truncate mr-1">{ticker}</span>
                                {q && (
                                    <span
                                        className={`w-1.5 h-1.5 rounded-full shrink-0 bg-${QUADRANT_COLORS[q]}-400`}
                                        title={q}
                                    ></span>
                                )}
                            </button>
                        );
                    })}
                </div>
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
                            <span className="font-mono font-semibold text-amber-200">{skippedStocks.join(", ")}</span>.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
