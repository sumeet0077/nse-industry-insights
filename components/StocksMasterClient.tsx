"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Search, X, Check, ChevronDown, ChevronUp, CheckSquare, LayoutGrid, List, Table2, Settings2, Filter, Copy, ExternalLink, ArrowUpDown, Sparkles } from "lucide-react";
import { IndexConfig, PerformanceRow, MarketStatus, ConstituentPerformanceMap, ConstituentPerformance } from "@/types";
import { METRIC_CONFIG, CATEGORIES } from "@/lib/config";
import { getTickerLabel, makeTradingViewUrl, makeTradingViewSymbol, resolveDataKey } from "@/lib/utils";
import { getMetricValue, formatMetricReturn, getMetricColor } from "@/lib/metrics";
import { CaptureScreenshot } from "@/components/common/CaptureScreenshot";
import { useLocalStorage } from "@/hooks/useLocalStorage";

interface StocksMasterClientProps {
    allConfigs: IndexConfig[];
    performanceData: PerformanceRow[];
    marketStatus: MarketStatus;
    constituentPerformance: ConstituentPerformanceMap;
}

function resolveMarketStatusKey(configTitle: string, statusKeys: string[]) {
    if (statusKeys.includes(configTitle)) return configTitle;
    const upperKey = configTitle.toUpperCase();
    if (statusKeys.includes(upperKey)) return upperKey;
    if (configTitle.startsWith("Nifty ")) {
        const niftyUpper = "NIFTY " + configTitle.slice(6).toUpperCase();
        if (statusKeys.includes(niftyUpper)) return niftyUpper;
    }
    const resolvedTitle = resolveDataKey(configTitle);
    return statusKeys.find(k => k.toLowerCase() === resolvedTitle) || null;
}

function getIbdBadgeStyle(rating: number | null | undefined): { bg: string; text: string; border: string; label: string } {
    if (rating === null || rating === undefined) {
        return { bg: "bg-slate-900/60", text: "text-slate-500", border: "border-slate-800", label: "—" };
    }
    if (rating >= 90) {
        return { bg: "bg-emerald-950/80", text: "text-emerald-300", border: "border-emerald-700/80", label: `RS ${rating}` };
    }
    if (rating >= 80) {
        return { bg: "bg-cyan-950/80", text: "text-cyan-300", border: "border-cyan-700/80", label: `RS ${rating}` };
    }
    if (rating >= 50) {
        return { bg: "bg-slate-800/80", text: "text-slate-300", border: "border-slate-700", label: `RS ${rating}` };
    }
    return { bg: "bg-red-950/40", text: "text-red-400", border: "border-red-900/50", label: `RS ${rating}` };
}

export function StocksMasterClient({ allConfigs, performanceData, marketStatus, constituentPerformance }: StocksMasterClientProps) {
    const [selectedThemeIds, setSelectedThemeIds] = useLocalStorage<string[]>("sm_themes", []);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategory, setActiveCategory] = useLocalStorage<string>("sm_category", "all");
    
    const [sectorSortCol, setSectorSortCol] = useLocalStorage<keyof PerformanceRow>("sm_sectorSort", "1 Day");
    const [sectorSortDesc, setSectorSortDesc] = useLocalStorage("sm_sectorDesc", true);
    
    const [stockSortCol, setStockSortCol] = useLocalStorage<keyof ConstituentPerformance>("sm_stockSort", "1D");
    const [stockSortDesc, setStockSortDesc] = useLocalStorage("sm_stockDesc", true);

    // 3-Way View Mode: Grid (Cards Grid), Stack (Grouped Sectors Stack), Unified (Unified All-Stocks Flat Table)
    const [viewMode, setViewMode] = useLocalStorage<"grid" | "stack" | "unified">("sm_view", "grid");

    // IPO Filter Controller: All / Exclude IPOs / Only Recent IPOs
    const [ipoFilter, setIpoFilter] = useLocalStorage<"all" | "exclude_ipos" | "only_ipos">("sm_ipoFilter", "all");

    // Funnel Presets: All / RS >= 80 (Top 20%) / RS Lead Breakout / Elite 90+ RS
    const [funnelFilter, setFunnelFilter] = useLocalStorage<"all" | "rs80" | "rs_lead" | "rs90">("sm_funnelFilter", "all");

    // Fast Page Sizing: 50 / 100 / 250 / 0 (All)
    const [pageSize, setPageSize] = useLocalStorage<number>("sm_pageSize", 100);

    // Unified Table Universal Column Sorting
    const [unifiedSortCol, setUnifiedSortCol] = useLocalStorage<string>("sm_unifiedSortCol", "ibd_rs_rating");
    const [unifiedSortDesc, setUnifiedSortDesc] = useLocalStorage<boolean>("sm_unifiedSortDesc", true);

    const [visibleColumns, setVisibleColumns] = useLocalStorage<string[]>("sm_cols", ["1D", "1W", "RS (20D)", "RS (50D)", "ibd_rs_rating"]);
    const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    // Stock Selection per sector
    const [selectedStocksBySector, setSelectedStocksBySector] = useLocalStorage<Record<string, string[]>>("sm_stocksBySector", {});
    const [activeSectorDropdown, setActiveSectorDropdown] = useState<string | null>(null);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const columnsDropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const sectorStockDropdownRef = useRef<HTMLDivElement>(null);
    const captureRef = useRef<HTMLDivElement>(null);

    // Auto-focus search input when themes dropdown opens
    useEffect(() => {
        if (isDropdownOpen) {
            const timer = setTimeout(() => {
                searchInputRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isDropdownOpen]);

    // Close dropdowns on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
            if (columnsDropdownRef.current && !columnsDropdownRef.current.contains(event.target as Node)) {
                setIsColumnsDropdownOpen(false);
            }
            if (sectorStockDropdownRef.current && !sectorStockDropdownRef.current.contains(event.target as Node)) {
                setActiveSectorDropdown(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const statusKeys = useMemo(() => Object.keys(marketStatus), [marketStatus]);

    const filteredConfigs = useMemo(() => {
        let base = allConfigs;
        if (activeCategory !== "all") {
            base = base.filter(c => c.category === activeCategory);
        }
        if (!searchQuery) return base;
        const lowerQ = searchQuery.toLowerCase();
        return base.filter(c => c.title.toLowerCase().includes(lowerQ));
    }, [allConfigs, searchQuery, activeCategory]);

    const toggleTheme = (id: string) => {
        setSelectedThemeIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleSelectAll = () => {
        const idsToAdd = filteredConfigs.map(c => c.id).filter(id => !selectedThemeIds.includes(id));
        setSelectedThemeIds(prev => [...prev, ...idsToAdd]);
    };

    const handleDeselectAll = () => {
        const idsToRemove = filteredConfigs.map(c => c.id);
        setSelectedThemeIds(prev => prev.filter(id => !idsToRemove.includes(id)));
    };

    const clearSelection = () => {
        setSelectedThemeIds([]);
    };

    const toggleColumn = (col: string) => {
        setVisibleColumns(prev => 
            prev.includes(col) ? prev.filter(x => x !== col) : [...prev, col]
        );
    };

    const toggleStockForSector = (sectorId: string, ticker: string) => {
        setSelectedStocksBySector(prev => {
            const currentSelected = prev[sectorId] || [];
            let newSelected;
            if (currentSelected.includes(ticker)) {
                newSelected = currentSelected.filter(t => t !== ticker);
            } else {
                newSelected = [...currentSelected, ticker];
            }
            return { ...prev, [sectorId]: newSelected };
        });
    };

    const clearStocksForSector = (sectorId: string) => {
        setSelectedStocksBySector(prev => {
            const copy = { ...prev };
            delete copy[sectorId];
            return copy;
        });
    };

    const resetDefaults = () => {
        setSelectedThemeIds([]);
        setSelectedStocksBySector({});
        setSectorSortCol("1 Day");
        setSectorSortDesc(true);
        setStockSortCol("1D");
        setStockSortDesc(true);
        setVisibleColumns(["1D", "1W", "RS (20D)", "RS (50D)", "ibd_rs_rating"]);
        setViewMode("grid");
        setIpoFilter("all");
        setFunnelFilter("all");
        setPageSize(100);
        setUnifiedSortCol("ibd_rs_rating");
        setUnifiedSortDesc(true);
    };

    // Calculate Sector Data for Grid & Stacked Views
    const sectorData = useMemo(() => {
        const selectedConfigs = allConfigs.filter(c => selectedThemeIds.includes(c.id));
        
        const data = selectedConfigs.map(config => {
            const perf = performanceData.find(p => p["Theme/Index"] === config.title) || null;
            const resolvedKey = resolveMarketStatusKey(config.title, statusKeys);
            const statusEntry = resolvedKey ? marketStatus[resolvedKey] : null;
            let tickers: string[] = [];
            if (statusEntry) {
                tickers = [...(statusEntry.above || []), ...(statusEntry.below || []), ...(statusEntry.new_stock || [])];
                tickers = Array.from(new Set(tickers));
            }

            let stocks = tickers.map(ticker => ({
                ticker,
                label: getTickerLabel(ticker),
                perf: constituentPerformance[ticker] || null
            }));

            // Apply IPO Filter in Sector Cards
            if (ipoFilter === "exclude_ipos") {
                stocks = stocks.filter(s => !s.perf?.is_ipo);
            } else if (ipoFilter === "only_ipos") {
                stocks = stocks.filter(s => s.perf?.is_ipo === true);
            }

            // Apply Funnel Filter in Sector Cards
            if (funnelFilter === "rs80") {
                stocks = stocks.filter(s => (s.perf?.ibd_rs_rating ?? 0) >= 80);
            } else if (funnelFilter === "rs90") {
                stocks = stocks.filter(s => (s.perf?.ibd_rs_rating ?? 0) >= 90);
            } else if (funnelFilter === "rs_lead") {
                stocks = stocks.filter(s => s.perf?.rs_lead_breakout === true);
            }

            // Sort Stocks
            stocks.sort((a, b) => {
                let valA = 0;
                let valB = 0;
                if (stockSortCol === "ibd_rs_rating") {
                    valA = a.perf?.ibd_rs_rating ?? -999;
                    valB = b.perf?.ibd_rs_rating ?? -999;
                } else {
                    valA = a.perf ? (getMetricValue(a.perf as any, stockSortCol) || 0) : 0;
                    valB = b.perf ? (getMetricValue(b.perf as any, stockSortCol) || 0) : 0;
                }
                return stockSortDesc ? valB - valA : valA - valB;
            });

            const selectedForThisSector = selectedStocksBySector[config.id] || [];
            const filteredStocks = selectedForThisSector.length > 0 
                ? stocks.filter(s => selectedForThisSector.includes(s.ticker))
                : stocks;

            return {
                config,
                perf,
                allStocks: stocks,
                stocks: filteredStocks
            };
        });

        data.sort((a, b) => {
            const valA = a.perf ? (a.perf[sectorSortCol as keyof PerformanceRow] as number) || 0 : 0;
            const valB = b.perf ? (b.perf[sectorSortCol as keyof PerformanceRow] as number) || 0 : 0;
            return sectorSortDesc ? valB - valA : valA - valB;
        });

        return data;
    }, [allConfigs, selectedThemeIds, performanceData, marketStatus, constituentPerformance, statusKeys, sectorSortCol, sectorSortDesc, stockSortCol, stockSortDesc, selectedStocksBySector, ipoFilter, funnelFilter]);

    // Flat Unified Stocks List across all selected themes (or all themes if none explicitly selected)
    const unifiedStocks = useMemo(() => {
        const targetConfigs = selectedThemeIds.length > 0
            ? allConfigs.filter(c => selectedThemeIds.includes(c.id))
            : allConfigs;

        const seenTickers = new Map<string, {
            ticker: string;
            label: string;
            themeTitle: string;
            themeId: string;
            perf: ConstituentPerformance | null;
        }>();

        for (const config of targetConfigs) {
            if (activeCategory !== "all" && config.category !== activeCategory) {
                continue;
            }

            const resolvedKey = resolveMarketStatusKey(config.title, statusKeys);
            const statusEntry = resolvedKey ? marketStatus[resolvedKey] : null;
            if (!statusEntry) continue;

            const tickers = [...(statusEntry.above || []), ...(statusEntry.below || []), ...(statusEntry.new_stock || [])];
            for (const t of tickers) {
                if (!seenTickers.has(t)) {
                    seenTickers.set(t, {
                        ticker: t,
                        label: getTickerLabel(t),
                        themeTitle: config.title,
                        themeId: config.id,
                        perf: constituentPerformance[t] || null
                    });
                }
            }
        }

        let list = Array.from(seenTickers.values());

        // 1. Search Query Filter
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            list = list.filter(item =>
                item.ticker.toLowerCase().includes(q) ||
                item.label.toLowerCase().includes(q) ||
                item.themeTitle.toLowerCase().includes(q)
            );
        }

        // 2. IPO 3-State Filter
        if (ipoFilter === "exclude_ipos") {
            list = list.filter(item => !item.perf?.is_ipo);
        } else if (ipoFilter === "only_ipos") {
            list = list.filter(item => item.perf?.is_ipo === true);
        }

        // 3. Quick Funnel Filter
        if (funnelFilter === "rs80") {
            list = list.filter(item => (item.perf?.ibd_rs_rating ?? 0) >= 80);
        } else if (funnelFilter === "rs90") {
            list = list.filter(item => (item.perf?.ibd_rs_rating ?? 0) >= 90);
        } else if (funnelFilter === "rs_lead") {
            list = list.filter(item => item.perf?.rs_lead_breakout === true);
        }

        // 4. Universal Column Sorting
        list.sort((a, b) => {
            let valA: any = 0;
            let valB: any = 0;

            if (unifiedSortCol === "ticker") {
                valA = a.label;
                valB = b.label;
                return unifiedSortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
            }
            if (unifiedSortCol === "theme") {
                valA = a.themeTitle;
                valB = b.themeTitle;
                return unifiedSortDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
            }
            if (unifiedSortCol === "ibd_rs_rating") {
                valA = a.perf?.ibd_rs_rating ?? -999;
                valB = b.perf?.ibd_rs_rating ?? -999;
            } else if (unifiedSortCol === "listing_days") {
                valA = a.perf?.listing_days ?? -999;
                valB = b.perf?.listing_days ?? -999;
            } else if (unifiedSortCol === "rs_lead_breakout") {
                valA = a.perf?.rs_lead_breakout ? 1 : 0;
                valB = b.perf?.rs_lead_breakout ? 1 : 0;
            } else {
                valA = a.perf ? (getMetricValue(a.perf as any, unifiedSortCol) ?? -9999) : -9999;
                valB = b.perf ? (getMetricValue(b.perf as any, unifiedSortCol) ?? -9999) : -9999;
            }

            return unifiedSortDesc ? valB - valA : valA - valB;
        });

        return list;
    }, [allConfigs, selectedThemeIds, activeCategory, marketStatus, constituentPerformance, statusKeys, searchQuery, ipoFilter, funnelFilter, unifiedSortCol, unifiedSortDesc]);

    const displayedUnifiedStocks = useMemo(() => {
        if (pageSize === 0) return unifiedStocks;
        return unifiedStocks.slice(0, pageSize);
    }, [unifiedStocks, pageSize]);

    const handleUnifiedSort = (col: string) => {
        if (unifiedSortCol === col) {
            setUnifiedSortDesc(prev => !prev);
        } else {
            setUnifiedSortCol(col);
            setUnifiedSortDesc(col === "ticker" || col === "theme" ? false : true);
        }
    };

    const handleCopyWatchlist = useCallback(() => {
        const listToCopy = viewMode === "unified"
            ? unifiedStocks.map(s => makeTradingViewSymbol(s.ticker))
            : sectorData.flatMap(g => g.stocks.map(s => makeTradingViewSymbol(s.ticker)));
        
        if (listToCopy.length === 0) return;
        const unique = Array.from(new Set(listToCopy));
        navigator.clipboard.writeText(unique.join(", ")).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    }, [viewMode, unifiedStocks, sectorData]);

    return (
        <div className="flex flex-col gap-6">
            {/* Controls Bar */}
            <div className="flex flex-wrap gap-4 items-end bg-[#111118] p-4 rounded-xl border border-[#1e1e2e]">
                
                {/* Sector Selector */}
                <div className="relative flex-1 min-w-[280px]" ref={dropdownRef}>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Themes / Sectors</label>
                    <div 
                        className="bg-[#1a1a2e] border border-slate-700/60 rounded-md p-2 flex items-center justify-between cursor-pointer min-h-[42px]"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                        <div className="flex flex-wrap gap-1.5 flex-1 max-h-[100px] overflow-y-auto">
                            {selectedThemeIds.length === 0 ? (
                                <span className="text-slate-500 text-sm pl-1">
                                    {viewMode === "unified" ? "All themes included (or click to filter)..." : "Select themes to compare..."}
                                </span>
                            ) : (
                                selectedThemeIds.map(id => {
                                    const config = allConfigs.find(c => c.id === id);
                                    return (
                                        <span key={id} className="bg-blue-500/20 text-blue-300 text-xs px-2 py-1 rounded-md border border-blue-500/30 flex items-center gap-1">
                                            {config?.title}
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); toggleTheme(id); }}
                                                className="hover:text-blue-200"
                                            >
                                                <X size={12} />
                                            </button>
                                        </span>
                                    );
                                })
                            )}
                        </div>
                        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </div>

                    {isDropdownOpen && (
                        <div className="absolute z-50 top-full left-0 w-full mt-2 bg-[#1a1a2e] border border-slate-700 rounded-lg shadow-2xl max-h-[450px] flex flex-col overflow-hidden">
                            {/* Category Filters */}
                            <div className="flex bg-[#111118] p-1 border-b border-slate-700/50 text-[11px] font-medium">
                                {["all", ...CATEGORIES].map(cat => (
                                    <button 
                                        key={cat} 
                                        onClick={() => setActiveCategory(cat)}
                                        className={`flex-1 py-1.5 px-2 rounded capitalize transition-colors ${activeCategory === cat ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-slate-300'}`}
                                    >
                                        {cat.replace('-', ' ')}
                                    </button>
                                ))}
                            </div>
                            {/* Actions & Search */}
                            <div className="p-2 border-b border-slate-700/50 bg-[#1a1a2e] flex flex-col gap-2">
                                <div className="flex justify-between items-center px-1">
                                    <span className="text-xs text-slate-400">{filteredConfigs.length} available</span>
                                    <div className="flex gap-2">
                                        <button onClick={handleSelectAll} className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2 py-1 rounded transition-colors">Select All</button>
                                        <button onClick={handleDeselectAll} className="text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-700/50 px-2 py-1 rounded transition-colors">Deselect All</button>
                                    </div>
                                </div>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-3.5 h-3.5" />
                                    <input 
                                        ref={searchInputRef}
                                        type="text" 
                                        placeholder="Search..." 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-[#111118] border border-slate-700 rounded py-1.5 pl-8 pr-3 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                                    />
                                </div>
                            </div>
                            {/* List */}
                            <div className="overflow-y-auto flex-1 p-1">
                                {filteredConfigs.map(config => (
                                    <button
                                        key={config.id}
                                        onClick={() => toggleTheme(config.id)}
                                        className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-blue-500/10 hover:text-blue-400 rounded flex items-center justify-between group transition-colors"
                                    >
                                        <span>{config.title} <span className="text-[10px] text-slate-600 ml-2 uppercase opacity-0 group-hover:opacity-100 transition-opacity">{config.category.replace('-', ' ')}</span></span>
                                        {selectedThemeIds.includes(config.id) && <Check size={14} className="text-blue-500" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {viewMode !== "unified" && (
                    <>
                        {/* Sector Sorting */}
                        <div className="flex flex-col gap-1.5 min-w-[180px]">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sort Sectors By</label>
                            <div className="flex bg-[#1a1a2e] border border-slate-700/60 rounded-md">
                                <select 
                                    value={sectorSortCol}
                                    onChange={(e) => setSectorSortCol(e.target.value as keyof PerformanceRow)}
                                    className="bg-transparent text-sm text-slate-200 px-3 py-2 flex-1 focus:outline-none appearance-none cursor-pointer"
                                >
                                    {METRIC_CONFIG.map(opt => (
                                        <option key={opt.value} value={opt.value} className="bg-[#111118]">{opt.label}</option>
                                    ))}
                                </select>
                                <button 
                                    onClick={() => setSectorSortDesc(!sectorSortDesc)}
                                    className="px-3 border-l border-slate-700/60 text-slate-400 hover:text-white transition-colors flex items-center justify-center bg-slate-800/50"
                                    title="Toggle sort direction"
                                >
                                    {sectorSortDesc ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Stock Sorting */}
                        <div className="flex flex-col gap-1.5 min-w-[180px]">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sort Stocks By</label>
                            <div className="flex bg-[#1a1a2e] border border-slate-700/60 rounded-md">
                                <select 
                                    value={stockSortCol}
                                    onChange={(e) => setStockSortCol(e.target.value as keyof ConstituentPerformance)}
                                    className="bg-transparent text-sm text-slate-200 px-3 py-2 flex-1 focus:outline-none appearance-none cursor-pointer"
                                >
                                    {METRIC_CONFIG.map(opt => (
                                        <option key={opt.stockValue} value={opt.stockValue} className="bg-[#111118]">{opt.label}</option>
                                    ))}
                                </select>
                                <button 
                                    onClick={() => setStockSortDesc(!stockSortDesc)}
                                    className="px-3 border-l border-slate-700/60 text-slate-400 hover:text-white transition-colors flex items-center justify-center bg-slate-800/50"
                                    title="Toggle sort direction"
                                >
                                    {stockSortDesc ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* Column Selector */}
                <div className="relative" ref={columnsDropdownRef}>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Columns</label>
                        <button
                            onClick={() => setIsColumnsDropdownOpen(!isColumnsDropdownOpen)}
                            className="bg-[#1a1a2e] border border-slate-700/60 rounded-md px-3 py-2 text-sm text-slate-300 flex items-center gap-2 hover:bg-slate-800 transition-colors"
                        >
                            <Settings2 size={16} className="text-slate-400" />
                            <span>{visibleColumns.length} Selected</span>
                            <ChevronDown size={14} className="text-slate-500" />
                        </button>
                    </div>
                    {isColumnsDropdownOpen && (
                        <div className="absolute z-50 top-full right-0 mt-2 w-52 bg-[#1a1a2e] border border-slate-700 rounded-lg shadow-2xl p-2 flex flex-col gap-1">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 py-1 mb-1 border-b border-slate-700/50">Visible Metrics</div>
                            {METRIC_CONFIG.map(opt => (
                                <label key={opt.stockValue} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded cursor-pointer group">
                                    <input 
                                        type="checkbox" 
                                        checked={visibleColumns.includes(opt.stockValue)}
                                        onChange={() => toggleColumn(opt.stockValue)}
                                        className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/30"
                                    />
                                    <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{opt.label}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                {/* Actions & 3-Way Mode Switcher */}
                <div className="flex items-center gap-3 pb-1 ml-auto flex-wrap">
                    <button
                        onClick={handleCopyWatchlist}
                        className="text-xs font-semibold text-slate-300 hover:text-white transition-colors bg-[#1a1a2e] border border-slate-700/60 rounded-md px-3 py-2 flex items-center gap-1.5 h-[38px]"
                        title="Copy all symbols for TradingView"
                    >
                        {isCopied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-blue-400" />}
                        <span>{isCopied ? "Copied Watchlist!" : "Copy Tickers (TV)"}</span>
                    </button>

                    <button
                        onClick={resetDefaults}
                        className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors bg-[#1a1a2e] border border-slate-700/60 rounded-md px-3 py-2 flex items-center h-[38px]"
                        title="Reset all settings to default"
                    >
                        Reset Defaults
                    </button>

                    {/* 3-Way View Toggle */}
                    <div className="flex bg-[#1a1a2e] border border-slate-700/60 rounded-md p-1 h-[38px]">
                        <button
                            onClick={() => setViewMode("grid")}
                            className={`p-1.5 rounded transition-colors ${viewMode === "grid" ? "bg-blue-500/20 text-blue-400 font-semibold" : "text-slate-500 hover:text-slate-300"}`}
                            title="Sector Cards Grid View"
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode("stack")}
                            className={`p-1.5 rounded transition-colors ${viewMode === "stack" ? "bg-blue-500/20 text-blue-400 font-semibold" : "text-slate-500 hover:text-slate-300"}`}
                            title="Grouped Sectors Stack View"
                        >
                            <List size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode("unified")}
                            className={`p-1.5 rounded transition-colors ${viewMode === "unified" ? "bg-blue-500/20 text-blue-400 font-semibold" : "text-slate-500 hover:text-slate-300"}`}
                            title="Unified All-Stocks Flat Table Mode"
                        >
                            <Table2 size={16} />
                        </button>
                    </div>

                    {selectedThemeIds.length > 0 && (
                        <button
                            onClick={clearSelection}
                            className="text-xs text-slate-500 hover:text-red-400 underline transition-colors"
                        >
                            Clear All
                        </button>
                    )}

                    <div className="h-[38px]">
                        <CaptureScreenshot 
                            targetRef={captureRef} 
                            filename="Stocks_Master"
                            label="Screenshot"
                        />
                    </div>
                </div>
            </div>

            {/* Quick Funnel & IPO Filters Bar (Available in All Views, Highlighted in Unified Table) */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-[#111118]/80 p-3 rounded-xl border border-slate-800/80">
                {/* Step 1 & Step 2 RS Funnel Pills */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mr-1">RS Funnel:</span>
                    <button
                        onClick={() => setFunnelFilter("all")}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                            funnelFilter === "all"
                                ? "bg-blue-600 text-white shadow-sm shadow-blue-900"
                                : "bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-slate-700/50"
                        }`}
                    >
                        All Setups
                    </button>
                    <button
                        onClick={() => setFunnelFilter("rs80")}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1 ${
                            funnelFilter === "rs80"
                                ? "bg-cyan-600 text-white shadow-sm shadow-cyan-900"
                                : "bg-slate-800/60 text-cyan-400 hover:text-cyan-300 border border-cyan-800/40"
                        }`}
                        title="Isolate Top 20% Alpha Leaders with RS Rating >= 80"
                    >
                        <span>RS Rating ≥ 80 (Top 20%)</span>
                    </button>
                    <button
                        onClick={() => setFunnelFilter("rs_lead")}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-1 ${
                            funnelFilter === "rs_lead"
                                ? "bg-blue-600 text-white shadow-sm shadow-blue-900"
                                : "bg-slate-800/60 text-blue-300 hover:text-blue-200 border border-blue-800/40"
                        }`}
                        title="Isolate stocks where Absolute RS Line has made a 52W High ahead of price breakout"
                    >
                        <Sparkles size={12} className="opacity-80" />
                        <span>RS Line Leading Price</span>
                    </button>
                    <button
                        onClick={() => setFunnelFilter("rs90")}
                        className={`px-2.5 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                            funnelFilter === "rs90"
                                ? "bg-emerald-600 text-white shadow-sm shadow-emerald-900"
                                : "bg-slate-800/60 text-emerald-400 hover:text-emerald-300 border border-emerald-800/40"
                        }`}
                        title="Top 10% Elite RS Ratings (90-99)"
                    >
                        Elite 90+ RS
                    </button>
                </div>

                {/* 3-State IPO Controller & Page Size Selector */}
                <div className="flex items-center gap-4 flex-wrap">
                    {/* IPO Filter */}
                    <div className="flex items-center gap-1.5 bg-[#1a1a2e] p-1 rounded-lg border border-slate-700/60">
                        <span className="text-[10px] font-semibold uppercase text-slate-500 px-1.5">IPO Filter:</span>
                        <button
                            onClick={() => setIpoFilter("all")}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                ipoFilter === "all" ? "bg-blue-500/20 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setIpoFilter("exclude_ipos")}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                ipoFilter === "exclude_ipos" ? "bg-blue-500/20 text-blue-400 font-semibold" : "text-slate-400 hover:text-slate-200"
                            }`}
                            title="Exclude stocks with under 252 trading days (< 1 year)"
                        >
                            Seasoned Only (Exclude IPOs)
                        </button>
                        <button
                            onClick={() => setIpoFilter("only_ipos")}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                ipoFilter === "only_ipos" ? "bg-amber-500/20 text-amber-300 font-semibold" : "text-slate-400 hover:text-slate-200"
                            }`}
                            title="Show only recent IPOs (< 1 year history)"
                        >
                            Only Recent IPOs
                        </button>
                    </div>

                    {/* Page Size in Unified View */}
                    {viewMode === "unified" && (
                        <div className="flex items-center gap-1 text-xs text-slate-400">
                            <span className="text-[10px] uppercase text-slate-500">Show:</span>
                            {[50, 100, 250, 0].map(sz => (
                                <button
                                    key={sz}
                                    onClick={() => setPageSize(sz)}
                                    className={`px-1.5 py-0.5 rounded text-[11px] ${
                                        pageSize === sz ? "bg-blue-500/20 text-blue-300 font-bold" : "hover:text-slate-200"
                                    }`}
                                >
                                    {sz === 0 ? "All" : sz}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Display Area: Mode 1 (Sector Grid), Mode 2 (Grouped Stack), or Mode 3 (Unified All-Stocks Table) */}
            {viewMode === "unified" ? (
                /* ═══════════════════════════════════════════════════════════════════
                   MODE 3: UNIFIED ALL-STOCKS FLAT MASTER TABLE
                   ═══════════════════════════════════════════════════════════════════ */
                unifiedStocks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-4 text-center border border-dashed border-slate-700/50 rounded-xl">
                        <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4 text-slate-500">
                            <CheckSquare size={24} />
                        </div>
                        <h3 className="text-lg font-medium text-slate-300 mb-2">No Matching Stocks Found</h3>
                        <p className="text-slate-500 text-sm max-w-md">
                            Try adjusting your search query, clearing theme filters, or resetting the RS Funnel / IPO filters.
                        </p>
                    </div>
                ) : (
                    <div ref={captureRef} className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden shadow-xl">
                        {/* Table Telemetry Header */}
                        <div className="bg-slate-900/90 px-4 py-3 border-b border-slate-800 flex justify-between items-center text-xs text-slate-400">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-200">Unified All-Stocks Leaderboard</span>
                                <span>•</span>
                                <span>Showing {displayedUnifiedStocks.length} of {unifiedStocks.length} qualifying stocks</span>
                            </div>
                            <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500">
                                <span>Sorted by: {unifiedSortCol} ({unifiedSortDesc ? "Desc" : "Asc"})</span>
                            </div>
                        </div>

                        {/* Flat Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left whitespace-nowrap">
                                <thead className="text-slate-400 bg-slate-900 text-[11px] uppercase tracking-wider select-none border-b border-slate-800 font-semibold sticky top-0 z-20">
                                    <tr>
                                        <th className="px-3 py-3 w-10 text-center text-slate-600 font-mono">#</th>
                                        <th 
                                            className="px-4 py-3 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleUnifiedSort("ticker")}
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>Stock</span>
                                                {unifiedSortCol === "ticker" ? (
                                                    <span className="text-cyan-400 font-bold">{unifiedSortDesc ? "▼" : "▲"}</span>
                                                ) : (
                                                    <ArrowUpDown size={12} className="text-slate-600" />
                                                )}
                                            </div>
                                        </th>
                                        <th 
                                            className="px-4 py-3 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleUnifiedSort("theme")}
                                        >
                                            <div className="flex items-center gap-1">
                                                <span>Sector / Theme</span>
                                                {unifiedSortCol === "theme" ? (
                                                    <span className="text-cyan-400 font-bold">{unifiedSortDesc ? "▼" : "▲"}</span>
                                                ) : (
                                                    <ArrowUpDown size={12} className="text-slate-600" />
                                                )}
                                            </div>
                                        </th>
                                        <th 
                                            className="px-4 py-3 text-center cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleUnifiedSort("ibd_rs_rating")}
                                            title="Click to sort by 1-99 Relative Strength Percentile Rating"
                                        >
                                            <div className="flex items-center justify-center gap-1">
                                                <span>RS Rating</span>
                                                {unifiedSortCol === "ibd_rs_rating" ? (
                                                    <span className="text-cyan-400 font-bold">{unifiedSortDesc ? "▼" : "▲"}</span>
                                                ) : (
                                                    <ArrowUpDown size={12} className="text-slate-600" />
                                                )}
                                            </div>
                                        </th>
                                        <th 
                                            className="px-4 py-3 text-center cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleUnifiedSort("rs_lead_breakout")}
                                            title="Click to sort by RS Line 52-Week Lead Breakout Status"
                                        >
                                            <div className="flex items-center justify-center gap-1">
                                                <span>RS Lead</span>
                                                {unifiedSortCol === "rs_lead_breakout" ? (
                                                    <span className="text-cyan-400 font-bold">{unifiedSortDesc ? "▼" : "▲"}</span>
                                                ) : (
                                                    <ArrowUpDown size={12} className="text-slate-600" />
                                                )}
                                            </div>
                                        </th>

                                        {/* Dynamic Metric Columns */}
                                        {METRIC_CONFIG.filter(opt => visibleColumns.includes(opt.stockValue) && opt.stockValue !== "ibd_rs_rating").map(opt => (
                                            <th 
                                                key={opt.stockValue} 
                                                className="px-3 py-3 text-right cursor-pointer hover:text-white transition-colors"
                                                onClick={() => handleUnifiedSort(opt.stockValue)}
                                            >
                                                <div className="flex items-center justify-end gap-1">
                                                    <span>{opt.label}</span>
                                                    {unifiedSortCol === opt.stockValue ? (
                                                        <span className="text-cyan-400 font-bold">{unifiedSortDesc ? "▼" : "▲"}</span>
                                                    ) : (
                                                        <ArrowUpDown size={12} className="text-slate-600" />
                                                    )}
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60 font-mono">
                                    {displayedUnifiedStocks.map((stock, idx) => {
                                        const ibdBadge = getIbdBadgeStyle(stock.perf?.ibd_rs_rating);
                                        const isLead = stock.perf?.rs_lead_breakout;
                                        const isIpo = stock.perf?.is_ipo;
                                        const days = stock.perf?.listing_days;

                                        return (
                                            <tr key={`${stock.ticker}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                                                <td className="px-3 py-2.5 text-center text-slate-600 text-xs">
                                                    {idx + 1}
                                                </td>
                                                <td className="px-4 py-2.5 font-bold font-sans">
                                                    <div className="flex items-center gap-2">
                                                        <a 
                                                            href={makeTradingViewUrl(stock.ticker)} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer" 
                                                            className="text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1 group-hover:underline"
                                                            title={`Open ${stock.label} on TradingView`}
                                                        >
                                                            <span>{stock.label}</span>
                                                            <ExternalLink size={12} className="opacity-60" />
                                                        </a>
                                                        {isIpo && (
                                                            <span className="px-1.5 py-0.2 bg-amber-950/80 text-amber-300 border border-amber-800/60 rounded text-[10px] font-mono font-bold" title={`Listed ${days || '< 252'} trading days ago`}>
                                                                IPO {days ? `${days}D` : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5 font-sans">
                                                    <span className="px-2 py-0.5 bg-slate-800/60 text-slate-300 border border-slate-700/60 rounded text-xs font-medium">
                                                        {stock.themeTitle}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono inline-block border ${ibdBadge.bg} ${ibdBadge.text} ${ibdBadge.border}`}>
                                                        {ibdBadge.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-center">
                                                    {isLead ? (
                                                        <span className="px-2 py-0.5 bg-blue-950/90 text-blue-300 border border-blue-700/80 rounded text-[10px] font-bold font-sans inline-flex items-center gap-1 shadow-sm shadow-blue-950" title="Absolute RS Line has made a 52-week High ahead of price breakout">
                                                            <Sparkles size={10} className="text-blue-400" />
                                                            <span>RS Leading</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-600 text-xs">—</span>
                                                    )}
                                                </td>

                                                {/* Dynamic Metric Values */}
                                                {METRIC_CONFIG.filter(opt => visibleColumns.includes(opt.stockValue) && opt.stockValue !== "ibd_rs_rating").map(opt => {
                                                    const val = stock.perf ? getMetricValue(stock.perf as any, opt.stockValue) : null;
                                                    return (
                                                        <td key={opt.stockValue} className={`px-3 py-2.5 text-right font-medium tabular-nums ${getMetricColor(val)}`}>
                                                            {formatMetricReturn(val)}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            ) : (
                /* ═══════════════════════════════════════════════════════════════════
                   MODE 1 (GRID) & MODE 2 (STACKED SECTOR CARDS)
                   ═══════════════════════════════════════════════════════════════════ */
                sectorData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-4 text-center border border-dashed border-slate-700/50 rounded-xl">
                        <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4 text-slate-500">
                            <CheckSquare size={24} />
                        </div>
                        <h3 className="text-lg font-medium text-slate-300 mb-2">No Themes Selected</h3>
                        <p className="text-slate-500 text-sm max-w-md">
                            Use the dropdown above to select themes or sectors, or switch to Unified All-Stocks Table mode.
                        </p>
                    </div>
                ) : (
                    <div 
                        ref={captureRef} 
                        className={`bg-[#0a0a0f] p-2 rounded-xl transition-all ${
                            viewMode === "grid" 
                                ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" 
                                : "flex flex-col gap-6"
                        }`}
                    >
                        {sectorData.map(group => {
                            const secVal = group.perf ? group.perf[sectorSortCol as keyof PerformanceRow] : null;
                            return (
                                <div key={group.config.id} className="bg-[#111118] border border-[#1e1e2e] rounded-xl flex flex-col shadow-lg overflow-hidden">
                                    {/* Sector Header */}
                                    <div className="bg-gradient-to-r from-slate-900 to-[#111118] p-4 border-b border-slate-800 rounded-t-xl">
                                        <div className="flex justify-between items-start mb-2">
                                            <h2 className="text-base font-bold text-slate-200">{group.config.title}</h2>
                                            <div className="flex items-center gap-2">
                                                <div className={`text-sm font-semibold px-2 py-0.5 rounded ${
                                                    (secVal as number) > 0 ? "bg-emerald-500/10 text-emerald-400" : 
                                                    (secVal as number) < 0 ? "bg-red-500/10 text-red-400" : 
                                                    "bg-slate-500/10 text-slate-400"
                                                }`}>
                                                    {formatMetricReturn(secVal as number)}
                                                </div>
                                                <div className="relative">
                                                    <button 
                                                        onClick={() => setActiveSectorDropdown(activeSectorDropdown === group.config.id ? null : group.config.id)}
                                                        className={`p-1.5 rounded transition-colors ${
                                                            (selectedStocksBySector[group.config.id]?.length || 0) > 0 
                                                            ? "bg-blue-500/20 text-blue-400" 
                                                            : "bg-slate-800/50 text-slate-400 hover:text-slate-300"
                                                        }`}
                                                        title="Filter specific stocks"
                                                    >
                                                        <Filter size={14} />
                                                    </button>
                                                    {activeSectorDropdown === group.config.id && (
                                                        <div ref={sectorStockDropdownRef} className="absolute z-50 top-full right-0 mt-1 w-64 bg-[#1a1a2e] border border-slate-700 rounded-lg shadow-2xl flex flex-col max-h-[300px]">
                                                            <div className="p-2 border-b border-slate-700/50 flex justify-between items-center">
                                                                <span className="text-xs font-semibold text-slate-400">Select Stocks</span>
                                                                <button 
                                                                    onClick={() => clearStocksForSector(group.config.id)}
                                                                    className="text-[10px] text-blue-400 hover:text-blue-300"
                                                                >
                                                                    Show All
                                                                </button>
                                                            </div>
                                                            <div className="overflow-y-auto p-1 flex-1">
                                                                {group.allStocks.map(s => {
                                                                    const isSelected = (selectedStocksBySector[group.config.id] || []).includes(s.ticker);
                                                                    return (
                                                                        <label key={s.ticker} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded cursor-pointer group">
                                                                            <input 
                                                                                type="checkbox" 
                                                                                checked={isSelected}
                                                                                onChange={() => toggleStockForSector(group.config.id, s.ticker)}
                                                                                className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/30"
                                                                            />
                                                                            <span className="text-xs text-slate-300 font-mono group-hover:text-white truncate">{s.label}</span>
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                                            <span>Sorted by {sectorSortCol}</span>
                                            <span>{group.stocks.length} Stocks</span>
                                        </div>
                                    </div>

                                    {/* Stocks Table */}
                                    <div className="flex-1 overflow-x-auto">
                                        <table className="w-full text-xs text-left whitespace-nowrap">
                                            <thead className="text-slate-500 bg-slate-900/50 font-semibold border-b border-slate-800">
                                                <tr>
                                                    <th className="px-4 py-2">Stock</th>
                                                    <th className="px-3 py-2 text-center">RS Rating</th>
                                                    {/* Dynamic Headers */}
                                                    {METRIC_CONFIG.filter(opt => visibleColumns.includes(opt.stockValue) && opt.stockValue !== "ibd_rs_rating").map(opt => (
                                                        <th key={opt.stockValue} className="px-3 py-2 text-right">{opt.label}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/60 font-mono">
                                                {group.stocks.map((stock) => {
                                                    const ibdBadge = getIbdBadgeStyle(stock.perf?.ibd_rs_rating);
                                                    const isLead = stock.perf?.rs_lead_breakout;
                                                    const isIpo = stock.perf?.is_ipo;

                                                    return (
                                                        <tr key={stock.ticker} className="hover:bg-white/[0.02] transition-colors">
                                                            <td className="px-4 py-2 font-sans">
                                                                <div className="flex items-center gap-1.5">
                                                                    <a href={makeTradingViewUrl(stock.ticker)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 font-medium">
                                                                        {stock.label}
                                                                    </a>
                                                                    {isIpo && (
                                                                        <span className="px-1 py-0.2 bg-amber-950/80 text-amber-300 border border-amber-800/60 rounded text-[9px] font-mono">
                                                                            IPO
                                                                        </span>
                                                                    )}
                                                                    {isLead && (
                                                                        <span className="text-[10px] text-cyan-400" title="RS Line Leading Price">
                                                                            ★
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-3 py-2 text-center">
                                                                <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold border ${ibdBadge.bg} ${ibdBadge.text} ${ibdBadge.border}`}>
                                                                    {ibdBadge.label}
                                                                </span>
                                                            </td>
                                                            {/* Dynamic Cells */}
                                                            {METRIC_CONFIG.filter(opt => visibleColumns.includes(opt.stockValue) && opt.stockValue !== "ibd_rs_rating").map(opt => {
                                                                const val = stock.perf ? getMetricValue(stock.perf as any, opt.stockValue) : null;
                                                                return (
                                                                    <td key={opt.stockValue} className={`px-3 py-2 text-right ${getMetricColor(val)}`}>
                                                                        {formatMetricReturn(val)}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                })}
                                                {group.stocks.length === 0 && (
                                                    <tr>
                                                        <td colSpan={visibleColumns.length + 2} className="px-4 py-6 text-center text-slate-600 font-sans italic">
                                                            No constituent data available
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            )}
        </div>
    );
}
