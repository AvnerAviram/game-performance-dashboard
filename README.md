# Game Analytics Dashboard

Internal analytics dashboard for slot game performance tracking. Built with Vanilla JS, Vite, Tailwind CSS, and DuckDB WASM. Deployed to Windows Server (IIS) with Node.js authentication.

## Quick Start (Development)

```bash
cd game_analytics_export
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

Or with the auth server (production-like):

```bash
cd game_analytics_export
npm run build
npm run server           # http://localhost:3000
```

Create a user to log in:

```bash
node server/manage-users.cjs add <username>    # prompts for password
node server/manage-users.cjs list              # show all users
node server/manage-users.cjs remove <username> # remove a user
```

## Project Structure

```
game-performace-dashboard/
├── game_analytics_export/        # Main application
│   ├── dashboard.html            # Dashboard SPA entry point
│   ├── login.html                # Login page
│   ├── src/
│   │   ├── app.js                # App bootstrap
│   │   ├── ui/                   # UI rendering (tables, panels, charts)
│   │   ├── lib/                  # Core logic (auth, data, filters, DuckDB, sanitize)
│   │   ├── features/             # Feature modules (overview, trends, idea generator)
│   │   ├── components/           # Reusable UI components
│   │   ├── config/               # Theme breakdowns, mechanic taxonomy
│   │   └── pages/                # HTML page templates
│   ├── server/
│   │   ├── server.cjs            # Express auth server (session-based)
│   │   └── manage-users.cjs      # CLI for user management
│   ├── data/
│   │   ├── games_dashboard.json  # Enriched game data (642 games)
│   │   ├── theme_consolidation_map.json
│   │   ├── enrich_websearch.py   # AI enrichment pipeline
│   │   └── PHASE1_TRUTH_MASTER.md  # Pipeline runbook
│   ├── tests/                    # Vitest + Playwright test suites
│   ├── deploy/                   # Deployment configs (Nginx, PowerShell)
│   ├── web.config                # IIS HttpPlatformHandler config
│   └── package.json
├── docs/                         # Documentation & verification reports
└── HANDOFF.md                    # Project overview and context
```

## Dashboard Pages

- **Overview** -- Quick stats, top performers, insight cards
- **Games** -- Full searchable/sortable game database with detail panels
- **Themes** -- Theme performance analysis with sub-theme breakdowns
- **Mechanics** -- Game mechanic rankings and comparisons
- **Providers** -- Provider and studio comparison
- **Anomalies** -- High/low performance outliers with success factor analysis
- **Insights** -- Market insights, top performers, opportunity finder
- **Prediction** -- Game success prediction tool
- **Idea Generator** -- Theme+mechanic combo heatmap and opportunity explorer

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla JS, Tailwind CSS |
| Build | Vite |
| Data | DuckDB WASM (loaded from CDN), JSON |
| Auth | Express + express-session + bcryptjs |
| Security | Helmet, express-rate-limit, HTML escaping (sanitize.js) |
| Hosting | IIS (HttpPlatformHandler) on Windows Server |
| Tests | Vitest (261 tests), Playwright (E2E) |
| Enrichment | Python + Claude API (Sonnet extraction, Haiku normalization) |

## Testing

```bash
cd game_analytics_export

npm run test:vitest       # Unit + integration + data validation (261 tests)
npm run test:e2e          # Playwright E2E tests
npm run test:unit         # Unit tests only
npm run test:validation   # Data validation only
```

## Deployment (IIS on Windows Server)

Prerequisites:
- Windows Server 2012 R2+ with IIS and SSL
- HttpPlatformHandler module installed
- Node.js 20+ installed

```powershell
# On the server:
node server\manage-users.cjs add avner     # Create first user
node server\manage-users.cjs add analyst1  # Add more users
node server\manage-users.cjs list          # List all users
```

See `deploy/deploy.ps1` for the full deployment script and `web.config` for IIS configuration.

## Enrichment Pipeline

The AI enrichment pipeline in `data/enrich_websearch.py` uses a 2-stage approach:

1. **Stage 1 (Sonnet)** -- Web search + extraction of themes, features, specs
2. **Stage 2 (Haiku)** -- Normalization against canonical taxonomy

See `data/PHASE1_TRUTH_MASTER.md` for the full pipeline runbook.

## Security

- Server-side session authentication (bcrypt hashed passwords)
- Login rate limiting (10 attempts / 15 min)
- Helmet security headers
- XSS prevention via `escapeHtml()` / `safeOnclick()` across all UI
- Build script only copies frontend-required data (no `.env` or pipeline files)
- IIS `web.config` blocks `.env`, `.git`, `node_modules` paths
- `robots.txt` disallows all crawlers
