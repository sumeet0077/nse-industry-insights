import { AgGridReact } from "ag-grid-react";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { ColDef, ValueFormatterParams, CellClassParams, IRowNode, SelectionChangedEvent, GridApi } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { makeTradingViewUrl } from "@/lib/utils";
import { Columns, ChevronDown, Search, X, CheckSquare } from "lucide-react";
import { CaptureScreenshot } from "@/components/common/CaptureScreenshot";

ModuleRegistry.registerModules([AllCommunityModule]);

interface ConstituentRow {
    ticker: string;
    [key: string]: number | string | null | undefined;
}

interface ConstituentTableProps {
    data: ConstituentRow[];
    showCagr?: boolean;
}

const returnCols = ["1 Day", "1 Week", "1 Month", "3 Months", "6 Months", "1 Year", "3 Years", "5 Years", "RS (20D)"];

const fieldMap: Record<string, string> = {
    "1 Day": "1D",
    "1 Week": "1W",
    "1 Month": "1M",
    "3 Months": "3M",
    "6 Months": "6M",
    "1 Year": "1Y",
    "3 Years": "3Y",
    "5 Years": "5Y",
    "RS (20D)": "RS (20D)"
};

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
    if (params.value === null || params.value === undefined || params.value === "") return "—";
    const v = Number(params.value);
    if (isNaN(v)) return "—";
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function returnCellClass(params: CellClassParams): string {
    if (params.value === null || params.value === undefined) return "text-gray-500";
    const v = Number(params.value);
    if (isNaN(v)) return "text-gray-500";
    if (v > 0) return "text-emerald-400 font-medium";
    if (v < 0) return "text-red-400 font-medium";
    return "text-gray-400";
}

export function ConstituentTable({ data, showCagr = false }: ConstituentTableProps) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showSelectedOnly, setShowSelectedOnly] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
    
    const dropdownRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<AgGridReact>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
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
        const selected = event.api.getSelectedRows() as ConstituentRow[];
        setSelectedTickers(new Set(selected.map(r => r.ticker)));
    }, []);

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
                width: 140,
                cellRenderer: (params: { value: string }) => {
                    if (!params.value) return null;
                    const url = makeTradingViewUrl(params.value);
                    const label = params.value.replace(".NS", "").replace(".BO", "");
                    return (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                            {label}
                        </a>
                    );
                },
            },
        ];
        for (const col of returnCols) {
            cols.push({
                headerName: col,
                field: fieldMap[col],
                hide: !visibleColumns[col],
                width: col === "RS (20D)" ? 120 : 110,
                valueFormatter: returnFormatter,
                cellClass: returnCellClass,
                sortable: true,
            });
        }
        return cols;
    }, [visibleColumns]);

    const defaultColDef = useMemo<ColDef>(
        () => ({
            resizable: true,
            suppressMovable: true,
            filter: true,
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
        setSelectedTickers(new Set());
        setShowSelectedOnly(false);
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
            <div ref={tableRef} className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden flex flex-col transition-all duration-300 min-h-[500px]" style={{ height: Math.max(Math.min(data.length * 35 + 80, 800), 500) }}>
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
                />
            </div>
        </div>
    );
}
