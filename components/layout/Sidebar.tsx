// components/layout/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { BROAD_MARKET, SECTORS, INDUSTRIES } from "@/lib/config";
import {
    BarChart3,
    TrendingUp,
    Factory,
    LayoutGrid,
    Search,
    X,
} from "lucide-react";

// Industries pre-sorted A-Z at module load time (zero runtime cost)
const INDUSTRIES_AZ = [...INDUSTRIES].sort((a, b) =>
    a.title.localeCompare(b.title)
);

const STATIC_GROUPS = [
    {
        label: "Overview",
        icon: LayoutGrid,
        items: [
            { label: "Performance", href: "/performance" },
            { label: "Sector Rotation", href: "/sector-rotation" },
        ],
    },
    {
        label: "Broad Market",
        icon: BarChart3,
        items: BROAD_MARKET.map((c) => ({ label: c.title, href: `/broad-market/${c.id}` })),
    },
    {
        label: "Sectoral Indices",
        icon: TrendingUp,
        items: SECTORS.map((c) => ({ label: c.title, href: `/sectors/${c.id}` })),
    },
];

export function Sidebar() {
    const pathname = usePathname();
    const [query, setQuery] = useState("");
    const [sortDesc, setSortDesc] = useState(false);

    const filteredIndustries = useMemo(() => {
        const q = query.trim().toLowerCase();
        const base = sortDesc
            ? [...INDUSTRIES_AZ].reverse()
            : INDUSTRIES_AZ;
        if (!q) return base;
        return base.filter((c) => c.title.toLowerCase().includes(q));
    }, [query, sortDesc]);

    return (
        <aside className="hidden lg:flex flex-col w-60 min-h-screen bg-[#0d0d14] border-r border-[#1e1e2e] overflow-y-auto">
            {/* Logo */}
            <div className="px-4 py-5 border-b border-[#1e1e2e]">
                <Link href="/performance" className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-blue-400" />
                    <span className="font-bold text-sm text-white">NSE Industry Insights</span>
                </Link>
            </div>

            <nav className="flex-1 px-2 py-4 space-y-6">
                {/* Overview, Broad Market, Sectoral Indices */}
                {STATIC_GROUPS.map((group) => (
                    <div key={group.label}>
                        <div className="flex items-center gap-2 px-2 mb-2">
                            <group.icon className="h-3.5 w-3.5 text-slate-500" />
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                                {group.label}
                            </span>
                        </div>
                        <ul className="space-y-0.5">
                            {group.items.map((item) => (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className={cn(
                                            "block px-3 py-1.5 rounded-md text-[13px] transition-colors",
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
                    </div>
                ))}

                {/* Industries — with search + sort toggle */}
                <div>
                    <div className="flex items-center gap-2 px-2 mb-2">
                        <Factory className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                            Industries
                        </span>
                        <button
                            type="button"
                            onClick={() => setSortDesc((prev) => !prev)}
                            className={cn(
                                "ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors",
                                sortDesc
                                    ? "bg-slate-700/50 text-slate-300 border-slate-600"
                                    : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                            )}
                            title="Toggle sort order"
                        >
                            {sortDesc ? "Z–A" : "A–Z"}
                        </button>
                    </div>

                    {/* Search */}
                    <div className="relative mb-2 px-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-500 pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="w-full bg-[#1a1a2e] border border-slate-700/60 rounded-md pl-7 pr-7 py-1.5 text-[12px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
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
                                        className={cn(
                                            "block px-3 py-1.5 rounded-md text-[13px] transition-colors",
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
            </nav>

            <div className="p-3 border-t border-[#1e1e2e]">
                <p className="text-[11px] text-slate-500 text-center">
                    Data updates daily at 6:30 PM IST
                </p>
            </div>
        </aside>
    );
}
