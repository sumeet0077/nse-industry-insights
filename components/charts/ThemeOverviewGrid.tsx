// components/charts/ThemeOverviewGrid.tsx
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { MiniIndexChart } from "@/components/charts/MiniIndexChart";
import type { ThemeBreadthSummary } from "@/lib/data";
import type { PerformanceRow } from "@/types";
import { ArrowUpDown, Calendar, Search, X, Check } from "lucide-react";

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

const CALENDAR_DAYS: Record<TimeRange, number> = {
    "1W": 7,
    "1M": 30,
    "3M": 90,
    "6M": 180,
    "1Y": 365,
    "3Y": 365 * 3,
    "5Y": 365 * 5,
    ALL: 99999,
};

interface ThemeOverviewGridProps {
    themes: ThemeBreadthSummary[];
    performanceData: PerformanceRow[];
}

export function ThemeOverviewGrid({ themes, performanceData }: ThemeOverviewGridProps) {
    const [sortBy, setSortBy] = useState<"alpha" | "perf">("alpha");
    const [timeRange, setTimeRange] = useState<TimeRange>("1Y");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set());
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

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
        const maxDays = CALENDAR_DAYS[timeRange];

        let filtered = themes;

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter((t) => t.title.toLowerCase().includes(q));
        }

        if (selectedThemes.size > 0) {
            filtered = filtered.filter((t) => selectedThemes.has(t.id));
        }

        return filtered
            .map((theme) => {
                let trimmed = theme.data;
                if (timeRange !== "ALL" && theme.data.length > 0) {
                    const latestDateStr = theme.data[theme.data.length - 1].Date;
                    const latestDate = new Date(latestDateStr);
                    latestDate.setDate(latestDate.getDate() - maxDays);
                    const targetDateStr = latestDate.toISOString().split("T")[0];
                    
                    const startIndex = theme.data.findIndex((d) => d.Date >= targetDateStr);
                    if (startIndex !== -1) {
                        trimmed = theme.data.slice(startIndex);
                    }
                }
                
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
    }, [themes, timeRange, sortBy, searchQuery, selectedThemes, perfLookup]);

    const totalThemes = processedThemes.length;
    const gainers = processedThemes.filter((t) => t.change >= 0).length;
    const losers = totalThemes - gainers;

    return (
        <div>
            {/* Search and Filter Bar */}
            <div className="relative mb-6 z-10">
                <div className="flex flex-col gap-2">
                    <div className="relative flex items-center">
                        <Search className="absolute left-3 h-4 w-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search themes or select from dropdown..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setIsDropdownOpen(true);
                            }}
                            onFocus={() => setIsDropdownOpen(true)}
                            className="w-full bg-[#111118] border border-[#1e1e2e] rounded-lg pl-9 pr-10 py-2.5 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 p-1 rounded-md hover:bg-[#1e1e2e] text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                    
                    {/* Selected Pills */}
                    {selectedThemes.size > 0 && (
                        <div className="flex flex-wrap gap-2 mt-1">
                            {Array.from(selectedThemes).map(id => {
                                const theme = themes.find(t => t.id === id);
                                if (!theme) return null;
                                return (
                                    <div key={id} className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-xs font-medium">
                                        {theme.title}
                                        <button 
                                            onClick={() => {
                                                const newSet = new Set(selectedThemes);
                                                newSet.delete(id);
                                                setSelectedThemes(newSet);
                                            }}
                                            className="hover:text-white"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                );
                            })}
                            <button 
                                onClick={() => setSelectedThemes(new Set())}
                                className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-300 underline"
                            >
                                Clear All
                            </button>
                        </div>
                    )}
                </div>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                    <>
                        <div className="fixed inset-0" onClick={() => setIsDropdownOpen(false)} />
                        <div className="absolute top-full left-0 mt-2 w-full max-h-[300px] overflow-y-auto bg-[#111118] border border-[#1e1e2e] rounded-lg shadow-xl py-2 scrollbar-thin scrollbar-thumb-[#2a2a3e] scrollbar-track-transparent">
                            {themes
                                .filter(t => t.title.toLowerCase().includes(searchQuery.toLowerCase()))
                                .map(theme => {
                                    const isSelected = selectedThemes.has(theme.id);
                                    return (
                                        <button
                                            key={theme.id}
                                            onClick={() => {
                                                const newSet = new Set(selectedThemes);
                                                if (isSelected) newSet.delete(theme.id);
                                                else newSet.add(theme.id);
                                                setSelectedThemes(newSet);
                                            }}
                                            className="w-full flex items-center justify-between px-4 py-2 hover:bg-[#1e1e2e] transition-colors text-left"
                                        >
                                            <span className={`text-sm ${isSelected ? 'text-blue-400 font-medium' : 'text-slate-300'}`}>
                                                {theme.title}
                                            </span>
                                            {isSelected && <Check className="h-4 w-4 text-blue-400" />}
                                        </button>
                                    );
                                })
                            }
                        </div>
                    </>
                )}
            </div>

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
