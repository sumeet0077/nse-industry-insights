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
