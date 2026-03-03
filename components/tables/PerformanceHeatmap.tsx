// components/tables/PerformanceHeatmap.tsx 
"use client";

import { AgGridReact } from "ag-grid-react";
import { useMemo, useState, useRef, useEffect } from "react";
import type { ColDef, ValueFormatterParams, CellClassParams } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import type { PerformanceRow } from "@/types";
import { ALL_CONFIGS } from "@/lib/config";
import { Columns, ChevronDown } from "lucide-react";

ModuleRegistry.registerModules([AllCommunityModule]);

interface PerformanceHeatmapProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any[];
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

const returnColumns = ["1 Day", "1 Week", "1 Month", "3 Months", "6 Months", "1 Year", "3 Years", "5 Years", "RS (20D)"];

export function PerformanceHeatmap({ data }: PerformanceHeatmapProps) {
    const [showCagr, setShowCagr] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

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
                headerName: "Theme / Index",
                field: "Theme/Index",
                pinned: "left",
                width: 200,
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
                width: col === "RS (20D)" ? 130 : 110,
                valueFormatter: returnFormatter,
                cellStyle: getHeatmapStyle,
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

    return (
        <div className="flex flex-col gap-3">
            <div className="flex justify-end pr-2 gap-4 items-center">
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showCagr}
                        onChange={(e) => setShowCagr(e.target.checked)}
                        className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                    Annualize Returns (CAGR)
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
            <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden" style={{ height: Math.min(data.length * 35 + 50, 800) }}>
                <AgGridReact
                    theme={myTheme}
                    rowData={displayData}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    suppressCellFocus={true}
                    animateRows={false}
                    domLayout="normal"
                />
            </div>
        </div>
    );
}
