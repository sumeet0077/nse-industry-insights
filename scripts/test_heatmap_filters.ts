// scripts/test_heatmap_filters.ts
// Comprehensive filter audit test suite for PerformanceHeatmap and ConstituentTable

import fs from "fs";
import path from "path";
import {
    classifySwingTiming,
    getEmpiricalStats,
    REGIME_CONFIGS,
    SWING_TIMING_CONFIGS,
    getSwingTimingLabel,
    getRegimeLabel,
    stripLeadingEmoji,
    UNIFIED_WAVE_CONCEPTS,
    getUnifiedWaveSignal,
    getUnifiedWaveLabel,
    getTopConstituentLeaders,
    ConstituentLeader,
} from "../lib/swingTiming";
import { getTickerLabel, resolveMarketStatusEntry } from "../lib/utils";
import { getThemeTopLeaders, getMarketStatus } from "../lib/data";

console.log("==================================================");
console.log("🧪 Comprehensive Table Column Filter Audit Gate");
console.log("==================================================\n");

let passedChecks = 0;
let failedChecks = 0;

function assert(condition: boolean, msg: string) {
    if (condition) {
        console.log(`  ✓ ${msg}`);
        passedChecks++;
    } else {
        console.error(`  ❌ FAILED: ${msg}`);
        failedChecks++;
    }
}

const heatmapPath = path.join(process.cwd(), "components", "tables", "PerformanceHeatmap.tsx");
const constituentPath = path.join(process.cwd(), "components", "tables", "ConstituentTable.tsx");

assert(fs.existsSync(heatmapPath), `Found ${heatmapPath}`);
assert(fs.existsSync(constituentPath), `Found ${constituentPath}`);

const heatmapCode = fs.readFileSync(heatmapPath, "utf-8");
const constituentCode = fs.readFileSync(constituentPath, "utf-8");

console.log("\n--- 1. Auditing Base Columns & Text Filters ---");
// Theme / Index check (Returns & Breadth modes)
assert(
    heatmapCode.includes('headerName: "Theme / Index"') &&
    heatmapCode.includes('filter: "agTextColumnFilter"') &&
    heatmapCode.includes('filterParams: textFilterParams') &&
    heatmapCode.includes('filterValueGetter: (params) => params.data?.["Theme/Index"] ?? ""'),
    "Theme / Index column has agTextColumnFilter, textFilterParams, and clean text filterValueGetter"
);

// Theme / Sector check (Forecaster mode)
assert(
    heatmapCode.includes('headerName: "Theme / Sector"') &&
    heatmapCode.includes('field: "Theme/Index"') &&
    heatmapCode.includes('filter: "agTextColumnFilter"') &&
    heatmapCode.includes('filterParams: textFilterParams') &&
    heatmapCode.includes('filterValueGetter: (params) => params.data?.["Theme/Index"] ?? ""'),
    "Theme / Sector column in Forecaster mode has agTextColumnFilter and clean text filterValueGetter"
);

// Checkbox column check
assert(
    heatmapCode.includes('field: "checkbox"') &&
    heatmapCode.includes('suppressHeaderMenuButton: true') &&
    heatmapCode.includes('suppressHeaderFilterButton: true') &&
    heatmapCode.includes('filter: false'),
    "Checkbox column suppresses both menu and filter buttons and has filter: false"
);

console.log("\n--- 2. Auditing Forecaster Mode 5 Decision Columns ---");
// 1. Theme / Sector (tested in Section 1)

// 2. Unified Wave Signal (T+1) check
assert(
    heatmapCode.includes('headerName: "Unified Wave Signal (T+1)"') &&
    heatmapCode.includes('colId: "unified_wave_signal"') &&
    heatmapCode.includes('filter: "agTextColumnFilter"') &&
    heatmapCode.includes('getUnifiedWaveLabel('),
    "Unified Wave Signal (T+1) uses agTextColumnFilter with clean string label filterValueGetter"
);

// 3. Top Swing Leaders (Next Day) check
assert(
    heatmapCode.includes('headerName: "Top Swing Leaders (Next Day)"') &&
    heatmapCode.includes('colId: "top_swing_leaders"') &&
    heatmapCode.includes('filter: false') &&
    heatmapCode.includes('sortable: false') &&
    heatmapCode.includes('suppressHeaderMenuButton: true') &&
    heatmapCode.includes('suppressHeaderFilterButton: true'),
    "Top Swing Leaders (Next Day) column has filter: false, sortable: false, suppressHeaderMenuButton: true, suppressHeaderFilterButton: true"
);

// 4. Edge & Odds check
assert(
    heatmapCode.includes('headerName: "Edge & Odds"') &&
    heatmapCode.includes('colId: "edge_and_odds"') &&
    heatmapCode.includes('filter: "agNumberColumnFilter"') &&
    heatmapCode.includes('sortable: true'),
    "Edge & Odds column has agNumberColumnFilter and sortable: true"
);

// 5. Suggested Stop check
assert(
    heatmapCode.includes('headerName: "Suggested Stop"') &&
    heatmapCode.includes('colId: "suggested_stop"') &&
    heatmapCode.includes('filter: "agNumberColumnFilter"') &&
    heatmapCode.includes('sortable: true') &&
    heatmapCode.includes('getEmpiricalStats(reg, swingHorizon).suggestedStop'),
    "Suggested Stop column has agNumberColumnFilter, sortable: true, and numeric filterValueGetter on suggestedStop"
);

console.log("\n--- 3. Auditing Numeric Columns & Pure Numeric filterValueGetters ---");
// RS Rating column
assert(
    heatmapCode.includes('headerName: "RS Rating"') &&
    heatmapCode.includes('filter: "agNumberColumnFilter"') &&
    heatmapCode.includes('filterValueGetter: (params) => {') &&
    heatmapCode.includes('const num = Number(val);'),
    "RS Rating column has agNumberColumnFilter and pure numeric filterValueGetter"
);

// Breadth mode numeric columns
assert(
    heatmapCode.includes('field: "breadth_totalStocks"') &&
    heatmapCode.includes('field: "breadth_pctAbove200Sma"') &&
    heatmapCode.includes('field: `breadth_${tf}_pct`'),
    "Breadth view contains numeric columns for Total, > 200 SMA, and tf Gainers"
);

console.log("\n--- 4. Semantic Evaluation of Unified Wave Concepts & Classifiers ---");
// 4a. Verify all Unified Wave Concept configurations have clean string labels without emojis
for (const [code, concept] of Object.entries(UNIFIED_WAVE_CONCEPTS)) {
    const label = getUnifiedWaveLabel(concept);
    assert(
        !label.startsWith("🌊") &&
        !label.startsWith("⚡") &&
        !label.startsWith("🔥") &&
        !label.startsWith("🎯") &&
        !label.startsWith("⚠️") &&
        !label.startsWith("🚫") &&
        !label.startsWith("⚖️"),
        `Unified wave label '${label}' for '${code}' is stripped of leading emojis`
    );
    assert(concept.edgePct >= 0 && concept.edgePct <= 100, `Unified wave concept '${code}' edgePct is valid: ${concept.edgePct}%`);
    assert(typeof concept.suggestedStop === "string" && concept.suggestedStop.length > 0, `Unified wave concept '${code}' suggestedStop is valid: ${concept.suggestedStop}`);
    assert(concept.mathFormula.length > 0, `Unified wave concept '${code}' has mathematical formula`);
    assert(concept.nextDayAction.length > 0, `Unified wave concept '${code}' has next-day action plan`);
}

// 4b. Test getUnifiedWaveSignal classification logic for all 6 core waves
// 1. Apex Wave: high momentum pullback with leading quadrant & breakout breadth
const apexSignal = getUnifiedWaveSignal({
    b1w: 75.0,
    b1d: 35.0,
    b200: 75.0,
    b1m: 60.0,
    rrgQuadrant: "Leading",
    rrgHeadingNE: true,
    breakouts10d: 5,
});
assert(apexSignal.code === "apex_wave", `Apex Wave classified accurately: ${apexSignal.name}`);

// 2. Springboard Wave: early turn / improving quadrant
const springboardSignal = getUnifiedWaveSignal({
    b1w: 72.0,
    b1d: 40.0,
    b200: 55.0,
    b1m: 25.0,
    rrgQuadrant: "Improving",
    rrgHeadingNE: true,
    breakouts10d: 3,
});
assert(springboardSignal.code === "springboard_wave", `Springboard Wave classified accurately: ${springboardSignal.name}`);

// 2b. Springboard Wave via early_thrust regime
const springboardSignal2 = getUnifiedWaveSignal({
    b1w: 55.0,
    b1d: 40.0,
    b200: 55.0,
    b1m: 25.0,
    regime: "early_thrust",
    rrgHeadingNE: true,
    breakouts10d: 2,
});
assert(springboardSignal2.code === "springboard_wave", `Springboard Wave via early_thrust classified accurately: ${springboardSignal2.name}`);

// 3. Prime Dip: pullback in bull regime
const primeSignal = getUnifiedWaveSignal({
    b1w: 70.0,
    b1d: 30.0,
    b200: 60.0,
    b1m: 40.0,
});
assert(primeSignal.code === "prime_dip", `Prime Dip classified accurately: ${primeSignal.name}`);

// 4. Sustained Bull: strong trend across timeframes
const bullSignal = getUnifiedWaveSignal({
    b1w: 75.0,
    b1d: 65.0,
    b200: 70.0,
    b1m: 60.0,
});
assert(bullSignal.code === "sustained_bull", `Sustained Bull classified accurately: ${bullSignal.name}`);

// 5. Extended / Wait: overbought short term
const extendedSignal = getUnifiedWaveSignal({
    b1w: 85.0,
    b1d: 85.0,
    b200: 80.0,
    b1m: 80.0,
});
assert(extendedSignal.code === "extended_wait", `Extended / Wait classified accurately: ${extendedSignal.name}`);

// 6. Avoid / Bear Trap: weak long-term breadth
const avoidSignal = getUnifiedWaveSignal({
    b1w: 20.0,
    b1d: 15.0,
    b200: 25.0,
    b1m: 20.0,
});
assert(avoidSignal.code === "avoid_bear_trap", `Avoid / Bear Trap classified accurately: ${avoidSignal.name}`);

// 6b. Test Prime Dip priority during 1-day cooling dips even when multi-month breadth is high
const primeDipDuringTrend = getUnifiedWaveSignal({
    b1w: 70.0,
    b1d: 30.0,
    b200: 65.0,
    b1m: 65.0,
});
assert(primeDipDuringTrend.code === "prime_dip", "Prime Dip takes precedence over Sustained Bull when sector is in 1D cooling dip (20-45%)");

// 6c. Test Sustained Bull continuation when NOT in a dip (B1D > 45%)
const sustainedBullContinuation = getUnifiedWaveSignal({
    b1w: 70.0,
    b1d: 55.0,
    b200: 65.0,
    b1m: 65.0,
});
assert(sustainedBullContinuation.code === "sustained_bull", "Sustained Bull applies when trend is advancing without cooling dip (B1D > 45%)");

// 6d. Test Market Status resolution for ampersand themes (e.g. Nifty Oil & Gas -> NIFTY OIL AND GAS)
const ms = getMarketStatus();
const oilGasEntry = resolveMarketStatusEntry(ms, "Nifty Oil & Gas");
assert(Boolean(oilGasEntry && oilGasEntry.above), "resolveMarketStatusEntry accurately resolves 'Nifty Oil & Gas' to 'NIFTY OIL AND GAS'");
const allLeaders = getThemeTopLeaders();
assert(Boolean(allLeaders["Nifty Oil & Gas"] && allLeaders["Nifty Oil & Gas"].length === 2), "Nifty Oil & Gas has exactly 2 constituent leaders extracted");

// 4c. Test getTopConstituentLeaders ranking and breakout star
const mockPerfMap: Record<string, any> = {
    "TATASTEEL.NS": { ibd_rs_rating: 94, price_52w_high: true, rs_lead_breakout: true },
    "JSWSTEEL.NS": { ibd_rs_rating: 88, price_52w_high: false, rs_lead_breakout: false },
    "SAIL.NS": { ibd_rs_rating: 60, price_52w_high: false, rs_lead_breakout: false },
};
const leaders = getTopConstituentLeaders(["SAIL.NS", "JSWSTEEL.NS", "TATASTEEL.NS"], mockPerfMap, 2);
assert(leaders.length === 2, `getTopConstituentLeaders limits count to 2 (got ${leaders.length})`);
assert(leaders[0].ticker === "TATASTEEL.NS", `Top leader is TATASTEEL (highest RS 94)`);
assert(leaders[0].is52wHigh === true, `TATASTEEL correctly flagged as 52W High breakout`);
assert(leaders[1].ticker === "JSWSTEEL.NS", `Second leader is JSWSTEEL (RS 88)`);
assert(leaders[1].is52wHigh === false, `JSWSTEEL correctly flagged with no 52W High`);

// 4d. Verify all legacy Swing Timing configurations have clean string labels without emojis
for (const [code, timingConfig] of Object.entries(SWING_TIMING_CONFIGS)) {
    const label = getSwingTimingLabel(timingConfig);
    assert(!label.startsWith("🎯") && !label.startsWith("🔥") && !label.startsWith("⚠️") && !label.startsWith("🚫") && !label.startsWith("⚖️"), `Legacy timing label '${label}' is stripped of leading emojis`);
}

// 4e. Verify all legacy Macro Regime configurations have clean string labels without emojis
for (const [code, regConfig] of Object.entries(REGIME_CONFIGS)) {
    const label = getRegimeLabel(code);
    assert(!label.startsWith("🚀") && !label.startsWith("🔥") && !label.startsWith("⚠️") && !label.startsWith("🩸") && !label.startsWith("🌱") && !label.startsWith("⚖️"), `Legacy regime label '${label}' is stripped of leading emojis`);
}

// 4f. Test textFormatter emoji-resilience (if user enters with or without emoji)
const formatter = (from: string) => stripLeadingEmoji(from).toLowerCase().trim();
assert(formatter("🌊 Apex Wave (Prime Dip)") === "apex wave (prime dip)", "textFormatter normalizes '🌊 Apex Wave' to 'apex wave (prime dip)'");
assert(formatter("⚡ Springboard Wave (Early Turn)") === "springboard wave (early turn)", "textFormatter normalizes '⚡ Springboard Wave' to 'springboard wave (early turn)'");
assert(formatter("🎯 Prime Dip") === "prime dip", "textFormatter normalizes '🎯 Prime Dip' to 'prime dip'");
assert(formatter("Prime Dip") === "prime dip", "textFormatter normalizes 'Prime Dip' to 'prime dip'");

console.log("\n--- 5. Semantic Evaluation of Numeric filterValueGetters ---");
// Simulate sample row data
const mockRow = {
    "Theme/Index": "Nifty Auto",
    "1 Day": 1.45,
    "1 Week": -0.85,
    "1 Month": 0,
    "RS Rating": 88,
    "IBD RS Rating": 88,
    regime: "pullback_thrust",
    breadth_1W_pct: 72.5,
    breadth_1D_pct: 35.0,
    breadth_1M_pct: 30.0,
    breadth_pctAbove200Sma: 65.0,
    breadth_totalStocks: 15,
    breadth_velocity: 42.5,
    expansion_odds: 71.2,
};

// 5a. Stop & Noise numeric filter evaluation across horizons
for (const horizon of ["2D", "5D", "10D"] as const) {
    const hStats = getEmpiricalStats(mockRow.regime, horizon);
    assert(typeof hStats.suggestedStop === "number", `Stop percentage for ${horizon} is a number: ${hStats.suggestedStop}%`);
    assert(hStats.suggestedStop > 0 && hStats.suggestedStop < 15, `Stop percentage for ${horizon} is reasonable: ${hStats.suggestedStop}%`);
    assert(typeof hStats.winRate === "number" && hStats.winRate > 0 && hStats.winRate <= 100, `Win rate for ${horizon} is valid: ${hStats.winRate}%`);
}

// 5b. Return columns numeric filter evaluation (handles positive, negative, zero, and nulls)
const numRet = Number(mockRow["1 Day"]);
assert(typeof numRet === "number" && !isNaN(numRet) && numRet === 1.45, "Positive return parsed accurately");
const negRet = Number(mockRow["1 Week"]);
assert(typeof negRet === "number" && !isNaN(negRet) && negRet === -0.85, "Negative return parsed accurately");
const zeroRet = Number(mockRow["1 Month"]);
assert(typeof zeroRet === "number" && !isNaN(zeroRet) && zeroRet === 0, "Zero return parsed accurately as 0");

// 5c. RS Rating numeric filter evaluation
const rsNum = Number(mockRow["RS Rating"]);
assert(typeof rsNum === "number" && rsNum >= 1 && rsNum <= 99, `RS rating is a valid number: ${rsNum}`);

// 5d. Bear Trap Suggested Stop evaluation (must yield null so numeric stop filters exclude traps)
const bearTrapRow = {
    "Theme/Index": "Nifty Auto",
    regime: "bear_bounce",
    breadth_pctAbove200Sma: 25.0,
    unified_wave: UNIFIED_WAVE_CONCEPTS.avoid_bear_trap,
};
const evalStop = (row: any, horizon: "2D" | "5D" | "10D") => {
    const wave = row?.unified_wave;
    const p200 = row?.breadth_pctAbove200Sma;
    if (wave?.code === "avoid_bear_trap" || (p200 != null && p200 < 35)) return null;
    const reg = row?.regime || "neutral";
    return getEmpiricalStats(reg, horizon).suggestedStop;
};
assert(evalStop(bearTrapRow, "5D") === null, "Bear Trap row yields null suggestedStop for filter safety");
assert(evalStop(mockRow, "5D") === 2.0, "Valid bull row yields numeric suggestedStop (2.0%)");

console.log("\n--- 6. Auditing ConstituentTable Filters ---");
assert(
    constituentCode.includes('filter: "agTextColumnFilter"') &&
    constituentCode.includes('field: "ticker"'),
    "ConstituentTable Ticker column uses agTextColumnFilter"
);
assert(
    constituentCode.includes('filterValueGetter: (params) => getTickerLabel(params.data?.ticker ?? "")'),
    "ConstituentTable Ticker column uses getTickerLabel for clean string matching without .NS suffix"
);
assert(
    constituentCode.includes('field: "checkbox"') &&
    constituentCode.includes('suppressHeaderFilterButton: true'),
    "ConstituentTable Checkbox column suppresses header filter button"
);
assert(
    constituentCode.includes('field: "ibd_rs_rating"') &&
    constituentCode.includes('filter: "agNumberColumnFilter"') &&
    constituentCode.includes('filterValueGetter'),
    "ConstituentTable RS Rating column has agNumberColumnFilter and filterValueGetter"
);

// 6a. Ticker label filter evaluation
const tickerRaw = "RELIANCE.NS";
const cleanTicker = getTickerLabel(tickerRaw);
assert(cleanTicker === "RELIANCE", `getTickerLabel('RELIANCE.NS') returns 'RELIANCE'`);
assert(cleanTicker.startsWith("RELIANCE"), "starts-with 'RELIANCE' matches ticker label");
assert(cleanTicker === "RELIANCE", "equals 'RELIANCE' matches ticker label");

console.log("\n==================================================");
console.log(`Audit Summary: ${passedChecks} Passed | ${failedChecks} Failed`);
console.log("==================================================");

if (failedChecks > 0) {
    console.error("❌ Filter audit failed!");
    process.exit(1);
} else {
    console.log("✨ All column filter audit checks PASSED successfully!\n");
    process.exit(0);
}
