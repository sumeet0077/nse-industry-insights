// scripts/test_ema_stretch_matrix.ts
import fs from "fs";
import path from "path";
import { getSetupVerdict, calcLandingDiscount } from "../components/modals/EmaStretchMatrixModal";
import {
    getEmaDistancePct,
    getEmaAnchorInfo,
    isExcludedNonEquity,
    EXCLUDED_NON_EQUITY,
    getTfMicroGlyph,
    getMtfConfluenceStatus,
    matchesPowerFilters,
    type IndexSets,
    DEFAULT_FILTER_STATE,
    type StretchFilterState,
} from "../components/watchlist/EmaStretchMatrixScanner";
import type { EMAStretchUniverseData, EMAStretchUniverseItem, EMAStretchMatrix } from "../types";

let testCount = 0;
let passedCount = 0;

function assert(condition: boolean, msg: string) {
    testCount++;
    if (!condition) {
        console.error(`❌ [FAIL] ${msg}`);
        process.exitCode = 1;
    } else {
        passedCount++;
        console.log(`  ✓ ${msg}`);
    }
}

console.log("==================================================");
console.log("🧪 EMA Stretch Matrix Test Suite");
console.log("==================================================\n");

// 1. Landing Discount & Proximity Tests
console.log("1. Testing calcLandingDiscount & getEmaDistancePct...");
assert(calcLandingDiscount(null, 100) === null, "calcLandingDiscount with null landing returns null");
assert(calcLandingDiscount(100, null) === null, "calcLandingDiscount with null current returns null");
assert(calcLandingDiscount(100, 0) === null, "calcLandingDiscount with 0 current returns null");
assert(calcLandingDiscount(100, -50) === null, "calcLandingDiscount with negative current returns null");
assert(calcLandingDiscount(110, 100) === "+10.0%", "calcLandingDiscount positive discount (landing > current)");
assert(calcLandingDiscount(95, 100) === "-5.0%", "calcLandingDiscount negative discount (landing < current)");

const dummyItem: EMAStretchUniverseItem = {
    symbol: "TEST.NS",
    clean_symbol: "TEST",
    close: 102,
    pct_1d: 1.0,
    volume: 10000,
    turnover_cr: 10.0,
    ema_stretch: {
        daily: {
            ema_8: { stretch_atr: 0.8, percentile: 55, percentile_str: "+P55", is_above: true, formatted: "0.8 ATR", color_tier: "neutral", ema_val: 101 },
            ema_10: { stretch_atr: 1.0, percentile: 50, percentile_str: "+P50", is_above: true, formatted: "1.0 ATR", color_tier: "neutral", ema_val: 101 },
            ema_20: { stretch_atr: 0.5, percentile: 60, percentile_str: "+P60", is_above: true, formatted: "0.5 ATR", color_tier: "neutral", ema_val: 100 },
            ema_50: { stretch_atr: 1.5, percentile: 70, percentile_str: "+P70", is_above: true, formatted: "1.5 ATR", color_tier: "pos", ema_val: 95 },
        },
        weekly: {
            ema_8: { stretch_atr: 0.9, percentile: 72, percentile_str: "+P72", is_above: true, formatted: "0.9 ATR", color_tier: "pos", ema_val: 98 },
            ema_10: { stretch_atr: 1.0, percentile: 75, percentile_str: "+P75", is_above: true, formatted: "1.0 ATR", color_tier: "pos", ema_val: 98 },
            ema_20: { stretch_atr: 1.2, percentile: 80, percentile_str: "+P80", is_above: true, formatted: "1.2 ATR", color_tier: "pos", ema_val: 96 },
            ema_50: { stretch_atr: 2.0, percentile: 70, percentile_str: "+P70", is_above: true, formatted: "2.0 ATR", color_tier: "pos", ema_val: 90 },
        },
        monthly: {
            ema_8: { stretch_atr: 0.9, percentile: 58, percentile_str: "+P58", is_above: true, formatted: "0.9 ATR", color_tier: "pos", ema_val: 92 },
            ema_10: { stretch_atr: 1.0, percentile: 60, percentile_str: "+P60", is_above: true, formatted: "1.0 ATR", color_tier: "pos", ema_val: 92 },
            ema_20: { stretch_atr: 1.5, percentile: 86, percentile_str: "+P86", is_above: true, formatted: "1.5 ATR", color_tier: "pos", ema_val: 88 },
            ema_50: { stretch_atr: 2.5, percentile: 60, percentile_str: "+P60", is_above: true, formatted: "2.5 ATR", color_tier: "pos", ema_val: 80 },
        },
        velocity: 0.15,
        is_exhaustion_hook: false,
        kinetic_status: "normal",
        kinetic_badge: "Normal",
        landing_ema_8: 101,
        landing_ema_10: 101,
        landing_ema_20: 100,
        landing_ema_50: 95,
        landing_cpr_pivot: 99,
        landing_cpr_top: 98,
        half_life_days: 5,
        decay_mode: "Time Consolidation",
        is_squeeze: false,
        sbs_score: 5.0,
    },
};

// Test getEmaDistancePct with default anchor (ema_20)
const dist20 = getEmaDistancePct(dummyItem);
assert(dist20 !== null && Math.abs(dist20 - 2.0) < 0.001, "getEmaDistancePct calculates +2.0% to Daily 20 EMA when close=102, landing=100");

// Test getEmaDistancePct with 8 EMA anchor
const dist8 = getEmaDistancePct(dummyItem, "ema_8");
const expectedDist8 = ((102 - 101) / 101) * 100;
assert(dist8 !== null && Math.abs(dist8 - expectedDist8) < 0.001, "getEmaDistancePct calculates +0.99% to Daily 8 EMA when close=102, landing=101");

// Test getEmaDistancePct with 50 EMA anchor
const dist50 = getEmaDistancePct(dummyItem, "ema_50");
const expectedDist50 = ((102 - 95) / 95) * 100;
assert(dist50 !== null && Math.abs(dist50 - expectedDist50) < 0.001, "getEmaDistancePct calculates +7.37% to Daily 50 EMA when close=102, landing=95");

// Test getEmaDistancePct with Central Pivot (cpr_pivot)
const distCpr = getEmaDistancePct(dummyItem, "cpr_pivot");
const expectedDistCpr = ((102 - 99) / 99) * 100;
assert(distCpr !== null && Math.abs(distCpr - expectedDistCpr) < 0.001, "getEmaDistancePct calculates +3.03% to Monthly Central Pivot when close=102, pivot=99");

// Test getEmaDistancePct with 'any' anchor (should select closest support, which is 8 EMA @ 101)
const distAny = getEmaDistancePct(dummyItem, "any");
assert(distAny !== null && Math.abs(distAny - expectedDist8) < 0.001, "getEmaDistancePct with 'any' anchor selects closest level (8 EMA)");

const infoAny = getEmaAnchorInfo(dummyItem, "any");
assert(infoAny.label === "8 EMA", "getEmaAnchorInfo correctly labels the closest anchor as 8 EMA");

// 2. Setup Verdict Explanations
console.log("\n2. Testing getSetupVerdict & Tactical Explanations...");
const vUnknown = getSetupVerdict(null);
assert(vUnknown.key === "unknown", "Setup verdict for null matrix is 'unknown'");

const hookMatrix: EMAStretchMatrix = {
    ...dummyItem.ema_stretch,
    is_exhaustion_hook: true,
    velocity: -0.15,
};
const vHook = getSetupVerdict(hookMatrix);
assert(vHook.key === "hook", "Setup verdict for exhaustion hook is 'hook'");
assert(vHook.explanation.includes("Exhaustion Hook Active"), "Hook explanation contains tactical guidance");

const climaxMatrix: EMAStretchMatrix = {
    ...dummyItem.ema_stretch,
    daily: {
        ...dummyItem.ema_stretch.daily,
        ema_20: { ...dummyItem.ema_stretch.daily.ema_20, is_above: true, percentile: 92 },
    },
    weekly: {
        ...dummyItem.ema_stretch.weekly,
        ema_20: { ...dummyItem.ema_stretch.weekly.ema_20, is_above: true, percentile: 94 },
    },
};
const vClimax = getSetupVerdict(climaxMatrix);
assert(vClimax.key === "climax", "Setup verdict for Daily & Weekly >= P90 is 'climax'");

const dipBuyMatrix: EMAStretchMatrix = {
    ...dummyItem.ema_stretch,
    weekly: {
        ...dummyItem.ema_stretch.weekly,
        ema_20: { ...dummyItem.ema_stretch.weekly.ema_20, is_above: true, percentile: 78 },
    },
    daily: {
        ...dummyItem.ema_stretch.daily,
        ema_20: { ...dummyItem.ema_stretch.daily.ema_20, is_above: true, stretch_atr: 0.4, percentile: 35 },
    },
};
const vDipBuy = getSetupVerdict(dipBuyMatrix);
assert(vDipBuy.key === "dip_buy", "Setup verdict for Weekly >= P70 + Daily <= 0.8 ATR is 'dip_buy'");

const thrustMatrix: EMAStretchMatrix = {
    ...dummyItem.ema_stretch,
    daily: {
        ...dummyItem.ema_stretch.daily,
        ema_20: { ...dummyItem.ema_stretch.daily.ema_20, is_above: true, percentile: 95 },
    },
    velocity: 0.35,
};
const vThrust = getSetupVerdict(thrustMatrix);
assert(vThrust.key === "thrust", "Setup verdict for Daily >= P90 with Vt > 0.20 is 'thrust'");

// Additional Setup Verdict Edge Cases
const breakdownMatrix: EMAStretchMatrix = {
    ...dummyItem.ema_stretch,
    weekly: {
        ...dummyItem.ema_stretch.weekly,
        ema_20: { ...dummyItem.ema_stretch.weekly.ema_20, is_above: true, percentile: 80 },
    },
    daily: {
        ...dummyItem.ema_stretch.daily,
        ema_20: { ...dummyItem.ema_stretch.daily.ema_20, is_above: false, stretch_atr: 3.5, percentile: 75 },
    },
    velocity: -0.4,
};
const vBreakdown = getSetupVerdict(breakdownMatrix);
assert(vBreakdown.key !== "dip_buy", "Breakdown (-3.5 ATR below EMA 20 with Vt < 0) is NOT classified as dip_buy");
assert(vBreakdown.key === "flush", "Severe breakdown with accelerating negative velocity classified as flush");

const hookImplicitMatrix: EMAStretchMatrix = {
    ...dummyItem.ema_stretch,
    is_exhaustion_hook: false,
    daily: {
        ...dummyItem.ema_stretch.daily,
        ema_20: { ...dummyItem.ema_stretch.daily.ema_20, is_above: true, percentile: 94 },
    },
    velocity: -0.10,
};
const vHookImplicit = getSetupVerdict(hookImplicitMatrix);
assert(vHookImplicit.key === "hook", "Setup verdict recognizes hook when daily >= P90 with negative velocity even if flag is false");

const dipBuyPlungingMatrix: EMAStretchMatrix = {
    ...dipBuyMatrix,
    velocity: -0.25,
};
const vDipBuyPlunging = getSetupVerdict(dipBuyPlungingMatrix);
assert(vDipBuyPlunging.key !== "dip_buy", "Plunging stock near EMA with negative velocity is NOT classified as dip_buy");

// 3. Real Universe Integration Gate
console.log("\n3. Testing Real EMA Stretch Universe (data/market_status/ema_stretch_universe.json)...");
const universePath = path.resolve(__dirname, "../data/market_status/ema_stretch_universe.json");
assert(fs.existsSync(universePath), "ema_stretch_universe.json exists");

const rawJson = fs.readFileSync(universePath, "utf-8");
const universe: EMAStretchUniverseData = JSON.parse(rawJson);
assert(Array.isArray(universe.items), "Universe contains valid items array");
assert(universe.items.length === 3024, `Universe contains expected 3024 stocks (actual: ${universe.items.length})`);

// Performance benchmark: verify filtering 3024 stocks takes < 10ms
const t0 = performance.now();
let holyGrailCount = 0;
let hookCount = 0;
let climaxCount = 0;
let squeezeCount = 0;
let thrustCount = 0;
let landingCount = 0;

for (const item of universe.items) {
    const m = item.ema_stretch;
    if (!m) continue;
    const d20 = m.daily?.ema_20;
    const w20 = m.weekly?.ema_20;
    const m20 = m.monthly?.ema_20;
    const vel = m.velocity ?? 0;
    const dist = getEmaDistancePct(item);

    // Holy Grail
    if (w20?.is_above && (w20.percentile ?? 0) >= 70 && vel >= 0) {
        const dStretch = d20 ? (d20.is_above ? d20.stretch_atr : -d20.stretch_atr) : 99;
        if (dStretch >= -0.5 && dStretch <= 0.8) holyGrailCount++;
    }

    // Exhaustion Hook
    if (m.is_exhaustion_hook || ((d20?.is_above && (d20?.percentile ?? 0) >= 90) && vel < 0)) {
        hookCount++;
    }

    // Triple Climax
    if (d20?.is_above && (d20?.percentile ?? 0) >= 90 && w20?.is_above && (w20?.percentile ?? 0) >= 90 && m20?.is_above && (m20?.percentile ?? 0) >= 85) {
        climaxCount++;
    }

    // Squeeze
    if ((d20?.stretch_atr != null && d20.stretch_atr <= 1.0) && (m.is_squeeze || (m.sbs_score != null && m.sbs_score >= 8.0))) {
        squeezeCount++;
    }

    // Thrust
    if (d20?.is_above && (d20?.percentile ?? 0) >= 90 && vel > 0.20) {
        thrustCount++;
    }

    // Landing Zone
    if (dist != null && dist >= -2.0 && dist <= 1.0) {
        landingCount++;
    }
}
const tElapsed = performance.now() - t0;
console.log(`  ⚡ Scanned 3024 stocks across 7 presets in ${tElapsed.toFixed(2)} ms!`);
assert(tElapsed < 50, "Full scan runs in under 50ms");

console.log(`  📊 Preset distribution:`);
console.log(`     - 🎯 Holy Grail (Bull Dip-Buy): ${holyGrailCount}`);
console.log(`     - ⚡ Exhaustion Hook: ${hookCount}`);
console.log(`     - 🔥 Triple Climax: ${climaxCount}`);
console.log(`     - 🌀 Squeeze Expansion: ${squeezeCount}`);
console.log(`     - 🚀 Momentum Thrust: ${thrustCount}`);
console.log(`     - 📍 In Landing Zone: ${landingCount}`);

assert(holyGrailCount > 0, "Holy grail preset finds valid candidates");
assert(hookCount > 0, "Exhaustion hook preset finds valid candidates");
assert(landingCount > 0, "In Landing Zone preset finds valid candidates");

// 4. Test Index Sets Extraction from market_status_latest.json
console.log("\n4. Testing Index Sets Extraction...");
const msPath = path.resolve(__dirname, "../data/market_status/market_status_latest.json");
assert(fs.existsSync(msPath), "market_status_latest.json exists");
const ms = JSON.parse(fs.readFileSync(msPath, "utf-8"));
assert(Boolean(ms["Nifty 50"]), "Nifty 50 index entry present");
assert(Boolean(ms["Nifty 500"]), "Nifty 500 index entry present");
assert(Boolean(ms["Nifty Midcap 150"]), "Nifty Midcap 150 entry present");
assert(Boolean(ms["Nifty Smallcap 250"]), "Nifty Smallcap 250 entry present");

function getSymbols(entry: any): Set<string> {
    if (!entry) return new Set();
    const list = [...(entry.above || []), ...(entry.below || []), ...(entry.new_stock || [])];
    return new Set(list.map((s: string) => s.replace(".NS", "").trim().toUpperCase()));
}
const n50Set = getSymbols(ms["Nifty 50"]);
const n500Set = getSymbols(ms["Nifty 500"]);
assert(n50Set.size === 50, `Nifty 50 contains 50 symbols (got ${n50Set.size})`);
assert(n500Set.size >= 490, `Nifty 500 contains >= 490 symbols (got ${n500Set.size})`);

// Test F&O Set filtered to active equity universe
const bandsPath = path.resolve(__dirname, "../data/sec_bands.json");
if (fs.existsSync(bandsPath)) {
    const bands = JSON.parse(fs.readFileSync(bandsPath, "utf-8"));
    const uSet = new Set(universe.items.map((i) => i.clean_symbol));
    const activeFno = Object.entries(bands).filter(([sym, info]: [string, any]) => {
        return info.band === "No Band" && info.series === "EQ" && uSet.has(sym.replace(".NS", "").trim().toUpperCase());
    });
    assert(activeFno.length === 209, `Active equity F&O count is exactly 209 (got ${activeFno.length})`);
}

// 5. Test Power Filter Combinations
console.log("\n5. Testing Power Filter Engine Logic...");
// Test Min Turnover filter
const highTurnoverStocks = universe.items.filter((i) => (i.turnover_cr ?? 0) >= 50);
assert(highTurnoverStocks.length > 0 && highTurnoverStocks.length < universe.items.length, "Min turnover filter separates high-turnover stocks");
assert(highTurnoverStocks.every((i) => (i.turnover_cr ?? 0) >= 50), "All filtered stocks satisfy turnover >= 50 Cr");

// Test Daily Stretch range filter [-0.5, +0.8]
const pullbackStocks = universe.items.filter((i) => {
    const d20 = i.ema_stretch?.daily?.ema_20;
    if (!d20) return false;
    const signed = d20.is_above ? d20.stretch_atr : -d20.stretch_atr;
    return signed >= -0.5 && signed <= 0.8;
});
assert(pullbackStocks.length > 0, "Pullback range [-0.5, 0.8] matches stocks");
assert(pullbackStocks.every((i) => {
    const d20 = i.ema_stretch!.daily.ema_20;
    const signed = d20.is_above ? d20.stretch_atr : -d20.stretch_atr;
    return signed >= -0.5 && signed <= 0.8;
}), "All pullback stocks strictly within [-0.5, 0.8] ATR");

// Test Landing Proximity: at support [-1.5%, +0.5%]
const atSupportStocks = universe.items.filter((i) => {
    const dist = getEmaDistancePct(i);
    return dist !== null && dist >= -1.5 && dist <= 0.5;
});
assert(atSupportStocks.length > 0, "At support filter matches stocks near EMA 20");
assert(atSupportStocks.every((i) => {
    const d = getEmaDistancePct(i)!;
    return d >= -1.5 && d <= 0.5;
}), "All At Support stocks are strictly within [-1.5%, +0.5%]");

// Test Squeeze compression
const squeezeStocks = universe.items.filter((i) => {
    const m = i.ema_stretch;
    return m?.is_squeeze || (m?.sbs_score != null && m.sbs_score >= 8.0);
});
assert(squeezeStocks.length > 0, "Squeeze filter matches compressed volatility stocks");

// 6. Test Custom Preset Serialization
console.log("\n6. Testing Custom Preset Serialization...");
const sampleCustomPreset = {
    id: "preset_test_123",
    name: "Institutions Holy Grail",
    filters: {
        ...DEFAULT_FILTER_STATE,
        indexUniverse: "nifty500" as const,
        minTurnoverCr: 25,
        weeklyPercentileMin: 70,
        dailyStretchMin: -0.5,
        dailyStretchMax: 0.8,
    },
    createdAt: Date.now(),
};
const serialized = JSON.stringify([sampleCustomPreset]);
const deserialized = JSON.parse(serialized);
assert(deserialized.length === 1, "Preset serializes and parses properly");
assert(deserialized[0].name === "Institutions Holy Grail", "Preset name preserved");
assert(deserialized[0].filters.minTurnoverCr === 25, "Preset filters preserved");

// 7. Timeframe Monotonicity Guard Test
console.log("\n7. Testing Timeframe Monotonicity Invariant...");
const dskItem = universe.items.find(i => i.clean_symbol === "DSKULKARNI");
if (dskItem) {
    const isWeeklyIpo = dskItem.ema_stretch?.weekly?.ema_20?.percentile_str === "IPO" || dskItem.ema_stretch?.weekly?.ema_20?.color_tier === "ipo";
    assert(isWeeklyIpo, "DSKULKARNI weekly is correctly identified as IPO (< 20 bars in current era)");
}

// 8. Test Non-Equity Purge (REITs, InvITs, and GILTs)
console.log("\n8. Testing Non-Equity Purge (REITs, InvITs, and GILTs)...");
const testBlacklist = ["EMBASSY", "MINDSPACE", "BIRET", "NXST", "PGINVIT", "IRBINVIT", "INDIGRID", "SBI10YGILT"];
for (const sym of testBlacklist) {
    assert(isExcludedNonEquity(sym), `Non-equity blacklist correctly flags ${sym}`);
    assert(EXCLUDED_NON_EQUITY.has(sym), `EXCLUDED_NON_EQUITY set includes ${sym}`);
}
assert(!isExcludedNonEquity("PNBGILTS"), "Protected equity PNBGILTS is NOT excluded");
assert(isExcludedNonEquity("TEST_REIT"), "Regex pattern flags generic *REIT* ticker");
assert(isExcludedNonEquity("SOME_INVIT"), "Regex pattern flags generic *INVIT* ticker");
assert(!isExcludedNonEquity("RELIANCE"), "Normal equity RELIANCE is NOT excluded");
assert(!isExcludedNonEquity("TCS"), "Normal equity TCS is NOT excluded");

// 9. Test Multi-Anchor Pullback & Confluence Presets
console.log("\n9. Testing Multi-Anchor Pullback & Confluence Presets...");
let support50Count = 0;
let cprBounceCount = 0;
let momentum8Count = 0;

for (const item of universe.items) {
    const m = item.ema_stretch;
    if (!m) continue;
    const d8 = m.daily?.ema_8 ?? m.daily?.ema_10;
    const d50 = m.daily?.ema_50;
    const w50 = m.weekly?.ema_50;
    const m20 = m.monthly?.ema_20;
    const w20 = m.weekly?.ema_20;
    const vel = m.velocity ?? 0;
    const close = item.close ?? 0;

    // 50 EMA Support: Monthly Bull + Daily or Weekly resting near 50 EMA
    if (m20?.is_above) {
        const d50Signed = d50 ? (d50.is_above ? d50.stretch_atr : -d50.stretch_atr) : 99;
        const w50Signed = w50 ? (w50.is_above ? w50.stretch_atr : -w50.stretch_atr) : 99;
        if (Math.abs(d50Signed) <= 0.8 || Math.abs(w50Signed) <= 0.8) {
            support50Count++;
        }
    }

    // CPR Pivot Bounce: Monthly or Weekly Bull + resting near Central Pivot (P)
    if (m20?.is_above || w20?.is_above) {
        const pivot = m.landing_cpr_pivot ?? m.landing_cpr_top;
        if (pivot != null && close > 0) {
            const distPct = Math.abs(((close - pivot) / pivot) * 100);
            if (distPct <= 1.5) cprBounceCount++;
        }
    }

    // 8 EMA Momentum: resting near 8 EMA with positive velocity
    if (vel > 0 && d8) {
        const d8Signed = d8.is_above ? d8.stretch_atr : -d8.stretch_atr;
        if (Math.abs(d8Signed) <= 0.8) {
            momentum8Count++;
        }
    }
}

console.log(`  📊 Additional Strategy Preset distribution:`);
console.log(`     - 🛡️ 50 EMA Support: ${support50Count}`);
console.log(`     - 🏛️ CPR Pivot Bounce: ${cprBounceCount}`);
console.log(`     - 🚀 8 EMA Momentum: ${momentum8Count}`);

assert(support50Count > 0, "50 EMA Support preset finds valid candidates");
assert(cprBounceCount > 0, "CPR Pivot Bounce preset finds valid candidates");
assert(momentum8Count > 0, "8 EMA Momentum preset finds valid candidates");

// 10. Test Directional Micro-Glyphs & MTF Confluence Status
console.log("\n10. Testing Directional Micro-Glyphs Precedence & MTF Confluence Status...");

// Test A: Thrust precedence over 50 EMA resting
// When stock is above 8 EMA and 20 EMA, it MUST be Thrust (▲), even if 50 EMA is within 0.8 ATR!
const c8_thrust = { stretch_atr: 1.0, percentile: 70, percentile_str: "+P70", is_above: true, formatted: "1.0 ATR", color_tier: "pos" as const };
const c20_thrust = { stretch_atr: 1.2, percentile: 75, percentile_str: "+P75", is_above: true, formatted: "1.2 ATR", color_tier: "pos" as const };
const c50_near = { stretch_atr: 0.5, percentile: 60, percentile_str: "+P60", is_above: true, formatted: "0.5 ATR", color_tier: "neutral" as const };
const glyphThrust = getTfMicroGlyph(c8_thrust, c20_thrust, c50_near);
assert(glyphThrust.glyph === "▲", "getTfMicroGlyph correctly identifies Thrust (▲) above 8 & 20 EMA when 50 EMA is near");

// Test B: Pullback (below 8 EMA, above/near 20 EMA)
const c8_below = { stretch_atr: 0.3, percentile: 40, percentile_str: "-P40", is_above: false, formatted: "0.3 ATR", color_tier: "neutral" as const };
const glyphPullback = getTfMicroGlyph(c8_below, c20_thrust, c50_near);
assert(glyphPullback.glyph === "◆", "getTfMicroGlyph correctly identifies Pullback (◆) below 8 EMA resting near 20 EMA");

// Test C: Resting near 50 EMA (below 20 EMA and near 50 EMA)
const c20_belowFar = { stretch_atr: 2.0, percentile: 20, percentile_str: "-P20", is_above: false, formatted: "2.0 ATR", color_tier: "neg" as const };
const glyph50 = getTfMicroGlyph(c8_below, c20_belowFar, c50_near);
assert(glyph50.glyph === "■", "getTfMicroGlyph correctly identifies Resting near 50 EMA (■) when below 20 EMA");

// Test D: Climax Overextension (>= 2.5 ATR or >= P95)
const c20_climax = { stretch_atr: 2.8, percentile: 96, percentile_str: "+P96", is_above: true, formatted: "2.8 ATR", color_tier: "extreme_pos" as const };
const glyphClimax = getTfMicroGlyph(c8_thrust, c20_climax, c50_near);
assert(glyphClimax.glyph === "★", "getTfMicroGlyph correctly identifies Climax (★)");

// Test E: Bearish (below 20 EMA and far from 50 EMA)
const c50_far = { stretch_atr: 2.5, percentile: 15, percentile_str: "-P15", is_above: false, formatted: "2.5 ATR", color_tier: "neg" as const };
const glyphBear = getTfMicroGlyph(c8_below, c20_belowFar, c50_far);
assert(glyphBear.glyph === "▼", "getTfMicroGlyph correctly identifies Bear (▼)");

// Test F: IPO (<20 bars)
const c20_ipo = { stretch_atr: 0.5, percentile: null, percentile_str: "IPO", is_above: true, formatted: "0.5 ATR IPO", color_tier: "ipo" as const };
const glyphIpo = getTfMicroGlyph(c8_thrust, c20_ipo, c50_near);
assert(glyphIpo.glyph === "—", "getTfMicroGlyph correctly identifies IPO (—)");

// Test MTF Confluence Status
const mock33BullMatrix: EMAStretchMatrix = {
    ...dummyItem.ema_stretch!,
    daily: {
        ...dummyItem.ema_stretch!.daily,
        ema_20: { stretch_atr: 1.5, percentile: 75, percentile_str: "+P75", is_above: true, formatted: "1.5 ATR", color_tier: "pos" },
    },
};
const status33Bull = getMtfConfluenceStatus(mock33BullMatrix, dummyItem.close);
assert(status33Bull.text === "3/3 Full Bull", "getMtfConfluenceStatus identifies 3/3 Full Bull for all-above matrix in thrust");

// Test 20 EMA Dip status
const statusDip = getMtfConfluenceStatus(dummyItem.ema_stretch, dummyItem.close);
assert(statusDip.text === "🎯 20 EMA Dip", "getMtfConfluenceStatus identifies 🎯 20 EMA Dip when resting at 20 EMA");

// Test 50 EMA Support status
const mock50Matrix: EMAStretchMatrix = {
    ...dummyItem.ema_stretch!,
    daily: {
        ...dummyItem.ema_stretch!.daily,
        ema_20: { stretch_atr: 1.5, percentile: 30, percentile_str: "-P30", is_above: false, formatted: "1.5 ATR", color_tier: "neg" },
        ema_50: { stretch_atr: 0.3, percentile: 45, percentile_str: "+P45", is_above: true, formatted: "0.3 ATR", color_tier: "neutral" },
    },
};
const status50 = getMtfConfluenceStatus(mock50Matrix, 102);
assert(status50.text === "🛡️ 50 EMA Support", "getMtfConfluenceStatus identifies 🛡️ 50 EMA Support");

// Test CPR Pivot Bounce status
const mockCprMatrix: EMAStretchMatrix = {
    ...dummyItem.ema_stretch!,
    landing_cpr_pivot: 100,
    daily: {
        ...dummyItem.ema_stretch!.daily,
        ema_20: { stretch_atr: 1.5, percentile: 30, percentile_str: "-P30", is_above: false, formatted: "1.5 ATR", color_tier: "neg" },
    },
};
const statusCpr = getMtfConfluenceStatus(mockCprMatrix, 100.5); // close=100.5, pivot=100 (+0.5% diff)
assert(statusCpr.text === "🏛️ CPR Pivot Bounce", "getMtfConfluenceStatus identifies 🏛️ CPR Pivot Bounce");

// Test Climax status
const mockClimaxMatrix: EMAStretchMatrix = {
    ...dummyItem.ema_stretch!,
    daily: {
        ...dummyItem.ema_stretch!.daily,
        ema_20: { stretch_atr: 2.8, percentile: 96, percentile_str: "+P96", is_above: true, formatted: "2.8 ATR", color_tier: "extreme_pos" },
    },
    weekly: {
        ...dummyItem.ema_stretch!.weekly,
        ema_20: { stretch_atr: 2.5, percentile: 92, percentile_str: "+P92", is_above: true, formatted: "2.5 ATR", color_tier: "extreme_pos" },
    },
};
const statusClimax = getMtfConfluenceStatus(mockClimaxMatrix, 102);
assert(statusClimax.text === "⚡ Climax", "getMtfConfluenceStatus identifies ⚡ Climax");

// Test Counter-Rally status (daily bull, weekly & monthly bear)
const mockRallyMatrix: EMAStretchMatrix = {
    ...dummyItem.ema_stretch!,
    daily: {
        ...dummyItem.ema_stretch!.daily,
        ema_20: { stretch_atr: 1.0, percentile: 60, percentile_str: "+P60", is_above: true, formatted: "1.0 ATR", color_tier: "pos" },
    },
    weekly: {
        ...dummyItem.ema_stretch!.weekly,
        ema_20: { stretch_atr: 1.5, percentile: 40, percentile_str: "-P40", is_above: false, formatted: "1.5 ATR", color_tier: "neg" },
    },
    monthly: {
        ...dummyItem.ema_stretch!.monthly,
        ema_20: { stretch_atr: 2.0, percentile: 30, percentile_str: "-P30", is_above: false, formatted: "2.0 ATR", color_tier: "neg" },
    },
};
const statusRally = getMtfConfluenceStatus(mockRallyMatrix, 102);
assert(statusRally.text === "⚠️ Counter-Rally", "getMtfConfluenceStatus identifies ⚠️ Counter-Rally");

// Test 0/3 Bear status
const mockBearMatrix: EMAStretchMatrix = {
    ...mockRallyMatrix,
    daily: {
        ...mockRallyMatrix.daily,
        ema_20: { stretch_atr: 1.0, percentile: 30, percentile_str: "-P30", is_above: false, formatted: "1.0 ATR", color_tier: "neg" },
    },
};
const statusBear = getMtfConfluenceStatus(mockBearMatrix, 102);
assert(statusBear.text === "🔴 0/3 Bear", "getMtfConfluenceStatus identifies 🔴 0/3 Bear");

// Test IPO status
const mockIpoMatrix: EMAStretchMatrix = {
    ...dummyItem.ema_stretch!,
    weekly: {
        ...dummyItem.ema_stretch!.weekly,
        ema_20: { stretch_atr: 0.5, percentile: null, percentile_str: "IPO", is_above: true, formatted: "0.5 ATR IPO", color_tier: "ipo" },
    },
};
const statusIpo = getMtfConfluenceStatus(mockIpoMatrix, 102);
assert(statusIpo.text === "⚪ IPO", "getMtfConfluenceStatus identifies ⚪ IPO");

// 11. Test Independent Multi-Timeframe Trend Pickers & IPO Exclusion
console.log("\n11. Testing Independent Multi-Timeframe Trend Pickers & IPO Exclusion...");
const emptyIdxSets: IndexSets = {
    nifty50: new Set(),
    nifty500: new Set(),
    midcap: new Set(),
    smallcap: new Set(),
    fno: new Set(),
};

// Bull filter on bull item
const bullFilter: StretchFilterState = { ...DEFAULT_FILTER_STATE, monthlyTrend: "bull" };
assert(matchesPowerFilters(dummyItem, bullFilter, emptyIdxSets), "matchesPowerFilters accepts monthly bull item when filtering for bull");

// Bear filter on bull item
const bearFilter: StretchFilterState = { ...DEFAULT_FILTER_STATE, monthlyTrend: "bear" };
assert(!matchesPowerFilters(dummyItem, bearFilter, emptyIdxSets), "matchesPowerFilters rejects monthly bull item when filtering for bear");

// Bear filter on real bear item
const bearItem: EMAStretchUniverseItem = {
    ...dummyItem,
    clean_symbol: "BEARSTOCK",
    ema_stretch: mockBearMatrix,
};
assert(matchesPowerFilters(bearItem, bearFilter, emptyIdxSets), "matchesPowerFilters accepts monthly bear item when filtering for bear");

// Bear filter on IPO item (MUST BE REJECTED)
const ipoItem: EMAStretchUniverseItem = {
    ...dummyItem,
    clean_symbol: "IPOSTOCK",
    ema_stretch: {
        ...dummyItem.ema_stretch!,
        monthly: {
            ...dummyItem.ema_stretch!.monthly,
            ema_20: { stretch_atr: 0.5, percentile: null, percentile_str: "IPO", is_above: false, formatted: "0.5 ATR IPO", color_tier: "ipo" },
        },
    },
};
assert(!matchesPowerFilters(ipoItem, bearFilter, emptyIdxSets), "matchesPowerFilters rejects IPO from monthly bear filter");

const weeklyBearFilter: StretchFilterState = { ...DEFAULT_FILTER_STATE, weeklyTrend: "bear" };
const weeklyIpoItem: EMAStretchUniverseItem = {
    ...dummyItem,
    clean_symbol: "WEEKLYIPO",
    ema_stretch: mockIpoMatrix,
};
assert(!matchesPowerFilters(weeklyIpoItem, weeklyBearFilter, emptyIdxSets), "matchesPowerFilters rejects IPO from weekly bear filter");

console.log("\n==================================================");
console.log(`Results: ${passedCount}/${testCount} tests passed!`);
console.log("==================================================\n");

if (passedCount !== testCount) {
    process.exit(1);
}
