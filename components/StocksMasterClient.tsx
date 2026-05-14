"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Search, X, Check, ChevronDown, ChevronUp, Download, CheckSquare } from "lucide-react";
import { IndexConfig, PerformanceRow, MarketStatus, ConstituentPerformanceMap, ConstituentPerformance } from "@/types";
import { getTickerLabel, makeTradingViewUrl } from "@/lib/utils";
import { CaptureScreenshot } from "@/components/common/CaptureScreenshot";

interface StocksMasterClientProps {
    allConfigs: IndexConfig[];
    performanceData: PerformanceRow[];
    marketStatus: MarketStatus;
    constituentPerformance: ConstituentPerformanceMap;
}

const ALIASES: Record<string, string> = {
    "amc": "asset management",
    "renewable energy": "renewable energy generation",
    "nifty oil & gas": "nifty oil and gas",
    "jewellery & gold": "jewellery (gold)",
    "tyres & rubber": "tyres & rubber products",
    "auto ancillary": "auto ancillary",
    "white goods": "white goods & durables",
    "wires & cables": "wires and cables",
};

function resolveMarketStatusKey(configTitle: string, statusKeys: string[]) {
    if (statusKeys.includes(configTitle)) return configTitle;
    const upperKey = configTitle.toUpperCase();
    if (statusKeys.includes(upperKey)) return upperKey;
    if (configTitle.startsWith("Nifty ")) {
        const niftyUpper = "NIFTY " + configTitle.slice(6).toUpperCase();
        if (statusKeys.includes(niftyUpper)) return niftyUpper;
    }
    const lowerTitle = configTitle.toLowerCase();
    const resolvedTitle = ALIASES[lowerTitle] || lowerTitle;
    return statusKeys.find(k => k.toLowerCase() === resolvedTitle) || null;
}

const SORT_OPTIONS = [
    { label: "1 Day", value: "1 Day", stockValue: "1D" },
    { label: "1 Week", value: "1 Week", stockValue: "1W" },
    { label: "1 Month", value: "1 Month", stockValue: "1M" },
    { label: "3 Months", value: "3 Months", stockValue: "3M" },
    { label: "6 Months", value: "6 Months", stockValue: "6M" },
    { label: "1 Year", value: "1 Year", stockValue: "1Y" },
    { label: "RS (20D)", value: "RS (20D)", stockValue: "RS (20D)" },
    { label: "RS (50D)", value: "RS (50D)", stockValue: "RS (50D)" },
];

export function StocksMasterClient({ allConfigs, performanceData, marketStatus, constituentPerformance }: StocksMasterClientProps) {
    const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    
    const [sectorSortCol, setSectorSortCol] = useState<keyof PerformanceRow>("1 Week");
    const [sectorSortDesc, setSectorSortDesc] = useState(true);
    
    const [stockSortCol, setStockSortCol] = useState<keyof ConstituentPerformance>("1W");
    const [stockSortDesc, setStockSortDesc] = useState(true);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const captureRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const statusKeys = useMemo(() => Object.keys(marketStatus), [marketStatus]);

    const filteredConfigs = useMemo(() => {
        if (!searchQuery) return allConfigs;
        const lowerQ = searchQuery.toLowerCase();
        return allConfigs.filter(c => c.title.toLowerCase().includes(lowerQ));
    }, [allConfigs, searchQuery]);

    const toggleTheme = (id: string) => {
        setSelectedThemeIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const clearSelection = () => {
        setSelectedThemeIds([]);
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
                let stockPerf: ConstituentPerformance | null = null;
                // Search constituentPerformance (it's keyed by something, wait... no, it's flat! 
                // Wait, constituentPerformance is `Record<string, Record<string, ConstituentPerformance>>`?
                // Actually `Record<string, ConstituentPerformance>` if it's flat ticker->perf. Let's check type:
                // Types says `Record<string, Record<string, ConstituentPerformance>>`. That means it's grouped. By what?
                // Wait, let's look at the structure I dumped earlier. 
                // Ah, my dump was `{"GODREJPROP.NS": {"1D": ...}}`. That's `Record<string, ConstituentPerformance>`.
                // I will safely traverse it.
                if ((constituentPerformance as any)[ticker]) {
                    stockPerf = (constituentPerformance as any)[ticker];
                } else {
                    // Maybe nested? Let's search keys just in case
                    for (const groupKey of Object.keys(constituentPerformance)) {
                        if ((constituentPerformance as any)[groupKey][ticker]) {
                            stockPerf = (constituentPerformance as any)[groupKey][ticker];
                            break;
                        }
                    }
                }
                
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

            return {
                config,
                perf,
                stocks
            };
        });

        // Sort Sectors
        data.sort((a, b) => {
            const valA = a.perf ? (a.perf[sectorSortCol as keyof PerformanceRow] as number) || 0 : 0;
            const valB = b.perf ? (b.perf[sectorSortCol as keyof PerformanceRow] as number) || 0 : 0;
            return sectorSortDesc ? valB - valA : valA - valB;
        });

        return data;
    }, [allConfigs, selectedThemeIds, performanceData, marketStatus, constituentPerformance, statusKeys, sectorSortCol, sectorSortDesc, stockSortCol, stockSortDesc]);

    const formatPct = (val?: number | null) => {
        if (val == null) return "—";
        return `${val > 0 ? "+" : ""}${val.toFixed(2)}%`;
    };

    const formatNum = (val?: number | null) => {
        if (val == null) return "—";
        return val.toFixed(2);
    };

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
                        <div className="absolute z-50 top-full left-0 w-full mt-2 bg-[#1a1a2e] border border-slate-700 rounded-lg shadow-2xl max-h-[350px] flex flex-col overflow-hidden">
                            <div className="p-2 border-b border-slate-700/50 relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
                                <input 
                                    type="text" 
                                    placeholder="Search sectors..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-[#111118] border border-slate-700 rounded py-1.5 pl-9 pr-3 text-sm text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div className="overflow-y-auto flex-1 p-1">
                                {filteredConfigs.map(config => (
                                    <button
                                        key={config.id}
                                        onClick={() => toggleTheme(config.id)}
                                        className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-blue-500/10 hover:text-blue-400 rounded flex items-center justify-between"
                                    >
                                        {config.title}
                                        {selectedThemeIds.includes(config.id) && <Check size={14} className="text-blue-500" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Sector Sorting */}
                <div className="flex flex-col gap-1.5 min-w-[200px]">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sort Sectors By</label>
                    <div className="flex bg-[#1a1a2e] border border-slate-700/60 rounded-md">
                        <select 
                            value={sectorSortCol}
                            onChange={(e) => setSectorSortCol(e.target.value as keyof PerformanceRow)}
                            className="bg-transparent text-sm text-slate-200 px-3 py-2 flex-1 focus:outline-none appearance-none cursor-pointer"
                        >
                            {SORT_OPTIONS.map(opt => (
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
                <div className="flex flex-col gap-1.5 min-w-[200px]">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sort Stocks By</label>
                    <div className="flex bg-[#1a1a2e] border border-slate-700/60 rounded-md">
                        <select 
                            value={stockSortCol}
                            onChange={(e) => setStockSortCol(e.target.value as keyof ConstituentPerformance)}
                            className="bg-transparent text-sm text-slate-200 px-3 py-2 flex-1 focus:outline-none appearance-none cursor-pointer"
                        >
                            {SORT_OPTIONS.map(opt => (
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

                {/* Actions */}
                <div className="flex items-center gap-3 pb-1">
                    {selectedThemeIds.length > 0 && (
                        <button
                            onClick={clearSelection}
                            className="text-xs text-slate-500 hover:text-red-400 underline transition-colors"
                        >
                            Clear
                        </button>
                    )}
                    <CaptureScreenshot 
                        targetRef={captureRef}
                        filename="Stocks_Master"
                        label="Screenshot"
                    />
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
                    className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 bg-[#0a0a0f] p-2 rounded-xl"
                >
                    {sectorData.map(group => {
                        const secVal = group.perf ? group.perf[sectorSortCol as keyof PerformanceRow] : null;
                        return (
                            <div key={group.config.id} className="bg-[#111118] border border-[#1e1e2e] rounded-xl overflow-hidden flex flex-col shadow-lg">
                                {/* Sector Header */}
                                <div className="bg-gradient-to-r from-slate-900 to-[#111118] p-4 border-b border-slate-800">
                                    <div className="flex justify-between items-start mb-2">
                                        <h2 className="text-base font-bold text-slate-200">{group.config.title}</h2>
                                        <div className={`text-sm font-semibold px-2 py-0.5 rounded ${
                                            (secVal as number) > 0 ? "bg-emerald-500/10 text-emerald-400" : 
                                            (secVal as number) < 0 ? "bg-red-500/10 text-red-400" : 
                                            "bg-slate-500/10 text-slate-400"
                                        }`}>
                                            {sectorSortCol.includes("RS") ? formatNum(secVal as number) : formatPct(secVal as number)}
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
                                                <th className="px-3 py-2 text-right">1D</th>
                                                <th className="px-3 py-2 text-right">1W</th>
                                                <th className="px-3 py-2 text-right">1M</th>
                                                <th className="px-4 py-2 text-right">RS(20D)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/60 font-mono">
                                            {group.stocks.map((stock) => {
                                                const d1 = stock.perf?.["1D"];
                                                const w1 = stock.perf?.["1W"];
                                                const m1 = stock.perf?.["1M"];
                                                const rs20 = stock.perf?.["RS (20D)"];
                                                
                                                return (
                                                    <tr key={stock.ticker} className="hover:bg-white/[0.02] transition-colors">
                                                        <td className="px-4 py-2">
                                                            <a href={makeTradingViewUrl(stock.ticker)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 font-sans font-medium">
                                                                {stock.label}
                                                            </a>
                                                        </td>
                                                        <td className={`px-3 py-2 text-right ${!d1 ? "text-slate-600" : d1 > 0 ? "text-emerald-400" : d1 < 0 ? "text-red-400" : "text-slate-400"}`}>
                                                            {formatPct(d1)}
                                                        </td>
                                                        <td className={`px-3 py-2 text-right ${!w1 ? "text-slate-600" : w1 > 0 ? "text-emerald-400" : w1 < 0 ? "text-red-400" : "text-slate-400"}`}>
                                                            {formatPct(w1)}
                                                        </td>
                                                        <td className={`px-3 py-2 text-right ${!m1 ? "text-slate-600" : m1 > 0 ? "text-emerald-400" : m1 < 0 ? "text-red-400" : "text-slate-400"}`}>
                                                            {formatPct(m1)}
                                                        </td>
                                                        <td className={`px-4 py-2 text-right ${!rs20 ? "text-slate-600" : rs20 > 100 ? "text-emerald-400" : "text-red-400"}`}>
                                                            {formatNum(rs20)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {group.stocks.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-4 py-6 text-center text-slate-600 font-sans italic">
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
