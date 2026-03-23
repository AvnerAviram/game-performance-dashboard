# E2E Testing

## Overview

End-to-end tests that exercise the dashboard in a real Chromium browser via Playwright. These catch runtime TypeErrors, missing DOM elements, broken click handlers, and field-name mismatches that source-level Vitest tests cannot.

## Quick Start

```bash
# 1. Start the server (in a separate terminal)
npm start                   # Express on port 3000

# 2. Run the smoke test
npm run test:smoke          # ~24 seconds
```

## Test Files

| File | Purpose | Run with |
|------|---------|----------|
| `smoke-e2e.spec.mjs` | Comprehensive smoke test (12 areas) | `npm run test:smoke` |
| `test-production.mjs` | Production readiness checks | `npm run test:e2e` |
| `data-integrity.spec.mjs` | Data integrity verification | Custom Playwright config |
| `verify-all-features.spec.mjs` | Feature verification | Custom Playwright config |
| `dashboard-navigation.spec.js` | Navigation and page load tests | Custom Playwright config |

## Smoke Test Coverage

`smoke-e2e.spec.mjs` logs in once, then exercises every major interactive feature:

1. **Page navigation** -- all 6 pages load without JS errors
2. **Theme panel** -- click `.theme-link` on Themes table, verify panel opens with content
3. **Mechanic panel** -- click `.mechanic-link`, verify panel opens
4. **Provider panel** -- click provider name, verify panel opens
5. **Game panel** -- click game name, verify panel opens with performance data
6. **Cross-panel: theme** -- open theme panel via JS, verify it works
7. **Cross-panel: theme to provider** -- click provider inside theme panel
8. **Scoped breadcrumb** -- provider panel opens scoped theme, verify `>` separator in title; click theme name to remove scope
9. **Overview cards** -- clickable theme cards on overview page
10. **Insights links** -- clickable theme links on insights page
11. **Filter switching** -- switch theme view (all/leaders/opportunities/premium)
12. **Table sorting** -- sort themes table by clicking column header

A JS error listener runs throughout; any `pageerror` fails the test.

## Configuration

- **Config:** `playwright-smoke.config.mjs`
- **Base URL:** `http://localhost:3000`
- **Browser:** Chromium (headless)
- **Timeout:** 120s (test), with internal waits between actions
- **Screenshots:** Captured on failure

## Integration with Test Pipeline

```bash
npm run test:all    # Runs: vitest run && playwright smoke test
```

The smoke test is included in `test:all` and runs after Vitest completes.

## Troubleshooting

**Server not running?**
```bash
npm start    # Express on port 3000 (NOT python http.server)
```

**Login fails?**
Check `.env` has valid test credentials. The smoke test uses `e2e_test_user`.

**Playwright not installed?**
```bash
npx playwright install chromium
```

**Port 3000 in use?**
```bash
lsof -ti:3000 | xargs kill -9
npm start
```
