"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Copy, Check, ChevronDown, Zap, Star, Layers, ListFilter } from "lucide-react";
import { makeTradingViewSymbol } from "@/lib/utils";

export interface CopyWatchlistButtonProps {
    /**
     * Array of tickers or a function to retrieve the active tickers dynamically 
     * (e.g. from AG Grid's active sort and filter model).
     */
    tickers?: string[];
    getTickers?: () => string[];
    /**
     * Optional set or array of selected tickers (e.g. checked rows).
     */
    selectedTickers?: Set<string> | string[];
    /**
     * Custom label for primary button. Default: "Copy Watchlist"
     */
    label?: string;
    /**
     * Primary action ticker limit. Default: 30
     */
    defaultLimit?: number;
    /**
     * Extra CSS class names for the container.
     */
    className?: string;
}

export function CopyWatchlistButton({
    tickers,
    getTickers,
    selectedTickers,
    label = "Copy Watchlist",
    defaultLimit = 30,
    className = "",
}: CopyWatchlistButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Resolve current tickers array
    const resolveTickers = useCallback((): string[] => {
        let raw: string[] = [];
        if (getTickers) {
            raw = getTickers();
        } else if (tickers) {
            raw = tickers;
        }

        // Deduplicate while preserving order
        const seen = new Set<string>();
        const deduped: string[] = [];
        for (const t of raw) {
            if (t && !seen.has(t)) {
                seen.add(t);
                deduped.push(t);
            }
        }
        return deduped;
    }, [tickers, getTickers]);

    // Resolve selected tickers
    const selectedList = selectedTickers 
        ? Array.from(selectedTickers) 
        : [];

    // Outside click & ESC listener
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen]);

    // Copy helper
    const copyList = useCallback((list: string[], key: string) => {
        if (list.length === 0) return;
        const formatted = list.map(t => makeTradingViewSymbol(t)).join(", ");

        navigator.clipboard.writeText(formatted).then(() => {
            setCopiedKey(key);
            setTimeout(() => {
                setCopiedKey((curr) => (curr === key ? null : curr));
            }, 1800);
        });
    }, []);

    // Primary button action
    const handlePrimaryClick = () => {
        const current = resolveTickers();
        if (selectedList.length > 0) {
            copyList(selectedList, "primary");
            return;
        }

        if (current.length === 0) return;

        // If list exceeds defaultLimit (30), copy the top 30
        const toCopy = current.length > defaultLimit ? current.slice(0, defaultLimit) : current;
        copyList(toCopy, "primary");
    };

    const allTickers = resolveTickers();
    const totalCount = allTickers.length;
    const selectedCount = selectedList.length;

    // Calculate Batches of 30
    const batchSize = 30;
    const batches: { label: string; range: string; list: string[]; id: string }[] = [];
    if (totalCount > batchSize) {
        for (let i = 0; i < totalCount; i += batchSize) {
            const batchNum = Math.floor(i / batchSize) + 1;
            const slice = allTickers.slice(i, i + batchSize);
            const startNum = i + 1;
            const endNum = Math.min(i + batchSize, totalCount);
            batches.push({
                label: `Batch ${batchNum}`,
                range: `${startNum} – ${endNum}`,
                list: slice,
                id: `batch-${batchNum}`,
            });
        }
    }

    const isPrimaryCopied = copiedKey === "primary" || copiedKey === "top30";
    const primaryTitle = selectedCount > 0 
        ? `Copy ${selectedCount} selected tickers to TradingView`
        : totalCount > defaultLimit 
            ? `Copy Top ${defaultLimit} visible tickers to TradingView`
            : `Copy all ${totalCount} tickers to TradingView`;

    const primaryText = selectedCount > 0 
        ? `Copy Selected (${selectedCount})`
        : totalCount > defaultLimit 
            ? `${label} (${defaultLimit})`
            : label;

    return (
        <div className={`relative inline-flex items-stretch shadow-sm ${className}`} ref={containerRef}>
            {/* Split Button: Main Action */}
            <button
                type="button"
                onClick={handlePrimaryClick}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-l-md text-xs font-medium border border-r-0 transition-all duration-200 ${
                    isPrimaryCopied
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                        : "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50 hover:text-blue-300"
                }`}
                title={primaryTitle}
            >
                {isPrimaryCopied ? <Check size={14} className="shrink-0" /> : <Copy size={14} className="shrink-0" />}
                <span>{isPrimaryCopied ? "Watchlist Copied!" : primaryText}</span>
            </button>

            {/* Split Button: Dropdown Toggle */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-center px-1.5 py-1.5 rounded-r-md border text-xs transition-all duration-200 ${
                    isOpen
                        ? "bg-blue-500/25 border-blue-500/60 text-white"
                        : isPrimaryCopied
                            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/30"
                            : "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/50 hover:text-white"
                }`}
                title="Watchlist export presets & batches"
                aria-label="Toggle watchlist export options"
                aria-expanded={isOpen}
            >
                <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Floating Dropdown Popover */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-72 rounded-lg bg-[#111118]/95 backdrop-blur-md border border-[#1e1e2e] shadow-2xl z-50 p-2 text-xs text-slate-300 animate-in fade-in zoom-in-95 duration-100 max-h-[420px] overflow-y-auto custom-scrollbar">
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2 mb-1.5 border-b border-[#1e1e2e]/80 px-1">
                        <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase font-sans">
                            TradingView Export
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 font-mono text-[10px] font-semibold">
                            {totalCount} Symbols
                        </span>
                    </div>

                    {/* Selected Tickers Preset (if applicable) */}
                    {selectedCount > 0 && (
                        <div className="mb-1">
                            <button
                                type="button"
                                onClick={() => copyList(selectedList, "selected")}
                                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-blue-500/15 hover:text-white text-left transition-colors group"
                            >
                                <div className="flex items-center gap-2">
                                    <ListFilter size={13} className="text-blue-400 shrink-0" />
                                    <span className="font-medium text-slate-200 group-hover:text-white">Selected Tickers</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-mono text-slate-400 group-hover:text-slate-300">
                                        {selectedCount}
                                    </span>
                                    {copiedKey === "selected" ? (
                                        <span className="text-emerald-400 font-medium flex items-center gap-0.5 text-[11px]">
                                            <Check size={12} /> Copied!
                                        </span>
                                    ) : (
                                        <span className="text-[10px] text-slate-500 group-hover:text-blue-300 font-mono">Copy</span>
                                    )}
                                </div>
                            </button>
                        </div>
                    )}

                    {/* Quick Presets */}
                    <div className="space-y-0.5">
                        {/* Top 15 */}
                        <button
                            type="button"
                            onClick={() => copyList(allTickers.slice(0, 15), "top15")}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-blue-500/15 hover:text-white text-left transition-colors group"
                        >
                            <div className="flex items-center gap-2">
                                <Zap size={13} className="text-amber-400 shrink-0" />
                                <span className="font-medium text-slate-200 group-hover:text-white">Top 15 Tickers</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono text-slate-400 group-hover:text-slate-300">
                                    1 – {Math.min(15, totalCount)}
                                </span>
                                {copiedKey === "top15" ? (
                                    <span className="text-emerald-400 font-medium flex items-center gap-0.5 text-[11px]">
                                        <Check size={12} /> Copied!
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-slate-500 group-hover:text-blue-300 font-mono">Copy</span>
                                )}
                            </div>
                        </button>

                        {/* Top 30 (TradingView Free Limit) */}
                        <button
                            type="button"
                            onClick={() => copyList(allTickers.slice(0, 30), "top30")}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-blue-500/15 hover:text-white text-left transition-colors group"
                        >
                            <div className="flex items-center gap-2">
                                <Star size={13} className="text-yellow-400 fill-yellow-400/20 shrink-0" />
                                <span className="font-medium text-slate-200 group-hover:text-white">
                                    Top 30 <span className="text-[10px] text-amber-400 font-normal">(TV Free Limit)</span>
                                </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono text-slate-400 group-hover:text-slate-300">
                                    1 – {Math.min(30, totalCount)}
                                </span>
                                {copiedKey === "top30" ? (
                                    <span className="text-emerald-400 font-medium flex items-center gap-0.5 text-[11px]">
                                        <Check size={12} /> Copied!
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-slate-500 group-hover:text-blue-300 font-mono">Copy</span>
                                )}
                            </div>
                        </button>

                        {/* All Tickers */}
                        <button
                            type="button"
                            onClick={() => copyList(allTickers, "all")}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-blue-500/15 hover:text-white text-left transition-colors group"
                        >
                            <div className="flex items-center gap-2">
                                <Copy size={13} className="text-blue-400 shrink-0" />
                                <span className="font-medium text-slate-200 group-hover:text-white">All Tickers</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono text-slate-400 group-hover:text-slate-300">
                                    All {totalCount}
                                </span>
                                {copiedKey === "all" ? (
                                    <span className="text-emerald-400 font-medium flex items-center gap-0.5 text-[11px]">
                                        <Check size={12} /> Copied!
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-slate-500 group-hover:text-blue-300 font-mono">Copy</span>
                                )}
                            </div>
                        </button>
                    </div>

                    {/* Batches for TV Free Section (Sets of 30) */}
                    {batches.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-[#1e1e2e]/80">
                            <div className="flex items-center gap-1.5 px-1 mb-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase font-sans">
                                <Layers size={11} className="text-blue-400 shrink-0" />
                                <span>Batches for TV Free (Sets of 30)</span>
                            </div>
                            <div className="space-y-0.5">
                                {batches.map((batch) => {
                                    const isBatchCopied = copiedKey === batch.id;
                                    return (
                                        <button
                                            key={batch.id}
                                            type="button"
                                            onClick={() => copyList(batch.list, batch.id)}
                                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-left transition-colors group ${
                                                isBatchCopied
                                                    ? "bg-emerald-500/15 text-emerald-300"
                                                    : "hover:bg-blue-500/15 hover:text-white text-slate-300"
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 shrink-0" />
                                                <span className="font-medium">{batch.label}</span>
                                                <span className="text-[10px] text-slate-500 font-mono">
                                                    ({batch.range})
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {isBatchCopied ? (
                                                    <span className="text-emerald-400 font-medium flex items-center gap-0.5 text-[11px]">
                                                        <Check size={12} /> Copied!
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-mono text-slate-500 group-hover:text-blue-300">
                                                        Copy
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
