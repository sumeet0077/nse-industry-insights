import fs from "fs";
import path from "path";
import { ALL_CONFIGS } from "../lib/config";
import { REQUIRED_CONSTITUENT_METRICS } from "../lib/metrics";
import { resolveDataKey } from "../lib/utils";
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

    // Validate IBD RS Rating presence and range (1-99)
    let missingIbdRs = 0;
    ps.forEach((row) => {
        const rating = row["IBD RS Rating"];
        if (rating !== undefined && rating !== null) {
            if (typeof rating !== "number" || rating < 1 || rating > 99) {
                errors.push(`Invalid IBD RS Rating "${rating}" for theme "${row["Theme/Index"]}" (expected integer 1-99)`);
            }
        } else {
            missingIbdRs++;
        }
    });

    if (missingIbdRs > 10) {
        errors.push(`Critical: ${missingIbdRs} themes have null/missing IBD RS Rating in performance summary!`);
    } else if (missingIbdRs > 0) {
        warnings.push(`${missingIbdRs} themes have null IBD RS Rating (young history).`);
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
