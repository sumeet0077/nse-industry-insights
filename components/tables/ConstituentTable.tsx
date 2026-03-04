// components/tables/ConstituentTable.tsx
"use client";

import { AgGridReact } from "ag-grid-react";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { ColDef, ValueFormatterParams, CellClassParams, IRowNode } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { makeTradingViewUrl } from "@/lib/utils";
import { Columns, ChevronDown } from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule]);

interface ConstituentRow {
    ticker: string;
    [key: string]: number | string | null | undefined;
}

interface ConstituentTableProps {
    data: ConstituentRow[];
    showCagr?: boolean; // Keep for interface compatibility if used elsewhere
}

const returnCols = ["1D", "1W", "1M", "3M", "6M", "1Y", "3Y", "5Y", "RS (20D)"];

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
    const dropdownRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<AgGridReact>(null);

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

    const columnDefs = useMemo<ColDef[]>(() => {
        const cols: ColDef[] = [
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
                field: col,
                hide: !visibleColumns[col],
                width: col === "RS (20D)" ? 120 : 100,
                valueFormatter: returnFormatter,
                cellClass: returnCellClass,
                type: "numericColumn",
                sortable: true,
            });
        }
        return cols;
    }, [visibleColumns]);

    const defaultColDef = useMemo<ColDef>(
        () => ({
            resizable: false,
            suppressMovable: true,
        }),
        []
    );

    const toggleColumn = (col: string) => {
        setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
    };

    const isExternalFilterPresent = useCallback(() => {
        return showSelectedOnly;
    }, [showSelectedOnly]);

    const doesExternalFilterPass = useCallback((node: IRowNode) => {
        return !!node.isSelected();
    }, []);

    useEffect(() => {
        if (gridRef.current?.api) {
            gridRef.current.api.onFilterChanged();
        }
    }, [showSelectedOnly]);

    const onSelectionChanged = useCallback(() => {
        if (showSelectedOnly && gridRef.current?.api) {
            gridRef.current.api.onFilterChanged();
        }
    }, [showSelectedOnly]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex justify-between pr-2 gap-4 items-center">
                <div className="flex-1">
                    {/* Empty placeholder to ensure space spacing aligns to right */}
                </div>

                <div className="flex gap-4 items-center">
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer text-nowrap">
                        <input
                            type="checkbox"
                            checked={showSelectedOnly}
                            onChange={(e) => setShowSelectedOnly(e.target.checked)}
                            className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 h-3.5 w-3.5"
                        />
                        Show Selected Only
                    </label>

                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="flex items-center gap-2 text-xs font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-md transition-colors"
                        >
                            <Columns size={14} />
                            Columns
                            <ChevronDown size={14} className={`transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`} />
                        </button>

                        {isDropdownOpen && (
                            <div className="absolute right-0 top-full mt-2 w-52 bg-[#111118] border border-slate-700 rounded-md shadow-xl overflow-hidden z-50">
                                <div className="p-2 flex flex-col gap-1 max-h-64 overflow-y-auto">
                                    <div className="flex justify-between items-center px-1 mb-1 pb-2 border-b border-slate-700/50">
                                        <span className="text-[10px] font-semibold text-slate-500 uppercase">Columns</span>
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
                                        <label key={col} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-800/80 rounded cursor-pointer text-xs text-slate-300">
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
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden flex flex-col transition-all duration-300 min-h-[500px]" style={{ height: Math.max(Math.min(data.length * 35 + 50, 800), 500) }}>
                <AgGridReact
                    ref={gridRef}
                    theme={myTheme}
                    rowData={data}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    suppressCellFocus={true}
                    animateRows={false}
                    domLayout="normal"
                    rowSelection={{ mode: "multiRow", headerCheckbox: true }}
                    isExternalFilterPresent={isExternalFilterPresent}
                    doesExternalFilterPass={doesExternalFilterPass}
                    onSelectionChanged={onSelectionChanged}
                />
            </div>
        </div>
    );
}
