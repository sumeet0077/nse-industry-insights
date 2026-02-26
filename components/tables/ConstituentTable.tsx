// components/tables/ConstituentTable.tsx
"use client";

import { AgGridReact } from "ag-grid-react";
import { useMemo, useState, useCallback } from "react";
import type { ColDef, ValueFormatterParams, CellClassParams } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { makeTradingViewUrl } from "@/lib/utils";

ModuleRegistry.registerModules([AllCommunityModule]);

interface ConstituentRow {
    ticker: string;
    [key: string]: number | string | null | undefined;
}

interface ConstituentTableProps {
    data: ConstituentRow[];
    showCagr?: boolean;
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
    const columnDefs = useMemo<ColDef[]>(() => {
        const cols: ColDef[] = [
            {
                headerName: "Ticker",
                field: "ticker",
                pinned: "left",
                width: 140,
                cellRenderer: (params: { value: string }) => {
                    const url = makeTradingViewUrl(params.value);
                    return `<a href="${url}" target="_blank" rel="noopener" class="text-blue-400 hover:text-blue-300 underline">${params.value.replace(".NS", "").replace(".BO", "")}</a>`;
                },
            },
        ];
        for (const col of returnCols) {
            cols.push({
                headerName: col,
                field: col,
                width: 90,
                valueFormatter: returnFormatter,
                cellClass: returnCellClass,
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
        <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden" style={{ height: 500 }}>
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
