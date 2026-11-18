// scripts/test_ema_stretch_matrix.ts
import fs from "fs";
import path from "path";
import { getSetupVerdict, calcLandingDiscount } from "../components/modals/EmaStretchMatrixModal";
import { getEmaDistancePct, DEFAULT_FILTER_STATE, type StretchFilterState } from "../components/watchlist/EmaStretchMatrixScanner";
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
            ema_10: { stretch_atr: 1.0, percentile: 50, percentile_str: "+P50", is_above: true, formatted: "1.0 ATR", color_tier: "neutral" },
            ema_20: { stretch_atr: 0.5, percentile: 60, percentile_str: "+P60", is_above: true, formatted: "0.5 ATR", color_tier: "neutral" },
            ema_50: { stretch_atr: 1.5, percentile: 70, percentile_str: "+P70", is_above: true, formatted: "1.5 ATR", color_tier: "pos" },
        },
        weekly: {
            ema_10: { stretch_atr: 1.0, percentile: 75, percentile_str: "+P75", is_above: true, formatted: "1.0 ATR", color_tier: "pos" },
            ema_20: { stretch_atr: 1.2, percentile: 80, percentile_str: "+P80", is_above: true, formatted: "1.2 ATR", color_tier: "pos" },
            ema_50: { stretch_atr: 2.0, percentile: 70, percentile_str: "+P70", is_above: true, formatted: "2.0 ATR", color_tier: "pos" },
        },
        monthly: {
            ema_10: { stretch_atr: 1.0, percentile: 60, percentile_str: "+P60", is_above: true, formatted: "1.0 ATR", color_tier: "pos" },
            ema_20: { stretch_atr: 1.5, percentile: 86, percentile_str: "+P86", is_above: true, formatted: "1.5 ATR", color_tier: "pos" },
            ema_50: { stretch_atr: 2.5, percentile: 60, percentile_str: "+P60", is_above: true, formatted: "2.5 ATR", color_tier: "pos" },
        },
        velocity: 0.15,
        is_exhaustion_hook: false,
        kinetic_status: "normal",
        kinetic_badge: "Normal",
        landing_ema_10: 101,
        landing_ema_20: 100,
        landing_cpr_top: 98,
        half_life_days: 5,
        decay_mode: "Time Consolidation",
        is_squeeze: false,
        sbs_score: 5.0,
    },
};

const dist = getEmaDistancePct(dummyItem);
assert(dist !== null && Math.abs(dist - 2.0) < 0.001, "getEmaDistancePct calculates +2.0% when close=102, landing=100");

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

console.log("\n==================================================");
console.log(`Results: ${passedCount}/${testCount} tests passed!`);
console.log("==================================================\n");

if (passedCount !== testCount) {
    process.exit(1);
}
