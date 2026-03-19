# Game Analytics Dashboard

Professional analytics dashboard for slot game performance analysis across themes, mechanics, and providers.

## Features

- **Overview**: Key metrics, top performers, franchise breakdowns
- **Themes Analysis**: 138 game themes with performance metrics
- **Mechanics Analysis**: 22 game mechanics with rankings
- **Games & Providers**: Full game catalog and provider comparison
- **Market Insights**: Industry trends, anomalies, feature recipes
- **Game Lab**: Blueprint advisor, prediction model, name generator, concept analyzer
- **Trends**: Historical performance analysis (DuckDB WASM)
- **Tickets**: Feedback/issue tracking with admin management
- **AI Assistant**: Interactive analysis helper (Claude API)

## Quick Start

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env — set SESSION_SECRET and optionally CLAUDE_API_KEY

# Create first admin user
node server/manage-users.cjs add admin

# Development
npm run dev          # Vite dev server on :5173 (frontend only)
npm start            # Express server on :3000 (API + static)

# Production build
npm run build        # Outputs to dist/
```

## Tech Stack

- **Frontend**: Vanilla JS (ES modules), Tailwind CSS, Chart.js, DuckDB WASM
- **Backend**: Express 5, bcryptjs, express-session, Helmet, express-rate-limit
- **Build**: Vite
- **Testing**: Vitest (unit/integration), Playwright (E2E)

## Project Structure

```
game_analytics_export/
├── dashboard.html          # Main SPA shell
├── login.html              # Login page
├── index.html              # Redirect → login
├── data/
│   ├── games_dashboard.json         # Primary game dataset (flat schema)
│   └── theme_consolidation_map.json # Theme mapping
├── src/
│   ├── app.js              # Application entry point
│   ├── lib/                # Core utilities
│   │   ├── api-client.js   # Centralized fetch helper (apiFetch, ApiError)
│   │   ├── auth.js         # Client-side auth (login, logout, session)
│   │   ├── data.js         # Data loading & aggregation
│   │   ├── filters.js      # Theme/mechanic filtering
│   │   ├── sanitize.js     # XSS prevention (escapeHtml, escapeAttr, etc.)
│   │   ├── features.js     # Canonical feature list & colors
│   │   ├── parse-features.js # Safe JSON feature parsing
│   │   ├── symbol-utils.js # Symbol categorization
│   │   ├── game-analytics-engine.js # Success factor analysis
│   │   ├── debounce.js     # Debounce utility
│   │   ├── env.js          # Debug logging helpers
│   │   └── db/duckdb-client.js # DuckDB WASM client
│   ├── ui/                 # UI rendering layer
│   │   ├── ui.js           # Main renderer orchestrator
│   │   ├── router.js       # SPA hash router (page whitelist)
│   │   ├── charts-modern.js # Chart.js visualizations
│   │   ├── chart-utils.js  # Shared chart helpers
│   │   ├── ui-panels.js    # Game/provider detail panels
│   │   ├── panel-details.js # Theme/mechanic panels
│   │   ├── ui-providers-games.js # Providers & games pages
│   │   ├── renderers/      # Page-specific renderers
│   │   └── ...             # Sidebar, search, dark mode, pagination
│   ├── features/           # Feature modules
│   │   ├── tickets.js      # Ticket management UI
│   │   ├── trends.js       # Trends page
│   │   ├── prediction.js   # Game success predictor
│   │   ├── name-generator.js # AI name generator
│   │   ├── ai-assistant.js # AI chat assistant
│   │   └── ...
│   ├── components/         # Reusable UI components
│   └── config/             # Static configuration
├── server/
│   ├── server.cjs          # Express entry point
│   ├── helpers.cjs         # Auth middleware, file I/O helpers
│   ├── manage-users.cjs    # CLI user management tool
│   └── routes/
│       ├── auth.cjs        # Login/logout/session (rate-limited)
│       ├── data.cjs        # Protected data API endpoints
│       ├── tickets.cjs     # Ticket CRUD (admin for write ops)
│       ├── admin.cjs       # User management (admin only)
│       └── ai.cjs          # Claude AI proxy (rate-limited)
└── tests/
    ├── unit/               # Vitest unit tests
    ├── integration/        # Vitest integration tests
    ├── data-validation/    # Data schema & integrity tests
    └── e2e/                # Playwright E2E tests
```

## Security

- Session-based auth with httpOnly cookies
- Helmet CSP + security headers
- Rate limiting on login and write endpoints
- Input validation on all API routes
- XSS prevention via sanitize utilities
- Protected data endpoints (requireAuth/requireAdmin)
- No secrets in source (use `.env`)

## Ranking Formulas

- **Total Theo Win**: `Avg Theo × Game Count` — proven, high-volume markets
- **Avg Theo Win**: Average theoretical win per game — quality over quantity
- **Weighted Theo Win**: `Avg Theo × √(Game Count)` — balanced

## Data

- **999 slot games** analyzed
- **138 themes** (including sub-themes)
- **22 game mechanics**
- Data updated: January 2026

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SESSION_SECRET` | Session signing key (auto-generated if missing) | Recommended |
| `CLAUDE_API_KEY` | Anthropic API key for AI features | No |
| `PORT` | Server port (default: 3000) | No |
| `VITE_DEBUG` | Enable debug logging in browser | No |
| `VITE_SENTRY_DSN` | Sentry DSN for error tracking | No |

Copy `.env.example` to `.env` and adjust as needed. Never commit `.env`.

## Deployment (IIS)

Pre-configured with `web.config` using HttpPlatformHandler:

```bash
npm run build
# Deploy game_analytics_export/ to IIS site
# IIS forwards to Node.js via HttpPlatformHandler on %HTTP_PLATFORM_PORT%
```

## Testing

```bash
npm test                    # Unit + integration tests
npm run test:coverage       # With coverage report
npm run test:e2e            # Playwright E2E (requires server running)
npm run lint                # ESLint
npm run typecheck           # TypeScript checking
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## License

Proprietary — Internal use only
