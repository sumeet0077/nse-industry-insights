import fs from "fs";
import path from "path";
import { ALL_CONFIGS, BROAD_MARKET, SECTORS } from "../lib/config";
import { REQUIRED_CONSTITUENT_METRICS } from "../lib/metrics";
import { resolveDataKey, parseBulkTickers, toCAGR, cleanTicker } from "../lib/utils";
import type { MarketStatus, ConstituentPerformanceMap, PerformanceRow } from "../types";

const DATA_DIR = path.join(process.cwd(), "data");

interface ValidationResult {
    category: string;
    passed: boolean;
    errors: string[];
    warnings: string[];
}

const results: ValidationResult[] = [];

function validate(category: string, fn: (errors: string[], warnings: string[]) => void) {
    const errors: string[] = [];
    const warnings: string[] = [];
    try {
        fn(errors, warnings);
    } catch (e: any) {
        errors.push(`Unhandled exception: ${e.message}`);
    }
    results.push({
        category,
        passed: errors.length === 0,
        errors,
        warnings,
    });
}

console.log("==================================================");
console.log("🔍 NSE Industry Insights — Data Integrity Gate");
console.log("==================================================\n");

// 1. Validate Market Status
validate("Market Status (data/market_status/market_status_latest.json)", (errors, warnings) => {
    const msPath = path.join(DATA_DIR, "market_status", "market_status_latest.json");
    if (!fs.existsSync(msPath)) {
        errors.push("Missing file: data/market_status/market_status_latest.json");
        return;
    }
    const ms: MarketStatus = JSON.parse(fs.readFileSync(msPath, "utf-8"));
    const keys = Object.keys(ms);
    if (keys.length === 0) {
        errors.push("Market status JSON is empty!");
        return;
    }

    console.log(`  ✓ Market Status contains ${keys.length} themes.`);

    // Check mapping against ALL_CONFIGS
    ALL_CONFIGS.forEach((cfg) => {
        const titleLower = cfg.title.toLowerCase();
        const resolvedTitle = resolveDataKey(cfg.title).toLowerCase();
        const foundKey = Object.keys(ms).find(
            (k) => k.toLowerCase() === titleLower || k.toLowerCase() === resolvedTitle || k.toLowerCase() === ("nifty " + titleLower)
        );
        const found = foundKey ? ms[foundKey] : null;
        if (!found) {
            warnings.push(`Config theme "${cfg.title}" has no match in market_status keys.`);
        } else {
            const totalTickers = (found.above || []).length + (found.below || []).length + (found.new_stock || []).length;
            if (totalTickers === 0) {
                warnings.push(`Theme "${cfg.title}" has 0 constituents in market_status.`);
            }
        }
    });
});

// 2. Validate Constituent Performance & Required Metrics
validate("Constituent Performance (data/constituent_performance/constituent_performance_latest.json)", (errors, warnings) => {
    const cpPath = path.join(DATA_DIR, "constituent_performance", "constituent_performance_latest.json");
    const msPath = path.join(DATA_DIR, "market_status", "market_status_latest.json");

    if (!fs.existsSync(cpPath)) {
        errors.push("Missing file: data/constituent_performance/constituent_performance_latest.json");
        return;
    }
    const cp: ConstituentPerformanceMap = JSON.parse(fs.readFileSync(cpPath, "utf-8"));
    const totalStocks = Object.keys(cp).length;
    if (totalStocks === 0) {
        errors.push("Constituent performance JSON is empty!");
        return;
    }
    console.log(`  ✓ Master Bhavcopy universe contains ${totalStocks} symbols.`);

    // Check active theme tickers
    if (fs.existsSync(msPath)) {
        const ms: MarketStatus = JSON.parse(fs.readFileSync(msPath, "utf-8"));
        const activeTickers = new Set<string>();
        Object.values(ms).forEach((entry) => {
            (entry.above || []).forEach((t) => activeTickers.add(t));
            (entry.below || []).forEach((t) => activeTickers.add(t));
            (entry.new_stock || []).forEach((t) => activeTickers.add(t));
        });

        console.log(`  ✓ Checking metric completeness across ${activeTickers.size} active theme stocks...`);

        let missingStocks = 0;
        let missingYtd = 0;
        let missingRs5d = 0;
        let missingRs20d = 0;
        let missing1D = 0;
        let missing1Y = 0;

        activeTickers.forEach((ticker) => {
            const stockData = cp[ticker];
            if (!stockData) {
                missingStocks++;
                errors.push(`Active stock "${ticker}" is completely missing from constituent_performance_latest.json!`);
                return;
            }

            if (stockData.YTD === null || stockData.YTD === undefined) missingYtd++;
            if (stockData["RS (5D)"] === null || stockData["RS (5D)"] === undefined) missingRs5d++;
            if (stockData["RS (20D)"] === null || stockData["RS (20D)"] === undefined) missingRs20d++;
            if (stockData["1D"] === null || stockData["1D"] === undefined) missing1D++;
            if (stockData["1Y"] === null || stockData["1Y"] === undefined) missing1Y++;

            // Validate IBD RS Rating bounds
            if (stockData.ibd_rs_rating !== null && stockData.ibd_rs_rating !== undefined) {
                if (typeof stockData.ibd_rs_rating !== "number" || stockData.ibd_rs_rating < 1 || stockData.ibd_rs_rating > 99) {
                    errors.push(`Invalid IBD RS Rating for "${ticker}": ${stockData.ibd_rs_rating} (Must be integer 1-99)`);
                }
            }

            // Validate RS Lead Breakout boolean
            if (stockData.rs_lead_breakout !== undefined && typeof stockData.rs_lead_breakout !== "boolean") {
                errors.push(`Invalid rs_lead_breakout type for "${ticker}": expected boolean`);
            }

            // Validate IPO fields
            if (stockData.is_ipo !== undefined && typeof stockData.is_ipo !== "boolean") {
                errors.push(`Invalid is_ipo type for "${ticker}": expected boolean`);
            }
        });

        if (missingYtd > 20) {
            errors.push(`Critical: ${missingYtd} active stocks have null/missing YTD metrics!`);
        } else if (missingYtd > 0) {
            warnings.push(`${missingYtd} active stocks have null YTD (likely newly listed or young data).`);
        }

        if (missingRs20d > 20) {
            errors.push(`Critical: ${missingRs20d} active stocks have null/missing RS (20D) metrics!`);
        } else if (missingRs20d > 0) {
            warnings.push(`${missingRs20d} active stocks have null RS (20D).`);
        }

        if (missing1D > 20) {
            errors.push(`Critical: ${missing1D} active stocks have null 1D return!`);
        }
    }
});

// 3. Validate Performance Summary
validate("Performance Summary (data/performance/performance_summary.json)", (errors, warnings) => {
    const psPath = path.join(DATA_DIR, "performance", "performance_summary.json");
    if (!fs.existsSync(psPath)) {
        errors.push("Missing file: data/performance/performance_summary.json");
        return;
    }
    const ps: PerformanceRow[] = JSON.parse(fs.readFileSync(psPath, "utf-8"));
    if (ps.length === 0) {
        errors.push("Performance summary JSON is empty!");
        return;
    }

    // Check for duplicates
    const themeCounts = new Map<string, number>();
    ps.forEach((row) => {
        const title = row["Theme/Index"];
        themeCounts.set(title, (themeCounts.get(title) || 0) + 1);
    });

    const duplicates = Array.from(themeCounts.entries()).filter(([_, count]) => count > 1);
    if (duplicates.length > 0) {
        errors.push(`Found ${duplicates.length} duplicate themes in performance summary: ${duplicates.map((d) => d[0]).join(", ")}`);
    }

    // Validate RS Rating presence and range (1-99)
    let missingRsRating = 0;
    ps.forEach((row) => {
        const rating = row["RS Rating"] ?? row["IBD RS Rating"];
        if (rating !== undefined && rating !== null) {
            if (typeof rating !== "number" || rating < 1 || rating > 99) {
                errors.push(`Invalid RS Rating "${rating}" for theme "${row["Theme/Index"]}" (expected integer 1-99)`);
            }
        } else {
            missingRsRating++;
        }
    });

    if (missingRsRating > 10) {
        errors.push(`Critical: ${missingRsRating} themes have null/missing RS Rating in performance summary!`);
    } else if (missingRsRating > 0) {
        warnings.push(`${missingRsRating} themes have null RS Rating (young history).`);
    }

    console.log(`  ✓ Performance Summary contains ${ps.length} unique theme rows.`);
});

// 4. Validate Breadth Data Files
validate("Breadth Data Files (data/breadth/*.json)", (errors, warnings) => {
    const breadthDir = path.join(DATA_DIR, "breadth");
    if (!fs.existsSync(breadthDir)) {
        errors.push("Missing breadth directory: data/breadth");
        return;
    }

    let missingBreadthCount = 0;
    ALL_CONFIGS.forEach((cfg) => {
        const filePath = path.join(breadthDir, `${cfg.dataFile}.json`);
        if (!fs.existsSync(filePath)) {
            missingBreadthCount++;
            errors.push(`Missing breadth file for ${cfg.title}: data/breadth/${cfg.dataFile}.json`);
        } else {
            try {
                const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
                if (!Array.isArray(data) || data.length === 0) {
                    errors.push(`Empty breadth file: data/breadth/${cfg.dataFile}.json`);
                }
            } catch (e) {
                errors.push(`Corrupted JSON in data/breadth/${cfg.dataFile}.json`);
            }
        }
    });

    if (missingBreadthCount === 0) {
        console.log(`  ✓ All ${ALL_CONFIGS.length} breadth files exist and contain valid time-series.`);
    }
});

// 5. Validate RRG Data
validate("RRG Trajectory Files (data/rrg/*.json)", (errors, warnings) => {
    const rrgDir = path.join(DATA_DIR, "rrg");
    const requiredTFs = ["rrg_D.json", "rrg_W.json", "rrg_M.json"];

    requiredTFs.forEach((tf) => {
        const tfPath = path.join(rrgDir, tf);
        if (!fs.existsSync(tfPath)) {
            errors.push(`Missing RRG file: data/rrg/${tf}`);
        } else {
            const data = JSON.parse(fs.readFileSync(tfPath, "utf-8"));
            const themes = Object.keys(data);
            if (themes.length === 0) {
                errors.push(`RRG dataset data/rrg/${tf} contains 0 themes!`);
            }
        }
    });
    console.log(`  ✓ RRG datasets validated for Daily, Weekly, and Monthly timeframes.`);
});

// 6. Validate Benchmark Stock RRG & Constituent Performance Public Symlinks
validate("Benchmark Public Assets (public/data/stock_rrg & constituent_performance)", (errors, warnings) => {
    const publicDataDir = path.join(process.cwd(), "public", "data");
    const stockRrgDir = path.join(publicDataDir, "stock_rrg");
    const constPerfDir = path.join(publicDataDir, "constituent_performance");

    // Self-healing symlink creation if missing
    if (!fs.existsSync(stockRrgDir) && fs.existsSync(path.join(DATA_DIR, "stock_rrg"))) {
        try {
            fs.symlinkSync("../../data/stock_rrg", stockRrgDir);
        } catch {}
    }
    if (!fs.existsSync(constPerfDir) && fs.existsSync(path.join(DATA_DIR, "constituent_performance"))) {
        try {
            fs.symlinkSync("../../data/constituent_performance", constPerfDir);
        } catch {}
    }

    if (!fs.existsSync(stockRrgDir)) {
        errors.push("Missing public stock_rrg directory: public/data/stock_rrg");
        return;
    }

    const benchmarks = [...BROAD_MARKET, ...SECTORS];
    let missingCount = 0;

    benchmarks.forEach((cfg) => {
        const filePath = path.join(stockRrgDir, `${cfg.dataFile}.json`);
        if (!fs.existsSync(filePath)) {
            missingCount++;
            errors.push(`Missing benchmark stock RRG file for ${cfg.title}: public/data/stock_rrg/${cfg.dataFile}.json`);
        } else {
            try {
                const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
                if (!Array.isArray(data.D) || !Array.isArray(data.W) || !Array.isArray(data.M)) {
                    errors.push(`Stock RRG file for ${cfg.title} (${cfg.dataFile}.json) missing required D, W, or M series!`);
                } else if (data.D.length === 0 || data.W.length === 0 || data.M.length === 0) {
                    warnings.push(`Stock RRG file for ${cfg.title} (${cfg.dataFile}.json) has empty series for one or more timeframes.`);
                }
            } catch (e) {
                errors.push(`Corrupted JSON in public/data/stock_rrg/${cfg.dataFile}.json`);
            }
        }
    });

    // Validate constituent_performance public delivery
    const pubConstPerf = path.join(constPerfDir, "constituent_performance_latest.json");
    if (!fs.existsSync(pubConstPerf)) {
        errors.push("Missing constituent performance file in public/data/constituent_performance/constituent_performance_latest.json");
    } else {
        try {
            const cpData = JSON.parse(fs.readFileSync(pubConstPerf, "utf-8"));
            if (Object.keys(cpData).length === 0) {
                errors.push("public constituent_performance_latest.json is empty!");
            }
        } catch (e) {
            errors.push("Corrupted JSON in public/data/constituent_performance/constituent_performance_latest.json");
        }
    }

    if (missingCount === 0 && errors.length === 0) {
        console.log(`  ✓ All ${benchmarks.length} benchmark stock RRG files and constituent performance asset exist and are valid.`);
    }
});

// 7. Validate Custom Watchlist Parser & Algorithms
validate("Custom Watchlist Parser & Algorithms", (errors) => {
    const res1 = parseBulkTickers("NSE:TCS, INFY, Jublfood.ns, ZOMATO", ["JUBLFOOD.NS"]);
    if (res1.allParsed.length !== 4 || res1.newTickers.length !== 3 || res1.existingTickers.length !== 1) {
        errors.push(`parseBulkTickers failed on TradingView input: got ${JSON.stringify(res1)}`);
    }
    const res2 = parseBulkTickers("\"NSE:RELIANCE\"\n'BSE:SBIN';\t[TATAMOTORS]\n(HDFCBANK.BO)\n", []);
    if (res2.allParsed.length !== 4 || res2.allParsed[0] !== "RELIANCE.NS" || res2.allParsed[1] !== "SBIN.NS" || res2.allParsed[2] !== "TATAMOTORS.NS" || res2.allParsed[3] !== "HDFCBANK.NS") {
        errors.push(`parseBulkTickers failed on complex delimiters: got ${JSON.stringify(res2)}`);
    }
    const res3 = parseBulkTickers("tcs, TCS, NSE:tcs, TCS.NS, tcs.ns", []);
    if (res3.allParsed.length !== 1 || res3.allParsed[0] !== "TCS.NS") {
        errors.push(`parseBulkTickers failed on dedup: got ${JSON.stringify(res3)}`);
    }
    const res4 = parseBulkTickers("   \n\t  ", ["TCS.NS"]);
    if (res4.allParsed.length !== 0 || res4.newTickers.length !== 0) {
        errors.push(`parseBulkTickers failed on empty input: got ${JSON.stringify(res4)}`);
    }
    // Test .NSE and .BSE suffixes
    const res5 = parseBulkTickers("TCS.NSE, SBIN.BSE", []);
    if (res5.allParsed.length !== 2 || res5.allParsed[0] !== "TCS.NS" || res5.allParsed[1] !== "SBIN.NS") {
        errors.push(`parseBulkTickers failed on .NSE/.BSE suffixes: got ${JSON.stringify(res5)}`);
    }
    // Test case-insensitive existing tickers matching
    const res6 = parseBulkTickers("infy.ns, reliance", ["INFY.NS", "RELIANCE.NS"]);
    if (res6.existingTickers.length !== 2 || res6.newTickers.length !== 0) {
        errors.push(`parseBulkTickers failed on case-insensitive existing tickers check: got ${JSON.stringify(res6)}`);
    }

    // CAGR formula tests
    const cagr1 = toCAGR(100, 3);
    if (!cagr1 || Math.abs(cagr1 - 25.992) > 0.01) {
        errors.push(`CAGR calculation failed for 100% 3Y: got ${cagr1}`);
    }
    const cagr0 = toCAGR(0, 5);
    if (cagr0 !== 0) {
        errors.push(`CAGR calculation failed for 0% 5Y: got ${cagr0}`);
    }
    const cagrLoss = toCAGR(-50, 3);
    if (!cagrLoss || Math.abs(cagrLoss - (-20.63)) > 0.05) {
        errors.push(`CAGR calculation failed for -50% 3Y: got ${cagrLoss}`);
    }
    const cagrTotalLoss = toCAGR(-100, 5);
    if (cagrTotalLoss !== -100) {
        errors.push(`CAGR calculation failed for -100% 5Y: got ${cagrTotalLoss}`);
    }
    if (toCAGR(null, 3) !== null || toCAGR(undefined, 3) !== null) {
        errors.push(`CAGR calculation failed on null/undefined input`);
    }

    console.log("  ✓ Custom Watchlist bulk ticker parser and CAGR logic validated.");
});

// 8. Validate 52-Week High/Low Recurrence History & Section 8 Invariants
validate("52W High/Low Recurrence History (Section 8 Invariants)", (errors, warnings) => {
    const historyPath = path.join(DATA_DIR, "market_status", "market_52w_history.json");
    const publicHistoryPath = path.join(process.cwd(), "public", "data", "market_status", "market_52w_history.json");

    if (!fs.existsSync(historyPath)) {
        errors.push("Missing file: data/market_status/market_52w_history.json");
        return;
    }

    if (!fs.existsSync(publicHistoryPath)) {
        errors.push("Missing symlinked file: public/data/market_status/market_52w_history.json (run ensure_public_symlinks)");
    }

    const raw = fs.readFileSync(historyPath, "utf-8");
    const data = JSON.parse(raw);

    if (!data.metadata || !Array.isArray(data.dates) || !Array.isArray(data.highs) || !Array.isArray(data.lows) || !data.daily_lists) {
        errors.push("Invalid schema: market_52w_history.json missing required top-level fields");
        return;
    }

    console.log(`  ✓ 52W History loaded: ${data.metadata.window_sessions} sessions (${data.metadata.start_date} to ${data.metadata.end_date}), ${data.highs.length} highs, ${data.lows.length} lows.`);

    // Load canonical ETF registry
    const etfFilePath = path.join(DATA_DIR, "etf_symbols.json");
    let etfSymbols = new Set<string>();
    if (fs.existsSync(etfFilePath)) {
        const etfRaw = JSON.parse(fs.readFileSync(etfFilePath, "utf-8"));
        const list = Array.isArray(etfRaw) ? etfRaw : (etfRaw.symbols || Object.keys(etfRaw));
        etfSymbols = new Set(list.map((s: string) => s.trim().toUpperCase()));
    } else {
        warnings.push("data/etf_symbols.json not found for ETF leakage audit.");
    }

    const PROTECTED_EQUITIES = new Set([
        "SKYGOLD", "GOLDIAM", "SILVERTUC", "EUROBOND", "CHEMBOND", "PNBGILTS",
        "BHARATFORG", "BHARATGEAR", "BHARATRAS", "BHARATWIRE", "BHARTIARTL",
        "GOLDENTOBC", "GOLDKENTO", "GOLDTECH", "SILVEROAK", "BOMDYEING",
        "JETFREIGHT", "SHANTIGOLD", "GICRE", "NEWINDIA",
        "CHEMBONDCH", "DECNGOLD", "GOLDKART", "GOLDSTAR", "PENTAGOLD",
        "SBIFUNDS", "GROWW", "MUTHOOTMF", "JMFINANCIL", "EDELWEISS", "SSDL",
    ]);

    // Invariant 1: Mutual Exclusion
    for (const dt of data.dates) {
        const session = data.daily_lists[dt];
        if (!session) {
            errors.push(`Missing daily_lists entry for session date ${dt}`);
            continue;
        }
        const highSet = new Set(session.highs.map((s: string) => cleanTicker(s).toUpperCase()));
        const lowSet = new Set(session.lows.map((s: string) => cleanTicker(s).toUpperCase()));
        const overlap = Array.from(highSet).filter((s) => lowSet.has(s));
        if (overlap.length > 0) {
            errors.push(`Invariant 1 Failure: ${overlap.length} stocks in BOTH highs and lows on ${dt}: ${overlap.join(", ")}`);
        }
    }

    // Invariant 2: Zero ETF & Rights Entitlement (-RE) Leakage
    const allSymbolsChecked = new Set<string>();
    for (const item of [...data.highs, ...data.lows]) {
        const clean = cleanTicker(item.symbol).toUpperCase();
        allSymbolsChecked.add(clean);
        if (clean.endsWith("-RE")) {
            errors.push(`Invariant 2 Failure: Rights Entitlement '${clean}' found in 52W history`);
        }
        if (etfSymbols.has(clean) && !PROTECTED_EQUITIES.has(clean)) {
            errors.push(`Invariant 2 Failure: ETF '${clean}' leaked into 52W history`);
        }
    }

    // Invariant 3: Corporate Action Split Integrity (POCL, ANGELONE)
    for (const dt of data.dates) {
        const session = data.daily_lists[dt];
        if (!session) continue;
        const lowSet = new Set(session.lows.map((s: string) => cleanTicker(s).toUpperCase()));
        if (dt >= "2026-07-21" && lowSet.has("POCL")) {
            errors.push(`Invariant 3 Failure: POCL erroneously in low52w post-split on ${dt}`);
        }
        if (dt >= "2026-02-26" && lowSet.has("ANGELONE")) {
            errors.push(`Invariant 3 Failure: ANGELONE erroneously in low52w post-split on ${dt}`);
        }
    }

    // Invariant 4: POLICYBZR Crash Trap on 2026-09-24
    if (data.daily_lists["2026-09-24"]) {
        const high24 = new Set(data.daily_lists["2026-09-24"].highs.map((s: string) => cleanTicker(s).toUpperCase()));
        const low24 = new Set(data.daily_lists["2026-09-24"].lows.map((s: string) => cleanTicker(s).toUpperCase()));
        if (high24.has("POLICYBZR")) {
            errors.push("Invariant 4 Failure: POLICYBZR erroneously appeared in highs on crash date 2026-09-24");
        }
        if (!low24.has("POLICYBZR")) {
            errors.push("Invariant 4 Failure: POLICYBZR missing from lows on crash date 2026-09-24");
        }
    }

    // Invariant 5: Seasoning (< 252 Sessions; LUMINO, SKYWAYS)
    for (const unseasoned of ["LUMINO", "SKYWAYS"]) {
        if (allSymbolsChecked.has(unseasoned)) {
            errors.push(`Invariant 5 Failure: Unseasoned stock '${unseasoned}' appeared in 52W history`);
        }
    }

    // Invariant 6: Frequency Monotonicity & Streak Bounds
    for (const item of [...data.highs, ...data.lows]) {
        if (!(item.count_5d <= item.count_10d && item.count_10d <= item.count_20d && item.count_20d <= item.count_60d)) {
            errors.push(`Invariant 6 Failure: Non-monotonic frequency counts for ${item.symbol}: [${item.count_5d}, ${item.count_10d}, ${item.count_20d}, ${item.count_60d}]`);
        }
        if (item.streak < 0 || item.streak > 60) {
            errors.push(`Invariant 6 Failure: Streak out of bounds (${item.streak}) for ${item.symbol}`);
        }
        if (!Array.isArray(item.history_20d) || item.history_20d.length !== 20) {
            errors.push(`Invariant 6 Failure: Invalid history_20d length (${item.history_20d?.length}) for ${item.symbol}`);
        }
    }

    // Invariant 7: Price Band & Series Schema Integrity
    const secBandsPath = path.join(DATA_DIR, "sec_bands.json");
    if (!fs.existsSync(secBandsPath)) {
        errors.push("Missing file: data/sec_bands.json");
    } else {
        try {
            const rawBands = JSON.parse(fs.readFileSync(secBandsPath, "utf-8"));
            if (Object.keys(rawBands).length < 3000) {
                errors.push(`Invariant 7 Failure: sec_bands.json has suspiciously few entries (${Object.keys(rawBands).length} < 3000)`);
            }
        } catch (e) {
            errors.push(`Invariant 7 Failure: Unparseable sec_bands.json: ${e}`);
        }
    }

    const validBands = new Set(["No Band", "20", "10", "5", "2", "40"]);
    for (const item of [...data.highs, ...data.lows]) {
        if (!item.series || typeof item.series !== "string") {
            errors.push(`Invariant 7 Failure: Missing or invalid 'series' on ${item.symbol}`);
        }
        if (!item.circuit_band || typeof item.circuit_band !== "string" || !validBands.has(item.circuit_band.trim())) {
            errors.push(`Invariant 7 Failure: Missing or unrecognized 'circuit_band' (${item.circuit_band}) on ${item.symbol}`);
        }
        if (typeof item.is_circuit_locked !== "boolean") {
            errors.push(`Invariant 7 Failure: Missing or invalid 'is_circuit_locked' boolean on ${item.symbol}`);
        }
    }

    // Invariant 8: Microstructure & Confluence Indicators Null-Tolerant Validation
    const validCprPos = new Set(["above", "inside", "below"]);
    const validPatterns = new Set(["hammer", "thrust", "rejection", "normal"]);
    for (const item of [...data.highs, ...data.lows]) {
        if (item.cpr_width_pct !== undefined && item.cpr_width_pct !== null) {
            if (typeof item.cpr_width_pct !== "number" || isNaN(item.cpr_width_pct) || item.cpr_width_pct < 0) {
                errors.push(`Invariant 8 Failure: Invalid cpr_width_pct (${item.cpr_width_pct}) on ${item.symbol}`);
            }
        }
        if (item.cpr_pos !== undefined && item.cpr_pos !== null) {
            if (!validCprPos.has(item.cpr_pos)) {
                errors.push(`Invariant 8 Failure: Invalid cpr_pos (${item.cpr_pos}) on ${item.symbol}`);
            }
        }
        if (item.vol_surge !== undefined && item.vol_surge !== null) {
            if (typeof item.vol_surge !== "number" || isNaN(item.vol_surge) || item.vol_surge < 0) {
                errors.push(`Invariant 8 Failure: Invalid vol_surge (${item.vol_surge}) on ${item.symbol}`);
            }
        }
        if (item.deliv_pct !== undefined && item.deliv_pct !== null) {
            if (typeof item.deliv_pct !== "number" || isNaN(item.deliv_pct) || item.deliv_pct < 0 || item.deliv_pct > 100) {
                errors.push(`Invariant 8 Failure: Invalid deliv_pct (${item.deliv_pct}) on ${item.symbol}`);
            }
        }
        if (item.candle_pattern !== undefined && item.candle_pattern !== null) {
            if (!validPatterns.has(item.candle_pattern)) {
                errors.push(`Invariant 8 Failure: Invalid candle_pattern (${item.candle_pattern}) on ${item.symbol}`);
            }
        }
        if (item.sector_wave_count !== undefined && item.sector_wave_count !== null) {
            if (typeof item.sector_wave_count !== "number" || isNaN(item.sector_wave_count) || item.sector_wave_count < 0) {
                errors.push(`Invariant 8 Failure: Invalid sector_wave_count (${item.sector_wave_count}) on ${item.symbol}`);
            }
        }
        if (item.prev_color !== undefined && item.prev_color !== null) {
            if (!["red", "green", "flat"].includes(item.prev_color)) {
                errors.push(`Invariant 8 Failure: Invalid prev_color (${item.prev_color}) on ${item.symbol}`);
            }
        }
        if (item.risk_pct !== undefined && item.risk_pct !== null) {
            if (typeof item.risk_pct !== "number" || isNaN(item.risk_pct) || item.risk_pct < 0) {
                errors.push(`Invariant 8 Failure: Invalid risk_pct (${item.risk_pct}) on ${item.symbol}`);
            }
        }
        if (item.recency_days !== undefined && item.recency_days !== null) {
            if (typeof item.recency_days !== "number" || isNaN(item.recency_days) || item.recency_days < 0 || !Number.isInteger(item.recency_days)) {
                errors.push(`Invariant 8 Failure: Invalid recency_days (${item.recency_days}) on ${item.symbol}`);
            }
        }
        const validSetupTypes = new Set([
            "shakeout_breakout",
            "one_day_pause",
            "hammer_bounce",
            "fresh_thrust",
            "consolidation_base",
            "fresh_base",
            "vcp_coiling",
            "cpr_coiling",
            "normal",
        ]);
        if (item.setup_type !== undefined && item.setup_type !== null) {
            if (!validSetupTypes.has(item.setup_type)) {
                errors.push(`Invariant 8 Failure: Invalid setup_type (${item.setup_type}) on ${item.symbol}`);
            }
            if (item.setup_type !== "normal") {
                if (!item.setup_label || typeof item.setup_label !== "string") {
                    errors.push(`Invariant 8 Failure: Missing setup_label for setup ${item.setup_type} on ${item.symbol}`);
                }
                if (!item.setup_bar_desc || typeof item.setup_bar_desc !== "string") {
                    errors.push(`Invariant 8 Failure: Missing setup_bar_desc for setup ${item.setup_type} on ${item.symbol}`);
                }
            } else {
                if (item.setup_label !== undefined && item.setup_label !== null) {
                    errors.push(`Invariant 8 Failure: Normal setup has unexpected setup_label on ${item.symbol}`);
                }
                if (item.setup_bar_desc !== undefined && item.setup_bar_desc !== null) {
                    errors.push(`Invariant 8 Failure: Normal setup has unexpected setup_bar_desc on ${item.symbol}`);
                }
            }
        }
        if (item.multi_year_level !== undefined && item.multi_year_level !== null) {
            if (!["ATH", "5Y", "3Y", "2Y"].includes(item.multi_year_level)) {
                errors.push(`Invariant 8 Failure: Invalid multi_year_level (${item.multi_year_level}) on ${item.symbol}`);
            }
        }
        if (item.base_gap_days !== undefined && item.base_gap_days !== null) {
            if (typeof item.base_gap_days !== "number" || isNaN(item.base_gap_days) || item.base_gap_days < 0 || !Number.isInteger(item.base_gap_days)) {
                errors.push(`Invariant 8 Failure: Invalid base_gap_days (${item.base_gap_days}) on ${item.symbol}`);
            }
        }
        if (item.ema_20 !== undefined && item.ema_20 !== null) {
            if (typeof item.ema_20 !== "number" || isNaN(item.ema_20) || item.ema_20 <= 0) {
                errors.push(`Invariant 8 Failure: Invalid ema_20 (${item.ema_20}) on ${item.symbol}`);
            }
        }
    }

    if (data.metadata?.sector_waves) {
        if (typeof data.metadata.sector_waves !== "object") {
            errors.push("Invariant 8 Failure: metadata.sector_waves must be an object map");
        }
    }

    console.log("  ✓ All Section 8 Invariants passed: Mutual exclusion, zero ETF leakage, split sanity, frequency monotonicity, price band enrichment, and microstructure confluence.");
});

// Print Summary
console.log("\n==================================================");
console.log("📊 Verification Results");
console.log("==================================================");

let totalErrors = 0;
let totalWarnings = 0;

results.forEach((r) => {
    if (r.passed) {
        console.log(`✅ [PASS] ${r.category}`);
    } else {
        console.log(`❌ [FAIL] ${r.category}`);
        r.errors.forEach((err) => console.log(`   ⛔ ${err}`));
    }
    r.warnings.forEach((warn) => console.log(`   ⚠️  ${warn}`));
    totalErrors += r.errors.length;
    totalWarnings += r.warnings.length;
});

console.log("\n--------------------------------------------------");
console.log(`Total Errors: ${totalErrors} | Total Warnings: ${totalWarnings}`);

if (totalErrors > 0) {
    console.error("\n❌ DATA INTEGRITY GATE FAILED. Fix data anomalies before deploying!\n");
    process.exit(1);
} else {
    console.log("\n✨ DATA INTEGRITY GATE PASSED! All data files are healthy.\n");
    process.exit(0);
}
