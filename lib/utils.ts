// lib/utils.ts
// Shared utility functions

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatReturn(value: number | null | undefined, decimals = 2): string {
    if (value === null || value === undefined) return "—";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(decimals)}%`;
}

export function toCAGR(absoluteReturn: number | null | undefined, years: number): number | null {
    if (absoluteReturn === null || absoluteReturn === undefined) return null;
    return (Math.pow(1 + absoluteReturn / 100, 1 / years) - 1) * 100;
}

export function getReturnColor(value: number | null | undefined): string {
    if (value === null || value === undefined) return "text-gray-400";
    if (value > 0) return "text-emerald-400";
    if (value < 0) return "text-red-400";
    return "text-gray-300";
}

export function makeTradingViewUrl(ticker: string): string {
    const clean = ticker.replace(".NS", "").replace(".BO", "");
    const tvSymbol = clean.replace(/-/g, "_").replace(/&/g, "_");
    const exchange = ticker.includes(".BO") ? "BSE" : "NSE";
    return `https://www.tradingview.com/chart/?symbol=${exchange}:${tvSymbol}`;
}
