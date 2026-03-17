# Project Structure

Industry-standard layout for the Game Analytics Dashboard.

## Directory Layout

```
game_analytics_export/
├── src/                    # Application source
│   ├── app.js              # Entry point
│   ├── lib/                # Core logic & data
│   │   ├── data.js         # Data loading (DuckDB + JSON fallback)
│   │   ├── db/             # DuckDB client
│   │   ├── env.js          # Environment/config
│   │   ├── filters.js      # Theme/mechanic/provider filters
│   │   └── game-analytics-engine.js
│   ├── ui/                 # UI layer
│   │   ├── ui.js           # Main UI, page rendering
│   │   ├── ui-panels.js    # Game/provider/theme panels
│   │   ├── ui-providers-games.js
│   │   ├── charts-modern.js
│   │   ├── filter-dropdowns.js
│   │   ├── pagination.js
│   │   └── ...
│   ├── features/           # Feature modules
│   │   ├── compat.js       # Data compat layer
│   │   ├── overview-insights.js
│   │   ├── page-manager.js
│   │   ├── trends.js
│   │   └── sparklines.js
│   ├── components/         # Reusable UI components
│   ├── config/             # Static config (mechanics, themes)
│   ├── pages/              # HTML page templates
│   └── assets/
├── data/                   # Static data (games_master.json, etc.)
├── scripts/                # Build, verification, data scripts
│   ├── build/              # write-health-json.cjs, build_master_json.cjs
│   ├── data/               # verify-and-correct-games, merge-verified, etc.
│   ├── test/               # test-all-3, validate-all-dashboard-pages
│   ├── scrapers/           # slotcatalog-scraper
│   └── recovery/           # run-full-recovery, batch_research
├── tests/
│   ├── unit/               # Unit tests (*.test.js)
│   ├── integration/        # Integration tests
│   ├── e2e/                # Playwright E2E
│   ├── data-validation/    # Data quality tests
│   ├── archive/            # One-off scripts (CHECK-*, REPRO-*, etc.)
│   ├── utils/              # load-test-data, test helpers
│   └── setup.js            # Vitest setup
├── docs/
├── dashboard.html          # Main entry
└── index.html              # Landing page
```

## Import Conventions

- **Entry** (`app.js`): `./lib/`, `./ui/`, `./features/`
- **From lib/**: `./data.js`, `../config/`
- **From ui/**: `../lib/`, `../components/`, `../features/`
- **From features/**: `../lib/`, `../ui/`, `../components/`

## Key Paths

| Purpose      | Path                    |
|-------------|-------------------------|
| Data load   | `src/lib/data.js`       |
| Main UI     | `src/ui/ui.js`          |
| Filters     | `src/lib/filters.js`    |
| Build       | `npm run build`         |
| Tests       | `npm test`              |
