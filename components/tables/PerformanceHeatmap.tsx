// components/tables/PerformanceHeatmap.tsx 
"use client";

import { AgGridReact } from "ag-grid-react";
import { useMemo, useState } from "react";
import type { ColDef, ValueFormatterParams, CellClassParams } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import type { PerformanceRow } from "@/types";
import { ALL_CONFIGS } from "@/lib/config";

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
    if (params.value === null || params.value === undefined || params.value === "") return undefined;
    const v = Number(params.value);
    if (isNaN(v)) return undefined;

    // Intensity-based coloring
    const intensity = Math.min(Math.abs(v) / 30, 1); // Normalize to 0-30% range
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

    // Apply CAGR logic to the dataset
    const displayData = useMemo(() => {
        if (!showCagr) return data;
        return data.map((row) => {
            const newRow = { ...row };
            if (typeof row["1 Year"] === "number") {
                // 1Y CAGR is same as absolute return, so we leave it identical
            }
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
                // Make RS (20D) wider to prevent ellipsis "RS (2..." sorting issues
                width: col === "RS (20D)" ? 120 : 100,
                valueFormatter: returnFormatter,
                cellStyle: getHeatmapStyle,
                type: "numericColumn",
                sortable: true,
            });
        }
        return cols;
    }, []);

    const defaultColDef = useMemo<ColDef>(
        () => ({
            resizable: false,
            suppressMovable: true,
        }),
        []
    );

    return (
        <div className="flex flex-col gap-3">
            <div className="flex justify-end pr-2">
                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showCagr}
                        onChange={(e) => setShowCagr(e.target.checked)}
                        className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                    Annualize Returns (CAGR)
                </label>
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
