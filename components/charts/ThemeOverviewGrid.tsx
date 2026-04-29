// components/charts/ThemeOverviewGrid.tsx
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { MiniIndexChart } from "@/components/charts/MiniIndexChart";
import type { ThemeBreadthSummary } from "@/lib/data";
import type { PerformanceRow } from "@/types";
import { ArrowUpDown, Calendar } from "lucide-react";

type TimeRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y" | "ALL";

const PERFORMANCE_MAPPING: Record<TimeRange, keyof PerformanceRow | null> = {
    "1W": "1 Week",
    "1M": "1 Month",
    "3M": "3 Months",
    "6M": "6 Months",
    "1Y": "1 Year",
    "3Y": "3 Years",
    "5Y": "5 Years",
    ALL: null,
};

const TRADING_DAYS: Record<TimeRange, number> = {
    "1W": 5,
    "1M": 21,
    "3M": 63,
    "6M": 126,
    "1Y": 252,
    "3Y": 756,
    "5Y": 1260,
    ALL: 99999,
};

interface ThemeOverviewGridProps {
    themes: ThemeBreadthSummary[];
    performanceData: PerformanceRow[];
}

export function ThemeOverviewGrid({ themes, performanceData }: ThemeOverviewGridProps) {
    const [sortBy, setSortBy] = useState<"alpha" | "perf">("alpha");
    const [timeRange, setTimeRange] = useState<TimeRange>("1Y");

    // Build a lookup from performance summary: title → PerformanceRow
    const perfLookup = useMemo(() => {
        const map: Record<string, PerformanceRow> = {};
        for (const row of performanceData) {
            const key = row["Theme/Index"];
            if (key) {
                map[key] = row;
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
                // Slice -(maxDays + 1) to ensure we have the base day to calculate the return from.
                const trimmed = theme.data.slice(-(maxDays + 1));
                
                // Fallback to client-side compute if backend data is missing or if ALL is selected
                let change = computeChange(trimmed);
                
                const colName = PERFORMANCE_MAPPING[timeRange];
                if (colName) {
                    const backendVal = perfLookup[theme.title]?.[colName];
                    if (backendVal != null) {
                        change = backendVal as number;
                    }
                }

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
                    <div className="flex items-center gap-0.5 bg-[#111118] border border-[#1e1e2e] rounded-lg p-0.5 overflow-x-auto max-w-[280px] sm:max-w-none no-scrollbar">
                        <Calendar className="h-3 w-3 text-slate-500 ml-1.5 mr-0.5 shrink-0" />
                        {(["1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "ALL"] as TimeRange[]).map((range) => (
                            <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors shrink-0 ${
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
