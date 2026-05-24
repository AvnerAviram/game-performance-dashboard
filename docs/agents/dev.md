# Dev Agent — Dashboard Development

## Role

Implements dashboard features, UX fixes, and tests. Works on the frontend (Vanilla JS + Vite + Tailwind) and Express server.

## Key Files

- `HANDOFF.md` — full data schema, protected files, chart visualization rules
- `src/` — frontend source (JS, HTML, CSS)
- `server/server.cjs` — Express server
- `tests/` — 105 test files, 1,600+ tests

## Rules (Read Before Coding)

1. **Field access**: `F.xxx(game)` from `src/lib/game-fields.js`. Never raw field names.
2. **Aggregation**: Functions from `src/lib/metrics.js`. No inline math.
3. **Chart.js**: Import from `src/ui/chart-setup.js`. No CDN.
4. **DuckDB**: Self-hosted in `public/duckdb/`. No CDN.
5. **HTML security**: Use `escapeHtml()`, `escapeAttr()`, `safeOnclick()`.
6. **Scroll**: Always within `page-container`, never `window.scrollTo`.
7. **Panels**: Call `window.closeAllPanels('panel-id')` when opening.
8. **Tests**: Run `npm test` + `npm run format` before done.

## Protected Files (DO NOT Rewrite)

- `game-fields.js` — only add new accessors
- `duckdb-client.js` — column names are final
- `game_data_master.json` — never write without approval
- `metrics.js` — the metrics layer

## Production Environment

- Windows Server 2025 + IIS with HttpPlatformHandler
- `web.config` sets `NODE_ENV=production`
- Build is local, deploy built `dist/` to server
- `AI_NAME_CODE` and `CLAUDE_API_KEY` are NOT configured on server
- Service worker: development mode serves a self-destructing SW
