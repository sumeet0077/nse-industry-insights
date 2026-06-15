"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Search, X, Check, ChevronDown, ChevronUp, CheckSquare, LayoutGrid, List, Settings2, Filter } from "lucide-react";
import { IndexConfig, PerformanceRow, MarketStatus, ConstituentPerformanceMap, ConstituentPerformance } from "@/types";
import { METRIC_CONFIG, CATEGORIES } from "@/lib/config";
import { getTickerLabel, makeTradingViewUrl, formatReturn, getReturnColor, resolveDataKey } from "@/lib/utils";
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

export function StocksMasterClient({ allConfigs, performanceData, marketStatus, constituentPerformance }: StocksMasterClientProps) {
    const [selectedThemeIds, setSelectedThemeIds] = useLocalStorage<string[]>("sm_themes", []);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCategory, setActiveCategory] = useLocalStorage<string>("sm_category", "all");
    
    const [sectorSortCol, setSectorSortCol] = useLocalStorage<keyof PerformanceRow>("sm_sectorSort", "1 Day");
    const [sectorSortDesc, setSectorSortDesc] = useLocalStorage("sm_sectorDesc", true);
    
    const [stockSortCol, setStockSortCol] = useLocalStorage<keyof ConstituentPerformance>("sm_stockSort", "1D");
    const [stockSortDesc, setStockSortDesc] = useLocalStorage("sm_stockDesc", true);

    const [viewMode, setViewMode] = useLocalStorage<"grid" | "stack">("sm_view", "grid");

    const [visibleColumns, setVisibleColumns] = useLocalStorage<string[]>("sm_cols", ["1D", "1W", "RS (20D)", "RS (50D)"]);
    const [isColumnsDropdownOpen, setIsColumnsDropdownOpen] = useState(false);

    // Stock Selection per sector
    const [selectedStocksBySector, setSelectedStocksBySector] = useLocalStorage<Record<string, string[]>>("sm_stocksBySector", {});
    const [activeSectorDropdown, setActiveSectorDropdown] = useState<string | null>(null);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const columnsDropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Auto-focus search input when themes dropdown opens
    useEffect(() => {
        if (isDropdownOpen) {
            const timer = setTimeout(() => {
                searchInputRef.current?.focus();
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [isDropdownOpen]);
    const sectorStockDropdownRef = useRef<HTMLDivElement>(null);
    const captureRef = useRef<HTMLDivElement>(null);

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
        setVisibleColumns(["1D", "1W", "RS (20D)", "RS (50D)"]);
        setViewMode("grid");
    };

    // Calculate Sector Data
    const sectorData = useMemo(() => {
        const selectedConfigs = allConfigs.filter(c => selectedThemeIds.includes(c.id));
        
        const data = selectedConfigs.map(config => {
            // Find Performance
            const perf = performanceData.find(p => p["Theme/Index"] === config.title) || null;
            
            // Find Constituents
            const resolvedKey = resolveMarketStatusKey(config.title, statusKeys);
            const statusEntry = resolvedKey ? marketStatus[resolvedKey] : null;
            let tickers: string[] = [];
            if (statusEntry) {
                tickers = [...(statusEntry.above || []), ...(statusEntry.below || []), ...(statusEntry.new_stock || [])];
                // Deduplicate
                tickers = Array.from(new Set(tickers));
            }

            // Get Stock Performances
            const stocks = tickers.map(ticker => {
                const stockPerf = constituentPerformance[ticker] || null;
                
                return {
                    ticker,
                    label: getTickerLabel(ticker),
                    perf: stockPerf
                };
            });

            // Sort Stocks
            stocks.sort((a, b) => {
                const valA = a.perf ? (a.perf[stockSortCol as keyof ConstituentPerformance] as number) || 0 : 0;
                const valB = b.perf ? (b.perf[stockSortCol as keyof ConstituentPerformance] as number) || 0 : 0;
                return stockSortDesc ? valB - valA : valA - valB;
            });

            // Filter Stocks if specific ones are selected
            const selectedForThisSector = selectedStocksBySector[config.id] || [];
            const filteredStocks = selectedForThisSector.length > 0 
                ? stocks.filter(s => selectedForThisSector.includes(s.ticker))
                : stocks;

            return {
                config,
                perf,
                allStocks: stocks, // Keep all for the dropdown
                stocks: filteredStocks
            };
        });

        // Sort Sectors
        data.sort((a, b) => {
            const valA = a.perf ? (a.perf[sectorSortCol as keyof PerformanceRow] as number) || 0 : 0;
            const valB = b.perf ? (b.perf[sectorSortCol as keyof PerformanceRow] as number) || 0 : 0;
            return sectorSortDesc ? valB - valA : valA - valB;
        });

        return data;
    }, [allConfigs, selectedThemeIds, performanceData, marketStatus, constituentPerformance, statusKeys, sectorSortCol, sectorSortDesc, stockSortCol, stockSortDesc, selectedStocksBySector]);

    // Using shared formatReturn and getReturnColor from lib/utils.ts
    // to ensure consistent formatting with ConstituentTable

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
                                <span className="text-slate-500 text-sm pl-1">Select themes to compare...</span>
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
                        <div className="absolute z-50 top-full right-0 mt-2 w-48 bg-[#1a1a2e] border border-slate-700 rounded-lg shadow-2xl p-2 flex flex-col gap-1">
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

                {/* Actions */}
                <div className="flex items-center gap-3 pb-1 ml-auto">
                    <button
                        onClick={resetDefaults}
                        className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors bg-[#1a1a2e] border border-slate-700/60 rounded-md px-3 py-2 flex items-center h-[38px] mt-auto"
                        title="Reset all settings to default"
                    >
                        Reset Defaults
                    </button>
                    {/* View Toggle */}
                    <div className="flex bg-[#1a1a2e] border border-slate-700/60 rounded-md p-1 mt-auto h-[38px]">
                        <button
                            onClick={() => setViewMode("grid")}
                            className={`p-1.5 rounded transition-colors ${viewMode === "grid" ? "bg-blue-500/20 text-blue-400" : "text-slate-500 hover:text-slate-300"}`}
                            title="Grid View"
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode("stack")}
                            className={`p-1.5 rounded transition-colors ${viewMode === "stack" ? "bg-blue-500/20 text-blue-400" : "text-slate-500 hover:text-slate-300"}`}
                            title="Vertical Stack View"
                        >
                            <List size={16} />
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

                    <div className="mt-auto h-[38px]">
                        <CaptureScreenshot 
                            targetRef={captureRef} 
                            filename="Stocks_Master"
                            label="Screenshot"
                        />
                    </div>
                </div>
            </div>

            {/* Display Area */}
            {sectorData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-4 text-center border border-dashed border-slate-700/50 rounded-xl">
                    <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4 text-slate-500">
                        <CheckSquare size={24} />
                    </div>
                    <h3 className="text-lg font-medium text-slate-300 mb-2">No Themes Selected</h3>
                    <p className="text-slate-500 text-sm max-w-md">
                        Use the dropdown above to select themes or sectors. They will be displayed here as master lists, fully sorted based on your preferences.
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
                            <div key={group.config.id} className="bg-[#111118] border border-[#1e1e2e] rounded-xl flex flex-col shadow-lg">
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
                                                {formatReturn(secVal as number)}
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
                                                {/* Dynamic Headers */}
                                                {METRIC_CONFIG.filter(opt => visibleColumns.includes(opt.stockValue)).map(opt => (
                                                    <th key={opt.stockValue} className="px-3 py-2 text-right">{opt.label}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/60 font-mono">
                                            {group.stocks.map((stock) => {
                                                return (
                                                    <tr key={stock.ticker} className="hover:bg-white/[0.02] transition-colors">
                                                        <td className="px-4 py-2">
                                                            <a href={makeTradingViewUrl(stock.ticker)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 font-sans font-medium">
                                                                {stock.label}
                                                            </a>
                                                        </td>
                                                        {/* Dynamic Cells */}
                                                        {METRIC_CONFIG.filter(opt => visibleColumns.includes(opt.stockValue)).map(opt => {
                                                            const val = stock.perf?.[opt.stockValue as keyof ConstituentPerformance] as number;

                                                            return (
                                                                <td key={opt.stockValue} className={`px-3 py-2 text-right ${getReturnColor(val)}`}>
                                                                    {formatReturn(val)}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })}
                                            {group.stocks.length === 0 && (
                                                <tr>
                                                    <td colSpan={visibleColumns.length + 1} className="px-4 py-6 text-center text-slate-600 font-sans italic">
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
            )}
        </div>
    );
}
