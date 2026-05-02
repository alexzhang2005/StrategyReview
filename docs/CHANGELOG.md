# Changelog

All notable changes to StrategyReview will be documented here.

## [Unreleased]

### Added
- Initial project setup

## [0.1.0] - 2025-05

### Added
- Product Requirements Document (docs/PRD.md)
- Technical Architecture Document (docs/ARCHITECTURE.md)
- D1 database schema with `stocks`, `daily_reviews`, `selection_lists`, `selection_stocks` tables
- Cloudflare Pages Functions API (`functions/api/[[route]].js`)
  - Strategy query endpoints (S1/S2/S3/三合一/任意)
  - Daily review CRUD endpoints
  - Selection list upload and matching
  - Batch stock data write endpoint
  - Cron-triggered daily update via Nine Quant API
- Cron Worker for 18:00 CST daily auto-update (weekdays)
- Frontend pages
  - `public/index.html` — Homepage with stats overview
  - `public/review.html` — Daily market review list + detail
  - `public/strategy.html` — Strategy stock table with tabs
  - `public/stock.html` — Stock detail with per-strategy data
  - `public/selection.html` — Excel upload + strategy matching
  - `public/admin.html` — Admin management panel
- Shared UI assets
  - `public/assets/css/main.css` — Dark financial theme (--bg/#0d1117, --gold/#ffd700)
  - `public/assets/js/api.js` — ApiClient class
  - `public/assets/js/components.js` — Shared UI helpers
- Data seeding script (`scripts/seed-from-json.js`)
- README.md with full setup and deployment guide
