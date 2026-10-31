// lib/swingTiming.ts
// Empirical Swing Trading Analytics, Timing Trigger Rules & Risk Management

import {
    SwingHorizon,
    SwingTimingCode,
    SwingTimingConfig,
    EmpiricalHorizonStats,
} from "@/types";

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
