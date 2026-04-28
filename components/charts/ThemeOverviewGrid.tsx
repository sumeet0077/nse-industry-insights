// components/charts/ThemeOverviewGrid.tsx
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { MiniIndexChart } from "@/components/charts/MiniIndexChart";
import type { ThemeBreadthSummary } from "@/lib/data";
import type { PerformanceRow } from "@/types";
import { ArrowUpDown, Calendar } from "lucide-react";

type TimeRange = "3M" | "6M" | "1Y" | "ALL";

const TRADING_DAYS: Record<TimeRange, number> = {
    "3M": 63,
    "6M": 126,
    "1Y": 252,
    ALL: 99999,
};

interface ThemeOverviewGridProps {
    themes: ThemeBreadthSummary[];
    performanceData: PerformanceRow[];
}

export function ThemeOverviewGrid({ themes, performanceData }: ThemeOverviewGridProps) {
    const [sortBy, setSortBy] = useState<"alpha" | "perf">("alpha");
    const [timeRange, setTimeRange] = useState<TimeRange>("1Y");

    // Build a lookup from performance summary: title → 1 Month return
    const perfLookup = useMemo(() => {
        const map: Record<string, number> = {};
        for (const row of performanceData) {
            const key = row["Theme/Index"];
            const val = row["1 Month"];
            if (key && val != null) {
                map[key] = val;
            }
        }
        return map;
    }, [performanceData]);

    // Compute change % for each theme based on the visible time range
    const computeChange = (data: { Date: string; Index_Close: number }[]): number => {
        if (data.length < 2) return 0;
        const first = data[0].Index_Close;
        const last = data[data.length - 1].Index_Close;
        if (first === 0) return 0;
        return ((last - first) / first) * 100;
    };

    // Process themes: trim to time range, compute change, sort
    const processedThemes = useMemo(() => {
        const maxDays = TRADING_DAYS[timeRange];

        return themes
            .map((theme) => {
                const trimmed = theme.data.slice(-maxDays);
                const change = computeChange(trimmed);
                return { ...theme, trimmedData: trimmed, change };
            })
            .sort((a, b) => {
                if (sortBy === "perf") {
                    return b.change - a.change; // Best performers first
                }
                return a.title.localeCompare(b.title);
            });
    }, [themes, timeRange, sortBy]);

    const totalThemes = processedThemes.length;
    const gainers = processedThemes.filter((t) => t.change >= 0).length;
    const losers = totalThemes - gainers;

    return (
        <div>
            {/* Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                {/* Summary badges */}
                <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">
                        {totalThemes} themes
                    </span>
                    <span className="text-emerald-500 font-medium">
                        ▲ {gainers} up
                    </span>
                    <span className="text-red-500 font-medium">
                        ▼ {losers} down
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Time Range Selector */}
                    <div className="flex items-center gap-0.5 bg-[#111118] border border-[#1e1e2e] rounded-lg p-0.5">
                        <Calendar className="h-3 w-3 text-slate-500 ml-1.5 mr-0.5" />
                        {(["3M", "6M", "1Y", "ALL"] as TimeRange[]).map((range) => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${
                                    timeRange === range
                                        ? "bg-blue-500/20 text-blue-400"
                                        : "text-slate-500 hover:text-slate-300"
                                }`}
                            >
                                {range}
                            </button>
                        ))}
                    </div>

                    {/* Sort Toggle */}
                    <button
                        onClick={() =>
                            setSortBy((prev) => (prev === "alpha" ? "perf" : "alpha"))
                        }
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold bg-[#111118] border border-[#1e1e2e] rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        <ArrowUpDown className="h-3 w-3" />
                        {sortBy === "alpha" ? "A–Z" : "Performance"}
                    </button>
                </div>
            </div>

            {/* Chart Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {processedThemes.map((theme) => (
                    <Link
                        key={theme.id}
                        href={`/industries/${theme.id}`}
                        className="block transition-transform hover:scale-[1.02]"
                    >
                        <MiniIndexChart
                            title={theme.title}
                            data={theme.trimmedData}
                            changePercent={theme.change}
                        />
                    </Link>
                ))}
            </div>
        </div>
    );
}
