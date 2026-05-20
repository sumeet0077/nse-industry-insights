"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { createChart, ColorType, CrosshairMode, PriceScaleMode, IChartApi, ISeriesApi, AreaSeries, LineSeries } from "lightweight-charts";
import type { BreadthDataPoint, TimeframeType, IndexConfig } from "@/types";
import { ALL_CONFIGS } from "@/lib/config";
import { Search, X, Settings2, Plus, Trash2 } from "lucide-react";

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
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    
    // Chart References
    const chartRef = useRef<IChartApi | null>(null);
    const primarySeriesRef = useRef<ISeriesApi<"Area"> | null>(null);
    const indicatorSeriesRefs = useRef<Record<string, ISeriesApi<"Line">>>({});
    const comparisonSeriesRefs = useRef<Record<string, ISeriesApi<"Line">>>({});

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
    
    const [startDate, setStartDate] = useState<string>("");
    const [endDate, setEndDate] = useState<string>("");

    // 0. Filter Data by Date
    const filteredPrimaryData = useMemo(() => {
        return primaryData.filter(d => {
            if (startDate && d.Date < startDate) return false;
            if (endDate && d.Date > endDate) return false;
            return true;
        });
    }, [primaryData, startDate, endDate]);

    // 1. Data Aggregation
    const displayData = useMemo(() => {
        if (timeframe === "D") return filteredPrimaryData;

        const aggregated: BreadthDataPoint[] = [];
        let currentGroup: BreadthDataPoint[] = [];

        filteredPrimaryData.forEach((d, i) => {
            currentGroup.push(d);
            const isLast = i === filteredPrimaryData.length - 1;

            let shouldFlush = false;
            if (timeframe === "W") {
                if (isLast) {
                    shouldFlush = true;
                } else {
                    const nextDateStr = filteredPrimaryData[i+1].Date;
                    if (getStartOfWeek(d.Date) !== getStartOfWeek(nextDateStr)) {
                        shouldFlush = true;
                    }
                }
            } else if (timeframe === "M") {
                if (isLast) {
                    shouldFlush = true;
                } else {
                    const nextDateStr = filteredPrimaryData[i+1].Date;
                    if (d.Date.slice(0, 7) !== nextDateStr.slice(0, 7)) {
                        shouldFlush = true;
                    }
                }
            }

            if (shouldFlush && currentGroup.length > 0) {
                const last = currentGroup[currentGroup.length - 1];
                aggregated.push({ ...last });
                currentGroup = [];
            }
        });
        return aggregated;
    }, [filteredPrimaryData, timeframe]);

    const hasComparisons = comparisons.length > 0;

    // Format data for lightweight-charts
    const lwData = useMemo(() => {
        const baseValue = displayData[0]?.Index_Close || 1;
        return displayData
            .filter(d => d.Index_Close !== undefined && d.Index_Close !== null)
            .map(d => ({
                time: d.Date,
                value: hasComparisons 
                    ? (((d.Index_Close as number) / baseValue) - 1) * 100 
                    : (d.Index_Close as number)
            }));
    }, [displayData, hasComparisons]);

    const indicatorData = useMemo(() => {
        const prices = displayData.map(d => d.Index_Close || 0);
        const result: Record<string, { time: string, value: number }[]> = {};
        
        indicators.forEach(ind => {
            const values = ind.type === "SMA" 
                ? calculateSMA(prices, ind.period)
                : calculateEMA(prices, ind.period);
                
            const formatted: { time: string, value: number }[] = [];
            values.forEach((v, i) => {
                if (v !== null && displayData[i]?.Date) {
                    formatted.push({ time: displayData[i].Date, value: v });
                }
            });
            result[ind.id] = formatted;
        });
        return result;
    }, [displayData, indicators]);

    const comparisonDataMap = useMemo(() => {
        const result: Record<string, { time: string, value: number }[]> = {};
        
        comparisons.forEach(comp => {
            const compFiltered = comp.data.filter(d => {
                if (startDate && d.Date < startDate) return false;
                if (endDate && d.Date > endDate) return false;
                return true;
            });
            const compDisplayData = timeframe === "D" ? compFiltered : aggregateData(compFiltered, timeframe);
            const baseValue = compDisplayData[0]?.Index_Close || 1;
            
            const formatted = compDisplayData
                .filter(d => d.Index_Close !== undefined && d.Index_Close !== null)
                .map(d => ({
                    time: d.Date,
                    value: (((d.Index_Close as number) / baseValue) - 1) * 100
                }));
            result[comp.id] = formatted;
        });
        return result;
    }, [comparisons, timeframe, startDate, endDate]);

    // Refs for latest state to be used inside subscribeCrosshairMove closure
    const latestTitleRef = useRef(title);
    const latestIndicatorsRef = useRef(indicators);
    const latestComparisonsRef = useRef(comparisons);

    useEffect(() => {
        latestTitleRef.current = title;
        latestIndicatorsRef.current = indicators;
        latestComparisonsRef.current = comparisons;
    }, [title, indicators, comparisons]);

    // Chart Initialization and Updates
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#94a3b8',
                fontFamily: 'Inter, sans-serif',
            },
            grid: {
                vertLines: { color: '#1e1e2e', style: 1 }, // 1 is dotted
                horzLines: { color: '#1e1e2e', style: 1 },
            },
            rightPriceScale: {
                borderVisible: false,
                scaleMargins: { top: 0.1, bottom: 0.1 },
            },
            timeScale: {
                borderVisible: false,
                timeVisible: true,
                rightOffset: 5,
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    width: 1,
                    color: '#334155',
                    style: 3, // Dashed
                },
                horzLine: {
                    width: 1,
                    color: '#334155',
                    style: 3,
                },
            },
            autoSize: true,
        });
        chartRef.current = chart;

        // Primary Series
        const primarySeries = chart.addSeries(AreaSeries, {
            lineColor: '#3b82f6',
            topColor: 'rgba(59, 130, 246, 0.4)',
            bottomColor: 'rgba(59, 130, 246, 0.0)',
            lineWidth: 2,
            priceFormat: {
                type: 'price',
                precision: 2,
                minMove: 0.01,
            },
        });
        primarySeriesRef.current = primarySeries;

        // Setup Tooltip
        const toolTip = tooltipRef.current;
        if (toolTip) {
            chart.subscribeCrosshairMove((param) => {
                if (
                    param.point === undefined ||
                    !param.time ||
                    param.point.x < 0 ||
                    param.point.x > chartContainerRef.current!.clientWidth ||
                    param.point.y < 0 ||
                    param.point.y > chartContainerRef.current!.clientHeight
                ) {
                    toolTip.style.display = 'none';
                } else {
                    const dateStr = param.time as string;
                    let html = `<div class="font-bold mb-1 border-b border-slate-700 pb-1">${dateStr}</div>`;
                    
                    const currentTitle = latestTitleRef.current;
                    const currentIndicators = latestIndicatorsRef.current;
                    const currentComparisons = latestComparisonsRef.current;
                    const isComparing = currentComparisons.length > 0;
                    
                    const price = param.seriesData.get(primarySeries) as any;
                    if (price !== undefined) {
                        const rawVal = price.value !== undefined ? price.value : price;
                        const titleColorClass = isComparing ? 'text-white' : 'text-blue-400';
                        html += `<div class="flex justify-between gap-4"><span class="${titleColorClass} font-semibold">${currentTitle}</span> <span class="text-white">${rawVal.toFixed(2)}${isComparing ? '%' : ''}</span></div>`;
                    }
                    
                    // Indicators
                    if (!isComparing) {
                        currentIndicators.forEach(ind => {
                            const ref = indicatorSeriesRefs.current[ind.id];
                            if (ref) {
                                const val = param.seriesData.get(ref) as any;
                                if (val !== undefined) {
                                    const numVal = val.value !== undefined ? val.value : val;
                                    html += `<div class="flex justify-between gap-4"><span style="color:${ind.color}">${ind.type} ${ind.period}</span> <span class="text-white">${numVal.toFixed(2)}</span></div>`;
                                }
                            }
                        });
                    }

                    // Comparisons
                    currentComparisons.forEach(comp => {
                        const ref = comparisonSeriesRefs.current[comp.id];
                        if (ref) {
                            const val = param.seriesData.get(ref) as any;
                            if (val !== undefined) {
                                const numVal = val.value !== undefined ? val.value : val;
                                html += `<div class="flex justify-between gap-4"><span style="color:${comp.color}">${comp.title}</span> <span class="text-white">${numVal.toFixed(2)}%</span></div>`;
                            }
                        }
                    });

                    toolTip.innerHTML = html;
                    toolTip.style.display = 'block';
                    
                    const toolTipWidth = 200;
                    const toolTipHeight = 100;
                    const margin = 15;
                    const chartWidth = chartContainerRef.current!.clientWidth;
                    const chartHeight = chartContainerRef.current!.clientHeight;
                    
                    let left = param.point.x + margin;
                    if (left + toolTipWidth > chartWidth) {
                        left = param.point.x - toolTipWidth - margin;
                    }
                    
                    let top = param.point.y + margin;
                    if (top + toolTipHeight > chartHeight) {
                        top = param.point.y - toolTipHeight - margin;
                    }
                    
                    toolTip.style.left = left + 'px';
                    toolTip.style.top = top + 'px';
                }
            });
        }

        return () => {
            chart.remove();
            chartRef.current = null;
        };
    }, []); // Empty dep array for initialization only

    // Data Application Effect
    useEffect(() => {
        if (!chartRef.current || !primarySeriesRef.current) return;
        const chart = chartRef.current;
        
        // Use normal price scale mode. When comparing, the data itself is already converted to percentages.
        chart.applyOptions({
            rightPriceScale: {
                mode: PriceScaleMode.Normal,
            }
        });

        // 2. Set primary data
        primarySeriesRef.current.setData(lwData);

        // 3. Clear existing custom series
        Object.values(indicatorSeriesRefs.current).forEach(series => chart.removeSeries(series));
        indicatorSeriesRefs.current = {};
        
        Object.values(comparisonSeriesRefs.current).forEach(series => chart.removeSeries(series));
        comparisonSeriesRefs.current = {};

        // 4. Add Indicators (only if not comparing)
        if (!hasComparisons) {
            indicators.forEach(ind => {
                const series = chart.addSeries(LineSeries, {
                    color: ind.color,
                    lineWidth: 1,
                    lineStyle: 1, // Dotted
                    priceLineVisible: false,
                    lastValueVisible: false,
                    crosshairMarkerVisible: false,
                });
                series.setData(indicatorData[ind.id] || []);
                indicatorSeriesRefs.current[ind.id] = series;
            });
        }

        // 5. Add Comparisons
        if (hasComparisons) {
            // Also need to set primary series to simple line for consistency when comparing
            primarySeriesRef.current.applyOptions({
                lineColor: '#ffffff',
                topColor: 'rgba(255, 255, 255, 0)',
                bottomColor: 'rgba(255, 255, 255, 0)',
                lineWidth: 2,
                priceFormat: {
                    type: 'custom',
                    formatter: (price: number) => price.toFixed(2) + '%',
                }
            });

            comparisons.forEach(comp => {
                const series = chart.addSeries(LineSeries, {
                    color: comp.color,
                    lineWidth: 2,
                    priceFormat: {
                        type: 'custom',
                        formatter: (price: number) => price.toFixed(2) + '%',
                    },
                });
                series.setData(comparisonDataMap[comp.id] || []);
                comparisonSeriesRefs.current[comp.id] = series;
            });
        } else {
            // Reset primary series style
            primarySeriesRef.current.applyOptions({
                lineColor: '#3b82f6',
                topColor: 'rgba(59, 130, 246, 0.4)',
                bottomColor: 'rgba(59, 130, 246, 0.0)',
                lineWidth: 2,
                priceFormat: {
                    type: 'price',
                    precision: 2,
                    minMove: 0.01,
                }
            });
        }

        chart.timeScale().fitContent();

    }, [lwData, indicators, comparisons, indicatorData, comparisonDataMap, hasComparisons]);


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

                    {/* Primary Theme Legend */}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/50 border border-slate-700 text-[10px] font-bold text-slate-300">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: comparisons.length > 0 ? '#ffffff' : '#3b82f6' }} />
                        {title}
                    </div>

                    {comparisons.map(c => (
                        <div key={c.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold text-blue-300">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                            {c.title}
                            <X size={10} className="cursor-pointer hover:text-white" onClick={() => removeComparison(c.id)} />
                        </div>
                    ))}
                    
                    <div className="h-4 w-[1px] bg-slate-800 mx-2" />
                    
                    {/* Date Filters */}
                    <div className="flex items-center gap-1.5">
                        <input 
                            type="date" 
                            value={startDate} 
                            onChange={e => setStartDate(e.target.value)} 
                            className="bg-[#0a0a0f] border border-[#1e1e2e] text-slate-300 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-blue-500 cursor-pointer [color-scheme:dark]"
                        />
                        <span className="text-slate-500 text-[10px]">to</span>
                        <input 
                            type="date" 
                            value={endDate} 
                            onChange={e => setEndDate(e.target.value)} 
                            className="bg-[#0a0a0f] border border-[#1e1e2e] text-slate-300 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-blue-500 cursor-pointer [color-scheme:dark]"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => {
                            setStartDate("");
                            setEndDate("");
                            if (chartRef.current) chartRef.current.timeScale().fitContent();
                        }}
                        className="px-3 py-1.5 bg-slate-800/50 hover:bg-slate-700 text-slate-300 rounded text-[10px] transition-colors border border-[#1e1e2e]"
                    >
                        Reset View
                    </button>
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
                <div className="flex-1 relative bg-[#0a0a0f]" style={{ minHeight: '600px' }}>
                    <div ref={chartContainerRef} className="absolute inset-0" />
                    <div 
                        ref={tooltipRef} 
                        className="absolute z-50 bg-[#1e1e2e]/90 border border-slate-700 p-2 text-xs rounded shadow-lg pointer-events-none"
                        style={{ display: 'none' }}
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
        const isLast = i === data.length - 1;

        let shouldFlush = false;
        if (timeframe === "W") {
            if (isLast) {
                shouldFlush = true;
            } else {
                const nextDateStr = data[i+1].Date;
                if (getStartOfWeek(d.Date) !== getStartOfWeek(nextDateStr)) {
                    shouldFlush = true;
                }
            }
        } else if (timeframe === "M") {
            if (isLast) {
                shouldFlush = true;
            } else {
                const nextDateStr = data[i+1].Date;
                if (d.Date.slice(0, 7) !== nextDateStr.slice(0, 7)) {
                    shouldFlush = true;
                }
            }
        }

        if (shouldFlush && currentGroup.length > 0) {
            aggregated.push(currentGroup[currentGroup.length - 1]);
            currentGroup = [];
        }
    });
    return aggregated;
}

function getStartOfWeek(dateStr: string): string {
    const parts = dateStr.split("-");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(Date.UTC(year, month, day));
    const dayOfWeek = d.getUTCDay();
    const diff = d.getUTCDate() - dayOfWeek;
    const sunday = new Date(Date.UTC(year, month, diff));
    return sunday.toISOString().split("T")[0];
}
