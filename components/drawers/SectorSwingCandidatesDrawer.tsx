"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import {
    X,
    ExternalLink,
    TrendingUp,
    Copy,
    Check,
    Search,
    Zap,
    Clock,
    ShieldAlert,
    Layers,
    Info,
    Sparkles,
    ArrowUpRight,
    ArrowDownRight,
} from "lucide-react";
import {
    SwingHorizon,
    MarketStatus,
    ConstituentPerformanceMap,
    ConstituentPerformance,
} from "@/types";
import { makeTradingViewUrl, getTickerLabel, makeTradingViewSymbol } from "@/lib/utils";
import { formatMetricReturn } from "@/lib/metrics";
import {
    classifySwingTiming,
    getEmpiricalStats,
    getSwingTimingStats,
    SWING_TIMING_CONFIGS,
    REGIME_CONFIGS,
} from "@/lib/swingTiming";
import { ALL_CONFIGS } from "@/lib/config";

interface SectorSwingCandidatesDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    sectorTitle: string | null;
    sectorRowData?: any | null;
    activeHorizon?: SwingHorizon;
    onHorizonChange?: (horizon: SwingHorizon) => void;
    marketStatus?: MarketStatus;
    constituentPerformanceMap?: ConstituentPerformanceMap | null;
}

export function SectorSwingCandidatesDrawer({
    isOpen,
    onClose,
    sectorTitle,
    sectorRowData,
    activeHorizon = "5D",
    onHorizonChange,
    marketStatus,
    constituentPerformanceMap,
}: SectorSwingCandidatesDrawerProps) {
    const [localHorizon, setLocalHorizon] = useState<SwingHorizon>(activeHorizon);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterTab, setFilterTab] = useState<"all" | "prime">("all");
    const [copied, setCopied] = useState(false);
    const [localPerfMap, setLocalPerfMap] = useState<ConstituentPerformanceMap | null>(null);

    // Fallback self-contained fetch if constituent performance is not passed
    useEffect(() => {
        let isMounted = true;
        if (!constituentPerformanceMap && isOpen && !localPerfMap) {
            fetch("/data/constituent_performance/constituent_performance_latest.json")
                .then((res) => (res.ok ? res.json() : null))
                .then((data: ConstituentPerformanceMap | null) => {
                    if (isMounted && data) {
                        setLocalPerfMap(data);
                    }
                })
                .catch((err) => {
                    console.warn("Drawer constituent fetch failed:", err);
                });
        }
        return () => {
            isMounted = false;
        };
    }, [constituentPerformanceMap, isOpen, localPerfMap]);

    const effectivePerfMap = constituentPerformanceMap || localPerfMap;

    // Sync external horizon changes
    useEffect(() => {
        setLocalHorizon(activeHorizon);
    }, [activeHorizon]);

    const handleHorizonChange = (h: SwingHorizon) => {
        setLocalHorizon(h);
        if (onHorizonChange) {
            onHorizonChange(h);
        }
    };

    // Close on Escape key
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape" && isOpen) {
                onClose();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    // Prevent body scroll when drawer is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    // Extract constituent tickers for the current sector
    const constituentTickers = useMemo(() => {
        if (!sectorTitle || !marketStatus) return [];
        let entry = marketStatus[sectorTitle];
        if (!entry) {
            const upper = sectorTitle.toUpperCase();
            entry = marketStatus[upper];
        }
        if (!entry && sectorTitle.startsWith("Nifty ")) {
            entry = marketStatus["NIFTY " + sectorTitle.slice(6).toUpperCase()];
        }
        if (!entry) {
            const normalized = sectorTitle.replace(/&/g, "AND").toUpperCase();
            entry = marketStatus[normalized];
        }
        if (!entry) {
            for (const [k, v] of Object.entries(marketStatus)) {
                if (
                    k.toLowerCase() === sectorTitle.toLowerCase() ||
                    k.replace(/&/g, "and").toLowerCase() === sectorTitle.replace(/&/g, "and").toLowerCase()
                ) {
                    entry = v;
                    break;
                }
            }
        }
        if (!entry) return [];
        return [...(entry.above || []), ...(entry.below || []), ...(entry.new_stock || [])];
    }, [sectorTitle, marketStatus]);

    // Build enriched stock list sorted by IBD RS Rating descending
    const stockCandidates = useMemo(() => {
        if (!constituentTickers.length || !effectivePerfMap) return [];
        const items = constituentTickers.map((ticker) => {
            const perf: ConstituentPerformance = effectivePerfMap[ticker] || effectivePerfMap[`${ticker}.NS`] || effectivePerfMap[ticker.replace(".NS", "")] || { ticker };
            const rs = typeof perf.ibd_rs_rating === "number" ? perf.ibd_rs_rating : 0;
            const dist52w = typeof perf.price_dist_52w_pct === "number" ? perf.price_dist_52w_pct : null;
            const rs5d = typeof perf["RS (5D)"] === "number" ? perf["RS (5D)"] : null;
            const rs10d = typeof perf["RS (10D)"] === "number" ? perf["RS (10D)"] : null;
            const ret1d = typeof perf["1D"] === "number" ? perf["1D"] : null;
            const ret1w = typeof perf["1W"] === "number" ? perf["1W"] : null;
            const isLead = Boolean(perf.rs_lead_breakout);
            const is52wHigh = Boolean(perf.price_52w_high);

            // Strict swing qualification: RS >= 80 AND within 15% of 52W High (or at 52W High)
            const isPrimeCandidate = rs >= 80 && ((dist52w !== null && dist52w >= -15.0) || is52wHigh);

            return {
                ticker,
                label: getTickerLabel(ticker),
                rs,
                dist52w,
                rs5d,
                rs10d,
                ret1d,
                ret1w,
                isLead,
                is52wHigh,
                isPrimeCandidate,
                perf,
            };
        });

        // Sort by IBD RS rating descending
        items.sort((a, b) => b.rs - a.rs);
        return items;
    }, [constituentTickers, effectivePerfMap]);

    // Prime candidates count
    const primeCount = useMemo(() => {
        return stockCandidates.filter((s) => s.isPrimeCandidate).length;
    }, [stockCandidates]);

    // Filtered stocks based on tab and search
    const filteredStocks = useMemo(() => {
        let list = stockCandidates;
        if (filterTab === "prime") {
            list = list.filter((s) => s.isPrimeCandidate);
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter((s) => s.label.toLowerCase().includes(q) || s.ticker.toLowerCase().includes(q));
        }
        return list;
    }, [stockCandidates, filterTab, searchQuery]);

    // Sector breadth metrics from sectorRowData
    const b1w = Number(sectorRowData?.breadth_1W_pct ?? 0);
    const b1d = Number(sectorRowData?.breadth_1D_pct ?? 0);
    const b1m = Number(sectorRowData?.breadth_1M_pct ?? 0);
    const b200 = Number(sectorRowData?.breadth_pctAbove200Sma ?? 0);
    const regimeCode = String(sectorRowData?.regime || "neutral");

    // Sector swing timing badge & empirical stats
    const timingConfig = useMemo(() => {
        return classifySwingTiming(b1w, b1d, b200, b1m);
    }, [b1w, b1d, b200, b1m]);

    const regConfig = REGIME_CONFIGS[regimeCode] || REGIME_CONFIGS.neutral;

    // Synchronize empirical stats directly with regime and horizon (100% consistent with table)
    const empiricalStats = useMemo(() => {
        return getEmpiricalStats(regimeCode, localHorizon);
    }, [regimeCode, localHorizon]);

    const timingStats = useMemo(() => {
        return getSwingTimingStats(timingConfig.code, localHorizon);
    }, [timingConfig.code, localHorizon]);

    // Category config
    const categoryConfig = useMemo(() => {
        if (!sectorTitle) return null;
        return ALL_CONFIGS.find((c) => c.title.toLowerCase() === sectorTitle.toLowerCase());
    }, [sectorTitle]);

    // Copy tickers handler (formatted for TradingView Watchlist import)
    const handleCopyTickers = useCallback(() => {
        const tickersToCopy = filteredStocks.map((s) => makeTradingViewSymbol(s.ticker));
        if (!tickersToCopy.length) return;
        navigator.clipboard.writeText(tickersToCopy.join(", "));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [filteredStocks]);

    if (!isOpen || !sectorTitle) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Slide-over panel */}
            <div className="relative w-full max-w-2xl bg-[#0d0d14] border-l border-slate-800 shadow-2xl flex flex-col h-full z-50 text-slate-200 overflow-hidden animate-in slide-in-from-right duration-300 ease-out font-sans">
                {/* Header */}
                <div className="px-5 py-4 border-b border-slate-800 bg-[#111118]/90 backdrop-blur flex items-start justify-between gap-4 shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60">
                                {categoryConfig?.category === "sectors"
                                    ? "Sector"
                                    : categoryConfig?.category === "industries"
                                    ? "Industry Theme"
                                    : "Broad Market"}
                            </span>
                            <span
                                className={`text-xs font-semibold px-2.5 py-0.5 rounded border flex items-center gap-1 ${regConfig.bgClass} ${regConfig.textClass} ${regConfig.borderClass}`}
                                title={regConfig.guidance}
                            >
                                {regConfig.badge}
                            </span>
                            <span
                                className={`text-xs font-semibold px-2.5 py-0.5 rounded border flex items-center gap-1 ${timingConfig.bgClass} ${timingConfig.textClass} ${timingConfig.borderClass}`}
                                title={`${timingConfig.action} | 12Y Benchmark: ${timingStats.winRate.toFixed(1)}% Win Rate, ${timingStats.medReturn >= 0 ? "+" : ""}${timingStats.medReturn.toFixed(2)}% Med Return`}
                            >
                                {timingConfig.badge}
                            </span>
                        </div>
                        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                            {sectorTitle}
                            <span className="text-xs font-medium text-slate-400 font-mono">
                                ({constituentTickers.length} stocks)
                            </span>
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>1W Breadth: <strong className="text-emerald-400">{b1w.toFixed(1)}%</strong></span>
                            <span>•</span>
                            <span>1D Gainers: <strong className={b1d >= 50 ? "text-emerald-400" : "text-amber-400"}>{b1d.toFixed(1)}%</strong></span>
                            <span>•</span>
                            <span>&gt;200 SMA: <strong className={b200 >= 50 ? "text-blue-400" : "text-red-400"}>{b200.toFixed(1)}%</strong></span>
                        </p>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title="Close (Esc)"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Horizon Switcher & Empirical Next-Day Risk Box */}
                <div className="p-4 bg-slate-950/70 border-b border-slate-800/80 shrink-0 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5">
                            <Clock size={13} className="text-amber-400" />
                            <span className="text-xs font-medium text-slate-300">Swing Horizon:</span>
                            <div className="inline-flex rounded-lg bg-slate-900 border border-slate-700/80 p-0.5 ml-1">
                                {(["2D", "5D", "10D"] as SwingHorizon[]).map((h) => (
                                    <button
                                        key={h}
                                        onClick={() => handleHorizonChange(h)}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                                            localHorizon === h
                                                ? "bg-amber-500 text-slate-950 shadow"
                                                : "text-slate-400 hover:text-slate-200"
                                        }`}
                                    >
                                        {h === "2D" ? "2 Days" : h === "5D" ? "5 Days (1W)" : "10 Days (2W)"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 px-2 py-1 rounded">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>EOD Data: Execute trades on Day <strong className="text-slate-200">T+1</strong></span>
                        </div>
                    </div>

                    {/* Empirical Next-Day Expectation Card */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium px-0.5">
                        <span>Empirical Benchmark (<strong className="text-slate-200">{regConfig.name || "Regime"}</strong> • {localHorizon} Hold):</span>
                        <span className="text-[10px] text-slate-500 font-mono">12Y N={empiricalStats.sampleSize.toLocaleString()}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                            <span className="text-[10px] text-slate-400 uppercase font-medium block">
                                {localHorizon} Win Rate
                            </span>
                            <span
                                className={`text-base font-bold font-mono ${
                                    empiricalStats.winRate >= 56
                                        ? "text-emerald-400"
                                        : empiricalStats.winRate >= 50
                                        ? "text-cyan-400"
                                        : "text-red-400"
                                }`}
                            >
                                {empiricalStats.winRate.toFixed(1)}%
                            </span>
                        </div>

                        <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                            <span className="text-[10px] text-slate-400 uppercase font-medium block">
                                Expected Return
                            </span>
                            <span
                                className={`text-base font-bold font-mono ${
                                    empiricalStats.medReturn >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}
                            >
                                {empiricalStats.medReturn >= 0 ? "+" : ""}
                                {empiricalStats.medReturn.toFixed(2)}%
                            </span>
                        </div>

                        <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                            <span className="text-[10px] text-slate-400 uppercase font-medium block">
                                Profit Factor
                            </span>
                            <span className="text-base font-bold font-mono text-amber-300">
                                {empiricalStats.profitFactor.toFixed(2)}
                            </span>
                        </div>

                        <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800" title="Historical Median Maximum Adverse Excursion vs Recommended Stop">
                            <span className="text-[10px] text-slate-400 uppercase font-medium block">
                                Stop & Noise
                            </span>
                            <span className="text-xs font-bold font-mono text-slate-200 block mt-0.5">
                                Stop: {empiricalStats.suggestedStop.toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                                (MAE {empiricalStats.medMae.toFixed(1)}%)
                            </span>
                        </div>
                    </div>
                </div>

                {/* Filters & Actions Bar */}
                <div className="p-3 border-b border-slate-800/80 bg-[#111118]/60 flex items-center justify-between gap-3 shrink-0 flex-wrap">
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setFilterTab("all")}
                            className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                                filterTab === "all"
                                    ? "bg-blue-600 text-white font-semibold shadow-sm"
                                    : "text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800"
                            }`}
                        >
                            All Constituents ({stockCandidates.length})
                        </button>
                        <button
                            onClick={() => setFilterTab("prime")}
                            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-all ${
                                filterTab === "prime"
                                    ? "bg-emerald-600 text-white font-semibold shadow-sm"
                                    : "text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 border border-emerald-800/50"
                            }`}
                        >
                            <Sparkles size={12} />
                            Top Swing Picks ({primeCount})
                        </button>
                    </div>

                    <div className="flex items-center gap-2 flex-1 max-w-xs justify-end">
                        <div className="relative w-full max-w-[180px]">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
                            <input
                                type="text"
                                placeholder="Search ticker..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700/70 rounded py-1 pl-7 pr-6 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                >
                                    <X size={10} />
                                </button>
                            )}
                        </div>

                        <button
                            onClick={handleCopyTickers}
                            disabled={!filteredStocks.length}
                            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border transition-all ${
                                copied
                                    ? "bg-emerald-600/30 text-emerald-300 border-emerald-500/50"
                                    : "bg-slate-800/70 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
                            }`}
                            title="Copy filtered tickers to clipboard for TradingView watchlist import"
                        >
                            {copied ? <Check size={12} /> : <Copy size={12} />}
                            <span>{copied ? "Copied" : "Copy"}</span>
                        </button>
                    </div>
                </div>

                {/* Candidate Stocks List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                    {!stockCandidates.length ? (
                        <div className="py-16 text-center text-slate-500 space-y-2">
                            <Info size={28} className="mx-auto text-slate-600 animate-pulse" />
                            <p className="text-sm font-medium">Loading constituent stock performance...</p>
                            <p className="text-xs text-slate-600">Fetching constituent_performance_latest.json</p>
                        </div>
                    ) : !filteredStocks.length ? (
                        <div className="py-16 text-center text-slate-500 space-y-3 bg-slate-900/30 rounded-xl border border-slate-800/60 p-6">
                            <Info size={24} className="mx-auto text-amber-500/80" />
                            <p className="text-sm font-medium text-slate-300">
                                {filterTab === "prime"
                                    ? "No constituents currently meet strict swing criteria"
                                    : "No stocks match search query"}
                            </p>
                            <p className="text-xs text-slate-500 max-w-md mx-auto">
                                Strict criteria requires <code className="text-emerald-400 font-mono">RS ≥ 80</code> and price within <code className="text-cyan-400 font-mono">15% of 52-week High</code>.
                            </p>
                            {filterTab === "prime" && (
                                <button
                                    onClick={() => setFilterTab("all")}
                                    className="px-3 py-1.5 text-xs rounded-md bg-blue-600/20 text-blue-300 border border-blue-500/40 hover:bg-blue-600/30 transition-colors inline-block mt-2 font-medium"
                                >
                                    View All Constituents Ranked by RS ({stockCandidates.length})
                                </button>
                            )}
                        </div>
                    ) : (
                        filteredStocks.map((stock, idx) => {
                            const tvUrl = makeTradingViewUrl(stock.ticker);
                            let rsBadge = "bg-slate-800 text-slate-400 border-slate-700";
                            if (stock.rs >= 90) rsBadge = "bg-emerald-950/90 text-emerald-300 border-emerald-600/80 shadow-sm shadow-emerald-500/20";
                            else if (stock.rs >= 80) rsBadge = "bg-cyan-950/90 text-cyan-300 border-cyan-600/80 shadow-sm shadow-cyan-500/20";
                            else if (stock.rs < 50) rsBadge = "bg-red-950/40 text-red-400 border-red-900/50";

                            return (
                                <div
                                    key={stock.ticker}
                                    className={`p-3 rounded-lg border transition-all duration-200 ${
                                        stock.isPrimeCandidate
                                            ? "bg-[#13131f] border-emerald-500/30 hover:border-emerald-500/60 shadow-sm shadow-emerald-950/40"
                                            : "bg-[#111118] border-slate-800/80 hover:border-slate-700"
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono text-slate-500 font-semibold">
                                                #{idx + 1}
                                            </span>
                                            <a
                                                href={tvUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-base font-bold text-white hover:text-blue-400 transition-colors flex items-baseline gap-1.5 group font-sans"
                                                title={`Open ${stock.label} (${stock.ticker}) in TradingView`}
                                            >
                                                <span className="font-bold text-white group-hover:text-blue-400">{stock.label}</span>
                                                <span className="text-xs font-mono text-slate-500 font-normal">({stock.ticker})</span>
                                                <ExternalLink
                                                    size={12}
                                                    className="text-slate-500 group-hover:text-blue-400 transition-colors inline-block"
                                                />
                                            </a>

                                            {stock.isPrimeCandidate && (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-500/60 flex items-center gap-1">
                                                    <Sparkles size={10} />
                                                    Top Swing Pick
                                                </span>
                                            )}

                                            {stock.isLead && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-600/80">
                                                    RS Breakout
                                                </span>
                                            )}

                                            {stock.is52wHigh && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-600/80">
                                                    52W High
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono border ${rsBadge}`}
                                                title="IBD Relative Strength Rating (1-99)"
                                            >
                                                RS {stock.rs || "—"}
                                            </span>

                                            <a
                                                href={tvUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="px-2 py-1 rounded text-xs font-medium bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:text-blue-300 transition-all flex items-center gap-1"
                                            >
                                                Chart
                                                <ArrowUpRight size={11} />
                                            </a>
                                        </div>
                                    </div>

                                    {/* Metrics Grid */}
                                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs pt-2 border-t border-slate-800/60">
                                        <div>
                                            <span className="text-[10px] text-slate-500 block">From 52W High</span>
                                            <span
                                                className={`font-mono font-semibold ${
                                                    stock.dist52w === null
                                                        ? "text-slate-500"
                                                        : stock.dist52w >= -5
                                                        ? "text-emerald-400"
                                                        : stock.dist52w >= -15
                                                        ? "text-cyan-400"
                                                        : "text-slate-400"
                                                }`}
                                            >
                                                {stock.dist52w !== null ? `${stock.dist52w.toFixed(1)}%` : "—"}
                                            </span>
                                        </div>

                                        <div>
                                            <span className="text-[10px] text-slate-500 block">1D Return</span>
                                            <span
                                                className={`font-mono font-semibold flex items-center gap-0.5 ${
                                                    stock.ret1d === null
                                                        ? "text-slate-500"
                                                        : stock.ret1d > 0
                                                        ? "text-emerald-400"
                                                        : stock.ret1d < 0
                                                        ? "text-red-400"
                                                        : "text-slate-300"
                                                }`}
                                            >
                                                {stock.ret1d !== null ? (
                                                    <>
                                                        {stock.ret1d > 0 ? (
                                                            <ArrowUpRight size={11} />
                                                        ) : stock.ret1d < 0 ? (
                                                            <ArrowDownRight size={11} />
                                                        ) : null}
                                                        {formatMetricReturn(stock.ret1d)}
                                                    </>
                                                ) : (
                                                    "—"
                                                )}
                                            </span>
                                        </div>

                                        <div>
                                            <span className="text-[10px] text-slate-500 block">1W Return</span>
                                            <span
                                                className={`font-mono font-semibold ${
                                                    stock.ret1w === null
                                                        ? "text-slate-500"
                                                        : stock.ret1w > 0
                                                        ? "text-emerald-400"
                                                        : stock.ret1w < 0
                                                        ? "text-red-400"
                                                        : "text-slate-300"
                                                }`}
                                            >
                                                {stock.ret1w !== null ? formatMetricReturn(stock.ret1w) : "—"}
                                            </span>
                                        </div>

                                        <div>
                                            <span className="text-[10px] text-slate-500 block">RS (5D)</span>
                                            <span
                                                className={`font-mono font-semibold ${
                                                    stock.rs5d === null
                                                        ? "text-slate-500"
                                                        : stock.rs5d > 0
                                                        ? "text-emerald-400"
                                                        : "text-red-400"
                                                }`}
                                            >
                                                {stock.rs5d !== null ? `${stock.rs5d > 0 ? "+" : ""}${stock.rs5d.toFixed(1)}%` : "—"}
                                            </span>
                                        </div>

                                        <div>
                                            <span className="text-[10px] text-slate-500 block">RS (10D)</span>
                                            <span
                                                className={`font-mono font-semibold ${
                                                    stock.rs10d === null
                                                        ? "text-slate-500"
                                                        : stock.rs10d > 0
                                                        ? "text-emerald-400"
                                                        : "text-red-400"
                                                }`}
                                            >
                                                {stock.rs10d !== null ? `${stock.rs10d > 0 ? "+" : ""}${stock.rs10d.toFixed(1)}%` : "—"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Execution Note */}
                <div className="p-3 bg-[#111118] border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between gap-3 shrink-0">
                    <span className="text-[11px] text-slate-500">
                        Top-down execution: Enter leader stocks near support on Day T+1.
                    </span>
                    <button
                        onClick={onClose}
                        className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors font-medium text-xs"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
