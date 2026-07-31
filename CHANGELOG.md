# Changelog & Version History

All notable changes to the **NSE Industry Insights & Sector Rotation Dashboard** will be documented in this file.

The versioning format follows **Semantic Versioning** (`vMAJOR.MINOR.PATCH (COMMIT_HASH)`).

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
