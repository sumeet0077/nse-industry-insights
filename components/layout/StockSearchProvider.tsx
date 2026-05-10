// components/layout/StockSearchProvider.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { StockSearch } from "./StockSearch";
import { Search, Command } from "lucide-react";

interface ThemeEntry {
    id: string;
    title: string;
    category: string;
}

type StockSearchIndex = Record<string, ThemeEntry[]>;

/**
 * Global stock search provider — renders the modal + handles ⌘K.
 * Place once in the dashboard layout. The modal self-manages its open state
 * via keyboard shortcut, but we also expose trigger buttons for sidebar/topbar.
 */
export function StockSearchProvider({ searchIndex }: { searchIndex: StockSearchIndex }) {
    return <StockSearch searchIndex={searchIndex} />;
}

/**
 * Compact trigger button for the sidebar header.
 * Dispatches a ⌘K keyboard event to open the global search modal.
 */
export function SidebarSearchTrigger() {
    const openSearch = useCallback(() => {
        window.dispatchEvent(new CustomEvent("open-stock-search"));
    }, []);

    return (
        <button
            onClick={openSearch}
            className="flex items-center gap-2 w-full px-3 py-2 bg-[#111118] border border-[#1e1e2e] rounded-lg text-slate-500 hover:text-slate-300 hover:border-[#2a2a3e] transition-colors group"
            title="Search stocks (⌘K)"
        >
            <Search className="h-3.5 w-3.5" />
            <span className="text-xs flex-1 text-left">Search stocks...</span>
            <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#0d0d14] border border-[#2a2a3e] rounded text-[10px] font-mono text-slate-600 group-hover:text-slate-400 transition-colors">
                <Command className="h-2.5 w-2.5" />K
            </kbd>
        </button>
    );
}

/**
 * Trigger button specifically styled for the mobile menu (drawer).
 */
export function DrawerSearchTrigger({ onClick }: { onClick?: () => void }) {
    const openSearch = useCallback(() => {
        if (onClick) onClick();
        window.dispatchEvent(new CustomEvent("open-stock-search"));
    }, [onClick]);

    return (
        <button
            onClick={openSearch}
            className="flex items-center gap-2 w-full px-3 py-2.5 bg-[#111118] border border-[#1e1e2e] rounded-lg text-slate-400 hover:text-slate-200 transition-colors mb-4"
        >
            <Search className="h-4 w-4 text-slate-500" />
            <span className="text-[13px] text-left flex-1 font-medium">Search stock tickers...</span>
        </button>
    );
}

/**
 * Compact trigger for the mobile TopBar — just a search icon.
 */
export function MobileSearchTrigger() {
    const openSearch = useCallback(() => {
        window.dispatchEvent(new CustomEvent("open-stock-search"));
    }, []);

    return (
        <button
            onClick={openSearch}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            aria-label="Search stocks"
            title="Search stocks (⌘K)"
        >
            <Search className="h-5 w-5" />
        </button>
    );
}
