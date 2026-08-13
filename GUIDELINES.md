# NSE Industry Insights — Engineering & Release Guidelines

This document sets the mandatory engineering standards, data contract rules, and automated verification procedures for the **NSE Industry Insights** platform.

---

## 1. Architecture Overview

```
[ Master Bhavcopy Parquet / OCI VPS ] 
                 │
                 ▼
 [ scripts/export_json.py ] ──► [ data/ directory ]
                                       │
                 ┌─────────────────────┴─────────────────────┐
                 ▼                                           ▼
      [ scripts/validate_data.ts ]                  [ Next.js SSG / App ]
      (Data Integrity Gate in CI)                  (104 Static Export Pages)
                 │                                           │
                 └──────────────► DEPLOY ◄───────────────────┘
```

---

## 2. The 3 Core Data Contracts

### A. Constituent Performance (`data/constituent_performance/constituent_performance_latest.json`)
Every stock in the universe **MUST** conform to the `ConstituentPerformance` type in `types/index.ts`:
```typescript
interface ConstituentPerformance {
    ticker: string;
    "1D"?: number | null;
    "1W"?: number | null;
    "1M"?: number | null;
    "3M"?: number | null;
    "6M"?: number | null;
    "YTD"?: number | null;      // Calendar YTD (from Dec 31st of previous year)
    "1Y"?: number | null;
    "3Y"?: number | null;
    "5Y"?: number | null;
    "RS (5D)"?: number | null;  // Relative Strength vs Nifty 50
    "RS (10D)"?: number | null;
    "RS (20D)"?: number | null;
    "RS (50D)"?: number | null;
}
```

### B. Single Source of Truth for Metrics (`lib/metrics.ts`)
- Never hardcode metric arrays or custom return lookup logic inside individual components.
- Always use `METRIC_DEFINITIONS`, `getMetricValue()`, `formatMetricReturn()`, and `getMetricColor()` from `@/lib/metrics`.

### C. Timezone-Naive Date Operations in Python Exporters
- When comparing Pandas dates for YTD or period returns, **always** normalize to timezone-naive timestamps:
  ```python
  ser.index = pd.to_datetime(ser.index).tz_localize(None)
  ytd_target = pd.Timestamp(year=latest_date.year - 1, month=12, day=31)
  ```

---

## 3. Mandatory Pre-Flight Checklist Before Pushing

Before pushing any feature or data change to GitHub, run the full validation chain:

```bash
# 1. Verify Data Schema & Completeness (Fails if any metrics or files are missing)
npm run test:data

# 2. Type Check (0 TypeScript errors required)
npx tsc --noEmit

# 3. Build & Static Export (Prerenders all 104 static routes)
npm run build
```

---

## 4. OCI Cloud VPS Auto-Update Synchronization

The OCI Cloud VPS updates daily at 5:25 PM IST.
- Master Bhavcopy path on OCI: `/home/ubuntu/NSE_data/nse_master_adjusted_2014_onwards.parquet`.
- `scripts/export_json.py` and `nifty-breadth/fetch_breadth_data.py` must stay strictly synchronized in metric period names and baseline resolution.
- Never commit manual schema breaks without updating `scripts/validate_data.ts` and `types/index.ts`.
