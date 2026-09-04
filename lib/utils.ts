// lib/utils.ts
// Shared utility functions

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { DATA_KEY_ALIASES } from "./config";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatReturn(value: number | null | undefined, decimals = 2): string {
    if (value === null || value === undefined) return "—";
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(decimals)}%`;
}

export function toCAGR(absoluteReturn: number | null | undefined, years: number): number | null {
    if (typeof absoluteReturn !== "number" || isNaN(absoluteReturn)) return null;
    const base = 1 + absoluteReturn / 100;
    if (base <= 0) return -100;
    return (Math.pow(base, 1 / years) - 1) * 100;
}

export function cleanTicker(ticker: string): string {
    let t = ticker.trim().replace(/^["'\[\(]+/, "").replace(/["'\]\)]+$/, "").trim();
    t = t.replace(/^(NSE|BSE):/i, "");
    t = t.replace(/\.(NS|BO|NSE|BSE)$/i, "");
    return t.replace(/["'\[\]\(\)]/g, "").trim();
}

export function normalizeTickerSymbol(input: string): string {
    const clean = cleanTicker(input).toUpperCase();
    return clean ? `${clean}.NS` : "";
}

export function parseBulkTickers(rawText: string, currentTickers: string[] = []): {
    allParsed: string[];
    newTickers: string[];
    existingTickers: string[];
} {
    const tokens = rawText
        .split(/[\r\n,;\t\s]+/)
        .map((s) => cleanTicker(s).toUpperCase())
        .filter((s) => s.length > 0);

    const currentCleanSet = new Set(currentTickers.map((t) => cleanTicker(t).toUpperCase()));
    const seen = new Set<string>();
    const allParsed: string[] = [];
    const newTickers: string[] = [];
    const existingTickers: string[] = [];

    for (const token of tokens) {
        if (/^[A-Z0-9\-&_]+$/.test(token)) {
            const formatted = `${token}.NS`;
            if (!seen.has(token)) {
                seen.add(token);
                allParsed.push(formatted);
                if (currentCleanSet.has(token)) {
                    existingTickers.push(formatted);
                } else {
                    newTickers.push(formatted);
                }
            }
        }
    }

    return { allParsed, newTickers, existingTickers };
}

export function getReturnColor(value: number | null | undefined): string {
    if (value === null || value === undefined) return "text-gray-400";
    if (value > 0) return "text-emerald-400";
    if (value < 0) return "text-red-400";
    return "text-gray-300";
}

export function makeTradingViewSymbol(ticker: string): string {
    const clean = ticker.replace(".NS", "").replace(".BO", "");
    const tvSymbol = clean.replace(/-/g, "_").replace(/&/g, "_");
    const exchange = ticker.includes(".BO") ? "BSE" : "NSE";
    return `${exchange}:${tvSymbol}`;
}

export function makeTradingViewUrl(ticker: string): string {
    return `https://www.tradingview.com/chart/?symbol=${makeTradingViewSymbol(ticker)}`;
}

export function getTickerLabel(ticker: string): string {
    return ticker.replace(".NS", "").replace(".BO", "");
}

/**
 * Resolves a UI theme title or key to its normalized, case-insensitive backend dataset key.
 * Uses the centralized DATA_KEY_ALIASES registry.
 */
export function resolveDataKey(title: string): string {
    const lower = title.toLowerCase();
    return DATA_KEY_ALIASES[lower] || lower;
}

