// components/watchlist/WatchlistOverlapMatrix.tsx
"use client";

import { useState, useMemo, useCallback } from "react";
import type { Watchlist } from "@/hooks/useWatchlists";
import type { StockSearchIndex } from "@/lib/data";
import type { ConstituentPerformanceMap } from "@/types";
import { cleanTicker, normalizeTickerSymbol, makeTradingViewUrl } from "@/lib/utils";
import {
    GitMerge,
    Check,
    Copy,
    Save,
    Layers,
    Table as TableIcon,
    Search,
    ExternalLink,
    Filter,
    Sliders,
    Sparkles,
    CheckSquare,
    Square,
    ArrowUpDown,
} from "lucide-react";

interface WatchlistOverlapMatrixProps {
    watchlists: Watchlist[];
    stockSearchIndex?: StockSearchIndex;
    constituentPerformanceMap?: ConstituentPerformanceMap | null;
    onOpenInRRG?: (tickers: string[], suggestedName?: string) => void;
    onOpenInTable?: (tickers: string[], suggestedName?: string) => void;
    onSaveAsWatchlist?: (name: string, tickers: string[], folder?: string) => void;
}

type MatrixSortField = "count" | "ticker" | "theme";
type MatrixSortOrder = "asc" | "desc";

function copyToClipboard(text: string): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard
            .writeText(text)
            .then(() => true)
            .catch(() => fallbackCopy(text));
    }
    return Promise.resolve(fallbackCopy(text));
}

function fallbackCopy(text: string): boolean {
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand("copy");
        document.body.removeChild(textarea);
        return successful;
    } catch {
        return false;
    }
}

export function WatchlistOverlapMatrix({
    watchlists,
    stockSearchIndex = {},
    constituentPerformanceMap,
    onOpenInRRG,
    onOpenInTable,
    onSaveAsWatchlist,
}: WatchlistOverlapMatrixProps) {
    // Select default 2 or 3 watchlists initially
    const initialSelectedIds = useMemo(() => {
        const ids = watchlists.slice(0, 3).map((w) => w.id);
        return new Set(ids);
    }, [watchlists]);

    const [selectedWlIds, setSelectedWlIds] = useState<Set<string>>(initialSelectedIds);
    const [minOverlap, setMinOverlap] = useState<number>(2);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [sortField, setSortField] = useState<MatrixSortField>("count");
    const [sortOrder, setSortOrder] = useState<MatrixSortOrder>("desc");
    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
    const [saveListName, setSaveListName] = useState<string>("");

    // Active selected watchlist objects
    const selectedWatchlists = useMemo(() => {
        return watchlists.filter((w) => selectedWlIds.has(w.id));
    }, [watchlists, selectedWlIds]);

    // Clamp effective minimum overlap to selected watchlists count
    const effectiveMinOverlap = useMemo(() => {
        const count = selectedWatchlists.length;
        if (count <= 1) return 1;
        return Math.max(1, Math.min(minOverlap, count));
    }, [selectedWatchlists.length, minOverlap]);

    const handleSort = (field: MatrixSortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
        } else {
            setSortField(field);
            setSortOrder("desc");
        }
    };

    // Quick select presets
    const selectAllWithCondition = (cond: (w: Watchlist) => boolean) => {
        const matching = watchlists.filter(cond).map((w) => w.id);
        setSelectedWlIds(new Set(matching));
    };

    const toggleWatchlistSelection = (id: string) => {
        setSelectedWlIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Helper to get theme for symbol
    const getStockTheme = useCallback(
        (cleanSym: string): string => {
            const entries = stockSearchIndex[cleanSym];
            if (!entries || entries.length === 0) return "—";
            const ind = entries.find((e) => e.category === "industries");
            return ind ? ind.title : entries[0]?.title || "—";
        },
        [stockSearchIndex]
    );

    // Matrix calculations
    const matrixData = useMemo(() => {
        if (selectedWatchlists.length < 2) return [];

        // Build sets of clean tickers per selected watchlist
        const wlTickerSets = selectedWatchlists.map((wl) => ({
            id: wl.id,
            name: wl.name,
            set: new Set(wl.tickers.map((t) => cleanTicker(t).toUpperCase())),
        }));

        // Collect union of all tickers
        const allCleanTickers = new Set<string>();
        for (const item of wlTickerSets) {
            for (const t of item.set) {
                if (t) allCleanTickers.add(t);
            }
        }

        const rows = [];
        for (const clean of allCleanTickers) {
            const presence = wlTickerSets.map((item) => item.set.has(clean));
            const count = presence.filter(Boolean).length;
            const pct = Math.round((count / selectedWatchlists.length) * 100);

            rows.push({
                clean,
                symbol: `${clean}.NS`,
                theme: getStockTheme(clean),
                count,
                percentage: pct,
                presence,
            });
        }

        // Filter by effectiveMinOverlap
        const filtered = rows.filter((r) => r.count >= effectiveMinOverlap);

        // Filter by searchQuery
        const searched = searchQuery.trim()
            ? filtered.filter((r) => {
                  const q = searchQuery.trim().toLowerCase();
                  return (
                      r.clean.toLowerCase().includes(q) ||
                      r.theme.toLowerCase().includes(q)
                  );
              })
            : filtered;

        // Sort based on sortField
        searched.sort((a, b) => {
            if (sortField === "count") {
                if (b.count !== a.count) {
                    return sortOrder === "desc" ? b.count - a.count : a.count - b.count;
                }
                return a.clean.localeCompare(b.clean);
            } else if (sortField === "ticker") {
                const cmp = a.clean.localeCompare(b.clean);
                return sortOrder === "desc" ? -cmp : cmp;
            } else if (sortField === "theme") {
                const cmp = a.theme.localeCompare(b.theme);
                return sortOrder === "desc" ? -cmp : cmp;
            }
            return 0;
        });

        return searched;
    }, [selectedWatchlists, effectiveMinOverlap, searchQuery, getStockTheme, sortField, sortOrder]);

    // Handlers
    const repeatersTickers = useMemo(() => {
        return matrixData.map((r) => r.symbol);
    }, [matrixData]);

    const handleCopyRepeaters = () => {
        if (repeatersTickers.length === 0) return;
        const tvFormatted = repeatersTickers
            .map((t) => `NSE:${cleanTicker(t).replace(/[&\-\s]/g, "_")}`)
            .join(", ");

        copyToClipboard(tvFormatted).then((success) => {
            if (success) {
                setCopyFeedback(`Copied ${repeatersTickers.length} overlapping tickers!`);
                setTimeout(() => setCopyFeedback(null), 3000);
            }
        });
    };

    const handleSaveRepeatersModal = () => {
        const defaultName = `Overlaps (${selectedWatchlists.length} lists, ≥${effectiveMinOverlap}x)`;
        setSaveListName(defaultName);
        setIsSaveModalOpen(true);
    };

    const confirmSaveWatchlist = () => {
        if (onSaveAsWatchlist && repeatersTickers.length > 0) {
            onSaveAsWatchlist(saveListName || "Overlapping Repeaters", repeatersTickers, "52W Scans");
        }
        setIsSaveModalOpen(false);
    };

    return (
        <div className="space-y-4">
            {/* Header & Watchlist Selector Grid */}
            <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-4 shadow-xl backdrop-blur-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-sm font-bold text-gray-100 flex items-center gap-2">
                            <GitMerge className="w-4 h-4 text-purple-400" />
                            Multi-Watchlist Overlap & Repeaters Matrix
                        </h2>
                        <p className="text-xs text-gray-400 mt-0.5">
                            Select 2 or more watchlists to find consensus tickers appearing across multiple scans.
                        </p>
                    </div>

                    {/* Quick Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-gray-500 font-medium">Quick Select:</span>
                        <button
                            type="button"
                            onClick={() => selectAllWithCondition((w) => w.folder === "System Scans" || Boolean(w.isSystem))}
                            className="px-2 py-1 rounded text-[11px] font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                        >
                            System Scans
                        </button>
                        <button
                            type="button"
                            onClick={() => selectAllWithCondition((w) => w.folder === "52W Scans")}
                            className="px-2 py-1 rounded text-[11px] font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                        >
                            52W Scans
                        </button>
                        <button
                            type="button"
                            onClick={() => selectAllWithCondition((w) => w.folder === "Core Themes" || Boolean(w.isDefault))}
                            className="px-2 py-1 rounded text-[11px] font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                        >
                            Core Themes
                        </button>
                        <button
                            type="button"
                            onClick={() => selectAllWithCondition((w) => w.folder === "Custom" || (!w.isDefault && !w.isSystem))}
                            className="px-2 py-1 rounded text-[11px] font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                        >
                            Custom
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedWlIds(new Set())}
                            className="px-2 py-1 rounded text-[11px] font-medium text-gray-400 hover:text-gray-200 transition-colors"
                        >
                            Clear
                        </button>
                    </div>
                </div>

                {/* Watchlists Selection Chips */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-800/80">
                    {watchlists.map((wl) => {
                        const isSelected = selectedWlIds.has(wl.id);
                        return (
                            <button
                                key={wl.id}
                                type="button"
                                onClick={() => toggleWatchlistSelection(wl.id)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                    isSelected
                                        ? "bg-purple-600/20 text-purple-200 border-purple-500/40 shadow-sm"
                                        : "bg-gray-950/70 text-gray-400 border-gray-800 hover:bg-gray-800 hover:text-gray-200"
                                }`}
                            >
                                {isSelected ? (
                                    <CheckSquare className="w-3.5 h-3.5 text-purple-400" />
                                ) : (
                                    <Square className="w-3.5 h-3.5 text-gray-600" />
                                )}
                                <span>{wl.name}</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-800 text-gray-400 font-mono">
                                    {wl.tickers.length}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Overlap Threshold & Search Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-800">
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 font-medium flex items-center gap-1.5">
                            <Sliders className="w-3.5 h-3.5 text-purple-400" />
                            Minimum Overlap:
                        </span>
                        <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-lg border border-gray-800">
                            {Array.from(
                                { length: Math.max(1, selectedWatchlists.length) },
                                (_, i) => i + 1
                            ).map((count) => (
                                <button
                                    key={count}
                                    type="button"
                                    onClick={() => setMinOverlap(count)}
                                    className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                                        effectiveMinOverlap === count
                                            ? "bg-purple-600 text-white shadow-sm"
                                            : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                                    }`}
                                >
                                    {count === selectedWatchlists.length && count > 1
                                        ? `100% (${count} of ${count})`
                                        : `≥ ${count} lists`}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="relative min-w-[220px]">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Filter repeating tickers..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 text-gray-200 pl-8 pr-3 py-1.5 rounded-lg text-xs focus:outline-none focus:border-purple-500 transition-colors"
                        />
                    </div>
                </div>
            </div>

            {/* Overlap Summary Action Toolbar */}
            <div className="bg-gray-900/80 border border-gray-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-200">
                        {matrixData.length} Repeaters
                    </span>
                    <span className="text-xs text-gray-400">
                        appearing in at least {effectiveMinOverlap} of {selectedWatchlists.length} selected lists
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {onOpenInRRG && (
                        <button
                            type="button"
                            onClick={() => {
                                const suggestedName = `Overlap (${selectedWatchlists.length} lists, ≥${effectiveMinOverlap}x)`;
                                onOpenInRRG(repeatersTickers, suggestedName);
                            }}
                            disabled={repeatersTickers.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                        >
                            <Layers className="w-3.5 h-3.5" />
                            Open in RRG
                        </button>
                    )}

                    {onOpenInTable && (
                        <button
                            type="button"
                            onClick={() => {
                                const suggestedName = `Overlap (${selectedWatchlists.length} lists, ≥${effectiveMinOverlap}x)`;
                                onOpenInTable(repeatersTickers, suggestedName);
                            }}
                            disabled={repeatersTickers.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                        >
                            <TableIcon className="w-3.5 h-3.5" />
                            Open in Table
                        </button>
                    )}

                    {onSaveAsWatchlist && (
                        <button
                            type="button"
                            onClick={handleSaveRepeatersModal}
                            disabled={repeatersTickers.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                        >
                            <Save className="w-3.5 h-3.5" />
                            Save Repeaters as List
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleCopyRepeaters}
                        disabled={repeatersTickers.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                    >
                        <Copy className="w-3.5 h-3.5 text-gray-400" />
                        Copy Repeaters
                    </button>

                    {copyFeedback && (
                        <span className="text-xs text-emerald-400 font-medium flex items-center gap-1 animate-fade-in">
                            <Check className="w-3.5 h-3.5" />
                            {copyFeedback}
                        </span>
                    )}
                </div>
            </div>

            {/* Matrix Table */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-gray-300">
                        <thead className="bg-gray-950/80 text-gray-400 font-semibold border-b border-gray-800 uppercase text-[10px] tracking-wider">
                            <tr>
                                <th
                                    className="p-3 cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort("ticker")}
                                >
                                    <div className="flex items-center gap-1">
                                        Ticker
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th
                                    className="p-3 cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort("theme")}
                                >
                                    <div className="flex items-center gap-1">
                                        Theme
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                <th
                                    className="p-3 cursor-pointer hover:text-white transition-colors"
                                    onClick={() => handleSort("count")}
                                >
                                    <div className="flex items-center gap-1">
                                        Overlap Score
                                        <ArrowUpDown className="w-3 h-3 text-gray-500" />
                                    </div>
                                </th>
                                {selectedWatchlists.map((wl) => (
                                    <th
                                        key={wl.id}
                                        className="p-3 text-center min-w-[110px] border-l border-gray-800"
                                        title={wl.name}
                                    >
                                        <div className="truncate max-w-[120px] mx-auto text-gray-300 font-sans">
                                            {wl.name}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/60 font-mono">
                            {selectedWatchlists.length < 2 ? (
                                <tr>
                                    <td colSpan={3 + selectedWatchlists.length} className="p-8 text-center text-gray-500 font-sans">
                                        Please select at least 2 watchlists to compare overlaps.
                                    </td>
                                </tr>
                            ) : matrixData.length === 0 ? (
                                <tr>
                                    <td colSpan={3 + selectedWatchlists.length} className="p-8 text-center text-gray-500 font-sans">
                                        No tickers appear in ≥ {effectiveMinOverlap} of the selected watchlists.
                                    </td>
                                </tr>
                            ) : (
                                matrixData.map((row) => (
                                    <tr key={row.clean} className="hover:bg-gray-800/40 transition-colors">
                                        {/* Ticker */}
                                        <td className="p-3 font-semibold text-gray-100 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <span>{row.clean}</span>
                                                <a
                                                    href={makeTradingViewUrl(row.symbol)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-gray-500 hover:text-blue-400 transition-colors"
                                                    title="Open in TradingView"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </div>
                                        </td>

                                        {/* Theme */}
                                        <td className="p-3 font-sans text-gray-400 whitespace-nowrap text-[11px]">
                                            <span className="px-2 py-0.5 rounded bg-gray-800/70 border border-gray-700/60 text-gray-300">
                                                {row.theme}
                                            </span>
                                        </td>

                                        {/* Overlap Score */}
                                        <td className="p-3 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                        row.count === selectedWatchlists.length
                                                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                                            : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                                    }`}
                                                >
                                                    {row.count} / {selectedWatchlists.length} ({row.percentage}%)
                                                </span>
                                            </div>
                                        </td>

                                        {/* Watchlist Columns */}
                                        {row.presence.map((isPresent, idx) => (
                                            <td
                                                key={idx}
                                                className="p-3 text-center border-l border-gray-800/60 whitespace-nowrap"
                                            >
                                                {isPresent ? (
                                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs">
                                                        ✓
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-700">—</span>
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Save Repeaters Modal */}
            {isSaveModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
                        <h3 className="text-base font-semibold text-gray-100 flex items-center gap-2">
                            <Save className="w-4 h-4 text-emerald-400" />
                            Save Overlapping Repeaters
                        </h3>
                        <p className="text-xs text-gray-400">
                            Saving {repeatersTickers.length} consensus tickers into folder{" "}
                            <span className="text-emerald-400 font-semibold font-mono">52W Scans</span>.
                        </p>
                        <div>
                            <label className="text-xs text-gray-400 block mb-1">Watchlist Name</label>
                            <input
                                type="text"
                                value={saveListName}
                                onChange={(e) => setSaveListName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        confirmSaveWatchlist();
                                    }
                                }}
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-purple-500"
                                placeholder="Enter watchlist name..."
                                autoFocus
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsSaveModalOpen(false)}
                                className="px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmSaveWatchlist}
                                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                            >
                                Save Watchlist
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
