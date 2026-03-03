// components/SectorRotationClient.tsx
"use client";

import { useState } from "react";
import { RRGChart } from "@/components/charts/RRGChart";
import type { RRGDataPoint } from "@/types";
import { ALL_CONFIGS } from "@/lib/config";

interface SectorRotationClientProps {
    dataD: RRGDataPoint[];
    dataW: RRGDataPoint[];
    dataM: RRGDataPoint[];
}

export function SectorRotationClient({ dataD, dataW, dataM }: SectorRotationClientProps) {
    const [timeframe, setTimeframe] = useState<"D" | "W" | "M">("W");
    const [tailLength, setTailLength] = useState(5);

    // Filter defaults (same as Streamlit's implicit defaults)
    const defaults = ["Nifty 50", "Nifty Bank", "Nifty IT", "Nifty Auto", "Nifty FMCG", "Nifty Metal", "Nifty Pharma"];
    const [selectedTickers, setSelectedTickers] = useState<string[]>(defaults);
    const [isSelecting, setIsSelecting] = useState(false);

    // Quadrant filters
    const allQuadrants = ["Leading", "Weakening", "Lagging", "Improving"];
    const [selectedQuadrants, setSelectedQuadrants] = useState<string[]>(allQuadrants);

    const currentDataRaw = timeframe === "D" ? dataD : timeframe === "W" ? dataW : dataM;
    const timeframeLabel = timeframe === "D" ? "Daily" : timeframe === "W" ? "Weekly" : "Monthly";

    // Map raw tickers (like "breadth_auto") to human readable titles (like "Nifty Auto")
    const currentData = currentDataRaw.map(d => {
        const config = ALL_CONFIGS.find(c => c.dataFile === d.Ticker || c.id === d.Ticker);
        return config ? { ...d, Ticker: config.title } : d;
    });

    // Determine the latest point for each ticker to find its current quadrant
    const latestPoints: Record<string, RRGDataPoint> = {};
    for (const pt of currentData) {
        if (!latestPoints[pt.Ticker] || pt.Date > latestPoints[pt.Ticker].Date) {
            latestPoints[pt.Ticker] = pt;
        }
    }

    const getQuadrant = (pt?: RRGDataPoint) => {
        if (!pt) return "Unknown";
        if (pt.RS_Ratio > 100 && pt.RS_Momentum > 100) return "Leading";
        if (pt.RS_Ratio > 100 && pt.RS_Momentum <= 100) return "Weakening";
        if (pt.RS_Ratio <= 100 && pt.RS_Momentum <= 100) return "Lagging";
        return "Improving";
    };

    const tickerQuadrants: Record<string, string> = {};
    const quadrantCounts: Record<string, number> = { Leading: 0, Weakening: 0, Lagging: 0, Improving: 0 };

    // Extract unique titles and assign quadrants
    const allTickers = Array.from(new Set(currentData.map(d => d.Ticker))).sort();

    for (const t of allTickers) {
        const q = getQuadrant(latestPoints[t]);
        tickerQuadrants[t] = q;
        if (quadrantCounts[q] !== undefined) quadrantCounts[q]++;
    }

    const totalCount = allTickers.length || 1;
    const quadrantPcts = {
        Leading: ((quadrantCounts.Leading / totalCount) * 100).toFixed(1),
        Weakening: ((quadrantCounts.Weakening / totalCount) * 100).toFixed(1),
        Lagging: ((quadrantCounts.Lagging / totalCount) * 100).toFixed(1),
        Improving: ((quadrantCounts.Improving / totalCount) * 100).toFixed(1),
    };

    // Filter by BOTH active tickers and active quadrants
    const filteredData = currentData.filter(d =>
        selectedTickers.includes(d.Ticker) &&
        selectedQuadrants.includes(tickerQuadrants[d.Ticker])
    );

    const toggleTicker = (ticker: string) => {
        if (selectedTickers.includes(ticker)) {
            setSelectedTickers(selectedTickers.filter(t => t !== ticker));
        } else {
            setSelectedTickers([...selectedTickers, ticker]);
        }
    };

    const toggleQuadrant = (quadrant: string) => {
        if (selectedQuadrants.includes(quadrant)) {
            setSelectedQuadrants(selectedQuadrants.filter(q => q !== quadrant));
        } else {
            setSelectedQuadrants([...selectedQuadrants, quadrant]);
        }
    };

    return (
        <div>
            <h1 className="text-xl font-bold text-white mb-1">Relative Rotation Graph (RRG)</h1>
            <p className="text-sm text-slate-400 mb-6 font-medium">
                Cycle analysis of themes vs Nifty 50
            </p>

            <div className="flex flex-col gap-6 mb-6 bg-[#111118] border border-[#1e1e2e] p-4 rounded-lg">
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-2 font-semibold">
                            Timeframe
                        </label>
                        <select
                            value={timeframe}
                            onChange={(e) => setTimeframe(e.target.value as "D" | "W" | "M")}
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
                            onChange={(e) => setTailLength(parseInt(e.target.value))}
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-2"
                        />
                    </div>
                </div>

                <div className="border-t border-[#1e1e2e] pt-4">
                    <div className="mb-4 flex flex-wrap gap-4">
                        {allQuadrants.map(q => {
                            const colors: Record<string, string> = {
                                Leading: "text-emerald-400",
                                Weakening: "text-yellow-400",
                                Lagging: "text-red-400",
                                Improving: "text-blue-400",
                            };
                            return (
                                <label key={q} className="flex items-center gap-1.5 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={selectedQuadrants.includes(q)}
                                        onChange={() => toggleQuadrant(q)}
                                        className="h-3.5 w-3.5 rounded bg-[#1a1a2e] border-slate-700 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                    />
                                    <span className={`text-[13px] font-semibold ${colors[q]}`}>
                                        {q}
                                    </span>
                                    <span className="text-[11px] text-slate-500 font-medium bg-[#1a1a2e] px-1.5 py-0.5 rounded ml-1">
                                        {quadrantPcts[q as keyof typeof quadrantPcts]}%
                                    </span>
                                </label>
                            );
                        })}
                    </div>

                    <div className="flex justify-between items-center mb-3">
                        <label className="text-xs text-slate-400 font-semibold cursor-pointer select-none"
                            onClick={() => setIsSelecting(!isSelecting)}
                        >
                            Select Themes/Indices for RRG {isSelecting ? "▼" : "▶"} ({selectedTickers.length}/{allTickers.length})
                        </label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSelectedTickers(allTickers)}
                                className="text-[10px] uppercase font-bold text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                Select All
                            </button>
                            <span className="text-slate-600">|</span>
                            <button
                                onClick={() => setSelectedTickers([])}
                                className="text-[10px] uppercase font-bold text-red-400 hover:text-red-300 transition-colors"
                            >
                                Clear
                            </button>
                            <span className="text-slate-600">|</span>
                            <button
                                onClick={() => setSelectedTickers(defaults)}
                                className="text-[10px] uppercase font-bold text-slate-400 hover:text-slate-300 transition-colors"
                            >
                                Reset
                            </button>
                        </div>
                    </div>

                    {isSelecting && (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto px-2 pb-2 custom-scrollbar">
                            {allTickers.map(ticker => {
                                const q = tickerQuadrants[ticker];
                                const dotColor = q === "Leading" ? "bg-emerald-400" : q === "Weakening" ? "bg-yellow-400" : q === "Lagging" ? "bg-red-400" : "bg-blue-400";
                                return (
                                    <label key={ticker} className="flex items-center gap-2 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={selectedTickers.includes(ticker)}
                                            onChange={() => toggleTicker(ticker)}
                                            className="h-3.5 w-3.5 rounded bg-[#1a1a2e] border-slate-700 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                        />
                                        <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} title={q} />
                                        <span className={`text-[13px] truncate transition-colors ${selectedTickers.includes(ticker) ? "text-slate-200" : "text-slate-500 group-hover:text-slate-400"}`}>
                                            {ticker}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <RRGChart data={filteredData} tailLength={tailLength} timeframe={timeframeLabel} />

            {/* Selected Indices Listed by Quadrant Below Graph */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {allQuadrants.map(q => {
                    if (!selectedQuadrants.includes(q)) return null;

                    // Show tickers that are both selected by user AND in this quadrant
                    const activeTickersInQuadrant = selectedTickers.filter(t => tickerQuadrants[t] === q);

                    if (activeTickersInQuadrant.length === 0) return null;

                    const colors: Record<string, string> = {
                        Leading: "border-emerald-500/20 bg-emerald-500/5",
                        Weakening: "border-yellow-500/20 bg-yellow-500/5",
                        Lagging: "border-red-500/20 bg-red-500/5",
                        Improving: "border-blue-500/20 bg-blue-500/5",
                    };

                    const textColors: Record<string, string> = {
                        Leading: "text-emerald-400",
                        Weakening: "text-yellow-400",
                        Lagging: "text-red-400",
                        Improving: "text-blue-400",
                    };

                    return (
                        <div key={q} className={`border rounded-lg p-3 ${colors[q]}`}>
                            <h3 className={`text-sm font-bold mb-2 flex justify-between items-center ${textColors[q]} border-b border-white/5 pb-2`}>
                                {q}
                                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded">{activeTickersInQuadrant.length}</span>
                            </h3>
                            <ul className="flex flex-col gap-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                {activeTickersInQuadrant.map(ticker => (
                                    <li key={ticker} className="text-xs text-slate-300 truncate hover:text-white transition-colors cursor-default" title={ticker}>
                                        {ticker}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
