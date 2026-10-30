"use client";

import { useMemo } from "react";
import type { TimeframeGainersStat } from "@/types";
import { GAINER_TIMEFRAMES, GainerTimeframe } from "@/lib/metrics";
import { Activity, TrendingUp, X } from "lucide-react";

export interface ActiveBreadthFilter {
    type: "200sma" | "timeframe";
    timeframe?: GainerTimeframe;
    direction?: "gainers" | "decliners" | "above" | "below";
}

interface TimeframeGainersBarProps {
    totalStocks: number;
    above200Sma: number;
    below200Sma: number;
    pctAbove200Sma: number;
    timeframes: Record<string, TimeframeGainersStat>;
    activeFilter: ActiveBreadthFilter | null;
    onSelectFilter: (filter: ActiveBreadthFilter | null) => void;
}

const TIMEFRAME_LABELS: Record<GainerTimeframe, string> = {
    "1D": "1 Day",
    "1W": "1 Week",
    "1M": "1 Month",
    "3M": "3 Months",
    "6M": "6 Months",
    "YTD": "YTD",
    "1Y": "1 Year",
};

export function TimeframeGainersBar({
    totalStocks,
    above200Sma,
    below200Sma,
    pctAbove200Sma,
    timeframes,
    activeFilter,
    onSelectFilter,
}: TimeframeGainersBarProps) {
    const is200SmaActive = activeFilter?.type === "200sma";

    const getFilterLabel = useMemo(() => {
        if (!activeFilter) return "";
        if (activeFilter.type === "200sma") {
            return `Stocks > 200 SMA (${above200Sma} stocks)`;
        }
        if (activeFilter.type === "timeframe" && activeFilter.timeframe) {
            const stat = timeframes[activeFilter.timeframe];
            const label = TIMEFRAME_LABELS[activeFilter.timeframe];
            return `${label} Gainers (${stat?.gained ?? 0} stocks)`;
        }
        return "";
    }, [activeFilter, above200Sma, timeframes]);

    return (
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-3 mb-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-2">
                    <Activity size={15} className="text-blue-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Constituent Participation & Breadth
                    </h3>
                    <span className="text-[11px] text-slate-500">
                        (Click card to filter constituent list)
                    </span>
                </div>

                {activeFilter && (
                    <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 px-2.5 py-1 rounded-md text-xs text-blue-300">
                        <span className="font-medium">Filter: <strong>{getFilterLabel}</strong></span>
                        <button
                            onClick={() => onSelectFilter(null)}
                            className="p-0.5 hover:bg-blue-500/20 rounded text-blue-400 hover:text-white transition-colors"
                            title="Clear filter and show all"
                        >
                            <X size={13} />
                        </button>
                    </div>
                )}
            </div>

            {/* Horizontal Grid of 8 Cards: >200 SMA + 7 Timeframes (1D to 1Y) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                {/* 1. > 200 SMA Card */}
                <button
                    type="button"
                    onClick={() => {
                        if (is200SmaActive) onSelectFilter(null);
                        else onSelectFilter({ type: "200sma", direction: "above" });
                    }}
                    className={`flex flex-col p-2 rounded-md border text-left transition-all cursor-pointer ${
                        is200SmaActive
                            ? "bg-blue-950/40 border-blue-500 ring-1 ring-blue-500/50"
                            : "bg-[#0d0d14] border-slate-800 hover:border-slate-700 hover:bg-slate-900/50"
                    }`}
                >
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">
                        &gt; 200 SMA
                    </span>
                    <div className="flex items-baseline justify-between mt-1 mb-1.5">
                        <span className={`text-base font-bold font-mono ${
                            pctAbove200Sma >= 50 ? "text-emerald-400" : "text-red-400"
                        }`}>
                            {pctAbove200Sma.toFixed(1)}%
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                            {above200Sma}/{totalStocks}
                        </span>
                    </div>

                    {/* Mini Participation Bar */}
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                        <div
                            className="h-full bg-emerald-500 transition-all duration-300"
                            style={{ width: `${totalStocks > 0 ? (above200Sma / totalStocks) * 100 : 0}%` }}
                            title={`Above 200 SMA: ${above200Sma}`}
                        />
                        <div
                            className="h-full bg-red-500 transition-all duration-300"
                            style={{ width: `${totalStocks > 0 ? (below200Sma / totalStocks) * 100 : 0}%` }}
                            title={`Below 200 SMA: ${below200Sma}`}
                        />
                    </div>
                    <span className="text-[9px] text-slate-500 mt-1 truncate">
                        {above200Sma} Above · {below200Sma} Below
                    </span>
                </button>

                {/* 2 to 8. Timeframe Gainers Cards */}
                {GAINER_TIMEFRAMES.map((tf) => {
                    const stat = timeframes[tf] || {
                        gained: 0,
                        declined: 0,
                        flat: 0,
                        total: 0,
                        unlisted: 0,
                        pct: 0,
                    };
                    const isTfActive = activeFilter?.type === "timeframe" && activeFilter.timeframe === tf;
                    const label = TIMEFRAME_LABELS[tf];

                    const gainerPct = stat.total > 0 ? (stat.gained / stat.total) * 100 : 0;
                    const declinerPct = stat.total > 0 ? (stat.declined / stat.total) * 100 : 0;

                    return (
                        <button
                            key={tf}
                            type="button"
                            onClick={() => {
                                if (isTfActive) onSelectFilter(null);
                                else onSelectFilter({ type: "timeframe", timeframe: tf, direction: "gainers" });
                            }}
                            className={`flex flex-col p-2 rounded-md border text-left transition-all cursor-pointer ${
                                isTfActive
                                    ? "bg-blue-950/40 border-blue-500 ring-1 ring-blue-500/50"
                                    : "bg-[#0d0d14] border-slate-800 hover:border-slate-700 hover:bg-slate-900/50"
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">
                                    {label}
                                </span>
                                {stat.unlisted > 0 && (
                                    <span 
                                        className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-300 font-mono"
                                        title={`${stat.unlisted} IPO stock(s) unseasoned for ${label} (excluded from denominator)`}
                                    >
                                        +{stat.unlisted} IPO
                                    </span>
                                )}
                            </div>

                            <div className="flex items-baseline justify-between mt-1 mb-1.5">
                                <span className={`text-base font-bold font-mono ${
                                    stat.pct >= 50 ? "text-emerald-400" : "text-red-400"
                                }`}>
                                    {stat.pct.toFixed(1)}%
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                    {stat.gained}/{stat.total}
                                </span>
                            </div>

                            {/* Mini Gainers vs Decliners Bar */}
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
                                <div
                                    className="h-full bg-emerald-500 transition-all duration-300"
                                    style={{ width: `${gainerPct}%` }}
                                    title={`Gainers: ${stat.gained} (${gainerPct.toFixed(1)}%)`}
                                />
                                <div
                                    className="h-full bg-red-500 transition-all duration-300"
                                    style={{ width: `${declinerPct}%` }}
                                    title={`Decliners: ${stat.declined} (${declinerPct.toFixed(1)}%)`}
                                />
                            </div>

                            <span className="text-[9px] text-slate-500 mt-1 truncate">
                                {stat.gained} Up · {stat.declined} Down
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
