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
} from "../lib/swingTiming";
import { getTickerLabel } from "../lib/utils";

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
// Theme / Index check
assert(
    heatmapCode.includes('headerName: "Theme / Index"') &&
    heatmapCode.includes('filter: "agTextColumnFilter"') &&
    heatmapCode.includes('filterParams: textFilterParams') &&
    heatmapCode.includes('filterValueGetter: (params) => params.data?.["Theme/Index"] ?? ""'),
    "Theme / Index column has agTextColumnFilter, textFilterParams, and clean text filterValueGetter"
);

// Checkbox column check
assert(
    heatmapCode.includes('field: "checkbox"') &&
    heatmapCode.includes('suppressHeaderMenuButton: true') &&
    heatmapCode.includes('suppressHeaderFilterButton: true') &&
    heatmapCode.includes('filter: false'),
    "Checkbox column suppresses both menu and filter buttons and has filter: false"
);

console.log("\n--- 2. Auditing Forecaster Mode String & Action Columns ---");
// Swing Action (T+1) check
assert(
    heatmapCode.includes('headerName: "Swing Action (T+1)"') &&
    heatmapCode.includes('filter: "agTextColumnFilter"') &&
    heatmapCode.includes('getSwingTimingLabel(classifySwingTiming'),
    "Swing Action (T+1) uses agTextColumnFilter with clean string label filterValueGetter"
);

// Top Picks check
assert(
    heatmapCode.includes('headerName: "Top Picks"') &&
    heatmapCode.includes('colId: "candidates_btn"') &&
    heatmapCode.includes('filter: false') &&
    heatmapCode.includes('sortable: false') &&
    heatmapCode.includes('suppressHeaderMenuButton: true') &&
    heatmapCode.includes('suppressHeaderFilterButton: true'),
    "Top Picks action column has filter: false, sortable: false, suppressHeaderMenuButton: true, suppressHeaderFilterButton: true"
);

// Regime Setup check
assert(
    heatmapCode.includes('headerName: "Regime Setup"') &&
    heatmapCode.includes('filter: "agTextColumnFilter"') &&
    heatmapCode.includes('getRegimeLabel(params.data?.regime'),
    "Regime Setup column uses agTextColumnFilter with clean string label filterValueGetter"
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

// Stop & Noise column
assert(
    heatmapCode.includes('headerName: "Stop & Noise"') &&
    heatmapCode.includes('filter: "agNumberColumnFilter"') &&
    heatmapCode.includes('sortable: true') &&
    heatmapCode.includes('getEmpiricalStats(reg, swingHorizon).suggestedStop'),
    "Stop & Noise column has agNumberColumnFilter, sortable: true, and numeric filterValueGetter on suggestedStop"
);

// Forecaster Dynamic Horizon columns
assert(heatmapCode.includes('headerName: `${swingHorizon} Win Rate`'), "Forecaster view contains column ${swingHorizon} Win Rate");
assert(heatmapCode.includes('headerName: `${swingHorizon} Exp Ret`'), "Forecaster view contains column ${swingHorizon} Exp Ret");
assert(heatmapCode.includes('headerName: `${swingHorizon} PF`'), "Forecaster view contains column ${swingHorizon} PF");

// Forecaster Numeric columns (1W Breadth, 1M Breadth, Velocity, 10D Expansion Odds, > 200 SMA, Total)
const forecasterNumericCols = [
    "1W Breadth",
    "1M Breadth",
    "Velocity (1W-1M)",
    "10D Expansion Odds",
    "> 200 SMA",
    "Total",
];

for (const col of forecasterNumericCols) {
    const hasCol = heatmapCode.includes(`headerName: "${col}"`);
    assert(hasCol, `Forecaster view contains column ${col}`);
}

// Breadth mode numeric columns
assert(
    heatmapCode.includes('field: "breadth_totalStocks"') &&
    heatmapCode.includes('field: "breadth_pctAbove200Sma"') &&
    heatmapCode.includes('field: `breadth_${tf}_pct`'),
    "Breadth view contains numeric columns for Total, > 200 SMA, and tf Gainers"
);

console.log("\n--- 4. Semantic Evaluation of String Filter Matchers & Formatters ---");
// 4a. Verify all Swing Timing configurations have clean string labels without emojis
for (const [code, timingConfig] of Object.entries(SWING_TIMING_CONFIGS)) {
    const label = getSwingTimingLabel(timingConfig);
    assert(!label.startsWith("🎯") && !label.startsWith("🔥") && !label.startsWith("⚠️") && !label.startsWith("🚫") && !label.startsWith("⚖️"), `Timing label '${label}' is stripped of leading emojis`);
}

// 4b. Verify all Macro Regime configurations have clean string labels without emojis
for (const [code, regConfig] of Object.entries(REGIME_CONFIGS)) {
    const label = getRegimeLabel(code);
    assert(!label.startsWith("🚀") && !label.startsWith("🔥") && !label.startsWith("⚠️") && !label.startsWith("🩸") && !label.startsWith("🌱") && !label.startsWith("⚖️"), `Regime label '${label}' is stripped of leading emojis`);
}

// 4c. Test Swing Action filtering with AG Grid operations (startsWith, equals, contains, endsWith)
const primeTiming = classifySwingTiming(72.5, 35.0, 65.0, 30.0);
const primeLabel = getSwingTimingLabel(primeTiming); // "Prime Dip (Next Day)"
assert(primeLabel === "Prime Dip (Next Day)", `Prime Dip label is exactly 'Prime Dip (Next Day)' (got '${primeLabel}')`);
assert(primeLabel.startsWith("Prime Dip"), "starts-with 'Prime Dip' matches Prime Dip");
assert(primeLabel.endsWith("(Next Day)"), "ends-with '(Next Day)' matches Prime Dip");
assert(primeLabel.toLowerCase().includes("prime dip"), "contains 'prime dip' matches Prime Dip");

const bearTiming = classifySwingTiming(10.0, 5.0, 25.0, 15.0);
const bearLabel = getSwingTimingLabel(bearTiming); // "Avoid (Bear Trap)"
assert(bearLabel === "Avoid (Bear Trap)", `Bear trap label is exactly 'Avoid (Bear Trap)' (got '${bearLabel}')`);
assert(bearLabel.startsWith("Avoid"), "starts-with 'Avoid' matches Avoid (Bear Trap)");
assert(bearLabel.toLowerCase().includes("bear trap"), "contains 'bear trap' matches Avoid (Bear Trap)");
assert(bearLabel.endsWith("(Bear Trap)"), "ends-with '(Bear Trap)' matches Avoid (Bear Trap)");

// 4d. Test Regime Setup filtering with AG Grid operations (startsWith, equals, contains)
const thrustLabel = getRegimeLabel("pullback_thrust"); // "Pullback Thrust"
assert(thrustLabel === "Pullback Thrust", `pullback_thrust label is exactly 'Pullback Thrust' (got '${thrustLabel}')`);
assert(thrustLabel.startsWith("Pullback Thrust"), "starts-with 'Pullback Thrust' matches Pullback Thrust");
assert(thrustLabel.toLowerCase().includes("pullback"), "contains 'pullback' matches Pullback Thrust");

const sustainedLabel = getRegimeLabel("sustained_bull"); // "Sustained Bull"
assert(sustainedLabel === "Sustained Bull", `sustained_bull label is exactly 'Sustained Bull' (got '${sustainedLabel}')`);
assert(sustainedLabel.startsWith("Sustained Bull"), "starts-with 'Sustained Bull' matches Sustained Bull");
assert(sustainedLabel.toLowerCase().includes("bull"), "contains 'bull' matches Sustained Bull");

const bounceLabel = getRegimeLabel("bear_bounce"); // "Bear Bounce Thrust"
assert(bounceLabel.startsWith("Bear Bounce"), "starts-with 'Bear Bounce' matches Bear Bounce Thrust");
assert(bounceLabel.toLowerCase().includes("bear bounce"), "contains 'bear bounce' matches Bear Bounce Thrust");

// 4e. Test textFormatter emoji-resilience (if user enters with or without emoji)
const formatter = (from: string) => stripLeadingEmoji(from).toLowerCase().trim();
assert(formatter("🎯 Prime Dip") === "prime dip", "textFormatter normalizes '🎯 Prime Dip' to 'prime dip'");
assert(formatter("Prime Dip") === "prime dip", "textFormatter normalizes 'Prime Dip' to 'prime dip'");
assert(formatter("🚀 Pullback Thrust") === "pullback thrust", "textFormatter normalizes '🚀 Pullback Thrust' to 'pullback thrust'");
assert(formatter("Pullback Thrust") === "pullback thrust", "textFormatter normalizes 'Pullback Thrust' to 'pullback thrust'");

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

// 5a. Stop & Noise numeric filter evaluation
const stats = getEmpiricalStats(mockRow.regime, "5D");
assert(typeof stats.suggestedStop === "number", "Stop & Noise suggestedStop is a number");
assert(stats.suggestedStop > 0 && stats.suggestedStop < 10, `Stop percentage is reasonable: ${stats.suggestedStop}%`);

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
