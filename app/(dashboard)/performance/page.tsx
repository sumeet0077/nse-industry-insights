// app/(dashboard)/performance/page.tsx
import type { Metadata } from "next";
import { getPerformanceSummary } from "@/lib/data";
import { PerformanceHeatmap } from "@/components/tables/PerformanceHeatmap";

export const metadata: Metadata = {
    title: "Performance Overview",
    description: "Comparative returns heatmap for all NSE sectors, indices and industry themes.",
};

export default async function PerformancePage() {
    const data = getPerformanceSummary();

    return (
        <div>
            <h1 className="text-xl font-bold text-white mb-1">Market Performance Heatmap</h1>
            <p className="text-sm text-slate-400 mb-6">
                Comparative returns of all sectors and themes based on Equal-Weighted Index
            </p>

            {data.length === 0 ? (
                <div className="bg-[#111118] border border-[#1e1e2e] rounded-lg p-8 text-center">
                    <p className="text-slate-400 text-sm mb-2">Performance data is computed on the OCI server.</p>
                    <p className="text-slate-500 text-xs">
                        Run <code className="text-blue-400">fetch_breadth_data.py</code> on OCI to generate the performance summary,
                        then export with <code className="text-blue-400">export_json.py</code>.
                    </p>
                </div>
            ) : (
                <PerformanceHeatmap data={data} />
            )}
        </div>
    );
}
