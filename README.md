# Game Analytics Dashboard

Internal analytics dashboard for slot game performance tracking. **4,550 games** with performance metrics, features, themes, and art characterization.

Built with Vanilla JS, Vite, Tailwind CSS, DuckDB WASM. Deployed to Windows Server 2025 (IIS) with Node.js authentication.

> For AI agents → read `AGENTS.md`
> For agent system overview → read `agents/README.md`

## Quick Start (Development)

```bash
cd game_analytics_export
npm install
npm run dev          # Vite dev server on http://localhost:5173
```

With auth server (production-like):

```bash
cd game_analytics_export
npm run build
npm run server       # http://localhost:3000
```

Create users:

```bash
node server/manage-users.cjs add <username>    # prompts for password
node server/manage-users.cjs list
```

## Project Structure

```
.
├── AGENTS.md                        # AI agent entry point
├── MASTER_PLAN.md                   # Living project backlog
├── HANDOFF.md                       # Full data schema (3 layers)
├── agents/                          # Agent role definitions + system README
│
├── game_analytics_export/           # Main application
│   ├── src/
│   │   ├── pages/                   #   14 dashboard pages (HTML)
│   │   ├── lib/                     #   Core: game-fields, metrics, filters, DuckDB, auth
│   │   ├── features/                #   Page logic: name-gen, trends, game-lab, x-ray
│   │   ├── ui/                      #   Charts, panels, routing, dark mode, search
│   │   └── config/                  #   Theme breakdowns, mechanics, provider URLs
│   ├── server/
│   │   ├── server.cjs               #   Express server (session auth, helmet, rate limiting)
│   │   └── routes/                  #   Auth, tickets, AI API routes
│   ├── data/
│   │   ├── game_data_master.json    #   Source of truth (4,550 games)
│   │   ├── eilers_source.csv        #   Original Eilers performance CSV
│   │   ├── classify_art.py       #   Art classification pipeline (Claude Vision)
│   │   ├── extract_game_profile.py  #   Features/themes extraction pipeline (Claude)
│   │   ├── sc_extract.py            #   SlotCatalog extraction + 95% F1 gate
│   │   ├── ground_truth_ags.json    #   Ground truth (228 games, 207 with features)
│   │   ├── art_pipeline/            #   Art results (2,701 games), reviews, corrections, gate
│   │   ├── screenshots/             #   2,760 game screenshots
│   │   └── rules_html/              #   8,860 HTML rules pages
│   ├── tests/                       #   105 test files, 1,607 tests (vitest)
│   ├── deploy/                      #   IIS deployment (PowerShell, nginx)
│   └── public/duckdb/               #   Self-hosted DuckDB WASM
│
├── .cursor/rules/                   # AI enforcement rules (always-loaded)
├── .cursor/hooks/                   # Automated guardrails (5 hooks)
├── docs/                            # Active reference docs + archive
└── scripts/                         # Standalone validation scripts
```

## Dashboard Pages

- **Overview** — Quick stats, top performers, brand intelligence, insight cards
- **Games** — Full searchable/sortable game database with detail panels
- **Themes** — Theme performance analysis with sub-theme breakdowns
- **Mechanics** — Game mechanic rankings and comparisons
- **Providers** — Provider and studio comparison
- **Insights** — Market insights, provider matrix, brand intelligence, opportunity finder
- **Art Insights** — Art characterization analytics (themes, elements, characters, colors)
- **Game Lab** — Blueprint Advisor, feature recipes, winning combinations, specs analysis
- **Name Generator** — AI-assisted game name generation (with image upload)
- **Trends** — Historical trend analysis
- **Prediction** — Performance prediction
- **AI Assistant** — AI-powered analysis
- **Anomalies** — Anomaly detection
- **Tickets** — QA ticket tracking

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla JS, Tailwind CSS |
| Build | Vite |
| Data | DuckDB WASM (self-hosted), JSON, Parquet |
| Auth | Express + express-session + bcryptjs |
| Security | Helmet, CSP, express-rate-limit, HTML sanitization |
| Hosting | IIS (HttpPlatformHandler) on Windows Server 2025 |
| Tests | Vitest (1,607 tests), Playwright (E2E) |
| AI Pipelines | Python + Claude API (art classification, feature extraction) |

## Testing

```bash
cd game_analytics_export

npm test                  # All tests (1,607 across 105 files)
npm run format:check      # Prettier formatting check
npm run format            # Auto-fix formatting
```

Test categories: unit (52), data-validation (35), enforcement (16), integration (17), visual-regression (2), components (1), alignment (1), monitoring (1).

## AI Classification Pipelines

### Art Pipeline (`classify_art.py`)
Classifies game visual art across 7 dimensions (theme, characters, elements, colors, mood, narrative, style) using Claude Vision. 2,701 games classified. Quality gate: theme ≥97% AND overall ≥95% adjusted accuracy.

### Features Pipeline (`extract_game_profile.py`)
Extracts game features/mechanics and themes from HTML rules pages using Claude. Quality gate: 95% micro F1 against ground truth (228 games). Current benchmark: 97.0% F1.

## Deployment

```bash
cd game_analytics_export
npm run release           # Build + package release zip
```

Deploy to Windows Server 2025 + IIS:
- `web.config` configures HttpPlatformHandler → Node.js
- `deploy/install.ps1` for first-time IIS setup
- `deploy/deploy.ps1` for updates
- Build is local → deploy `dist/` to server

See `deploy/DEPLOY_CHECKLIST.md` for full instructions.

## Security

- Session authentication (bcrypt hashed passwords)
- Login rate limiting (25 attempts / 15 min)
- Helmet security headers + Content Security Policy
- XSS prevention via `escapeHtml()` / `escapeAttr()` / `safeOnclick()`
- Build script only copies frontend-required data (no `.env` or pipeline files)
- IIS `web.config` blocks `.env`, `.git`, `node_modules` paths
