"use client";

import { AgGridReact } from "ag-grid-react";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { ColDef, ValueFormatterParams, CellClassParams, IRowNode, SelectionChangedEvent, GridApi } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { PerformanceRow, MarketStatus } from "@/types";
import { ALL_CONFIGS } from "@/lib/config";
import { makeTradingViewUrl } from "@/lib/utils";
import { Columns, ChevronDown, AlertCircle, Search, X, CheckSquare, Copy, Check, ExternalLink } from "lucide-react";
import { CaptureScreenshot } from "@/components/common/CaptureScreenshot";

ModuleRegistry.registerModules([AllCommunityModule]);

interface PerformanceHeatmapProps {
    data: PerformanceRow[];
    globalLatestDate?: string | null;
    marketStatus?: MarketStatus;
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
    if (!params.value) return undefined;
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

function returnFormatter(params: ValueFormatterParams): string {
    if (params.value === null || params.value === undefined || params.value === "") return "—";
    const v = Number(params.value);
    if (isNaN(v)) return "—";
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

const returnColumns = ["1 Day", "1 Week", "1 Month", "3 Months", "6 Months", "1 Year", "3 Years", "5 Years", "RS (5D)", "RS (10D)", "RS (20D)", "RS (50D)"];

export function PerformanceHeatmap({ data, globalLatestDate, marketStatus }: PerformanceHeatmapProps) {
    const [showCagr, setShowCagr] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showSelectedOnly, setShowSelectedOnly] = useState(false);
    const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set());
    const [isCopied, setIsCopied] = useState(false);
    
    const dropdownRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<AgGridReact>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const selected = event.api.getSelectedRows() as any[];
        setSelectedThemes(new Set(selected.map(r => r["Theme/Index"])));
    }, []);

    const handleCopyWatchlist = useCallback(() => {
        if (!marketStatus) return;

        // Use selected themes if any, otherwise use all in displayData
        const themesToProcess = selectedThemes.size > 0 
            ? Array.from(selectedThemes) 
            : data.map(r => r["Theme/Index"]);

        if (themesToProcess.length === 0) return;

        const allTickers = new Set<string>();
        
        // Match theme titles to marketStatus keys (similar to lib/data.ts logic)
        const ALIASES: Record<string, string> = {
            "amc": "asset management",
            "renewable energy": "renewable energy generation",
            "nifty oil & gas": "nifty oil and gas",
            "jewellery & gold": "jewellery (gold)",
            "tyres & rubber": "tyres & rubber products",
            "auto ancillary": "auto ancillary",
            "white goods": "white goods & durables",
            "wires & cables": "wires and cables",
        };

        themesToProcess.forEach(title => {
            let statusKey = "";
            const lowerTitle = title.toLowerCase();
            const resolvedTitle = ALIASES[lowerTitle] || lowerTitle;

            // Direct match or insensitive
            for (const key of Object.keys(marketStatus)) {
                if (key.toLowerCase() === resolvedTitle) {
                    statusKey = key;
                    break;
                }
            }

            // Fallback: NIFTY/Uppercase
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

        if (allTickers.size === 0) return;

        const formatted = Array.from(allTickers).map(t => {
            const clean = t.replace(".NS", "").replace(".BO", "");
            const prefix = t.includes(".BO") ? "BSE" : "NSE";
            return `${prefix}:${clean}`;
        }).join(", ");

        navigator.clipboard.writeText(formatted).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    }, [selectedThemes, data, marketStatus]);

    const handleOpenTabs = useCallback(() => {
        if (!marketStatus) return;

        const themesToProcess = selectedThemes.size > 0 
            ? Array.from(selectedThemes) 
            : data.map(r => r["Theme/Index"]);

        if (themesToProcess.length === 0) return;

        const allTickers = new Set<string>();
        
        const ALIASES: Record<string, string> = {
            "amc": "asset management",
            "renewable energy": "renewable energy generation",
            "nifty oil & gas": "nifty oil and gas",
            "jewellery & gold": "jewellery (gold)",
            "tyres & rubber": "tyres & rubber products",
            "auto ancillary": "auto ancillary",
            "white goods": "white goods & durables",
            "wires & cables": "wires and cables",
        };

        themesToProcess.forEach(title => {
            let statusKey = "";
            const lowerTitle = title.toLowerCase();
            const resolvedTitle = ALIASES[lowerTitle] || lowerTitle;

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

        const tickersToOpen = Array.from(allTickers);
        if (tickersToOpen.length === 0) return;

        tickersToOpen.forEach((ticker, index) => {
            setTimeout(() => {
                const url = makeTradingViewUrl(ticker);
                window.open(url, "_blank");
            }, index * 150);
        });
    }, [selectedThemes, data, marketStatus]);

    const displayData = useMemo(() => {
        if (!showCagr) return data;
        return data.map((row) => {
            const newRow = { ...row };
            if (typeof row["3 Years"] === "number" && row["3 Years"] !== null) {
                newRow["3 Years"] = (Math.pow(1 + row["3 Years"] / 100, 1 / 3) - 1) * 100;
            }
            if (typeof row["5 Years"] === "number" && row["5 Years"] !== null) {
                newRow["5 Years"] = (Math.pow(1 + row["5 Years"] / 100, 1 / 5) - 1) * 100;
            }
            return newRow;
        });
    }, [data, showCagr]);

    const columnDefs = useMemo<ColDef[]>(() => {
        const cols: ColDef[] = [
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
                filter: true,
                cellRenderer: (params: { value: string }) => {
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
                },
            },
        ];

        for (const col of returnColumns) {
            cols.push({
                headerName: col,
                field: col,
                hide: !visibleColumns[col],
                width: (col.startsWith("RS")) ? 130 : 110,
                valueFormatter: returnFormatter,
                cellStyle: getHeatmapStyle,
                sortable: true,
                filter: true,
                headerTooltip: col === "RS (5D)" ? "Relative Strength against Nifty 50 over 5 Trading Days" : col === "RS (10D)" ? "Relative Strength against Nifty 50 over 10 Trading Days" : col === "RS (20D)" ? "Relative Strength against Nifty 50 over 20 Trading Days" : col === "RS (50D)" ? "Relative Strength against Nifty 50 over 50 Trading Days" : undefined
            });
        }
        return cols;
    }, [visibleColumns]);

    const defaultColDef = useMemo<ColDef>(
        () => ({
            resizable: true,
            suppressMovable: true,
            flex: 1,
            minWidth: 100,
        }),
        []
    );

    const toggleColumn = (col: string) => {
        setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
    };

    const isExternalFilterPresent = useCallback(() => {
        return searchQuery !== "" || showSelectedOnly;
    }, [searchQuery, showSelectedOnly]);

    const doesExternalFilterPass = useCallback((node: IRowNode) => {
        const rowData = node.data;

        // Show Selected Only filter
        if (showSelectedOnly && !selectedThemes.has(rowData["Theme/Index"])) {
            return false;
        }

        if (searchQuery !== "") {
            const theme = (rowData["Theme/Index"] || "").toLowerCase();
            if (!theme.includes(searchQuery.toLowerCase())) {
                return false;
            }
        }
        return true;
    }, [searchQuery, showSelectedOnly, selectedThemes]);

    useEffect(() => {
        if (gridRef.current?.api) {
            gridRef.current.api.onFilterChanged();
        }
    }, [searchQuery, showSelectedOnly, selectedThemes]);

    const clearFilters = () => {
        setSearchQuery("");
        setShowSelectedOnly(false);
        if (gridRef.current?.api) {
            gridRef.current.api.setFilterModel(null);
        }
    };

    const clearSelection = () => {
        setSelectedThemes(new Set());
        setShowSelectedOnly(false);
        if (gridRef.current?.api) {
            gridRef.current.api.deselectAll();
        }
    };

    const isFiltered = searchQuery !== "" || showSelectedOnly;
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
            <div className="flex flex-wrap justify-between pr-2 gap-y-3 gap-x-6 items-center">
                <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-sm">
                    <div className="relative flex-1">
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

                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer text-nowrap select-none hover:text-slate-300 transition-colors">
                        <input
                            type="checkbox"
                            checked={showCagr}
                            onChange={(e) => setShowCagr(e.target.checked)}
                            className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 h-3.5 w-3.5"
                        />
                        Annualize (CAGR)
                    </label>

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

                        <button
                            onClick={handleCopyWatchlist}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 border ${
                                isCopied 
                                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" 
                                : "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50"
                            }`}
                            title={selectedThemes.size > 0 ? `Copy ${selectedThemes.size} themes to Watchlist` : "Copy all visible to Watchlist"}
                        >
                            {isCopied ? <Check size={14} /> : <Copy size={14} />}
                            {isCopied ? "Watchlist Copied!" : "Copy Watchlist"}
                        </button>

                        <CaptureScreenshot 
                            targetRef={tableRef}
                            filename="Performance_Heatmap"
                            label="Capture Heatmap"
                            onBeforeCapture={() => {
                                const api = gridRef.current?.api;
                                if (!api) return () => {};
                                api.setGridOption('domLayout', 'autoHeight');
                                return () => { api.setGridOption('domLayout', 'normal'); };
                            }}
                        />
                        
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
                    </div>
                </div>
            </div>
            
            <div ref={tableRef} className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden flex flex-col transition-all duration-300 min-h-[500px]" style={{ height: Math.max(Math.min(displayData.length * 35 + 80, 800), 500) }}>
                <AgGridReact
                    ref={gridRef}
                    theme={myTheme}
                    rowData={displayData}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    suppressCellFocus={true}
                    animateRows={false}
                    domLayout="normal"
                    rowSelection="multiple"
                    suppressRowClickSelection={true}
                    isExternalFilterPresent={isExternalFilterPresent}
                    doesExternalFilterPass={doesExternalFilterPass}
                    onSelectionChanged={onSelectionChanged}
                />
            </div>
        </div>
    );
}
