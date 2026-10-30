"use client";

import { AgGridReact } from "ag-grid-react";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { ColDef, ValueFormatterParams, CellClassParams, IRowNode, SelectionChangedEvent } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { PerformanceRow, MarketStatus, AllThemesBreadthMap, ThemeBreadthSummaryMetrics } from "@/types";
import { ALL_CONFIGS, METRIC_CONFIG } from "@/lib/config";
import { formatMetricReturn } from "@/lib/metrics";
import { makeTradingViewUrl, resolveDataKey } from "@/lib/utils";
import { CategoryFilter, getCategoryForTitle } from "@/components/common/CategoryFilter";
import { Columns, ChevronDown, AlertCircle, Search, X, CheckSquare, ExternalLink, BarChart2, TrendingUp, Layers } from "lucide-react";
import { CaptureScreenshot } from "@/components/common/CaptureScreenshot";
import { CopyWatchlistButton } from "@/components/common/CopyWatchlistButton";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { GAINER_TIMEFRAMES, GainerTimeframe } from "@/lib/metrics";

ModuleRegistry.registerModules([AllCommunityModule]);

export type HeatmapViewMode = "returns" | "breadth" | "combined";

interface PerformanceHeatmapProps {
    data: PerformanceRow[];
    globalLatestDate?: string | null;
    marketStatus?: MarketStatus;
    breadthMetrics?: AllThemesBreadthMap;
}

const myTheme = themeQuartz.withParams({
    backgroundColor: "#111118",
    foregroundColor: "#e2e8f0",
    headerBackgroundColor: "#0d0d14",
    headerTextColor: "#94a3b8",
    borderColor: "#1e1e2e",
    rowHoverColor: "#1a1a2e",
    fontFamily: "Inter, sans-serif",
    fontSize: 13,
    headerFontSize: 12,
    oddRowBackgroundColor: "#0f0f17",
});

function getHeatmapStyle(params: CellClassParams): { [key: string]: string } | undefined {
    if (!params.value && params.value !== 0) return undefined;
    const v = Number(params.value);
    if (isNaN(v)) return undefined;

    const intensity = Math.min(Math.abs(v) / 30, 1);
    if (v > 0) {
        return {
            backgroundColor: `rgba(34, 197, 94, ${0.1 + intensity * 0.35})`,
            color: "#4ade80",
            fontWeight: "500",
        };
    } else if (v < 0) {
        return {
            backgroundColor: `rgba(239, 68, 68, ${0.1 + intensity * 0.35})`,
            color: "#f87171",
            fontWeight: "500",
        };
    }
    return { color: "#94a3b8" };
}

function getBreadthHeatmapStyle(params: CellClassParams): { [key: string]: string } | undefined {
    if (params.value === null || params.value === undefined || params.value === "") return undefined;
    const v = Number(params.value);
    if (isNaN(v)) return undefined;

    if (v >= 50) {
        const intensity = (v - 50) / 50; // 0 to 1
        return {
            backgroundColor: `rgba(16, 185, 129, ${0.05 + intensity * 0.18})`,
            color: v >= 70 ? "#6ee7b7" : "#34d399",
            fontWeight: "600",
        };
    } else {
        const intensity = (50 - v) / 50; // 0 to 1
        return {
            backgroundColor: `rgba(239, 68, 68, ${0.05 + intensity * 0.18})`,
            color: v <= 30 ? "#fca5a5" : "#f87171",
            fontWeight: "600",
        };
    }
}

function returnFormatter(params: ValueFormatterParams): string {
    return formatMetricReturn(params.value == null || params.value === "" ? undefined : Number(params.value));
}

const returnColumns = METRIC_CONFIG.map(m => m.label);

const TIMEFRAME_TO_METRIC_COL: Record<GainerTimeframe, string> = {
    "1D": "1 Day",
    "1W": "1 Week",
    "1M": "1 Month",
    "3M": "3 Months",
    "6M": "6 Months",
    "YTD": "YTD",
    "1Y": "1 Year",
};

function lookupThemeBreadth(title: string, metrics?: AllThemesBreadthMap): ThemeBreadthSummaryMetrics | null {
    if (!metrics) return null;
    if (metrics[title]) return metrics[title];
    const upper = title.toUpperCase();
    if (metrics[upper]) return metrics[upper];
    if (title.startsWith("Nifty ")) {
        const niftyUpper = "NIFTY " + title.slice(6).toUpperCase();
        if (metrics[niftyUpper]) return metrics[niftyUpper];
    }
    const resolvedTitle = resolveDataKey(title);
    for (const key of Object.keys(metrics)) {
        if (key.toLowerCase() === resolvedTitle) return metrics[key];
    }
    return null;
}

export function PerformanceHeatmap({ data, globalLatestDate, marketStatus, breadthMetrics }: PerformanceHeatmapProps) {
    const [viewMode, setViewMode] = useLocalStorage<HeatmapViewMode>("ph_viewMode", "returns");
    const [showCagr, setShowCagr] = useLocalStorage("ph_showCagr", false);
    const [searchQuery, setSearchQuery] = useState("");
    const [displayedCount, setDisplayedCount] = useState<number>(data.length);

    useEffect(() => {
        setDisplayedCount(data.length);
    }, [data.length]);

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showSelectedOnly, setShowSelectedOnly] = useLocalStorage("ph_showSelectedOnly", false);
    
    // Set is not serializable for localStorage directly, so we store string[] and convert
    const [selectedThemesArr, setSelectedThemesArr] = useLocalStorage<string[]>("ph_selectedThemes", []);
    const selectedThemes = useMemo(() => new Set(selectedThemesArr), [selectedThemesArr]);
    
    // Category filters
    const [showBroadMarket, setShowBroadMarket] = useLocalStorage("ph_showBroadMarket", true);
    const [showSectors, setShowSectors] = useLocalStorage("ph_showSectors", true);
    const [showIndustries, setShowIndustries] = useLocalStorage("ph_showIndustries", true);
    
    const dropdownRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<AgGridReact>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    const [visibleColumns, setVisibleColumns] = useLocalStorage<Record<string, boolean>>("ph_visibleColumns", () => {
        const initial: Record<string, boolean> = {};
        returnColumns.forEach(c => initial[c] = true);
        return initial;
    });

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const onSelectionChanged = useCallback((event: SelectionChangedEvent) => {
        const selectedNodes = event.api.getSelectedNodes();
        const selectedIds = selectedNodes.map(node => node.data["Theme/Index"]);
        setSelectedThemesArr(selectedIds);
    }, [setSelectedThemesArr]);

    const getThemeTickers = useCallback((themes: string[]): string[] => {
        if (!marketStatus) return [];
        const allTickers = new Set<string>();

        themes.forEach(title => {
            let statusKey = "";
            const resolvedTitle = resolveDataKey(title);

            for (const key of Object.keys(marketStatus)) {
                if (key.toLowerCase() === resolvedTitle) {
                    statusKey = key;
                    break;
                }
            }

            if (!statusKey) {
                const upperKey = title.toUpperCase();
                if (marketStatus[upperKey]) statusKey = upperKey;
                else if (title.startsWith("Nifty ")) {
                    const niftyUpper = "NIFTY " + title.slice(6).toUpperCase();
                    if (marketStatus[niftyUpper]) statusKey = niftyUpper;
                }
            }

            if (statusKey && marketStatus[statusKey]) {
                const s = marketStatus[statusKey];
                [...(s.above || []), ...(s.below || []), ...(s.new_stock || [])].forEach(t => allTickers.add(t));
            }
        });

        return Array.from(allTickers);
    }, [marketStatus]);

    const getActiveTickers = useCallback((): string[] => {
        if (selectedThemes.size > 0) {
            return getThemeTickers(Array.from(selectedThemes));
        }

        const api = gridRef.current?.api;
        const visibleThemes: string[] = [];
        if (api) {
            api.forEachNodeAfterFilterAndSort((node) => {
                if (node.data?.["Theme/Index"]) {
                    visibleThemes.push(node.data["Theme/Index"]);
                }
            });
        }
        const themes = visibleThemes.length > 0 ? visibleThemes : data.map(r => r["Theme/Index"]);
        return getThemeTickers(themes);
    }, [selectedThemes, getThemeTickers, data]);

    const handleOpenTabs = useCallback(() => {
        const tickersToOpen = getActiveTickers();
        if (tickersToOpen.length === 0) return;

        // Limit opening tabs to 25 to prevent browser hanging
        if (tickersToOpen.length > 25) {
            alert(`Opening ${tickersToOpen.length} tabs might slow down your browser. Please use the "Copy Watchlist" button instead and paste it directly into TradingView.`);
            return;
        }

        tickersToOpen.forEach((ticker, index) => {
            setTimeout(() => {
                const url = makeTradingViewUrl(ticker);
                window.open(url, "_blank");
            }, index * 150);
        });
    }, [getActiveTickers]);

    // Augment data with precomputed breadth metrics and CAGR transforms
    const displayData = useMemo(() => {
        return data.map((row) => {
            const title = row["Theme/Index"];
            const breadth = breadthMetrics ? lookupThemeBreadth(title, breadthMetrics) : null;

            const augmented: any = {
                ...row,
                breadth,
                breadth_totalStocks: breadth?.totalStocks ?? null,
                breadth_pctAbove200Sma: breadth?.pctAbove200Sma ?? null,
                breadth_above200Sma: breadth?.above200Sma ?? null,
                breadth_below200Sma: breadth?.below200Sma ?? null,
            };

            if (breadth) {
                for (const tf of GAINER_TIMEFRAMES) {
                    const stat = breadth.timeframes?.[tf];
                    augmented[`breadth_${tf}_pct`] = stat ? stat.pct : null;
                    augmented[`breadth_${tf}_gained`] = stat ? stat.gained : null;
                    augmented[`breadth_${tf}_total`] = stat ? stat.total : null;
                    augmented[`breadth_${tf}_declined`] = stat ? stat.declined : null;
                    augmented[`breadth_${tf}_flat`] = stat ? stat.flat : null;
                    augmented[`breadth_${tf}_unlisted`] = stat ? stat.unlisted : null;
                }
            }

            if (showCagr) {
                if (typeof augmented["3 Years"] === "number" && augmented["3 Years"] !== null) {
                    augmented["3 Years"] = (Math.pow(1 + augmented["3 Years"] / 100, 1 / 3) - 1) * 100;
                }
                if (typeof augmented["5 Years"] === "number" && augmented["5 Years"] !== null) {
                    augmented["5 Years"] = (Math.pow(1 + augmented["5 Years"] / 100, 1 / 5) - 1) * 100;
                }
            }

            return augmented;
        });
    }, [data, showCagr, breadthMetrics]);

    const numberFilterParams = {
        filterOptions: [
            "greaterThan",
            "greaterThanOrEqual",
            "lessThan",
            "lessThanOrEqual",
            "inRange",
            "equals",
            "notEqual",
            "blank",
            "notBlank",
        ],
        defaultOption: "greaterThan",
        maxNumConditions: 2,
        buttons: ["apply", "reset"],
        closeOnApply: true,
    };

    const themeRenderer = useCallback((params: { value: string }) => {
        if (!params.value) return null;
        const config = ALL_CONFIGS.find((c) => c.title === params.value);
        if (!config) return <span className="text-white font-medium">{params.value}</span>;

        let path = "";
        if (config.category === "broad-market") path = `/broad-market/${config.id}`;
        else if (config.category === "sectors") path = `/sectors/${config.id}`;
        else if (config.category === "industries") path = `/industries/${config.id}`;

        return (
            <a href={path} className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                {params.value}
            </a>
        );
    }, []);

    const rsRatingCol: ColDef = useMemo(() => ({
        headerName: "RS Rating",
        field: "RS Rating",
        valueGetter: (params) => params.data?.["RS Rating"] ?? params.data?.["IBD RS Rating"] ?? null,
        width: 140,
        minWidth: 130,
        cellRenderer: (params: { value: number | null }) => {
            if (params.value === null || params.value === undefined) return <span className="text-gray-500 font-mono">—</span>;
            const rating = Number(params.value);
            let bg = "bg-slate-800/80 text-slate-300 border-slate-700";
            if (rating >= 90) bg = "bg-emerald-950/80 text-emerald-300 border-emerald-700/80";
            else if (rating >= 80) bg = "bg-cyan-950/80 text-cyan-300 border-cyan-700/80";
            else if (rating < 50) bg = "bg-red-950/40 text-red-400 border-red-900/50";
            return (
                <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono border ${bg}`}>
                    RS {rating}
                </span>
            );
        },
        sortable: true,
        filter: "agNumberColumnFilter",
        filterParams: numberFilterParams,
        headerTooltip: "Relative Strength Rating (1-99) weighted across 4 quarters (40% Q1, 20% Q2, 20% Q3, 20% Q4) vs all sectors & themes"
    }), []);

    const columnDefs = useMemo<ColDef[]>(() => {
        const baseCols: ColDef[] = [
            {
                headerName: "",
                field: "checkbox",
                headerCheckboxSelection: true,
                checkboxSelection: true,
                pinned: "left",
                width: 48,
                maxWidth: 48,
                suppressHeaderMenuButton: true,
                resizable: false,
                sortable: false,
                filter: false,
                flex: 0,
            },
            {
                headerName: "Theme / Index",
                field: "Theme/Index",
                pinned: "left",
                width: 200,
                minWidth: 160,
                filter: "agTextColumnFilter",
                filterParams: {
                    filterOptions: ["contains", "startsWith", "endsWith", "equals", "notEqual"],
                    defaultOption: "contains",
                    buttons: ["apply", "reset"],
                    closeOnApply: true,
                },
                cellRenderer: themeRenderer,
            },
        ];

        // 1. RETURNS MODE (Original Heatmap)
        if (viewMode === "returns") {
            const cols = [...baseCols];
            for (const col of returnColumns) {
                if (col === "RS Rating" || col === "IBD RS Rating") {
                    cols.push({
                        ...rsRatingCol,
                        hide: !visibleColumns[col],
                    });
                } else {
                    cols.push({
                        headerName: col,
                        field: col,
                        hide: !visibleColumns[col],
                        width: col.startsWith("RS") ? 125 : 115,
                        minWidth: col.startsWith("RS") ? 115 : 105,
                        valueFormatter: returnFormatter,
                        cellStyle: getHeatmapStyle,
                        sortable: true,
                        filter: "agNumberColumnFilter",
                        filterParams: numberFilterParams,
                        headerTooltip: col === "RS (5D)" ? "Relative Strength against Nifty 50 over 5 Trading Days" : col === "RS (10D)" ? "Relative Strength against Nifty 50 over 10 Trading Days" : col === "RS (20D)" ? "Relative Strength against Nifty 50 over 20 Trading Days" : col === "RS (50D)" ? "Relative Strength against Nifty 50 over 50 Trading Days" : undefined
                    });
                }
            }
            return cols;
        }

        // 2. BREADTH & GAINERS MODE (Strictly 1D to 1Y)
        if (viewMode === "breadth") {
            const cols = [...baseCols];

            // Total Stocks
            cols.push({
                headerName: "Total",
                field: "breadth_totalStocks",
                width: 80,
                minWidth: 70,
                sortable: true,
                suppressHeaderMenuButton: true,
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "Total number of constituent stocks tracked in this theme",
                cellRenderer: (params: { value: number | null }) => {
                    if (params.value === null || params.value === undefined) return <span className="text-gray-500 font-mono">—</span>;
                    return (
                        <div className="flex items-center justify-center h-full">
                            <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 font-mono text-[11px] text-slate-300 font-semibold">
                                {params.value}
                            </span>
                        </div>
                    );
                },
            });

            // > 200 SMA
            cols.push({
                headerName: "> 200 SMA",
                field: "breadth_pctAbove200Sma",
                width: 125,
                minWidth: 110,
                sortable: true,
                suppressHeaderMenuButton: true,
                cellStyle: getBreadthHeatmapStyle,
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "% and count of constituents trading above their 200-day Simple Moving Average",
                cellRenderer: (params: any) => {
                    const b: ThemeBreadthSummaryMetrics | null = params.data?.breadth;
                    if (!b || b.pctAbove200Sma === undefined) return <span className="text-gray-500 font-mono">—</span>;
                    const tooltip = `${params.data["Theme/Index"]}\nAbove 200 SMA: ${b.above200Sma} / ${b.totalStocks} (${b.pctAbove200Sma.toFixed(1)}%)\nBelow 200 SMA: ${b.below200Sma} / ${b.totalStocks}`;
                    return (
                        <div className="flex flex-col items-center justify-center h-full py-0.5 leading-tight font-mono text-center" title={tooltip}>
                            <span className="font-bold text-xs">{b.pctAbove200Sma.toFixed(1)}%</span>
                            <span className="text-[10px] text-slate-400 font-medium tracking-tight mt-0.5">
                                {b.above200Sma}/{b.totalStocks}
                            </span>
                        </div>
                    );
                },
            });

            // Timeframes: 1D, 1W, 1M, 3M, 6M, YTD, 1Y
            for (const tf of GAINER_TIMEFRAMES) {
                cols.push({
                    headerName: `${tf} Gainers`,
                    field: `breadth_${tf}_pct`,
                    width: 120,
                    minWidth: 105,
                    sortable: true,
                    suppressHeaderMenuButton: true,
                    cellStyle: getBreadthHeatmapStyle,
                    filter: "agNumberColumnFilter",
                    filterParams: numberFilterParams,
                    headerTooltip: `% and count of constituents with positive returns (>0%) over ${tf} (unseasoned IPOs excluded from denominator)`,
                    cellRenderer: (params: any) => {
                        const stat = params.data?.breadth?.timeframes?.[tf];
                        if (!stat || stat.total === 0) return <span className="text-gray-500 font-mono">—</span>;
                        const themeName = params.data["Theme/Index"];
                        const tooltip = `${themeName} — ${tf} Breadth\n────────────────────────\nActive Constituents: ${stat.total}\nGainers (>0%): ${stat.gained} / ${stat.total} (${stat.pct.toFixed(1)}%)\nDecliners (<0%): ${stat.declined} / ${stat.total}\nFlat (0%): ${stat.flat}${stat.unlisted > 0 ? `\nRecent IPOs (<${tf}): ${stat.unlisted} (Excluded from denominator)` : ""}`;
                        return (
                            <div className="flex flex-col items-center justify-center h-full py-0.5 leading-tight font-mono text-center" title={tooltip}>
                                <span className="font-bold text-xs">{stat.pct.toFixed(1)}%</span>
                                <span className="text-[10px] text-slate-400 font-medium tracking-tight mt-0.5">
                                    {stat.gained}/{stat.total}
                                </span>
                            </div>
                        );
                    },
                });
            }

            // RS Rating
            cols.push(rsRatingCol);
            return cols;
        }

        // 3. COMBINED MODE (Returns % + Gainers badge underneath)
        if (viewMode === "combined") {
            const cols = [...baseCols];

            // Total Stocks
            cols.push({
                headerName: "Total",
                field: "breadth_totalStocks",
                width: 80,
                minWidth: 70,
                sortable: true,
                suppressHeaderMenuButton: true,
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "Total number of constituent stocks tracked in this theme",
                cellRenderer: (params: { value: number | null }) => {
                    if (params.value === null || params.value === undefined) return <span className="text-gray-500 font-mono">—</span>;
                    return (
                        <div className="flex items-center justify-center h-full">
                            <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 font-mono text-[11px] text-slate-300 font-semibold">
                                {params.value}
                            </span>
                        </div>
                    );
                },
            });

            // > 200 SMA
            cols.push({
                headerName: "> 200 SMA",
                field: "breadth_pctAbove200Sma",
                width: 125,
                minWidth: 110,
                sortable: true,
                suppressHeaderMenuButton: true,
                cellStyle: getBreadthHeatmapStyle,
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "% and count of constituents trading above their 200-day Simple Moving Average",
                cellRenderer: (params: any) => {
                    const b: ThemeBreadthSummaryMetrics | null = params.data?.breadth;
                    if (!b || b.pctAbove200Sma === undefined) return <span className="text-gray-500 font-mono">—</span>;
                    return (
                        <div className="flex flex-col items-center justify-center h-full text-center leading-tight font-mono py-0.5">
                            <span className="font-bold text-xs">{b.pctAbove200Sma.toFixed(1)}%</span>
                            <span className="text-[10px] text-slate-400 font-medium tracking-tight mt-0.5">
                                {b.above200Sma}/{b.totalStocks}
                            </span>
                        </div>
                    );
                },
            });

            // Combined Timeframes: 1D to 1Y
            for (const tf of GAINER_TIMEFRAMES) {
                const metricCol = TIMEFRAME_TO_METRIC_COL[tf];
                cols.push({
                    headerName: metricCol,
                    field: metricCol,
                    width: 120,
                    minWidth: 105,
                    sortable: true,
                    suppressHeaderMenuButton: true,
                    cellStyle: getHeatmapStyle,
                    filter: "agNumberColumnFilter",
                    filterParams: numberFilterParams,
                    headerTooltip: `${metricCol} Equal-Weighted return and constituent gainers ratio`,
                    cellRenderer: (params: any) => {
                        const ret = params.value != null && params.value !== "" ? Number(params.value) : null;
                        const stat = params.data?.breadth?.timeframes?.[tf];
                        if (ret === null) return <span className="text-gray-500 font-mono">—</span>;
                        const formattedRet = formatMetricReturn(ret);
                        const tooltip = stat 
                            ? `${params.data["Theme/Index"]} — ${tf}\nReturn: ${formattedRet}\nGainers: ${stat.gained}/${stat.total} (${stat.pct.toFixed(1)}%)\nDecliners: ${stat.declined}${stat.unlisted > 0 ? `\nRecent IPOs: ${stat.unlisted}` : ""}` 
                            : `Return: ${formattedRet}`;
                        return (
                            <div className="flex flex-col items-center justify-center h-full py-0.5 leading-tight font-mono text-center" title={tooltip}>
                                <span className="font-bold text-xs">{formattedRet}</span>
                                {stat && stat.total > 0 && (
                                    <span className="text-[10px] text-slate-400 font-medium tracking-tight mt-0.5">
                                        {stat.gained}/{stat.total}
                                    </span>
                                )}
                            </div>
                        );
                    },
                });
            }

            // RS Rating
            cols.push(rsRatingCol);
            return cols;
        }

        return baseCols;
    }, [viewMode, visibleColumns, rsRatingCol, themeRenderer]);

    const defaultColDef = useMemo<ColDef>(
        () => ({
            resizable: true,
            suppressMovable: true,
            filter: "agNumberColumnFilter",
            filterParams: numberFilterParams,
            minWidth: 90,
        }),
        []
    );

    const toggleColumn = (col: string) => {
        setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
    };

    const isExternalFilterPresent = useCallback(() => {
        return searchQuery !== "" || showSelectedOnly || !showBroadMarket || !showSectors || !showIndustries;
    }, [searchQuery, showSelectedOnly, showBroadMarket, showSectors, showIndustries]);

    const doesExternalFilterPass = useCallback((node: IRowNode) => {
        const rowData = node.data;
        const title = rowData["Theme/Index"] || "";

        // Category filter
        const category = getCategoryForTitle(title, ALL_CONFIGS);
        if (category === "broad-market" && !showBroadMarket) return false;
        if (category === "sectors" && !showSectors) return false;
        if (category === "industries" && !showIndustries) return false;

        // Show Selected Only filter
        if (showSelectedOnly && !selectedThemes.has(title)) {
            return false;
        }

        if (searchQuery !== "") {
            if (!title.toLowerCase().includes(searchQuery.toLowerCase())) {
                return false;
            }
        }
        return true;
    }, [searchQuery, showSelectedOnly, selectedThemes, showBroadMarket, showSectors, showIndustries]);

    useEffect(() => {
        if (gridRef.current?.api) {
            gridRef.current.api.onFilterChanged();
        }
    }, [searchQuery, showSelectedOnly, selectedThemes, showBroadMarket, showSectors, showIndustries]);

    const clearFilters = () => {
        setSearchQuery("");
        setShowSelectedOnly(false);
        setShowBroadMarket(true);
        setShowSectors(true);
        setShowIndustries(true);
        if (gridRef.current?.api) {
            gridRef.current.api.setFilterModel(null);
        }
    };

    const clearSelection = () => {
        setSelectedThemesArr([]);
        if (gridRef.current?.api) {
            gridRef.current.api.deselectAll();
        }
    };

    const isFiltered = searchQuery !== "" || showSelectedOnly || !showBroadMarket || !showSectors || !showIndustries || displayedCount < data.length;
    const selectionCount = selectedThemes.size;

    // Data validation check
    const globalLatestStr = globalLatestDate;
    let isStale = false;
    if (globalLatestStr) {
        const d = new Date(globalLatestStr + "T00:00:00");
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        isStale = diffDays > 3;
    }

    return (
        <div className="flex flex-col gap-3">
            {/* Category Filters */}
            <div className="mb-1">
                <CategoryFilter
                    showBroadMarket={showBroadMarket}
                    showSectors={showSectors}
                    showIndustries={showIndustries}
                    onToggleBroadMarket={() => setShowBroadMarket(!showBroadMarket)}
                    onToggleSectors={() => setShowSectors(!showSectors)}
                    onToggleIndustries={() => setShowIndustries(!showIndustries)}
                />
            </div>

            <div className="flex flex-wrap justify-between pr-2 gap-y-3 gap-x-6 items-center">
                <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
                    {/* View Mode Switcher */}
                    <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-lg p-0.5 shadow-sm">
                        <button
                            onClick={() => setViewMode("returns")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all font-medium ${
                                viewMode === "returns"
                                    ? "bg-blue-600 text-white shadow-sm font-semibold"
                                    : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            <TrendingUp size={13} />
                            Returns (%)
                        </button>
                        <button
                            onClick={() => setViewMode("breadth")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all font-medium ${
                                viewMode === "breadth"
                                    ? "bg-blue-600 text-white shadow-sm font-semibold"
                                    : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            <BarChart2 size={13} />
                            Breadth & Gainers
                        </button>
                        <button
                            onClick={() => setViewMode("combined")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all font-medium ${
                                viewMode === "combined"
                                    ? "bg-blue-600 text-white shadow-sm font-semibold"
                                    : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            <Layers size={13} />
                            Combined
                        </button>
                    </div>

                    <div className="relative flex-1 max-w-xs min-w-[200px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input
                            type="text"
                            placeholder="Search themes/indices..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-900/50 border border-slate-700/50 rounded-md py-1.5 pl-9 pr-8 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-slate-600 transition-all font-medium"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {/* Live Theme Count Badge */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900/80 border border-slate-800 text-xs text-slate-400 whitespace-nowrap shadow-sm">
                        {displayedCount < data.length ? (
                            <span>
                                Showing <strong className="font-mono font-semibold text-blue-400">{displayedCount}</strong> of <span className="font-mono text-slate-300">{data.length}</span> themes
                            </span>
                        ) : (
                            <span>
                                <strong className="font-mono font-semibold text-slate-200">{data.length}</strong> themes
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                    {isStale && (
                        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] px-2 py-1 rounded flex items-center gap-1.5">
                            <AlertCircle size={12} className="animate-pulse" />
                            <span>Syncing...</span>
                        </div>
                    )}

                    {selectionCount > 0 && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowSelectedOnly(!showSelectedOnly)}
                                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-all ${
                                    showSelectedOnly 
                                        ? "bg-blue-500/20 border-blue-500/40 text-blue-300 shadow-sm shadow-blue-500/10" 
                                        : "bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700"
                                }`}
                            >
                                <CheckSquare size={13} />
                                Show Selected
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                    showSelectedOnly ? "bg-blue-500/30 text-blue-200" : "bg-slate-700 text-slate-400"
                                }`}>
                                    {selectionCount}
                                </span>
                            </button>
                            <button
                                onClick={clearSelection}
                                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                                title="Clear selection"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    )}

                    {viewMode !== "breadth" && (
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer text-nowrap select-none hover:text-slate-300 transition-colors">
                            <input
                                type="checkbox"
                                checked={showCagr}
                                onChange={(e) => setShowCagr(e.target.checked)}
                                className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 h-3.5 w-3.5"
                            />
                            Annualize (CAGR)
                        </label>
                    )}

                    {isFiltered && (
                        <button 
                            onClick={clearFilters}
                            className="text-[11px] text-slate-400 hover:text-blue-400 transition-colors font-medium flex items-center gap-1 bg-slate-800/50 py-1 px-2 rounded border border-slate-700/50"
                        >
                            <X size={12} />
                            Clear All
                        </button>
                    )}

                    <div className="flex items-center gap-2">
                        {/* Open Tabs Button */}
                        <button
                            onClick={handleOpenTabs}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all duration-200"
                            title={selectedThemes.size > 0 ? `Open ${selectedThemes.size} themes in TradingView` : "Open all visible in TradingView tabs"}
                        >
                            <ExternalLink size={14} />
                            Open in TradingView
                        </button>

                        {/* Watchlist Copy Button with Presets & Batches */}
                        <CopyWatchlistButton
                            getTickers={getActiveTickers}
                        />

                        <CaptureScreenshot 
                            targetRef={tableRef}
                            filename={viewMode === "breadth" ? "Breadth_Heatmap" : viewMode === "combined" ? "Combined_Heatmap" : "Performance_Heatmap"}
                            label="Capture Heatmap"
                            onBeforeCapture={() => {
                                const api = gridRef.current?.api;
                                if (!api) return () => {};
                                api.setGridOption('domLayout', 'autoHeight');
                                return () => { api.setGridOption('domLayout', 'normal'); };
                            }}
                        />
                        
                        {viewMode === "returns" && (
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="flex items-center gap-2 text-xs font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-md transition-colors shadow-sm"
                                >
                                    <Columns size={14} className="text-blue-400" />
                                    Columns
                                    <ChevronDown size={14} className={`transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`} />
                                </button>

                                {isDropdownOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-52 bg-[#111118] border border-slate-700 rounded-md shadow-2xl overflow-hidden z-50">
                                        <div className="p-2 flex flex-col gap-1 max-h-64 overflow-y-auto">
                                            <div className="flex justify-between items-center px-1 mb-1 pb-2 border-b border-slate-700/50">
                                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Columns</span>
                                                <div className="flex gap-2">
                                                    <button onClick={() => {
                                                        const allSelected: Record<string, boolean> = {};
                                                        returnColumns.forEach(c => allSelected[c] = true);
                                                        setVisibleColumns(allSelected);
                                                    }} className="text-[10px] text-blue-400 hover:text-blue-300 font-medium">All</button>
                                                    <span className="text-slate-600 text-[10px]">|</span>
                                                    <button onClick={() => {
                                                        const noneSelected: Record<string, boolean> = {};
                                                        returnColumns.forEach(c => noneSelected[c] = false);
                                                        setVisibleColumns(noneSelected);
                                                    }} className="text-[10px] text-red-400 hover:text-red-300 font-medium">None</button>
                                                </div>
                                            </div>
                                            {returnColumns.map(col => (
                                                <label key={col} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded cursor-pointer text-xs text-slate-300 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={visibleColumns[col]}
                                                        onChange={() => toggleColumn(col)}
                                                        className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 h-3.5 w-3.5"
                                                    />
                                                    {col}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            <div 
                ref={tableRef} 
                className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden flex flex-col transition-all duration-300 min-h-[500px] w-full" 
                style={{ height: Math.max(Math.min(displayData.length * (viewMode === "returns" ? 36 : 42) + 80, 820), 500) }}
            >
                <AgGridReact
                    ref={gridRef}
                    theme={myTheme}
                    rowData={displayData}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    rowHeight={viewMode === "returns" ? 36 : 42}
                    suppressCellFocus={true}
                    animateRows={false}
                    domLayout="normal"
                    rowSelection="multiple"
                    suppressRowClickSelection={true}
                    isExternalFilterPresent={isExternalFilterPresent}
                    doesExternalFilterPass={doesExternalFilterPass}
                    onSelectionChanged={onSelectionChanged}
                    onModelUpdated={(params: any) => {
                        setDisplayedCount(params.api.getDisplayedRowCount());
                    }}
                    onFilterChanged={(params: any) => {
                        setDisplayedCount(params.api.getDisplayedRowCount());
                    }}
                    onGridReady={(params: any) => {
                        setDisplayedCount(params.api.getDisplayedRowCount());
                        const storedState = window.localStorage.getItem(`agGridState_heatmap_${viewMode}`);
                        if (storedState) {
                            try {
                                const parsed = JSON.parse(storedState);
                                if (Array.isArray(parsed)) {
                                    const sortState = parsed
                                        .filter((s: any) => s.sort != null)
                                        .map((s: any) => ({ colId: s.colId, sort: s.sort, sortIndex: s.sortIndex }));
                                    if (sortState.length > 0) {
                                        params.api.applyColumnState({ state: sortState, applyOrder: false });
                                    }
                                }
                            } catch (e) { console.warn("Failed to apply AG grid sort state", e); }
                        }
                        params.api.forEachNode((node: IRowNode) => {
                            if (selectedThemes.has(node.data["Theme/Index"])) node.setSelected(true);
                        });
                    }}
                    onSortChanged={() => {
                        if (gridRef.current?.api) {
                            const state = gridRef.current.api.getColumnState();
                            const sortOnlyState = state
                                .filter((s: any) => s.sort != null)
                                .map((s: any) => ({ colId: s.colId, sort: s.sort, sortIndex: s.sortIndex }));
                            window.localStorage.setItem(`agGridState_heatmap_${viewMode}`, JSON.stringify(sortOnlyState));
                        }
                    }}
                />
            </div>
        </div>
    );
}
