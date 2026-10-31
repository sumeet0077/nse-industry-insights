// lib/swingTiming.ts
// Empirical Swing Trading Analytics, Timing Trigger Rules & Risk Management

import {
    SwingHorizon,
    SwingTimingCode,
    SwingTimingConfig,
    EmpiricalHorizonStats,
    UnifiedWaveCode,
    UnifiedWaveCategory,
    UnifiedWaveConcept,
    ConstituentPerformanceMap,
    ConstituentPerformance,
} from "@/types";
import { getTickerLabel } from "@/lib/utils";

export type { UnifiedWaveCode, UnifiedWaveCategory, UnifiedWaveConcept };

export interface MacroRegimeConfig {
    code: string;
    badge: string;
    name: string;
    guidance: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
}

export const REGIME_CONFIGS: Record<string, MacroRegimeConfig> = {
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

export const SWING_TIMING_CONFIGS: Record<SwingTimingCode, SwingTimingConfig> = {
    prime_dip: {
        code: "prime_dip",
        badge: "🎯 Prime Dip (Next Day)",
        description: "Pullback / Dip in Bull Trend",
        action: "Ideal low-risk entry window on Day T+1 after 1D cooling (20%-45% gainers)",
        bgClass: "bg-emerald-950/80",
        textClass: "text-emerald-300",
        borderClass: "border-emerald-500/60 shadow-sm shadow-emerald-500/20",
    },
    trend_buy: {
        code: "trend_buy",
        badge: "🔥 Trend Buy (Next Day)",
        description: "Sustained Bull Participation",
        action: "Strong macro tailwinds (B1W, B1M, B200 >= 60%); buy leading momentum stocks on T+1",
        bgClass: "bg-cyan-950/80",
        textClass: "text-cyan-300",
        borderClass: "border-cyan-600/80 shadow-sm shadow-cyan-500/20",
    },
    extended_wait: {
        code: "extended_wait",
        badge: "⚠️ Extended (Wait 1-2D)",
        description: "Short-Term Overbought",
        action: "B1W >= 75% & B1D >= 75%; high probability of short-term pullback. Wait 1-2 days for dip.",
        bgClass: "bg-amber-950/80",
        textClass: "text-amber-300",
        borderClass: "border-amber-600/80 shadow-sm shadow-amber-500/20",
    },
    avoid_bear_trap: {
        code: "avoid_bear_trap",
        badge: "🚫 Avoid (Bear Trap)",
        description: "Bear Market Relief Rally",
        action: "B200 < 35%; relief bounce inside structural downtrend. Negative skew, avoid longs.",
        bgClass: "bg-red-950/80",
        textClass: "text-red-300",
        borderClass: "border-red-600/80 shadow-sm shadow-red-500/20",
    },
    neutral: {
        code: "neutral",
        badge: "⚖️ Neutral",
        description: "Rotational / Mixed",
        action: "Selective stock picking only; wait for sector breadth confirmation",
        bgClass: "bg-slate-900/80",
        textClass: "text-slate-400",
        borderClass: "border-slate-700/60",
    },
};

export const UNIFIED_WAVE_CONCEPTS: Record<UnifiedWaveCode, UnifiedWaveConcept> = {
    apex_wave: {
        code: "apex_wave",
        badge: "🌊 Apex Wave (Prime Dip)",
        name: "Apex Sector Wave (Prime Dip)",
        category: "waves_dips",
        shortAction: "Buy Top 2 RS Breakout Leaders on Dip",
        institutionalMeaning:
            "The Holy Grail of Swing Trading. Heavy institutional sponsorship actively bidding up a sector in a confirmed macro bull market, following an orderly 1-day dip.",
        mathFormula:
            "RRG Leading (RS_Ratio >= 100, RS_Mom >= 100) + Heading NE (↗) + B_200 >= 50% + B_1W >= 70% + 10D Breakouts (W_10D >= 4) + 1D Cooling (20% <= B_1D <= 45%)",
        nextDayAction:
            "Buy the top 2 RS breakout leaders at market open or early morning pullback. Highest conviction entry in the market.",
        empiricalEdge: {
            winRate: "62.6% at 10D",
            profitFactor: 2.22,
            medMae: "-1.29%",
            horizon: "10D",
            sampleSize: 7650,
        },
        suggestedStop: "2.5% (-1.2% noise)",
        edgeLabel: "74% High",
        edgePct: 74,
        bgClass: "bg-emerald-950/90",
        textClass: "text-emerald-300",
        borderClass: "border-emerald-500/70 shadow-sm shadow-emerald-500/20",
        badgePillClass: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    },
    springboard_wave: {
        code: "springboard_wave",
        badge: "⚡ Springboard Wave (Early Turn)",
        name: "Springboard Wave (Early Turn)",
        category: "waves_dips",
        shortAction: "Buy Emerging Leaders on T+1 Open",
        institutionalMeaning:
            "Early Cyclical Reversal. Catching the sector rotating out of Improving into Leading before the broad market crowd notices.",
        mathFormula:
            "RRG Improving (RS_Ratio < 100, RS_Mom >= 100) + Heading NE (↗) + B_200 >= 50% + B_1W >= 70% + Emerging Breakouts (W_10D >= 2)",
        nextDayAction:
            "Buy emerging leaders on Day T+1 open. Provides the lowest drawdown noise in the entire market.",
        empiricalEdge: {
            winRate: "62.8% at 10D",
            profitFactor: 2.37,
            medMae: "-1.11%",
            horizon: "10D",
            sampleSize: 6404,
        },
        suggestedStop: "2.0% (-1.1% noise)",
        edgeLabel: "71% Strong",
        edgePct: 71,
        bgClass: "bg-cyan-950/90",
        textClass: "text-cyan-300",
        borderClass: "border-cyan-500/70 shadow-sm shadow-cyan-500/20",
        badgePillClass: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
    },
    sustained_bull: {
        code: "sustained_bull",
        badge: "🔥 Sustained Bull Trend",
        name: "Sustained Bull Trend",
        category: "trend_continuation",
        shortAction: "Buy Momentum Breakouts & Ride Trend",
        institutionalMeaning:
            "Institutional Trend Continuation. High-velocity multi-week leadership with sustained market-wide constituent participation.",
        mathFormula:
            "B_1W >= 60% AND B_1M >= 60% AND B_200 >= 60% + RRG Leading (RS_Ratio >= 100, RS_Mom >= 100)",
        nextDayAction:
            "Buy momentum breakouts and hold winners through multi-day trend continuation.",
        empiricalEdge: {
            winRate: "60.4% at 10D (63.8% at 20D)",
            profitFactor: 2.41,
            medMae: "-1.43%",
            horizon: "10D",
            sampleSize: 54763,
        },
        suggestedStop: "2.0% (-0.8% noise)",
        edgeLabel: "68% Strong",
        edgePct: 68,
        bgClass: "bg-emerald-900/60",
        textClass: "text-emerald-200",
        borderClass: "border-emerald-500/60 shadow-sm shadow-emerald-500/10",
        badgePillClass: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
    },
    prime_dip: {
        code: "prime_dip",
        badge: "🎯 Prime Dip (Next Day)",
        name: "Prime Dip (Next Day)",
        category: "waves_dips",
        shortAction: "Enter Leaders on Morning Dip",
        institutionalMeaning:
            "Low-Risk Pullback Entry. Active bull trend taking an orderly 1-day pause without violating structural market support.",
        mathFormula:
            "B_200 >= 50% AND B_1W >= 65% AND 1D Cooling (20% <= B_1D <= 45%)",
        nextDayAction:
            "Enter leaders on minor dip during morning session. Excellent risk-to-reward ratio.",
        empiricalEdge: {
            winRate: "59.6% at 10D",
            profitFactor: 1.94,
            medMae: "-1.39%",
            horizon: "10D",
            sampleSize: 54842,
        },
        suggestedStop: "2.0% (-0.9% noise)",
        edgeLabel: "65% Bull",
        edgePct: 65,
        bgClass: "bg-teal-950/80",
        textClass: "text-teal-300",
        borderClass: "border-teal-500/60 shadow-sm shadow-teal-500/15",
        badgePillClass: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    },
    extended_wait: {
        code: "extended_wait",
        badge: "⚠️ Extended (Wait 1-2D)",
        name: "Extended (Wait 1-2D)",
        category: "traps_caution",
        shortAction: "Do Not Chase at Open; Wait 1-2D",
        institutionalMeaning:
            "Short-Term Overbought. Sector surged vertically today; constituent stocks are hitting short-term overhead supply bands.",
        mathFormula: "B_1W >= 75% AND B_1D >= 75%",
        nextDayAction:
            "DO NOT CHASE at the open! Wait 1-2 days for shallow pullback to the 5-day EMA.",
        empiricalEdge: {
            winRate: "57.1% at 5D",
            profitFactor: 1.60,
            medMae: "-0.83%",
            horizon: "5D",
            sampleSize: 22357,
        },
        suggestedStop: "2.0% (Wait for Dip)",
        edgeLabel: "57% Caution",
        edgePct: 57,
        bgClass: "bg-amber-950/80",
        textClass: "text-amber-300",
        borderClass: "border-amber-600/80 shadow-sm shadow-amber-500/20",
        badgePillClass: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    },
    avoid_bear_trap: {
        code: "avoid_bear_trap",
        badge: "🚫 Avoid (Bear Trap)",
        name: "Avoid (Bear Trap)",
        category: "traps_caution",
        shortAction: "Avoid Long Swings; Downtrend Risk",
        institutionalMeaning:
            "Dead-Cat Relief Bounce in a structural downtrend. Traps retail buyers who mistake an oversold bounce for a true reversal.",
        mathFormula: "B_200 < 35% (regardless of 1W breadth spike)",
        nextDayAction:
            "Avoid all long swing trades. Forward 10D win rate is sub-50% (48% on fast bounces) with negative skew.",
        empiricalEdge: {
            winRate: "48.0% (bounces)",
            profitFactor: 1.16,
            medMae: "-2.14%",
            horizon: "10D",
            sampleSize: 72789,
        },
        suggestedStop: "Stop: — (High Risk)",
        edgeLabel: "48% Low Edge",
        edgePct: 48,
        bgClass: "bg-red-950/80",
        textClass: "text-red-300",
        borderClass: "border-red-600/80 shadow-sm shadow-red-500/20",
        badgePillClass: "bg-red-500/20 text-red-300 border-red-500/40",
    },
    neutral: {
        code: "neutral",
        badge: "⚖️ Neutral / Mixed",
        name: "Neutral / Mixed",
        category: "neutral",
        shortAction: "Selective Stock Picking Only",
        institutionalMeaning:
            "Rotational / Mixed Churn. Balanced market participation without a strong directional institutional push.",
        mathFormula: "Neither bull thrust nor structural breakdown. Selective stock picking only.",
        nextDayAction:
            "Wait for sector breadth confirmation or trade stock-specific earnings/breakout catalysts only.",
        empiricalEdge: {
            winRate: "56.2% at 10D",
            profitFactor: 1.45,
            medMae: "-1.70%",
            horizon: "10D",
            sampleSize: 104966,
        },
        suggestedStop: "2.0% (-0.9% noise)",
        edgeLabel: "56% Neutral",
        edgePct: 56,
        bgClass: "bg-slate-900/80",
        textClass: "text-slate-400",
        borderClass: "border-slate-700/60",
        badgePillClass: "bg-slate-800 text-slate-400 border-slate-700",
    },
};

/**
 * Classifies Next-Day swing timing based on EOD breadth close on Day T.
 * Evaluates whether Day T+1 presents an actionable dip entry, a momentum trend buy,
 * an overextended session requiring patience, or a bear trap to avoid.
 */
export function classifySwingTiming(
    b1w: number,
    b1d: number,
    b200: number,
    b1m?: number
): SwingTimingConfig {
    // 1. Bear Market Traps take absolute precedence: if structural trend < 35%, avoid buying bounces
    if (b200 < 35.0) {
        return SWING_TIMING_CONFIGS.avoid_bear_trap;
    }
    // 2. Short-term overextension: when both weekly and daily breadth > 75%, stocks hit overhead resistance
    if (b1w >= 75.0 && b1d >= 75.0) {
        return SWING_TIMING_CONFIGS.extended_wait;
    }
    // 3. Prime Dip Entry: strong bull regime (B200 >= 50% or B1W >= 70%) with a healthy 1D cooling (20%-45%)
    if ((b200 >= 50.0 || b1w >= 70.0) && b1d >= 20.0 && b1d <= 45.0) {
        return SWING_TIMING_CONFIGS.prime_dip;
    }
    // 4. Trend Momentum Buy: sustained participation across 1W, 1M, and 200 SMA
    if (b1w >= 60.0 && (b1m ?? 0) >= 60.0 && b200 >= 60.0) {
        return SWING_TIMING_CONFIGS.trend_buy;
    }
    // 5. Default neutral
    return SWING_TIMING_CONFIGS.neutral;
}

/**
 * Empirical Transition Statistics (2014-2026, 289,632 sector observations)
 * Evaluated specifically for NEXT-DAY TRADING EXECUTION (Day T+1 entry held through Day T+1+H).
 */
export const EMPIRICAL_REGIME_HORIZON_STATS: Record<
    string,
    Record<SwingHorizon, EmpiricalHorizonStats>
> = {
    sustained_bull: {
        "2D": { winRate: 56.4, medReturn: 0.27, profitFactor: 1.46, medMae: -0.18, suggestedStop: 2.0, sampleSize: 54782 },
        "5D": { winRate: 57.9, medReturn: 0.56, profitFactor: 1.66, medMae: -0.77, suggestedStop: 2.0, sampleSize: 54780 },
        "10D": { winRate: 60.4, medReturn: 1.13, profitFactor: 1.97, medMae: -1.43, suggestedStop: 3.5, sampleSize: 54763 },
    },
    pullback_thrust: {
        "2D": { winRate: 53.1, medReturn: 0.15, profitFactor: 1.21, medMae: -0.30, suggestedStop: 2.0, sampleSize: 7669 },
        "5D": { winRate: 53.2, medReturn: 0.29, profitFactor: 1.26, medMae: -0.99, suggestedStop: 2.0, sampleSize: 7664 },
        "10D": { winRate: 54.7, medReturn: 0.61, profitFactor: 1.46, medMae: -1.89, suggestedStop: 3.8, sampleSize: 7650 },
    },
    early_thrust: {
        "2D": { winRate: 47.2, medReturn: -0.17, profitFactor: 0.83, medMae: -0.51, suggestedStop: 2.0, sampleSize: 1443 },
        "5D": { winRate: 48.8, medReturn: -0.09, profitFactor: 0.89, medMae: -1.27, suggestedStop: 2.5, sampleSize: 1442 },
        "10D": { winRate: 53.3, medReturn: 0.32, profitFactor: 1.03, medMae: -2.18, suggestedStop: 4.4, sampleSize: 1422 },
    },
    bear_bounce: {
        "2D": { winRate: 49.4, medReturn: -0.03, profitFactor: 1.29, medMae: -0.46, suggestedStop: 2.0, sampleSize: 6405 },
        "5D": { winRate: 53.5, medReturn: 0.36, profitFactor: 1.54, medMae: -1.29, suggestedStop: 2.6, sampleSize: 6404 },
        "10D": { winRate: 59.0, medReturn: 1.31, profitFactor: 1.84, medMae: -2.05, suggestedStop: 4.1, sampleSize: 6337 },
    },
    rollover_alert: {
        "2D": { winRate: 53.5, medReturn: 0.16, profitFactor: 1.23, medMae: -0.31, suggestedStop: 2.0, sampleSize: 20550 },
        "5D": { winRate: 55.7, medReturn: 0.48, profitFactor: 1.42, medMae: -1.01, suggestedStop: 2.0, sampleSize: 20549 },
        "10D": { winRate: 56.3, medReturn: 0.76, profitFactor: 1.58, medMae: -1.86, suggestedStop: 3.7, sampleSize: 20547 },
    },
    capitulation: {
        "2D": { winRate: 52.6, medReturn: 0.19, profitFactor: 1.09, medMae: -0.45, suggestedStop: 2.0, sampleSize: 15505 },
        "5D": { winRate: 53.9, medReturn: 0.40, profitFactor: 1.12, medMae: -1.38, suggestedStop: 2.8, sampleSize: 15400 },
        "10D": { winRate: 53.5, medReturn: 0.51, profitFactor: 1.26, medMae: -2.53, suggestedStop: 5.1, sampleSize: 15357 },
    },
    accumulation: {
        "2D": { winRate: 51.6, medReturn: 0.09, profitFactor: 1.24, medMae: -0.37, suggestedStop: 2.0, sampleSize: 20218 },
        "5D": { winRate: 53.3, medReturn: 0.29, profitFactor: 1.41, medMae: -1.15, suggestedStop: 2.3, sampleSize: 20214 },
        "10D": { winRate: 56.7, medReturn: 0.89, profitFactor: 1.67, medMae: -1.95, suggestedStop: 3.9, sampleSize: 20166 },
    },
    neutral: {
        "2D": { winRate: 53.7, medReturn: 0.16, profitFactor: 1.18, medMae: -0.26, suggestedStop: 2.0, sampleSize: 157748 },
        "5D": { winRate: 55.2, medReturn: 0.40, profitFactor: 1.32, medMae: -0.93, suggestedStop: 2.0, sampleSize: 157579 },
        "10D": { winRate: 56.2, medReturn: 0.70, profitFactor: 1.45, medMae: -1.70, suggestedStop: 3.5, sampleSize: 157310 },
    },
};

export const EMPIRICAL_SWING_TIMING_STATS: Record<
    SwingTimingCode,
    Record<SwingHorizon, EmpiricalHorizonStats>
> = {
    prime_dip: {
        "2D": { winRate: 53.8, medReturn: 0.16, profitFactor: 1.17, medMae: -0.26, suggestedStop: 2.0, sampleSize: 54909 },
        "5D": { winRate: 55.7, medReturn: 0.41, profitFactor: 1.36, medMae: -0.89, suggestedStop: 2.0, sampleSize: 54899 },
        "10D": { winRate: 57.2, medReturn: 0.79, profitFactor: 1.57, medMae: -1.61, suggestedStop: 3.5, sampleSize: 54842 },
    },
    trend_buy: {
        "2D": { winRate: 56.4, medReturn: 0.26, profitFactor: 1.44, medMae: -0.17, suggestedStop: 2.0, sampleSize: 28640 },
        "5D": { winRate: 58.0, medReturn: 0.55, profitFactor: 1.66, medMae: -0.74, suggestedStop: 2.0, sampleSize: 28638 },
        "10D": { winRate: 60.6, medReturn: 1.10, profitFactor: 1.97, medMae: -1.38, suggestedStop: 3.5, sampleSize: 28632 },
    },
    extended_wait: {
        "2D": { winRate: 55.9, medReturn: 0.26, profitFactor: 1.47, medMae: -0.19, suggestedStop: 2.0, sampleSize: 22364 },
        "5D": { winRate: 57.1, medReturn: 0.54, profitFactor: 1.60, medMae: -0.83, suggestedStop: 2.0, sampleSize: 22357 },
        "10D": { winRate: 59.3, medReturn: 1.09, profitFactor: 1.87, medMae: -1.51, suggestedStop: 3.5, sampleSize: 22323 },
    },
    avoid_bear_trap: {
        "2D": { winRate: 51.7, medReturn: 0.09, profitFactor: 1.16, medMae: -0.39, suggestedStop: 2.0, sampleSize: 73158 },
        "5D": { winRate: 53.0, medReturn: 0.27, profitFactor: 1.26, medMae: -1.22, suggestedStop: 2.4, sampleSize: 72996 },
        "10D": { winRate: 54.8, medReturn: 0.65, profitFactor: 1.42, medMae: -2.14, suggestedStop: 4.3, sampleSize: 72789 },
    },
    neutral: {
        "2D": { winRate: 54.3, medReturn: 0.19, profitFactor: 1.23, medMae: -0.24, suggestedStop: 2.0, sampleSize: 105249 },
        "5D": { winRate: 56.0, medReturn: 0.45, profitFactor: 1.36, medMae: -0.90, suggestedStop: 2.0, sampleSize: 105142 },
        "10D": { winRate: 56.8, medReturn: 0.75, profitFactor: 1.50, medMae: -1.67, suggestedStop: 3.5, sampleSize: 104966 },
    },
};

/**
 * Retrieve empirical stats for a given two-stage macro regime and swing horizon.
 */
export function getEmpiricalStats(
    regime: string,
    horizon: SwingHorizon
): EmpiricalHorizonStats {
    const regimeStats = EMPIRICAL_REGIME_HORIZON_STATS[regime] || EMPIRICAL_REGIME_HORIZON_STATS.neutral;
    return regimeStats[horizon];
}

/**
 * Retrieve empirical stats for a specific swing timing setup and horizon.
 */
export function getSwingTimingStats(
    timingCode: SwingTimingCode,
    horizon: SwingHorizon
): EmpiricalHorizonStats {
    const timingStats = EMPIRICAL_SWING_TIMING_STATS[timingCode] || EMPIRICAL_SWING_TIMING_STATS.neutral;
    return timingStats[horizon];
}

/**
 * Format normal drawdown noise (MedMAE) and suggested stop-loss
 */
export function formatNoiseAndStop(stats: EmpiricalHorizonStats): string {
    return `MAE: ${stats.medMae.toFixed(1)}% | Stop: ${stats.suggestedStop.toFixed(1)}%`;
}

/**
 * Strips leading emojis and variation selectors from a badge or string.
 */
export function stripLeadingEmoji(text: string): string {
    return text.replace(/^[\p{Extended_Pictographic}\uFE0E\uFE0F\s]+/u, "").trim();
}

/**
 * Returns the human-readable clean string label for a swing timing configuration.
 */
export function getSwingTimingLabel(timing: SwingTimingConfig): string {
    return stripLeadingEmoji(timing.badge);
}

/**
 * Returns the human-readable clean string label for a macro regime code.
 */
export function getRegimeLabel(regimeCode: string): string {
    const config = REGIME_CONFIGS[regimeCode] || REGIME_CONFIGS.neutral;
    return stripLeadingEmoji(config.badge);
}

export interface UnifiedWaveParams {
    b1w: number;
    b1d: number;
    b200: number;
    b1m?: number;
    regime?: string;
    rrgQuadrant?: "Leading" | "Improving" | "Weakening" | "Lagging" | string;
    rrgHeadingNE?: boolean;
    breakouts10d?: number;
}

/**
 * Synthesizes RRG trajectory, Breadth, 52W High Breakouts, and Swing Timing
 * into a single authoritative Next-Day unified wave decision signal.
 */
export function getUnifiedWaveSignal(
    inputOrB1w: number | UnifiedWaveParams,
    b1dArg?: number,
    b200Arg?: number,
    b1mArg?: number,
    options?: Partial<UnifiedWaveParams>
): UnifiedWaveConcept {
    let params: UnifiedWaveParams;
    if (typeof inputOrB1w === "object") {
        params = inputOrB1w;
    } else {
        params = {
            b1w: inputOrB1w,
            b1d: b1dArg ?? 0,
            b200: b200Arg ?? 0,
            b1m: b1mArg,
            ...options,
        };
    }

    const {
        b1w,
        b1d,
        b200,
        b1m = 0,
        regime,
        rrgQuadrant,
        rrgHeadingNE = true,
        breakouts10d,
    } = params;

    // 1. Structural Bear Market Trap: B_200 < 35% takes absolute precedence
    if (b200 < 35.0) {
        return UNIFIED_WAVE_CONCEPTS.avoid_bear_trap;
    }

    // 2. Short-term Vertical Overextension: B_1W >= 75% AND B_1D >= 75%
    if (b1w >= 75.0 && b1d >= 75.0) {
        return UNIFIED_WAVE_CONCEPTS.extended_wait;
    }

    // 3. Apex Sector Wave (Prime Dip):
    // RRG Leading + Heading NE + B_200 >= 50% + B_1W >= 70% + Breakouts W_10D >= 4 + 1D cooling (20% <= B_1D <= 45%)
    const isLeading = rrgQuadrant === "Leading" || (!rrgQuadrant && (regime === "sustained_bull" || regime === "pullback_thrust"));
    const isHeadingNE = rrgHeadingNE !== false;
    const hasApexBreakouts = breakouts10d == null || breakouts10d >= 4;

    if (
        isLeading &&
        isHeadingNE &&
        b200 >= 50.0 &&
        b1w >= 70.0 &&
        b1d >= 20.0 &&
        b1d <= 45.0 &&
        hasApexBreakouts
    ) {
        return UNIFIED_WAVE_CONCEPTS.apex_wave;
    }

    // 4. Springboard Wave (Early Turn):
    // RRG Improving + Heading NE + B_200 >= 50% + B_1W >= 70% (or thrust regime) + Emerging Breakouts (W_10D >= 2)
    const isImproving = rrgQuadrant === "Improving" || (!rrgQuadrant && regime === "early_thrust");
    const hasSpringBreakouts = breakouts10d == null || breakouts10d >= 2;

    if (
        isImproving &&
        isHeadingNE &&
        b200 >= 50.0 &&
        (b1w >= 70.0 || regime === "early_thrust" || regime === "pullback_thrust") &&
        hasSpringBreakouts
    ) {
        return UNIFIED_WAVE_CONCEPTS.springboard_wave;
    }

    // 5. Prime Dip (Next Day): B_200 >= 50% AND B_1W >= 65% AND 1D cooling (20% <= B_1D <= 45%)
    if (
        b200 >= 50.0 &&
        b1w >= 65.0 &&
        b1d >= 20.0 &&
        b1d <= 45.0
    ) {
        return UNIFIED_WAVE_CONCEPTS.prime_dip;
    }

    // 6. Sustained Bull Trend: B_1W >= 60% AND B_1M >= 60% AND B_200 >= 60% + RRG Leading
    if (
        b1w >= 60.0 &&
        b1m >= 60.0 &&
        b200 >= 60.0 &&
        (rrgQuadrant === "Leading" || regime === "sustained_bull" || !rrgQuadrant)
    ) {
        return UNIFIED_WAVE_CONCEPTS.sustained_bull;
    }

    // 7. Neutral Fallback
    return UNIFIED_WAVE_CONCEPTS.neutral;
}

/**
 * Returns clean string label without leading emoji for AG Grid filterValueGetter and text searching.
 */
export function getUnifiedWaveLabel(wave: UnifiedWaveConcept): string {
    return stripLeadingEmoji(wave.badge);
}

export interface ConstituentLeader {
    ticker: string;
    label: string;
    rsRating: number;
    is52wHigh: boolean;
    isRsLeadBreakout: boolean;
    dist52wPct: number | null;
    ret1d: number | null;
    ret1w: number | null;
}

/**
 * Pre-extracts and ranks the top constituent swing candidate stocks per theme.
 * Ranked primarily by IBD RS Rating with priority boost for 52W breakouts.
 */
export function getTopConstituentLeaders(
    tickers: string[],
    perfMap: ConstituentPerformanceMap | null | undefined,
    limit: number = 2
): ConstituentLeader[] {
    if (!tickers || !tickers.length || !perfMap) return [];

    const candidates: ConstituentLeader[] = [];
    for (const ticker of tickers) {
        const perf: ConstituentPerformance | undefined =
            perfMap[ticker] ||
            perfMap[`${ticker}.NS`] ||
            perfMap[ticker.replace(".NS", "")];

        if (!perf) {
            candidates.push({
                ticker,
                label: getTickerLabel(ticker),
                rsRating: 0,
                is52wHigh: false,
                isRsLeadBreakout: false,
                dist52wPct: null,
                ret1d: null,
                ret1w: null,
            });
            continue;
        }

        const rs = typeof perf.ibd_rs_rating === "number" ? perf.ibd_rs_rating : 0;
        const is52wHigh = Boolean(perf.price_52w_high || perf.rs_line_52w_high);
        const isRsLead = Boolean(perf.rs_lead_breakout);
        const dist52w = typeof perf.price_dist_52w_pct === "number" ? perf.price_dist_52w_pct : null;
        const ret1d = typeof perf["1D"] === "number" ? perf["1D"] : null;
        const ret1w = typeof perf["1W"] === "number" ? perf["1W"] : null;

        candidates.push({
            ticker,
            label: getTickerLabel(ticker),
            rsRating: rs,
            is52wHigh,
            isRsLeadBreakout: isRsLead,
            dist52wPct: dist52w,
            ret1d,
            ret1w,
        });
    }

    candidates.sort((a, b) => {
        const scoreA = a.rsRating + (a.is52wHigh ? 5 : 0) + (a.isRsLeadBreakout ? 3 : 0);
        const scoreB = b.rsRating + (b.is52wHigh ? 5 : 0) + (b.isRsLeadBreakout ? 3 : 0);
        return scoreB - scoreA;
    });

    return candidates.slice(0, limit);
}
