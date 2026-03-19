# Project Structure

Industry-standard layout for the Game Analytics Dashboard.

## Directory Layout

```
game_analytics_export/
├── src/                    # Application source
│   ├── app.js              # Entry point
│   ├── lib/                # Core logic & data
│   │   ├── auth.js         # Client-side session auth
│   │   ├── data.js         # Data loading (DuckDB WASM)
│   │   ├── db/             # DuckDB client
│   │   ├── debounce.js     # Debounce utility
│   │   ├── env.js          # Environment/debug config
│   │   ├── features.js     # Canonical feature definitions & labels
│   │   ├── filters.js      # Theme/mechanic/provider filters
│   │   ├── game-analytics-engine.js  # Success factor analysis
│   │   ├── parse-features.js         # Feature string parsing
│   │   ├── sanitize.js     # XSS prevention (escapeHtml, sanitizeUrl)
│   │   └── symbol-utils.js # Symbol categorization
│   ├── ui/                 # UI layer
│   │   ├── ui.js           # Re-export orchestrator
│   │   ├── router.js       # SPA router with error boundary
│   │   ├── ui-panels.js    # Game/provider/theme detail panels
│   │   ├── ui-providers-games.js     # Provider & game list pages
│   │   ├── charts-modern.js          # Chart.js visualizations
│   │   ├── filter-dropdowns.js       # Filter population
│   │   ├── search.js       # Search with debounce
│   │   ├── dark-mode.js    # Theme toggle
│   │   ├── sidebar-collapse.js       # Sidebar toggle + flyout
│   │   ├── panel-details.js          # Theme/mechanic panel details
│   │   ├── pagination.js / pagination-state.js
│   │   ├── tooltip-manager.js
│   │   ├── ui-export.js    # CSV export
│   │   └── renderers/      # Page-specific renderers
│   │       ├── overview-renderer.js
│   │       ├── themes-renderer.js
│   │       ├── mechanics-renderer.js
│   │       ├── insights-renderer.js
│   │       └── generate-insights-impl.js  # Game Lab + Insights logic
│   ├── features/           # Feature modules
│   │   ├── auth-ui.js      # Auth UI (user list, admin)
│   │   ├── compat.js       # Data access compat layer
│   │   ├── idea-generator.js         # Build-next / avoid combos
│   │   ├── name-generator.js         # AI name generator
│   │   ├── overview-insights.js      # Overview performance insights
│   │   ├── prediction.js   # Game concept analyzer
│   │   ├── tickets.js      # Feedback ticket UI
│   │   ├── trends.js       # Trend analysis
│   │   └── ai-assistant.js # AI assistant chat
│   ├── components/         # Reusable UI components
│   │   └── dashboard-components.js
│   ├── config/             # Static config
│   │   ├── mechanics.js    # Mechanic definitions & aliases
│   │   └── theme-breakdowns.json
│   ├── pages/              # HTML page templates
│   └── assets/
├── server/                 # Express.js backend
│   ├── server.cjs          # Server orchestrator (middleware, startup)
│   ├── helpers.cjs         # Shared utilities (load/save, auth middleware)
│   ├── routes/
│   │   ├── auth.cjs        # Login, logout, session
│   │   ├── tickets.cjs     # Ticket CRUD
│   │   ├── admin.cjs       # User management
│   │   ├── data.cjs        # Data file serving + health
│   │   └── ai.cjs          # Claude API proxy
│   ├── manage-users.cjs    # CLI user management
│   └── users.json          # User credentials (gitignored)
├── data/                   # Game data (JSON)
├── scripts/                # Build, verification, data scripts
│   ├── build/
│   ├── data/
│   ├── scrapers/
│   └── test/
├── tests/
│   ├── unit/               # Unit tests (vitest)
│   ├── integration/        # Server integration tests
│   ├── e2e/                # Playwright E2E
│   ├── data-validation/    # Data quality tests
│   ├── utils/              # Test helpers
│   └── setup.js            # Vitest setup
├── docs/
├── dashboard.html          # Main SPA shell
├── login.html              # Login page
└── index.html              # Landing redirect
```

## Import Conventions

- **Entry** (`app.js`): `./lib/`, `./ui/`, `./features/`
- **From lib/**: `./data.js`, `../config/`
- **From ui/**: `../lib/`, `../components/`, `../features/`
- **From features/**: `../lib/`, `../ui/`, `../components/`
- **No circular deps**: `filter-dropdowns.js` imports from renderers directly, not via `ui.js`

## Key Commands

| Purpose       | Command                  |
|---------------|--------------------------|
| Dev server    | `npm run dev`            |
| Build         | `npm run build`          |
| Start prod    | `npm start`              |
| Lint          | `npm run lint`           |
| Unit tests    | `npm run test:unit`      |
| All tests     | `npm run test:all`       |
| E2E tests     | `npm run test:e2e`       |
| Coverage      | `npm run test:coverage`  |
