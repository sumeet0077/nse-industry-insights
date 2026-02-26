// components/tables/PerformanceHeatmap.tsx 
"use client";

import { AgGridReact } from "ag-grid-react";
import { useMemo } from "react";
import type { ColDef, ValueFormatterParams, CellClassParams } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import type { PerformanceRow } from "@/types";

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
    const columnDefs = useMemo<ColDef[]>(() => {
        const cols: ColDef[] = [
            {
                headerName: "Theme / Index",
                field: "Theme/Index",
                pinned: "left",
                width: 200,
                cellClass: "text-white font-medium",
            },
        ];
        for (const col of returnColumns) {
            cols.push({
                headerName: col,
                field: col,
                width: 100,
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
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden" style={{ height: Math.min(data.length * 35 + 50, 800) }}>
            <AgGridReact
                theme={myTheme}
                rowData={data}
                columnDefs={columnDefs}
                defaultColDef={defaultColDef}
                suppressCellFocus={true}
                animateRows={false}
                domLayout="normal"
            />
        </div>
    );
}
