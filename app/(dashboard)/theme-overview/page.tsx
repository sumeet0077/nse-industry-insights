// app/(dashboard)/theme-overview/page.tsx
import type { Metadata } from "next";
import { getAllThemeBreadthData, getPerformanceSummary, getLatestDataDate } from "@/lib/data";
import { ThemeOverviewGrid } from "@/components/charts/ThemeOverviewGrid";

export const metadata: Metadata = {
    title: "Theme Overview | NSE Industry Insights",
    description:
        "At-a-glance view of all custom industry themes — see which sectors are trending and which are lagging.",
};

export default async function ThemeOverviewPage() {
    const themes = getAllThemeBreadthData(252);
    const performanceData = getPerformanceSummary();
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
                <h1 className="text-xl font-bold text-white">Theme Overview</h1>
                {formattedDate && (
                    <span className="text-xs font-medium text-slate-500 mb-1 px-2 py-0.5 bg-slate-800/50 rounded-md border border-slate-700/50">
                        As of {formattedDate}
                    </span>
                )}
            </div>
            <p className="text-sm text-slate-400 mb-6">
                Equal-Weighted Index charts for all custom industry themes — spot trends at a glance
            </p>

            <ThemeOverviewGrid themes={themes} performanceData={performanceData} />
        </div>
    );
}
