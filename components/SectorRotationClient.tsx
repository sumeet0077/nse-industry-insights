// components/SectorRotationClient.tsx
"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { RRGChart } from "@/components/charts/RRGChart";
import type { RRGDataPoint } from "@/types";
import { ALL_CONFIGS } from "@/lib/config";
import { CaptureScreenshot } from "@/components/common/CaptureScreenshot";

interface SectorRotationClientProps {
    dataD: RRGDataPoint[];
    dataW: RRGDataPoint[];
    dataM: RRGDataPoint[];
}

/**
 * Permanent fix: converts a raw data-file ID like "breadth_theme_data_centre_and_ai"
 * into a human-readable title like "Data Centre And AI".
 * Used as a fallback when no config.ts entry matches.
 */
function humanizeTickerId(raw: string): string {
    return raw
        .replace(/^breadth_theme_/, "")    // strip theme prefix
        .replace(/^breadth_/, "")          // strip sector prefix
        .replace(/^market_breadth_/, "")   // strip broad market prefix
        .replace(/_and_/g, " & ")          // underscored "and" → &
        .replace(/_/g, " ")               // remaining underscores → spaces
        .replace(/\b\w/g, c => c.toUpperCase()); // Title Case
}

type TrendDirection = "off" | "rising" | "falling";
type TrendMetric = "momentum" | "ratio";

export function SectorRotationClient({ dataD, dataW, dataM }: SectorRotationClientProps) {
    const [timeframe, setTimeframe] = useState<"D" | "W" | "M">("W");
    const [tailLength, setTailLength] = useState(5);
    const [searchQuery, setSearchQuery] = useState("");

    // Filter defaults (Set to empty as per user preference for manual selection)
    const defaults: string[] = [];
    const [selectedTickers, setSelectedTickers] = useState<string[]>(defaults);
    const [isSelecting, setIsSelecting] = useState(false);

    // Quadrant filters
    const allQuadrants = ["Leading", "Weakening", "Lagging", "Improving"];
    const [selectedQuadrants, setSelectedQuadrants] = useState<string[]>(allQuadrants);
    const [expandedQuadrant, setExpandedQuadrant] = useState<string | null>(null);

    // Trend Scanner state
    const [trendDirection, setTrendDirection] = useState<TrendDirection>("off");
    const [trendMetric, setTrendMetric] = useState<TrendMetric>("momentum");
    const [trendLookback, setTrendLookback] = useState(10);

    const currentDataRaw = timeframe === "D" ? dataD : timeframe === "W" ? dataW : dataM;
    const timeframeLabel = timeframe === "D" ? "Daily" : timeframe === "W" ? "Weekly" : "Monthly";

    // Build a lookup map ONCE from ALL_CONFIGS for O(1) matching
    const tickerLookup = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of ALL_CONFIGS) {
            map.set(c.dataFile, c.title);
            map.set(c.id, c.title);
        }
        return map;
    }, []);

    // Map raw tickers to human readable titles with robust fallback
    const currentData = useMemo(() => {
        return currentDataRaw.map(d => {
            const title = tickerLookup.get(d.Ticker);
            return title ? { ...d, Ticker: title } : { ...d, Ticker: humanizeTickerId(d.Ticker) };
        });
    }, [currentDataRaw, tickerLookup]);

    // Group data by ticker for trend analysis
    const groupedByTicker = useMemo(() => {
        const grouped: Record<string, RRGDataPoint[]> = {};
        for (const pt of currentData) {
            if (!grouped[pt.Ticker]) grouped[pt.Ticker] = [];
            grouped[pt.Ticker].push(pt);
        }
        // Sort each group by date
        for (const ticker of Object.keys(grouped)) {
            grouped[ticker].sort((a, b) => a.Date.localeCompare(b.Date));
        }
        return grouped;
    }, [currentData]);

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

    // Trend Scanner: compute which tickers match the trend criteria
    const trendMatchingTickers = useMemo(() => {
        if (trendDirection === "off") return null; // null = scanner disabled

        const matches: string[] = [];
        for (const ticker of allTickers) {
            const points = groupedByTicker[ticker];
            if (!points || points.length < trendLookback + 1) continue;

            // Take the last (trendLookback + 1) points
            const tail = points.slice(-(trendLookback + 1));
            const metric = trendMetric === "momentum" ? "RS_Momentum" : "RS_Ratio";

            let isMatch = true;
            for (let i = 1; i < tail.length; i++) {
                const curr = tail[i][metric];
                const prev = tail[i - 1][metric];

                if (trendDirection === "rising") {
                    if (curr <= prev) { isMatch = false; break; }
                } else {
                    // "falling" — decrease OR flat counts as falling
                    if (curr > prev) { isMatch = false; break; }
                }
            }

            if (isMatch) matches.push(ticker);
        }
        return matches;
    }, [trendDirection, trendMetric, trendLookback, allTickers, groupedByTicker]);

    // Apply the trend scanner: auto-select matching tickers
    const applyTrendScanner = useCallback(() => {
        if (trendMatchingTickers) {
            setSelectedTickers(trendMatchingTickers);
        }
    }, [trendMatchingTickers]);

    // Handler for direction change that auto-applies the scanner
    const handleDirectionChange = useCallback((dir: TrendDirection) => {
        setTrendDirection(dir);
        if (dir === "off") return; // Don't change selection when turning off
        // We need to compute matches manually here since state updates are async
        // The effect below will handle auto-applying
    }, []);

    // Auto-apply scanner when direction, metric, or lookback changes
    // Using useMemo to determine if we should auto-apply
    const prevScannerRef = useRef({ direction: trendDirection, metric: trendMetric, lookback: trendLookback });
    if (
        trendDirection !== "off" &&
        trendMatchingTickers &&
        (prevScannerRef.current.direction !== trendDirection ||
         prevScannerRef.current.metric !== trendMetric ||
         prevScannerRef.current.lookback !== trendLookback)
    ) {
        prevScannerRef.current = { direction: trendDirection, metric: trendMetric, lookback: trendLookback };
        // Schedule update for next render cycle
        setTimeout(() => applyTrendScanner(), 0);
    }

    // Filter by BOTH active tickers and active quadrants
    const filteredData = currentData.filter(d =>
        selectedTickers.includes(d.Ticker) &&
        selectedQuadrants.includes(tickerQuadrants[d.Ticker])
    );

    // Search-filtered tickers for the selector panel
    const filteredAllTickers = searchQuery.trim()
        ? allTickers.filter(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
        : allTickers;

    const toggleTicker = (ticker: string) => {
        // Manual toggle disables the scanner
        if (trendDirection !== "off") setTrendDirection("off");
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

    const contentRef = useRef<HTMLDivElement>(null);

    const scannerIsActive = trendDirection !== "off";
    const matchCount = trendMatchingTickers?.length ?? 0;

    return (
        <div ref={contentRef}>
            <div className="flex items-start justify-between mb-4">
                <div className="flex flex-col">
                    <h1 className="text-xl font-bold text-white mb-1">Relative Rotation Graph (RRG)</h1>
                    <p className="text-sm text-slate-400 font-medium">
                        Cycle analysis of themes vs Nifty 50
                    </p>
                </div>
                <CaptureScreenshot 
                    targetRef={contentRef}
                    filename="Sector_Rotation_RRG"
                    label="Capture RRG"
                />
            </div>

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

                {/* ────────── Trend Scanner ────────── */}
                <div className="border-t border-[#1e1e2e] pt-4">
                    <div className="flex items-center gap-3 mb-4">
                        <h3 className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Trend Scanner</h3>
                        {scannerIsActive && (
                            <span className="text-[11px] font-bold bg-violet-500/20 text-violet-300 px-2 py-0.5 rounded-full animate-pulse">
                                {matchCount} match{matchCount !== 1 ? "es" : ""}
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col md:flex-row gap-4">
                        {/* Direction Toggle */}
                        <div className="flex-1">
                            <label className="block text-[11px] text-slate-500 mb-1.5 font-semibold">Direction</label>
                            <div className="flex gap-1">
                                {([
                                    { value: "off", label: "Off", icon: "⊘", color: "text-slate-400 border-slate-600 bg-slate-800/50", activeColor: "text-white bg-slate-700 border-slate-500" },
                                    { value: "rising", label: "Rising", icon: "↑", color: "text-slate-500 border-slate-700 bg-[#1a1a2e]", activeColor: "text-emerald-300 bg-emerald-500/20 border-emerald-500/40" },
                                    { value: "falling", label: "Falling", icon: "↓", color: "text-slate-500 border-slate-700 bg-[#1a1a2e]", activeColor: "text-red-300 bg-red-500/20 border-red-500/40" },
                                ] as const).map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => {
                                            handleDirectionChange(opt.value);
                                            if (opt.value !== "off") {
                                                // Compute and apply immediately
                                                setTimeout(() => applyTrendScanner(), 0);
                                            }
                                        }}
                                        className={`flex-1 text-[12px] font-semibold py-1.5 px-2 rounded border transition-all duration-200 ${
                                            trendDirection === opt.value ? opt.activeColor : opt.color
                                        } hover:brightness-110`}
                                    >
                                        <span className="mr-1">{opt.icon}</span>{opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Metric Toggle */}
                        <div className={`flex-1 transition-opacity duration-200 ${scannerIsActive ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                            <label className="block text-[11px] text-slate-500 mb-1.5 font-semibold">Metric</label>
                            <div className="flex gap-1">
                                {([
                                    { value: "momentum", label: "Momentum", desc: "RS-Momentum (ROC)" },
                                    { value: "ratio", label: "RS Ratio", desc: "RS-Ratio (Trend)" },
                                ] as const).map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => {
                                            setTrendMetric(opt.value);
                                            setTimeout(() => applyTrendScanner(), 0);
                                        }}
                                        title={opt.desc}
                                        className={`flex-1 text-[12px] font-semibold py-1.5 px-2 rounded border transition-all duration-200 ${
                                            trendMetric === opt.value
                                                ? "text-violet-300 bg-violet-500/20 border-violet-500/40"
                                                : "text-slate-500 border-slate-700 bg-[#1a1a2e]"
                                        } hover:brightness-110`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Lookback Slider */}
                        <div className={`flex-1 transition-opacity duration-200 ${scannerIsActive ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                            <label className="block text-[11px] text-slate-500 mb-1.5 font-semibold flex justify-between">
                                <span>Lookback Periods</span>
                                <span className="text-violet-400">{trendLookback}</span>
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="15"
                                value={trendLookback}
                                onChange={(e) => {
                                    setTrendLookback(parseInt(e.target.value));
                                    setTimeout(() => applyTrendScanner(), 0);
                                }}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-violet-500 mt-1.5"
                            />
                        </div>
                    </div>
                </div>
                {/* ────────── End Trend Scanner ────────── */}

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
                                onClick={() => { setTrendDirection("off"); setSelectedTickers(allTickers); }}
                                className="text-[10px] uppercase font-bold text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                Select All
                            </button>
                            <span className="text-slate-600">|</span>
                            <button
                                onClick={() => { setTrendDirection("off"); setSelectedTickers([]); }}
                                className="text-[10px] uppercase font-bold text-red-400 hover:text-red-300 transition-colors"
                            >
                                Clear
                            </button>
                            <span className="text-slate-600">|</span>
                            <button
                                onClick={() => { setTrendDirection("off"); setSelectedTickers(defaults); }}
                                className="text-[10px] uppercase font-bold text-slate-400 hover:text-slate-300 transition-colors"
                            >
                                Reset
                            </button>
                        </div>
                    </div>

                    {isSelecting && (
                        <div>
                            {/* Search Input */}
                            <div className="relative mb-3">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search themes..."
                                    className="w-full bg-[#1a1a2e] border border-slate-700 rounded-lg pl-9 pr-8 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery("")}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 max-h-60 overflow-y-auto px-2 pb-2 custom-scrollbar">
                                {filteredAllTickers.map(ticker => {
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
                                {filteredAllTickers.length === 0 && (
                                    <p className="col-span-full text-center text-sm text-slate-500 py-4">
                                        No themes matching &ldquo;{searchQuery}&rdquo;
                                    </p>
                                )}
                            </div>
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
                            <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-2">
                                <h3 className={`text-sm font-bold flex items-center gap-2 ${textColors[q]}`}>
                                    {q}
                                    <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white">{activeTickersInQuadrant.length}</span>
                                </h3>
                                <button
                                    onClick={() => setExpandedQuadrant(expandedQuadrant === q ? null : q)}
                                    className="text-[10px] text-slate-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-2 py-1 rounded flex items-center gap-1"
                                >
                                    {expandedQuadrant === q ? "Close" : "Expand"}
                                </button>
                            </div>

                            {expandedQuadrant === q ? (
                                // Full overlay view for screenshots
                                <div className="fixed inset-0 z-50 bg-[#0d0d14]/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8">
                                    <div className={`w-full max-w-4xl max-h-[90vh] flex flex-col border rounded-xl shadow-2xl ${colors[q]}`}>
                                        <div className="flex justify-between items-center p-4 border-b border-white/10 bg-[#111118]/80">
                                            <h3 className={`text-xl font-bold flex items-center gap-3 ${textColors[q]}`}>
                                                {q} Quadrant Themes
                                                <span className="text-xs bg-white/10 px-2 py-1 rounded text-white">{activeTickersInQuadrant.length} Themes</span>
                                            </h3>
                                            <button
                                                onClick={() => setExpandedQuadrant(null)}
                                                className="text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-colors"
                                            >
                                                Close View
                                            </button>
                                        </div>
                                        <div className="p-6 overflow-y-auto custom-scrollbar bg-[#111118]/40">
                                            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
                                                {activeTickersInQuadrant.map(ticker => (
                                                    <li key={ticker} className="text-sm font-medium text-slate-200 border-b border-white/5 pb-2 last:border-0">
                                                        {ticker}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                // Normal inline view
                                <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto custom-scrollbar pr-2">
                                    {activeTickersInQuadrant.map(ticker => (
                                        <li key={ticker} className="text-[13px] leading-relaxed text-slate-300 hover:text-white transition-colors cursor-default border-b border-white/5 pb-1 last:border-0" title={ticker}>
                                            {ticker}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
