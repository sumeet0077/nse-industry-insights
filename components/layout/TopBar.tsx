// components/layout/TopBar.tsx
"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BROAD_MARKET, SECTORS, INDUSTRIES } from "@/lib/config";
import { BarChart3 } from "lucide-react";

export function TopBar() {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();

    const allItems = [
        { label: "Performance Overview", href: "/performance", group: "Overview" },
        ...BROAD_MARKET.map((c) => ({ label: c.title, href: `/broad-market/${c.id}`, group: "Broad Market" })),
        ...SECTORS.map((c) => ({ label: c.title, href: `/sectors/${c.id}`, group: "Sectoral Indices" })),
        ...INDUSTRIES.map((c) => ({ label: c.title, href: `/industries/${c.id}`, group: "Industries" })),
    ];

    return (
        <>
            {/* Mobile header */}
            <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#0d0d14] border-b border-[#1e1e2e] sticky top-0 z-30">
                <Link href="/performance" className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-blue-400" />
                    <span className="font-bold text-sm text-white">NSE Industry Insights</span>
                </Link>
                <button
                    onClick={() => setOpen(!open)}
                    className="p-2 text-slate-400 hover:text-white"
                    aria-label="Open navigation"
                >
                    <Menu className="h-5 w-5" />
                </button>
            </header>

            {/* Mobile nav drawer */}
            {open && (
                <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setOpen(false)}>
                    <nav
                        className="absolute left-0 top-0 h-full w-72 bg-[#0d0d14] border-r border-[#1e1e2e] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-5 border-b border-[#1e1e2e]">
                            <span className="font-bold text-sm text-white">NSE Industry Insights</span>
                        </div>
                        <ul className="py-4 space-y-0.5 px-2">
                            {allItems.map((item) => (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        onClick={() => setOpen(false)}
                                        className={cn(
                                            "block px-3 py-2 rounded-md text-sm transition-colors",
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
                    </nav>
                </div>
            )}
        </>
    );
}
