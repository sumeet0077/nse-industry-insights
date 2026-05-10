// components/common/CategoryFilter.tsx
"use client";

interface CategoryFilterProps {
    showBroadMarket: boolean;
    showSectors: boolean;
    showIndustries: boolean;
    onToggleBroadMarket: () => void;
    onToggleSectors: () => void;
    onToggleIndustries: () => void;
}

export function CategoryFilter({
    showBroadMarket,
    showSectors,
    showIndustries,
    onToggleBroadMarket,
    onToggleSectors,
    onToggleIndustries,
}: CategoryFilterProps) {
    return (
        <div className="flex flex-wrap gap-2">
            <button
                onClick={onToggleBroadMarket}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    showBroadMarket
                        ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                        : "bg-transparent text-slate-500 border-[#1e1e2e] hover:border-slate-600"
                }`}
            >
                Broad Market
            </button>
            <button
                onClick={onToggleSectors}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    showSectors
                        ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                        : "bg-transparent text-slate-500 border-[#1e1e2e] hover:border-slate-600"
                }`}
            >
                Sectoral Indices
            </button>
            <button
                onClick={onToggleIndustries}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    showIndustries
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-transparent text-slate-500 border-[#1e1e2e] hover:border-slate-600"
                }`}
            >
                Industries
            </button>
        </div>
    );
}

/**
 * Given a theme/index title, resolve its category by looking it up in ALL_CONFIGS.
 * Returns "broad-market", "sectors", or "industries".
 */
export function getCategoryForTitle(title: string, configs: { title: string; category: string }[]): string {
    const lowerTitle = title.toLowerCase();
    const match = configs.find((c) => c.title.toLowerCase() === lowerTitle);
    return match?.category || "industries";
}
