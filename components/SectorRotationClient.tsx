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

    const currentDataRaw = timeframe === "D" ? dataD : timeframe === "W" ? dataW : dataM;
    const timeframeLabel = timeframe === "D" ? "Daily" : timeframe === "W" ? "Weekly" : "Monthly";

    // Map raw tickers (like "breadth_auto") to human readable titles (like "Nifty Auto")
    const currentData = currentDataRaw.map(d => {
        const csvName = `${d.Ticker}.csv`;
        const config = ALL_CONFIGS.find(c => c.dataFile === csvName);
        return config ? { ...d, Ticker: config.title } : d;
    });

    // Extract unique titles and sort them
    const allTickers = Array.from(new Set(currentData.map(d => d.Ticker))).sort();

    // Make sure defaults are applied when toggling to empty array
    const filteredData = currentData.filter(d => selectedTickers.includes(d.Ticker));

    const toggleTicker = (ticker: string) => {
        if (selectedTickers.includes(ticker)) {
            setSelectedTickers(selectedTickers.filter(t => t !== ticker));
        } else {
            setSelectedTickers([...selectedTickers, ticker]);
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
                            {allTickers.map(ticker => (
                                <label key={ticker} className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={selectedTickers.includes(ticker)}
                                        onChange={() => toggleTicker(ticker)}
                                        className="h-3.5 w-3.5 rounded bg-[#1a1a2e] border-slate-700 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                    />
                                    <span className={`text-[13px] truncate transition-colors ${selectedTickers.includes(ticker) ? "text-slate-200" : "text-slate-500 group-hover:text-slate-400"}`}>
                                        {ticker}
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <RRGChart data={filteredData} tailLength={tailLength} timeframe={timeframeLabel} />
        </div>
    );
}
