// components/modals/EmaStretchMatrixModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { EMAStretchMatrix, EMAStretchCell } from "@/types";
import { X, ExternalLink, Zap, Compass, Activity, ArrowUpRight, ArrowDownRight, ShieldAlert, Sparkles, Target } from "lucide-react";
import { makeTradingViewUrl } from "@/lib/utils";

export interface SetupVerdictInfo {
    key: string;
    badge: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    tooltip: string;
    explanation: string;
}

export function getSetupVerdict(m: EMAStretchMatrix | null | undefined): SetupVerdictInfo {
    if (!m) {
        return {
            key: "unknown",
            badge: "No Telemetry",
            bgClass: "bg-gray-800",
            textClass: "text-gray-400",
            borderClass: "border-gray-700",
            tooltip: "No stretch data available",
            explanation: "No stretch data available for this security.",
        };
    }

    const d20 = m.daily?.ema_20;
    const w20 = m.weekly?.ema_20;
    const isHook = m.is_exhaustion_hook;
    const vel = m.velocity ?? 0;

    // 1. Hook Active: Daily >= +P90 with negative velocity rollover
    if (isHook || (d20?.is_above && (d20?.percentile ?? 0) >= 90 && vel < 0)) {
        return {
            key: "hook",
            badge: "⚡ Hook Active",
            bgClass: "bg-amber-500/20",
            textClass: "text-amber-300",
            borderClass: "border-amber-500/40",
            tooltip: "Exhaustion Hook: Daily stretch exceeded +P90 with negative velocity rollover. Take profits / high-probability pullback.",
            explanation: "Exhaustion Hook Active: Daily stretch reached extreme overbought (≥ +P90) while kinetic velocity rolled negative today (Vt < 0). Price momentum is decelerating rapidly. Action: Protect profits, tighten trailing stops, or anticipate mean-reversion pullback toward the Daily 20 EMA.",
        };
    }

    // 2. Climax Exhaustion: Daily & Weekly both >= +P90
    if (d20?.is_above && (d20?.percentile ?? 0) >= 90 && w20?.is_above && (w20?.percentile ?? 0) >= 90) {
        return {
            key: "climax",
            badge: "🔥 Climax Exhaustion",
            bgClass: "bg-[#670038]",
            textClass: "text-[#fce7f3]",
            borderClass: "border-[#8a144e]",
            tooltip: "Climax Exhaustion: Daily and Weekly simultaneously overstretched >= +P90. Extreme overbought risk.",
            explanation: "Triple Climax / Blow-Off Top: Daily and Weekly moving averages are simultaneously overextended (≥ +P90). Severe asymmetric downside risk. Action: Avoid chasing breakouts; wait for multi-day consolidation or pullback to EMA 20 before fresh risk deployment.",
        };
    }

    // 3. Momentum Thrust: Daily >= +P90 with accelerating velocity > 0.20
    if (d20?.is_above && (d20?.percentile ?? 0) >= 90 && vel > 0.2) {
        return {
            key: "thrust",
            badge: "🚀 Momentum Thrust",
            bgClass: "bg-purple-600/20",
            textClass: "text-purple-300",
            borderClass: "border-purple-500/40",
            tooltip: "Momentum Thrust: Extreme stretch expanding with positive velocity. Unchecked trend; trail stops tightly.",
            explanation: `Momentum Thrust: Extreme stretch expanding with positive kinetic acceleration (+${vel.toFixed(2)} ATR/d). Powerful institutional impulse in motion. Action: Ride the trend with tight trailing stops anchored to Daily 10 EMA; do not counter-trend short.`,
        };
    }

    // 4. Bull Dip-Buy (Holy Grail): Weekly >= +P70 (Macro Bull), Daily resting at EMA (-0.5 to +0.8 ATR) and velocity >= 0
    const dStretchSigned = d20 ? (d20.is_above ? d20.stretch_atr : -d20.stretch_atr) : 99;
    if (
        w20?.is_above &&
        (w20?.percentile ?? 0) >= 70 &&
        dStretchSigned >= -0.5 &&
        dStretchSigned <= 0.8 &&
        vel >= 0
    ) {
        return {
            key: "dip_buy",
            badge: "🎯 Bull Dip-Buy",
            bgClass: "bg-emerald-600/20",
            textClass: "text-emerald-300",
            borderClass: "border-emerald-500/40",
            tooltip: "Bull Dip-Buy: Powerful Weekly bull trend (+P70+) resting near Daily 20 EMA (-0.5 to +0.8 ATR) with positive velocity. Optimal risk/reward entry.",
            explanation: "Bull Dip-Buy (Holy Grail): Macro bull trend is intact (Weekly ≥ +P70) while Daily price has digested excess stretch to rest near the 20 EMA (-0.5 to +0.8 ATR) with positive kinetic velocity. Action: High-probability dip-buy setup. Look for intraday stabilization around EMA 20 for asymmetric long entry.",
        };
    }

    // 5. Squeeze Expansion: Coiled near EMA (<= 1.2 ATR) with TTM squeeze or high SBS
    if ((m.is_squeeze || (m.sbs_score != null && m.sbs_score >= 8.0)) && (d20?.stretch_atr != null && d20.stretch_atr <= 1.2)) {
        return {
            key: "squeeze",
            badge: "🌀 Squeeze Coiling",
            bgClass: "bg-cyan-600/20",
            textClass: "text-cyan-300",
            borderClass: "border-cyan-500/40",
            tooltip: "Squeeze Expansion: Volatility compressed near 20 EMA. Coiled energy preparing for explosive breakout.",
            explanation: "Squeeze Expansion: Price has compressed within tight volatility bands near the 20 EMA (TTM squeeze coiling). Volatility expansion is imminent. Action: Prepare breakout limit orders above/below range consolidation.",
        };
    }

    // 6. Price Flush: Severe breakdown below EMA (<= -P70) with negative velocity
    if (!d20?.is_above && (d20?.percentile ?? 0) >= 70 && vel < -0.2) {
        return {
            key: "flush",
            badge: "⚠️ Price Flush",
            bgClass: "bg-rose-500/20",
            textClass: "text-rose-300",
            borderClass: "border-rose-500/40",
            tooltip: "Price Flush: Falling waterfall below moving averages. High-risk breakdown; avoid bottom fishing.",
            explanation: "Price Flush / Waterfall Decline: Breakdown below moving averages (Daily ≤ -P70) with accelerating negative velocity. Action: High risk of capitulation; avoid bottom-fishing until velocity stabilizes and hooks upward.",
        };
    }

    // 7. Normal Baseline
    return {
        key: "normal",
        badge: d20?.is_above ? "Trend Intact" : "Neutral Consolidation",
        bgClass: "bg-gray-800/60",
        textClass: "text-gray-300",
        borderClass: "border-gray-700/60",
        tooltip: "Normal price drift around moving average baseline.",
        explanation: "Trend Equilibrium: Price is oscillating within standard historical ATR bands around the 20 EMA baseline. Action: Monitor multi-timeframe alignment for emerging directional catalysts.",
    };
}

export function calcLandingDiscount(landing: number | null | undefined, current: number | null | undefined): string | null {
    if (landing == null || current == null || isNaN(landing) || isNaN(current) || current <= 0) return null;
    const diffPct = ((landing - current) / current) * 100;
    return diffPct >= 0 ? `+${diffPct.toFixed(1)}%` : `${diffPct.toFixed(1)}%`;
}

export interface EmaStretchMatrixModalProps {
    isOpen: boolean;
    onClose: () => void;
    symbol: string;
    cleanSymbol?: string;
    companyName?: string | null;
    currentPrice?: number | null;
    pct1d?: number | null;
    sector?: string | null;
    matrix: EMAStretchMatrix | null;
}

export function EmaStretchMatrixModal({
    isOpen,
    onClose,
    symbol,
    cleanSymbol,
    companyName,
    currentPrice,
    pct1d,
    sector,
    matrix,
}: EmaStretchMatrixModalProps) {
    const clean = cleanSymbol || symbol.replace(".NS", "").trim().toUpperCase();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Lock body scroll when modal is open
    useEffect(() => {
        if (!isOpen) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen]);

    // ESC key closes modal
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || !mounted) return null;

    const renderCellValues = (cell: EMAStretchCell | undefined, isLast: boolean = false) => {
        if (!cell) {
            return (
                <>
                    <td className="px-2 py-2 text-center text-gray-500 border-r border-gray-800 font-mono text-[11px] whitespace-nowrap">—</td>
                    <td className={`px-2 py-2 text-center text-gray-500 font-mono text-[11px] whitespace-nowrap ${!isLast ? "border-r border-gray-800" : ""}`}>—</td>
                </>
            );
        }

        const isIpo = cell.percentile_str === "IPO" || cell.color_tier === "ipo";
        const isExtremePos = !isIpo && (cell.color_tier === "extreme_pos" || (cell.is_above && (cell.percentile ?? 0) >= 95));
        const isPos = !isIpo && cell.is_above;
        const isExtremeNeg = !isIpo && (cell.color_tier === "extreme_neg" || (!cell.is_above && (cell.percentile ?? 0) >= 70));
        const isNeg = !isIpo && !cell.is_above;

        let bgClass = "bg-[#111118]";
        let textValClass = "text-gray-200";
        let textPctClass = "text-gray-200";
        let borderClass = "border-[#2b102b]";

        if (isIpo) {
            bgClass = "bg-[#181824]";
            textValClass = "text-gray-400";
            textPctClass = "text-amber-400 font-semibold";
            borderClass = "border-gray-800";
        } else if (isExtremePos) {
            bgClass = "bg-[#670038]";
            textValClass = "text-[#fce7f3] font-semibold";
            textPctClass = "text-[#ffcce6] font-bold";
            borderClass = "border-[#8a144e]";
        } else if (isPos) {
            bgClass = "bg-[#38062b]";
            textValClass = "text-[#f3e8ff]";
            textPctClass = "text-[#fbcfe8] font-semibold";
            borderClass = "border-[#581845]";
        } else if (isExtremeNeg) {
            bgClass = "bg-[#071d3b]";
            textValClass = "text-[#7dd3fc] font-semibold";
            textPctClass = "text-[#38bdf8] font-bold";
            borderClass = "border-[#0369a1]";
        } else if (isNeg) {
            bgClass = "bg-[#0a1c38]";
            textValClass = "text-[#93c5fd]";
            textPctClass = "text-[#7dd3fc] font-semibold";
            borderClass = "border-[#1e3a5f]";
        }

        const valAbs = cell.stretch_atr;
        const valStr = Number.isInteger(valAbs) ? `${valAbs}` : valAbs.toFixed(1);
        const dirSign = cell.is_above ? "▲ +" : "▼ -";
        const formattedAtr = `${dirSign}${valStr} ATR`;
        const cleanPct = (cell.percentile_str || "").replace(/\*/g, "").trim();

        return (
            <>
                <td className={`px-2 py-2 text-center font-mono text-[11px] whitespace-nowrap border-r ${borderClass} ${bgClass} ${textValClass}`}>
                    <div>{formattedAtr}</div>
                    {cell.ema_val != null && (
                        <div className="text-[10px] text-gray-300 font-mono mt-0.5">
                            ₹{cell.ema_val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                    )}
                </td>
                <td className={`px-2 py-2 text-center font-mono text-[11px] whitespace-nowrap ${!isLast ? `border-r ${borderClass}` : ""} ${bgClass} ${textPctClass}`}>
                    {cleanPct}
                </td>
            </>
        );
    };

    const modalContent = (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200"
            onClick={onClose}
        >
            {/* Modal Card */}
            <div
                className="bg-[#0e0e17] border border-[#2d1230] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-gray-200 animate-in fade-in-0 zoom-in-95 duration-200 ease-out"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="bg-[#1b051a] border-b border-[#3b0b38] px-5 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-[#581845]/40 border border-[#8a246a]/60 text-[#ffb3d9]">
                            <Zap className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-white text-base tracking-wide font-mono flex items-center gap-2">
                                    {clean}
                                    <span className="text-xs px-2 py-0.5 rounded font-sans font-medium bg-[#38062b] text-[#f3e8ff] border border-[#670038]">
                                        EMA STRETCH MATRIX
                                    </span>
                                </h3>
                                <a
                                    href={makeTradingViewUrl(clean)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-400 hover:text-cyan-300 transition-colors"
                                    title="Open in TradingView"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                                {companyName && <span className="truncate max-w-[220px]">{companyName}</span>}
                                {sector && (
                                    <>
                                        <span>•</span>
                                        <span className="text-gray-300">{sector}</span>
                                    </>
                                )}
                                {currentPrice != null && (
                                    <>
                                        <span>•</span>
                                        <span className="font-mono text-gray-200 font-semibold">
                                            ₹{currentPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                        </span>
                                    </>
                                )}
                                {pct1d != null && (
                                    <span
                                        className={`font-mono text-[11px] font-semibold flex items-center ${
                                            pct1d >= 0 ? "text-emerald-400" : "text-rose-400"
                                        }`}
                                    >
                                        {pct1d >= 0 ? <ArrowUpRight className="w-3 h-3 inline" /> : <ArrowDownRight className="w-3 h-3 inline" />}
                                        {pct1d >= 0 ? `+${pct1d.toFixed(2)}%` : `${pct1d.toFixed(2)}%`}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {(() => {
                            const verdict = getSetupVerdict(matrix);
                            return (
                                <div
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border ${verdict.bgClass} ${verdict.textClass} ${verdict.borderClass} ${verdict.key === "hook" ? "animate-pulse" : ""}`}
                                    title={verdict.tooltip}
                                >
                                    <span>{verdict.badge}</span>
                                </div>
                            );
                        })()}
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Modal Body */}
                <div className="p-5 space-y-5 overflow-y-auto flex-1">
                    {/* 1. TradingView Replica Matrix */}
                    <div className="overflow-x-auto rounded-xl border border-[#4a0d3b] shadow-lg">
                        <table className="w-full border-collapse text-xs select-none">
                            <thead>
                                <tr className="bg-[#38062b] text-[#f3e8ff] border-b border-[#5a1040]">
                                    <th rowSpan={2} className="px-3 py-2 text-center font-bold tracking-wider uppercase border-r border-[#5a1040] w-24">
                                        STRETCH
                                    </th>
                                    <th colSpan={2} className="px-3 py-1.5 text-center font-bold border-r border-[#5a1040]">
                                        EMA8
                                    </th>
                                    <th colSpan={2} className="px-3 py-1.5 text-center font-bold border-r border-[#5a1040]">
                                        EMA20
                                    </th>
                                    <th colSpan={2} className="px-3 py-1.5 text-center font-bold">
                                        EMA50
                                    </th>
                                </tr>
                                <tr className="bg-[#38062b] text-[#e9d5ff] text-[11px] font-semibold border-b border-[#5a1040]">
                                    <th className="px-2 py-1 text-center border-r border-[#5a1040]/60 w-[72px]">Value</th>
                                    <th className="px-2 py-1 text-center border-r border-[#5a1040] w-[56px]">%ile</th>
                                    <th className="px-2 py-1 text-center border-r border-[#5a1040]/60 w-[72px]">Value</th>
                                    <th className="px-2 py-1 text-center border-r border-[#5a1040] w-[56px]">%ile</th>
                                    <th className="px-2 py-1 text-center border-r border-[#5a1040]/60 w-[72px]">Value</th>
                                    <th className="px-2 py-1 text-center w-[56px]">%ile</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Daily Row */}
                                <tr className="border-b border-[#4a0d3b]/60">
                                    <td className="px-3 py-2 bg-[#0d3b66] text-[#e0f2fe] font-semibold text-center border-r border-[#1e3a5f]">
                                        Daily
                                    </td>
                                    {renderCellValues(matrix?.daily?.ema_8 || matrix?.daily?.ema_10)}
                                    {renderCellValues(matrix?.daily?.ema_20)}
                                    {renderCellValues(matrix?.daily?.ema_50, true)}
                                </tr>
                                {/* Weekly Row */}
                                <tr className="border-b border-[#4a0d3b]/60">
                                    <td className="px-3 py-2 bg-[#0d3b66] text-[#e0f2fe] font-semibold text-center border-r border-[#1e3a5f]">
                                        Weekly
                                    </td>
                                    {renderCellValues(matrix?.weekly?.ema_8 || matrix?.weekly?.ema_10)}
                                    {renderCellValues(matrix?.weekly?.ema_20)}
                                    {renderCellValues(matrix?.weekly?.ema_50, true)}
                                </tr>
                                {/* Monthly Row */}
                                <tr>
                                    <td className="px-3 py-2 bg-[#0d3b66] text-[#e0f2fe] font-semibold text-center border-r border-[#1e3a5f]">
                                        Monthly
                                    </td>
                                    {renderCellValues(matrix?.monthly?.ema_8 || matrix?.monthly?.ema_10)}
                                    {renderCellValues(matrix?.monthly?.ema_20)}
                                    {renderCellValues(matrix?.monthly?.ema_50, true)}
                                </tr>
                            </tbody>
                        </table>

                        {/* Pixel-Faithful Caution Banner */}
                        <div className="bg-[#670038] text-[#fce7f3] text-[11px] px-3.5 py-2.5 text-center border-t border-[#8a144e] font-sans leading-relaxed">
                            Caution: Weekly/Monthly values are accurate during live market hours or on an actual Weekly/Monthly timeframe when markets are closed
                        </div>
                    </div>

                    {/* 2. Setup Verdict Tactical Guidance Callout */}
                    {(() => {
                        const verdict = getSetupVerdict(matrix);
                        if (verdict.key === "unknown") return null;
                        return (
                            <div className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-3 ${verdict.bgClass} ${verdict.borderClass}`}>
                                <div className={`p-1.5 rounded-lg bg-black/30 shrink-0 ${verdict.textClass}`}>
                                    <Target className="w-4 h-4" />
                                </div>
                                <div className="space-y-1">
                                    <div className={`font-bold text-xs ${verdict.textClass} flex items-center gap-1.5`}>
                                        <span>Setup Protocol:</span>
                                        <span>{verdict.badge}</span>
                                    </div>
                                    <p className="text-gray-200 text-[11px] leading-relaxed">
                                        {verdict.explanation}
                                    </p>
                                </div>
                            </div>
                        );
                    })()}

                    {/* 3. Kinetic Vector & Mean-Reversion Landing Zones */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {/* Kinetic Vector Card */}
                        <div className="bg-[#12121d] border border-gray-800 rounded-xl p-3.5 space-y-2">
                            <div className="flex items-center justify-between text-xs border-b border-gray-800/80 pb-2">
                                <span className="font-semibold text-gray-300 flex items-center gap-1.5">
                                    <Activity className="w-4 h-4 text-cyan-400" />
                                    Kinetic Momentum Vector
                                </span>
                                <span
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                        matrix?.is_exhaustion_hook
                                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                            : matrix?.kinetic_status === "thrust"
                                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                            : "bg-gray-800 text-gray-300"
                                    }`}
                                >
                                    {matrix ? (matrix.kinetic_badge || "Normal Drift") : "No Telemetry"}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                                <div>
                                    <div className="text-gray-400 font-sans text-[10px]">Smoothed Velocity (Vt)</div>
                                    <div
                                        className={`font-semibold mt-0.5 ${
                                            (matrix?.velocity ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                                        }`}
                                    >
                                        {matrix?.velocity != null ? (
                                            <>
                                                {matrix.velocity >= 0 ? "+" : ""}
                                                {matrix.velocity.toFixed(2)} ATR/day
                                            </>
                                        ) : (
                                            <span className="text-gray-500 font-sans">—</span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-gray-400 font-sans text-[10px]">Decay Mode & Half-Life</div>
                                    <div className="text-gray-200 font-sans font-medium mt-0.5">
                                        {matrix ? `${matrix.decay_mode || "Digestion"} (t½: ~${matrix.half_life_days ?? 5}d)` : <span className="text-gray-500">—</span>}
                                    </div>
                                </div>
                            </div>
                            {matrix?.is_exhaustion_hook && (
                                <p className="text-[11px] font-sans text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded p-2 leading-relaxed">
                                    ⚡ <strong>Exhaustion Hook Triggered:</strong> Daily stretch exceeded +P90 but daily velocity rolled negative today ({matrix.velocity.toFixed(2)} ATR/d). High probability mean-reversion pullback underway.
                                </p>
                            )}
                        </div>

                        {/* Mean-Reversion Landing Zones Card */}
                        <div className="bg-[#12121d] border border-gray-800 rounded-xl p-3.5 space-y-2">
                            <div className="flex items-center justify-between text-xs border-b border-gray-800/80 pb-2">
                                <span className="font-semibold text-gray-300 flex items-center gap-1.5">
                                    <Target className="w-4 h-4 text-emerald-400" />
                                    Execution Landing Zones
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">Support Benchmarks</span>
                            </div>
                            {(() => {
                                const landingEma8 = matrix?.landing_ema_8 ?? matrix?.landing_ema_10;
                                const landingEma20 = matrix?.landing_ema_20;
                                const landingEma50 = matrix?.landing_ema_50;
                                const landingCprPivot = matrix?.landing_cpr_pivot ?? matrix?.landing_cpr_top;

                                const discEma8 = calcLandingDiscount(landingEma8, currentPrice);
                                const discEma20 = calcLandingDiscount(landingEma20, currentPrice);
                                const discEma50 = calcLandingDiscount(landingEma50, currentPrice);
                                const discCprPivot = calcLandingDiscount(landingCprPivot, currentPrice);

                                // Find closest support benchmark
                                let closestSupport: "ema8" | "ema20" | "ema50" | "cpr_pivot" | null = null;
                                if (currentPrice != null && currentPrice > 0) {
                                    let minDiff = Infinity;
                                    const candidates = [
                                        { key: "ema8" as const, val: landingEma8 },
                                        { key: "ema20" as const, val: landingEma20 },
                                        { key: "ema50" as const, val: landingEma50 },
                                        { key: "cpr_pivot" as const, val: landingCprPivot },
                                    ];
                                    for (const c of candidates) {
                                        if (c.val != null) {
                                            const d = Math.abs(currentPrice - c.val);
                                            if (d < minDiff) {
                                                minDiff = d;
                                                closestSupport = c.key;
                                            }
                                        }
                                    }
                                }

                                return (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
                                        {/* EMA 8 */}
                                        <div className={`p-2 rounded-lg border relative transition-all ${
                                            closestSupport === "ema8"
                                                ? "bg-cyan-950/30 border-cyan-500/80 ring-1 ring-cyan-500/40"
                                                : "bg-[#0e0e17] border-gray-800"
                                        }`}>
                                            {closestSupport === "ema8" && (
                                                <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full bg-cyan-600 text-[8px] font-sans font-bold text-white uppercase tracking-wider whitespace-nowrap shadow">
                                                    Closest
                                                </div>
                                            )}
                                            <div className="text-[10px] text-gray-400 font-sans">EMA 8</div>
                                            <div className="text-xs font-bold text-gray-200 mt-0.5">
                                                {landingEma8 != null ? `₹${landingEma8.toFixed(2)}` : "—"}
                                            </div>
                                            {discEma8 && (
                                                <div className={`text-[10px] font-mono mt-0.5 ${discEma8.startsWith('-') ? 'text-gray-400' : 'text-amber-400 font-semibold'}`}>
                                                    {discEma8}
                                                </div>
                                            )}
                                        </div>

                                        {/* EMA 20 */}
                                        <div className={`p-2 rounded-lg border relative transition-all ${
                                            closestSupport === "ema20"
                                                ? "bg-cyan-950/30 border-cyan-500/80 ring-1 ring-cyan-500/40"
                                                : "bg-[#0e0e17] border-gray-800"
                                        }`}>
                                            {closestSupport === "ema20" && (
                                                <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full bg-cyan-600 text-[8px] font-sans font-bold text-white uppercase tracking-wider whitespace-nowrap shadow">
                                                    Closest
                                                </div>
                                            )}
                                            <div className="text-[10px] text-gray-400 font-sans">EMA 20</div>
                                            <div className="text-xs font-bold text-cyan-300 mt-0.5">
                                                {landingEma20 != null ? `₹${landingEma20.toFixed(2)}` : "—"}
                                            </div>
                                            {discEma20 && (
                                                <div className={`text-[10px] font-mono mt-0.5 ${discEma20.startsWith('-') ? 'text-cyan-400' : 'text-amber-400 font-semibold'}`}>
                                                    {discEma20}
                                                </div>
                                            )}
                                        </div>

                                        {/* EMA 50 */}
                                        <div className={`p-2 rounded-lg border relative transition-all ${
                                            closestSupport === "ema50"
                                                ? "bg-cyan-950/30 border-cyan-500/80 ring-1 ring-cyan-500/40"
                                                : "bg-[#0e0e17] border-gray-800"
                                        }`}>
                                            {closestSupport === "ema50" && (
                                                <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full bg-cyan-600 text-[8px] font-sans font-bold text-white uppercase tracking-wider whitespace-nowrap shadow">
                                                    Closest
                                                </div>
                                            )}
                                            <div className="text-[10px] text-gray-400 font-sans">EMA 50</div>
                                            <div className="text-xs font-bold text-indigo-300 mt-0.5">
                                                {landingEma50 != null ? `₹${landingEma50.toFixed(2)}` : "—"}
                                            </div>
                                            {discEma50 && (
                                                <div className={`text-[10px] font-mono mt-0.5 ${discEma50.startsWith('-') ? 'text-indigo-400' : 'text-amber-400 font-semibold'}`}>
                                                    {discEma50}
                                                </div>
                                            )}
                                        </div>

                                        {/* Monthly Central Pivot (P) */}
                                        <div className={`p-2 rounded-lg border relative transition-all ${
                                            closestSupport === "cpr_pivot"
                                                ? "bg-cyan-950/30 border-cyan-500/80 ring-1 ring-cyan-500/40"
                                                : "bg-[#0e0e17] border-gray-800"
                                        }`}>
                                            {closestSupport === "cpr_pivot" && (
                                                <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-full bg-cyan-600 text-[8px] font-sans font-bold text-white uppercase tracking-wider whitespace-nowrap shadow">
                                                    Closest
                                                </div>
                                            )}
                                            <div className="text-[10px] text-gray-400 font-sans">Central Pivot (P)</div>
                                            <div className="text-xs font-bold text-emerald-400 mt-0.5">
                                                {landingCprPivot != null ? `₹${landingCprPivot.toFixed(2)}` : "—"}
                                            </div>
                                            {discCprPivot && (
                                                <div className={`text-[10px] font-mono mt-0.5 ${discCprPivot.startsWith('-') ? 'text-emerald-400' : 'text-amber-400 font-semibold'}`}>
                                                    {discCprPivot}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                            <p className="text-[10px] font-sans text-gray-400 leading-normal">
                                Institutional dip-buyers deploy limit orders near EMA 8, EMA 20, EMA 50 & Monthly Central Pivot (P) (% indicates distance from CMP).
                            </p>
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="bg-[#12121d] border-t border-gray-800 px-5 py-3 flex items-center justify-between text-xs">
                    <div className="text-gray-400 flex items-center gap-2">
                        <span>Wilder's ATR-14 Normalization</span>
                        <span>•</span>
                        <span>Directional Percentiles (+P / -P)</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
