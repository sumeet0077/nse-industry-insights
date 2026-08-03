# Changelog & Version History

All notable changes to the **NSE Industry Insights & Sector Rotation Dashboard** will be documented in this file.

The versioning format follows **Semantic Versioning** (`vMAJOR.MINOR.PATCH (COMMIT_HASH)`).

---

## [1.1.0] - 2026-08-04
### Added
- **Theme Assignment Updates**: Integrated **Hyundai Motor India** (`HYUNDAI.NS`) into **`Auto Passenger & CV`**, **Adani Energy Solutions** (`ADANIENSOL.NS`) into **`Power T&D`**, and **Jio Financial Services** (`JIOFIN.NS`) into **`Fintech`**.
- **Data Export & RRG Pipeline Re-sync**: Re-calculated theme breadth series, stock RRG matrices, and constituent performance across all 95 index & industry theme pages.

---

## [1.0.9] - 2026-08-04
### Added
- **Ola Electric (`OLAELEC.NS`) Integrated into Themes**: Added Ola Electric Mobility Ltd. (`OLAELEC.NS`) to the **`EV Ecosystem`** and **`Two & Three Wheelers`** theme constituent lists.
- **Data Export & RRG Synchronization**: Updated theme breadth calculation and stock RRG data payloads across all daily, weekly, and monthly timeframes.

---

## [1.0.8] - 2026-08-03
### Improved
- **Enhanced Mobile Browser UI & Navigation**: Optimized responsiveness across smartphones and small tablet viewports (< 640px).
- **Mobile Navigation Drawer**: Added direct access links for `Custom Watchlist RRG` and `Stocks Master` to the mobile slide-in menu (`TopBar.tsx`).
- **Responsive RRG Charts**: Adapted Relative Rotation Graphs (`RRGChart.tsx`) to responsive heights (`550px` on mobile, `800px` on desktop) with touch-enabled node focus cards.
- **Top Banner Mobile Layout**: Updated `DataFreshnessBanner.tsx` to wrap cleanly on small screens while displaying live version metadata (`v1.0.8`).

---

## [1.0.7] - 2026-08-02
### Improved
- **Unified Parquet Performance Engine**: Transitioned constituent stock performance (`constituent_performance_latest.json`) to calculate directly from the master NSE Bhavcopy dataset (`nse_master_bhav_with_delivery_2014_onwards.parquet`).
- **Exact Broker Alignment**: Replaced dividend-adjusted prices with raw NSE closing prices for constituent returns (e.g. HCLTech 1M return = **+30.24%**), matching TradingView, Zerodha, and NSE Bhavcopy closes 100% consistently across all dashboard tables and RRG charts.
- **Corporate Action Edge-Case Resilience**: Applied automated ratio adjustment for stock splits, bonus issues, and reverse splits across all 5,815 constituent stock entries.

---

## [1.0.6] - 2026-08-02
### Added
- **YTD Return Filter & Sorting in Theme Overview**: Added **YTD (Year-To-Date)** option to the time range selector (`1W`, `1M`, `3M`, `6M`, `YTD`, `1Y`, `3Y`, `5Y`, `ALL`) in the **Theme Overview** tab (`ThemeOverviewGrid.tsx`).
- **YTD Metric Across Dashboard**: Integrated YTD performance calculations into `performance_summary.json`, `METRIC_CONFIG` (`lib/config.ts`), Performance Heatmap tables, and Constituent performance tables.

---

## [1.0.5] - 2026-07-31
### Improved
- **Corporate Action Split Threshold**: Refined split drop detection threshold to **45%** (`pct < -0.45`), expanding automatic backward adjustment to cover 2:1 stock splits and 1:1 bonus issues alongside 3:1, 5:1, 6:1, and 10:1 splits.

---

## [1.0.4] - 2026-07-31
### Added
- **Live Version Badge**: Added live version and git commit tracking badge (`v1.0.4 (commit)`) to top Data Freshness Header for instant verification of live deployments and rollbacks.
- **RRG Outlier Handling**: Added split adjustment detection for unadjusted corporate action price drops (e.g. `ZFCVINDIA.NS` 6:1 split) in `export_stock_rrg.py`.
- **Plotly RRG Axis Optimization**: Disabled artificial zero-line (`zeroline: false`) on Plotly x/y axes in `RRGChart.tsx` to eliminate confusing vertical zero lines and preserve high-resolution quadrant grid focusing.
- **CHANGELOG Documentation**: Created `CHANGELOG.md` to document all version releases and commit pushes.

---

## [1.0.3] - 2026-07-31
### Fixed
- **Cloudflare Pages Build Limit**: Optimized `/watchlist` static RSC payload size from 94.7 MB down to 1.1 MB by dynamically loading benchmark datasets on demand.
- **RRG Chart Heading**: Added benchmark index indicator to RRG graph titles (e.g. `Sector Rotation - Weekly (Vs. Nifty 500)`).

---

## [1.0.2] - 2026-07-31
### Fixed
- **Constituent Filtering**: Filtered stock-level RRG trajectories to index/theme constituents when viewing detail pages, while maintaining 711-stock dataset support for Custom Watchlists.

---

## [1.0.1] - 2026-07-31
### Added
- **Vectorized Exporter**: Upgraded `export_stock_rrg.py` to vectorized matrix operations, calculating stock RRG trajectories for all 711 universe stocks across 95 benchmark files.
- **Custom Watchlist RRG**: Added custom watchlist page (`/watchlist`) with benchmark index selector, persistent localStorage watchlists, Trend Scanner controls, Top N distance filters, and TradingView chart links.

---

## [1.0.0] - 2026-07-30
### Initial Release
- **NSE Industry Insights Dashboard**: Market breadth calculations, sector rotation graphs, performance summary heatmaps, and theme breakdown views across 95 NSE indices and industry themes.
