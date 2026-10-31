"use client";

import { AgGridReact } from "ag-grid-react";
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import type { ColDef, ValueFormatterParams, CellClassParams, IRowNode, SelectionChangedEvent } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { PerformanceRow, MarketStatus, AllThemesBreadthMap, ThemeBreadthSummaryMetrics, DailyBreadthHistory1Y } from "@/types";
import { ALL_CONFIGS, METRIC_CONFIG } from "@/lib/config";
import { formatMetricReturn } from "@/lib/metrics";
import { makeTradingViewUrl, resolveDataKey } from "@/lib/utils";
import { CategoryFilter, getCategoryForTitle } from "@/components/common/CategoryFilter";
import { Columns, ChevronDown, AlertCircle, Search, X, CheckSquare, ExternalLink, BarChart2, TrendingUp, Layers, Zap, Calendar, RotateCcw } from "lucide-react";
import { CaptureScreenshot } from "@/components/common/CaptureScreenshot";
import { CopyWatchlistButton } from "@/components/common/CopyWatchlistButton";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { GAINER_TIMEFRAMES, GainerTimeframe } from "@/lib/metrics";

ModuleRegistry.registerModules([AllCommunityModule]);

export type HeatmapViewMode = "returns" | "breadth" | "combined" | "forecaster";

interface PerformanceHeatmapProps {
    data: PerformanceRow[];
    globalLatestDate?: string | null;
    marketStatus?: MarketStatus;
    breadthMetrics?: AllThemesBreadthMap;
    availableDates?: string[];
}

const myTheme = themeQuartz.withParams({
    backgroundColor: "#111118",
    foregroundColor: "#e2e8f0",
    headerBackgroundColor: "#0d0d14",
    headerTextColor: "#94a3b8",
    borderColor: "#1e1e2e",
    rowHoverColor: "#1a1a2e",
    fontFamily: "Inter, sans-serif",
    fontSize: 13,
    headerFontSize: 12,
    oddRowBackgroundColor: "#0f0f17",
});

function getHeatmapStyle(params: CellClassParams): { [key: string]: string } | undefined {
    if (!params.value && params.value !== 0) return undefined;
    const v = Number(params.value);
    if (isNaN(v)) return undefined;

    const intensity = Math.min(Math.abs(v) / 30, 1);
    if (v > 0) {
        return {
            backgroundColor: `rgba(34, 197, 94, ${0.1 + intensity * 0.35})`,
            color: "#4ade80",
            fontWeight: "500",
        };
    } else if (v < 0) {
        return {
            backgroundColor: `rgba(239, 68, 68, ${0.1 + intensity * 0.35})`,
            color: "#f87171",
            fontWeight: "500",
        };
    }
    return { color: "#94a3b8" };
}

function getBreadthHeatmapStyle(params: CellClassParams): { [key: string]: string } | undefined {
    if (params.value === null || params.value === undefined || params.value === "") return undefined;
    const v = Number(params.value);
    if (isNaN(v)) return undefined;

    if (v >= 50) {
        const intensity = (v - 50) / 50; // 0 to 1
        return {
            backgroundColor: `rgba(34, 197, 94, ${0.1 + intensity * 0.35})`,
            color: "#4ade80",
            fontWeight: "500",
        };
    } else {
        const intensity = (50 - v) / 50; // 0 to 1
        return {
            backgroundColor: `rgba(239, 68, 68, ${0.1 + intensity * 0.35})`,
            color: "#f87171",
            fontWeight: "500",
        };
    }
}

function returnFormatter(params: ValueFormatterParams): string {
    return formatMetricReturn(params.value == null || params.value === "" ? undefined : Number(params.value));
}

const returnColumns = METRIC_CONFIG.map(m => m.label);

const TIMEFRAME_TO_METRIC_COL: Record<GainerTimeframe, string> = {
    "1D": "1 Day",
    "1W": "1 Week",
    "1M": "1 Month",
    "3M": "3 Months",
    "6M": "6 Months",
    "YTD": "YTD",
    "1Y": "1 Year",
};

function lookupThemeBreadth(title: string, metrics?: AllThemesBreadthMap): ThemeBreadthSummaryMetrics | null {
    if (!metrics) return null;
    if (metrics[title]) return metrics[title];
    const upper = title.toUpperCase();
    if (metrics[upper]) return metrics[upper];
    if (title.startsWith("Nifty ")) {
        const niftyUpper = "NIFTY " + title.slice(6).toUpperCase();
        if (metrics[niftyUpper]) return metrics[niftyUpper];
    }
    const resolvedTitle = resolveDataKey(title);
    for (const key of Object.keys(metrics)) {
        if (key.toLowerCase() === resolvedTitle) return metrics[key];
    }
    return null;
}

export const MODEL1 = {
    intercept: -0.30206,
    coef_1w: 0.00726,
    coef_1m: -0.03215,
    coef_interaction: 0.01895,
    coef_200sma: 0.00249,
};

export function computeExpansionOdds(b1w: number, b1m: number, b200sma: number): number {
    const interaction = (b1w * (100 - b1m)) / 100;
    const z = MODEL1.intercept +
        MODEL1.coef_1w * b1w +
        MODEL1.coef_1m * b1m +
        MODEL1.coef_interaction * interaction +
        MODEL1.coef_200sma * b200sma;
    const p = 1 / (1 + Math.exp(-z));
    return Number((p * 100).toFixed(1));
}

export const REGIME_CONFIGS: Record<string, {
    code: string;
    badge: string;
    name: string;
    guidance: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
}> = {
    pullback_thrust: {
        code: "pullback_thrust",
        badge: "🚀 Pullback Thrust",
        name: "Bull Pullback Thrust",
        guidance: "High conviction (61% 20D win rate, 1.88 PF, 70% breadth expansion)",
        bgClass: "bg-emerald-950/80",
        textClass: "text-emerald-300",
        borderClass: "border-emerald-600/80 shadow-sm shadow-emerald-500/20",
    },
    bear_bounce: {
        code: "bear_bounce",
        badge: "⚠️ Bear Bounce Thrust",
        name: "Bear Bounce Thrust",
        guidance: "High expansion (65%), near-term supply digestion (48%-50% 10D win rate)",
        bgClass: "bg-amber-950/80",
        textClass: "text-amber-300",
        borderClass: "border-amber-600/80 shadow-sm shadow-amber-500/20",
    },
    early_thrust: {
        code: "early_thrust",
        badge: "🚀 Early Thrust",
        name: "Early Breadth Thrust",
        guidance: "Rapid thrust into oversold base (65%-70% expansion odds)",
        bgClass: "bg-cyan-950/80",
        textClass: "text-cyan-300",
        borderClass: "border-cyan-600/80 shadow-sm shadow-cyan-500/20",
    },
    sustained_bull: {
        code: "sustained_bull",
        badge: "🔥 Sustained Bull",
        name: "Sustained Bull Trend",
        guidance: "Max price alpha (67.5% win rate, +2.67% med return, 3.15 PF at T+20)",
        bgClass: "bg-emerald-900/60",
        textClass: "text-emerald-200",
        borderClass: "border-emerald-500/60",
    },
    rollover_alert: {
        code: "rollover_alert",
        badge: "⚠️ Rollover Alert",
        name: "Breadth Rollover Alert",
        guidance: "Internal decay; high risk of pullback in next 5-10 sessions",
        bgClass: "bg-orange-950/80",
        textClass: "text-orange-300",
        borderClass: "border-orange-600/80",
    },
    capitulation: {
        code: "capitulation",
        badge: "🩸 Capitulation Slump",
        name: "Capitulation Slump",
        guidance: "Deep oversold base; wait for 1W thrust before entering",
        bgClass: "bg-rose-950/80",
        textClass: "text-rose-300",
        borderClass: "border-rose-600/80",
    },
    accumulation: {
        code: "accumulation",
        badge: "🌱 Accumulation",
        name: "Oversold Accumulation",
        guidance: "Bottom-fishing reversal taking root; monitor for 1W thrust",
        bgClass: "bg-lime-950/70",
        textClass: "text-lime-300",
        borderClass: "border-lime-600/70",
    },
    neutral: {
        code: "neutral",
        badge: "⚖️ Neutral / Mixed",
        name: "Neutral / Mixed",
        guidance: "Balanced participation; rotational churn",
        bgClass: "bg-slate-900/80",
        textClass: "text-slate-400",
        borderClass: "border-slate-700/60",
    },
};

export function classifyRegimeTS(b1w: number, b1m: number, b200sma: number) {
    if (b1w >= 70 && b1m <= 35) {
        if (b200sma >= 50) return REGIME_CONFIGS.pullback_thrust;
        if (b200sma < 35) return REGIME_CONFIGS.bear_bounce;
        return REGIME_CONFIGS.early_thrust;
    }
    if (b1w >= 60 && b1m >= 60 && b200sma >= 60) return REGIME_CONFIGS.sustained_bull;
    if (b1w <= 30 && b1m >= 60) return REGIME_CONFIGS.rollover_alert;
    if (b1w <= 25 && b1m <= 25 && b200sma <= 25) return REGIME_CONFIGS.capitulation;
    if (b1w >= 50 && b200sma <= 30) return REGIME_CONFIGS.accumulation;
    return REGIME_CONFIGS.neutral;
}

export function formatDateLabel(dateStr?: string | null): string {
    if (!dateStr) return "Latest";
    try {
        const d = new Date(dateStr + "T00:00:00");
        return d.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    } catch {
        return dateStr;
    }
}

function unpackHistoricalSession(rows: (string | number | null)[][], showCagr: boolean = false): any[] {
    return rows.map((r) => {
        const theme = String(r[0]);
        const r1d = r[1] !== null ? Number(r[1]) : null;
        const r1w = r[2] !== null ? Number(r[2]) : null;
        const r1m = r[3] !== null ? Number(r[3]) : null;
        const r3m = r[4] !== null ? Number(r[4]) : null;
        const r6m = r[5] !== null ? Number(r[5]) : null;
        const rytd = r[6] !== null ? Number(r[6]) : null;
        const r1y = r[7] !== null ? Number(r[7]) : null;
        let r3y = r[8] !== null ? Number(r[8]) : null;
        let r5y = r[9] !== null ? Number(r[9]) : null;
        const rs5d = r[10] !== null ? Number(r[10]) : null;
        const rs10d = r[11] !== null ? Number(r[11]) : null;
        const rs20d = r[12] !== null ? Number(r[12]) : null;
        const rs50d = r[13] !== null ? Number(r[13]) : null;
        const rs = r[14] !== null ? Number(r[14]) : null;
        const tot = Number(r[15] ?? 0);
        const a200 = Number(r[16] ?? 0);
        const b200 = Number(r[17] ?? 0);
        const p200 = Number(r[18] ?? 0);
        const g1d = r[19] !== null ? Number(r[19]) : null;
        const g1w = r[20] !== null ? Number(r[20]) : null;
        const g1m = r[21] !== null ? Number(r[21]) : null;
        const g3m = r[22] !== null ? Number(r[22]) : null;
        const g6m = r[23] !== null ? Number(r[23]) : null;
        const gytd = r[24] !== null ? Number(r[24]) : null;
        const g1y = r[25] !== null ? Number(r[25]) : null;
        const velo = r[26] !== null ? Number(r[26]) : 0;
        const odds = r[27] !== null ? Number(r[27]) : 0;
        const regimeCode = String(r[28] || "neutral");
        const regConfig = REGIME_CONFIGS[regimeCode] || REGIME_CONFIGS.neutral;

        if (showCagr) {
            if (typeof r3y === "number" && r3y !== null) {
                r3y = (Math.pow(1 + r3y / 100, 1 / 3) - 1) * 100;
            }
            if (typeof r5y === "number" && r5y !== null) {
                r5y = (Math.pow(1 + r5y / 100, 1 / 5) - 1) * 100;
            }
        }

        const timeframes: Record<string, any> = {
            "1D": { pct: g1d ?? 0, gained: Math.round(((g1d ?? 0) / 100) * tot), total: tot, declined: 0, flat: 0, unlisted: 0 },
            "1W": { pct: g1w ?? 0, gained: Math.round(((g1w ?? 0) / 100) * tot), total: tot, declined: 0, flat: 0, unlisted: 0 },
            "1M": { pct: g1m ?? 0, gained: Math.round(((g1m ?? 0) / 100) * tot), total: tot, declined: 0, flat: 0, unlisted: 0 },
            "3M": { pct: g3m ?? 0, gained: Math.round(((g3m ?? 0) / 100) * tot), total: tot, declined: 0, flat: 0, unlisted: 0 },
            "6M": { pct: g6m ?? 0, gained: Math.round(((g6m ?? 0) / 100) * tot), total: tot, declined: 0, flat: 0, unlisted: 0 },
            "YTD": { pct: gytd ?? 0, gained: Math.round(((gytd ?? 0) / 100) * tot), total: tot, declined: 0, flat: 0, unlisted: 0 },
            "1Y": { pct: g1y ?? 0, gained: Math.round(((g1y ?? 0) / 100) * tot), total: tot, declined: 0, flat: 0, unlisted: 0 },
        };

        const breadthObj: ThemeBreadthSummaryMetrics = {
            theme,
            totalStocks: tot,
            above200Sma: a200,
            below200Sma: b200,
            pctAbove200Sma: p200,
            timeframes,
        };

        return {
            "Theme/Index": theme,
            "1 Day": r1d,
            "1 Week": r1w,
            "1 Month": r1m,
            "3 Months": r3m,
            "6 Months": r6m,
            "YTD": rytd,
            "1 Year": r1y,
            "3 Years": r3y,
            "5 Years": r5y,
            "RS (5D)": rs5d,
            "RS (10D)": rs10d,
            "RS (20D)": rs20d,
            "RS (50D)": rs50d,
            "RS Rating": rs,
            "IBD RS Rating": rs,
            breadth: breadthObj,
            breadth_totalStocks: tot,
            breadth_above200Sma: a200,
            breadth_below200Sma: b200,
            breadth_pctAbove200Sma: p200,
            breadth_1D_pct: g1d,
            breadth_1W_pct: g1w,
            breadth_1M_pct: g1m,
            breadth_3M_pct: g3m,
            breadth_6M_pct: g6m,
            breadth_YTD_pct: gytd,
            breadth_1Y_pct: g1y,
            breadth_velocity: velo,
            expansion_odds: odds,
            regime: regimeCode,
            forward_guidance: regConfig.guidance,
        };
    });
}

export function PerformanceHeatmap({ data, globalLatestDate, marketStatus, breadthMetrics, availableDates }: PerformanceHeatmapProps) {
    const [viewMode, setViewMode] = useLocalStorage<HeatmapViewMode>("ph_viewMode", "returns");
    const [showCagr, setShowCagr] = useLocalStorage("ph_showCagr", false);
    const [searchQuery, setSearchQuery] = useState("");
    const [displayedCount, setDisplayedCount] = useState<number>(data.length);

    // Time-Travel / Historical Replay State
    const [selectedDate, setSelectedDate] = useState<string>("latest");
    const [historyData, setHistoryData] = useState<DailyBreadthHistory1Y | null>(null);
    const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState<boolean>(false);
    const [dateSearchQuery, setDateSearchQuery] = useState<string>("");
    const dateDropdownRef = useRef<HTMLDivElement>(null);

    // Fetch rolling 1Y history on mount
    useEffect(() => {
        let isMounted = true;
        async function loadHistory() {
            if (historyData) return;
            setIsLoadingHistory(true);
            try {
                const res = await fetch("/data/history/daily_breadth_history_1y.json");
                if (res.ok) {
                    const json: DailyBreadthHistory1Y = await res.json();
                    if (isMounted) {
                        setHistoryData(json);
                    }
                }
            } catch (err) {
                console.warn("Could not load daily_breadth_history_1y.json", err);
            } finally {
                if (isMounted) setIsLoadingHistory(false);
            }
        }
        loadHistory();
        return () => { isMounted = false; };
    }, [historyData]);

    const selectableDates = useMemo(() => {
        if (historyData?.dates && historyData.dates.length > 0) {
            return historyData.dates;
        }
        if (availableDates && availableDates.length > 0) {
            return availableDates;
        }
        return globalLatestDate ? [globalLatestDate] : [];
    }, [historyData, availableDates, globalLatestDate]);

    const filteredDates = useMemo(() => {
        // Exclude newest session since it is already represented by 'Latest Session (Live)' at the top
        const pastDates = selectableDates.slice(1);
        if (!dateSearchQuery.trim()) return pastDates;
        const q = dateSearchQuery.toLowerCase();
        return pastDates.filter(d => {
            if (d.toLowerCase().includes(q)) return true;
            const formatted = formatDateLabel(d).toLowerCase();
            return formatted.includes(q);
        });
    }, [selectableDates, dateSearchQuery]);

    // Close date dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dateDropdownRef.current && !dateDropdownRef.current.contains(event.target as Node)) {
                setIsDateDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showSelectedOnly, setShowSelectedOnly] = useLocalStorage("ph_showSelectedOnly", false);
    
    // Set is not serializable for localStorage directly, so we store string[] and convert
    const [selectedThemesArr, setSelectedThemesArr] = useLocalStorage<string[]>("ph_selectedThemes", []);
    const selectedThemes = useMemo(() => new Set(selectedThemesArr), [selectedThemesArr]);
    
    // Category filters
    const [showBroadMarket, setShowBroadMarket] = useLocalStorage("ph_showBroadMarket", true);
    const [showSectors, setShowSectors] = useLocalStorage("ph_showSectors", true);
    const [showIndustries, setShowIndustries] = useLocalStorage("ph_showIndustries", true);
    
    const dropdownRef = useRef<HTMLDivElement>(null);
    const gridRef = useRef<AgGridReact>(null);
    const tableRef = useRef<HTMLDivElement>(null);

    const [visibleColumns, setVisibleColumns] = useLocalStorage<Record<string, boolean>>("ph_visibleColumns", () => {
        const initial: Record<string, boolean> = {};
        returnColumns.forEach(c => initial[c] = true);
        return initial;
    });

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const onSelectionChanged = useCallback((event: SelectionChangedEvent) => {
        const selectedNodes = event.api.getSelectedNodes();
        const selectedIds = selectedNodes.map(node => node.data["Theme/Index"]);
        setSelectedThemesArr(selectedIds);
    }, [setSelectedThemesArr]);

    const getThemeTickers = useCallback((themes: string[]): string[] => {
        if (!marketStatus) return [];
        const allTickers = new Set<string>();

        themes.forEach(title => {
            let statusKey = "";
            const resolvedTitle = resolveDataKey(title);

            for (const key of Object.keys(marketStatus)) {
                if (key.toLowerCase() === resolvedTitle) {
                    statusKey = key;
                    break;
                }
            }

            if (!statusKey) {
                const upperKey = title.toUpperCase();
                if (marketStatus[upperKey]) statusKey = upperKey;
                else if (title.startsWith("Nifty ")) {
                    const niftyUpper = "NIFTY " + title.slice(6).toUpperCase();
                    if (marketStatus[niftyUpper]) statusKey = niftyUpper;
                }
            }

            if (statusKey && marketStatus[statusKey]) {
                const s = marketStatus[statusKey];
                [...(s.above || []), ...(s.below || []), ...(s.new_stock || [])].forEach(t => allTickers.add(t));
            }
        });

        return Array.from(allTickers);
    }, [marketStatus]);

    const getActiveTickers = useCallback((): string[] => {
        if (selectedThemes.size > 0) {
            return getThemeTickers(Array.from(selectedThemes));
        }

        const api = gridRef.current?.api;
        const visibleThemes: string[] = [];
        if (api) {
            api.forEachNodeAfterFilterAndSort((node) => {
                if (node.data?.["Theme/Index"]) {
                    visibleThemes.push(node.data["Theme/Index"]);
                }
            });
        }
        const themes = visibleThemes.length > 0 ? visibleThemes : data.map(r => r["Theme/Index"]);
        return getThemeTickers(themes);
    }, [selectedThemes, getThemeTickers, data]);

    const handleOpenTabs = useCallback(() => {
        const tickersToOpen = getActiveTickers();
        if (tickersToOpen.length === 0) return;

        // Limit opening tabs to 25 to prevent browser hanging
        if (tickersToOpen.length > 25) {
            alert(`Opening ${tickersToOpen.length} tabs might slow down your browser. Please use the "Copy Watchlist" button instead and paste it directly into TradingView.`);
            return;
        }

        tickersToOpen.forEach((ticker, index) => {
            setTimeout(() => {
                const url = makeTradingViewUrl(ticker);
                window.open(url, "_blank");
            }, index * 150);
        });
    }, [getActiveTickers]);

    // Augment data with precomputed breadth metrics and CAGR transforms
    const displayData = useMemo(() => {
        return data.map((row) => {
            const title = row["Theme/Index"];
            const breadth = breadthMetrics ? lookupThemeBreadth(title, breadthMetrics) : null;

            const augmented: any = {
                ...row,
                breadth,
                breadth_totalStocks: breadth?.totalStocks ?? null,
                breadth_pctAbove200Sma: breadth?.pctAbove200Sma ?? null,
                breadth_above200Sma: breadth?.above200Sma ?? null,
                breadth_below200Sma: breadth?.below200Sma ?? null,
            };

            if (breadth) {
                for (const tf of GAINER_TIMEFRAMES) {
                    const stat = breadth.timeframes?.[tf];
                    augmented[`breadth_${tf}_pct`] = stat ? stat.pct : null;
                    augmented[`breadth_${tf}_gained`] = stat ? stat.gained : null;
                    augmented[`breadth_${tf}_total`] = stat ? stat.total : null;
                    augmented[`breadth_${tf}_declined`] = stat ? stat.declined : null;
                    augmented[`breadth_${tf}_flat`] = stat ? stat.flat : null;
                    augmented[`breadth_${tf}_unlisted`] = stat ? stat.unlisted : null;
                }
            }

            if (showCagr) {
                if (typeof augmented["3 Years"] === "number" && augmented["3 Years"] !== null) {
                    augmented["3 Years"] = (Math.pow(1 + augmented["3 Years"] / 100, 1 / 3) - 1) * 100;
                }
                if (typeof augmented["5 Years"] === "number" && augmented["5 Years"] !== null) {
                    augmented["5 Years"] = (Math.pow(1 + augmented["5 Years"] / 100, 1 / 5) - 1) * 100;
                }
            }

            const g1w = augmented[`breadth_1W_pct`];
            const g1m = augmented[`breadth_1M_pct`];
            const p200 = augmented[`breadth_pctAbove200Sma`] ?? 0;
            if (g1w !== null && g1w !== undefined && g1m !== null && g1m !== undefined) {
                const velo = Number((g1w - g1m).toFixed(1));
                const odds = computeExpansionOdds(g1w, g1m, p200);
                const regObj = classifyRegimeTS(g1w, g1m, p200);
                augmented.breadth_velocity = velo;
                augmented.expansion_odds = odds;
                augmented.regime = regObj.code;
                augmented.forward_guidance = regObj.guidance;
            } else {
                augmented.breadth_velocity = null;
                augmented.expansion_odds = null;
                augmented.regime = "neutral";
                augmented.forward_guidance = REGIME_CONFIGS.neutral.guidance;
            }

            return augmented;
        });
    }, [data, showCagr, breadthMetrics]);

    const activeData = useMemo(() => {
        if (selectedDate !== "latest" && historyData?.sessions?.[selectedDate]) {
            return unpackHistoricalSession(historyData.sessions[selectedDate], showCagr);
        }
        return displayData;
    }, [selectedDate, historyData, displayData, showCagr]);

    // Synchronize AgGrid sort state on viewMode switch
    useEffect(() => {
        const api = gridRef.current?.api;
        if (!api) return;
        const storedState = window.localStorage.getItem(`agGridState_heatmap_${viewMode}`);
        if (storedState) {
            try {
                const parsed = JSON.parse(storedState);
                if (Array.isArray(parsed)) {
                    const sortState = parsed
                        .filter((s: any) => s.sort != null)
                        .map((s: any) => ({ colId: s.colId, sort: s.sort, sortIndex: s.sortIndex }));
                    if (sortState.length > 0) {
                        api.applyColumnState({ state: sortState, applyOrder: false });
                        return;
                    }
                }
            } catch (e) {
                console.warn("Failed to apply AG grid sort state", e);
            }
        }
        if (viewMode === "forecaster") {
            api.applyColumnState({
                state: [{ colId: "breadth_velocity", sort: "desc" }],
                defaultState: { sort: null },
            });
        }
    }, [viewMode]);

    useEffect(() => {
        setDisplayedCount(activeData.length);
    }, [activeData.length]);

    const numberFilterParams = {
        filterOptions: [
            "greaterThan",
            "greaterThanOrEqual",
            "lessThan",
            "lessThanOrEqual",
            "inRange",
            "equals",
            "notEqual",
            "blank",
            "notBlank",
        ],
        defaultOption: "greaterThan",
        maxNumConditions: 2,
        buttons: ["apply", "reset"],
        closeOnApply: true,
    };

    const themeRenderer = useCallback((params: { value: string }) => {
        if (!params.value) return null;
        const config = ALL_CONFIGS.find((c) => c.title === params.value);
        if (!config) return <span className="text-white font-medium">{params.value}</span>;

        let path = "";
        if (config.category === "broad-market") path = `/broad-market/${config.id}`;
        else if (config.category === "sectors") path = `/sectors/${config.id}`;
        else if (config.category === "industries") path = `/industries/${config.id}`;

        return (
            <a href={path} className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                {params.value}
            </a>
        );
    }, []);

    const rsRatingCol: ColDef = useMemo(() => ({
        headerName: "RS Rating",
        field: "RS Rating",
        valueGetter: (params) => params.data?.["RS Rating"] ?? params.data?.["IBD RS Rating"] ?? null,
        width: 140,
        minWidth: 130,
        cellRenderer: (params: { value: number | null }) => {
            if (params.value === null || params.value === undefined) return <span className="text-gray-500 font-mono">—</span>;
            const rating = Number(params.value);
            let bg = "bg-slate-800/80 text-slate-300 border-slate-700";
            if (rating >= 90) bg = "bg-emerald-950/80 text-emerald-300 border-emerald-700/80";
            else if (rating >= 80) bg = "bg-cyan-950/80 text-cyan-300 border-cyan-700/80";
            else if (rating < 50) bg = "bg-red-950/40 text-red-400 border-red-900/50";
            return (
                <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono border ${bg}`}>
                    RS {rating}
                </span>
            );
        },
        sortable: true,
        filter: "agNumberColumnFilter",
        filterParams: numberFilterParams,
        headerTooltip: "Relative Strength Rating (1-99) weighted across 4 quarters (40% Q1, 20% Q2, 20% Q3, 20% Q4) vs all sectors & themes"
    }), []);

    const columnDefs = useMemo<ColDef[]>(() => {
        const baseCols: ColDef[] = [
            {
                headerName: "",
                field: "checkbox",
                headerCheckboxSelection: true,
                checkboxSelection: true,
                pinned: "left",
                width: 48,
                maxWidth: 48,
                suppressHeaderMenuButton: true,
                resizable: false,
                sortable: false,
                filter: false,
                flex: 0,
            },
            {
                headerName: "Theme / Index",
                field: "Theme/Index",
                pinned: "left",
                width: 200,
                minWidth: 160,
                filter: "agTextColumnFilter",
                filterParams: {
                    filterOptions: ["contains", "startsWith", "endsWith", "equals", "notEqual"],
                    defaultOption: "contains",
                    buttons: ["apply", "reset"],
                    closeOnApply: true,
                },
                cellRenderer: themeRenderer,
            },
        ];

        // 1. RETURNS MODE (Original Heatmap)
        if (viewMode === "returns") {
            const cols = [...baseCols];
            for (const col of returnColumns) {
                if (col === "RS Rating" || col === "IBD RS Rating") {
                    cols.push({
                        ...rsRatingCol,
                        hide: !visibleColumns[col],
                    });
                } else {
                    cols.push({
                        headerName: col,
                        field: col,
                        hide: !visibleColumns[col],
                        width: col.startsWith("RS") ? 125 : 115,
                        minWidth: col.startsWith("RS") ? 115 : 105,
                        valueFormatter: returnFormatter,
                        cellStyle: getHeatmapStyle,
                        sortable: true,
                        filter: "agNumberColumnFilter",
                        filterParams: numberFilterParams,
                        headerTooltip: col === "RS (5D)" ? "Relative Strength against Nifty 50 over 5 Trading Days" : col === "RS (10D)" ? "Relative Strength against Nifty 50 over 10 Trading Days" : col === "RS (20D)" ? "Relative Strength against Nifty 50 over 20 Trading Days" : col === "RS (50D)" ? "Relative Strength against Nifty 50 over 50 Trading Days" : undefined
                    });
                }
            }
            return cols;
        }

        // 2. BREADTH & GAINERS MODE (Strictly 1D to 1Y)
        if (viewMode === "breadth") {
            const cols = [...baseCols];

            // Total Stocks
            cols.push({
                headerName: "Total",
                field: "breadth_totalStocks",
                width: 75,
                minWidth: 65,
                sortable: true,
                suppressHeaderMenuButton: true,
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "Total number of constituent stocks tracked in this theme",
                cellRenderer: (params: { value: number | null }) => {
                    if (params.value === null || params.value === undefined) return <span className="text-gray-500">—</span>;
                    return (
                        <div className="flex items-center justify-center h-full">
                            <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-xs text-slate-200 font-medium antialiased">
                                {params.value}
                            </span>
                        </div>
                    );
                },
            });

            // > 200 SMA
            cols.push({
                headerName: "> 200 SMA",
                field: "breadth_pctAbove200Sma",
                width: 125,
                minWidth: 110,
                sortable: true,
                suppressHeaderMenuButton: true,
                cellStyle: getBreadthHeatmapStyle,
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "% and count of constituents trading above their 200-day Simple Moving Average",
                cellRenderer: (params: any) => {
                    const b: ThemeBreadthSummaryMetrics | null = params.data?.breadth;
                    if (!b || b.pctAbove200Sma === undefined) return <span className="text-gray-500">—</span>;
                    const tooltip = `${params.data["Theme/Index"]}\nAbove 200 SMA: ${b.above200Sma} / ${b.totalStocks} (${b.pctAbove200Sma.toFixed(1)}%)\nBelow 200 SMA: ${b.below200Sma} / ${b.totalStocks}`;
                    return (
                        <div className="flex flex-col items-center justify-center h-full py-0.5 leading-none text-center antialiased" title={tooltip}>
                            <span className="text-[13px] font-medium tracking-tight">{b.pctAbove200Sma.toFixed(1)}%</span>
                            <span className="text-[11px] text-slate-300/80 font-normal mt-1">
                                {b.above200Sma}/{b.totalStocks}
                            </span>
                        </div>
                    );
                },
            });

            // Timeframes: 1D, 1W, 1M, 3M, 6M, YTD, 1Y
            for (const tf of GAINER_TIMEFRAMES) {
                cols.push({
                    headerName: `${tf} Gainers`,
                    field: `breadth_${tf}_pct`,
                    width: 120,
                    minWidth: 105,
                    sortable: true,
                    suppressHeaderMenuButton: true,
                    cellStyle: getBreadthHeatmapStyle,
                    filter: "agNumberColumnFilter",
                    filterParams: numberFilterParams,
                    headerTooltip: `% and count of constituents with positive returns (>0%) over ${tf} (unseasoned IPOs excluded from denominator)`,
                    cellRenderer: (params: any) => {
                        const stat = params.data?.breadth?.timeframes?.[tf];
                        if (!stat || stat.total === 0) return <span className="text-gray-500">—</span>;
                        const themeName = params.data["Theme/Index"];
                        const tooltip = `${themeName} — ${tf} Breadth\n────────────────────────\nActive Constituents: ${stat.total}\nGainers (>0%): ${stat.gained} / ${stat.total} (${stat.pct.toFixed(1)}%)\nDecliners (<0%): ${stat.declined} / ${stat.total}\nFlat (0%): ${stat.flat}${stat.unlisted > 0 ? `\nRecent IPOs (<${tf}): ${stat.unlisted} (Excluded from denominator)` : ""}`;
                        return (
                            <div className="flex flex-col items-center justify-center h-full py-0.5 leading-none text-center antialiased" title={tooltip}>
                                <span className="text-[13px] font-medium tracking-tight">{stat.pct.toFixed(1)}%</span>
                                <span className="text-[11px] text-slate-300/80 font-normal mt-1">
                                    {stat.gained}/{stat.total}
                                </span>
                            </div>
                        );
                    },
                });
            }

            // RS Rating
            cols.push(rsRatingCol);
            return cols;
        }

        // 3. COMBINED MODE (Returns % + Gainers badge underneath)
        if (viewMode === "combined") {
            const cols = [...baseCols];

            // Total Stocks
            cols.push({
                headerName: "Total",
                field: "breadth_totalStocks",
                width: 75,
                minWidth: 65,
                sortable: true,
                suppressHeaderMenuButton: true,
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "Total number of constituent stocks tracked in this theme",
                cellRenderer: (params: { value: number | null }) => {
                    if (params.value === null || params.value === undefined) return <span className="text-gray-500">—</span>;
                    return (
                        <div className="flex items-center justify-center h-full">
                            <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-xs text-slate-200 font-medium antialiased">
                                {params.value}
                            </span>
                        </div>
                    );
                },
            });

            // > 200 SMA
            cols.push({
                headerName: "> 200 SMA",
                field: "breadth_pctAbove200Sma",
                width: 125,
                minWidth: 110,
                sortable: true,
                suppressHeaderMenuButton: true,
                cellStyle: getBreadthHeatmapStyle,
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "% and count of constituents trading above their 200-day Simple Moving Average",
                cellRenderer: (params: any) => {
                    const b: ThemeBreadthSummaryMetrics | null = params.data?.breadth;
                    if (!b || b.pctAbove200Sma === undefined) return <span className="text-gray-500">—</span>;
                    return (
                        <div className="flex flex-col items-center justify-center h-full text-center leading-none py-0.5 antialiased">
                            <span className="text-[13px] font-medium tracking-tight">{b.pctAbove200Sma.toFixed(1)}%</span>
                            <span className="text-[11px] text-slate-300/80 font-normal mt-1">
                                {b.above200Sma}/{b.totalStocks}
                            </span>
                        </div>
                    );
                },
            });

            // Combined Timeframes: 1D to 1Y
            for (const tf of GAINER_TIMEFRAMES) {
                const metricCol = TIMEFRAME_TO_METRIC_COL[tf];
                cols.push({
                    headerName: metricCol,
                    field: metricCol,
                    width: 120,
                    minWidth: 105,
                    sortable: true,
                    suppressHeaderMenuButton: true,
                    cellStyle: getHeatmapStyle,
                    filter: "agNumberColumnFilter",
                    filterParams: numberFilterParams,
                    headerTooltip: `${metricCol} Equal-Weighted return and constituent gainers ratio`,
                    cellRenderer: (params: any) => {
                        const ret = params.value != null && params.value !== "" ? Number(params.value) : null;
                        const stat = params.data?.breadth?.timeframes?.[tf];
                        if (ret === null) return <span className="text-gray-500">—</span>;
                        const formattedRet = formatMetricReturn(ret);
                        const tooltip = stat 
                            ? `${params.data["Theme/Index"]} — ${tf}\nReturn: ${formattedRet}\nGainers: ${stat.gained}/${stat.total} (${stat.pct.toFixed(1)}%)\nDecliners: ${stat.declined}${stat.unlisted > 0 ? `\nRecent IPOs: ${stat.unlisted}` : ""}` 
                            : `Return: ${formattedRet}`;
                        return (
                            <div className="flex flex-col items-center justify-center h-full py-0.5 leading-none text-center antialiased" title={tooltip}>
                                <span className="text-[13px] font-medium tracking-tight">{formattedRet}</span>
                                {stat && stat.total > 0 && (
                                    <span className="text-[11px] text-slate-300/80 font-normal mt-1">
                                        {stat.gained}/{stat.total}
                                    </span>
                                )}
                            </div>
                        );
                    },
                });
            }

            // RS Rating
            cols.push(rsRatingCol);
            return cols;
        }

        // 4. FORECASTER MODE (Predictive Momentum & Thrust Scanner)
        if (viewMode === "forecaster") {
            const cols = [...baseCols];

            // 1W Breadth
            cols.push({
                headerName: "1W Breadth",
                field: "breadth_1W_pct",
                width: 125,
                minWidth: 110,
                sortable: true,
                cellStyle: getBreadthHeatmapStyle,
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "1-Week Participation: % and count of constituents with positive 1-week return",
                cellRenderer: (params: any) => {
                    const v = params.value;
                    if (v === null || v === undefined) return <span className="text-gray-500">—</span>;
                    const stat = params.data?.breadth?.timeframes?.["1W"];
                    const tooltip = stat ? `1W Gainers: ${stat.gained}/${stat.total} (${stat.pct.toFixed(1)}%)` : `${v}%`;
                    return (
                        <div className="flex flex-col items-center justify-center h-full py-0.5 leading-none text-center antialiased" title={tooltip}>
                            <span className="text-[13px] font-semibold tracking-tight">{Number(v).toFixed(1)}%</span>
                            {stat && stat.total > 0 && (
                                <span className="text-[11px] text-slate-300/80 font-normal mt-1">
                                    {stat.gained}/{stat.total}
                                </span>
                            )}
                        </div>
                    );
                },
            });

            // 1M Breadth
            cols.push({
                headerName: "1M Breadth",
                field: "breadth_1M_pct",
                width: 125,
                minWidth: 110,
                sortable: true,
                cellStyle: getBreadthHeatmapStyle,
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "1-Month Participation: % and count of constituents with positive 1-month return",
                cellRenderer: (params: any) => {
                    const v = params.value;
                    if (v === null || v === undefined) return <span className="text-gray-500">—</span>;
                    const stat = params.data?.breadth?.timeframes?.["1M"];
                    const tooltip = stat ? `1M Gainers: ${stat.gained}/${stat.total} (${stat.pct.toFixed(1)}%)` : `${v}%`;
                    return (
                        <div className="flex flex-col items-center justify-center h-full py-0.5 leading-none text-center antialiased" title={tooltip}>
                            <span className="text-[13px] font-semibold tracking-tight">{Number(v).toFixed(1)}%</span>
                            {stat && stat.total > 0 && (
                                <span className="text-[11px] text-slate-300/80 font-normal mt-1">
                                    {stat.gained}/{stat.total}
                                </span>
                            )}
                        </div>
                    );
                },
            });

            // Velocity (1W - 1M)
            cols.push({
                headerName: "Velocity (1W-1M)",
                field: "breadth_velocity",
                width: 145,
                minWidth: 130,
                sortable: true,
                sort: "desc",
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "Breadth Velocity = 1W Gainers % minus 1M Gainers % (Fast vs Intermediate participation acceleration)",
                cellRenderer: (params: { value: number | null }) => {
                    if (params.value === null || params.value === undefined) return <span className="text-gray-500 font-mono">—</span>;
                    const v = Number(params.value);
                    const sign = v > 0 ? "+" : "";
                    let pillClass = "bg-slate-800/80 text-slate-300 border-slate-700";
                    if (v >= 40) {
                        pillClass = "bg-emerald-950/90 text-emerald-300 border-emerald-600 shadow-sm shadow-emerald-500/20";
                    } else if (v >= 15) {
                        pillClass = "bg-emerald-900/40 text-emerald-400 border-emerald-700/60";
                    } else if (v <= -40) {
                        pillClass = "bg-red-950/90 text-red-300 border-red-600 shadow-sm shadow-red-500/20";
                    } else if (v <= -15) {
                        pillClass = "bg-red-900/40 text-red-400 border-red-700/60";
                    }
                    return (
                        <div className="flex items-center justify-center h-full">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono border ${pillClass}`}>
                                {sign}{v.toFixed(1)}%
                            </span>
                        </div>
                    );
                },
            });

            // Regime Setup
            cols.push({
                headerName: "Regime Setup",
                field: "regime",
                width: 195,
                minWidth: 175,
                sortable: true,
                filter: "agTextColumnFilter",
                headerTooltip: "Two-Stage Regime Classification (Bull Pullback Thrust, Bear Bounce, Sustained Bull, etc.)",
                cellRenderer: (params: { value: string | null; data: any }) => {
                    const code = params.value || "neutral";
                    const config = REGIME_CONFIGS[code] || REGIME_CONFIGS.neutral;
                    return (
                        <div className="flex items-center h-full" title={config.guidance}>
                            <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border flex items-center gap-1.5 ${config.bgClass} ${config.textClass} ${config.borderClass}`}>
                                {config.badge}
                            </span>
                        </div>
                    );
                },
            });

            // 10D Breadth Expansion Odds
            cols.push({
                headerName: "10D Expansion Odds",
                field: "expansion_odds",
                width: 165,
                minWidth: 150,
                sortable: true,
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "Calibrated empirical probability (Model 1) of 1M Breadth expanding by >= +15% over next 10 trading sessions",
                cellRenderer: (params: { value: number | null }) => {
                    if (params.value === null || params.value === undefined) return <span className="text-gray-500 font-mono">—</span>;
                    const odds = Number(params.value);
                    let barColor = "bg-slate-600";
                    let textColor = "text-slate-300";
                    if (odds >= 75) {
                        barColor = "bg-emerald-500";
                        textColor = "text-emerald-300 font-bold";
                    } else if (odds >= 60) {
                        barColor = "bg-cyan-500";
                        textColor = "text-cyan-300 font-semibold";
                    } else if (odds <= 30) {
                        barColor = "bg-red-500";
                        textColor = "text-red-400";
                    }
                    return (
                        <div className="flex flex-col justify-center h-full w-full gap-1">
                            <div className="flex justify-between items-center text-xs">
                                <span className={`font-mono ${textColor}`}>{odds.toFixed(1)}%</span>
                                <span className="text-[10px] text-slate-500 font-medium">Model 1</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div className={`h-full ${barColor} rounded-full transition-all duration-300`} style={{ width: `${Math.min(Math.max(odds, 0), 100)}%` }} />
                            </div>
                        </div>
                    );
                },
            });

            // Forward Price Expectation (Guidance)
            cols.push({
                headerName: "Forward Expectation (12Y Empirical)",
                field: "forward_guidance",
                width: 320,
                minWidth: 260,
                sortable: false,
                headerTooltip: "Empirical forward price and breadth expectation based on 12-year backtest data",
                cellRenderer: (params: { value: string | null; data: any }) => {
                    const guidance = params.value || params.data?.forward_guidance || "";
                    if (!guidance) return <span className="text-gray-500">—</span>;
                    return (
                        <div className="flex items-center h-full text-xs text-slate-300 truncate font-medium antialiased" title={guidance}>
                            {guidance}
                        </div>
                    );
                },
            });

            // > 200 SMA
            cols.push({
                headerName: "> 200 SMA",
                field: "breadth_pctAbove200Sma",
                width: 115,
                minWidth: 100,
                sortable: true,
                suppressHeaderMenuButton: true,
                cellStyle: getBreadthHeatmapStyle,
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "% of constituents trading above their 200-day Simple Moving Average",
                cellRenderer: (params: any) => {
                    const v = params.value;
                    if (v === null || v === undefined) return <span className="text-gray-500">—</span>;
                    const a = params.data?.breadth_above200Sma;
                    const tot = params.data?.breadth_totalStocks;
                    return (
                        <div className="flex flex-col items-center justify-center h-full text-center leading-none py-0.5 antialiased">
                            <span className="text-[13px] font-medium tracking-tight">{Number(v).toFixed(1)}%</span>
                            {a !== undefined && tot !== undefined && (
                                <span className="text-[11px] text-slate-300/80 font-normal mt-1">
                                    {a}/{tot}
                                </span>
                            )}
                        </div>
                    );
                },
            });

            // Total Stocks
            cols.push({
                headerName: "Total",
                field: "breadth_totalStocks",
                width: 75,
                minWidth: 65,
                sortable: true,
                suppressHeaderMenuButton: true,
                filter: "agNumberColumnFilter",
                filterParams: numberFilterParams,
                headerTooltip: "Total number of constituent stocks tracked in this theme",
                cellRenderer: (params: { value: number | null }) => {
                    if (params.value === null || params.value === undefined) return <span className="text-gray-500">—</span>;
                    return (
                        <div className="flex items-center justify-center h-full">
                            <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-xs text-slate-200 font-medium antialiased">
                                {params.value}
                            </span>
                        </div>
                    );
                },
            });

            // RS Rating
            cols.push(rsRatingCol);

            return cols;
        }

        return baseCols;
    }, [viewMode, visibleColumns, rsRatingCol, themeRenderer]);

    const defaultColDef = useMemo<ColDef>(
        () => ({
            resizable: true,
            suppressMovable: true,
            filter: "agNumberColumnFilter",
            filterParams: numberFilterParams,
            minWidth: 90,
        }),
        []
    );

    const toggleColumn = (col: string) => {
        setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }));
    };

    const isExternalFilterPresent = useCallback(() => {
        return searchQuery !== "" || showSelectedOnly || !showBroadMarket || !showSectors || !showIndustries;
    }, [searchQuery, showSelectedOnly, showBroadMarket, showSectors, showIndustries]);

    const doesExternalFilterPass = useCallback((node: IRowNode) => {
        const rowData = node.data;
        const title = rowData["Theme/Index"] || "";

        // Category filter
        const category = getCategoryForTitle(title, ALL_CONFIGS);
        if (category === "broad-market" && !showBroadMarket) return false;
        if (category === "sectors" && !showSectors) return false;
        if (category === "industries" && !showIndustries) return false;

        // Show Selected Only filter
        if (showSelectedOnly && !selectedThemes.has(title)) {
            return false;
        }

        if (searchQuery !== "") {
            if (!title.toLowerCase().includes(searchQuery.toLowerCase())) {
                return false;
            }
        }
        return true;
    }, [searchQuery, showSelectedOnly, selectedThemes, showBroadMarket, showSectors, showIndustries]);

    useEffect(() => {
        if (gridRef.current?.api) {
            gridRef.current.api.onFilterChanged();
        }
    }, [searchQuery, showSelectedOnly, selectedThemes, showBroadMarket, showSectors, showIndustries]);

    const clearFilters = () => {
        setSearchQuery("");
        setShowSelectedOnly(false);
        setShowBroadMarket(true);
        setShowSectors(true);
        setShowIndustries(true);
        if (gridRef.current?.api) {
            gridRef.current.api.setFilterModel(null);
        }
    };

    const clearSelection = () => {
        setSelectedThemesArr([]);
        if (gridRef.current?.api) {
            gridRef.current.api.deselectAll();
        }
    };

    const isFiltered = searchQuery !== "" || showSelectedOnly || !showBroadMarket || !showSectors || !showIndustries || displayedCount < data.length;
    const selectionCount = selectedThemes.size;

    // Data validation check
    const globalLatestStr = globalLatestDate;
    let isStale = false;
    if (globalLatestStr) {
        const d = new Date(globalLatestStr + "T00:00:00");
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        isStale = diffDays > 3;
    }

    return (
        <div className="flex flex-col gap-3">
            {/* Category Filters */}
            <div className="mb-1">
                <CategoryFilter
                    showBroadMarket={showBroadMarket}
                    showSectors={showSectors}
                    showIndustries={showIndustries}
                    onToggleBroadMarket={() => setShowBroadMarket(!showBroadMarket)}
                    onToggleSectors={() => setShowSectors(!showSectors)}
                    onToggleIndustries={() => setShowIndustries(!showIndustries)}
                />
            </div>

            <div className="flex flex-wrap justify-between pr-2 gap-y-3 gap-x-6 items-center">
                <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
                    {/* View Mode Switcher */}
                    <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-lg p-0.5 shadow-sm">
                        <button
                            onClick={() => setViewMode("returns")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all font-medium ${
                                viewMode === "returns"
                                    ? "bg-blue-600 text-white shadow-sm font-semibold"
                                    : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            <TrendingUp size={13} />
                            Returns (%)
                        </button>
                        <button
                            onClick={() => setViewMode("breadth")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all font-medium ${
                                viewMode === "breadth"
                                    ? "bg-blue-600 text-white shadow-sm font-semibold"
                                    : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            <BarChart2 size={13} />
                            Breadth & Gainers
                        </button>
                        <button
                            onClick={() => setViewMode("combined")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all font-medium ${
                                viewMode === "combined"
                                    ? "bg-blue-600 text-white shadow-sm font-semibold"
                                    : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            <Layers size={13} />
                            Combined
                        </button>
                        <button
                            onClick={() => setViewMode("forecaster")}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all font-medium ${
                                viewMode === "forecaster"
                                    ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-sm font-semibold"
                                    : "text-amber-400/90 hover:text-amber-300"
                            }`}
                        >
                            <Zap size={13} className={viewMode === "forecaster" ? "text-amber-200 fill-amber-200" : ""} />
                            ⚡ Forecaster
                        </button>
                    </div>

                    {/* Session Date Selector (Time-Travel / Replay) */}
                    <div className="relative" ref={dateDropdownRef}>
                        <button
                            onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
                            className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-all font-medium shadow-sm ${
                                selectedDate !== "latest"
                                    ? "bg-amber-500/20 border-amber-500/50 text-amber-200 ring-1 ring-amber-500/30"
                                    : "bg-slate-900 border-slate-700/80 text-slate-300 hover:border-slate-600"
                            }`}
                            title="Time-Travel: Replay dashboard metrics as of any past session from the last 250 trading days"
                        >
                            <Calendar size={13} className={selectedDate !== "latest" ? "text-amber-400" : "text-blue-400"} />
                            <span>
                                {selectedDate === "latest" ? (
                                    <>Session: <strong className="text-white font-semibold">{formatDateLabel(globalLatestDate)}</strong> <span className="text-[10px] text-emerald-400 font-bold ml-1 px-1.5 py-0.5 bg-emerald-950/80 rounded border border-emerald-800/80">LIVE</span></>
                                ) : (
                                    <>Replay: <strong className="text-amber-300 font-bold font-mono">{formatDateLabel(selectedDate)}</strong> {isLoadingHistory && <span className="text-[10px] text-amber-400/80 animate-pulse ml-1">(loading...)</span>}</>
                                )}
                            </span>
                            <ChevronDown size={12} className={`transition-transform duration-200 text-slate-400 ${isDateDropdownOpen ? "rotate-180" : ""}`} />
                        </button>

                        {isDateDropdownOpen && (
                            <div className="absolute left-0 top-full mt-2 w-72 bg-[#111118] border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-50">
                                <div className="p-2 border-b border-slate-700/60 bg-slate-900/60">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                            <Calendar size={12} className="text-blue-400" />
                                            Session Replay
                                        </span>
                                        <span className="text-[10px] text-slate-500 font-mono">
                                            {selectableDates.length} trading days
                                        </span>
                                    </div>
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={12} />
                                        <input
                                            type="text"
                                            placeholder="Search date (e.g. Oct 2026)..."
                                            value={dateSearchQuery}
                                            onChange={(e) => setDateSearchQuery(e.target.value)}
                                            className="w-full bg-slate-950/80 border border-slate-700/80 rounded py-1 pl-8 pr-6 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                        {dateSearchQuery && (
                                            <button onClick={() => setDateSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                                                <X size={10} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="p-1 max-h-64 overflow-y-auto">
                                    <button
                                        onClick={() => {
                                            setSelectedDate("latest");
                                            setIsDateDropdownOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs transition-colors ${
                                            selectedDate === "latest"
                                                ? "bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30"
                                                : "text-slate-300 hover:bg-slate-800/60"
                                        }`}
                                    >
                                        <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                            Latest Session (Live)
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-mono">{formatDateLabel(globalLatestDate)}</span>
                                    </button>

                                    <div className="my-1 border-t border-slate-800/80" />

                                    {isLoadingHistory && selectableDates.length === 0 ? (
                                        <div className="py-4 text-center text-xs text-slate-500">Loading historical dates...</div>
                                    ) : filteredDates.length === 0 ? (
                                        <div className="py-4 text-center text-xs text-slate-500">No dates match search</div>
                                    ) : (
                                        filteredDates.map((dStr) => {
                                            const isSelected = selectedDate === dStr;
                                            return (
                                                <button
                                                    key={dStr}
                                                    onClick={() => {
                                                        if (dStr === selectableDates[0]) {
                                                            setSelectedDate("latest");
                                                        } else {
                                                            setSelectedDate(dStr);
                                                        }
                                                        setIsDateDropdownOpen(false);
                                                    }}
                                                    className={`w-full flex items-center justify-between px-3 py-1.5 rounded text-xs transition-colors ${
                                                        isSelected
                                                            ? "bg-amber-500/20 text-amber-200 font-semibold border border-amber-500/40"
                                                            : "text-slate-300 hover:bg-slate-800/60"
                                                    }`}
                                                >
                                                    <span className="font-medium">{formatDateLabel(dStr)}</span>
                                                    <span className="text-[10px] text-slate-500 font-mono">{dStr}</span>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="relative flex-1 max-w-xs min-w-[200px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                        <input
                            type="text"
                            placeholder="Search themes/indices..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-900/50 border border-slate-700/50 rounded-md py-1.5 pl-9 pr-8 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-slate-600 transition-all font-medium"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {/* Live Theme Count Badge */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-900/80 border border-slate-800 text-xs text-slate-400 whitespace-nowrap shadow-sm">
                        {displayedCount < data.length ? (
                            <span>
                                Showing <strong className="font-mono font-semibold text-blue-400">{displayedCount}</strong> of <span className="font-mono text-slate-300">{data.length}</span> themes
                            </span>
                        ) : (
                            <span>
                                <strong className="font-mono font-semibold text-slate-200">{data.length}</strong> themes
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                    {isStale && (
                        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] px-2 py-1 rounded flex items-center gap-1.5">
                            <AlertCircle size={12} className="animate-pulse" />
                            <span>Syncing...</span>
                        </div>
                    )}

                    {selectionCount > 0 && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowSelectedOnly(!showSelectedOnly)}
                                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border transition-all ${
                                    showSelectedOnly 
                                        ? "bg-blue-500/20 border-blue-500/40 text-blue-300 shadow-sm shadow-blue-500/10" 
                                        : "bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700"
                                }`}
                            >
                                <CheckSquare size={13} />
                                Show Selected
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                                    showSelectedOnly ? "bg-blue-500/30 text-blue-200" : "bg-slate-700 text-slate-400"
                                }`}>
                                    {selectionCount}
                                </span>
                            </button>
                            <button
                                onClick={clearSelection}
                                className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                                title="Clear selection"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    )}

                    {(viewMode === "returns" || viewMode === "combined") && (
                        <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer text-nowrap select-none hover:text-slate-300 transition-colors">
                            <input
                                type="checkbox"
                                checked={showCagr}
                                onChange={(e) => setShowCagr(e.target.checked)}
                                className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 h-3.5 w-3.5"
                            />
                            Annualize (CAGR)
                        </label>
                    )}

                    {isFiltered && (
                        <button 
                            onClick={clearFilters}
                            className="text-[11px] text-slate-400 hover:text-blue-400 transition-colors font-medium flex items-center gap-1 bg-slate-800/50 py-1 px-2 rounded border border-slate-700/50"
                        >
                            <X size={12} />
                            Clear All
                        </button>
                    )}

                    <div className="flex items-center gap-2">
                        {/* Open Tabs Button */}
                        <button
                            onClick={handleOpenTabs}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all duration-200"
                            title={selectedThemes.size > 0 ? `Open ${selectedThemes.size} themes in TradingView` : "Open all visible in TradingView tabs"}
                        >
                            <ExternalLink size={14} />
                            Open in TradingView
                        </button>

                        {/* Watchlist Copy Button with Presets & Batches */}
                        <CopyWatchlistButton
                            getTickers={getActiveTickers}
                        />

                        <CaptureScreenshot 
                            targetRef={tableRef}
                            filename={viewMode === "breadth" ? "Breadth_Heatmap" : viewMode === "combined" ? "Combined_Heatmap" : "Performance_Heatmap"}
                            label="Capture Heatmap"
                            onBeforeCapture={() => {
                                const api = gridRef.current?.api;
                                if (!api) return () => {};
                                api.setGridOption('domLayout', 'autoHeight');
                                return () => { api.setGridOption('domLayout', 'normal'); };
                            }}
                        />
                        
                        {viewMode === "returns" && (
                            <div className="relative" ref={dropdownRef}>
                                <button
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="flex items-center gap-2 text-xs font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-md transition-colors shadow-sm"
                                >
                                    <Columns size={14} className="text-blue-400" />
                                    Columns
                                    <ChevronDown size={14} className={`transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`} />
                                </button>

                                {isDropdownOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-52 bg-[#111118] border border-slate-700 rounded-md shadow-2xl overflow-hidden z-50">
                                        <div className="p-2 flex flex-col gap-1 max-h-64 overflow-y-auto">
                                            <div className="flex justify-between items-center px-1 mb-1 pb-2 border-b border-slate-700/50">
                                                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Columns</span>
                                                <div className="flex gap-2">
                                                    <button onClick={() => {
                                                        const allSelected: Record<string, boolean> = {};
                                                        returnColumns.forEach(c => allSelected[c] = true);
                                                        setVisibleColumns(allSelected);
                                                    }} className="text-[10px] text-blue-400 hover:text-blue-300 font-medium">All</button>
                                                    <span className="text-slate-600 text-[10px]">|</span>
                                                    <button onClick={() => {
                                                        const noneSelected: Record<string, boolean> = {};
                                                        returnColumns.forEach(c => noneSelected[c] = false);
                                                        setVisibleColumns(noneSelected);
                                                    }} className="text-[10px] text-red-400 hover:text-red-300 font-medium">None</button>
                                                </div>
                                            </div>
                                            {returnColumns.map(col => (
                                                <label key={col} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded cursor-pointer text-xs text-slate-300 transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={visibleColumns[col]}
                                                        onChange={() => toggleColumn(col)}
                                                        className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 h-3.5 w-3.5"
                                                    />
                                                    {col}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            
            {/* Historical Replay Banner */}
            {selectedDate !== "latest" && (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs shadow-md">
                    <div className="flex items-center gap-2.5">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                        </span>
                        <span>
                            <strong className="text-amber-100 font-semibold">Historical Replay Active:</strong> Replaying complete market breadth and performance metrics as of trading session <strong className="text-amber-300 font-bold font-mono">{formatDateLabel(selectedDate)}</strong> ({selectedDate}).
                        </span>
                    </div>
                    <button
                        onClick={() => setSelectedDate("latest")}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/50 font-medium transition-all shadow-sm hover:bg-amber-500/40 cursor-pointer"
                    >
                        <RotateCcw size={12} />
                        Reset to Latest (Live)
                    </button>
                </div>
            )}
            
            <div 
                ref={tableRef} 
                className="bg-[#111118] border border-[#1e1e2e] rounded-lg overflow-hidden flex flex-col transition-all duration-300 min-h-[500px] w-full" 
                style={{ height: Math.max(Math.min(activeData.length * (viewMode === "returns" ? 36 : viewMode === "forecaster" ? 44 : 42) + 80, 840), 500) }}
            >
                <AgGridReact
                    ref={gridRef}
                    theme={myTheme}
                    rowData={activeData}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    rowHeight={viewMode === "returns" ? 36 : viewMode === "forecaster" ? 44 : 42}
                    suppressCellFocus={true}
                    animateRows={false}
                    domLayout="normal"
                    rowSelection="multiple"
                    suppressRowClickSelection={true}
                    isExternalFilterPresent={isExternalFilterPresent}
                    doesExternalFilterPass={doesExternalFilterPass}
                    onSelectionChanged={onSelectionChanged}
                    onModelUpdated={(params: any) => {
                        setDisplayedCount(params.api.getDisplayedRowCount());
                    }}
                    onFilterChanged={(params: any) => {
                        setDisplayedCount(params.api.getDisplayedRowCount());
                    }}
                    onGridReady={(params: any) => {
                        setDisplayedCount(params.api.getDisplayedRowCount());
                        const storedState = window.localStorage.getItem(`agGridState_heatmap_${viewMode}`);
                        if (storedState) {
                            try {
                                const parsed = JSON.parse(storedState);
                                if (Array.isArray(parsed)) {
                                    const sortState = parsed
                                        .filter((s: any) => s.sort != null)
                                        .map((s: any) => ({ colId: s.colId, sort: s.sort, sortIndex: s.sortIndex }));
                                    if (sortState.length > 0) {
                                        params.api.applyColumnState({ state: sortState, applyOrder: false });
                                    }
                                }
                            } catch (e) { console.warn("Failed to apply AG grid sort state", e); }
                        }
                        params.api.forEachNode((node: IRowNode) => {
                            if (selectedThemes.has(node.data["Theme/Index"])) node.setSelected(true);
                        });
                    }}
                    onSortChanged={() => {
                        if (gridRef.current?.api) {
                            const state = gridRef.current.api.getColumnState();
                            const sortOnlyState = state
                                .filter((s: any) => s.sort != null)
                                .map((s: any) => ({ colId: s.colId, sort: s.sort, sortIndex: s.sortIndex }));
                            window.localStorage.setItem(`agGridState_heatmap_${viewMode}`, JSON.stringify(sortOnlyState));
                        }
                    }}
                />
            </div>
        </div>
    );
}
