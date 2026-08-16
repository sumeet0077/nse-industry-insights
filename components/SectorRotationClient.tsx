// components/SectorRotationClient.tsx
"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { RRGChart } from "@/components/charts/RRGChart";
import { IndexConfig, RRGDataPoint, TimeframeType, QuadrantType, TrendMetricDirectionType, OriginDistanceType, SuperTrendPresetType } from "@/types";
import { ALL_CONFIGS, BROAD_MARKET, QUADRANTS, QUADRANT_COLORS, TIMEFRAMES, ORIGIN_RADIUS_MAP } from "@/lib/config";
import { CaptureScreenshot } from "@/components/common/CaptureScreenshot";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { CategoryFilter, getCategoryForTitle } from "@/components/common/CategoryFilter";
import { computeRRGData, calculateOriginDistance, calculateSuperTrendScore } from "@/lib/rrg";
import type { ThemeBreadthSummary } from "@/lib/data";

interface SectorRotationClientProps {
    dataD: RRGDataPoint[];
    dataW: RRGDataPoint[];
    dataM: RRGDataPoint[];
    allThemeData?: ThemeBreadthSummary[];
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

export function SectorRotationClient({ dataD, dataW, dataM, allThemeData }: SectorRotationClientProps) {
    const [benchmarkId, setBenchmarkId] = useLocalStorage<string>("sr_benchmark", "market_breadth_nifty50");
    const [timeframe, setTimeframe] = useLocalStorage<TimeframeType>("sr_timeframe", "W");
    const [tailLength, setTailLength] = useLocalStorage("sr_tailLength", 5);
    const [searchQuery, setSearchQuery] = useState("");

    const [selectedTickers, setSelectedTickers] = useLocalStorage<string[]>("sr_selectedTickers", []);
    const [isSelecting, setIsSelecting] = useState(false);

    // Quadrant filters
    const [selectedQuadrants, setSelectedQuadrants] = useLocalStorage<QuadrantType[]>("sr_selectedQuadrants", [...QUADRANTS]);
    const [expandedQuadrant, setExpandedQuadrant] = useState<QuadrantType | null>(null);

    // Trend Scanner state — independent per-metric direction & Origin Distance
    const [momentumDir, setMomentumDir] = useLocalStorage<TrendMetricDirectionType>("sr_momentumDir", "off");
    const [ratioDir, setRatioDir] = useLocalStorage<TrendMetricDirectionType>("sr_ratioDir", "off");
    const [originDist, setOriginDist] = useLocalStorage<OriginDistanceType>("sr_originDist", "off");
    const [superTrendPreset, setSuperTrendPreset] = useLocalStorage<SuperTrendPresetType>("sr_preset", "off");
    const [trendLookback, setTrendLookback] = useLocalStorage("sr_trendLookback", 3);
    const [isCopied, setIsCopied] = useState(false);

    // Category filters
    const [showBroadMarket, setShowBroadMarket] = useLocalStorage("sr_showBroadMarket", true);
    const [showSectors, setShowSectors] = useLocalStorage("sr_showSectors", true);
    const [showIndustries, setShowIndustries] = useLocalStorage("sr_showIndustries", true);

    // Top N per-quadrant filter state
    const [topNCount, setTopNCount] = useLocalStorage<number | "All">("sr_topNCount", "All");

    const currentDataRaw = useMemo(() => {
        if (allThemeData && allThemeData.length > 0) {
            const dynamicData = computeRRGData(allThemeData, benchmarkId, timeframe);
            if (dynamicData && dynamicData.length > 0) {
                return dynamicData;
            }
        }
        // Fallback to pre-computed Nifty 50 static RRG data
        return timeframe === "D" ? dataD : timeframe === "W" ? dataW : dataM;
    }, [allThemeData, benchmarkId, timeframe, dataD, dataW, dataM]);

    const timeframeLabel = TIMEFRAMES[timeframe];

    // Build a lookup map ONCE from ALL_CONFIGS for O(1) matching
    const tickerLookup = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of ALL_CONFIGS) {
            map.set(c.dataFile, c.title);
            map.set(c.id, c.title);
        }
        return map;
    }, []);

    // Helper: get display label for any ticker/id
    const getLabel = useCallback((ticker: string): string => {
        const clean = ticker.replace(/\.NS$/i, "");
        return tickerLookup.get(clean) || tickerLookup.get(ticker) || humanizeTickerId(ticker);
    }, [tickerLookup]);

    const currentData = useMemo(() => {
        if (!currentDataRaw) return [];
        return currentDataRaw.map(d => ({ ...d, Ticker: getLabel(d.Ticker) })).filter((d) => {
            const category = getCategoryForTitle(d.Ticker, ALL_CONFIGS);
            if (category === "broad-market" && !showBroadMarket) return false;
            if (category === "sectors" && !showSectors) return false;
            if (category === "industries" && !showIndustries) return false;
            return true;
        });
    }, [currentDataRaw, showBroadMarket, showSectors, showIndustries, getLabel]);

    // Daily dataset for true Multi-Timeframe (MTF) Alignment
    const dailyDataRaw = useMemo(() => {
        if (allThemeData && allThemeData.length > 0) {
            const dynamicDaily = computeRRGData(allThemeData, benchmarkId, "D");
            if (dynamicDaily && dynamicDaily.length > 0) return dynamicDaily;
        }
        return dataD;
    }, [allThemeData, benchmarkId, dataD]);

    const dailyGroupedByTicker = useMemo(() => {
        const acc: Record<string, RRGDataPoint[]> = {};
        if (!dailyDataRaw) return acc;
        for (const pt of dailyDataRaw) {
            const label = getLabel(pt.Ticker);
            if (!acc[label]) acc[label] = [];
            acc[label].push(pt);
        }
        return acc;
    }, [dailyDataRaw, getLabel]);

    // Check if daily momentum is rising or in leadership for MTF alignment
    const isMtfAligned = useCallback((ticker: string): boolean => {
        const dPoints = dailyGroupedByTicker[ticker];
        if (!dPoints || dPoints.length < 2) return true; // Graceful fallback if daily not yet loaded
        const effectiveLookback = Math.min(3, dPoints.length - 1);
        const dTail = dPoints.slice(-(effectiveLookback + 1));
        const dHead = dTail[dTail.length - 1];
        const dStart = dTail[0];
        return (dHead.RS_Momentum > dStart.RS_Momentum) || (dHead.RS_Momentum >= 100);
    }, [dailyGroupedByTicker]);

    // Group by Ticker
    const groupedByTicker = useMemo(() => {
        const acc: Record<string, RRGDataPoint[]> = {};
        for (const pt of currentData) {
            if (!acc[pt.Ticker]) acc[pt.Ticker] = [];
            acc[pt.Ticker].push(pt);
        }
        return acc;
    }, [currentData]);

    const allTickers = useMemo(() => Object.keys(groupedByTicker), [groupedByTicker]);

    // Latest points per ticker
    const latestPoints = useMemo(() => {
        const map: Record<string, RRGDataPoint> = {};
        for (const ticker of allTickers) {
            const pts = groupedByTicker[ticker];
            if (pts && pts.length > 0) {
                map[ticker] = pts[pts.length - 1];
            }
        }
        return map;
    }, [allTickers, groupedByTicker]);

    // Ticker quadrants
    const tickerQuadrants = useMemo(() => {
        const map: Record<string, QuadrantType> = {};
        for (const ticker of allTickers) {
            const pt = latestPoints[ticker];
            if (pt) {
                if (pt.RS_Ratio >= 100 && pt.RS_Momentum >= 100) map[ticker] = "Leading";
                else if (pt.RS_Ratio >= 100 && pt.RS_Momentum < 100) map[ticker] = "Weakening";
                else if (pt.RS_Ratio < 100 && pt.RS_Momentum < 100) map[ticker] = "Lagging";
                else map[ticker] = "Improving";
            }
        }
        return map;
    }, [allTickers, latestPoints]);

    const titleToConfig = useMemo(() => {
        const map = new Map<string, IndexConfig>();
        for (const c of ALL_CONFIGS) {
            map.set(c.title, c);
        }
        return map;
    }, []);

    const quadrantPcts = useMemo(() => {
        const total = allTickers.length || 1;
        const counts = { Leading: 0, Weakening: 0, Lagging: 0, Improving: 0 };
        for (const t of allTickers) {
            const q = tickerQuadrants[t];
            if (q) counts[q]++;
        }
        return {
            Leading: Math.round((counts.Leading / total) * 100),
            Weakening: Math.round((counts.Weakening / total) * 100),
            Lagging: Math.round((counts.Lagging / total) * 100),
            Improving: Math.round((counts.Improving / total) * 100),
        };
    }, [allTickers, tickerQuadrants]);

    // Top N per-quadrant filter logic
    const topNActiveTickers = useMemo(() => {
        if (topNCount === "All") return null;

        const maxN = Number(topNCount);
        const perQuad: Record<QuadrantType, { ticker: string; dist: number }[]> = {
            Leading: [],
            Weakening: [],
            Lagging: [],
            Improving: [],
        };

        for (const ticker of allTickers) {
            const q = tickerQuadrants[ticker];
            const pt = latestPoints[ticker];
            if (q && pt) {
                const dist = Math.sqrt(Math.pow(pt.RS_Ratio - 100, 2) + Math.pow(pt.RS_Momentum - 100, 2));
                perQuad[q].push({ ticker, dist });
            }
        }

        const allowed = new Set<string>();
        for (const q of QUADRANTS) {
            perQuad[q].sort((a, b) => b.dist - a.dist);
            const topSlice = perQuad[q].slice(0, maxN);
            for (const item of topSlice) {
                allowed.add(item.ticker);
            }
        }

        return allowed;
    }, [topNCount, allTickers, tickerQuadrants, latestPoints]);

    const activeTopNSet = useMemo(() => {
        return topNActiveTickers ? new Set(topNActiveTickers) : null;
    }, [topNActiveTickers]);

    // Trend Scanner: compute which tickers match the trend criteria
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

        for (const ticker of allTickers) {
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

            // 3. Multi-Timeframe (MTF) Alignment for Presets
            if (isMatch && (superTrendPreset === "mtf_aligned" || superTrendPreset === "super_trend")) {
                if (!isMtfAligned(ticker)) {
                    isMatch = false;
                }
            }

            if (isMatch) matches.push(ticker);
        }
        return matches;
    }, [momentumDir, ratioDir, originDist, superTrendPreset, trendLookback, allTickers, groupedByTicker, isMtfAligned]);

    // Derive active preset from current toggle states
    const activePreset = useMemo(() => {
        if (superTrendPreset !== "off") return superTrendPreset;
        if (momentumDir === "rising"  && ratioDir === "rising" && originDist === "off")  return "improving";
        if (momentumDir === "falling" && ratioDir === "rising" && originDist === "off")  return "leading";
        if (momentumDir === "falling" && ratioDir === "falling" && originDist === "off") return "weakening";
        if (momentumDir === "rising"  && ratioDir === "falling" && originDist === "off") return "lagging";
        return "off";
    }, [superTrendPreset, momentumDir, ratioDir, originDist]);

    // Apply the trend scanner: auto-select matching tickers
    const applyTrendScanner = useCallback(() => {
        if (trendMatchingTickers) {
            setSelectedTickers(trendMatchingTickers);
        }
    }, [trendMatchingTickers, setSelectedTickers]);

    // Auto-apply scanner when direction or lookback changes
    const prevScannerRef = useRef({ momentumDir, ratioDir, originDist, superTrendPreset, lookback: trendLookback });
    if (
        scannerIsActive &&
        trendMatchingTickers &&
        (prevScannerRef.current.momentumDir !== momentumDir ||
         prevScannerRef.current.ratioDir !== ratioDir ||
         prevScannerRef.current.originDist !== originDist ||
         prevScannerRef.current.superTrendPreset !== superTrendPreset ||
         prevScannerRef.current.lookback !== trendLookback)
    ) {
        prevScannerRef.current = { momentumDir, ratioDir, originDist, superTrendPreset, lookback: trendLookback };
        setTimeout(() => applyTrendScanner(), 0);
    }

    // Filter by BOTH active tickers, active quadrants, and active Top N filter
    const filteredData = useMemo(() => {
        if (!currentData || currentData.length === 0) return [];
        if (!selectedQuadrants || selectedQuadrants.length === 0) return [];
        if (selectedTickers !== null && selectedTickers.length === 0) return [];

        const quadSet = new Set(selectedQuadrants);
        const activeTickersArr = selectedTickers ?? allTickers;
        const tickerSet = new Set(activeTickersArr);

        return currentData.filter(d => {
            if (!d || !d.Ticker) return false;
            if (!quadSet.has(tickerQuadrants[d.Ticker] as QuadrantType)) return false;
            if (!tickerSet.has(d.Ticker)) return false;
            if (activeTopNSet && !activeTopNSet.has(d.Ticker)) return false;
            return true;
        });
    }, [currentData, selectedQuadrants, selectedTickers, allTickers, tickerQuadrants, activeTopNSet]);

    // Search-filtered tickers for the selector panel
    const filteredAllTickers = searchQuery.trim()
        ? allTickers.filter(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
        : allTickers;

    const toggleTicker = (ticker: string) => {
        if (scannerIsActive) resetScanner();
        const currentList = selectedTickers ?? allTickers;
        if (currentList.includes(ticker)) {
            setSelectedTickers(currentList.filter(t => t !== ticker));
        } else {
            setSelectedTickers([...currentList, ticker]);
        }
    };

    const toggleQuadrant = (quadrant: QuadrantType) => {
        if (selectedQuadrants.includes(quadrant)) {
            setSelectedQuadrants(selectedQuadrants.filter(q => q !== quadrant));
        } else {
            setSelectedQuadrants([...selectedQuadrants, quadrant]);
        }
    };

    const contentRef = useRef<HTMLDivElement>(null);

    const matchCount = trendMatchingTickers?.length ?? 0;

    return (
        <div ref={contentRef}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex flex-col">
                    <h1 className="text-xl font-bold text-white mb-1">Relative Rotation Graph (RRG)</h1>
                    <p className="text-sm text-slate-400 font-medium">
                        Cycle analysis of themes vs Broad Market Indices
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/watchlist"
                        className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                        <span>Custom Stock Watchlist</span>
                        <span>→</span>
                    </Link>
                    <CaptureScreenshot 
                        targetRef={contentRef}
                        filename="Sector_Rotation_RRG"
                        label="Capture RRG"
                    />
                </div>
            </div>

            {/* Category Filters */}
            <div className="mb-4">
                <CategoryFilter
                    showBroadMarket={showBroadMarket}
                    showSectors={showSectors}
                    showIndustries={showIndustries}
                    onToggleBroadMarket={() => setShowBroadMarket(!showBroadMarket)}
                    onToggleSectors={() => setShowSectors(!showSectors)}
                    onToggleIndustries={() => setShowIndustries(!showIndustries)}
                />
            </div>

            <div className="flex flex-col gap-6 mb-6 bg-[#111118] border border-[#1e1e2e] p-4 rounded-lg">
                <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                        <label className="block text-xs text-slate-400 mb-2 font-semibold">
                            Benchmark Index
                        </label>
                        <select
                            value={benchmarkId}
                            onChange={(e) => setBenchmarkId(e.target.value)}
                            className="w-full bg-[#1a1a2e] border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            {BROAD_MARKET.map((bm) => (
                                <option key={bm.id} value={bm.id}>
                                    {bm.title}
                                </option>
                            ))}
                        </select>
                    </div>

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
                            onChange={(e) => {
                                const newTail = parseInt(e.target.value);
                                setTailLength(newTail);
                                // Only clamp lookback if it exceeds the new tail length
                                if (trendLookback > newTail) {
                                    setTrendLookback(newTail);
                                }
                            }}
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-2"
                        />
                    </div>
                </div>

                {/* ────────── Trend Scanner ────────── */}
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
                                        const formatted = trendMatchingTickers.map(t => t.replace(/\.NS$/i, "").replace(/^NSE:/, "NSE:")).join(", ");
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
                    {/* Top N Filter Toolbar */}
                    <div className="flex items-center gap-2 mb-4 bg-[#1a1a2e]/60 border border-slate-700/60 p-2.5 rounded-lg w-fit">
                        <span className="text-xs text-slate-300 font-semibold uppercase tracking-wider">
                            Top N Per Quadrant:
                        </span>
                        <div className="flex bg-[#111118] border border-slate-700/80 rounded-lg p-0.5">
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

                    <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-wrap gap-4">
                            {QUADRANTS.map(q => {
                                const textColors: Record<QuadrantType, string> = {
                                    Leading: "text-emerald-400",
                                    Weakening: "text-yellow-400",
                                    Lagging: "text-red-400",
                                    Improving: "text-blue-400"
                                };
                                const colorClass = textColors[q];
                                return (
                                    <label key={q} className="flex items-center gap-1.5 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={selectedQuadrants.includes(q)}
                                            onChange={() => toggleQuadrant(q)}
                                            className="h-3.5 w-3.5 rounded bg-[#1a1a2e] border-slate-700 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                        />
                                        <span className={`text-[13px] font-semibold ${colorClass}`}>
                                            {q}
                                        </span>
                                        <span className="text-[11px] text-slate-500 font-medium bg-[#1a1a2e] px-1.5 py-0.5 rounded ml-1">
                                            {quadrantPcts[q as keyof typeof quadrantPcts]}%
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSelectedQuadrants([...QUADRANTS])}
                                className="text-[11px] font-medium text-blue-400 hover:text-blue-300 bg-slate-800/60 px-2.5 py-0.5 rounded border border-slate-700/50 transition-colors"
                            >
                                Select All (4 Quadrants)
                            </button>
                            <button
                                onClick={() => setSelectedQuadrants([])}
                                className="text-[11px] font-medium text-red-400 hover:text-red-300 bg-slate-800/60 px-2.5 py-0.5 rounded border border-slate-700/50 transition-colors"
                            >
                                Deselect All Quadrants
                            </button>
                        </div>
                    </div>

                    <div className="flex justify-between items-center mb-3">
                        <label className="text-xs text-slate-400 font-semibold cursor-pointer select-none"
                            onClick={() => setIsSelecting(!isSelecting)}
                        >
                            Select Themes/Indices for RRG {isSelecting ? "▼" : "▶"} ({(selectedTickers ?? allTickers).length}/{allTickers.length})
                        </label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => { resetScanner(); setSelectedTickers([...allTickers]); }}
                                className="text-[10px] uppercase font-bold text-blue-400 hover:text-blue-300 transition-colors"
                            >
                                Select All ({allTickers.length})
                            </button>
                            <span className="text-slate-600">|</span>
                            <button
                                onClick={() => { resetScanner(); setSelectedTickers([]); }}
                                className="text-[10px] uppercase font-bold text-red-400 hover:text-red-300 transition-colors"
                            >
                                Deselect All
                            </button>
                            <span className="text-slate-600">|</span>
                            <button
                                onClick={() => { resetScanner(); setSelectedTickers([...allTickers]); setSelectedQuadrants([...QUADRANTS]); }}
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
                                    const bgColors: Record<QuadrantType | "Unknown", string> = {
                                        Leading: "bg-emerald-400",
                                        Weakening: "bg-yellow-400",
                                        Lagging: "bg-red-400",
                                        Improving: "bg-blue-400",
                                        Unknown: "bg-slate-400"
                                    };
                                    const dotColor = bgColors[q as QuadrantType] || "bg-slate-400";
                                    
                                    return (
                                        <label key={ticker} className="flex items-center gap-2 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={(selectedTickers ?? allTickers).includes(ticker)}
                                                onChange={() => toggleTicker(ticker)}
                                                className="h-3.5 w-3.5 rounded bg-[#1a1a2e] border-slate-700 text-blue-500 focus:ring-blue-500/50 cursor-pointer"
                                            />
                                            <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} title={q} />
                                            <span className={`text-[13px] truncate transition-colors ${(selectedTickers ?? allTickers).includes(ticker) ? "text-slate-200" : "text-slate-500 group-hover:text-slate-400"}`}>
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

            <RRGChart
                data={filteredData}
                tailLength={tailLength}
                timeframe={timeframeLabel}
                benchmarkName={BROAD_MARKET.find((bm) => bm.id === benchmarkId)?.title || "Nifty 50"}
                originRadius={ORIGIN_RADIUS_MAP[originDist as keyof typeof ORIGIN_RADIUS_MAP] ?? null}
            />

            {/* Super Trend Candidate Leaderboard Table */}
            {scannerIsActive && matchCount > 0 && (
                <div className="mt-6 bg-[#111118] border border-violet-500/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                                🏆 Super Trend Candidates Leaderboard
                            </h3>
                            <span className="text-[10px] bg-violet-500/20 text-violet-300 font-semibold px-2 py-0.5 rounded-full border border-violet-500/30">
                                {matchCount} candidates
                            </span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="text-[11px] text-slate-400 uppercase bg-[#1a1a2e] border-b border-slate-700/60">
                                <tr>
                                    <th className="py-2.5 px-3">Ticker / Theme</th>
                                    <th className="py-2.5 px-3">Quadrant</th>
                                    <th className="py-2.5 px-3">RS-Ratio</th>
                                    <th className="py-2.5 px-3">RS-Mom</th>
                                    <th className="py-2.5 px-3">Origin Distance</th>
                                    <th className="py-2.5 px-3">Tail Accel</th>
                                    <th className="py-2.5 px-3">Super Trend Score</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {trendMatchingTickers
                                    ?.map((ticker) => {
                                        const pts = groupedByTicker[ticker] || [];
                                        const mtf = isMtfAligned(ticker);
                                        const metrics = calculateSuperTrendScore(pts, mtf);
                                        const head = pts[pts.length - 1];
                                        const quad = tickerQuadrants[ticker] || "Unknown";
                                        return { ticker, pts, mtf, metrics, head, quad };
                                    })
                                    .sort((a, b) => (b.metrics?.score ?? 0) - (a.metrics?.score ?? 0))
                                    .map(({ ticker, mtf, metrics, head, quad }) => {
                                        return (
                                            <tr key={ticker} className="hover:bg-slate-800/40 transition-colors font-mono">
                                                <td className="py-2.5 px-3 font-semibold text-blue-400 font-sans flex items-center gap-1.5">
                                                    <span>{ticker}</span>
                                                    {mtf && (
                                                        <span className="text-[9px] bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.2 rounded font-mono font-medium" title="Weekly + Daily Momentum Aligned">
                                                            ⚡ MTF
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                                        quad === "Leading" ? "bg-emerald-500/20 text-emerald-300" :
                                                        quad === "Weakening" ? "bg-yellow-500/20 text-yellow-300" :
                                                        quad === "Lagging" ? "bg-red-500/20 text-red-300" :
                                                        "bg-blue-500/20 text-blue-300"
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
                            </tbody>
                        </table>
                    </div>
                </div>
            )}


            {/* Selected Indices Listed by Quadrant Below Graph */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {QUADRANTS.map(q => {
                    if (!selectedQuadrants.includes(q)) return null;

                    // Show tickers that are both selected by user AND in this quadrant
                    const activeTickersInQuadrant = selectedTickers.filter(t => tickerQuadrants[t] === q);

                    if (activeTickersInQuadrant.length === 0) return null;

                    const qColor = QUADRANT_COLORS[q];
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
                            <div className="flex justify-between items-center mb-2 border-b border-white/5 pb-2">
                                <h3 className={`text-sm font-bold flex items-center gap-2 ${textStyles[q]}`}>
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
                                    <div className={`w-full max-w-4xl max-h-[90vh] flex flex-col border rounded-xl shadow-2xl ${tabStyles[q]}`}>
                                        <div className="flex justify-between items-center p-4 border-b border-white/10 bg-[#111118]/80">
                                            <h3 className={`text-xl font-bold flex items-center gap-3 ${textStyles[q]}`}>
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
                                                {activeTickersInQuadrant.map(ticker => {
                                                    const config = titleToConfig.get(ticker);
                                                    return (
                                                        <li key={ticker} className="text-sm font-medium border-b border-white/5 pb-2 last:border-0">
                                                            {config ? (
                                                                <Link 
                                                                    href={`/${config.category}/${config.id}`}
                                                                    className="text-slate-200 hover:text-blue-400 transition-colors"
                                                                >
                                                                    {ticker}
                                                                </Link>
                                                            ) : (
                                                                <span className="text-slate-200">{ticker}</span>
                                                            )}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                // Normal inline view
                                <ul className="flex flex-col gap-2 max-h-72 overflow-y-auto custom-scrollbar pr-2">
                                    {activeTickersInQuadrant.map(ticker => {
                                        const config = titleToConfig.get(ticker);
                                        return (
                                            <li key={ticker} className="text-[13px] leading-relaxed border-b border-white/5 pb-1 last:border-0" title={ticker}>
                                                {config ? (
                                                    <Link 
                                                        href={`/${config.category}/${config.id}`}
                                                        className="text-slate-300 hover:text-blue-400 transition-colors block w-full"
                                                    >
                                                        {ticker}
                                                    </Link>
                                                ) : (
                                                    <span className="text-slate-300">{ticker}</span>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
