// lib/ipoTiers.ts
// Centralized registry for IPO listing age tiers, market cycle descriptions, and filtering utilities.

import type { ConstituentPerformance } from "@/types";

export type IpoTierId = "day1" | "fresh" | "recent" | "m1_3" | "m3_6" | "m6_12" | "seasoned";

export interface IpoTierConfig {
    id: IpoTierId;
    label: string;
    badgeTag: string;
    description: string;
    minDays: number;
    maxDays: number;
    // Tailwind classes for badges
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
}

export const IPO_TIERS: Record<Exclude<IpoTierId, "seasoned">, IpoTierConfig> = {
    day1: {
        id: "day1",
        label: "IPO Day 1",
        badgeTag: "Day 1",
        description: "Debut listing session & maximum volatility",
        minDays: 1,
        maxDays: 1,
        badgeBg: "bg-rose-950/80",
        badgeText: "text-rose-300",
        badgeBorder: "border-rose-800/60",
    },
    fresh: {
        id: "fresh",
        label: "Fresh Debut",
        badgeTag: "2 – 15d",
        description: "Opening price discovery & debut flow",
        minDays: 2,
        maxDays: 15,
        badgeBg: "bg-purple-950/80",
        badgeText: "text-purple-300",
        badgeBorder: "border-purple-800/60",
    },
    recent: {
        id: "recent",
        label: "Recent Listings",
        badgeTag: "16 – 30d",
        description: "Initial base consolidations (e.g. IPO 18d)",
        minDays: 16,
        maxDays: 30,
        badgeBg: "bg-indigo-950/80",
        badgeText: "text-indigo-300",
        badgeBorder: "border-indigo-800/60",
    },
    m1_3: {
        id: "m1_3",
        label: "1 – 3 Months",
        badgeTag: "31 – 90d",
        description: "First earnings cycle & post-listing base",
        minDays: 31,
        maxDays: 90,
        badgeBg: "bg-cyan-950/80",
        badgeText: "text-cyan-300",
        badgeBorder: "border-cyan-800/60",
    },
    m3_6: {
        id: "m3_6",
        label: "3 – 6 Months",
        badgeTag: "91 – 180d",
        description: "Secondary breakouts & lockup absorption",
        minDays: 91,
        maxDays: 180,
        badgeBg: "bg-emerald-950/80",
        badgeText: "text-emerald-300",
        badgeBorder: "border-emerald-800/60",
    },
    m6_12: {
        id: "m6_12",
        label: "6 – 12 Months",
        badgeTag: "181 – 365d",
        description: "Institutional accumulation & Stage-2 leaders",
        minDays: 181,
        maxDays: 252, // In NSE trading days, ~252 sessions corresponds to 1 calendar year (365d)
        badgeBg: "bg-teal-950/80",
        badgeText: "text-teal-300",
        badgeBorder: "border-teal-800/60",
    },
};

export const SEASONED_TIER_CONFIG: IpoTierConfig = {
    id: "seasoned",
    label: "Include Seasoned Stocks (> 365d)",
    badgeTag: "> 1 Year",
    description: "Established equities with mature market history",
    minDays: 253,
    maxDays: Infinity,
    badgeBg: "bg-slate-800/80",
    badgeText: "text-slate-300",
    badgeBorder: "border-slate-700/60",
};

export const IPO_TIER_ORDER: Exclude<IpoTierId, "seasoned">[] = [
    "day1",
    "fresh",
    "recent",
    "m1_3",
    "m3_6",
    "m6_12",
];

export const DEFAULT_IPO_TIERS: Record<IpoTierId, boolean> = {
    day1: true,
    fresh: true,
    recent: true,
    m1_3: true,
    m3_6: true,
    m6_12: true,
    seasoned: true,
};

/**
 * Returns the corresponding IPO tier config for a stock based on listing days and IPO status.
 * Returns null for seasoned stocks (> 252 trading days or is_ipo === false).
 */
export function getIpoTier(listingDays?: number | null, isIpo?: boolean): IpoTierConfig | null {
    if (listingDays === undefined || listingDays === null || isIpo === false || listingDays >= 253) {
        return null; // Seasoned stock
    }
    if (listingDays <= 1) return IPO_TIERS.day1;
    if (listingDays <= 15) return IPO_TIERS.fresh;
    if (listingDays <= 30) return IPO_TIERS.recent;
    if (listingDays <= 90) return IPO_TIERS.m1_3;
    if (listingDays <= 180) return IPO_TIERS.m3_6;
    return IPO_TIERS.m6_12;
}

/**
 * Tests whether a stock's listing days matches the user's active IPO tier selection.
 */
export function matchesIpoTiers(
    stockPerf: ConstituentPerformance | null | undefined,
    activeTiers: Record<IpoTierId, boolean>
): boolean {
    if (!stockPerf) return Boolean(activeTiers.seasoned);

    const days = stockPerf.listing_days;
    const isIpo = stockPerf.is_ipo;

    // Seasoned equity
    if (days === undefined || days === null || isIpo === false || days >= 253) {
        return Boolean(activeTiers.seasoned);
    }

    if (days <= 1) return Boolean(activeTiers.day1);
    if (days <= 15) return Boolean(activeTiers.fresh);
    if (days <= 30) return Boolean(activeTiers.recent);
    if (days <= 90) return Boolean(activeTiers.m1_3);
    if (days <= 180) return Boolean(activeTiers.m3_6);
    return Boolean(activeTiers.m6_12);
}

/**
 * Generates badge styling and descriptive metadata for table cells.
 */
export function getIpoBadgeStyle(days?: number | null, isIpo?: boolean): {
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    label: string;
    tooltip: string;
} | null {
    const tier = getIpoTier(days, isIpo);
    if (!tier) return null;

    const daysLabel = days ? `${days}D` : "IPO";
    return {
        badgeBg: tier.badgeBg,
        badgeText: tier.badgeText,
        badgeBorder: tier.badgeBorder,
        label: `IPO ${daysLabel}`,
        tooltip: `Listed ${days ? `${days} trading days ago` : "recently"} • ${tier.label}: ${tier.description}`,
    };
}
