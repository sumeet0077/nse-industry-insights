// components/modals/EmaStretchMatrixModal.tsx
"use client";

import React, { useEffect } from "react";
import type { EMAStretchMatrix, EMAStretchCell } from "@/types";
import { X, ExternalLink, Zap, Compass, Activity, ArrowUpRight, ArrowDownRight, ShieldAlert, Sparkles, Target } from "lucide-react";
import { makeTradingViewUrl } from "@/lib/utils";

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

    // ESC key closes modal
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

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
        const formattedAtr = `${valStr} ATR${cell.is_above ? " *" : ""}`;

        return (
            <>
                <td className={`px-2 py-2 text-center font-mono text-[11px] whitespace-nowrap border-r ${borderClass} ${bgClass} ${textValClass}`}>
                    {formattedAtr}
                </td>
                <td className={`px-2 py-2 text-center font-mono text-[11px] whitespace-nowrap ${!isLast ? `border-r ${borderClass}` : ""} ${bgClass} ${textPctClass}`}>
                    {cell.percentile_str}
                </td>
            </>
        );
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={onClose}
        >
            {/* Modal Card */}
            <div
                className="bg-[#0e0e17] border border-[#2d1230] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-gray-200"
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
                        {matrix?.is_exhaustion_hook && (
                            <div className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1 animate-pulse">
                                <span>⚡</span>
                                <span>Hook Active</span>
                            </div>
                        )}
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
                                        EMA10
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
                                    {renderCellValues(matrix?.daily?.ema_10)}
                                    {renderCellValues(matrix?.daily?.ema_20)}
                                    {renderCellValues(matrix?.daily?.ema_50, true)}
                                </tr>
                                {/* Weekly Row */}
                                <tr className="border-b border-[#4a0d3b]/60">
                                    <td className="px-3 py-2 bg-[#0d3b66] text-[#e0f2fe] font-semibold text-center border-r border-[#1e3a5f]">
                                        Weekly
                                    </td>
                                    {renderCellValues(matrix?.weekly?.ema_10)}
                                    {renderCellValues(matrix?.weekly?.ema_20)}
                                    {renderCellValues(matrix?.weekly?.ema_50, true)}
                                </tr>
                                {/* Monthly Row */}
                                <tr>
                                    <td className="px-3 py-2 bg-[#0d3b66] text-[#e0f2fe] font-semibold text-center border-r border-[#1e3a5f]">
                                        Monthly
                                    </td>
                                    {renderCellValues(matrix?.monthly?.ema_10)}
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

                    {/* 2. Kinetic Vector & Mean-Reversion Landing Zones */}
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
                            <div className="grid grid-cols-3 gap-2 text-center font-mono">
                                <div className="bg-[#0e0e17] p-2 rounded-lg border border-gray-800">
                                    <div className="text-[10px] text-gray-400 font-sans">EMA 10</div>
                                    <div className="text-xs font-bold text-gray-200 mt-0.5">
                                        {matrix?.landing_ema_10 != null ? `₹${matrix.landing_ema_10.toFixed(2)}` : "—"}
                                    </div>
                                </div>
                                <div className="bg-[#0e0e17] p-2 rounded-lg border border-gray-800">
                                    <div className="text-[10px] text-gray-400 font-sans">EMA 20</div>
                                    <div className="text-xs font-bold text-cyan-300 mt-0.5">
                                        {matrix?.landing_ema_20 != null ? `₹${matrix.landing_ema_20.toFixed(2)}` : "—"}
                                    </div>
                                </div>
                                <div className="bg-[#0e0e17] p-2 rounded-lg border border-gray-800">
                                    <div className="text-[10px] text-gray-400 font-sans">CPR Top</div>
                                    <div className="text-xs font-bold text-emerald-400 mt-0.5">
                                        {matrix?.landing_cpr_top != null ? `₹${matrix.landing_cpr_top.toFixed(2)}` : "—"}
                                    </div>
                                </div>
                            </div>
                            <p className="text-[10px] font-sans text-gray-400 leading-normal">
                                Institutional dip-buyers deploy limit orders near EMA 20 & Monthly CPR Top.
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
}
