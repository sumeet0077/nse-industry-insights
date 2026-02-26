// app/(dashboard)/performance/page.tsx
import type { Metadata } from "next";
import { getPerformanceSummary } from "@/lib/data";
import type { PerformanceRow } from "@/types";

export const metadata: Metadata = {
    title: "Performance Overview",
    description: "Comparative returns heatmap for all NSE sectors, indices and industry themes.",
};

export default async function PerformancePage() {
    const data: PerformanceRow[] = getPerformanceSummary();

    return (
        <div>
            <h1 className="text-xl font-bold text-white mb-1">Market Performance Heatmap</h1>
            <p className="text-sm text-slate-400 mb-6">
                Comparative returns of all sectors and themes based on Equal-Weighted Index
            </p>

            {data.length === 0 ? (
                <div className="text-slate-500 text-sm">
                    Performance data unavailable. Please check back after the next data refresh.
                </div>
            ) : (
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-2 text-slate-300 text-sm">
                    {/* Phase 2: PerformanceHeatmap AG Grid component goes here */}
                    <p className="p-4 text-slate-500">
                        AG Grid performance heatmap coming in Phase 2 — {data.length} rows loaded ✓
                    </p>
                    <pre className="text-xs text-slate-600 px-4 pb-4 overflow-auto max-h-40">
                        {JSON.stringify(data.slice(0, 3), null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
