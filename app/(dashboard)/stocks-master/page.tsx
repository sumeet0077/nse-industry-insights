import type { Metadata } from "next";
import { ALL_CONFIGS } from "@/lib/config";
import { getPerformanceSummary, getMarketStatus, getConstituentPerformance, getLatestDataDate } from "@/lib/data";
import { StocksMasterClient } from "@/components/StocksMasterClient";

export const metadata: Metadata = {
    title: "Stocks Master | NSE Industry Insights",
    description: "Grouped view of stocks across multiple selected sectors and themes.",
};

export default async function StocksMasterPage() {
    const performanceData = getPerformanceSummary();
    const marketStatus = getMarketStatus();
    const constituentPerformance = getConstituentPerformance();
    const latestDate = getLatestDataDate();

    let formattedDate = "";
    if (latestDate) {
        const d = new Date(latestDate + "T00:00:00");
        formattedDate = d.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    }

    return (
        <div>
            <div className="flex items-end gap-3 mb-1">
                <h1 className="text-xl font-bold text-white">Stocks Master</h1>
                {formattedDate && (
                    <span className="text-xs font-medium text-slate-500 mb-1 px-2 py-0.5 bg-slate-800/50 rounded-md border border-slate-700/50">
                        As of {formattedDate}
                    </span>
                )}
            </div>
            <p className="text-sm text-slate-400 mb-6">
                Select multiple sectors or themes to view their constituents. Sort groups and stocks to find the top gainers from the top performing sectors.
            </p>

            <StocksMasterClient 
                allConfigs={ALL_CONFIGS}
                performanceData={performanceData}
                marketStatus={marketStatus}
                constituentPerformance={constituentPerformance}
            />
        </div>
    );
}
