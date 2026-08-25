// lib/metrics.ts
// Single source of truth for all return, relative strength, and performance metrics

import type { MetricOption, ConstituentPerformance } from "@/types";

export const METRIC_DEFINITIONS: MetricOption[] = [
    { label: "1 Day", value: "1 Day", stockValue: "1D" },
    { label: "1 Week", value: "1 Week", stockValue: "1W" },
    { label: "1 Month", value: "1 Month", stockValue: "1M" },
    { label: "3 Months", value: "3 Months", stockValue: "3M" },
    { label: "6 Months", value: "6 Months", stockValue: "6M" },
    { label: "YTD", value: "YTD", stockValue: "YTD" },
    { label: "1 Year", value: "1 Year", stockValue: "1Y" },
    { label: "3 Years", value: "3 Years", stockValue: "3Y" },
    { label: "5 Years", value: "5 Years", stockValue: "5Y" },
    { label: "RS (5D)", value: "RS (5D)", stockValue: "RS (5D)" },
    { label: "RS (10D)", value: "RS (10D)", stockValue: "RS (10D)" },
    { label: "RS (20D)", value: "RS (20D)", stockValue: "RS (20D)" },
    { label: "RS (50D)", value: "RS (50D)", stockValue: "RS (50D)" },
    { label: "IBD RS Rating", value: "IBD RS Rating", stockValue: "ibd_rs_rating" },
];

export const REQUIRED_CONSTITUENT_METRICS = [
    "1D",
    "1W",
    "1M",
    "3M",
    "6M",
    "YTD",
    "1Y",
    "3Y",
    "5Y",
    "RS (5D)",
    "RS (10D)",
    "RS (20D)",
    "RS (50D)",
] as const;

export type RequiredConstituentMetric = typeof REQUIRED_CONSTITUENT_METRICS[number];

/**
 * Safely extracts a metric value from a stock record or constituent object.
 * Handles exact key match, field mapped match, and case-insensitive aliases.
 */
export function getMetricValue(
    data: Record<string, unknown> | null | undefined,
    metricKey: string
): number | null {
    if (!data) return null;

    // 1. Direct key match
    if (data[metricKey] !== undefined && data[metricKey] !== null) {
        const num = Number(data[metricKey]);
        return isNaN(num) ? null : num;
    }

    // 2. Map label to stockValue if needed (e.g. "1 Day" -> "1D")
    const matchedDef = METRIC_DEFINITIONS.find(
        (m) => m.label.toLowerCase() === metricKey.toLowerCase() || m.value.toLowerCase() === metricKey.toLowerCase()
    );
    if (matchedDef && data[matchedDef.stockValue] !== undefined && data[matchedDef.stockValue] !== null) {
        const num = Number(data[matchedDef.stockValue]);
        return isNaN(num) ? null : num;
    }

    // 3. Case-insensitive lookup fallback
    const targetLower = metricKey.toLowerCase();
    const foundKey = Object.keys(data).find((k) => k.toLowerCase() === targetLower);
    if (foundKey && data[foundKey] !== undefined && data[foundKey] !== null) {
        const num = Number(data[foundKey]);
        return isNaN(num) ? null : num;
    }

    return null;
}

/**
 * Formats a percentage return value with sign and decimal precision.
 */
export function formatMetricReturn(value: number | null | undefined, decimals = 2): string {
    if (value === null || value === undefined || isNaN(value)) return "—";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Returns the appropriate Tailwind color class for a metric value.
 */
export function getMetricColor(value: number | null | undefined): string {
    if (value === null || value === undefined || isNaN(value)) return "text-gray-400";
    if (value > 0) return "text-emerald-400";
    if (value < 0) return "text-red-400";
    return "text-gray-300";
}
