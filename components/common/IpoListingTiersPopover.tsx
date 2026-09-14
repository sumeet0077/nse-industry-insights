"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Sparkles, ChevronDown, Check } from "lucide-react";
import {
    IpoTierId,
    IPO_TIERS,
    IPO_TIER_ORDER,
    SEASONED_TIER_CONFIG,
    DEFAULT_IPO_TIERS,
} from "@/lib/ipoTiers";

interface IpoListingTiersPopoverProps {
    activeTiers: Record<IpoTierId, boolean>;
    onChange: (newTiers: Record<IpoTierId, boolean>) => void;
    tierCounts: Record<IpoTierId, number>;
    className?: string;
}

export function IpoListingTiersPopover({
    activeTiers,
    onChange,
    tierCounts,
    className = "",
}: IpoListingTiersPopoverProps) {
    const [isOpen, setIsOpen] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Close on outside click or Escape key
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                popoverRef.current &&
                !popoverRef.current.contains(event.target as Node) &&
                triggerRef.current &&
                !triggerRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            document.addEventListener("keydown", handleKeyDown);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen]);

    // Active tier metrics
    const ipoKeys = IPO_TIER_ORDER;
    const activeIpoKeys = useMemo(() => ipoKeys.filter((k) => activeTiers[k]), [ipoKeys, activeTiers]);
    const allIpoActive = activeIpoKeys.length === ipoKeys.length;
    const allIpoInactive = activeIpoKeys.length === 0;
    const isSeasonedActive = Boolean(activeTiers.seasoned);

    const totalIpoCount = useMemo(
        () => ipoKeys.reduce((acc, k) => acc + (tierCounts[k] || 0), 0),
        [ipoKeys, tierCounts]
    );

    // Header state label
    const headerStatus = useMemo(() => {
        if (allIpoActive && isSeasonedActive) return "All Stages Active";
        if (allIpoActive && !isSeasonedActive) return "Only IPOs Active";
        if (allIpoInactive && !isSeasonedActive) return "None Selected";
        if (allIpoInactive && isSeasonedActive) return "Seasoned Only";
        if (!isSeasonedActive) return `${activeIpoKeys.length} IPO Stages Active`;
        return `${activeIpoKeys.length + 1} Stages Active`;
    }, [allIpoActive, allIpoInactive, isSeasonedActive, activeIpoKeys.length]);

    // Trigger button summary badge
    const buttonSummary = useMemo(() => {
        if (allIpoActive && isSeasonedActive) return "All Stages";
        if (allIpoActive && !isSeasonedActive) return `Only IPOs (${totalIpoCount})`;
        if (allIpoInactive && isSeasonedActive) return "Seasoned Only";
        if (allIpoInactive && !isSeasonedActive) return "0 Selected";
        if (activeIpoKeys.length === 1 && !isSeasonedActive) {
            const single = IPO_TIERS[activeIpoKeys[0]];
            const cnt = tierCounts[activeIpoKeys[0]] || 0;
            return `${single.badgeTag} (${cnt})`;
        }
        if (!isSeasonedActive) {
            const countSum = activeIpoKeys.reduce((acc, k) => acc + (tierCounts[k] || 0), 0);
            return `${activeIpoKeys.length} Tiers (${countSum})`;
        }
        return `${activeIpoKeys.length} IPOs + Seasoned`;
    }, [allIpoActive, allIpoInactive, isSeasonedActive, totalIpoCount, activeIpoKeys, tierCounts]);

    // Quick action handlers
    const handleOnlyIpos = () => {
        const next: Record<IpoTierId, boolean> = {
            day1: true,
            fresh: true,
            recent: true,
            m1_3: true,
            m3_6: true,
            m6_12: true,
            seasoned: false,
        };
        onChange(next);
    };

    const handleAllStocks = () => {
        onChange({ ...DEFAULT_IPO_TIERS });
    };

    const handleClearAll = () => {
        const next: Record<IpoTierId, boolean> = {
            day1: false,
            fresh: false,
            recent: false,
            m1_3: false,
            m3_6: false,
            m6_12: false,
            seasoned: false,
        };
        onChange(next);
    };

    const toggleTier = (id: IpoTierId) => {
        onChange({
            ...activeTiers,
            [id]: !activeTiers[id],
        });
    };

    return (
        <div className={`relative inline-block ${className}`}>
            {/* Trigger Button */}
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsOpen((prev) => !prev)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-sm ${
                    !isSeasonedActive && !allIpoInactive
                        ? "bg-purple-950/40 border-purple-500/50 text-purple-200 ring-1 ring-purple-500/30"
                        : "bg-[#1a1a2e] border-slate-700/70 text-slate-300 hover:border-slate-600 hover:text-white"
                }`}
                title="Filter stocks by IPO listing stages and maturity"
            >
                <Sparkles size={14} className="text-purple-400 shrink-0" />
                <span className="font-sans">IPO Stages</span>
                <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold tracking-tight border ${
                        !isSeasonedActive && !allIpoInactive
                            ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                >
                    {buttonSummary}
                </span>
                <ChevronDown
                    size={14}
                    className={`text-slate-400 transition-transform duration-200 ${
                        isOpen ? "rotate-180 text-purple-400" : ""
                    }`}
                />
            </button>

            {/* Popover Dropdown */}
            {isOpen && (
                <div
                    ref={popoverRef}
                    className="absolute z-50 top-full left-0 mt-2 w-[340px] sm:w-[370px] bg-[#12121e] border border-slate-700/80 rounded-2xl shadow-2xl shadow-black/80 flex flex-col overflow-hidden backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
                >
                    {/* Popover Header */}
                    <div className="p-3.5 bg-gradient-to-b from-[#18182b] to-[#141424] border-b border-slate-800/80 flex flex-col gap-2.5 shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-200">
                                <Sparkles size={15} className="text-purple-400" />
                                <span>IPO Listing Tiers</span>
                            </div>
                            <span className="text-[11px] font-semibold text-purple-300 bg-purple-500/15 px-2 py-0.5 rounded-full border border-purple-500/30">
                                {headerStatus}
                            </span>
                        </div>

                        {/* Quick Presets (3 Action Buttons) */}
                        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                            <button
                                type="button"
                                onClick={handleOnlyIpos}
                                className={`py-1 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition-all border ${
                                    !isSeasonedActive && allIpoActive
                                        ? "bg-purple-600 text-white border-purple-500 shadow-sm shadow-purple-900"
                                        : "bg-purple-500/10 text-purple-300 border-purple-500/30 hover:bg-purple-500/20"
                                }`}
                            >
                                <Sparkles size={11} />
                                <span>Only IPOs</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleAllStocks}
                                className={`py-1 px-2 rounded-md text-[11px] font-semibold transition-all border ${
                                    allIpoActive && isSeasonedActive
                                        ? "bg-slate-700 text-white border-slate-600 shadow-sm"
                                        : "bg-slate-800/70 text-slate-300 border-slate-700/60 hover:bg-slate-700/80 hover:text-white"
                                }`}
                            >
                                All Stocks
                            </button>
                            <button
                                type="button"
                                onClick={handleClearAll}
                                className="py-1 px-2 rounded-md text-[11px] font-semibold text-slate-400 hover:text-red-400 bg-slate-800/40 hover:bg-red-500/10 border border-slate-700/50 hover:border-red-500/30 transition-all"
                            >
                                Clear All
                            </button>
                        </div>
                    </div>

                    {/* 6 Granular IPO Tiers List */}
                    <div className="p-2 flex flex-col gap-1 overflow-y-auto max-h-[340px] overscroll-contain">
                        {ipoKeys.map((key) => {
                            const tier = IPO_TIERS[key];
                            const isChecked = Boolean(activeTiers[key]);
                            const count = tierCounts[key] || 0;

                            return (
                                <label
                                    key={tier.id}
                                    className={`flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-all select-none group border ${
                                        isChecked
                                            ? "bg-[#18182c]/80 border-slate-700/60 hover:border-purple-500/40"
                                            : "bg-transparent border-transparent hover:bg-white/[0.03] opacity-60 hover:opacity-90"
                                    }`}
                                >
                                    {/* Custom Checkbox */}
                                    <div className="pt-0.5 shrink-0">
                                        <div
                                            className={`w-4 h-4 rounded flex items-center justify-center transition-all ${
                                                isChecked
                                                    ? "bg-purple-600 border border-purple-500 text-white shadow-sm shadow-purple-900"
                                                    : "bg-slate-900 border border-slate-700 group-hover:border-slate-500"
                                            }`}
                                        >
                                            {isChecked && <Check size={12} strokeWidth={3} />}
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() => toggleTier(tier.id)}
                                            className="sr-only"
                                        />
                                    </div>

                                    {/* Content (Title, Badge, Description) */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-xs font-bold text-slate-200 group-hover:text-white font-sans">
                                                {tier.label}
                                            </span>
                                            <span
                                                className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold border ${tier.badgeBg} ${tier.badgeText} ${tier.badgeBorder}`}
                                            >
                                                {tier.badgeTag}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-400 font-sans leading-tight">
                                            {tier.description}
                                        </p>
                                    </div>

                                    {/* Live Pre-Filter Count Badge */}
                                    <div className="pt-0.5 shrink-0">
                                        <span
                                            className={`text-[11px] font-mono px-2 py-0.5 rounded-md border font-semibold ${
                                                count > 0
                                                    ? "bg-slate-800 text-slate-200 border-slate-700"
                                                    : "bg-slate-900/60 text-slate-600 border-slate-800"
                                            }`}
                                        >
                                            {count}
                                        </span>
                                    </div>
                                </label>
                            );
                        })}
                    </div>

                    {/* Popover Footer: Seasoned Stocks Toggle */}
                    <div className="p-2.5 bg-[#141424] border-t border-slate-800/80 shrink-0">
                        <label
                            className={`flex items-center justify-between gap-3 p-2 rounded-xl cursor-pointer transition-all select-none group border ${
                                isSeasonedActive
                                    ? "bg-slate-900/80 border-slate-700/60 hover:border-slate-600"
                                    : "bg-transparent border-transparent hover:bg-white/[0.03] opacity-60 hover:opacity-90"
                            }`}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div
                                    className={`w-4 h-4 rounded flex items-center justify-center transition-all shrink-0 ${
                                        isSeasonedActive
                                            ? "bg-blue-600 border border-blue-500 text-white shadow-sm"
                                            : "bg-slate-900 border border-slate-700 group-hover:border-slate-500"
                                    }`}
                                >
                                    {isSeasonedActive && <Check size={12} strokeWidth={3} />}
                                </div>
                                <input
                                    type="checkbox"
                                    checked={isSeasonedActive}
                                    onChange={() => toggleTier("seasoned")}
                                    className="sr-only"
                                />
                                <span className="text-xs font-semibold text-slate-300 group-hover:text-white font-sans">
                                    {SEASONED_TIER_CONFIG.label}
                                </span>
                            </div>

                            <span
                                className={`text-[11px] font-mono px-2 py-0.5 rounded-md border font-semibold shrink-0 ${
                                    (tierCounts.seasoned || 0) > 0
                                        ? "bg-slate-800 text-slate-300 border-slate-700"
                                        : "bg-slate-900/60 text-slate-600 border-slate-800"
                                }`}
                            >
                                {tierCounts.seasoned || 0}
                            </span>
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}
