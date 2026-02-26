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
    "1 Year"?: number | null;
    "3 Years"?: number | null;
    "5 Years"?: number | null;
    "RS (20D)"?: number | null;
}

export interface ConstituentPerformance {
    ticker: string;
    "1D"?: number | null;
    "1W"?: number | null;
    "1M"?: number | null;
    "3M"?: number | null;
    "6M"?: number | null;
    "1Y"?: number | null;
    "3Y"?: number | null;
    "5Y"?: number | null;
    "RS (20D)"?: number | null;
}

export interface MarketStatusEntry {
    above: string[];
    below: string[];
    new_stock?: string[];
}

export type MarketStatus = Record<string, MarketStatusEntry>;

export type ConstituentPerformanceMap = Record<string, Record<string, ConstituentPerformance>>;

export interface IndexConfig {
    id: string;
    title: string;
    description: string;
    dataFile: string;
    category: "broad-market" | "sectors" | "industries";
}

export type SubscriptionTier = "free" | "pro";
