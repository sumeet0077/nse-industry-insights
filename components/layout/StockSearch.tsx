// components/layout/StockSearch.tsx
"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, ArrowRight, Command } from "lucide-react";

interface ThemeEntry {
    id: string;
    title: string;
    category: string;
}

type StockSearchIndex = Record<string, ThemeEntry[]>;

interface StockSearchProps {
    searchIndex: StockSearchIndex;
}

export function StockSearch({ searchIndex }: StockSearchProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    // All tickers sorted alphabetically (pre-computed once)
    const allTickers = useMemo(() => Object.keys(searchIndex).sort(), [searchIndex]);

    // Filtered results
    const results = useMemo(() => {
        const q = query.trim().toUpperCase();
        if (!q) return [];
        return allTickers
            .filter((ticker) => ticker.includes(q))
            .sort((a, b) => {
                // Prioritize starts-with matches
                const aStarts = a.startsWith(q);
                const bStarts = b.startsWith(q);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;
                return a.localeCompare(b);
            })
            .slice(0, 20); // Cap at 20 results for performance
    }, [query, allTickers]);

    // Reset highlight when results change
    useEffect(() => {
        setHighlightedIndex(0);
    }, [results]);

    // Keyboard shortcut: ⌘K / Ctrl+K + Custom Event Listener
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === "Escape") {
                setIsOpen(false);
            }
        };

        const handleOpenSearch = () => setIsOpen(true);

        document.addEventListener("keydown", handleKeyDown);
        window.addEventListener("open-stock-search", handleOpenSearch);
        
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("open-stock-search", handleOpenSearch);
        };
    }, []);

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
        } else {
            setQuery("");
            setHighlightedIndex(0);
        }
    }, [isOpen]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (listRef.current) {
            const highlighted = listRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
            highlighted?.scrollIntoView({ block: "nearest" });
        }
    }, [highlightedIndex]);

    const navigateToTheme = useCallback(
        (entry: ThemeEntry) => {
            router.push(`/${entry.category}/${entry.id}`);
            setIsOpen(false);
        },
        [router]
    );

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((prev) => Math.min(prev + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Enter" && results.length > 0) {
            e.preventDefault();
            const ticker = results[highlightedIndex];
            const themes = searchIndex[ticker];
            if (themes && themes.length > 0) {
                // Navigate to the first non-broad-market theme, or fallback to first
                const industry = themes.find((t) => t.category === "industries");
                const sector = themes.find((t) => t.category === "sectors");
                navigateToTheme(industry || sector || themes[0]);
            }
        }
    };

    const categoryColor = (cat: string) => {
        switch (cat) {
            case "broad-market":
                return "bg-blue-500/15 text-blue-400 border-blue-500/25";
            case "sectors":
                return "bg-purple-500/15 text-purple-400 border-purple-500/25";
            case "industries":
                return "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";
            default:
                return "bg-slate-500/15 text-slate-400 border-slate-500/25";
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-[101] flex items-start justify-center pt-[15vh] px-4">
                <div className="w-full max-w-lg bg-[#0d0d14] border border-[#2a2a3e] rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
                    {/* Search Input */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e1e2e]">
                        <Search className="h-4 w-4 text-slate-500 shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search stock tickers (e.g. ASIANPAINT, TCS, RELIANCE)..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none"
                            autoComplete="off"
                            spellCheck={false}
                        />
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-1 rounded-md hover:bg-[#1e1e2e] text-slate-500 hover:text-slate-300 transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Results */}
                    <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-[#2a2a3e] scrollbar-track-transparent">
                        {query.trim() === "" ? (
                            <div className="px-4 py-8 text-center">
                                <p className="text-sm text-slate-500">
                                    Type a stock ticker to find which sectors & themes it belongs to
                                </p>
                                <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-600">
                                    <kbd className="px-1.5 py-0.5 bg-[#1e1e2e] border border-[#2a2a3e] rounded text-slate-400 font-mono">⌘K</kbd>
                                    <span>to open</span>
                                    <span className="mx-1">·</span>
                                    <kbd className="px-1.5 py-0.5 bg-[#1e1e2e] border border-[#2a2a3e] rounded text-slate-400 font-mono">↑↓</kbd>
                                    <span>to navigate</span>
                                    <span className="mx-1">·</span>
                                    <kbd className="px-1.5 py-0.5 bg-[#1e1e2e] border border-[#2a2a3e] rounded text-slate-400 font-mono">↵</kbd>
                                    <span>to go</span>
                                </div>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="px-4 py-8 text-center">
                                <p className="text-sm text-slate-500">
                                    No stocks found for &ldquo;{query}&rdquo;
                                </p>
                            </div>
                        ) : (
                            results.map((ticker, idx) => {
                                const themes = searchIndex[ticker];
                                const isHighlighted = idx === highlightedIndex;
                                return (
                                    <div
                                        key={ticker}
                                        data-index={idx}
                                        className={`px-4 py-2.5 transition-colors cursor-pointer ${
                                            isHighlighted
                                                ? "bg-blue-500/10"
                                                : "hover:bg-[#111118]"
                                        }`}
                                        onMouseEnter={() => setHighlightedIndex(idx)}
                                        onClick={() => {
                                            const industry = themes.find((t) => t.category === "industries");
                                            const sector = themes.find((t) => t.category === "sectors");
                                            navigateToTheme(industry || sector || themes[0]);
                                        }}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-semibold text-slate-200">
                                                    {ticker}
                                                </span>
                                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                    {themes.map((theme) => (
                                                        <button
                                                            key={theme.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigateToTheme(theme);
                                                            }}
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border transition-all hover:brightness-125 ${categoryColor(
                                                                theme.category
                                                            )}`}
                                                        >
                                                            {theme.title}
                                                            <ArrowRight className="h-2.5 w-2.5 opacity-60" />
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            {isHighlighted && (
                                                <kbd className="shrink-0 px-1.5 py-0.5 bg-[#1e1e2e] border border-[#2a2a3e] rounded text-[10px] text-slate-500 font-mono">
                                                    ↵
                                                </kbd>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Footer hint */}
                    {results.length > 0 && (
                        <div className="px-4 py-2 border-t border-[#1e1e2e] flex items-center justify-between text-[10px] text-slate-600">
                            <span>{results.length} result{results.length !== 1 ? "s" : ""}</span>
                            <span>Click a theme pill to navigate directly</span>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

// Trigger button for use in Sidebar/TopBar
export function StockSearchTrigger({ onClick }: { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-2 w-full px-3 py-2 bg-[#111118] border border-[#1e1e2e] rounded-lg text-slate-500 hover:text-slate-300 hover:border-[#2a2a3e] transition-colors group"
        >
            <Search className="h-3.5 w-3.5" />
            <span className="text-xs flex-1 text-left">Search stocks...</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#0d0d14] border border-[#2a2a3e] rounded text-[10px] font-mono text-slate-600 group-hover:text-slate-400 transition-colors">
                <Command className="h-2.5 w-2.5" />K
            </kbd>
        </button>
    );
}
