// components/layout/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BROAD_MARKET, SECTORS, INDUSTRIES } from "@/lib/config";
import {
    BarChart3,
    TrendingUp,
    Building2,
    Factory,
    LayoutGrid,
} from "lucide-react";

const NAV_GROUPS = [
    {
        label: "Overview",
        icon: LayoutGrid,
        items: [
            { label: "Performance", href: "/performance" },
            { label: "Sector Rotation", href: "/sector-rotation" }
        ],
    },
    {
        label: "Broad Market",
        icon: BarChart3,
        items: BROAD_MARKET.map((c) => ({
            label: c.title,
            href: `/broad-market/${c.id}`,
        })),
    },
    {
        label: "Sectoral Indices",
        icon: TrendingUp,
        items: SECTORS.map((c) => ({
            label: c.title,
            href: `/sectors/${c.id}`,
        })),
    },
    {
        label: "Industries",
        icon: Factory,
        items: INDUSTRIES.map((c) => ({
            label: c.title,
            href: `/industries/${c.id}`,
        })),
    },
];

export function Sidebar() {
    const pathname = usePathname();
    const [sortIndustries, setSortIndustries] = useState(false);

    const navGroups = NAV_GROUPS.map(group => {
        if (group.label === "Industries" && sortIndustries) {
            return {
                ...group,
                items: [...group.items].sort((a, b) => a.label.localeCompare(b.label))
            };
        }
        return group;
    });

    return (
        <aside className="hidden lg:flex flex-col w-60 min-h-screen bg-[#0d0d14] border-r border-[#1e1e2e] overflow-y-auto">
            {/* Logo */}
            <div className="px-4 py-5 border-b border-[#1e1e2e]">
                <Link href="/performance" className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-blue-400" />
                    <span className="font-bold text-sm text-white">NSE Industry Insights</span>
                </Link>
            </div>

            {/* Nav groups */}
            <nav className="flex-1 px-2 py-4 space-y-6">
                {navGroups.map((group) => (
                    <div key={group.label}>
                        <div className="flex items-center justify-between px-2 mb-2">
                            <div className="flex items-center gap-2">
                                <group.icon className="h-3.5 w-3.5 text-slate-500" />
                                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                                    {group.label}
                                </span>
                            </div>
                            {group.label === "Industries" && (
                                <button
                                    onClick={() => setSortIndustries(!sortIndustries)}
                                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors ${sortIndustries ? "bg-blue-500/20 text-blue-400 border-blue-500/30" : "bg-transparent text-slate-500 border-slate-700 hover:text-slate-300"}`}
                                    title="Toggle A-Z Sort"
                                >
                                    A-Z
                                </button>
                            )}
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
            </nav>

            {/* Data freshness indicator */}
            <div className="p-3 border-t border-[#1e1e2e]">
                <p className="text-[11px] text-slate-500 text-center">
                    Data updates daily at 6:30 PM IST
                </p>
            </div>
        </aside>
    );
}
