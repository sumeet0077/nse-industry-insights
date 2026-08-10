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

/**
 * Calculates Euclidean distance of a point (ratio, momentum) from the origin (100, 100).
 */
export function calculateOriginDistance(ratio: number, momentum: number): number {
    return Math.sqrt(Math.pow(ratio - 100, 2) + Math.pow(momentum - 100, 2));
}

/**
 * Calculates distance (velocity) between two consecutive RRG tail steps.
 */
export function calculateStepVelocity(
    p1: { RS_Ratio: number; RS_Momentum: number },
    p2: { RS_Ratio: number; RS_Momentum: number }
): number {
    return Math.sqrt(Math.pow(p2.RS_Ratio - p1.RS_Ratio, 2) + Math.pow(p2.RS_Momentum - p1.RS_Momentum, 2));
}

/**
 * Calculates tail step acceleration ratio (Current Step Velocity / Previous Step Velocity).
 */
export function calculateTailAcceleration(
    points: { RS_Ratio: number; RS_Momentum: number }[]
): number {
    if (!points || points.length < 3) return 1.0;
    const n = points.length;
    const vCurr = calculateStepVelocity(points[n - 2], points[n - 1]);
    const vPrev = calculateStepVelocity(points[n - 3], points[n - 2]);
    if (vPrev <= 0.01) return 1.0;
    return Math.round((vCurr / vPrev) * 100) / 100;
}

/**
 * Computes Composite Super Trend Score (0 - 100) based on:
 *   1. Origin Proximity (0 - 25 pts): Closer to 100,100 = higher score
 *   2. Acceleration Surge (0 - 25 pts): Higher step expansion = higher score
 *   3. Quadrant Position (0 - 25 pts): Improving/Leading heading NE = higher score
 *   4. Multi-Timeframe Confluence (0 - 25 pts): Aligned across timeframes = 25 pts
 */
export function calculateSuperTrendScore(
    points: { RS_Ratio: number; RS_Momentum: number }[],
    mtfAligned: boolean = false
): { score: number; distance: number; accel: number } {
    if (!points || points.length === 0) return { score: 50, distance: 99, accel: 1.0 };
    const head = points[points.length - 1];
    const dist = calculateOriginDistance(head.RS_Ratio, head.RS_Momentum);
    const accel = calculateTailAcceleration(points);

    // 1. Origin Proximity Score (0 to 25 pts, max at dist = 0, decreases up to dist = 10)
    const originScore = Math.max(0, Math.min(25, 25 * (1 - dist / 10.0)));

    // 2. Acceleration Score (0 to 25 pts, max at accel >= 2.0)
    const accelScore = Math.max(0, Math.min(25, (accel / 2.0) * 25));

    // 3. Quadrant & Direction Score (0 to 25 pts)
    let quadScore = 10;
    if (head.RS_Ratio >= 100 && head.RS_Momentum >= 100) quadScore = 22; // Leading
    else if (head.RS_Ratio < 100 && head.RS_Momentum >= 100) quadScore = 25; // Improving (prime launchpad)
    else if (head.RS_Ratio >= 100 && head.RS_Momentum < 100) quadScore = 15; // Weakening
    else quadScore = 5; // Lagging

    // Bonus for rising momentum
    if (points.length >= 2) {
        const prev = points[points.length - 2];
        if (head.RS_Momentum > prev.RS_Momentum) quadScore = Math.min(25, quadScore + 3);
    }

    // 4. MTF Confluence Score (0 or 25 pts)
    const mtfScore = mtfAligned ? 25 : 12;

    const totalScore = Math.round(originScore + accelScore + quadScore + mtfScore);
    return {
        score: Math.min(100, Math.max(0, totalScore)),
        distance: Math.round(dist * 100) / 100,
        accel,
    };
}

