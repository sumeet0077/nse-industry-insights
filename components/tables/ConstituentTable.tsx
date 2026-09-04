import { AgGridReact } from "ag-grid-react";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { ColDef, ValueFormatterParams, CellClassParams, IRowNode, SelectionChangedEvent, GridApi } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { makeTradingViewUrl, getTickerLabel, makeTradingViewSymbol } from "@/lib/utils";
import { getMetricValue, formatMetricReturn, getMetricColor, METRIC_DEFINITIONS } from "@/lib/metrics";
import { Columns, ChevronDown, Search, X, CheckSquare, Copy, Check, ExternalLink, Zap } from "lucide-react";
import { CaptureScreenshot } from "@/components/common/CaptureScreenshot";
import { useLocalStorage } from "@/hooks/useLocalStorage";

ModuleRegistry.registerModules([AllCommunityModule]);

export interface ConstituentRow {
    ticker: string;
    [key: string]: number | string | boolean | null | undefined;
}

interface ConstituentTableProps {
    data: ConstituentRow[];
    showCagr?: boolean;
}

const returnCols = METRIC_DEFINITIONS.map(m => m.label);

const fieldMap: Record<string, string> = {};
METRIC_DEFINITIONS.forEach(m => {
    fieldMap[m.label] = m.stockValue;
});

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

function returnFormatter(params: ValueFormatterParams): string {
    return formatMetricReturn(params.value == null || params.value === "" ? undefined : Number(params.value));
}

function returnCellClass(params: CellClassParams): string {
    if (params.value === null || params.value === undefined) return "text-gray-500";
    const v = Number(params.value);
    if (isNaN(v)) return "text-gray-500";
    const base = getMetricColor(v);
    return v !== 0 ? `${base} font-medium` : base;
}

export function ConstituentTable({ data, showCagr = false }: ConstituentTableProps) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showSelectedOnly, setShowSelectedOnly] = useLocalStorage("ct_showSelectedOnly", false);
    const [searchQuery, setSearchQuery] = useState("");
    
    // Store as array since Set isn't easily serializable to JSON for localStorage
    const [selectedTickersArr, setSelectedTickersArr] = useLocalStorage<string[]>("ct_selectedTickers", []);
    const selectedTickers = useMemo(() => new Set(selectedTickersArr), [selectedTickersArr]);
    
    const [isCopied, setIsCopied] = useState(false);
    
    const dropdownRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<AgGridReact>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    const [visibleColumns, setVisibleColumns] = useLocalStorage<Record<string, boolean>>("ct_visibleColumns", () => {
        const initial: Record<string, boolean> = {};
        returnCols.forEach(c => initial[c] = true);
        return initial;
    });

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
        const selectedIds = selectedNodes.map(node => node.data.ticker);
        setSelectedTickersArr(selectedIds);
    }, [setSelectedTickersArr]);

    const handleCopyWatchlist = useCallback(() => {
        // Use selected tickers if any, otherwise use all data tickers
        const tickersToCopy = selectedTickers.size > 0 
            ? Array.from(selectedTickers) 
            : data.map(r => r.ticker);

        if (tickersToCopy.length === 0) return;

        const formatted = tickersToCopy.map(t => makeTradingViewSymbol(t)).join(", ");

        navigator.clipboard.writeText(formatted).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    }, [selectedTickers, data]);

    const handleOpenTabs = useCallback(() => {
        const tickersToOpen = selectedTickers.size > 0 
            ? Array.from(selectedTickers) 
            : data.map(r => r.ticker);

        if (tickersToOpen.length === 0) return;

        // Limit opening tabs to 25 to prevent browser hanging
        if (tickersToOpen.length > 25) {
            alert(`Opening ${tickersToOpen.length} tabs might slow down your browser. Please use the "Copy Watchlist" button instead and paste it directly into TradingView.`);
            return;
        }

        // Open tabs with a staggered delay to help browser process popups
        tickersToOpen.forEach((ticker, index) => {
            setTimeout(() => {
                const url = makeTradingViewUrl(ticker);
                window.open(url, "_blank");
            }, index * 150); // 150ms stagger
        });
    }, [selectedTickers, data]);

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
                headerName: "Ticker",
                field: "ticker",
                pinned: "left",
                width: 180,
                cellRenderer: (params: { value: string; data: Record<string, unknown> }) => {
                    if (!params.value) return null;
                    const url = makeTradingViewUrl(params.value);
                    const label = getTickerLabel(params.value);
                    const isIpo = Boolean(params.data?.is_ipo);
                    const isLead = Boolean(params.data?.rs_lead_breakout);
                    return (
                        <div className="flex items-center gap-1.5 font-sans">
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline font-medium">
                                {label}
                            </a>
                            {isIpo && (
                                <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded text-[9px] font-mono font-semibold" title="Recent IPO (< 1 Year)">
                                    IPO
                                </span>
                            )}
                            {isLead && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gradient-to-r from-amber-500/15 to-orange-500/15 text-amber-300 border border-amber-500/40 rounded text-[10px] font-bold tracking-wide shadow-sm" title="RS Lead Breakout: Absolute RS Line at 52-week High ahead of price">
                                    <Zap className="w-2.5 h-2.5 text-amber-400 fill-amber-400 shrink-0" />
                                    <span>RS Lead</span>
                                </span>
                            )}
                        </div>
                    );
                },
            },
        ];
        for (const col of returnCols) {
            const mappedField = fieldMap[col];
            if (col === "RS Rating" || col === "IBD RS Rating") {
                cols.push({
                    headerName: "RS Rating",
                    field: "ibd_rs_rating",
                    valueGetter: (params) => params.data?.ibd_rs_rating ?? null,
                    hide: !visibleColumns[col],
                    width: 130,
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
                });
            } else {
                const isCagrCol = mappedField === "3Y" || mappedField === "5Y" || col === "3 Years" || col === "5 Years";
                cols.push({
                    headerName: isCagrCol && showCagr ? `${col} (CAGR)` : col,
                    field: mappedField,
                    valueGetter: (params) => getMetricValue(params.data as Record<string, unknown>, mappedField),
                    hide: !visibleColumns[col],
                    width: col.startsWith("RS") ? 120 : 110,
                    valueFormatter: returnFormatter,
                    cellClass: returnCellClass,
                    sortable: true,
                });
            }
        }
        return cols;
    }, [visibleColumns, showCagr]);

    const defaultColDef = useMemo<ColDef>(
        () => ({
            resizable: true,
            suppressMovable: true,
            filter: true,
            minWidth: 80,
        }),
        []
    );

    const toggleColumn = (col: string) => {
        setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
    };

    // Auto-fit columns whenever visible columns change
    useEffect(() => {
        const api = gridRef.current?.api;
        if (api) {
            // Use a small timeout to ensure AG Grid has processed the column visibility change
            setTimeout(() => {
                api.autoSizeAllColumns(false);
            }, 50);
        }
    }, [visibleColumns]);

    const isExternalFilterPresent = useCallback(() => {
        return searchQuery !== "" || showSelectedOnly;
    }, [searchQuery, showSelectedOnly]);

    const doesExternalFilterPass = useCallback((node: IRowNode) => {
        const rowData = node.data as ConstituentRow;
        
        // Show Selected Only filter
        if (showSelectedOnly && !selectedTickers.has(rowData.ticker)) {
            return false;
        }
        
        // Search Filter
        if (searchQuery !== "") {
            const ticker = (rowData.ticker || "").toLowerCase();
            if (!ticker.includes(searchQuery.toLowerCase())) {
                return false;
            }
        }
        
        return true;
    }, [searchQuery, showSelectedOnly, selectedTickers]);

    useEffect(() => {
        if (gridRef.current?.api) {
            gridRef.current.api.onFilterChanged();
        }
    }, [searchQuery, showSelectedOnly, selectedTickers]);

    const clearFilters = () => {
        setSearchQuery("");
        setShowSelectedOnly(false);
        if (gridRef.current?.api) {
            gridRef.current.api.setFilterModel(null);
        }
    };

    const clearSelection = () => {
        setSelectedTickersArr([]);
        if (gridRef.current?.api) {
            gridRef.current.api.deselectAll();
        }
    };

    const isFiltered = searchQuery !== "" || showSelectedOnly;
    const selectionCount = selectedTickers.size;

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap justify-between pr-2 gap-y-3 gap-x-6 items-center">
                <div className="flex items-center gap-3 flex-1 min-w-[240px] max-w-sm">
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input
                            type="text"
                            placeholder="Search stocks..."
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
                            title={selectedTickers.size > 0 ? `Open ${selectedTickers.size} tabs in TradingView` : "Open all visible in TradingView tabs"}
                        >
                            <ExternalLink size={14} />
                            Open in TradingView
                        </button>

                        {/* Watchlist Copy Button */}
                        <button
                            onClick={handleCopyWatchlist}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 border ${
                                isCopied 
                                ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" 
                                : "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50"
                            }`}
                            title={selectedTickers.size > 0 ? `Copy ${selectedTickers.size} selected to Watchlist` : "Copy all in view to Watchlist"}
                        >
                            {isCopied ? <Check size={14} /> : <Copy size={14} />}
                            {isCopied ? "Watchlist Copied!" : "Copy Watchlist"}
                        </button>

                        <CaptureScreenshot 
                            targetRef={tableRef}
                            filename="Constituent_Table"
                            label="Capture Table"
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
                                                    returnCols.forEach(c => allSelected[c] = true);
                                                    setVisibleColumns(allSelected);
                                                }} className="text-[10px] text-blue-400 hover:text-blue-300 font-medium">All</button>
                                                <span className="text-slate-600 text-[10px]">|</span>
                                                <button onClick={() => {
                                                    const noneSelected: Record<string, boolean> = {};
                                                    returnCols.forEach(c => noneSelected[c] = false);
                                                    setVisibleColumns(noneSelected);
                                                }} className="text-[10px] text-red-400 hover:text-red-300 font-medium">None</button>
                                            </div>
                                        </div>
                                        {returnCols.map(col => (
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
            <div ref={tableRef} className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden flex flex-col transition-all duration-300 min-h-[500px] w-full" style={{ height: Math.max(Math.min(data.length * 35 + 80, 800), 500) }}>
                <AgGridReact
                    ref={gridRef}
                    theme={myTheme}
                    rowData={data}
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
                    onGridReady={(params: any) => {
                        const storedState = window.localStorage.getItem("agGridState_constituent");
                        if (storedState) {
                            try {
                                const parsed = JSON.parse(storedState);
                                if (Array.isArray(parsed)) {
                                    // Only restore sort state, do NOT override canonical column order
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
                            if (node.data?.ticker && selectedTickers.has(node.data.ticker)) node.setSelected(true);
                        });
                    }}
                    onSortChanged={() => {
                        if (gridRef.current?.api) {
                            const state = gridRef.current.api.getColumnState();
                            const sortOnlyState = state
                                .filter((s: any) => s.sort != null)
                                .map((s: any) => ({ colId: s.colId, sort: s.sort, sortIndex: s.sortIndex }));
                            window.localStorage.setItem("agGridState_constituent", JSON.stringify(sortOnlyState));
                        }
                    }}
                />
            </div>
        </div>
    );
}
