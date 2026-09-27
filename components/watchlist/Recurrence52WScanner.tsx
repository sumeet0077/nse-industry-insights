// components/watchlist/Recurrence52WScanner.tsx
"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { Stock52WItem, Market52WHistory, StockSearchIndex } from "@/lib/data";
import type { ConstituentPerformanceMap } from "@/types";
import { cleanTicker, normalizeTickerSymbol, makeTradingViewUrl, formatReturn, getReturnColor } from "@/lib/utils";
import {
    Flame,
    TrendingUp,
    TrendingDown,
    Calendar,
    Filter,
    Sparkles,
    Copy,
    Plus,
    Check,
    Search,
    Layers,
    Table as TableIcon,
    Save,
    CheckSquare,
    Square,
    ArrowUpDown,
    ChevronDown,
    Activity,
    Info,
    ShieldCheck,
    SlidersHorizontal,
    X,
    Zap,
    BarChart2,
    Hammer,
    Rocket,
    AlertTriangle,
    Columns,
} from "lucide-react";
import { CaptureScreenshot } from "@/components/common/CaptureScreenshot";
import { useLocalStorage } from "@/hooks/useLocalStorage";

interface Recurrence52WScannerProps {
    historyData: Market52WHistory;
    stockSearchIndex?: StockSearchIndex;
    constituentPerformanceMap?: ConstituentPerformanceMap | null;
    onOpenInRRG?: (tickers: string[], suggestedName?: string) => void;
    onOpenInTable?: (tickers: string[], suggestedName?: string) => void;
    onSaveAsWatchlist?: (name: string, tickers: string[], folder?: string) => void;
    onAddTickerToActiveWatchlist?: (ticker: string) => void;
    activeWatchlistTickers?: string[];
    activeWatchlistName?: string;
}

export type Direction = "high" | "low";
export type Lookback = 5 | 10 | 20 | 60;
export type PresetFilter = 
    | "all" 
    | "apex" 
    | "apex_confluence"
    | "one_day_pause"
    | "shakeout" 
    | "shakeout_breakout"
    | "hammer_bounce" 
    | "sector_wave" 
    | "dist_flush" 
    | "breakdown_wave" 
    | "streak" 
    | "persistent" 
    | "fresh" 
    | "high_rs" 
    | "rs_lead";
export type TradabilityPreset = "tradeable" | "fno_liquid" | "all" | "custom";
export type CircuitFilterOption = "exclude_low" | "ge_10" | "fno_20" | "fno" | "all";
export type SortField = 
    | "frequency" 
    | "streak" 
    | "rs_rating" 
    | "pct_1d" 
    | "pct_5d" 
    | "turnover" 
    | "close" 
    | "symbol" 
    | "theme" 
    | "band"
    | "candle_pattern"
    | "ema_20_ext"
    | "cpr_width"
    | "vol_surge"
    | "deliv_pct"
    | "wave";
export type SortOrder = "asc" | "desc";

export interface ColumnFilters {
    symbol: string;
    bands: string[];
    circuitLocked: "all" | "unlocked" | "locked";
    themes: string[];
    minStreak: number;
    minFrequency: number;
    minRS: number;
    rsLeadOnly: boolean;
    minClose: number;
    maxClose: number;
    minPct1d: number;
    maxPct1d: number;
    pct1dDirection: "all" | "positive" | "negative";
    minPct5d: number;
    maxPct5d: number;
    pct5dDirection: "all" | "positive" | "negative";
    minTurnover: number;

    // Microstructure column filters
    candlePatterns: string[];
    prevColor: "all" | "red" | "green";
    minEmaExt: number | null;
    maxEmaExt: number | null;
    cprPositions: string[];
    maxCprWidth: number;
    minVolSurge: number;
    minDelivPct: number;
    minDelivSurge: number;
    minSectorWave: number;
}

export const defaultColumnFilters: ColumnFilters = {
    symbol: "",
    bands: [],
    circuitLocked: "all",
    themes: [],
    minStreak: 0,
    minFrequency: 0,
    minRS: 0,
    rsLeadOnly: false,
    minClose: 0,
    maxClose: 0,
    minPct1d: 0,
    maxPct1d: 0,
    pct1dDirection: "all",
    minPct5d: 0,
    maxPct5d: 0,
    pct5dDirection: "all",
    minTurnover: 0,
    candlePatterns: [],
    prevColor: "all",
    minEmaExt: null,
    maxEmaExt: null,
    cprPositions: [],
    maxCprWidth: 0,
    minVolSurge: 0,
    minDelivPct: 0,
    minDelivSurge: 0,
    minSectorWave: 0,
};

export interface ScannerColumnConfig {
    key: string;
    label: string;
}

export const SCANNER_COLUMNS: ScannerColumnConfig[] = [
    { key: "band", label: "Price Band" },
    { key: "candle", label: "Candle & Signal" },
    { key: "ema_ext", label: "20 EMA Ext" },
    { key: "cpr", label: "Monthly CPR" },
    { key: "vol_deliv", label: "Vol & Deliv" },
    { key: "sector_wave", label: "Sector Wave (10D)" },
    { key: "theme", label: "Theme" },
    { key: "streak", label: "Active Streak" },
    { key: "frequency", label: "Frequency" },
    { key: "timeline", label: "20D / 60D Hits Timeline" },
    { key: "rs", label: "RS Rating" },
    { key: "close", label: "Close Price" },
    { key: "pct_1d", label: "1D %" },
    { key: "pct_5d", label: "5D %" },
    { key: "turnover", label: "Turnover (Cr)" },
    { key: "quick_add", label: "Quick Add" },
];

export const defaultVisibleColumns: Record<string, boolean> = {
    band: true,
    candle: true,
    ema_ext: true,
    cpr: true,
    vol_deliv: true,
    sector_wave: true,
    theme: true,
    streak: true,
    frequency: true,
    timeline: true,
    rs: true,
    close: true,
    pct_1d: true,
    pct_5d: true,
    turnover: true,
    quick_add: true,
};

export const CONFLUENCE_VISIBLE_COLUMNS: Record<string, boolean> = {
    band: false,
    candle: true,
    ema_ext: true,
    cpr: true,
    vol_deliv: true,
    sector_wave: true,
    theme: false,
    streak: false,
    frequency: false,
    timeline: false,
    rs: true,
    close: true,
    pct_1d: true,
    pct_5d: false,
    turnover: false,
    quick_add: true,
};

export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
    symbol: 144,
    band: 90,
    candle: 210,
    ema_ext: 120,
    cpr: 140,
    vol_deliv: 150,
    sector_wave: 160,
    theme: 150,
    streak: 110,
    frequency: 110,
    timeline: 170,
    rs: 115,
    close: 115,
    pct_1d: 100,
    pct_5d: 100,
    turnover: 125,
    quick_add: 85,
};

export const MIN_COLUMN_WIDTHS: Record<string, number> = {
    symbol: 110,
    band: 65,
    candle: 130,
    ema_ext: 80,
    cpr: 90,
    vol_deliv: 100,
    sector_wave: 110,
    theme: 100,
    streak: 75,
    frequency: 75,
    timeline: 120,
    rs: 75,
    close: 80,
    pct_1d: 70,
    pct_5d: 70,
    turnover: 85,
    quick_add: 60,
};

function getBandBadgeStyle(band?: string): string {
    const b = (band || "20").trim();
    if (b === "No Band") return "bg-purple-500/20 text-purple-300 border-purple-500/40";
    if (b === "20") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
    if (b === "10") return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
    if (b === "5") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    if (b === "2") return "bg-rose-500/20 text-rose-300 border-rose-500/40";
    return "bg-gray-800 text-gray-300 border-gray-700";
}

function getBandLabel(band?: string): string {
    const b = (band || "20").trim();
    if (b === "No Band") return "F&O";
    if (b === "20" || b === "10" || b === "5" || b === "2") return `${b}%`;
    return b ? `${b}%` : "20%";
}

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

export function Recurrence52WScanner({
    historyData,
    stockSearchIndex = {},
    constituentPerformanceMap,
    onOpenInRRG,
    onOpenInTable,
    onSaveAsWatchlist,
    onAddTickerToActiveWatchlist,
    activeWatchlistTickers = [],
    activeWatchlistName = "Active Watchlist",
}: Recurrence52WScannerProps) {
    const [direction, setDirection] = useState<Direction>("high");
    const [lookback, setLookback] = useState<Lookback>(20);
    const [presetFilter, setPresetFilter] = useState<PresetFilter>("all");
    const [tradabilityPreset, setTradabilityPreset] = useState<TradabilityPreset>("tradeable");
    const [showGranularFilters, setShowGranularFilters] = useState<boolean>(false);
    const [minTurnover, setMinTurnover] = useState<number>(1.0);
    const [minPrice, setMinPrice] = useState<number>(20.0);
    const [circuitFilter, setCircuitFilter] = useState<CircuitFilterOption>("exclude_low");
    const [seriesFilter, setSeriesFilter] = useState<"EQ" | "all">("EQ");
    const [excludeCircuitLocked, setExcludeCircuitLocked] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());
    const [sortField, setSortField] = useState<SortField>("frequency");
    const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
    const [isSaveModalOpen, setIsSaveModalOpen] = useState<boolean>(false);
    const [saveListName, setSaveListName] = useState<string>("");
    const [columnFilters, setColumnFilters] = useState<ColumnFilters>(defaultColumnFilters);
    const [activeFilterPopover, setActiveFilterPopover] = useState<string | null>(null);
    const [themeFilterSearch, setThemeFilterSearch] = useState<string>("");
    const filterPopoverRef = useRef<HTMLDivElement>(null);

    // Column Visibility Picker & Screenshot Capture
    const [visibleColumns, setVisibleColumns] = useLocalStorage<Record<string, boolean>>(
        "r52w_visibleColumns",
        defaultVisibleColumns
    );
    const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);
    const columnDropdownRef = useRef<HTMLDivElement>(null);
    const tableContainerRef = useRef<HTMLDivElement>(null);

    // Column Widths with Draggable Resizers
    const [columnWidths, setColumnWidths] = useLocalStorage<Record<string, number>>(
        "r52w_columnWidths",
        DEFAULT_COLUMN_WIDTHS
    );

    const colWidths = useMemo(() => {
        const merged = { ...DEFAULT_COLUMN_WIDTHS, ...columnWidths };
        const sanitized: Record<string, number> = {};
        for (const key of Object.keys(DEFAULT_COLUMN_WIDTHS)) {
            const val = merged[key];
            const min = MIN_COLUMN_WIDTHS[key] ?? 60;
            if (typeof val === "number" && !isNaN(val) && val >= min) {
                sanitized[key] = Math.round(val);
            } else {
                sanitized[key] = DEFAULT_COLUMN_WIDTHS[key];
            }
        }
        return sanitized;
    }, [columnWidths]);

    const colWidthsRef = useRef(colWidths);
    colWidthsRef.current = colWidths;

    const totalTableWidth = useMemo(() => {
        let width = 40 + colWidths.symbol;
        for (const col of SCANNER_COLUMNS) {
            if (visibleColumns[col.key] !== false) {
                width += colWidths[col.key] ?? DEFAULT_COLUMN_WIDTHS[col.key] ?? 100;
            }
        }
        return width;
    }, [colWidths, visibleColumns]);

    const resizeCleanupRef = useRef<(() => void) | null>(null);
    useEffect(() => {
        return () => {
            if (resizeCleanupRef.current) {
                resizeCleanupRef.current();
            }
        };
    }, []);

    const handleResizeMouseDown = useCallback((colKey: string, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        // Close any active filter popover to avoid jumpy layout during drag
        setActiveFilterPopover(null);

        // Cancel previous drag listener if one was somehow pending
        if (resizeCleanupRef.current) {
            resizeCleanupRef.current();
        }

        const startX = e.clientX;
        const startWidth = colWidthsRef.current[colKey] ?? DEFAULT_COLUMN_WIDTHS[colKey] ?? 100;
        const minWidth = MIN_COLUMN_WIDTHS[colKey] ?? 60;

        const originalCursor = document.body.style.cursor;
        const originalUserSelect = document.body.style.userSelect;

        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        let rafId: number | null = null;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const diff = moveEvent.clientX - startX;
            const newWidth = Math.max(minWidth, Math.round(startWidth + diff));
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
            rafId = requestAnimationFrame(() => {
                rafId = null;
                setColumnWidths((prev) => {
                    if (prev[colKey] === newWidth) return prev;
                    return {
                        ...prev,
                        [colKey]: newWidth,
                    };
                });
            });
        };

        const handleMouseUp = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            document.body.style.cursor = originalCursor;
            document.body.style.userSelect = originalUserSelect;
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
            resizeCleanupRef.current = null;
        };

        const cleanup = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            document.body.style.cursor = originalCursor;
            document.body.style.userSelect = originalUserSelect;
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };

        resizeCleanupRef.current = cleanup;

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
    }, [setColumnWidths]);

    const toggleColumn = useCallback((colKey: string) => {
        setVisibleColumns((prev) => ({
            ...prev,
            [colKey]: prev[colKey] !== false ? false : true,
        }));
    }, [setVisibleColumns]);

    // Close column picker dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (columnDropdownRef.current && !columnDropdownRef.current.contains(event.target as Node)) {
                setIsColumnDropdownOpen(false);
            }
        }
        if (isColumnDropdownOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [isColumnDropdownOpen]);

    const isConfluenceView = useMemo(() => {
        return SCANNER_COLUMNS.every((col) => {
            const expected = CONFLUENCE_VISIBLE_COLUMNS[col.key] !== false;
            const actual = visibleColumns[col.key] !== false;
            return expected === actual;
        });
    }, [visibleColumns]);

    const isTerminalView = useMemo(() => {
        return SCANNER_COLUMNS.every((col) => visibleColumns[col.key] !== false);
    }, [visibleColumns]);

    const handleBeforeCapture = useCallback(() => {
        const el = tableContainerRef.current;
        if (!el) return () => {};

        // Close any active filter popover so it doesn't obstruct rows in the capture
        setActiveFilterPopover(null);

        const prevMaxHeight = el.style.maxHeight;
        const prevHeight = el.style.height;
        const prevOverflow = el.style.overflow;
        const prevOverflowY = el.style.overflowY;
        const prevOverflowX = el.style.overflowX;
        const prevWidth = el.style.width;
        const prevMinWidth = el.style.minWidth;
        const prevScrollLeft = el.scrollLeft;
        const prevScrollTop = el.scrollTop;

        el.style.maxHeight = "none";
        el.style.height = "auto";
        el.style.overflow = "visible";
        el.style.overflowY = "visible";
        el.style.overflowX = "visible";
        el.style.width = "max-content";
        el.style.minWidth = "100%";
        el.scrollLeft = 0;
        el.scrollTop = 0;

        return () => {
            el.style.maxHeight = prevMaxHeight;
            el.style.height = prevHeight;
            el.style.overflow = prevOverflow;
            el.style.overflowY = prevOverflowY;
            el.style.overflowX = prevOverflowX;
            el.style.width = prevWidth;
            el.style.minWidth = prevMinWidth;
            el.scrollLeft = prevScrollLeft;
            el.scrollTop = prevScrollTop;
        };
    }, []);

    const visibleColumnCount = useMemo(() => {
        return 2 + SCANNER_COLUMNS.filter((c) => visibleColumns[c.key] !== false).length;
    }, [visibleColumns]);

    // Close column filter popover on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (filterPopoverRef.current && !filterPopoverRef.current.contains(event.target as Node)) {
                setActiveFilterPopover(null);
            }
        }
        if (activeFilterPopover) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [activeFilterPopover]);

    const hasColumnFilter = useCallback((col: string): boolean => {
        if (col === "symbol") return Boolean(columnFilters.symbol.trim());
        if (col === "band") return columnFilters.bands.length > 0 || columnFilters.circuitLocked !== "all";
        if (col === "theme") return columnFilters.themes.length > 0;
        if (col === "streak") return columnFilters.minStreak > 0;
        if (col === "frequency") return columnFilters.minFrequency > 0;
        if (col === "rs_rating") return columnFilters.minRS > 0 || columnFilters.rsLeadOnly;
        if (col === "close") return columnFilters.minClose > 0 || columnFilters.maxClose > 0;
        if (col === "pct_1d") return columnFilters.minPct1d !== 0 || columnFilters.maxPct1d !== 0 || columnFilters.pct1dDirection !== "all";
        if (col === "pct_5d") return columnFilters.minPct5d !== 0 || columnFilters.maxPct5d !== 0 || columnFilters.pct5dDirection !== "all";
        if (col === "turnover") return columnFilters.minTurnover > 0;
        if (col === "candle") return columnFilters.candlePatterns.length > 0 || columnFilters.prevColor !== "all";
        if (col === "ema_ext") return columnFilters.minEmaExt !== null || columnFilters.maxEmaExt !== null;
        if (col === "cpr") return columnFilters.cprPositions.length > 0 || columnFilters.maxCprWidth > 0;
        if (col === "vol_deliv") return columnFilters.minVolSurge > 0 || columnFilters.minDelivPct > 0 || columnFilters.minDelivSurge > 0;
        if (col === "wave") return columnFilters.minSectorWave > 0;
        return false;
    }, [columnFilters]);

    const activeColumnFilterCount = useMemo(() => {
        let count = 0;
        if (columnFilters.symbol.trim()) count++;
        if (columnFilters.bands.length > 0 || columnFilters.circuitLocked !== "all") count++;
        if (columnFilters.themes.length > 0) count++;
        if (columnFilters.minStreak > 0) count++;
        if (columnFilters.minFrequency > 0) count++;
        if (columnFilters.minRS > 0 || columnFilters.rsLeadOnly) count++;
        if (columnFilters.minClose > 0 || columnFilters.maxClose > 0) count++;
        if (columnFilters.minPct1d !== 0 || columnFilters.maxPct1d !== 0 || columnFilters.pct1dDirection !== "all") count++;
        if (columnFilters.minPct5d !== 0 || columnFilters.maxPct5d !== 0 || columnFilters.pct5dDirection !== "all") count++;
        if (columnFilters.minTurnover > 0) count++;
        if (columnFilters.candlePatterns.length > 0 || columnFilters.prevColor !== "all") count++;
        if (columnFilters.minEmaExt !== null || columnFilters.maxEmaExt !== null) count++;
        if (columnFilters.cprPositions.length > 0 || columnFilters.maxCprWidth > 0) count++;
        if (columnFilters.minVolSurge > 0 || columnFilters.minDelivPct > 0 || columnFilters.minDelivSurge > 0) count++;
        if (columnFilters.minSectorWave > 0) count++;
        return count;
    }, [columnFilters]);

    const clearSingleColumnFilter = useCallback((col: string) => {
        setColumnFilters((prev) => {
            const next = { ...prev };
            if (col === "symbol") next.symbol = "";
            else if (col === "band") {
                next.bands = [];
                next.circuitLocked = "all";
            } else if (col === "theme") next.themes = [];
            else if (col === "streak") next.minStreak = 0;
            else if (col === "frequency") next.minFrequency = 0;
            else if (col === "rs_rating") {
                next.minRS = 0;
                next.rsLeadOnly = false;
            } else if (col === "close") {
                next.minClose = 0;
                next.maxClose = 0;
            } else if (col === "pct_1d") {
                next.minPct1d = 0;
                next.maxPct1d = 0;
                next.pct1dDirection = "all";
            } else if (col === "pct_5d") {
                next.minPct5d = 0;
                next.maxPct5d = 0;
                next.pct5dDirection = "all";
            } else if (col === "turnover") next.minTurnover = 0;
            else if (col === "candle") {
                next.candlePatterns = [];
                next.prevColor = "all";
            } else if (col === "ema_ext") {
                next.minEmaExt = null;
                next.maxEmaExt = null;
            } else if (col === "cpr") {
                next.cprPositions = [];
                next.maxCprWidth = 0;
            } else if (col === "vol_deliv") {
                next.minVolSurge = 0;
                next.minDelivPct = 0;
                next.minDelivSurge = 0;
            } else if (col === "wave") {
                next.minSectorWave = 0;
            }
            return next;
        });
    }, []);

    const clearAllColumnFilters = useCallback(() => {
        setColumnFilters(defaultColumnFilters);
    }, []);

    const getSortIcon = (field: SortField) => {
        if (sortField !== field) {
            return <ArrowUpDown className="w-3 h-3 text-gray-500 opacity-60 group-hover:opacity-100 transition-opacity" />;
        }
        return sortOrder === "desc" ? (
            <span className="text-cyan-400 font-bold text-xs">▼</span>
        ) : (
            <span className="text-cyan-400 font-bold text-xs">▲</span>
        );
    };

    const applyTradabilityPreset = useCallback((preset: "tradeable" | "fno_liquid" | "all") => {
        setTradabilityPreset(preset);
        if (preset === "tradeable") {
            setMinTurnover(1.0);
            setMinPrice(20.0);
            setCircuitFilter("exclude_low");
            setSeriesFilter("EQ");
            setExcludeCircuitLocked(true);
        } else if (preset === "fno_liquid") {
            setMinTurnover(10.0);
            setMinPrice(0);
            setCircuitFilter("fno_20");
            setSeriesFilter("EQ");
            setExcludeCircuitLocked(true);
        } else if (preset === "all") {
            setMinTurnover(0);
            setMinPrice(0);
            setCircuitFilter("all");
            setSeriesFilter("all");
            setExcludeCircuitLocked(false);
        }
    }, []);

    const activeCustomFilterCount = useMemo(() => {
        let count = 0;
        if (minTurnover > 0) count++;
        if (minPrice > 0) count++;
        if (circuitFilter !== "all") count++;
        if (seriesFilter !== "all") count++;
        if (excludeCircuitLocked) count++;
        return count;
    }, [minTurnover, minPrice, circuitFilter, seriesFilter, excludeCircuitLocked]);

    const activeCleanSet = useMemo(() => {
        return new Set(activeWatchlistTickers.map((t) => cleanTicker(t).toUpperCase()));
    }, [activeWatchlistTickers]);

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

    // Helper to get RS metrics
    const getRSMetrics = useCallback(
        (sym: string, cleanSym: string) => {
            if (!constituentPerformanceMap) return { rs: null, lead: false };
            const data =
                constituentPerformanceMap[sym] ||
                constituentPerformanceMap[cleanSym] ||
                constituentPerformanceMap[`${cleanSym}.NS`];
            if (!data) return { rs: null, lead: false };
            return {
                rs: typeof data.ibd_rs_rating === "number" ? data.ibd_rs_rating : null,
                lead: Boolean(data.rs_lead_breakout),
            };
        },
        [constituentPerformanceMap]
    );

    // Source pool according to direction
    const rawItems = direction === "high" ? historyData.highs : historyData.lows;

    // Items matching all global, window, and column filters EXCEPT the Theme column filter
    const themeBaseItems = useMemo(() => {
        return rawItems.filter((item) => {
            // 0. Tradability & Circuit Filters
            if (excludeCircuitLocked && item.is_circuit_locked) return false;
            if ((item.turnover_cr ?? 0) < minTurnover) return false;
            if ((item.close ?? 0) < minPrice) return false;
            if (seriesFilter === "EQ" && item.series && item.series !== "EQ") return false;

            const band = (item.circuit_band || "20").trim();
            if (circuitFilter === "exclude_low") {
                if (band === "2" || band === "5") return false;
            } else if (circuitFilter === "ge_10") {
                if (band === "2" || band === "5") return false;
            } else if (circuitFilter === "fno_20") {
                if (band !== "No Band" && band !== "20") return false;
            } else if (circuitFilter === "fno") {
                if (band !== "No Band") return false;
            }

            // 1. Lookback window activity filter
            const countInWindow =
                lookback === 5
                    ? item.count_5d
                    : lookback === 10
                    ? item.count_10d
                    : lookback === 20
                    ? item.count_20d
                    : item.count_60d;

            if (countInWindow <= 0) return false;

            // 2. Preset Filter Chips
            if (presetFilter === "streak") {
                if (item.streak < 2) return false;
            } else if (presetFilter === "persistent") {
                if (countInWindow < 3) return false;
            } else if (presetFilter === "fresh") {
                if (!item.is_fresh_20d) return false;
            } else if (presetFilter === "high_rs") {
                const { rs } = getRSMetrics(item.symbol, item.clean_symbol);
                if (rs === null || rs < 80) return false;
            } else if (presetFilter === "rs_lead") {
                const { lead } = getRSMetrics(item.symbol, item.clean_symbol);
                if (!lead) return false;
            } else if (presetFilter === "apex" || presetFilter === "apex_confluence") {
                const emaExtOk = item.ema_20_ext != null && item.ema_20_ext >= 2.0 && item.ema_20_ext <= 6.0;
                const cprOk = item.cpr_pos === "above" && item.cpr_width_pct != null && item.cpr_width_pct <= 2.0;
                const volOk = item.vol_surge != null && item.vol_surge >= 1.5;
                const waveOk = item.sector_wave_count != null && item.sector_wave_count >= 3;
                const eqOk = item.series === "EQ" || !item.series;
                if (!emaExtOk || !cprOk || !volOk || !waveOk || !eqOk) return false;
            } else if (presetFilter === "one_day_pause") {
                if (item.setup_type !== "one_day_pause") return false;
            } else if (presetFilter === "hammer_bounce") {
                const isHammer = item.candle_pattern === "hammer";
                const nearEma = item.ema_20_ext != null && Math.abs(item.ema_20_ext) <= 2.5;
                const nearCpr = item.cpr_dist_top != null && Math.abs(item.cpr_dist_top) <= 2.0;
                if (item.setup_type !== "hammer_bounce" && (!isHammer || (!nearEma && !nearCpr))) return false;
            } else if (presetFilter === "shakeout" || presetFilter === "shakeout_breakout") {
                const isRed = item.prev_color === "red";
                const volSurge = item.vol_surge != null && item.vol_surge >= 2.0;
                const delivOk = (item.deliv_pct != null && item.deliv_pct >= 40.0) || item.series === "BE" || item.series === "BZ";
                if (item.setup_type !== "shakeout_breakout" && (!isRed || !volSurge || !delivOk)) return false;
            } else if (presetFilter === "sector_wave") {
                if (item.sector_wave_count == null || item.sector_wave_count < 3) return false;
            } else if (presetFilter === "dist_flush") {
                const belowCpr = item.cpr_pos === "below";
                const volSurge = item.vol_surge != null && item.vol_surge >= 2.0;
                const negEma = item.ema_20_ext != null && item.ema_20_ext < -10.0;
                if (!belowCpr || !volSurge || !negEma) return false;
            } else if (presetFilter === "breakdown_wave") {
                if (item.sector_wave_count == null || item.sector_wave_count < 3) return false;
            }

            // 3. Search query
            if (searchQuery.trim()) {
                const q = searchQuery.trim().toLowerCase();
                const matchSym = item.clean_symbol.toLowerCase().includes(q);
                const theme = getStockTheme(item.clean_symbol).toLowerCase();
                const matchTheme = theme.includes(q);
                if (!matchSym && !matchTheme) return false;
            }

            // 4. Column Header Filters (excluding Theme)
            // Symbol filter
            if (columnFilters.symbol.trim()) {
                const sq = columnFilters.symbol.trim().toLowerCase();
                const mSym = item.clean_symbol.toLowerCase().includes(sq) || item.symbol.toLowerCase().includes(sq);
                if (!mSym) return false;
            }

            // Band filter
            if (columnFilters.bands.length > 0) {
                const b = (item.circuit_band || "20").trim();
                if (!columnFilters.bands.includes(b)) return false;
            }

            // Circuit Lock filter
            if (columnFilters.circuitLocked === "locked") {
                if (!item.is_circuit_locked) return false;
            } else if (columnFilters.circuitLocked === "unlocked") {
                if (item.is_circuit_locked) return false;
            }

            // Streak filter
            if (columnFilters.minStreak > 0) {
                if (item.streak < columnFilters.minStreak) return false;
            }

            // Frequency filter
            if (columnFilters.minFrequency > 0) {
                if (countInWindow < columnFilters.minFrequency) return false;
            }

            // RS Rating filter
            if (columnFilters.minRS > 0 || columnFilters.rsLeadOnly) {
                const { rs, lead } = getRSMetrics(item.symbol, item.clean_symbol);
                if (columnFilters.minRS > 0 && (rs === null || rs < columnFilters.minRS)) return false;
                if (columnFilters.rsLeadOnly && !lead) return false;
            }

            // Close price filter
            if (columnFilters.minClose > 0 && item.close < columnFilters.minClose) return false;
            if (columnFilters.maxClose > 0 && item.close > columnFilters.maxClose) return false;

            // 1D % filter
            if (columnFilters.pct1dDirection === "positive" && item.pct_1d <= 0) return false;
            if (columnFilters.pct1dDirection === "negative" && item.pct_1d >= 0) return false;
            if (columnFilters.minPct1d !== 0 && item.pct_1d < columnFilters.minPct1d) return false;
            if (columnFilters.maxPct1d !== 0 && item.pct_1d > columnFilters.maxPct1d) return false;

            // 5D % filter
            if (columnFilters.pct5dDirection === "positive" && item.pct_5d <= 0) return false;
            if (columnFilters.pct5dDirection === "negative" && item.pct_5d >= 0) return false;
            if (columnFilters.minPct5d !== 0 && item.pct_5d < columnFilters.minPct5d) return false;
            if (columnFilters.maxPct5d !== 0 && item.pct_5d > columnFilters.maxPct5d) return false;

            // Turnover filter
            if (columnFilters.minTurnover > 0 && item.turnover_cr < columnFilters.minTurnover) return false;

            // Candle Pattern filter
            if (columnFilters.candlePatterns.length > 0) {
                const pat = item.candle_pattern || "normal";
                if (!columnFilters.candlePatterns.includes(pat)) return false;
            }
            if (columnFilters.prevColor !== "all") {
                if (item.prev_color !== columnFilters.prevColor) return false;
            }

            // 20 EMA Extension filter
            if (columnFilters.minEmaExt !== null || columnFilters.maxEmaExt !== null) {
                if (item.ema_20_ext == null) return false;
                if (columnFilters.minEmaExt !== null && item.ema_20_ext < columnFilters.minEmaExt) return false;
                if (columnFilters.maxEmaExt !== null && item.ema_20_ext > columnFilters.maxEmaExt) return false;
            }

            // Monthly CPR filter
            if (columnFilters.cprPositions.length > 0) {
                const pos = item.cpr_pos || "inside";
                if (!columnFilters.cprPositions.includes(pos)) return false;
            }
            if (columnFilters.maxCprWidth > 0) {
                if (item.cpr_width_pct == null || item.cpr_width_pct > columnFilters.maxCprWidth) return false;
            }

            // Volume & Delivery filter
            if (columnFilters.minVolSurge > 0) {
                if (item.vol_surge == null || item.vol_surge < columnFilters.minVolSurge) return false;
            }
            if (columnFilters.minDelivPct > 0) {
                const effDeliv = (item.series === "BE" || item.series === "BZ") ? 100 : item.deliv_pct;
                if (effDeliv == null || effDeliv < columnFilters.minDelivPct) return false;
            }
            if (columnFilters.minDelivSurge > 0) {
                if (item.deliv_surge == null || item.deliv_surge < columnFilters.minDelivSurge) return false;
            }

            // Sector Wave filter
            if (columnFilters.minSectorWave > 0) {
                if (item.sector_wave_count == null || item.sector_wave_count < columnFilters.minSectorWave) return false;
            }

            return true;
        });
    }, [
        rawItems,
        excludeCircuitLocked,
        minTurnover,
        minPrice,
        seriesFilter,
        circuitFilter,
        lookback,
        presetFilter,
        searchQuery,
        columnFilters.symbol,
        columnFilters.bands,
        columnFilters.circuitLocked,
        columnFilters.minStreak,
        columnFilters.minFrequency,
        columnFilters.minRS,
        columnFilters.rsLeadOnly,
        columnFilters.minClose,
        columnFilters.maxClose,
        columnFilters.pct1dDirection,
        columnFilters.minPct1d,
        columnFilters.maxPct1d,
        columnFilters.pct5dDirection,
        columnFilters.minPct5d,
        columnFilters.maxPct5d,
        columnFilters.minTurnover,
        columnFilters.candlePatterns,
        columnFilters.prevColor,
        columnFilters.minEmaExt,
        columnFilters.maxEmaExt,
        columnFilters.cprPositions,
        columnFilters.maxCprWidth,
        columnFilters.minVolSurge,
        columnFilters.minDelivPct,
        columnFilters.minDelivSurge,
        columnFilters.minSectorWave,
        getRSMetrics,
        getStockTheme,
    ]);

    // Available themes computed dynamically from candidate universe with real counts
    const availableThemes = useMemo(() => {
        const counts: Record<string, number> = {};
        themeBaseItems.forEach((item) => {
            const t = getStockTheme(item.clean_symbol);
            counts[t] = (counts[t] || 0) + 1;
        });
        // Also ensure any currently selected theme is present so user can uncheck it
        columnFilters.themes.forEach((t) => {
            if (!(t in counts)) counts[t] = 0;
        });

        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }, [themeBaseItems, columnFilters.themes, getStockTheme]);

    // Final filtered items applying Theme selection on top of themeBaseItems
    const filteredItems = useMemo(() => {
        if (columnFilters.themes.length === 0) return themeBaseItems;
        return themeBaseItems.filter((item) => {
            const itemTheme = getStockTheme(item.clean_symbol);
            return columnFilters.themes.includes(itemTheme);
        });
    }, [themeBaseItems, columnFilters.themes, getStockTheme]);

    // Sort items
    const sortedItems = useMemo(() => {
        const sorted = [...filteredItems];
        sorted.sort((a, b) => {
            let valA = 0;
            let valB = 0;

            if (sortField === "frequency") {
                valA =
                    lookback === 5
                        ? a.count_5d
                        : lookback === 10
                        ? a.count_10d
                        : lookback === 20
                        ? a.count_20d
                        : a.count_60d;
                valB =
                    lookback === 5
                        ? b.count_5d
                        : lookback === 10
                        ? b.count_10d
                        : lookback === 20
                        ? b.count_20d
                        : b.count_60d;
            } else if (sortField === "streak") {
                valA = a.streak;
                valB = b.streak;
            } else if (sortField === "rs_rating") {
                valA = getRSMetrics(a.symbol, a.clean_symbol).rs ?? -1;
                valB = getRSMetrics(b.symbol, b.clean_symbol).rs ?? -1;
            } else if (sortField === "pct_1d") {
                valA = a.pct_1d;
                valB = b.pct_1d;
            } else if (sortField === "pct_5d") {
                valA = a.pct_5d;
                valB = b.pct_5d;
            } else if (sortField === "turnover") {
                valA = a.turnover_cr;
                valB = b.turnover_cr;
            } else if (sortField === "close") {
                valA = a.close;
                valB = b.close;
            } else if (sortField === "band") {
                const getBandVal = (b?: string) => {
                    const cleanB = (b || "20").trim();
                    if (cleanB === "No Band") return 999;
                    const parsed = parseFloat(cleanB);
                    return isNaN(parsed) ? 20 : parsed;
                };
                valA = getBandVal(a.circuit_band);
                valB = getBandVal(b.circuit_band);
            } else if (sortField === "symbol") {
                const cmp = a.clean_symbol.localeCompare(b.clean_symbol);
                return sortOrder === "desc" ? -cmp : cmp;
            } else if (sortField === "theme") {
                const themeA = getStockTheme(a.clean_symbol);
                const themeB = getStockTheme(b.clean_symbol);
                const cmp = themeA.localeCompare(themeB);
                return sortOrder === "desc" ? -cmp : cmp;
            } else if (sortField === "candle_pattern") {
                const patOrder: Record<string, number> = { hammer: 4, thrust: 3, rejection: 2, normal: 1 };
                valA = patOrder[a.candle_pattern || "normal"] || 0;
                valB = patOrder[b.candle_pattern || "normal"] || 0;
            } else if (sortField === "ema_20_ext") {
                if (a.ema_20_ext == null && b.ema_20_ext != null) return 1;
                if (b.ema_20_ext == null && a.ema_20_ext != null) return -1;
                if (a.ema_20_ext == null && b.ema_20_ext == null) valA = valB = 0;
                else {
                    valA = a.ema_20_ext ?? 0;
                    valB = b.ema_20_ext ?? 0;
                }
            } else if (sortField === "cpr_width") {
                if (a.cpr_width_pct == null && b.cpr_width_pct != null) return 1;
                if (b.cpr_width_pct == null && a.cpr_width_pct != null) return -1;
                if (a.cpr_width_pct == null && b.cpr_width_pct == null) valA = valB = 0;
                else {
                    valA = a.cpr_width_pct ?? 0;
                    valB = b.cpr_width_pct ?? 0;
                }
            } else if (sortField === "vol_surge") {
                if (a.vol_surge == null && b.vol_surge != null) return 1;
                if (b.vol_surge == null && a.vol_surge != null) return -1;
                if (a.vol_surge == null && b.vol_surge == null) valA = valB = 0;
                else {
                    valA = a.vol_surge ?? 0;
                    valB = b.vol_surge ?? 0;
                }
            } else if (sortField === "deliv_pct") {
                const effA = (a.series === "BE" || a.series === "BZ") ? 100 : a.deliv_pct;
                const effB = (b.series === "BE" || b.series === "BZ") ? 100 : b.deliv_pct;
                if (effA == null && effB != null) return 1;
                if (effB == null && effA != null) return -1;
                if (effA == null && effB == null) valA = valB = 0;
                else {
                    valA = effA ?? 0;
                    valB = effB ?? 0;
                }
            } else if (sortField === "wave") {
                valA = a.sector_wave_count ?? 0;
                valB = b.sector_wave_count ?? 0;
            }

            if (valA === valB) {
                // Secondary sort by streak then turnover
                if (a.streak !== b.streak) return b.streak - a.streak;
                return b.turnover_cr - a.turnover_cr;
            }

            return sortOrder === "desc" ? valB - valA : valA - valB;
        });
        return sorted;
    }, [filteredItems, sortField, sortOrder, lookback, getRSMetrics, getStockTheme]);

    // Toggle sort
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
        } else {
            setSortField(field);
            setSortOrder(field === "cpr_width" ? "asc" : "desc");
        }
    };

    // Selection handlers
    const toggleSelectTicker = (ticker: string) => {
        setSelectedTickers((prev) => {
            const next = new Set(prev);
            if (next.has(ticker)) {
                next.delete(ticker);
            } else {
                next.add(ticker);
            }
            return next;
        });
    };

    const selectAllVisible = () => {
        const next = new Set(sortedItems.map((i) => i.symbol));
        setSelectedTickers(next);
    };

    const clearSelection = () => {
        setSelectedTickers(new Set());
    };

    // Copy to TradingView formatting
    const copyTradingView = (batchSize?: number, batchIndex = 0) => {
        const sourceList = selectedTickers.size > 0
            ? Array.from(selectedTickers)
            : sortedItems.map((i) => i.symbol);

        if (sourceList.length === 0) return;

        let exportList = sourceList;
        if (batchSize && batchSize > 0) {
            const start = batchIndex * batchSize;
            exportList = sourceList.slice(start, start + batchSize);
        }

        const tvFormatted = exportList
            .map((t) => `NSE:${cleanTicker(t).replace(/[&\-\s]/g, "_")}`)
            .join(", ");

        copyToClipboard(tvFormatted).then((success) => {
            if (success) {
                const label = batchSize
                    ? `Copied batch of ${exportList.length} tickers to clipboard!`
                    : `Copied all ${exportList.length} tickers to clipboard!`;
                setCopyFeedback(label);
                setTimeout(() => setCopyFeedback(null), 3000);
            }
        });
    };

    // Open Save Watchlist Modal
    const handleSaveWatchlistModal = () => {
        const count = selectedTickers.size > 0 ? selectedTickers.size : sortedItems.length;
        const defaultName = `${direction === "high" ? "52W High" : "52W Low"} ${lookback}D Scan (${historyData.metadata.latest_session})`;
        setSaveListName(defaultName);
        setIsSaveModalOpen(true);
    };

    const confirmSaveWatchlist = () => {
        const tickersToSave = selectedTickers.size > 0
            ? Array.from(selectedTickers)
            : sortedItems.map((i) => i.symbol);

        if (onSaveAsWatchlist && tickersToSave.length > 0) {
            onSaveAsWatchlist(saveListName || "52W Scan", tickersToSave, "52W Scans");
        }
        setIsSaveModalOpen(false);
    };

    const targetTickersForActions = useMemo(() => {
        return selectedTickers.size > 0
            ? Array.from(selectedTickers)
            : sortedItems.map((i) => i.symbol);
    }, [selectedTickers, sortedItems]);

    // Active candidate pool matching tradability and lookback window
    const candidatePool = useMemo(() => {
        return rawItems.filter((i) => {
            if (excludeCircuitLocked && i.is_circuit_locked) return false;
            if ((i.turnover_cr ?? 0) < minTurnover) return false;
            if ((i.close ?? 0) < minPrice) return false;
            if (seriesFilter === "EQ" && i.series && i.series !== "EQ") return false;
            const band = (i.circuit_band || "20").trim();
            if (circuitFilter === "exclude_low" && (band === "2" || band === "5")) return false;
            if (circuitFilter === "ge_10" && (band === "2" || band === "5")) return false;
            if (circuitFilter === "fno_20" && band !== "No Band" && band !== "20") return false;
            if (circuitFilter === "fno" && band !== "No Band") return false;

            const count =
                lookback === 5
                    ? i.count_5d
                    : lookback === 10
                    ? i.count_10d
                    : lookback === 20
                    ? i.count_20d
                    : i.count_60d;
            return count > 0;
        });
    }, [rawItems, lookback, excludeCircuitLocked, minTurnover, minPrice, seriesFilter, circuitFilter]);

    const inWindowCount = candidatePool.length;

    const streakCount = useMemo(() => {
        return candidatePool.filter((i) => i.streak >= 2).length;
    }, [candidatePool]);

    const freshCount = useMemo(() => {
        return candidatePool.filter((i) => i.is_fresh_20d).length;
    }, [candidatePool]);

    const apexCount = useMemo(() => {
        return candidatePool.filter((i) => {
            const emaExtOk = i.ema_20_ext != null && i.ema_20_ext >= 2.0 && i.ema_20_ext <= 6.0;
            const cprOk = i.cpr_pos === "above" && i.cpr_width_pct != null && i.cpr_width_pct <= 2.0;
            const volOk = i.vol_surge != null && i.vol_surge >= 1.5;
            const waveOk = i.sector_wave_count != null && i.sector_wave_count >= 3;
            const eqOk = i.series === "EQ" || !i.series;
            return emaExtOk && cprOk && volOk && waveOk && eqOk;
        }).length;
    }, [candidatePool]);

    const oneDayPauseCount = useMemo(() => {
        return candidatePool.filter((i) => i.setup_type === "one_day_pause").length;
    }, [candidatePool]);

    const hammerCount = useMemo(() => {
        return candidatePool.filter((i) => {
            if (i.setup_type === "hammer_bounce") return true;
            const isHammer = i.candle_pattern === "hammer";
            const nearEma = i.ema_20_ext != null && Math.abs(i.ema_20_ext) <= 2.5;
            const nearCpr = i.cpr_dist_top != null && Math.abs(i.cpr_dist_top) <= 2.0;
            return isHammer && (nearEma || nearCpr);
        }).length;
    }, [candidatePool]);

    const shakeoutCount = useMemo(() => {
        return candidatePool.filter((i) => {
            if (i.setup_type === "shakeout_breakout") return true;
            const isRed = i.prev_color === "red";
            const volSurge = i.vol_surge != null && i.vol_surge >= 2.0;
            const delivOk = (i.deliv_pct != null && i.deliv_pct >= 40.0) || i.series === "BE" || i.series === "BZ";
            return isRed && volSurge && delivOk;
        }).length;
    }, [candidatePool]);

    const sectorWaveCount = useMemo(() => {
        return candidatePool.filter((i) => i.sector_wave_count != null && i.sector_wave_count >= 3).length;
    }, [candidatePool]);

    const distFlushCount = useMemo(() => {
        return candidatePool.filter((i) => {
            const belowCpr = i.cpr_pos === "below";
            const volSurge = i.vol_surge != null && i.vol_surge >= 2.0;
            const negEma = i.ema_20_ext != null && i.ema_20_ext < -10.0;
            return belowCpr && volSurge && negEma;
        }).length;
    }, [candidatePool]);

    const windowDates = useMemo(() => {
        return historyData.dates ? historyData.dates.slice(-lookback) : [];
    }, [historyData.dates, lookback]);

    const filteredAvailableThemes = useMemo(() => {
        if (!themeFilterSearch.trim()) return availableThemes;
        const q = themeFilterSearch.trim().toLowerCase();
        return availableThemes.filter((t) => t.name.toLowerCase().includes(q));
    }, [availableThemes, themeFilterSearch]);

    return (
        <div className="space-y-4">
            {/* Top Controls Bar */}
            <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-4 shadow-xl backdrop-blur-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Direction Toggle */}
                    <div className="flex items-center p-1 bg-gray-950/80 rounded-lg border border-gray-800">
                        <button
                            type="button"
                            onClick={() => {
                                setDirection("high");
                                setSelectedTickers(new Set());
                                if (["dist_flush", "breakdown_wave"].includes(presetFilter)) {
                                    setPresetFilter("all");
                                }
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                direction === "high"
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm"
                                    : "text-gray-400 hover:text-gray-200"
                            }`}
                        >
                            <Flame className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                            52W Highs (Momentum)
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">
                                {historyData.highs.length}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setDirection("low");
                                setSelectedTickers(new Set());
                                if (["apex", "apex_confluence", "one_day_pause", "shakeout", "shakeout_breakout", "hammer_bounce", "sector_wave"].includes(presetFilter)) {
                                    setPresetFilter("all");
                                }
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                direction === "low"
                                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-sm"
                                    : "text-gray-400 hover:text-gray-200"
                            }`}
                        >
                            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                            52W Lows (Breakdowns)
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300">
                                {historyData.lows.length}
                            </span>
                        </button>
                    </div>

                    {/* Lookback Window Buttons */}
                    <div className="flex items-center gap-1 bg-gray-950/80 p-1 rounded-lg border border-gray-800">
                        <span className="text-[11px] text-gray-500 font-medium px-2 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-400" /> Window:
                        </span>
                        {([5, 10, 20, 60] as Lookback[]).map((days) => (
                            <button
                                key={days}
                                type="button"
                                onClick={() => setLookback(days)}
                                className={`px-2.5 py-1 text-xs font-medium rounded transition-all ${
                                    lookback === days
                                        ? "bg-blue-600 text-white shadow-sm font-semibold"
                                        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/60"
                                }`}
                            >
                                {days}D {days === 20 ? "(1M)" : days === 60 ? "(3M)" : ""}
                            </button>
                        ))}
                    </div>

                    {/* Search Input */}
                    <div className="relative min-w-[200px]">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Filter symbol or theme..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-gray-950/80 border border-gray-800 text-gray-200 pl-8 pr-3 py-1.5 rounded-lg text-xs focus:outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>
                </div>

                {/* 1-Click Primary Tradability Presets & Granular Drawer Toggle */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-800/80">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-gray-500 font-medium flex items-center gap-1 mr-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            Tradability:
                        </span>
                        <button
                            type="button"
                            onClick={() => applyTradabilityPreset("tradeable")}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                                tradabilityPreset === "tradeable"
                                    ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-sm shadow-emerald-500/10"
                                    : "text-gray-400 bg-gray-950 hover:bg-gray-800/60 border border-gray-800"
                            }`}
                            title="Active by default: Excludes 2% & 5% price bands, turnover < ₹1 Cr, price < ₹20, BE/BZ series, and circuit locked stocks"
                        >
                            <span>⚡ Tradeable Only</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => applyTradabilityPreset("fno_liquid")}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                                tradabilityPreset === "fno_liquid"
                                    ? "bg-purple-500/25 text-purple-300 border border-purple-500/50 shadow-sm shadow-purple-500/10"
                                    : "text-gray-400 bg-gray-950 hover:bg-gray-800/60 border border-gray-800"
                            }`}
                            title="High conviction institutional: Turnover >= ₹10 Cr, F&O (No Band) or 20% Band"
                        >
                            <span>💎 F&O & Liquid</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => applyTradabilityPreset("all")}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                                tradabilityPreset === "all"
                                    ? "bg-blue-500/25 text-blue-300 border border-blue-500/50 shadow-sm"
                                    : "text-gray-400 bg-gray-950 hover:bg-gray-800/60 border border-gray-800"
                            }`}
                            title="Raw, unfiltered universe including all bands and micro-caps"
                        >
                            <span>🌐 All Stocks</span>
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowGranularFilters((prev) => !prev)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                            showGranularFilters || tradabilityPreset === "custom"
                                ? "bg-slate-800 text-slate-200 border-slate-600"
                                : "bg-gray-950/80 text-gray-400 border-gray-800 hover:text-gray-200 hover:bg-gray-800/50"
                        }`}
                        title="Open granular filters drawer"
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                        <span>Fine-Tune</span>
                        {tradabilityPreset === "custom" && activeCustomFilterCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 font-mono">
                                {activeCustomFilterCount}
                            </span>
                        )}
                        <ChevronDown className={`w-3 h-3 transition-transform ${showGranularFilters ? "rotate-180" : ""}`} />
                    </button>
                </div>

                {/* Collapsible Granular Controls Drawer */}
                {showGranularFilters && (
                    <div className="p-3 bg-gray-950/90 rounded-xl border border-gray-800/90 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 animate-in fade-in duration-100 text-xs">
                        {/* Turnover Floor */}
                        <div className="space-y-1">
                            <label className="text-[11px] text-gray-400 font-medium block">Min Turnover</label>
                            <div className="flex items-center gap-1 bg-gray-900 p-0.5 rounded-lg border border-gray-800">
                                {[
                                    { label: "None", val: 0 },
                                    { label: "₹1 Cr", val: 1.0 },
                                    { label: "₹5 Cr", val: 5.0 },
                                    { label: "₹10 Cr", val: 10.0 },
                                ].map((opt) => (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        onClick={() => {
                                            setMinTurnover(opt.val);
                                            setTradabilityPreset("custom");
                                        }}
                                        className={`flex-1 py-1 rounded text-[11px] font-medium transition-all ${
                                            minTurnover === opt.val
                                                ? "bg-blue-600 text-white font-semibold"
                                                : "text-gray-400 hover:text-white"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Price Floor */}
                        <div className="space-y-1">
                            <label className="text-[11px] text-gray-400 font-medium block">Min Price</label>
                            <div className="flex items-center gap-1 bg-gray-900 p-0.5 rounded-lg border border-gray-800">
                                {[
                                    { label: "None", val: 0 },
                                    { label: "₹20", val: 20 },
                                    { label: "₹50", val: 50 },
                                    { label: "₹100", val: 100 },
                                ].map((opt) => (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        onClick={() => {
                                            setMinPrice(opt.val);
                                            setTradabilityPreset("custom");
                                        }}
                                        className={`flex-1 py-1 rounded text-[11px] font-medium transition-all ${
                                            minPrice === opt.val
                                                ? "bg-blue-600 text-white font-semibold"
                                                : "text-gray-400 hover:text-white"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Price Band Filter */}
                        <div className="space-y-1">
                            <label className="text-[11px] text-gray-400 font-medium block">Circuit Band</label>
                            <select
                                value={circuitFilter}
                                onChange={(e) => {
                                    setCircuitFilter(e.target.value as CircuitFilterOption);
                                    setTradabilityPreset("custom");
                                }}
                                className="w-full bg-gray-900 border border-gray-800 text-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-blue-500"
                            >
                                <option value="exclude_low">Exclude 2% &amp; 5% Bands</option>
                                <option value="fno_20">Tradeable (20% &amp; F&amp;O)</option>
                                <option value="fno">F&amp;O Only (No Band)</option>
                                <option value="all">All Bands (2%, 5%, 10%, 20%, F&amp;O)</option>
                            </select>
                        </div>

                        {/* Series Filter */}
                        <div className="space-y-1">
                            <label className="text-[11px] text-gray-400 font-medium block">Security Series</label>
                            <div className="flex items-center gap-1 bg-gray-900 p-0.5 rounded-lg border border-gray-800">
                                {[
                                    { label: "EQ Only", val: "EQ" as const },
                                    { label: "All Series", val: "all" as const },
                                ].map((opt) => (
                                    <button
                                        key={opt.label}
                                        type="button"
                                        onClick={() => {
                                            setSeriesFilter(opt.val);
                                            setTradabilityPreset("custom");
                                        }}
                                        className={`flex-1 py-1 rounded text-[11px] font-medium transition-all ${
                                            seriesFilter === opt.val
                                                ? "bg-blue-600 text-white font-semibold"
                                                : "text-gray-400 hover:text-white"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Circuit Lock Status */}
                        <div className="space-y-1">
                            <label className="text-[11px] text-gray-400 font-medium block">Circuit Lock</label>
                            <button
                                type="button"
                                onClick={() => {
                                    setExcludeCircuitLocked((prev) => !prev);
                                    setTradabilityPreset("custom");
                                }}
                                className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                                    excludeCircuitLocked
                                        ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                                        : "bg-gray-900 text-gray-400 border-gray-800"
                                }`}
                            >
                                <span>{excludeCircuitLocked ? "🔒 Exclude Locked" : "🔓 Allow Locked"}</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Preset Filter Chips */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-800/80">
                    <span className="text-[11px] text-gray-500 font-medium flex items-center gap-1">
                        <Filter className="w-3 h-3 text-gray-400" /> Presets:
                    </span>
                    <button
                        type="button"
                        onClick={() => setPresetFilter("all")}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            presetFilter === "all"
                                ? "bg-gray-800 text-white border border-gray-700 font-semibold"
                                : "text-gray-400 bg-gray-950 hover:bg-gray-800/50 border border-gray-800"
                        }`}
                    >
                        All ({inWindowCount})
                    </button>

                    {direction === "high" ? (
                        <>
                            <button
                                type="button"
                                onClick={() => setPresetFilter("one_day_pause")}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                                    presetFilter === "one_day_pause"
                                        ? "bg-cyan-500/25 text-cyan-300 border border-cyan-500/50 shadow-sm shadow-cyan-500/20"
                                        : "text-cyan-400/90 bg-cyan-950/20 hover:bg-cyan-950/40 border border-cyan-800/40"
                                }`}
                                title="1D Pause / Retest: 52W High hit yesterday, resting / pulling back near 20 EMA or CPR"
                            >
                                <span>🎯 1D Pause / Retest</span>
                                <span className="text-[10px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                                    {oneDayPauseCount}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setPresetFilter("shakeout_breakout")}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                                    presetFilter === "shakeout_breakout" || presetFilter === "shakeout"
                                        ? "bg-amber-500/25 text-amber-300 border border-amber-500/50 shadow-sm"
                                        : "text-amber-400/90 bg-amber-950/20 hover:bg-amber-950/40 border border-amber-800/40"
                                }`}
                                title="Shakeout Breakout: Today is 52W High (or thrust >= 1.5%) after prior day Red bar"
                            >
                                <span>⚡ Shakeout Breakout</span>
                                <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-mono">
                                    {shakeoutCount}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setPresetFilter("hammer_bounce")}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                                    presetFilter === "hammer_bounce"
                                        ? "bg-purple-500/25 text-purple-300 border border-purple-500/50 shadow-sm"
                                        : "text-purple-400/90 bg-purple-950/20 hover:bg-purple-950/40 border border-purple-800/40"
                                }`}
                                title="Hammer / Bounce: Hammer pattern near 20 EMA (+/- 2.5%) or CPR Top (+/- 2.0%)"
                            >
                                <span>🔨 Hammer / Bounce</span>
                                <span className="text-[10px] px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 font-mono">
                                    {hammerCount}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setPresetFilter("apex_confluence")}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                                    presetFilter === "apex_confluence" || presetFilter === "apex"
                                        ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-sm shadow-emerald-500/20"
                                        : "text-emerald-400/90 bg-emerald-950/20 hover:bg-emerald-950/40 border border-emerald-800/40"
                                }`}
                                title="Apex Confluence: 20 EMA in Sweet Spot (2-6%) + Above Narrow CPR (<=2%) + Vol Surge >= 1.5x + Sector Wave >= 3 + EQ Series"
                            >
                                <span>🏆 Apex Confluence</span>
                                <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                                    {apexCount}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setPresetFilter("sector_wave")}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                                    presetFilter === "sector_wave"
                                        ? "bg-blue-500/25 text-blue-300 border border-blue-500/50 shadow-sm"
                                        : "text-blue-400/90 bg-blue-950/20 hover:bg-blue-950/40 border border-blue-800/40"
                                }`}
                                title="Sector Wave Leaders: Active cluster with >= 3 stocks breaking out in same industry theme"
                            >
                                <span>🌊 Sector Wave</span>
                                <span className="text-[10px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono">
                                    {sectorWaveCount}
                                </span>
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => setPresetFilter("dist_flush")}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                                    presetFilter === "dist_flush"
                                        ? "bg-rose-500/25 text-rose-300 border border-rose-500/50 shadow-sm"
                                        : "text-rose-400/90 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-800/40"
                                }`}
                                title="Distribution Flush: Below CPR + Volume Surge >= 2.0x + Negative EMA Extension < -10%"
                            >
                                <span>⚠️ Distribution Flush</span>
                                <span className="text-[10px] px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 font-mono">
                                    {distFlushCount}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setPresetFilter("breakdown_wave")}
                                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                                    presetFilter === "breakdown_wave"
                                        ? "bg-red-500/25 text-red-300 border border-red-500/50 shadow-sm"
                                        : "text-red-400/90 bg-red-950/20 hover:bg-red-950/40 border border-red-800/40"
                                }`}
                                title="Breakdown Wave: Active cluster with >= 3 stocks hitting 52W Lows in same industry theme"
                            >
                                <span>🩸 Breakdown Wave</span>
                                <span className="text-[10px] px-1 py-0.2 rounded bg-red-500/20 text-red-300 font-mono">
                                    {sectorWaveCount}
                                </span>
                            </button>
                        </>
                    )}

                    <button
                        type="button"
                        onClick={() => setPresetFilter("streak")}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            presetFilter === "streak"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold"
                                : "text-gray-400 bg-gray-950 hover:bg-gray-800/50 border border-gray-800"
                        }`}
                    >
                        <Flame className="w-3 h-3 text-amber-400" />
                        Active Streak (≥ 2d)
                        <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300">
                            {streakCount}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setPresetFilter("persistent")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            presetFilter === "persistent"
                                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-semibold"
                                : "text-gray-400 bg-gray-950 hover:bg-gray-800/50 border border-gray-800"
                        }`}
                    >
                        ⭐ Persistent (≥ 3 in {lookback}D)
                    </button>
                    <button
                        type="button"
                        onClick={() => setPresetFilter("fresh")}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            presetFilter === "fresh"
                                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold"
                                : "text-gray-400 bg-gray-950 hover:bg-gray-800/50 border border-gray-800"
                        }`}
                    >
                        {direction === "high" ? "🚀 Fresh Breakouts (1st in 20d)" : "🧊 Fresh Breakdowns (1st in 20d)"}
                        <span className="text-[10px] px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
                            {freshCount}
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setPresetFilter("high_rs")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            presetFilter === "high_rs"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold"
                                : "text-gray-400 bg-gray-950 hover:bg-gray-800/50 border border-gray-800"
                        }`}
                    >
                        💎 High RS (≥ 80)
                    </button>
                    <button
                        type="button"
                        onClick={() => setPresetFilter("rs_lead")}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                            presetFilter === "rs_lead"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold"
                                : "text-gray-400 bg-gray-950 hover:bg-gray-800/50 border border-gray-800"
                        }`}
                    >
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        RS Lead Breakout (*)
                    </button>
                </div>
            </div>

            {/* Batch Action Toolbar */}
            <div className="bg-gray-900/80 border border-gray-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            if (selectedTickers.size === sortedItems.length && sortedItems.length > 0) {
                                clearSelection();
                            } else {
                                selectAllVisible();
                            }
                        }}
                        className="flex items-center gap-1.5 text-xs text-gray-300 hover:text-white transition-colors"
                    >
                        {selectedTickers.size > 0 && selectedTickers.size === sortedItems.length ? (
                            <CheckSquare className="w-4 h-4 text-blue-400" />
                        ) : selectedTickers.size > 0 ? (
                            <div className="w-4 h-4 rounded bg-blue-500/20 border border-blue-400 flex items-center justify-center text-[10px] text-blue-300 font-bold">
                                -
                            </div>
                        ) : (
                            <Square className="w-4 h-4 text-gray-500" />
                        )}
                        <span className="font-medium">
                            {selectedTickers.size > 0
                                ? `${selectedTickers.size} of ${sortedItems.length} selected`
                                : `Select All (${sortedItems.length})`}
                        </span>
                    </button>

                    {/* 2-Way View Switcher */}
                    <div className="flex items-center gap-0.5 bg-gray-950 p-0.5 rounded-lg border border-gray-800">
                        <button
                            type="button"
                            onClick={() => {
                                setVisibleColumns(CONFLUENCE_VISIBLE_COLUMNS);
                            }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                                isConfluenceView
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                                    : "text-gray-400 hover:text-gray-200"
                            }`}
                            title="Compact, high-density view focused on institutional confluence setup (zero horizontal scroll)"
                        >
                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                            <span>Confluence View</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setVisibleColumns(defaultVisibleColumns);
                            }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                                isTerminalView
                                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm"
                                    : "text-gray-400 hover:text-gray-200"
                            }`}
                            title="Full 18-column institutional terminal with pinned identity columns"
                        >
                            <BarChart2 className="w-3.5 h-3.5 text-blue-400" />
                            <span>Full Terminal</span>
                        </button>
                    </div>
                    {selectedTickers.size > 0 && (
                        <button
                            type="button"
                            onClick={clearSelection}
                            className="text-[11px] text-gray-500 hover:text-gray-300 underline"
                        >
                            Clear
                        </button>
                    )}

                    {activeColumnFilterCount > 0 && (
                        <button
                            type="button"
                            onClick={clearAllColumnFilters}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium transition-colors"
                            title="Reset all column filters"
                        >
                            <X className="w-3.5 h-3.5" />
                            <span>Clear Column Filters ({activeColumnFilterCount})</span>
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Open in RRG */}
                    {onOpenInRRG && (
                        <button
                            type="button"
                            onClick={() => {
                                const suggestedScanName = `${direction === "high" ? "52W High" : "52W Low"} ${lookback}D Scan (${targetTickersForActions.length} stocks)`;
                                onOpenInRRG(targetTickersForActions, suggestedScanName);
                            }}
                            disabled={targetTickersForActions.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Load repeaters into RRG Chart"
                        >
                            <Layers className="w-3.5 h-3.5" />
                            Open in RRG
                        </button>
                    )}

                    {/* Open in Table */}
                    {onOpenInTable && (
                        <button
                            type="button"
                            onClick={() => {
                                const suggestedScanName = `${direction === "high" ? "52W High" : "52W Low"} ${lookback}D Scan (${targetTickersForActions.length} stocks)`;
                                onOpenInTable(targetTickersForActions, suggestedScanName);
                            }}
                            disabled={targetTickersForActions.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title="View constituent metrics in table"
                        >
                            <TableIcon className="w-3.5 h-3.5" />
                            Open in Table
                        </button>
                    )}

                    {/* Save as Watchlist */}
                    {onSaveAsWatchlist && (
                        <button
                            type="button"
                            onClick={handleSaveWatchlistModal}
                            disabled={targetTickersForActions.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Save into 52W Scans folder"
                        >
                            <Save className="w-3.5 h-3.5" />
                            Save as Watchlist
                        </button>
                    )}

                    {/* TradingView Copy Batches */}
                    <div className="relative group">
                        <button
                            type="button"
                            onClick={() => copyTradingView()}
                            disabled={targetTickersForActions.length === 0}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Copy className="w-3.5 h-3.5 text-gray-400" />
                            Copy TV Batches
                            <ChevronDown className="w-3 h-3 text-gray-400" />
                        </button>
                        {targetTickersForActions.length > 0 && (
                            <div className="absolute right-0 top-full mt-1 hidden group-hover:block w-52 max-h-72 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-1 z-50">
                                <button
                                    type="button"
                                    onClick={() => copyTradingView()}
                                    className="w-full text-left px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-800 rounded flex items-center justify-between"
                                >
                                    <span>Copy All</span>
                                    <span className="text-[10px] text-gray-500 font-mono">
                                        {targetTickersForActions.length}
                                    </span>
                                </button>
                                {targetTickersForActions.length > 15 && (
                                    <div className="border-t border-gray-800 my-1 pt-1">
                                        <div className="px-2 py-0.5 text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
                                            Batches of 15
                                        </div>
                                        {Array.from(
                                             { length: Math.ceil(targetTickersForActions.length / 15) },
                                            (_, idx) => {
                                                const start = idx * 15 + 1;
                                                const end = Math.min((idx + 1) * 15, targetTickersForActions.length);
                                                return (
                                                    <button
                                                        key={`b15-${idx}`}
                                                        type="button"
                                                        onClick={() => copyTradingView(15, idx)}
                                                        className="w-full text-left px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-800 rounded flex items-center justify-between"
                                                    >
                                                        <span>Batch {idx + 1} ({start}–{end})</span>
                                                        <span className="text-[10px] text-gray-500 font-mono">
                                                            {end - start + 1}
                                                        </span>
                                                    </button>
                                                );
                                            }
                                        )}
                                    </div>
                                )}
                                {targetTickersForActions.length > 30 && (
                                    <div className="border-t border-gray-800 my-1 pt-1">
                                        <div className="px-2 py-0.5 text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
                                            Batches of 30
                                        </div>
                                        {Array.from(
                                            { length: Math.ceil(targetTickersForActions.length / 30) },
                                            (_, idx) => {
                                                const start = idx * 30 + 1;
                                                const end = Math.min((idx + 1) * 30, targetTickersForActions.length);
                                                return (
                                                    <button
                                                        key={`b30-${idx}`}
                                                        type="button"
                                                        onClick={() => copyTradingView(30, idx)}
                                                        className="w-full text-left px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-800 rounded flex items-center justify-between"
                                                    >
                                                        <span>Batch {idx + 1} ({start}–{end})</span>
                                                        <span className="text-[10px] text-gray-500 font-mono">
                                                            {end - start + 1}
                                                        </span>
                                                    </button>
                                                );
                                            }
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Entire Table Screenshot Capture */}
                    <CaptureScreenshot
                        targetRef={tableContainerRef}
                        filename={direction === "high" ? "52W_High_Recurrence_Scan" : "52W_Low_Recurrence_Scan"}
                        label="Capture Table"
                        onBeforeCapture={handleBeforeCapture}
                    />

                    {/* Column Visibility Picker */}
                    <div className="relative" ref={columnDropdownRef}>
                        <button
                            type="button"
                            onClick={() => setIsColumnDropdownOpen(!isColumnDropdownOpen)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg text-xs font-semibold transition-all shadow-sm"
                        >
                            <Columns className="w-3.5 h-3.5 text-blue-400" />
                            <span>Columns</span>
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${isColumnDropdownOpen ? "rotate-180" : ""}`} />
                        </button>

                        {isColumnDropdownOpen && (
                            <div className="absolute right-0 top-full mt-1.5 w-72 bg-[#111118] border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in">
                                <div className="p-2 flex flex-col gap-1 max-h-72 overflow-y-auto">
                                    <div className="flex justify-between items-center px-1 mb-1 pb-2 border-b border-gray-800">
                                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Columns</span>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const allSelected: Record<string, boolean> = {};
                                                    SCANNER_COLUMNS.forEach((c) => (allSelected[c.key] = true));
                                                    setVisibleColumns(allSelected);
                                                }}
                                                className="text-[10px] text-blue-400 hover:text-blue-300 font-medium"
                                            >
                                                All
                                            </button>
                                            <span className="text-gray-600 text-[10px]">|</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const noneSelected: Record<string, boolean> = {};
                                                    SCANNER_COLUMNS.forEach((c) => (noneSelected[c.key] = false));
                                                    setVisibleColumns(noneSelected);
                                                }}
                                                className="text-[10px] text-red-400 hover:text-red-300 font-medium"
                                            >
                                                None
                                            </button>
                                            <span className="text-gray-600 text-[10px]">|</span>
                                            <button
                                                type="button"
                                                onClick={() => setVisibleColumns(defaultVisibleColumns)}
                                                className="text-[10px] text-gray-400 hover:text-gray-300 font-medium"
                                            >
                                                Reset
                                            </button>
                                            <span className="text-gray-600 text-[10px]">|</span>
                                            <button
                                                type="button"
                                                onClick={() => setColumnWidths(DEFAULT_COLUMN_WIDTHS)}
                                                className="text-[10px] text-amber-400 hover:text-amber-300 font-medium whitespace-nowrap"
                                                title="Reset column widths to defaults"
                                            >
                                                Reset Widths
                                            </button>
                                        </div>
                                    </div>
                                    {SCANNER_COLUMNS.map((col) => {
                                        const isChecked = visibleColumns[col.key] !== false;
                                        return (
                                            <label
                                                key={col.key}
                                                className="flex items-center gap-2 px-2 py-1.5 hover:bg-white/5 rounded-lg cursor-pointer text-xs text-gray-300 transition-colors select-none"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => toggleColumn(col.key)}
                                                    className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-0 h-3.5 w-3.5 cursor-pointer"
                                                />
                                                <span>{col.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {copyFeedback && (
                        <div className="text-xs text-emerald-400 font-medium flex items-center gap-1 animate-fade-in">
                            <Check className="w-3.5 h-3.5" />
                            {copyFeedback}
                        </div>
                    )}
                </div>
            </div>

            {/* Recurrence Table */}
            <div ref={tableContainerRef} className="overflow-x-auto max-h-[70vh] border border-gray-800 rounded-xl relative bg-gray-900 shadow-xl">
                <table style={{ width: `${totalTableWidth}px`, minWidth: `${totalTableWidth}px` }} className="text-left text-xs text-gray-300 border-collapse">
                    <colgroup>
                        <col style={{ width: "40px", minWidth: "40px" }} />
                        <col style={{ width: `${colWidths.symbol}px`, minWidth: `${colWidths.symbol}px` }} />
                        {visibleColumns.band !== false && <col style={{ width: `${colWidths.band}px`, minWidth: `${colWidths.band}px` }} />}
                        {visibleColumns.candle !== false && <col style={{ width: `${colWidths.candle}px`, minWidth: `${colWidths.candle}px` }} />}
                        {visibleColumns.ema_ext !== false && <col style={{ width: `${colWidths.ema_ext}px`, minWidth: `${colWidths.ema_ext}px` }} />}
                        {visibleColumns.cpr !== false && <col style={{ width: `${colWidths.cpr}px`, minWidth: `${colWidths.cpr}px` }} />}
                        {visibleColumns.vol_deliv !== false && <col style={{ width: `${colWidths.vol_deliv}px`, minWidth: `${colWidths.vol_deliv}px` }} />}
                        {visibleColumns.sector_wave !== false && <col style={{ width: `${colWidths.sector_wave}px`, minWidth: `${colWidths.sector_wave}px` }} />}
                        {visibleColumns.theme !== false && <col style={{ width: `${colWidths.theme}px`, minWidth: `${colWidths.theme}px` }} />}
                        {visibleColumns.streak !== false && <col style={{ width: `${colWidths.streak}px`, minWidth: `${colWidths.streak}px` }} />}
                        {visibleColumns.frequency !== false && <col style={{ width: `${colWidths.frequency}px`, minWidth: `${colWidths.frequency}px` }} />}
                        {visibleColumns.timeline !== false && <col style={{ width: `${colWidths.timeline}px`, minWidth: `${colWidths.timeline}px` }} />}
                        {visibleColumns.rs !== false && <col style={{ width: `${colWidths.rs}px`, minWidth: `${colWidths.rs}px` }} />}
                        {visibleColumns.close !== false && <col style={{ width: `${colWidths.close}px`, minWidth: `${colWidths.close}px` }} />}
                        {visibleColumns.pct_1d !== false && <col style={{ width: `${colWidths.pct_1d}px`, minWidth: `${colWidths.pct_1d}px` }} />}
                        {visibleColumns.pct_5d !== false && <col style={{ width: `${colWidths.pct_5d}px`, minWidth: `${colWidths.pct_5d}px` }} />}
                        {visibleColumns.turnover !== false && <col style={{ width: `${colWidths.turnover}px`, minWidth: `${colWidths.turnover}px` }} />}
                        {visibleColumns.quick_add !== false && <col style={{ width: `${colWidths.quick_add}px`, minWidth: `${colWidths.quick_add}px` }} />}
                    </colgroup>
                        <thead className="sticky top-0 z-30 bg-[#0d0d14] text-gray-400 font-semibold border-b border-gray-800 uppercase text-[10px] tracking-wider shadow-sm select-none">
                            <tr className="bg-[#0d0d14]">
                                <th style={{ width: "40px", minWidth: "40px", maxWidth: "40px" }} className="p-3 w-10 min-w-10 max-w-10 text-center sticky left-0 z-40 bg-[#0d0d14]">
                                    <span className="sr-only">Select</span>
                                </th>
                                <th style={{ width: `${colWidths.symbol}px`, minWidth: `${colWidths.symbol}px`, maxWidth: `${colWidths.symbol}px` }} className="p-2.5 sticky left-10 z-40 bg-[#0d0d14]">
                                    <div className="flex items-center justify-between gap-1.5">
                                        <div
                                            className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                            onClick={() => handleSort("symbol")}
                                        >
                                            <span>Symbol</span>
                                            {getSortIcon("symbol")}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveFilterPopover(activeFilterPopover === "symbol" ? null : "symbol");
                                            }}
                                            className={`p-1 rounded transition-colors ${
                                                hasColumnFilter("symbol")
                                                    ? "text-blue-400 bg-blue-500/20"
                                                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                            }`}
                                            title="Filter Symbol"
                                        >
                                            <Filter className={`w-3 h-3 ${hasColumnFilter("symbol") ? "fill-blue-400" : ""}`} />
                                        </button>
                                    </div>
                                    {activeFilterPopover === "symbol" && (
                                        <div
                                            ref={filterPopoverRef}
                                            className="absolute left-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                <span className="font-semibold text-xs text-gray-200">Filter Symbol</span>
                                                <div className="flex items-center gap-2">
                                                    {hasColumnFilter("symbol") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => clearSingleColumnFilter("symbol")}
                                                            className="text-[10px] text-red-400 hover:text-red-300"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveFilterPopover(null)}
                                                        className="text-gray-400 hover:text-gray-200"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="relative">
                                                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search symbol (e.g. TATA)..."
                                                        value={columnFilters.symbol}
                                                        onChange={(e) => setColumnFilters((prev) => ({ ...prev, symbol: e.target.value }))}
                                                        className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500 font-mono"
                                                        autoFocus
                                                    />
                                                </div>
                                                <p className="text-[10px] text-gray-500">Filter by symbol name or clean ticker.</p>
                                            </div>
                                        </div>
                                    )}
                                    <div
                                        onMouseDown={(e) => handleResizeMouseDown("symbol", e)}
                                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                        title="Drag to resize column"
                                    />
                                </th>
                                {/* Band */}
                                {visibleColumns.band !== false && (
                                    <th style={{ width: `${colWidths.band}px`, minWidth: `${colWidths.band}px` }} className="p-2.5 relative text-center bg-[#0d0d14]">
                                        <div className="flex items-center justify-center gap-1.5">
                                            <div
                                                className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                                onClick={() => handleSort("band")}
                                            >
                                                <span>Band</span>
                                                {getSortIcon("band")}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveFilterPopover(activeFilterPopover === "band" ? null : "band");
                                                }}
                                                className={`p-1 rounded transition-colors ${
                                                    hasColumnFilter("band")
                                                        ? "text-blue-400 bg-blue-500/20"
                                                        : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                                }`}
                                                title="Filter Price Band"
                                            >
                                                <Filter className={`w-3 h-3 ${hasColumnFilter("band") ? "fill-blue-400" : ""}`} />
                                            </button>
                                        </div>
                                        {activeFilterPopover === "band" && (
                                            <div
                                                ref={filterPopoverRef}
                                                className="absolute left-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                    <span className="font-semibold text-xs text-gray-200">Filter Circuit Band</span>
                                                    <div className="flex items-center gap-2">
                                                        {hasColumnFilter("band") && (
                                                            <button
                                                                type="button"
                                                                onClick={() => clearSingleColumnFilter("band")}
                                                                className="text-[10px] text-red-400 hover:text-red-300"
                                                            >
                                                                Clear
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveFilterPopover(null)}
                                                            className="text-gray-400 hover:text-gray-200"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2.5">
                                                    <div className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">Circuit Bands</div>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {[
                                                            { id: "No Band", label: "F&O / No Band" },
                                                            { id: "20", label: "20%" },
                                                            { id: "10", label: "10%" },
                                                            { id: "5", label: "5%" },
                                                            { id: "2", label: "2%" },
                                                        ].map((b) => {
                                                            const active = columnFilters.bands.includes(b.id);
                                                            return (
                                                                <button
                                                                    key={b.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setColumnFilters((prev) => ({
                                                                            ...prev,
                                                                            bands: active
                                                                                ? prev.bands.filter((x) => x !== b.id)
                                                                                : [...prev.bands, b.id],
                                                                        }));
                                                                    }}
                                                                    className={`px-2 py-1 rounded text-[11px] font-semibold border transition-all ${
                                                                        active
                                                                            ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                                                                            : "bg-gray-800/80 text-gray-300 border-gray-700 hover:bg-gray-700"
                                                                    }`}
                                                                >
                                                                    {b.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    <div className="border-t border-gray-800 pt-2 space-y-1">
                                                        <div className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider">Circuit Lock State</div>
                                                        <div className="flex gap-1.5">
                                                            {(["all", "unlocked", "locked"] as const).map((m) => (
                                                                <button
                                                                    key={m}
                                                                    type="button"
                                                                    onClick={() => setColumnFilters((prev) => ({ ...prev, circuitLocked: m }))}
                                                                    className={`flex-1 py-1 text-[11px] font-medium rounded border transition-colors ${
                                                                        columnFilters.circuitLocked === m
                                                                            ? "bg-blue-600 text-white border-blue-500"
                                                                            : "bg-gray-800/60 text-gray-300 border-gray-700 hover:bg-gray-700"
                                                                    }`}
                                                                >
                                                                    {m === "all" ? "All" : m === "unlocked" ? "Unlocked" : "🔒 Locked"}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div
                                            onMouseDown={(e) => handleResizeMouseDown("band", e)}
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                            title="Drag to resize column"
                                        />
                                    </th>
                                )}

                        {/* Candle & Signal */}
                        {visibleColumns.candle !== false && (
                            <th style={{ width: `${colWidths.candle}px`, minWidth: `${colWidths.candle}px` }} className="p-2.5 relative bg-[#0d0d14]">
                                <div className="flex items-center justify-between gap-1.5">
                                    <div
                                        className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                        onClick={() => handleSort("candle_pattern")}
                                    >
                                        <span>Candle &amp; Signal</span>
                                        {getSortIcon("candle_pattern")}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveFilterPopover(activeFilterPopover === "candle" ? null : "candle");
                                        }}
                                        className={`p-1 rounded transition-colors ${
                                            hasColumnFilter("candle")
                                                ? "text-blue-400 bg-blue-500/20"
                                                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                        }`}
                                        title="Filter Candle Pattern &amp; Prior Color"
                                    >
                                        <Filter className={`w-3 h-3 ${hasColumnFilter("candle") ? "fill-blue-400" : ""}`} />
                                    </button>
                                </div>
                                {activeFilterPopover === "candle" && (
                                    <div
                                        ref={filterPopoverRef}
                                        className="absolute left-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                            <span className="font-semibold text-xs text-gray-200">Filter Candle &amp; Signal</span>
                                            <div className="flex items-center gap-2">
                                                {hasColumnFilter("candle") && (
                                                    <button
                                                        type="button"
                                                        onClick={() => clearSingleColumnFilter("candle")}
                                                        className="text-[10px] text-red-400 hover:text-red-300"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveFilterPopover(null)}
                                                    className="text-gray-400 hover:text-gray-200"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider block mb-1.5">
                                                    Candle Patterns
                                                </label>
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    {[
                                                        { id: "hammer", label: "🔨 Hammer" },
                                                        { id: "thrust", label: "🚀 Thrust" },
                                                        { id: "rejection", label: "⚠️ Rejection" },
                                                        { id: "normal", label: "Normal" },
                                                    ].map((p) => {
                                                        const active = columnFilters.candlePatterns.includes(p.id);
                                                        return (
                                                            <button
                                                                key={p.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setColumnFilters((prev) => ({
                                                                        ...prev,
                                                                        candlePatterns: active
                                                                            ? prev.candlePatterns.filter((x) => x !== p.id)
                                                                            : [...prev.candlePatterns, p.id],
                                                                    }));
                                                                }}
                                                                className={`px-2 py-1 rounded text-[11px] font-medium border text-left transition-all ${
                                                                    active
                                                                        ? "bg-blue-600 text-white border-blue-500 font-semibold"
                                                                        : "bg-gray-800/80 text-gray-300 border-gray-700 hover:bg-gray-700"
                                                                }`}
                                                            >
                                                                {p.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="border-t border-gray-800 pt-2">
                                                <label className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider block mb-1.5">
                                                    Prior Day Candle Color
                                                </label>
                                                <div className="flex gap-1.5">
                                                    {[
                                                        { id: "all", label: "All" },
                                                        { id: "red", label: "🔴 Red" },
                                                        { id: "green", label: "🟢 Green" },
                                                    ].map((c) => (
                                                        <button
                                                            key={c.id}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, prevColor: c.id as any }))}
                                                            className={`flex-1 py-1 text-[11px] font-medium rounded border transition-colors ${
                                                                columnFilters.prevColor === c.id
                                                                    ? "bg-blue-600 text-white border-blue-500 font-semibold"
                                                                    : "bg-gray-800/60 text-gray-300 border-gray-700 hover:bg-gray-700"
                                                            }`}
                                                        >
                                                            {c.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("candle", e)}
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                    title="Drag to resize column"
                                />
                            </th>
                        )}

                        {/* 20 EMA Ext */}
                        {visibleColumns.ema_ext !== false && (
                            <th style={{ width: `${colWidths.ema_ext}px`, minWidth: `${colWidths.ema_ext}px` }} className="p-2.5 relative text-right bg-[#0d0d14]">
                                <div className="flex items-center justify-end gap-1.5">
                                    <div
                                        className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                        onClick={() => handleSort("ema_20_ext")}
                                    >
                                        <span>20 EMA Ext</span>
                                        {getSortIcon("ema_20_ext")}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveFilterPopover(activeFilterPopover === "ema_ext" ? null : "ema_ext");
                                        }}
                                        className={`p-1 rounded transition-colors ${
                                            hasColumnFilter("ema_ext")
                                                ? "text-blue-400 bg-blue-500/20"
                                                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                        }`}
                                        title="Filter 20 EMA Extension"
                                    >
                                        <Filter className={`w-3 h-3 ${hasColumnFilter("ema_ext") ? "fill-blue-400" : ""}`} />
                                    </button>
                                </div>
                                {activeFilterPopover === "ema_ext" && (
                                    <div
                                        ref={filterPopoverRef}
                                        className="absolute left-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                            <span className="font-semibold text-xs text-gray-200">Filter 20 EMA Ext</span>
                                            <div className="flex items-center gap-2">
                                                {hasColumnFilter("ema_ext") && (
                                                    <button
                                                        type="button"
                                                        onClick={() => clearSingleColumnFilter("ema_ext")}
                                                        className="text-[10px] text-red-400 hover:text-red-300"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveFilterPopover(null)}
                                                    className="text-gray-400 hover:text-gray-200"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-2.5">
                                            <div className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider">Quick Presets</div>
                                            <div className="flex flex-wrap gap-1">
                                                {[
                                                    { label: "Sweet Spot (2–6%)", min: 2, max: 6 },
                                                    { label: "Tight (0–2%)", min: 0, max: 2 },
                                                    { label: "Extended (>6%)", min: 6, max: null },
                                                    { label: "Exclude Climax (>12%)", min: null, max: 12 },
                                                ].map((p, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => setColumnFilters((prev) => ({ ...prev, minEmaExt: p.min, maxEmaExt: p.max }))}
                                                        className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                                                            columnFilters.minEmaExt === p.min && columnFilters.maxEmaExt === p.max
                                                                ? "bg-blue-600 text-white border-blue-500 font-semibold"
                                                                : "bg-gray-800 text-gray-300 border-gray-700 hover:text-white"
                                                        }`}
                                                    >
                                                        {p.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-800">
                                                <div>
                                                    <label className="text-[10px] text-gray-400 block mb-1">Min %</label>
                                                    <input
                                                        type="number"
                                                        step="0.5"
                                                        value={columnFilters.minEmaExt !== null ? columnFilters.minEmaExt : ""}
                                                        onChange={(e) => setColumnFilters((prev) => ({ ...prev, minEmaExt: e.target.value === "" ? null : parseFloat(e.target.value) }))}
                                                        placeholder="-5"
                                                        className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-gray-400 block mb-1">Max %</label>
                                                    <input
                                                        type="number"
                                                        step="0.5"
                                                        value={columnFilters.maxEmaExt !== null ? columnFilters.maxEmaExt : ""}
                                                        onChange={(e) => setColumnFilters((prev) => ({ ...prev, maxEmaExt: e.target.value === "" ? null : parseFloat(e.target.value) }))}
                                                        placeholder="15"
                                                        className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("ema_ext", e)}
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                    title="Drag to resize column"
                                />
                            </th>
                        )}

                        {/* Monthly CPR */}
                        {visibleColumns.cpr !== false && (
                            <th style={{ width: `${colWidths.cpr}px`, minWidth: `${colWidths.cpr}px` }} className="p-2.5 relative bg-[#0d0d14]">
                                <div className="flex items-center justify-between gap-1.5">
                                    <div
                                        className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                        onClick={() => handleSort("cpr_width")}
                                    >
                                        <span>Monthly CPR</span>
                                        {getSortIcon("cpr_width")}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveFilterPopover(activeFilterPopover === "cpr" ? null : "cpr");
                                        }}
                                        className={`p-1 rounded transition-colors ${
                                            hasColumnFilter("cpr")
                                                ? "text-blue-400 bg-blue-500/20"
                                                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                        }`}
                                        title="Filter Monthly CPR Position &amp; Width"
                                    >
                                        <Filter className={`w-3 h-3 ${hasColumnFilter("cpr") ? "fill-blue-400" : ""}`} />
                                    </button>
                                </div>
                                {activeFilterPopover === "cpr" && (
                                    <div
                                        ref={filterPopoverRef}
                                        className="absolute right-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                            <span className="font-semibold text-xs text-gray-200">Filter Monthly CPR</span>
                                            <div className="flex items-center gap-2">
                                                {hasColumnFilter("cpr") && (
                                                    <button
                                                        type="button"
                                                        onClick={() => clearSingleColumnFilter("cpr")}
                                                        className="text-[10px] text-red-400 hover:text-red-300"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveFilterPopover(null)}
                                                    className="text-gray-400 hover:text-gray-200"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider block mb-1.5">
                                                    CPR Position
                                                </label>
                                                <div className="flex gap-1.5">
                                                    {[
                                                        { id: "above", label: "Above" },
                                                        { id: "inside", label: "Inside" },
                                                        { id: "below", label: "Below" },
                                                    ].map((pos) => {
                                                        const active = columnFilters.cprPositions.includes(pos.id);
                                                        return (
                                                            <button
                                                                key={pos.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    setColumnFilters((prev) => ({
                                                                        ...prev,
                                                                        cprPositions: active
                                                                            ? prev.cprPositions.filter((x) => x !== pos.id)
                                                                            : [...prev.cprPositions, pos.id],
                                                                    }));
                                                                }}
                                                                className={`flex-1 py-1 text-[11px] font-medium rounded border transition-colors ${
                                                                    active
                                                                        ? "bg-blue-600 text-white border-blue-500 font-semibold"
                                                                        : "bg-gray-800/60 text-gray-300 border-gray-700 hover:bg-gray-700"
                                                                }`}
                                                            >
                                                                {pos.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="border-t border-gray-800 pt-2">
                                                <label className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider block mb-1.5">
                                                    Max CPR Width %
                                                </label>
                                                <div className="flex flex-wrap gap-1 mb-2">
                                                    {[
                                                        { label: "All", max: 0 },
                                                        { label: "Narrow (≤ 2%)", max: 2 },
                                                        { label: "Medium (≤ 5%)", max: 5 },
                                                    ].map((w, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, maxCprWidth: w.max }))}
                                                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                                                                columnFilters.maxCprWidth === w.max
                                                                    ? "bg-blue-600 text-white border-blue-500 font-semibold"
                                                                    : "bg-gray-800 text-gray-300 border-gray-700 hover:text-white"
                                                            }`}
                                                        >
                                                            {w.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <input
                                                    type="number"
                                                    step="0.5"
                                                    min="0"
                                                    value={columnFilters.maxCprWidth || ""}
                                                    onChange={(e) => setColumnFilters((prev) => ({ ...prev, maxCprWidth: Math.max(0, parseFloat(e.target.value) || 0) }))}
                                                    placeholder="Max width % (e.g. 2.5)"
                                                    className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("cpr", e)}
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                    title="Drag to resize column"
                                />
                            </th>
                        )}

                        {/* Vol & Deliv */}
                        {visibleColumns.vol_deliv !== false && (
                            <th style={{ width: `${colWidths.vol_deliv}px`, minWidth: `${colWidths.vol_deliv}px` }} className="p-2.5 relative bg-[#0d0d14]">
                                <div className="flex items-center justify-between gap-1.5">
                                    <div
                                        className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                        onClick={() => handleSort("vol_surge")}
                                    >
                                        <span>Vol &amp; Deliv</span>
                                        {getSortIcon("vol_surge")}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveFilterPopover(activeFilterPopover === "vol_deliv" ? null : "vol_deliv");
                                        }}
                                        className={`p-1 rounded transition-colors ${
                                            hasColumnFilter("vol_deliv")
                                                ? "text-blue-400 bg-blue-500/20"
                                                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                        }`}
                                        title="Filter Volume Surge &amp; Delivery %"
                                    >
                                        <Filter className={`w-3 h-3 ${hasColumnFilter("vol_deliv") ? "fill-blue-400" : ""}`} />
                                    </button>
                                </div>
                                {activeFilterPopover === "vol_deliv" && (
                                    <div
                                        ref={filterPopoverRef}
                                        className="absolute right-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                            <span className="font-semibold text-xs text-gray-200">Filter Vol &amp; Deliv</span>
                                            <div className="flex items-center gap-2">
                                                {hasColumnFilter("vol_deliv") && (
                                                    <button
                                                        type="button"
                                                        onClick={() => clearSingleColumnFilter("vol_deliv")}
                                                        className="text-[10px] text-red-400 hover:text-red-300"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveFilterPopover(null)}
                                                    className="text-gray-400 hover:text-gray-200"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider block mb-1.5">
                                                    Min Vol Surge vs 20 SMA
                                                </label>
                                                <div className="flex flex-wrap gap-1">
                                                    {[
                                                        { label: "All", min: 0 },
                                                        { label: "≥ 1.5×", min: 1.5 },
                                                        { label: "≥ 2.0×", min: 2.0 },
                                                        { label: "≥ 3.0×", min: 3.0 },
                                                    ].map((v, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, minVolSurge: v.min }))}
                                                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                                                                columnFilters.minVolSurge === v.min
                                                                    ? "bg-blue-600 text-white border-blue-500 font-semibold"
                                                                    : "bg-gray-800 text-gray-300 border-gray-700 hover:text-white"
                                                            }`}
                                                        >
                                                            {v.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="border-t border-gray-800 pt-2">
                                                <label className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider block mb-1.5">
                                                    Min Delivery %
                                                </label>
                                                <div className="flex flex-wrap gap-1">
                                                    {[
                                                        { label: "All", min: 0 },
                                                        { label: "≥ 30%", min: 30 },
                                                        { label: "≥ 40%", min: 40 },
                                                        { label: "≥ 50%", min: 50 },
                                                    ].map((d, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, minDelivPct: d.min }))}
                                                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                                                                columnFilters.minDelivPct === d.min
                                                                    ? "bg-blue-600 text-white border-blue-500 font-semibold"
                                                                    : "bg-gray-800 text-gray-300 border-gray-700 hover:text-white"
                                                            }`}
                                                        >
                                                            {d.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="border-t border-gray-800 pt-2">
                                                <label className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider block mb-1.5">
                                                    Min Delivery Surge vs 20 SMA
                                                </label>
                                                <div className="flex flex-wrap gap-1">
                                                    {[
                                                        { label: "All", min: 0 },
                                                        { label: "≥ 1.5×", min: 1.5 },
                                                        { label: "≥ 2.0×", min: 2.0 },
                                                    ].map((ds, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, minDelivSurge: ds.min }))}
                                                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                                                                columnFilters.minDelivSurge === ds.min
                                                                    ? "bg-blue-600 text-white border-blue-500 font-semibold"
                                                                    : "bg-gray-800 text-gray-300 border-gray-700 hover:text-white"
                                                            }`}
                                                        >
                                                            {ds.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("vol_deliv", e)}
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                    title="Drag to resize column"
                                />
                            </th>
                        )}

                        {/* Sector Wave (10D) */}
                        {visibleColumns.sector_wave !== false && (
                            <th style={{ width: `${colWidths.sector_wave}px`, minWidth: `${colWidths.sector_wave}px` }} className="p-2.5 relative bg-[#0d0d14]">
                                <div className="flex items-center justify-between gap-1.5">
                                    <div
                                        className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                        onClick={() => handleSort("wave")}
                                    >
                                        <span>Sector Wave (10D)</span>
                                        {getSortIcon("wave")}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveFilterPopover(activeFilterPopover === "wave" ? null : "wave");
                                        }}
                                        className={`p-1 rounded transition-colors ${
                                            hasColumnFilter("wave")
                                                ? "text-blue-400 bg-blue-500/20"
                                                : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                        }`}
                                        title="Filter 10D Sector Wave"
                                    >
                                        <Filter className={`w-3 h-3 ${hasColumnFilter("wave") ? "fill-blue-400" : ""}`} />
                                    </button>
                                </div>
                                {activeFilterPopover === "wave" && (
                                    <div
                                        ref={filterPopoverRef}
                                        className="absolute right-0 top-full mt-1.5 w-60 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                            <span className="font-semibold text-xs text-gray-200">Filter Sector Wave</span>
                                            <div className="flex items-center gap-2">
                                                {hasColumnFilter("wave") && (
                                                    <button
                                                        type="button"
                                                        onClick={() => clearSingleColumnFilter("wave")}
                                                        className="text-[10px] text-red-400 hover:text-red-300"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveFilterPopover(null)}
                                                    className="text-gray-400 hover:text-gray-200"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="space-y-2.5">
                                            <label className="text-[10px] uppercase font-semibold text-gray-400 tracking-wider block">
                                                Min Wave Peers (10D Window)
                                            </label>
                                            <div className="flex flex-col gap-1.5">
                                                {[
                                                    { label: "All Stocks", min: 0 },
                                                    { label: "🌊 Active Wave (≥ 3 Peers)", min: 3 },
                                                    { label: "🌱 Emerging Wave (≥ 2 Peers)", min: 2 },
                                                ].map((w, idx) => (
                                                    <button
                                                        key={idx}
                                                        type="button"
                                                        onClick={() => setColumnFilters((prev) => ({ ...prev, minSectorWave: w.min }))}
                                                        className={`w-full text-left px-2.5 py-1.5 rounded text-xs border transition-colors ${
                                                            columnFilters.minSectorWave === w.min
                                                                ? "bg-blue-600 text-white border-blue-500 font-semibold"
                                                                : "bg-gray-800/80 text-gray-300 border-gray-700 hover:bg-gray-700"
                                                        }`}
                                                    >
                                                        {w.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div
                                    onMouseDown={(e) => handleResizeMouseDown("sector_wave", e)}
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                    title="Drag to resize column"
                                />
                            </th>
                        )}

                                {/* Theme */}
                                {visibleColumns.theme !== false && (
                                    <th style={{ width: `${colWidths.theme}px`, minWidth: `${colWidths.theme}px` }} className="p-2.5 relative bg-[#0d0d14]">
                                        <div className="flex items-center justify-between gap-1.5">
                                            <div
                                                className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                                onClick={() => handleSort("theme")}
                                            >
                                                <span>Theme</span>
                                                {getSortIcon("theme")}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveFilterPopover(activeFilterPopover === "theme" ? null : "theme");
                                                }}
                                                className={`p-1 rounded transition-colors ${
                                                    hasColumnFilter("theme")
                                                        ? "text-blue-400 bg-blue-500/20"
                                                        : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                                }`}
                                                title="Filter Theme"
                                            >
                                                <Filter className={`w-3 h-3 ${hasColumnFilter("theme") ? "fill-blue-400" : ""}`} />
                                            </button>
                                        </div>
                                        {activeFilterPopover === "theme" && (
                                            <div
                                                ref={filterPopoverRef}
                                                className="absolute left-0 top-full mt-1.5 w-72 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-semibold text-xs text-gray-200">Filter Theme</span>
                                                        {columnFilters.themes.length > 0 && (
                                                            <span className="text-[10px] text-blue-400 font-mono">({columnFilters.themes.length})</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {hasColumnFilter("theme") && (
                                                            <button
                                                                type="button"
                                                                onClick={() => clearSingleColumnFilter("theme")}
                                                                className="text-[10px] text-red-400 hover:text-red-300"
                                                            >
                                                                Clear
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveFilterPopover(null)}
                                                            className="text-gray-400 hover:text-gray-200"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <input
                                                        type="text"
                                                        placeholder="Search themes..."
                                                        value={themeFilterSearch}
                                                        onChange={(e) => setThemeFilterSearch(e.target.value)}
                                                        className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
                                                        autoFocus
                                                    />
                                                    <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
                                                        {filteredAvailableThemes.map(({ name, count }) => {
                                                            const active = columnFilters.themes.includes(name);
                                                            return (
                                                                <button
                                                                    key={name}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setColumnFilters((prev) => ({
                                                                            ...prev,
                                                                            themes: active
                                                                                ? prev.themes.filter((x) => x !== name)
                                                                                : [...prev.themes, name],
                                                                        }));
                                                                    }}
                                                                    className={`w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between transition-colors ${
                                                                        active
                                                                            ? "bg-blue-600/25 text-blue-200 font-semibold"
                                                                            : "text-gray-300 hover:bg-gray-800/60"
                                                                    }`}
                                                                >
                                                                    <span className="truncate pr-2">{name}</span>
                                                                    <span className="text-[10px] font-mono text-gray-500 shrink-0">({count})</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div
                                            onMouseDown={(e) => handleResizeMouseDown("theme", e)}
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                            title="Drag to resize column"
                                        />
                                    </th>
                                )}

                                {/* Active Streak */}
                                {visibleColumns.streak !== false && (
                                    <th style={{ width: `${colWidths.streak}px`, minWidth: `${colWidths.streak}px` }} className="p-2.5 relative bg-[#0d0d14]">
                                        <div className="flex items-center justify-between gap-1.5">
                                            <div
                                                className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                                onClick={() => handleSort("streak")}
                                            >
                                                <span>Active Streak</span>
                                                {getSortIcon("streak")}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveFilterPopover(activeFilterPopover === "streak" ? null : "streak");
                                                }}
                                                className={`p-1 rounded transition-colors ${
                                                    hasColumnFilter("streak")
                                                        ? "text-blue-400 bg-blue-500/20"
                                                        : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                                }`}
                                                title="Filter Active Streak"
                                            >
                                                <Filter className={`w-3 h-3 ${hasColumnFilter("streak") ? "fill-blue-400" : ""}`} />
                                            </button>
                                        </div>
                                        {activeFilterPopover === "streak" && (
                                            <div
                                                ref={filterPopoverRef}
                                                className="absolute left-0 top-full mt-1.5 w-60 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                    <span className="font-semibold text-xs text-gray-200">Filter Active Streak</span>
                                                    <div className="flex items-center gap-2">
                                                        {hasColumnFilter("streak") && (
                                                            <button
                                                                type="button"
                                                                onClick={() => clearSingleColumnFilter("streak")}
                                                                className="text-[10px] text-red-400 hover:text-red-300"
                                                            >
                                                                Clear
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveFilterPopover(null)}
                                                            className="text-gray-400 hover:text-gray-200"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2.5">
                                                    <label className="text-[11px] text-gray-400 block">Min Consecutive Days</label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={60}
                                                        value={columnFilters.minStreak || ""}
                                                        onChange={(e) => setColumnFilters((prev) => ({ ...prev, minStreak: Math.max(0, parseInt(e.target.value) || 0) }))}
                                                        placeholder="e.g. 2"
                                                        className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                        autoFocus
                                                    />
                                                    <div className="flex flex-wrap gap-1">
                                                        {[0, 1, 2, 3, 5, 10].map((d) => (
                                                            <button
                                                                key={d}
                                                                type="button"
                                                                onClick={() => setColumnFilters((prev) => ({ ...prev, minStreak: d }))}
                                                                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                                                    columnFilters.minStreak === d
                                                                        ? "bg-blue-600 text-white border-blue-500 font-bold"
                                                                        : "bg-gray-800 text-gray-400 border-gray-700 hover:text-white"
                                                                }`}
                                                            >
                                                                {d === 0 ? "All" : `≥${d}d`}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div
                                            onMouseDown={(e) => handleResizeMouseDown("streak", e)}
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                            title="Drag to resize column"
                                        />
                                    </th>
                                )}

                                {/* Frequency */}
                                {visibleColumns.frequency !== false && (
                                    <th style={{ width: `${colWidths.frequency}px`, minWidth: `${colWidths.frequency}px` }} className="p-2.5 relative bg-[#0d0d14]">
                                        <div className="flex items-center justify-between gap-1.5">
                                            <div
                                                className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                                onClick={() => handleSort("frequency")}
                                            >
                                                <span>Frequency ({lookback}D)</span>
                                                {getSortIcon("frequency")}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveFilterPopover(activeFilterPopover === "frequency" ? null : "frequency");
                                                }}
                                                className={`p-1 rounded transition-colors ${
                                                    hasColumnFilter("frequency")
                                                        ? "text-blue-400 bg-blue-500/20"
                                                        : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                                }`}
                                                title="Filter Frequency"
                                            >
                                                <Filter className={`w-3 h-3 ${hasColumnFilter("frequency") ? "fill-blue-400" : ""}`} />
                                            </button>
                                        </div>
                                        {activeFilterPopover === "frequency" && (
                                            <div
                                                ref={filterPopoverRef}
                                                className="absolute left-0 top-full mt-1.5 w-60 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                    <span className="font-semibold text-xs text-gray-200">Filter Frequency</span>
                                                    <div className="flex items-center gap-2">
                                                        {hasColumnFilter("frequency") && (
                                                            <button
                                                                type="button"
                                                                onClick={() => clearSingleColumnFilter("frequency")}
                                                                className="text-[10px] text-red-400 hover:text-red-300"
                                                            >
                                                                Clear
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveFilterPopover(null)}
                                                            className="text-gray-400 hover:text-gray-200"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2.5">
                                                    <label className="text-[11px] text-gray-400 block">Min Hits in {lookback}D Window</label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={lookback}
                                                        value={columnFilters.minFrequency || ""}
                                                        onChange={(e) => setColumnFilters((prev) => ({ ...prev, minFrequency: Math.max(0, parseInt(e.target.value) || 0) }))}
                                                        placeholder="e.g. 3"
                                                        className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                        autoFocus
                                                    />
                                                    <div className="flex flex-wrap gap-1">
                                                        {[0, 2, 3, 5, 10, 15].filter((f) => f <= lookback).map((f) => (
                                                            <button
                                                                key={f}
                                                                type="button"
                                                                onClick={() => setColumnFilters((prev) => ({ ...prev, minFrequency: f }))}
                                                                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                                                    columnFilters.minFrequency === f
                                                                        ? "bg-blue-600 text-white border-blue-500 font-bold"
                                                                        : "bg-gray-800 text-gray-400 border-gray-700 hover:text-white"
                                                                }`}
                                                            >
                                                                {f === 0 ? "All" : `≥${f}`}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div
                                            onMouseDown={(e) => handleResizeMouseDown("frequency", e)}
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                            title="Drag to resize column"
                                        />
                                    </th>
                                )}

                                {/* Timeline */}
                                {visibleColumns.timeline !== false && (
                                    <th style={{ width: `${colWidths.timeline}px`, minWidth: `${colWidths.timeline}px` }} className="p-2.5 relative bg-[#0d0d14]">
                                        <div className="flex items-center gap-1">
                                            <span>{lookback}-Day Timeline</span>
                                            <span className="text-[9px] text-gray-500 normal-case font-normal">(Oldest → Newest)</span>
                                        </div>
                                        <div
                                            onMouseDown={(e) => handleResizeMouseDown("timeline", e)}
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                            title="Drag to resize column"
                                        />
                                    </th>
                                )}

                                {/* RS Rating */}
                                {visibleColumns.rs !== false && (
                                    <th style={{ width: `${colWidths.rs}px`, minWidth: `${colWidths.rs}px` }} className="p-2.5 relative bg-[#0d0d14]">
                                        <div className="flex items-center justify-between gap-1.5">
                                            <div
                                                className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                                onClick={() => handleSort("rs_rating")}
                                            >
                                                <span>RS Rating</span>
                                                {getSortIcon("rs_rating")}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveFilterPopover(activeFilterPopover === "rs_rating" ? null : "rs_rating");
                                                }}
                                                className={`p-1 rounded transition-colors ${
                                                    hasColumnFilter("rs_rating")
                                                        ? "text-blue-400 bg-blue-500/20"
                                                        : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                                }`}
                                                title="Filter RS Rating"
                                            >
                                                <Filter className={`w-3 h-3 ${hasColumnFilter("rs_rating") ? "fill-blue-400" : ""}`} />
                                            </button>
                                        </div>
                                        {activeFilterPopover === "rs_rating" && (
                                            <div
                                                ref={filterPopoverRef}
                                                className="absolute left-0 top-full mt-1.5 w-60 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                    <span className="font-semibold text-xs text-gray-200">Filter RS Rating</span>
                                                    <div className="flex items-center gap-2">
                                                        {hasColumnFilter("rs_rating") && (
                                                            <button
                                                                type="button"
                                                                onClick={() => clearSingleColumnFilter("rs_rating")}
                                                                className="text-[10px] text-red-400 hover:text-red-300"
                                                            >
                                                                Clear
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveFilterPopover(null)}
                                                            className="text-gray-400 hover:text-gray-200"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2.5">
                                                    <label className="text-[11px] text-gray-400 block">Min RS Rating (1–99)</label>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={99}
                                                        value={columnFilters.minRS || ""}
                                                        onChange={(e) => setColumnFilters((prev) => ({ ...prev, minRS: Math.max(0, parseInt(e.target.value) || 0) }))}
                                                        placeholder="e.g. 80"
                                                        className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                        autoFocus
                                                    />
                                                    <div className="flex flex-wrap gap-1">
                                                        {[0, 70, 80, 85, 90].map((r) => (
                                                            <button
                                                                key={r}
                                                                type="button"
                                                                onClick={() => setColumnFilters((prev) => ({ ...prev, minRS: r }))}
                                                                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                                                    columnFilters.minRS === r
                                                                        ? "bg-blue-600 text-white border-blue-500 font-bold"
                                                                        : "bg-gray-800 text-gray-400 border-gray-700 hover:text-white"
                                                                }`}
                                                            >
                                                                {r === 0 ? "All" : `≥${r}`}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    <label className="flex items-center gap-2 pt-1 border-t border-gray-800 cursor-pointer text-xs text-gray-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={columnFilters.rsLeadOnly}
                                                            onChange={(e) => setColumnFilters((prev) => ({ ...prev, rsLeadOnly: e.target.checked }))}
                                                            className="rounded bg-gray-800 border-gray-700 text-blue-600 focus:ring-0"
                                                        />
                                                        <span>RS Lead Breakout (*) Only</span>
                                                    </label>
                                                </div>
                                            </div>
                                        )}
                                        <div
                                            onMouseDown={(e) => handleResizeMouseDown("rs", e)}
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                            title="Drag to resize column"
                                        />
                                    </th>
                                )}
                                {/* Close Price */}
                                {visibleColumns.close !== false && (
                                    <th style={{ width: `${colWidths.close}px`, minWidth: `${colWidths.close}px` }} className="p-2.5 relative text-right bg-[#0d0d14]">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <div
                                                className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                                onClick={() => handleSort("close")}
                                            >
                                                <span>Close (₹)</span>
                                                {getSortIcon("close")}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveFilterPopover(activeFilterPopover === "close" ? null : "close");
                                                }}
                                                className={`p-1 rounded transition-colors ${
                                                    hasColumnFilter("close")
                                                        ? "text-blue-400 bg-blue-500/20"
                                                        : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                                }`}
                                                title="Filter Close Price"
                                            >
                                                <Filter className={`w-3 h-3 ${hasColumnFilter("close") ? "fill-blue-400" : ""}`} />
                                            </button>
                                        </div>
                                        {activeFilterPopover === "close" && (
                                            <div
                                                ref={filterPopoverRef}
                                                className="absolute right-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                    <span className="font-semibold text-xs text-gray-200">Filter Close Price</span>
                                                    <div className="flex items-center gap-2">
                                                        {hasColumnFilter("close") && (
                                                            <button
                                                                type="button"
                                                                onClick={() => clearSingleColumnFilter("close")}
                                                                className="text-[10px] text-red-400 hover:text-red-300"
                                                            >
                                                                Clear
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setActiveFilterPopover(null)}
                                                            className="text-gray-400 hover:text-gray-200"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2.5">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[10px] text-gray-400 block mb-1">Min Price (₹)</label>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                value={columnFilters.minClose || ""}
                                                                onChange={(e) => setColumnFilters((prev) => ({ ...prev, minClose: Math.max(0, parseFloat(e.target.value) || 0) }))}
                                                                placeholder="0"
                                                                className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-gray-400 block mb-1">Max Price (₹)</label>
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                value={columnFilters.maxClose || ""}
                                                                onChange={(e) => setColumnFilters((prev) => ({ ...prev, maxClose: Math.max(0, parseFloat(e.target.value) || 0) }))}
                                                                placeholder="Any"
                                                                className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-1">
                                                        {[
                                                            { label: "All", min: 0, max: 0 },
                                                            { label: "< ₹50", min: 0, max: 50 },
                                                            { label: "₹50–₹500", min: 50, max: 500 },
                                                            { label: "> ₹500", min: 500, max: 0 },
                                                            { label: "> ₹1,000", min: 1000, max: 0 },
                                                        ].map((p, idx) => (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={() => setColumnFilters((prev) => ({ ...prev, minClose: p.min, maxClose: p.max }))}
                                                                className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                                                                    columnFilters.minClose === p.min && columnFilters.maxClose === p.max
                                                                        ? "bg-blue-600 text-white border-blue-500 font-semibold"
                                                                        : "bg-gray-800 text-gray-400 border-gray-700 hover:text-white"
                                                                }`}
                                                            >
                                                                {p.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div
                                            onMouseDown={(e) => handleResizeMouseDown("close", e)}
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                            title="Drag to resize column"
                                        />
                                    </th>
                                )}
                                {visibleColumns.pct_1d !== false && (
                                    <th style={{ width: `${colWidths.pct_1d}px`, minWidth: `${colWidths.pct_1d}px` }} className="p-2.5 relative text-right bg-[#0d0d14]">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <div
                                                className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                                onClick={() => handleSort("pct_1d")}
                                            >
                                            <span>1D %</span>
                                            {getSortIcon("pct_1d")}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveFilterPopover(activeFilterPopover === "pct_1d" ? null : "pct_1d");
                                            }}
                                            className={`p-1 rounded transition-colors ${
                                                hasColumnFilter("pct_1d")
                                                    ? "text-blue-400 bg-blue-500/20"
                                                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                            }`}
                                            title="Filter 1D Return"
                                        >
                                            <Filter className={`w-3 h-3 ${hasColumnFilter("pct_1d") ? "fill-blue-400" : ""}`} />
                                        </button>
                                    </div>
                                    {activeFilterPopover === "pct_1d" && (
                                        <div
                                            ref={filterPopoverRef}
                                            className="absolute right-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                <span className="font-semibold text-xs text-gray-200">Filter 1D Return (%)</span>
                                                <div className="flex items-center gap-2">
                                                    {hasColumnFilter("pct_1d") && (
                                                        <button
                                                            type="button"
                                                            onClick={() => clearSingleColumnFilter("pct_1d")}
                                                            className="text-[10px] text-red-400 hover:text-red-300"
                                                        >
                                                            Clear
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setActiveFilterPopover(null)}
                                                        className="text-gray-400 hover:text-gray-200"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-2.5">
                                                <div className="flex gap-1.5">
                                                    {[
                                                        { id: "all", label: "All" },
                                                        { id: "positive", label: "Gainers (>0%)" },
                                                        { id: "negative", label: "Losers (<0%)" },
                                                    ].map((d) => (
                                                        <button
                                                            key={d.id}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, pct1dDirection: d.id as any }))}
                                                            className={`flex-1 py-1 text-[10px] font-semibold rounded border transition-colors ${
                                                                columnFilters.pct1dDirection === d.id
                                                                    ? "bg-blue-600 text-white border-blue-500"
                                                                    : "bg-gray-800/60 text-gray-400 border-gray-700 hover:text-white"
                                                            }`}
                                                        >
                                                            {d.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 block mb-1">Min %</label>
                                                        <input
                                                            type="number"
                                                            step="0.5"
                                                            value={columnFilters.minPct1d || ""}
                                                            onChange={(e) => setColumnFilters((prev) => ({ ...prev, minPct1d: parseFloat(e.target.value) || 0 }))}
                                                            placeholder="-20"
                                                            className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] text-gray-400 block mb-1">Max %</label>
                                                        <input
                                                            type="number"
                                                            step="0.5"
                                                            value={columnFilters.maxPct1d || ""}
                                                            onChange={(e) => setColumnFilters((prev) => ({ ...prev, maxPct1d: parseFloat(e.target.value) || 0 }))}
                                                            placeholder="+20"
                                                            className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {[
                                                        { label: "≥ +2%", min: 2 },
                                                        { label: "≥ +5%", min: 5 },
                                                        { label: "≥ +10%", min: 10 },
                                                    ].map((preset, idx) => (
                                                        <button
                                                            key={idx}
                                                            type="button"
                                                            onClick={() => setColumnFilters((prev) => ({ ...prev, minPct1d: preset.min, pct1dDirection: "positive" }))}
                                                            className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20"
                                                        >
                                                            {preset.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                        <div
                                            onMouseDown={(e) => handleResizeMouseDown("pct_1d", e)}
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                            title="Drag to resize column"
                                        />
                                    </th>
                                )}
                                {visibleColumns.pct_5d !== false && (
                                    <th style={{ width: `${colWidths.pct_5d}px`, minWidth: `${colWidths.pct_5d}px` }} className="p-2.5 relative text-right bg-[#0d0d14]">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <div
                                                    className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                                    onClick={() => handleSort("pct_5d")}
                                                >
                                                    <span>5D %</span>
                                                    {getSortIcon("pct_5d")}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveFilterPopover(activeFilterPopover === "pct_5d" ? null : "pct_5d");
                                                    }}
                                                    className={`p-1 rounded transition-colors ${
                                                        hasColumnFilter("pct_5d")
                                                            ? "text-blue-400 bg-blue-500/20"
                                                            : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                                    }`}
                                                    title="Filter 5D Return"
                                                >
                                                    <Filter className={`w-3 h-3 ${hasColumnFilter("pct_5d") ? "fill-blue-400" : ""}`} />
                                                </button>
                                            </div>
                                            {activeFilterPopover === "pct_5d" && (
                                                <div
                                                    ref={filterPopoverRef}
                                                    className="absolute right-0 top-full mt-1.5 w-64 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                        <span className="font-semibold text-xs text-gray-200">Filter 5D Return (%)</span>
                                                        <div className="flex items-center gap-2">
                                                            {hasColumnFilter("pct_5d") && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => clearSingleColumnFilter("pct_5d")}
                                                                    className="text-[10px] text-red-400 hover:text-red-300"
                                                                >
                                                                    Clear
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => setActiveFilterPopover(null)}
                                                                className="text-gray-400 hover:text-gray-200"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2.5">
                                                        <div className="flex gap-1.5">
                                                            {[
                                                                { id: "all", label: "All" },
                                                                { id: "positive", label: "Gainers (>0%)" },
                                                                { id: "negative", label: "Losers (<0%)" },
                                                            ].map((d) => (
                                                                <button
                                                                    key={d.id}
                                                                    type="button"
                                                                    onClick={() => setColumnFilters((prev) => ({ ...prev, pct5dDirection: d.id as any }))}
                                                                    className={`flex-1 py-1 text-[10px] font-semibold rounded border transition-colors ${
                                                                        columnFilters.pct5dDirection === d.id
                                                                            ? "bg-blue-600 text-white border-blue-500"
                                                                            : "bg-gray-800/60 text-gray-400 border-gray-700 hover:text-white"
                                                                    }`}
                                                                >
                                                                    {d.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div>
                                                                <label className="text-[10px] text-gray-400 block mb-1">Min %</label>
                                                                <input
                                                                    type="number"
                                                                    step="0.5"
                                                                    value={columnFilters.minPct5d || ""}
                                                                    onChange={(e) => setColumnFilters((prev) => ({ ...prev, minPct5d: parseFloat(e.target.value) || 0 }))}
                                                                    placeholder="-30"
                                                                    className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="text-[10px] text-gray-400 block mb-1">Max %</label>
                                                                <input
                                                                    type="number"
                                                                    step="0.5"
                                                                    value={columnFilters.maxPct5d || ""}
                                                                    onChange={(e) => setColumnFilters((prev) => ({ ...prev, maxPct5d: parseFloat(e.target.value) || 0 }))}
                                                                    placeholder="+50"
                                                                    className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1">
                                                            {[
                                                                { label: "≥ +5%", min: 5 },
                                                                { label: "≥ +10%", min: 10 },
                                                                { label: "≥ +20%", min: 20 },
                                                            ].map((preset, idx) => (
                                                                <button
                                                                    key={idx}
                                                                    type="button"
                                                                    onClick={() => setColumnFilters((prev) => ({ ...prev, minPct5d: preset.min, pct5dDirection: "positive" }))}
                                                                    className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20"
                                                                >
                                                                    {preset.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        <div
                                            onMouseDown={(e) => handleResizeMouseDown("pct_5d", e)}
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                            title="Drag to resize column"
                                        />
                                    </th>
                                )}
                                {visibleColumns.turnover !== false && (
                                    <th style={{ width: `${colWidths.turnover}px`, minWidth: `${colWidths.turnover}px` }} className="p-2.5 relative text-right bg-[#0d0d14]">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <div
                                                    className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors"
                                                    onClick={() => handleSort("turnover")}
                                                >
                                                    <span>Turnover (Cr)</span>
                                                    {getSortIcon("turnover")}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setActiveFilterPopover(activeFilterPopover === "turnover" ? null : "turnover");
                                                    }}
                                                    className={`p-1 rounded transition-colors ${
                                                        hasColumnFilter("turnover")
                                                            ? "text-blue-400 bg-blue-500/20"
                                                            : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                                                    }`}
                                                    title="Filter Turnover"
                                                >
                                                    <Filter className={`w-3 h-3 ${hasColumnFilter("turnover") ? "fill-blue-400" : ""}`} />
                                                </button>
                                            </div>
                                            {activeFilterPopover === "turnover" && (
                                                <div
                                                    ref={filterPopoverRef}
                                                    className="absolute right-0 top-full mt-1.5 w-60 bg-[#14141f] border border-gray-700/80 rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs text-gray-200 text-left"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-2">
                                                        <span className="font-semibold text-xs text-gray-200">Filter Turnover (Cr)</span>
                                                        <div className="flex items-center gap-2">
                                                            {hasColumnFilter("turnover") && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => clearSingleColumnFilter("turnover")}
                                                                    className="text-[10px] text-red-400 hover:text-red-300"
                                                                >
                                                                    Clear
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => setActiveFilterPopover(null)}
                                                                className="text-gray-400 hover:text-gray-200"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2.5">
                                                        <label className="text-[11px] text-gray-400 block">Min Daily Turnover (₹ Crore)</label>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            step="1"
                                                            value={columnFilters.minTurnover || ""}
                                                            onChange={(e) => setColumnFilters((prev) => ({ ...prev, minTurnover: Math.max(0, parseFloat(e.target.value) || 0) }))}
                                                            placeholder="e.g. 5.0"
                                                            className="w-full bg-[#0d0d14] border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-gray-100 font-mono focus:outline-none focus:border-blue-500"
                                                            autoFocus
                                                        />
                                                        <div className="flex flex-wrap gap-1">
                                                            {[0, 1, 5, 10, 25, 50].map((t) => (
                                                                <button
                                                                    key={t}
                                                                    type="button"
                                                                    onClick={() => setColumnFilters((prev) => ({ ...prev, minTurnover: t }))}
                                                                    className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                                                                        columnFilters.minTurnover === t
                                                                            ? "bg-blue-600 text-white border-blue-500 font-bold"
                                                                            : "bg-gray-800 text-gray-400 border-gray-700 hover:text-white"
                                                                    }`}
                                                                >
                                                                    {t === 0 ? "All" : `≥₹${t}Cr`}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        <div
                                            onMouseDown={(e) => handleResizeMouseDown("turnover", e)}
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                            title="Drag to resize column"
                                        />
                                    </th>
                                )}
                                {visibleColumns.quick_add !== false && (
                                    <th style={{ width: `${colWidths.quick_add}px`, minWidth: `${colWidths.quick_add}px` }} className="p-3 relative text-center bg-[#0d0d14]">
                                        Quick Add
                                        <div
                                            onMouseDown={(e) => handleResizeMouseDown("quick_add", e)}
                                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-blue-500/70 active:bg-blue-600 transition-colors z-20"
                                            title="Drag to resize column"
                                        />
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/60 font-mono">
                            {sortedItems.length === 0 ? (
                                <tr>
                                    <td colSpan={visibleColumnCount} className="p-8 text-center text-gray-500 font-sans">
                                        No qualifying stocks found matching the active filters.
                                    </td>
                                </tr>
                            ) : (
                                sortedItems.map((item, idx) => {
                                    const isSelected = selectedTickers.has(item.symbol);
                                    const inActiveWl = activeCleanSet.has(item.clean_symbol);
                                    const theme = getStockTheme(item.clean_symbol);
                                    const { rs, lead } = getRSMetrics(item.symbol, item.clean_symbol);
                                    const tooltipDropClass = idx < 3 ? "top-full mt-1.5" : "bottom-full mb-1.5";

                                    const countInWindow =
                                        lookback === 5
                                            ? item.count_5d
                                            : lookback === 10
                                            ? item.count_10d
                                            : lookback === 20
                                            ? item.count_20d
                                            : item.count_60d;

                                    return (
                                        <tr
                                            key={item.symbol}
                                            className={`group hover:bg-gray-800/40 transition-colors ${
                                                isSelected ? "bg-blue-950/20" : ""
                                            }`}
                                        >
                                            {/* Checkbox */}
                                            <td style={{ width: "40px", minWidth: "40px", maxWidth: "40px" }} className={`p-3 text-center sticky left-0 z-20 w-10 min-w-10 max-w-10 transition-colors ${
                                                isSelected ? "bg-[#0c1e3a]" : "bg-[#0d0d14] group-hover:bg-[#151522]"
                                            }`}>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSelectTicker(item.symbol)}
                                                    className="text-gray-400 hover:text-gray-200"
                                                >
                                                    {isSelected ? (
                                                        <CheckSquare className="w-4 h-4 text-blue-400" />
                                                    ) : (
                                                        <Square className="w-4 h-4 text-gray-600" />
                                                    )}
                                                </button>
                                            </td>

                                            {/* Symbol */}
                                            <td style={{ width: `${colWidths.symbol}px`, minWidth: `${colWidths.symbol}px`, maxWidth: `${colWidths.symbol}px` }} className={`p-3 font-semibold whitespace-nowrap sticky left-10 z-20 transition-colors ${
                                                isSelected ? "bg-[#0c1e3a]" : "bg-[#0d0d14] group-hover:bg-[#151522]"
                                            }`}>
                                                <div className="flex items-center gap-1.5 font-sans">
                                                    <a
                                                        href={makeTradingViewUrl(item.symbol)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-400 hover:text-blue-300 underline font-medium transition-colors"
                                                        title={`Open ${item.clean_symbol} on TradingView`}
                                                    >
                                                        {item.clean_symbol}
                                                    </a>
                                                    {item.is_fresh_20d && (
                                                        <span className="text-[9px] font-sans px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                                            Fresh
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Band */}
                                            {visibleColumns.band !== false && (
                                                <td style={{ width: `${colWidths.band}px`, minWidth: `${colWidths.band}px` }} className="p-3 text-center whitespace-nowrap">
                                                    <div className="flex items-center justify-center gap-1 font-sans">
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getBandBadgeStyle(item.circuit_band)}`}>
                                                            {getBandLabel(item.circuit_band)}
                                                        </span>
                                                        {item.is_circuit_locked && (
                                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/25 text-rose-300 border border-rose-500/50" title="Locked at Price Band Circuit (High == Low)">
                                                                🔒 Lock
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            )}

                                            {/* Microstructure & Confluence Columns */}
                                            {/* 1. Candle & Signal */}
                                            {visibleColumns.candle !== false && (
                                                <td style={{ width: `${colWidths.candle}px`, minWidth: `${colWidths.candle}px` }} className="p-3 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5 group/candle relative">
                                                    {item.setup_label ? (
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                                                item.setup_type === "shakeout_breakout"
                                                                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                                                    : item.setup_type === "one_day_pause"
                                                                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                                                    : item.setup_type === "hammer_bounce"
                                                                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                                                    : item.setup_type === "fresh_thrust"
                                                                    ? "bg-blue-500/20 text-blue-300 border-blue-500/40"
                                                                    : item.setup_type === "consolidation_base"
                                                                    ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                                                                    : "bg-gray-800/80 text-gray-300 border-gray-700/60"
                                                            }`}
                                                        >
                                                            {item.setup_label}
                                                        </span>
                                                    ) : item.candle_pattern === "hammer" ? (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                                            <Hammer className="w-3 h-3 text-emerald-400" />
                                                            Hammer
                                                        </span>
                                                    ) : item.candle_pattern === "thrust" ? (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                                            <Rocket className="w-3 h-3 text-blue-400" />
                                                            Thrust
                                                        </span>
                                                    ) : item.candle_pattern === "rejection" ? (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                                            <AlertTriangle className="w-3 h-3 text-rose-400" />
                                                            Rejection
                                                        </span>
                                                    ) : (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-800/60 text-gray-400 border border-gray-700/60">
                                                            Normal
                                                        </span>
                                                    )}

                                                    {item.setup_bar_desc ? (
                                                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gray-900/90 text-gray-300 border border-gray-700/60">
                                                            {item.setup_bar_desc}
                                                        </span>
                                                    ) : (
                                                        <>
                                                            {item.prev_color === "red" ? (
                                                                <span
                                                                    className="px-1 py-0.2 rounded text-[9px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30"
                                                                    title="Prior Day Red Candle (Shakeout Absorption)"
                                                                >
                                                                    🔴 Red
                                                                </span>
                                                            ) : item.prev_color === "green" ? (
                                                                <span
                                                                    className="px-1 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                                                    title="Prior Day Green Candle"
                                                                >
                                                                    🟢 Grn
                                                                </span>
                                                            ) : null}

                                                            {item.candle_pattern === "hammer" && item.ema_20_ext != null && Math.abs(item.ema_20_ext) <= 2.5 && (
                                                                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30" title="Hammer bounce at 20 EMA">
                                                                    @20EMA
                                                                </span>
                                                            )}
                                                        </>
                                                    )}

                                                    {/* Tomorrow's Execution Plan Hover Flyout */}
                                                    <div className={`absolute left-0 ${tooltipDropClass} hidden group-hover/candle:block w-64 bg-[#161622] border border-gray-700 rounded-lg shadow-2xl p-2.5 z-50 text-[11px] font-sans text-gray-200 pointer-events-none`}>
                                                        <div className="font-semibold text-xs border-b border-gray-800 pb-1 mb-1.5 text-gray-100 flex items-center justify-between">
                                                            <span>Tomorrow&apos;s Execution Plan</span>
                                                            <span className="text-[9px] font-mono text-cyan-400 uppercase">
                                                                {item.setup_type && item.setup_type !== "normal" ? item.setup_type.replace(/_/g, " ") : (item.candle_pattern || "Normal")}
                                                            </span>
                                                        </div>
                                                        <div className="space-y-1.5 font-mono text-[10px]">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-gray-400">Buy Stop (High):</span>
                                                                <span className="text-emerald-400 font-semibold">{item.today_high ? `₹${item.today_high.toLocaleString("en-IN")}` : "—"}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-gray-400">Stop Loss (Low / 20 EMA):</span>
                                                                <span className="text-rose-400 font-semibold">
                                                                    {item.today_low ? `₹${item.today_low.toLocaleString("en-IN")}` : "—"}
                                                                    {item.ema_20 ? ` / ₹${item.ema_20.toLocaleString("en-IN")}` : ""}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center border-t border-gray-800/60 pt-1">
                                                                <span className="text-gray-400">Risk %:</span>
                                                                <span className="text-amber-400 font-semibold">{item.risk_pct != null ? `${item.risk_pct.toFixed(2)}%` : "—"}</span>
                                                            </div>
                                                            {item.setup_bar_desc && (
                                                                <div className="flex justify-between items-center text-gray-400 text-[9px] font-sans border-t border-gray-800/60 pt-1">
                                                                    <span>Setup Bar:</span>
                                                                    <span className="text-cyan-300 font-mono">{item.setup_bar_desc}</span>
                                                                </div>
                                                            )}
                                                            <div className="flex justify-between items-center text-gray-400 text-[9px] font-sans">
                                                                <span>Prior Day Bar (T-1):</span>
                                                                <span className={item.prev_color === "red" ? "text-rose-300 font-medium" : item.prev_color === "green" ? "text-emerald-300 font-medium" : "text-gray-400"}>
                                                                    {item.prev_color === "red" ? "Red (Shakeout)" : item.prev_color === "green" ? "Green (Follow-through)" : "Flat / Unknown"}
                                                                </span>
                                                            </div>
                                                            {item.recency_days != null && (
                                                                <div className="flex justify-between items-center text-gray-400 text-[9px] font-sans">
                                                                    <span>{direction === "high" ? "52W Peak Recency:" : "52W Trough Recency:"}</span>
                                                                    <span className="text-purple-300 font-mono">
                                                                        {item.recency_days === 0
                                                                            ? (direction === "high" ? "Hit 52W High Today (T)" : "Hit 52W Low Today (T)")
                                                                            : `${item.recency_days} sessions ago (${item.last_hit_date})`}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        )}

                                        {/* 2. 20 EMA Ext */}
                                        {visibleColumns.ema_ext !== false && (
                                            <td style={{ width: `${colWidths.ema_ext}px`, minWidth: `${colWidths.ema_ext}px` }} className="p-3 text-right whitespace-nowrap">
                                                {item.ema_20_ext != null ? (
                                                    <div className="inline-flex items-center gap-1 group/ema relative">
                                                        <span
                                                            className={`font-semibold px-1.5 py-0.5 rounded text-[11px] font-mono border ${
                                                                item.ema_20_ext >= 2.0 && item.ema_20_ext <= 6.0
                                                                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                                                    : item.ema_20_ext >= 0 && item.ema_20_ext < 2.0
                                                                    ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                                                                    : item.ema_20_ext > 12.0
                                                                    ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                                                    : item.ema_20_ext < 0
                                                                    ? "bg-gray-800 text-gray-400 border-gray-700"
                                                                    : "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                                            }`}
                                                        >
                                                            {item.ema_20_ext > 0 ? `+${item.ema_20_ext.toFixed(1)}%` : `${item.ema_20_ext.toFixed(1)}%`}
                                                            {item.ema_20_ext > 12.0 && " ⚠️"}
                                                        </span>

                                                        {/* Hover Tooltip */}
                                                        <div className={`absolute right-0 ${tooltipDropClass} hidden group-hover/ema:block w-52 bg-[#161622] border border-gray-700 rounded-lg shadow-2xl p-2.5 z-50 text-[11px] font-sans text-gray-200 text-left pointer-events-none`}>
                                                            <div className="font-semibold text-xs border-b border-gray-800 pb-1 mb-1.5 text-gray-100 flex items-center justify-between">
                                                                <span>20-Day EMA Anatomy</span>
                                                                <span className="text-[10px] font-mono text-cyan-400">59D Warmup</span>
                                                            </div>
                                                            <div className="space-y-1 font-mono text-[10px]">
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-400">20 EMA Level:</span>
                                                                    <span className="text-gray-200">{item.ema_20 ? `₹${item.ema_20.toLocaleString("en-IN")}` : "—"}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-400">Extension:</span>
                                                                    <span className="text-gray-200 font-semibold">{item.ema_20_ext > 0 ? `+${item.ema_20_ext.toFixed(2)}%` : `${item.ema_20_ext.toFixed(2)}%`}</span>
                                                                </div>
                                                                <div className="text-[9px] font-sans text-gray-400 pt-1 border-t border-gray-800/60">
                                                                    {item.ema_20_ext >= 2.0 && item.ema_20_ext <= 6.0
                                                                        ? "✅ Sweet Spot: +1.46% median 20D follow-through"
                                                                        : item.ema_20_ext > 12.0
                                                                        ? "⚠️ Climax Trap: Overextended, high drawdown risk"
                                                                        : item.ema_20_ext < 0
                                                                        ? "🔻 Below 20 EMA: Trend exhaustion / breakdown"
                                                                        : "📊 Moderate extension"}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-600">—</span>
                                                )}
                                            </td>
                                        )}

                                        {/* 3. Monthly CPR */}
                                        {visibleColumns.cpr !== false && (
                                            <td style={{ width: `${colWidths.cpr}px`, minWidth: `${colWidths.cpr}px` }} className="p-3 whitespace-nowrap">
                                                {item.cpr_width_pct != null ? (
                                                    <div className="flex items-center gap-1.5 group/cpr relative">
                                                        <span
                                                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase font-sans border ${
                                                                item.cpr_pos === "above"
                                                                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                                                    : item.cpr_pos === "inside"
                                                                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                                                    : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                                            }`}
                                                        >
                                                            {item.cpr_pos || "—"}
                                                        </span>
                                                        <span
                                                            className={`text-xs font-mono font-medium ${
                                                                item.cpr_width_pct <= 2.0
                                                                    ? "text-emerald-400 font-bold"
                                                                    : item.cpr_width_pct <= 5.0
                                                                    ? "text-cyan-300"
                                                                    : "text-gray-400"
                                                            }`}
                                                        >
                                                            {item.cpr_width_pct.toFixed(1)}%
                                                            <span className="text-[9px] text-gray-500 font-sans ml-0.5">
                                                                {item.cpr_width_pct <= 2.0 ? "(Narrow)" : item.cpr_width_pct > 5.0 ? "(Wide)" : ""}
                                                            </span>
                                                        </span>

                                                        {/* Hover Tooltip */}
                                                        <div className={`absolute left-0 ${tooltipDropClass} hidden group-hover/cpr:block w-56 bg-[#161622] border border-gray-700 rounded-lg shadow-2xl p-2.5 z-50 text-[11px] font-sans text-gray-200 pointer-events-none`}>
                                                            <div className="font-semibold text-xs border-b border-gray-800 pb-1 mb-1.5 text-gray-100 flex items-center justify-between">
                                                                <span>Monthly Central Pivot Range</span>
                                                                <span className="text-[10px] font-mono text-cyan-400">Prior Month</span>
                                                            </div>
                                                            <div className="space-y-1 font-mono text-[10px]">
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-400">Pivot (P):</span>
                                                                    <span className="text-gray-200">{item.cpr_pivot ? `₹${item.cpr_pivot.toFixed(2)}` : "—"}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-400">CPR Top (TC):</span>
                                                                    <span className="text-gray-200">{item.cpr_top ? `₹${item.cpr_top.toFixed(2)}` : "—"}</span>
                                                                </div>
                                                                <div className="flex justify-between">
                                                                    <span className="text-gray-400">CPR Bottom (BC):</span>
                                                                    <span className="text-gray-200">{item.cpr_bot ? `₹${item.cpr_bot.toFixed(2)}` : "—"}</span>
                                                                </div>
                                                                <div className="flex justify-between border-t border-gray-800/60 pt-1">
                                                                    <span className="text-gray-400">Dist to CPR Top:</span>
                                                                    <span className="text-cyan-400 font-semibold">
                                                                        {item.cpr_dist_top != null ? `${item.cpr_dist_top > 0 ? "+" : ""}${item.cpr_dist_top.toFixed(2)}%` : "—"}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-600">—</span>
                                                )}
                                            </td>
                                        )}

                                        {/* 4. Vol & Deliv */}
                                        {visibleColumns.vol_deliv !== false && (
                                            <td style={{ width: `${colWidths.vol_deliv}px`, minWidth: `${colWidths.vol_deliv}px` }} className="p-3 whitespace-nowrap font-mono text-xs">
                                                <div className="flex items-center gap-1.5 group/voldeliv relative">
                                                    <span className={`font-semibold ${item.vol_surge && item.vol_surge >= 1.5 ? "text-emerald-400" : "text-gray-300"}`}>
                                                        {item.vol_surge != null ? `${item.vol_surge.toFixed(1)}×` : "—"}
                                                    </span>
                                                    <span className="text-gray-600">•</span>
                                                    {item.series === "BE" || item.series === "BZ" ? (
                                                        <span className="px-1 py-0.2 rounded text-[9px] font-sans font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                            100% (T2T)
                                                        </span>
                                                    ) : item.deliv_pct != null ? (
                                                        <span className={`font-medium ${item.deliv_pct >= 40.0 ? "text-cyan-300 font-semibold" : "text-gray-400"}`}>
                                                            {item.deliv_pct.toFixed(0)}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-600">—</span>
                                                    )}

                                                    {/* Hover Tooltip */}
                                                    <div className={`absolute right-0 ${tooltipDropClass} hidden group-hover/voldeliv:block w-56 bg-[#161622] border border-gray-700 rounded-lg shadow-2xl p-2.5 z-50 text-[11px] font-sans text-gray-200 text-left pointer-events-none`}>
                                                        <div className="font-semibold text-xs border-b border-gray-800 pb-1 mb-1.5 text-gray-100 flex items-center justify-between">
                                                            <span>Volume &amp; Delivery Breakdown</span>
                                                            <span className="text-[10px] font-mono text-cyan-400">vs 20 SMA</span>
                                                        </div>
                                                        <div className="space-y-1 font-mono text-[10px]">
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-400">Volume Surge:</span>
                                                                <span className={`font-semibold ${item.vol_surge && item.vol_surge >= 1.5 ? "text-emerald-400" : "text-gray-200"}`}>
                                                                    {item.vol_surge != null ? `${item.vol_surge.toFixed(2)}× SMA20` : "—"}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-400">Delivery %:</span>
                                                                <span className="text-gray-200">
                                                                    {item.series === "BE" || item.series === "BZ" ? "100% (Trade-to-Trade Series)" : item.deliv_pct != null ? `${item.deliv_pct.toFixed(1)}%` : "—"}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-gray-400">Delivery Surge:</span>
                                                                <span className="text-gray-200">{item.deliv_surge != null ? `${item.deliv_surge.toFixed(2)}× SMA20` : "—"}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        )}

                                        {/* 5. Sector Wave (10D) */}
                                        {visibleColumns.sector_wave !== false && (
                                            <td style={{ width: `${colWidths.sector_wave}px`, minWidth: `${colWidths.sector_wave}px` }} className="p-3 whitespace-nowrap">
                                                {item.sector_wave_count && item.sector_wave_count >= 2 ? (
                                                    <div className="inline-flex items-center gap-1 group/wave relative">
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold border transition-colors ${
                                                                item.sector_wave_count >= 3
                                                                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                                                    : "bg-gray-800 text-gray-300 border-gray-700"
                                                            }`}
                                                        >
                                                            {item.sector_wave_count >= 3 ? "🌊 Wave" : "🌱 Wave"} ({item.sector_wave_count})
                                                        </span>

                                                        {/* Hover Tooltip with Peers */}
                                                        <div className={`absolute right-0 ${tooltipDropClass} hidden group-hover/wave:block w-64 bg-[#161622] border border-gray-700 rounded-lg shadow-2xl p-2.5 z-50 text-[11px] font-sans text-gray-200 text-left pointer-events-none`}>
                                                            <div className="font-semibold text-xs border-b border-gray-800 pb-1 mb-1.5 text-gray-100 flex items-center justify-between">
                                                                <span>10D Sector Wave Cluster</span>
                                                                <span className="text-[10px] font-mono text-cyan-400">
                                                                    {item.sector_wave_count} stocks
                                                                </span>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <div className="text-[10px] text-gray-400 font-medium">
                                                                    Dominant Theme: <span className="text-gray-200">{item.sector_wave_theme || getStockTheme(item.clean_symbol)}</span>
                                                                </div>
                                                                {(() => {
                                                                    const activeWaveMap = direction === "low" ? historyData?.metadata?.sector_waves_low : historyData?.metadata?.sector_waves;
                                                                    const activePeers = item.sector_wave_theme && activeWaveMap ? activeWaveMap[item.sector_wave_theme] : undefined;
                                                                    if (!activePeers || activePeers.length === 0) return null;
                                                                    return (
                                                                        <div className="pt-1 border-t border-gray-800/60">
                                                                            <span className="text-[9px] uppercase tracking-wider text-gray-400 block mb-1">Active Peers:</span>
                                                                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto font-mono text-[10px]">
                                                                                {activePeers.map((peer) => (
                                                                                    <span
                                                                                        key={peer}
                                                                                        className={`px-1.5 py-0.5 rounded ${
                                                                                            peer.replace(".NS", "") === item.clean_symbol
                                                                                                ? "bg-cyan-500/30 text-cyan-200 font-bold border border-cyan-500/50"
                                                                                                : "bg-gray-800 text-gray-300"
                                                                                        }`}
                                                                                    >
                                                                                        {peer.replace(".NS", "")}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-600">—</span>
                                                )}
                                            </td>
                                        )}

                                        {/* Theme */}
                                        {visibleColumns.theme !== false && (
                                            <td style={{ width: `${colWidths.theme}px`, minWidth: `${colWidths.theme}px` }} className="p-3 font-sans text-gray-400 whitespace-nowrap text-[11px]">
                                                <span className="px-2 py-0.5 rounded bg-gray-800/70 border border-gray-700/60 text-gray-300">
                                                    {theme}
                                                </span>
                                            </td>
                                        )}

                                        {/* Active Streak */}
                                        {visibleColumns.streak !== false && (
                                            <td style={{ width: `${colWidths.streak}px`, minWidth: `${colWidths.streak}px` }} className="p-3 whitespace-nowrap">
                                                {item.streak >= 2 ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                        <Flame className="w-3 h-3 text-amber-400 fill-amber-400 animate-pulse" />
                                                        {item.streak}d
                                                    </span>
                                                ) : item.streak === 1 ? (
                                                    <span className="text-gray-300 text-xs">1d</span>
                                                ) : (
                                                    <span className="text-gray-600">—</span>
                                                )}
                                            </td>
                                        )}

                                        {/* Frequency */}
                                        {visibleColumns.frequency !== false && (
                                            <td style={{ width: `${colWidths.frequency}px`, minWidth: `${colWidths.frequency}px` }} className="p-3 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-gray-100">
                                                        {countInWindow}/{lookback}d
                                                    </span>
                                                    <span className="text-[10px] text-gray-500">
                                                        ({Math.round((countInWindow / lookback) * 100)}%)
                                                    </span>
                                                </div>
                                            </td>
                                        )}

                                        {/* Dynamic Hit Timeline */}
                                        {visibleColumns.timeline !== false && (
                                            <td style={{ width: `${colWidths.timeline}px`, minWidth: `${colWidths.timeline}px` }} className="p-3 whitespace-nowrap">
                                                {(() => {
                                                    const fullHist = (item.history_60d && item.history_60d.length >= lookback)
                                                        ? item.history_60d
                                                        : item.history_20d;
                                                    const dots = fullHist.slice(-lookback);

                                                    return (
                                                        <div
                                                            className="flex items-center gap-1 py-1"
                                                            title={`Hits across last ${lookback} sessions: ${countInWindow}/${lookback}`}
                                                        >
                                                            {dots.map((hit, idx) => {
                                                                const dateStr = windowDates[idx] || `Session ${idx + 1}`;
                                                                const is10Divider = lookback === 60 && idx > 0 && idx % 10 === 0;

                                                                return (
                                                                    <div key={idx} className="flex items-center">
                                                                        {is10Divider && (
                                                                            <span className="w-1.5" />
                                                                        )}
                                                                        <span
                                                                            className={`transition-transform hover:scale-150 ${
                                                                                lookback === 60
                                                                                    ? "w-1 h-3 rounded-[1px]"
                                                                                    : lookback === 20
                                                                                    ? "w-2 h-2 rounded-full"
                                                                                    : "w-2.5 h-2.5 rounded-full"
                                                                            } ${
                                                                                hit === 1
                                                                                    ? direction === "high"
                                                                                        ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]"
                                                                                        : "bg-rose-400 shadow-[0_0_4px_rgba(251,113,133,0.8)]"
                                                                                    : "bg-gray-800"
                                                                            }`}
                                                                            title={`${dateStr}: ${hit === 1 ? (direction === "high" ? "52W High" : "52W Low") : "No hit"}`}
                                                                        />
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                        )}

                                        {/* RS Rating */}
                                        {visibleColumns.rs !== false && (
                                            <td style={{ width: `${colWidths.rs}px`, minWidth: `${colWidths.rs}px` }} className="p-3 whitespace-nowrap">
                                                {rs !== null ? (
                                                    <div className="flex items-center gap-1">
                                                        <span
                                                            className={`font-bold ${
                                                                rs >= 80
                                                                    ? "text-emerald-400"
                                                                    : rs >= 60
                                                                    ? "text-blue-400"
                                                                    : "text-gray-400"
                                                            }`}
                                                        >
                                                            {rs}
                                                        </span>
                                                        {lead && (
                                                            <span
                                                                className="text-amber-400 text-sm font-bold animate-pulse"
                                                                title="RS Lead Breakout"
                                                            >
                                                                *
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-600">—</span>
                                                )}
                                            </td>
                                        )}

                                        {/* Close Price */}
                                        {visibleColumns.close !== false && (
                                            <td style={{ width: `${colWidths.close}px`, minWidth: `${colWidths.close}px` }} className="p-3 text-right whitespace-nowrap font-medium text-gray-200">
                                                ₹{item.close.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                            </td>
                                        )}

                                        {/* 1D % */}
                                        {visibleColumns.pct_1d !== false && (
                                            <td style={{ width: `${colWidths.pct_1d}px`, minWidth: `${colWidths.pct_1d}px` }} className={`p-3 text-right whitespace-nowrap font-semibold ${getReturnColor(item.pct_1d)}`}>
                                                {formatReturn(item.pct_1d)}
                                            </td>
                                        )}

                                        {/* 5D % */}
                                        {visibleColumns.pct_5d !== false && (
                                            <td style={{ width: `${colWidths.pct_5d}px`, minWidth: `${colWidths.pct_5d}px` }} className={`p-3 text-right whitespace-nowrap font-semibold ${getReturnColor(item.pct_5d)}`}>
                                                {formatReturn(item.pct_5d)}
                                            </td>
                                        )}

                                        {/* Turnover (Cr) */}
                                        {visibleColumns.turnover !== false && (
                                            <td style={{ width: `${colWidths.turnover}px`, minWidth: `${colWidths.turnover}px` }} className="p-3 text-right whitespace-nowrap text-gray-400">
                                                {item.turnover_cr.toFixed(2)}
                                            </td>
                                        )}

                                        {/* Quick Add Button */}
                                        {visibleColumns.quick_add !== false && (
                                            <td style={{ width: `${colWidths.quick_add}px`, minWidth: `${colWidths.quick_add}px` }} className="p-3 text-center whitespace-nowrap">
                                                {onAddTickerToActiveWatchlist && (
                                                    <button
                                                        type="button"
                                                        onClick={() => onAddTickerToActiveWatchlist(item.symbol)}
                                                        disabled={inActiveWl}
                                                        className={`p-1.5 rounded transition-all ${
                                                            inActiveWl
                                                                ? "text-emerald-400 bg-emerald-500/10 cursor-default"
                                                                : "text-gray-400 hover:text-white hover:bg-gray-800"
                                                        }`}
                                                        title={
                                                            inActiveWl
                                                                ? `Already in ${activeWatchlistName}`
                                                                : `Add to ${activeWatchlistName}`
                                                        }
                                                    >
                                                        {inActiveWl ? (
                                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                        ) : (
                                                            <Plus className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                )}
                                            </td>
                                        )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

            {/* Save Watchlist Modal */}
            {isSaveModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
                        <h3 className="text-base font-semibold text-gray-100 flex items-center gap-2">
                            <Save className="w-4 h-4 text-emerald-400" />
                            Save as New Watchlist
                        </h3>
                        <p className="text-xs text-gray-400">
                            Saving {targetTickersForActions.length} tickers into folder{" "}
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
                                className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500"
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
                                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
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
