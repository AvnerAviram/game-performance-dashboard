# Game Analytics Dashboard — Architecture

## Overview

A single-page application (SPA) with hash-based routing, backed by an Express.js server for authentication and data serving.

## Stack

| Layer     | Technology                               |
|-----------|------------------------------------------|
| Frontend  | Vanilla JS (ESM), Vite, Tailwind CSS     |
| Charts    | Chart.js                                 |
| Database  | DuckDB WASM (in-browser analytics)       |
| Backend   | Express.js 5, bcryptjs, express-session  |
| Security  | Helmet (CSP), rate limiting, httpOnly cookies |
| Testing   | Vitest (unit/integration), Playwright (E2E) |

## Architecture Diagram

```
Browser
├── login.html → src/pages/login-page.js → POST /api/login
└── dashboard.html → src/app.js
    ├── src/lib/data.js → DuckDB WASM → /api/data/*
    ├── src/ui/router.js → hash-based SPA routing
    │   └── src/pages/*.html (loaded dynamically)
    ├── src/ui/renderers/ → page-specific renderers
    ├── src/features/ → business logic modules
    └── src/lib/ → core utilities (auth, sanitize, debounce)

Express Server (server/server.cjs)
├── routes/auth.cjs    → login, logout, session
├── routes/tickets.cjs → feedback CRUD
├── routes/admin.cjs   → user management
├── routes/data.cjs    → JSON data serving + health
├── routes/ai.cjs      → Claude API proxy
└── helpers.cjs        → shared middleware & file I/O
```

## Data Flow

1. User logs in → server creates session with httpOnly cookie
2. `app.js` verifies session via `GET /api/session`
3. `data.js` fetches `games_dashboard.json` via `/api/data/games` (auth-gated)
4. DuckDB WASM loads JSON into an in-browser SQL database
5. Renderers query DuckDB for page-specific aggregations
6. Charts render via Chart.js with data from DuckDB queries

## Key Patterns

- **Error boundary**: `router.js` catches page init failures and shows a warning banner instead of crashing
- **XSS prevention**: `sanitize.js` provides `escapeHtml()`, `escapeAttr()`, `sanitizeUrl()` — used in all dynamic HTML
- **Debounce**: Search inputs use `lib/debounce.js` to avoid excessive re-renders
- **Feature constants**: `lib/features.js` centralizes canonical feature lists and short labels (single source of truth)
- **Code splitting**: Vite lazy-loads heavy modules (trends, name-generator, providers-games)
- **No circular deps**: `filter-dropdowns.js` imports directly from renderers, not via `ui.js`

## Security Model

- All data endpoints require valid session
- CSP blocks inline scripts except `'unsafe-inline'` (required for Chart.js tooltips + onclick handlers)
- `'wasm-unsafe-eval'` allowed for DuckDB WASM only
- Rate limiting on login (10 attempts per 15 min)
- Session secret enforced in production (`SESSION_SECRET` env var)
- Request body limited to 100KB
