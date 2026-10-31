"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
    X,
    Search,
    BookOpen,
    TrendingUp,
    ShieldAlert,
    Compass,
    Activity,
    Target,
    Zap,
    Sparkles,
    CheckCircle2,
    Clock,
    Flame,
    Waves,
    AlertOctagon,
    SlidersHorizontal,
    ArrowUpRight,
} from "lucide-react";
import { UNIFIED_WAVE_CONCEPTS } from "@/lib/swingTiming";
import { UnifiedWaveConcept, UnifiedWaveCategory, UnifiedWaveCode } from "@/types";

interface WaveConceptGuideDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    initialConceptId?: string | null;
}

type GuideFilterTab = "all" | "waves_dips" | "trend_continuation" | "traps_caution";

export function WaveConceptGuideDrawer({
    isOpen,
    onClose,
    initialConceptId,
}: WaveConceptGuideDrawerProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTab, setSelectedTab] = useState<GuideFilterTab>("all");
    const [highlightedConcept, setHighlightedConcept] = useState<string | null>(null);

    const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

    // Close on Escape key
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                onClose();
            }
        }
        if (isOpen) {
            window.addEventListener("keydown", handleKeyDown);
        }
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    // Handle initialConceptId scrolling & highlight
    useEffect(() => {
        if (isOpen && initialConceptId) {
            setSearchQuery(""); // Ensure search filter does not hide requested concept
            setHighlightedConcept(initialConceptId);
            // Switch tab to category of initialConceptId if needed
            const concept = UNIFIED_WAVE_CONCEPTS[initialConceptId as UnifiedWaveCode];
            if (concept) {
                if (concept.category === "waves_dips" || concept.category === "trend_continuation" || concept.category === "traps_caution") {
                    // If current tab would hide it, switch to all or its category
                    setSelectedTab("all");
                }
            }

            // Smooth scroll after drawer slide-in animation completes (duration-300)
            const timer = setTimeout(() => {
                const el = cardRefs.current[initialConceptId];
                if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 320);

            // Clear pulse highlight after 2.5s
            const clearTimer = setTimeout(() => {
                setHighlightedConcept(null);
            }, 2500);

            return () => {
                clearTimeout(timer);
                clearTimeout(clearTimer);
            };
        } else if (isOpen) {
            setHighlightedConcept(null);
        }
    }, [isOpen, initialConceptId]);

    // Filter concepts: strictly the 6 core decision tags (excluding neutral from the primary cards)
    const CORE_CONCEPT_KEYS: UnifiedWaveCode[] = [
        "apex_wave",
        "springboard_wave",
        "sustained_bull",
        "prime_dip",
        "extended_wait",
        "avoid_bear_trap",
    ];

    const filteredConcepts = useMemo(() => {
        return CORE_CONCEPT_KEYS.map((key) => UNIFIED_WAVE_CONCEPTS[key]).filter((concept) => {
            if (!concept) return false;

            // Tab filter
            if (selectedTab !== "all" && concept.category !== selectedTab) {
                return false;
            }

            // Search filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchName = concept.name.toLowerCase().includes(q);
                const matchBadge = concept.badge.toLowerCase().includes(q);
                const matchAction = concept.shortAction.toLowerCase().includes(q);
                const matchMeaning = concept.institutionalMeaning.toLowerCase().includes(q);
                const matchFormula = concept.mathFormula.toLowerCase().includes(q);
                const matchPlan = concept.nextDayAction.toLowerCase().includes(q);
                return matchName || matchBadge || matchAction || matchMeaning || matchFormula || matchPlan;
            }

            return true;
        });
    }, [selectedTab, searchQuery]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Slide-over Drawer */}
            <div className="relative z-50 w-full max-w-2xl bg-[#0d1117] border-l border-[#1e293b] shadow-2xl flex flex-col h-full overflow-hidden text-slate-100 animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="p-5 border-b border-[#21262d] bg-[#161b22]/90 backdrop-blur-md flex-shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-400">
                                <BookOpen size={18} />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                                    Wave Concept & Logic Guide
                                </h2>
                                <p className="text-xs text-slate-400">
                                    Institutional order flow, exact formulas & 12-year empirical statistics
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                                ESC
                            </span>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                title="Close Guide"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-800/80">
                        <button
                            onClick={() => setSelectedTab("all")}
                            className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                                selectedTab === "all"
                                    ? "bg-blue-600 text-white shadow-sm font-semibold"
                                    : "bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-slate-800"
                            }`}
                        >
                            All (6)
                        </button>
                        <button
                            onClick={() => setSelectedTab("waves_dips")}
                            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                                selectedTab === "waves_dips"
                                    ? "bg-emerald-600 text-white shadow-sm font-semibold"
                                    : "bg-slate-900/80 text-emerald-400/90 hover:text-emerald-300 hover:bg-slate-800/60 border border-slate-800"
                            }`}
                        >
                            <Waves size={12} />
                            Waves & Dips (3)
                        </button>
                        <button
                            onClick={() => setSelectedTab("trend_continuation")}
                            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                                selectedTab === "trend_continuation"
                                    ? "bg-cyan-600 text-white shadow-sm font-semibold"
                                    : "bg-slate-900/80 text-cyan-400/90 hover:text-cyan-300 hover:bg-slate-800/60 border border-slate-800"
                            }`}
                        >
                            <Flame size={12} />
                            Trend Continuation (1)
                        </button>
                        <button
                            onClick={() => setSelectedTab("traps_caution")}
                            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-lg font-medium transition-all ${
                                selectedTab === "traps_caution"
                                    ? "bg-amber-600 text-white shadow-sm font-semibold"
                                    : "bg-slate-900/80 text-amber-400/90 hover:text-amber-300 hover:bg-slate-800/60 border border-slate-800"
                            }`}
                        >
                            <AlertOctagon size={12} />
                            Traps & Caution (2)
                        </button>
                    </div>

                    {/* Search Input */}
                    <div className="relative mt-2.5">
                        <Search
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                        />
                        <input
                            type="text"
                            placeholder="Search concepts by keyword (e.g. Apex, Leading, cooling, bear trap)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#0d1117] border border-slate-700/80 rounded-lg py-1.5 pl-9 pr-8 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {filteredConcepts.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 text-sm">
                            No concepts match your search &ldquo;{searchQuery}&rdquo;.
                        </div>
                    ) : (
                        filteredConcepts.map((concept) => {
                            const isHighlighted = highlightedConcept === concept.code;
                            return (
                                <div
                                    key={concept.code}
                                    ref={(el) => {
                                        cardRefs.current[concept.code] = el;
                                    }}
                                    className={`bg-[#161b22]/90 border rounded-xl p-5 space-y-4 transition-all duration-300 shadow-sm ${
                                        isHighlighted
                                            ? "border-blue-500 ring-2 ring-blue-500/40 bg-[#1c2128]"
                                            : "border-[#30363d] hover:border-slate-600"
                                    }`}
                                >
                                    {/* Card Header */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`px-3 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${concept.bgClass} ${concept.textClass} ${concept.borderClass}`}
                                            >
                                                {concept.badge}
                                            </span>
                                            <span className="text-xs text-slate-400 font-medium hidden sm:inline-block">
                                                • {concept.name}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-blue-950/80 border border-blue-700/60 text-blue-300">
                                                {concept.edgeLabel}
                                            </span>
                                            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700">
                                                {concept.category.replace("_", " ")}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Section 1: Institutional Reality */}
                                    <div>
                                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                                            <Activity size={13} className="text-amber-400" />
                                            1. Institutional Reality & Meaning
                                        </div>
                                        <p className="text-xs text-slate-200 leading-relaxed bg-[#0d1117]/60 p-2.5 rounded-lg border border-slate-800/60">
                                            {concept.institutionalMeaning}
                                        </p>
                                    </div>

                                    {/* Section 2: Mathematical Condition */}
                                    <div>
                                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                                            <SlidersHorizontal size={13} className="text-cyan-400" />
                                            2. Mathematical Logic & Filter Triggers
                                        </div>
                                        <div className="bg-[#090d13] p-2.5 rounded-lg border border-[#30363d] font-mono text-[11px] text-amber-200/90 leading-relaxed overflow-x-auto">
                                            <code className="break-words whitespace-pre-wrap">{concept.mathFormula}</code>
                                        </div>
                                    </div>

                                    {/* Section 3: Next-Day Action Plan */}
                                    <div>
                                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                                            <Target size={13} className="text-emerald-400" />
                                            3. Next-Day Execution Plan (Day T+1)
                                        </div>
                                        <div className="bg-emerald-950/20 border border-emerald-800/40 p-2.5 rounded-lg text-xs text-emerald-200 leading-relaxed flex items-start gap-2">
                                            <CheckCircle2
                                                size={14}
                                                className="text-emerald-400 flex-shrink-0 mt-0.5"
                                            />
                                            <span>{concept.nextDayAction}</span>
                                        </div>
                                    </div>

                                    {/* Section 4: 12-Year Empirical Edge */}
                                    <div>
                                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                                            <Sparkles size={13} className="text-purple-400" />
                                            4. 12-Year Empirical Edge (2014–2026 Backtest)
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                            <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-center">
                                                <div className="text-[10px] text-slate-500 uppercase font-medium">
                                                    Win Rate
                                                </div>
                                                <div className="text-xs font-bold font-mono text-emerald-400 mt-0.5">
                                                    {concept.empiricalEdge.winRate}
                                                </div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-center">
                                                <div className="text-[10px] text-slate-500 uppercase font-medium">
                                                    Profit Factor
                                                </div>
                                                <div className="text-xs font-bold font-mono text-cyan-300 mt-0.5">
                                                    {concept.empiricalEdge.profitFactor.toFixed(2)}
                                                </div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-center">
                                                <div className="text-[10px] text-slate-500 uppercase font-medium">
                                                    Drawdown Noise
                                                </div>
                                                <div className="text-xs font-bold font-mono text-amber-300 mt-0.5">
                                                    {concept.empiricalEdge.medMae}
                                                </div>
                                            </div>
                                            <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 text-center">
                                                <div className="text-[10px] text-slate-500 uppercase font-medium">
                                                    Suggested Stop
                                                </div>
                                                <div className="text-xs font-bold font-mono text-slate-200 mt-0.5">
                                                    {concept.suggestedStop}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}

                    {/* First-Principles Footer Note */}
                    <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400 space-y-2 mt-4">
                        <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                            <Compass size={14} className="text-blue-400" />
                            Why First-Principles Breadth Beats Lagging Indicators
                        </div>
                        <p className="text-[11px] leading-relaxed">
                            Traditional oscillators (RSI, MACD) evaluate single price series in isolation.
                            First-principles breadth measures the <strong>aggregate participation of every underlying stock</strong> in a sector.
                            When 70%+ of a sector&apos;s stocks are advancing and rotating into Leading RRG status, individual breakout failures drop by over 50%.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
