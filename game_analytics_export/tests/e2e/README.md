# E2E Testing

## Overview

End-to-end tests that exercise the dashboard in a real Chromium browser via Playwright. These catch runtime issues that source-level Vitest tests cannot: CSP violations, DuckDB WASM failures, broken click handlers, missing DOM elements, and page routing errors.

## Quick Start

```bash
# Self-contained: builds, starts server, runs browser tests, shuts down
node tests/e2e/post-build-smoke.mjs    # ~30 seconds

# Or via the full gate (format + vitest + smoke):
npm run test:gate
```

## Test Files

| File | Purpose | Self-contained? | Run with |
|------|---------|-----------------|----------|
| `post-build-smoke.mjs` | **Mandatory gate** — build + serve + 30 browser checks | ✅ Yes | `npm run test:gate` / CI |
| `smoke-e2e.spec.mjs` | Deep interactive tests (cross-panel nav, scoped breadcrumbs, table sort) | ❌ Needs server | `npx playwright test --config=playwright-smoke.config.mjs` |
| `data-integrity.spec.mjs` | Source JSON vs dashboard comparison (GGR share, provider ranking, NaN scan) | ❌ Needs server | `npx playwright test --config=playwright-integrity.config.mjs` |
| `verify-all-features.spec.mjs` | Blueprint advisor flow, sidebar icons, winning combos | ❌ Needs server | `npx playwright test --config=playwright-verify.config.mjs` |

## Post-Build Smoke Test Coverage

`post-build-smoke.mjs` is the mandatory gate. It builds the app, starts the Express server on an isolated port, and runs ~30 checks in headless Chromium:

1. **Login** — page loads, credentials work, redirects to dashboard
2. **Data loading** — `window.gameData` populated, reports DuckDB vs JSON fallback
3. **CSP** — no Content Security Policy violations in console
4. **Data integrity** — overview stats: games > 2000, themes > 20, mechanics > 10
5. **Charts** — canvas elements rendered
6. **All pages** — overview, themes, mechanics, providers, games, insights, game-lab, trends, art load without JS errors
7. **Panel interactions** — theme, provider, and game panels open on click
8. **Data quality** — no `undefined` or `NaN` in visible text across all pages
9. **API auth** — unauthenticated requests to `/api/data/games` and `/api/tickets` return 401
10. **Security headers** — CSP present, allows `extensions.duckdb.org`, no stale CDN refs
11. **Console errors** — zero critical errors across entire session

## Pipeline Integration

```
npm run test:gate
  ├── npm run format:check     (Prettier)
  ├── npm test                 (1205 vitest tests)
  └── post-build-smoke.mjs    (build + browser)

CI (.github/workflows/ci.yml) runs the same sequence.
Pre-commit hook runs format:check + vitest (no build, too slow for commits).
```

## Troubleshooting

**Playwright not installed?**
```bash
npx playwright install chromium
```

**Port 3099 in use?** (smoke test port)
```bash
lsof -ti:3099 | xargs kill -9
```

**DuckDB fails in headless mode?**
The 35MB WASM file sometimes struggles in headless Chromium. The smoke test accepts JSON fallback as long as data loads. DuckDB-specific validation is in `data-integrity.spec.mjs`.
