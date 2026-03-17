# Game Analytics Dashboard

Professional analytics dashboard for slot game performance analysis across themes and mechanics.

## Features

- **Overview**: Key metrics and top performers
- **Themes Analysis**: 138 game themes with performance metrics
- **Mechanics Analysis**: 22 game mechanics with rankings
- **Anomalies**: Statistical outliers and opportunities
- **Trends**: Historical performance analysis
- **Insights**: Market analysis and opportunities
- **Prediction**: Game success predictor
- **AI Assistant**: Interactive analysis helper

## Quick Start

**Development (recommended):**
```bash
npm run dev
# Open http://localhost:5173/dashboard.html
```

**Production build:**
```bash
npm run build
npm run preview   # Serve dist/ at http://localhost:4173
```

**Legacy (no Vite):**
```bash
npm run build:css && npm run serve
# Open http://localhost:8000/dashboard.html
```

## Tech Stack

- Vite for dev server & production build
- ES modules, Tailwind CSS, Chart.js
- DuckDB WASM for analytics

## File Structure

```
game_analytics_export/
├── index.html              # Main dashboard
├── data/
│   ├── games_master.json   # Primary game data (DuckDB source)
│   └── CSV_CORRECTIONS_LOG.json
└── src/
    ├── app.js              # Application entry point
    ├── data.js             # Data loading & aggregation
    ├── ui.js               # UI rendering & interactions
    ├── charts-modern.js    # Chart.js visualizations
    ├── trends.js           # Trends analysis
    ├── interactions.js     # Event handlers
    ├── config/
    │   ├── mechanics.js             # Mechanics definitions
    │   └── theme-breakdowns.json    # Theme hierarchies
    └── *.css               # Styles (minimal, modular)
```

## Ranking Formulas

**Total Theo Win** (Default)
- Formula: `Avg Theo × Game Count`
- Use: Identifies proven, high-volume markets

**Avg Theo Win**
- Formula: `Average theoretical win per game`
- Use: Quality over quantity

**Weighted Theo Win**
- Formula: `Avg Theo × √(Game Count)`
- Use: Balances quality and volume

## Data

- **999 slot games** analyzed
- **138 themes** (including sub-themes)
- **22 game mechanics**
- Data updated: January 2026

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_DEBUG` | Set to `true` for debug logging | No (default: off) |
| `VITE_SENTRY_DSN` | Sentry DSN for error tracking in production | No |

Copy `.env.example` to `.env` and adjust as needed. Never commit `.env`.

## Deployment

**Vercel (recommended):**
```bash
# Connect repo to Vercel; vercel.json is pre-configured
# Build: npm run build | Output: dist/
```

**Netlify:** Use build command `npm run build`, publish directory `dist`.

**Manual:** Run `npm run build`, deploy the `dist/` folder to any static host.

## Production Ready

- ✅ Vite build pipeline
- ✅ TypeScript config (gradual migration ready)
- ✅ ESLint + typecheck + CI
- ✅ Unit + E2E + Lighthouse CI
- ✅ Security: CSP (base-uri, form-action, upgrade-insecure-requests), X-Frame-Options, etc.
- ✅ Accessibility: role="main", aria-live, focus-visible, skip link
- ✅ Health check: `/api/health` (Vercel) or `/health.json` (static)
- ✅ Optional Sentry error tracking
- ✅ Fully responsive

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## License

Proprietary - Internal use only
