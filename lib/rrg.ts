// lib/rrg.ts
// Pure TypeScript implementation of JdK Relative Rotation Graph (RRG) calculation
import type { RRGDataPoint, TimeframeType } from "@/types";
import type { ThemeBreadthSummary } from "./data";

/**
 * Resample a daily time series into Daily ('D'), Weekly ('W'), or Monthly ('M') bars.
 */
function resampleData(
    data: { Date: string; Index_Close: number }[],
    timeframe: TimeframeType
): { Date: string; Index_Close: number }[] {
    if (timeframe === "D" || data.length === 0) {
        return data;
    }

    const groups = new Map<string, { Date: string; Index_Close: number }>();

    for (const pt of data) {
        let key: string;
        if (timeframe === "W") {
            // Group by year and ISO week
            const d = new Date(pt.Date);
            if (isNaN(d.getTime())) continue;
            // Get Thursday in current week to determine ISO 8601 week number
            const target = new Date(d.valueOf());
            const dayNr = (d.getDay() + 6) % 7;
            target.setDate(target.getDate() - dayNr + 3);
            const firstThursday = target.valueOf();
            target.setMonth(0, 1);
            if (target.getDay() !== 4) {
                target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
            }
            const weekNumber = 1 + Math.round((firstThursday - target.valueOf()) / 604800000);
            key = `${d.getFullYear()}-W${weekNumber.toString().padStart(2, "0")}`;
        } else {
            // Group by YYYY-MM for Monthly
            key = pt.Date.substring(0, 7);
        }

        // Keep overwriting so key holds the last (latest) trading date in period
        groups.set(key, pt);
    }

    return Array.from(groups.values());
}

/**
 * Computes RRG metrics (RS_Ratio and RS_Momentum) for all themes relative to a selected benchmark.
 * Matches rrg_helper.py mathematical formulas:
 *   1. RS = 100 * (Asset / Benchmark)
 *   2. RS_Ratio = 100 * (RS / SMA(RS, 14))
 *   3. RS_Momentum = 100 * (RS_Ratio / SMA(RS_Ratio, 9))
 */
export function computeRRGData(
    allThemeData: ThemeBreadthSummary[],
    benchmarkId: string,
    timeframe: TimeframeType,
    tailLengthLimit: number = 35
): RRGDataPoint[] {
    // 1. Locate benchmark
    const benchEntry = allThemeData.find((t) => t.id === benchmarkId || t.id.replace(/^market_breadth_/, "") === benchmarkId.replace(/^market_breadth_/, ""));
    if (!benchEntry || !benchEntry.data || benchEntry.data.length === 0) {
        return [];
    }

    const benchResampled = resampleData(benchEntry.data, timeframe);
    const benchMap = new Map<string, number>();
    for (const b of benchResampled) {
        if (b.Index_Close > 0) {
            benchMap.set(b.Date, b.Index_Close);
        }
    }

    const results: RRGDataPoint[] = [];

    // 2. Calculate for each theme
    for (const theme of allThemeData) {
        if (!theme.data || theme.data.length === 0) continue;

        const assetResampled = resampleData(theme.data, timeframe);

        // Align dates between asset and benchmark
        const aligned: { Date: string; Asset: number; Benchmark: number; RS: number }[] = [];
        for (const pt of assetResampled) {
            const benchClose = benchMap.get(pt.Date);
            if (benchClose != null && benchClose > 0 && pt.Index_Close > 0) {
                const rs = 100 * (pt.Index_Close / benchClose);
                aligned.push({ Date: pt.Date, Asset: pt.Index_Close, Benchmark: benchClose, RS: rs });
            }
        }

        if (aligned.length < 23) continue; // Requires at least 14 + 9 - 1 = 22 periods for full SMA calculation

        // RS_Ratio = 100 * (RS / SMA(RS, 14))
        const rsRatios: (number | null)[] = new Array(aligned.length).fill(null);
        const windowRatio = 14;
        let sumRS = 0;

        for (let i = 0; i < aligned.length; i++) {
            sumRS += aligned[i].RS;
            if (i >= windowRatio) {
                sumRS -= aligned[i - windowRatio].RS;
            }
            if (i >= windowRatio - 1) {
                const maRS = sumRS / windowRatio;
                if (maRS > 0) {
                    rsRatios[i] = 100 * (aligned[i].RS / maRS);
                }
            }
        }

        // RS_Momentum = 100 * (RS_Ratio / SMA(RS_Ratio, 9))
        const rrgPoints: RRGDataPoint[] = [];
        const windowMom = 9;

        for (let i = 0; i < aligned.length; i++) {
            const ratioVal = rsRatios[i];
            if (ratioVal == null) continue;

            // Count valid non-null ratio elements in window
            let validCount = 0;
            let currentWindowSum = 0;
            for (let j = Math.max(0, i - windowMom + 1); j <= i; j++) {
                if (rsRatios[j] != null) {
                    currentWindowSum += rsRatios[j]!;
                    validCount++;
                }
            }

            if (validCount === windowMom) {
                const maRatio = currentWindowSum / windowMom;
                if (maRatio > 0) {
                    const momentumVal = 100 * (ratioVal / maRatio);
                    rrgPoints.push({
                        Date: aligned[i].Date,
                        Ticker: theme.id,
                        RS_Ratio: Math.round(ratioVal * 100) / 100,
                        RS_Momentum: Math.round(momentumVal * 100) / 100,
                    });
                }
            }
        }

        // Take the last N periods for display tail
        const tail = rrgPoints.slice(-tailLengthLimit);
        results.push(...tail);
    }

    return results;
}
