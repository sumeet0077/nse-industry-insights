// components/layout/TopBar.tsx
"use client";

import { Menu, X, Search, BarChart3, LayoutGrid, TrendingUp, Factory } from "lucide-react";
import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BROAD_MARKET, SECTORS, INDUSTRIES } from "@/lib/config";

// Pre-sorted A-Z at module load
const INDUSTRIES_AZ = [...INDUSTRIES].sort((a, b) => a.title.localeCompare(b.title));

type GroupKey = "Overview" | "Broad Market" | "Sectoral Indices" | "Industries";

const GROUP_ICONS: Record<GroupKey, React.ElementType> = {
    "Overview": LayoutGrid,
    "Broad Market": BarChart3,
    "Sectoral Indices": TrendingUp,
    "Industries": Factory,
};

export function TopBar() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [sortDesc, setSortDesc] = useState(false);
    const [expandedGroup, setExpandedGroup] = useState<GroupKey | null>("Overview");
    const pathname = usePathname();

    const filteredIndustries = useMemo(() => {
        const base = sortDesc ? [...INDUSTRIES_AZ].reverse() : INDUSTRIES_AZ;
        const q = query.trim().toLowerCase();
        return q ? base.filter((c) => c.title.toLowerCase().includes(q)) : base;
    }, [query, sortDesc]);

    const groups: { label: GroupKey; items: { label: string; href: string }[] }[] = [
        {
            label: "Overview",
            items: [
                { label: "Performance Overview", href: "/performance" },
                { label: "Sector Rotation", href: "/sector-rotation" },
            ],
        },
        {
            label: "Broad Market",
            items: BROAD_MARKET.map((c) => ({ label: c.title, href: `/broad-market/${c.id}` })),
        },
        {
            label: "Sectoral Indices",
            items: SECTORS.map((c) => ({ label: c.title, href: `/sectors/${c.id}` })),
        },
    ];

    const close = () => {
        setOpen(false);
        setQuery("");
    };

    return (
        <>
            {/* Mobile sticky header */}
            <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#0d0d14] border-b border-[#1e1e2e] sticky top-0 z-30">
                <Link href="/performance" className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-blue-400" />
                    <span className="font-bold text-sm text-white">NSE Industry Insights</span>
                </Link>
                <button
                    onClick={() => setOpen(true)}
                    className="p-2 text-slate-400 hover:text-white"
                    aria-label="Open navigation"
                >
                    <Menu className="h-5 w-5" />
                </button>
            </header>

            {/* Backdrop overlay */}
            {open && (
                <div
                    className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
                    onClick={close}
                />
            )}

            {/* Slide-in drawer */}
            <nav
                className={cn(
                    "lg:hidden fixed left-0 top-0 h-full w-[280px] bg-[#0d0d14] border-r border-[#1e1e2e] z-50 flex flex-col transition-transform duration-300 ease-in-out",
                    open ? "translate-x-0" : "-translate-x-full"
                )}
            >
                {/* Drawer header */}
                <div className="flex items-center justify-between px-4 py-4 border-b border-[#1e1e2e] shrink-0">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-blue-400" />
                        <span className="font-bold text-sm text-white">NSE Industry Insights</span>
                    </div>
                    <button
                        onClick={close}
                        className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-white/5 transition-colors"
                        aria-label="Close navigation"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Scrollable nav content */}
                <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">

                    {/* Overview, Broad Market, Sectoral Indices — collapsible sections */}
                    {groups.map((group) => {
                        const Icon = GROUP_ICONS[group.label];
                        const isExpanded = expandedGroup === group.label;
                        return (
                            <div key={group.label}>
                                <button
                                    type="button"
                                    onClick={() => setExpandedGroup(isExpanded ? null : group.label)}
                                    className="w-full flex items-center gap-2 px-2 py-2 rounded-md hover:bg-white/5 transition-colors"
                                >
                                    <Icon className="h-3.5 w-3.5 text-slate-500" />
                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 flex-1 text-left">
                                        {group.label}
                                    </span>
                                    <span className="text-slate-600 text-[10px]">{isExpanded ? "▲" : "▼"}</span>
                                </button>
                                {isExpanded && (
                                    <ul className="mt-0.5 ml-1 space-y-0.5">
                                        {group.items.map((item) => (
                                            <li key={item.href}>
                                                <Link
                                                    href={item.href}
                                                    onClick={close}
                                                    className={cn(
                                                        "block px-3 py-2 rounded-md text-[13px] transition-colors",
                                                        pathname === item.href
                                                            ? "bg-blue-500/10 text-blue-400 font-medium"
                                                            : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                                                    )}
                                                >
                                                    {item.label}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        );
                    })}

                    {/* Industries — always expanded with search */}
                    <div>
                        <div className="flex items-center gap-2 px-2 py-2">
                            <Factory className="h-3.5 w-3.5 text-slate-500" />
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 flex-1">
                                Industries
                            </span>
                            <button
                                type="button"
                                onClick={() => setSortDesc((p) => !p)}
                                className={cn(
                                    "text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors",
                                    sortDesc
                                        ? "bg-slate-700/50 text-slate-300 border-slate-600"
                                        : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                                )}
                            >
                                {sortDesc ? "Z–A" : "A–Z"}
                            </button>
                        </div>

                        {/* Search box */}
                        <div className="relative mb-1.5 px-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Search industries..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="w-full bg-[#1a1a2e] border border-slate-700/60 rounded-md pl-7 pr-3 py-1.5 text-[12px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                            />
                        </div>

                        <ul className="space-y-0.5">
                            {filteredIndustries.length === 0 ? (
                                <li className="px-3 py-2 text-[12px] text-slate-600 italic">
                                    No results for &ldquo;{query}&rdquo;
                                </li>
                            ) : (
                                filteredIndustries.map((c) => (
                                    <li key={c.id}>
                                        <Link
                                            href={`/industries/${c.id}`}
                                            onClick={close}
                                            className={cn(
                                                "block px-3 py-2 rounded-md text-[13px] transition-colors",
                                                pathname === `/industries/${c.id}`
                                                    ? "bg-blue-500/10 text-blue-400 font-medium"
                                                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                                            )}
                                        >
                                            {c.title}
                                        </Link>
                                    </li>
                                ))
                            )}
                        </ul>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-[#1e1e2e] shrink-0">
                    <p className="text-[11px] text-slate-500 text-center">
                        Data updates daily at 6:30 PM IST
                    </p>
                </div>
            </nav>
        </>
    );
}
