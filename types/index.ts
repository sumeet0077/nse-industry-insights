// src/types/index.ts
// TypeScript types for all NSE Industry Insights data shapes

export interface BreadthDataPoint {
    Date: string;
    Total: number;
    Above: number;
    Below: number;
    Percentage: number;
    Index_Close?: number;
    new_stock?: number;
}

export interface PerformanceRow {
    "Theme/Index": string;
    "1 Day"?: number | null;
    "1 Week"?: number | null;
    "1 Month"?: number | null;
    "3 Months"?: number | null;
    "6 Months"?: number | null;
    "YTD"?: number | null;
    "1 Year"?: number | null;
    "3 Years"?: number | null;
    "5 Years"?: number | null;
    "RS (5D)"?: number | null;
    "RS (10D)"?: number | null;
    "RS (20D)"?: number | null;
    "RS (50D)"?: number | null;
    "RS Rating"?: number | null;
    "IBD RS Rating"?: number | null;
    rs_raw_score?: number | null;
    breadth_velocity?: number | null;
    expansion_odds?: number | null;
    regime?: string | null;
    forward_guidance?: string | null;
}

export interface ConstituentPerformance {
    ticker: string;
    "1D"?: number | null;
    "1W"?: number | null;
    "1M"?: number | null;
    "3M"?: number | null;
    "6M"?: number | null;
    "YTD"?: number | null;
    "1Y"?: number | null;
    "3Y"?: number | null;
    "5Y"?: number | null;
    "RS (5D)"?: number | null;
    "RS (10D)"?: number | null;
    "RS (20D)"?: number | null;
    "RS (50D)"?: number | null;
    ibd_rs_rating?: number | null;
    rs_raw_score?: number | null;
    rs_line_52w_high?: boolean;
    price_52w_high?: boolean;
    rs_lead_breakout?: boolean;
    rs_dist_52w_pct?: number | null;
    price_dist_52w_pct?: number | null;
    is_ipo?: boolean;
    listing_days?: number;
}

export interface MarketStatusEntry {
    above: string[];
    below: string[];
    new_stock?: string[];
}

export type MarketStatus = Record<string, MarketStatusEntry>;

export interface TimeframeGainersStat {
    gained: number;
    declined: number;
    flat: number;
    total: number;       // total eligible active stocks with data for this period
    unlisted: number;    // IPO stocks not yet listed during this period
    pct: number;         // (gained / total) * 100
}

export interface ThemeBreadthSummaryMetrics {
    theme: string;
    totalStocks: number;
    above200Sma: number;
    below200Sma: number;
    pctAbove200Sma: number;
    timeframes: Record<string, TimeframeGainersStat>;
}

export type AllThemesBreadthMap = Record<string, ThemeBreadthSummaryMetrics>;

export type ConstituentPerformanceMap = Record<string, ConstituentPerformance>;

export type ThemeCategory = "broad-market" | "sectors" | "industries";
export type QuadrantType = "Leading" | "Weakening" | "Lagging" | "Improving";
export type TimeframeType = "D" | "W" | "M";
export type TrendMetricDirectionType = "off" | "rising" | "falling";
export type OriginDistanceType = "off" | "tight" | "moderate" | "broad";
export type SuperTrendPresetType = "off" | "near_origin" | "mtf_aligned" | "super_trend" | "improving" | "leading" | "weakening" | "lagging";

export const ORIGIN_RADIUS_MAP: Record<OriginDistanceType, number | null> = {
    off: null,
    tight: 1.5,
    moderate: 3.0,
    broad: 5.0,
};


export interface IndexConfig {
    id: string;
    title: string;
    description: string;
    dataFile: string;
    category: ThemeCategory;
}

export interface MetricOption {
    label: string;
    value: string;
    stockValue: string;
}

export interface RRGDataPoint {
    Date: string;
    Ticker: string;
    RS_Ratio: number;
    RS_Momentum: number;
}

export type SubscriptionTier = "free" | "pro";

export interface DailyBreadthHistory1Y {
    dates: string[];
    columns: string[];
    sessions: Record<string, (string | number | null)[][]>;
}

export type RegimeType =
    | "pullback_thrust"
    | "bear_bounce"
    | "early_thrust"
    | "sustained_bull"
    | "rollover_alert"
    | "capitulation"
    | "accumulation"
    | "neutral";

export interface RegimeConfig {
    code: RegimeType;
    name: string;
    badge: string;
    guidance: string;
    color: string;
}

export type SwingHorizon = "2D" | "5D" | "10D";

export type SwingTimingCode =
    | "prime_dip"
    | "trend_buy"
    | "extended_wait"
    | "avoid_bear_trap"
    | "neutral";

export interface SwingTimingConfig {
    code: SwingTimingCode;
    badge: string;
    description: string;
    action: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
}

export interface EmpiricalHorizonStats {
    winRate: number;
    medReturn: number;
    profitFactor: number;
    medMae: number;
    suggestedStop: number;
    sampleSize: number;
}

export type UnifiedWaveCode =
    | "apex_wave"
    | "springboard_wave"
    | "sustained_bull"
    | "prime_dip"
    | "extended_wait"
    | "avoid_bear_trap"
    | "neutral"
    | "time_symmetry"
    | "alpha_score"
    | "pocket_pivot";

export type UnifiedWaveCategory =
    | "waves_dips"
    | "trend_continuation"
    | "traps_caution"
    | "neutral"
    | "microstructure"
    | "alpha_ranking";

export interface UnifiedWaveConcept {
    code: UnifiedWaveCode;
    badge: string;
    name: string;
    category: UnifiedWaveCategory;
    shortAction: string;
    institutionalMeaning: string;
    mathFormula: string;
    nextDayAction: string;
    empiricalEdge: {
        winRate: string;
        profitFactor: number;
        medMae: string;
        horizon: string;
        sampleSize?: number;
    };
    suggestedStop: string;
    edgeLabel: string;
    edgePct: number;
    bgClass: string;
    textClass: string;
    borderClass: string;
    badgePillClass: string;
}

export type EMAStretchColorTier = "extreme_pos" | "pos" | "extreme_neg" | "neg" | "neutral" | "ipo";

export interface EMAStretchCell {
    stretch_atr: number;
    percentile: number | null;
    percentile_str: string;
    is_above: boolean;
    formatted: string;
    color_tier: EMAStretchColorTier;
}

export interface EMAStretchMatrix {
    daily: {
        ema_10: EMAStretchCell;
        ema_20: EMAStretchCell;
        ema_50: EMAStretchCell;
    };
    weekly: {
        ema_10: EMAStretchCell;
        ema_20: EMAStretchCell;
        ema_50: EMAStretchCell;
    };
    monthly: {
        ema_10: EMAStretchCell;
        ema_20: EMAStretchCell;
        ema_50: EMAStretchCell;
    };
    // Kinetic Vector
    velocity: number;
    is_exhaustion_hook: boolean;
    kinetic_status: "exhaustion_hook" | "thrust" | "saturation" | "normal";
    kinetic_badge: string;
    // Mean-Reversion Landing Zones
    landing_ema_10: number | null;
    landing_ema_20: number | null;
    landing_cpr_top: number | null;
    // Decay / Half-Life
    half_life_days: number;
    decay_mode: "Time Consolidation" | "Price Flush";
    // Quantitative Enhancements
    sbs_score?: number | null;
    is_squeeze?: boolean;
    hmsr?: number | null;
    z_score?: number | null;
}

export interface EMAStretchUniverseItem {
    symbol: string;
    clean_symbol: string;
    name?: string;
    close: number;
    pct_1d: number;
    volume: number;
    turnover_cr: number;
    themes?: string[];
    sector?: string;
    ema_stretch: EMAStretchMatrix;
}

export interface EMAStretchUniverseData {
    metadata: {
        latest_session: string;
        total_stocks: number;
    };
    items: EMAStretchUniverseItem[];
}
