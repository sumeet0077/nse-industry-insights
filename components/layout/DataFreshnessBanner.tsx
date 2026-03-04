// components/layout/DataFreshnessBanner.tsx
// Shows the latest data date at the top of the dashboard for quick verification

import { getLatestDataDate } from "@/lib/data";

export function DataFreshnessBanner() {
    // This acts as the global Source of Truth (from Nifty 500)
    const latestDate = getLatestDataDate();

    if (!latestDate) return null;

    // Format the date nicely: "2026-03-04" -> "Wed, 04 Mar 2026"
    const d = new Date(latestDate + "T00:00:00");
    const formatted = d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
    });

    // Check freshness — warn if data is older than 1 calendar day (excluding weekends)
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Stale means the market should have updated by now, but the pipeline hasn't run globally
    const isStale = diffDays > 3;

    return (
        <div
            className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium tracking-wide border-b ${isStale
                    ? "bg-amber-500/8 border-amber-500/20 text-amber-400"
                    : "bg-emerald-500/8 border-emerald-500/15 text-emerald-400"
                }`}
        >
            <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${isStale ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
                    }`}
            />
            <span className="text-slate-400">Data completely synced. Market Date:</span>
            <span className="font-semibold">{formatted}</span>
            {isStale && (
                <span className="text-amber-500/70 ml-1">
                    ({diffDays}d ago — waiting for market updates to finish)
                </span>
            )}
        </div>
    );
}
