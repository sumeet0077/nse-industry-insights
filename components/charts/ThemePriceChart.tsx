// components/charts/ThemePriceChart.tsx
"use client";

import dynamic from "next/dynamic";
import { useState, useMemo, useEffect } from "react";
import type { BreadthDataPoint, TimeframeType, IndexConfig } from "@/types";
import { ALL_CONFIGS } from "@/lib/config";
import { Search, X, Settings2, Plus, Trash2 } from "lucide-react";

const Plot = dynamic(() => import("react-plotly.js"), {
    ssr: false,
    loading: () => (
        <div className="w-full h-[600px] flex items-center justify-center bg-slate-900/20 text-slate-400 rounded-lg animate-pulse">
            Loading Price Chart...
        </div>
    ),
});

interface Indicator {
    id: string;
    type: "SMA" | "EMA";
    period: number;
    color: string;
}

interface ComparisonSeries {
    id: string;
    title: string;
    data: BreadthDataPoint[];
    color: string;
}

interface ThemePriceChartProps {
    primaryData: BreadthDataPoint[];
    title: string;
    themeId: string;
}

export function ThemePriceChart({ primaryData, title, themeId }: ThemePriceChartProps) {
    const [timeframe, setTimeframe] = useState<TimeframeType>("D");
    const [indicators, setIndicators] = useState<Indicator[]>([
        { id: "1", type: "SMA", period: 20, color: "#f59e0b" },
        { id: "2", type: "SMA", period: 50, color: "#3b82f6" },
        { id: "3", type: "SMA", period: 200, color: "#ef4444" },
    ]);
    const [comparisons, setComparisons] = useState<ComparisonSeries[]>([]);
    const [isAddingComparison, setIsAddingComparison] = useState(false);
    const [compareSearch, setCompareSearch] = useState("");
    const [showSettings, setShowSettings] = useState(false);

    // 1. Data Aggregation
    const displayData = useMemo(() => {
        if (timeframe === "D") return primaryData;

        const aggregated: BreadthDataPoint[] = [];
        let currentGroup: BreadthDataPoint[] = [];

        primaryData.forEach((d, i) => {
            currentGroup.push(d);
            const date = new Date(d.Date);
            const isLast = i === primaryData.length - 1;

            let shouldFlush = false;
            if (timeframe === "W") {
                // Flush on Sunday or last point
                if (date.getDay() === 0 || isLast) shouldFlush = true;
            } else if (timeframe === "M") {
                // Flush on last day of month or last point
                const nextDate = i < primaryData.length - 1 ? new Date(primaryData[i+1].Date) : null;
                if (!nextDate || nextDate.getMonth() !== date.getMonth()) shouldFlush = true;
            }

            if (shouldFlush && currentGroup.length > 0) {
                const last = currentGroup[currentGroup.length - 1];
                aggregated.push({
                    ...last,
                    // In a line chart, we just take the last close. 
                    // If we had OHLC, we'd take Open from first, High from max, Low from min, Close from last.
                });
                currentGroup = [];
            }
        });
        return aggregated;
    }, [primaryData, timeframe]);

    // 2. Indicator Calculation
    const indicatorSeries = useMemo(() => {
        const prices = displayData.map(d => d.Index_Close || 0);
        return indicators.map(ind => {
            const values = ind.type === "SMA" 
                ? calculateSMA(prices, ind.period)
                : calculateEMA(prices, ind.period);
            return { ...ind, values };
        });
    }, [displayData, indicators]);

    // 3. Comparison Normalization
    const chartTraces = useMemo(() => {
        const traces: any[] = [];

        // Primary trace
        const hasComparisons = comparisons.length > 0;
        
        if (!hasComparisons) {
            // Absolute price trace
            traces.push({
                x: displayData.map(d => d.Date),
                y: displayData.map(d => d.Index_Close),
                type: "scatter",
                mode: "lines",
                name: title,
                line: { color: "#ffffff", width: 2 },
                hovertemplate: "%{y:.2f}<extra></extra>",
            });

            // Indicators only on absolute chart
            indicatorSeries.forEach(ind => {
                traces.push({
                    x: displayData.map(d => d.Date),
                    y: ind.values,
                    type: "scatter",
                    mode: "lines",
                    name: `${ind.type} ${ind.period}`,
                    line: { color: ind.color, width: 1, dash: "dot" },
                    connectgaps: false,
                    hovertemplate: "%{y:.2f}<extra></extra>",
                });
            });
        } else {
            // Percentage change traces for comparison
            const baseDate = displayData[0]?.Date;
            const primaryBase = displayData[0]?.Index_Close || 1;

            traces.push({
                x: displayData.map(d => d.Date),
                y: displayData.map(d => ((d.Index_Close || 0) / primaryBase - 1) * 100),
                type: "scatter",
                mode: "lines",
                name: title,
                line: { color: "#ffffff", width: 2 },
                hovertemplate: "%{y:.2f}%<extra></extra>",
            });

            comparisons.forEach(comp => {
                // Re-aggregate comparison data if timeframe changed
                const compDisplayData = timeframe === "D" ? comp.data : aggregateData(comp.data, timeframe);
                const compBase = compDisplayData[0]?.Index_Close || 1;
                
                traces.push({
                    x: compDisplayData.map(d => d.Date),
                    y: compDisplayData.map(d => ((d.Index_Close || 0) / compBase - 1) * 100),
                    type: "scatter",
                    mode: "lines",
                    name: comp.title,
                    line: { color: comp.color, width: 1.5 },
                    hovertemplate: "%{y:.2f}%<extra></extra>",
                });
            });
        }

        return traces;
    }, [displayData, title, timeframe, indicators, indicatorSeries, comparisons]);

    const addComparison = async (config: IndexConfig) => {
        if (comparisons.find(c => c.id === config.id)) return;
        
        try {
            const res = await fetch(`/data/breadth/${config.dataFile}.json`);
            const data = await res.json();
            
            const colors = ["#fbbf24", "#34d399", "#f87171", "#818cf8", "#e879f9"];
            const color = colors[comparisons.length % colors.length];

            setComparisons([...comparisons, {
                id: config.id,
                title: config.title,
                data: data,
                color: color
            }]);
            setIsAddingComparison(false);
            setCompareSearch("");
        } catch (err) {
            console.error("Failed to fetch comparison data", err);
        }
    };

    const removeComparison = (id: string) => {
        setComparisons(comparisons.filter(c => c.id !== id));
    };

    const addIndicator = () => {
        const id = Math.random().toString(36).substr(2, 9);
        setIndicators([...indicators, { id, type: "SMA", period: 50, color: "#ffffff" }]);
    };

    const removeIndicator = (id: string) => {
        setIndicators(indicators.filter(i => i.id !== id));
    };

    const updateIndicator = (id: string, updates: Partial<Indicator>) => {
        setIndicators(indicators.map(i => i.id === id ? { ...i, ...updates } : i));
    };

    const filteredConfigs = ALL_CONFIGS.filter(c => 
        c.id !== themeId && 
        c.title.toLowerCase().includes(compareSearch.toLowerCase())
    ).slice(0, 10);

    return (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden flex flex-col h-full min-h-[700px]">
            {/* Header / Controls */}
            <div className="p-3 border-b border-[#1e1e2e] bg-[#161625]/50 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className="flex bg-[#0a0a0f] rounded-lg p-0.5 border border-[#1e1e2e]">
                        {(["D", "W", "M"] as TimeframeType[]).map(tf => (
                            <button
                                key={tf}
                                onClick={() => setTimeframe(tf)}
                                className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                                    timeframe === tf 
                                        ? "bg-blue-500/20 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]" 
                                        : "text-slate-500 hover:text-slate-300"
                                }`}
                            >
                                {tf === "D" ? "1D" : tf === "W" ? "1W" : "1M"}
                            </button>
                        ))}
                    </div>
                    
                    <div className="h-4 w-[1px] bg-slate-800 mx-2" />

                    {/* Comparison Manager */}
                    <div className="relative">
                        <button 
                            onClick={() => setIsAddingComparison(!isAddingComparison)}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#0a0a0f] border border-[#1e1e2e] text-[10px] font-bold text-slate-300 hover:border-blue-500/50 transition-all"
                        >
                            <Plus size={12} className="text-blue-400" />
                            Compare
                        </button>

                        {isAddingComparison && (
                            <div className="absolute top-full left-0 mt-2 w-64 z-50 bg-[#1a1a2e] border border-slate-700 rounded-xl shadow-2xl p-2 animate-in fade-in slide-in-from-top-2">
                                <div className="relative mb-2">
                                    <Search className="absolute left-2 top-2 text-slate-500" size={14} />
                                    <input 
                                        autoFocus
                                        value={compareSearch}
                                        onChange={e => setCompareSearch(e.target.value)}
                                        placeholder="Search themes..."
                                        className="w-full bg-[#0a0a0f] border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                    {filteredConfigs.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => addComparison(c)}
                                            className="w-full text-left px-2 py-1.5 rounded-lg text-xs text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
                                        >
                                            {c.title}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {comparisons.map(c => (
                        <div key={c.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-300">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                            {c.title}
                            <X size={10} className="cursor-pointer hover:text-white" onClick={() => removeComparison(c.id)} />
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-1.5 rounded-lg border transition-all ${
                            showSettings 
                                ? "bg-blue-500/10 border-blue-500/50 text-blue-400" 
                                : "bg-[#0a0a0f] border-[#1e1e2e] text-slate-500 hover:text-slate-300"
                        }`}
                    >
                        <Settings2 size={16} />
                    </button>
                </div>
            </div>

            <div className="flex-1 relative flex">
                <div className="flex-1 min-h-[600px]">
                    <Plot
                        useResizeHandler={true}
                        data={chartTraces}
                        layout={{
                            paper_bgcolor: "transparent",
                            plot_bgcolor: "transparent",
                            font: { color: "#94a3b8", family: "Inter, sans-serif", size: 11 },
                            margin: { l: 60, r: 20, t: 30, b: 40 },
                            hoverlabel: {
                                bgcolor: "#1e1e2e",
                                font: { color: "#f8fafc", size: 12, family: "Inter, sans-serif" },
                                bordercolor: "#334155",
                            },
                            xaxis: {
                                gridcolor: "#1e1e2e",
                                tickformat: timeframe === "D" ? "%d %b %y" : "%b %y",
                                rangeslider: { visible: false },
                                zeroline: false,
                            },
                            yaxis: {
                                gridcolor: "#1e1e2e",
                                title: { text: comparisons.length > 0 ? "Change (%)" : "Index Value", standoff: 15 },
                                ticksuffix: comparisons.length > 0 ? "%" : "",
                                side: "right" as const,
                                zeroline: true,
                                zerolinecolor: "#334155",
                            },
                            hovermode: "x unified" as const,
                            showlegend: comparisons.length > 0,
                            legend: { orientation: "h" as const, y: 1.05, x: 0.5, xanchor: "center" as const },
                            autosize: true,
                            height: 650,
                        }}
                        config={{
                            responsive: true,
                            displayModeBar: true,
                            displaylogo: false,
                            modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"]
                        }}
                        style={{ width: "100%", height: "650px" }}
                    />
                </div>

                {/* Settings Sidebar */}
                {showSettings && (
                    <div className="w-72 border-l border-[#1e1e2e] bg-[#0d0d14] p-4 animate-in slide-in-from-right overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Indicators</h4>
                            <button 
                                onClick={addIndicator}
                                className="p-1 hover:bg-white/5 rounded text-blue-400"
                                title="Add Indicator"
                            >
                                <Plus size={14} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            {indicators.map((ind) => (
                                <div key={ind.id} className="p-3 rounded-lg bg-[#161625] border border-[#1e1e2e]">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <select 
                                                value={ind.type}
                                                onChange={e => updateIndicator(ind.id, { type: e.target.value as any })}
                                                className="bg-transparent text-[10px] font-bold text-blue-400 outline-none"
                                            >
                                                <option value="SMA">SMA</option>
                                                <option value="EMA">EMA</option>
                                            </select>
                                            <input 
                                                type="number"
                                                value={ind.period}
                                                onChange={e => updateIndicator(ind.id, { period: parseInt(e.target.value) || 1 })}
                                                className="w-12 bg-[#0a0a0f] border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-white"
                                            />
                                        </div>
                                        <button onClick={() => removeIndicator(ind.id)} className="text-slate-600 hover:text-red-400">
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="color"
                                            value={ind.color}
                                            onChange={e => updateIndicator(ind.id, { color: e.target.value })}
                                            className="w-full h-4 bg-transparent border-none cursor-pointer rounded overflow-hidden"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-6 pt-6 border-t border-[#1e1e2e]">
                            <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-2">Instructions</h4>
                            <p className="text-[10px] text-slate-500 leading-relaxed">
                                Indicators are only visible on the absolute price chart. When comparing themes, the chart switches to percentage change mode for relative analysis.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper functions
function calculateSMA(data: number[], period: number): (number | null)[] {
    const result: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j];
            }
            result.push(sum / period);
        }
    }
    return result;
}

function calculateEMA(data: number[], period: number): (number | null)[] {
    const result: (number | null)[] = [];
    const k = 2 / (period + 1);
    let prevEMA: number | null = null;
    
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else if (i === period - 1) {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[j];
            }
            prevEMA = sum / period;
            result.push(prevEMA);
        } else {
            const currentEMA: number = data[i] * k + (prevEMA as number) * (1 - k);
            prevEMA = currentEMA;
            result.push(currentEMA);
        }
    }
    return result;
}

function aggregateData(data: BreadthDataPoint[], timeframe: "D" | "W" | "M"): BreadthDataPoint[] {
    if (timeframe === "D") return data;

    const aggregated: BreadthDataPoint[] = [];
    let currentGroup: BreadthDataPoint[] = [];

    data.forEach((d, i) => {
        currentGroup.push(d);
        const date = new Date(d.Date);
        const isLast = i === data.length - 1;

        let shouldFlush = false;
        if (timeframe === "W") {
            if (date.getDay() === 0 || isLast) shouldFlush = true;
        } else if (timeframe === "M") {
            const nextDate = i < data.length - 1 ? new Date(data[i+1].Date) : null;
            if (!nextDate || nextDate.getMonth() !== date.getMonth()) shouldFlush = true;
        }

        if (shouldFlush && currentGroup.length > 0) {
            aggregated.push(currentGroup[currentGroup.length - 1]);
            currentGroup = [];
        }
    });
    return aggregated;
}
