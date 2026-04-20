# Security Remediation -- Agent Execution Prompt

## Context

A thorough multi-pass security audit was performed on the Game Analytics Dashboard. The audit conversation is at agent transcript `835dc60c-2e76-4483-b9fa-f97ff2f2bf75`. The validated remediation plan is at `/Users/avner/.cursor/plans/security_remediation_plan_cd172344.plan.md`.

This prompt contains everything you need to execute Fixes 1-5 without asking the user questions. Fix 6 (CSP tightening) is deferred to a separate session.

## Critical Rules

1. **Never commit** unless the user explicitly tells you to.
2. **Run `npm run format` then `npm test`** after every fix. All 1,600+ tests must pass.
3. Follow workspace rules in `.cursor/rules/` (4-space indent, single quotes, semicolons, `F.xxx()` for field access, `Chart` from `chart-setup.js`).
4. This is a Node.js/Express + Vite + DuckDB WASM project. Server code is CommonJS (`.cjs`). Client code is ES modules.
5. Working directory for all commands: `game_analytics_export/`

---

## Fix 1: Login Rate Limiter (LOW RISK)

### Problem
`/api/login` has no rate limiting. Brute-force attacks are trivial.

### File to change
`server/server.cjs`

### Current state
Lines 107-118 define `writeLimiter` (60 req/15min) applied to `/api/tickets`, `/api/admin`, `/api/generate-names`, `/api/trademark-check`. There is NO rate limiter on `/api/login`. The `rateLimit` import already exists at line 17.

### Exact change
After line 118 (`app.use('/api/trademark-check', writeLimiter);`), add:

```js
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 25,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again later.' },
});
app.use('/api/login', loginLimiter);
```

### New test
Add to `tests/integration/server-security.test.js` a test that verifies the `RateLimit-Policy` header is present on `/api/login` POST responses.

### Regression risk
None. Integration tests make ~6 login calls, well under 25.

### Verify
```bash
npm run format && npm test
```

---

## Fix 2: Session Regeneration (MEDIUM RISK)

### Problem
After successful login, the session ID is not regenerated. This allows session fixation attacks (CWE-384).

### File to change
`server/routes/auth.cjs`

### Current state (lines 25-29)
```js
        req.session.user = { username: user.username, role: user.role || 'user' };
        if (req.body.remember) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        }
        res.json({ success: true, user: { username: user.username, role: user.role || 'user' } });
```

### Exact change
Replace lines 25-29 with:

```js
        const userData = { username: user.username, role: user.role || 'user' };
        req.session.regenerate(err => {
            try {
                if (err) return res.status(500).json({ error: 'Internal server error' });
                req.session.user = userData;
                if (req.body.remember) {
                    req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
                }
                res.json({ success: true, user: userData });
            } catch (innerErr) {
                console.error('[ERROR] Login session regeneration failed:', innerErr.message);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
```

TWO IMPORTANT NOTES:
1. `userData` must be captured BEFORE `regenerate()` because the old session is destroyed inside the callback.
2. The `regenerate()` callback runs OUTSIDE the outer try/catch (it's a Node-style callback, not awaited). Errors inside the callback would be uncaught without the inner try/catch. This is why we add explicit error handling inside the callback.

### New test
Add to `tests/integration/server-security.test.js`: login twice with the same user, extract the `set-cookie` header from each response, verify the session IDs differ.

### Regression risk
- The integration test at line 141-146 of `server-security.test.js` logs in during `beforeAll` and saves the cookie. This still works because it reads the RESPONSE cookie.
- The "remember me" feature works because `maxAge` is set AFTER regeneration on the new session.

### Verify
```bash
npm run format && npm test
```

---

## Fix 3: CSRF Header Protection (HIGH RISK -- most dangerous change)

### Problem
No CSRF protection. A malicious site can submit POST forms to `/api/` endpoints using the user's session cookie.

### This fix touches 4 files + 2 test files simultaneously.

### Step 3a: Server middleware

**File:** `server/server.cjs`

Add this middleware AFTER request logging (line 105) but BEFORE the rate limiters (line 107). Place it at line 106 (between logging and rate limiting) so that CSRF rejections are logged:

```js
app.use('/api/', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.headers['x-requested-with'] === 'XMLHttpRequest') return next();
    return res.status(403).json({ error: 'Missing required header' });
});
```

### Step 3b: Client -- api-client.js

**File:** `src/lib/api-client.js` (lines 25-28)

**Current:**
```js
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
```

**Change to:**
```js
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            ...options.headers,
        },
```

This single change covers ALL callers that go through `apiFetch` (which `apiPost`, `apiPatch`, `apiDelete` all call internally) — approximately 33 call sites across the codebase (xray-panel, ui-panels, name-generator, auth-ui, tickets). Also covers `auth-ui.js`'s `apiFetch` with `method: 'PUT'` for password updates. Do not enumerate exact counts; the header fix is global via api-client.js and covers all current and future callers that use it.

### Step 3c: Client -- auth.js

**File:** `src/lib/auth.js`

Two raw `fetch()` calls that bypass `api-client.js`:

**login() at line 20 -- change:**
```js
            headers: { 'Content-Type': 'application/json' },
```
**to:**
```js
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
```

**logout() at line 40 -- change:**
```js
        await fetch('/api/logout', { method: 'POST' });
```
**to:**
```js
        await fetch('/api/logout', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
```

### Step 3d: CRITICAL -- Fix integration test helpers

WITHOUT THIS, ALL EXISTING POST TESTS GET 403 AND THE ENTIRE SUITE FAILS.

**File 1:** `tests/integration/server-security.test.js`

The `httpReq()` function at line 24. Currently builds headers as `{ ...headers }`. For non-GET methods that send a payload, it adds `Content-Type` and `Content-Length`. You must also add `'X-Requested-With': 'XMLHttpRequest'` when the method is not GET/HEAD/OPTIONS.

Change the function so that for methods other than GET, the headers include `'X-Requested-With': 'XMLHttpRequest'`. The simplest approach: after line 32 (`headers: { ...headers },`), add logic to include the CSRF header for non-GET methods. For example, change line 32 from:
```js
        headers: { ...headers },
```
to:
```js
        headers: {
            ...(!['GET', 'HEAD', 'OPTIONS'].includes(method) && { 'X-Requested-With': 'XMLHttpRequest' }),
            ...headers,
        },
```

**File 2:** `tests/integration/api-endpoints.test.js`

The `httpPost()` function at line 39. Add `'X-Requested-With': 'XMLHttpRequest'` to the headers object at line 50:

**Current (lines 49-53, headers object spans through `Content-Length`):**
```js
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
```
(Note: the full object also includes a `Content-Length` entry ending at line 53 — do not truncate your edit.)
**Change to:**
```js
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    ...headers,
```

### Step 3e: New tests

Add to `server-security.test.js`:

1. Test that POST `/api/login` WITHOUT `X-Requested-With` returns 403
2. Test that POST `/api/login` WITH the header succeeds normally
3. Test that GET `/api/session` works WITHOUT the header (CSRF only blocks state-changing methods)

### Step 3f: Verification grep

After all changes, confirm no raw POST fetches were missed:
```bash
grep -rn "fetch('/api/" src/ | grep -i post
```
Expected result: only `src/lib/auth.js` (2 hits, both now have the header).

### Raw fetch calls that are SAFE (all GETs, CSRF middleware skips GETs):
- `src/lib/db/duckdb-client.js` -- 4 GET fetches for data files
- `src/ui/renderers/xray-panel.js` -- 1 GET for rules-text
- `src/ui/panel-details.js` -- 1 GET for theme-breakdowns
- `src/features/data-xray.js` -- 1 GET for provenance
- `src/lib/auth.js` `verifySession()` -- 1 GET for `/api/session`

### Verify
```bash
npm run format && npm test
```

---

## Fix 4: Require SESSION_SECRET Always (LOW RISK)

### Problem
In non-production, the server falls back to `crypto.randomBytes(32)` for the session secret. Sessions don't persist across restarts and devs don't notice the missing config.

### Step 4a: Server change

**File:** `server/server.cjs` (lines 66-72 + line 82)

**Current (lines 66-72):**
```js
if (IS_PROD && !process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET must be set in production. Exiting.');
    process.exit(1);
}
if (!process.env.SESSION_SECRET) {
    console.warn('⚠️  SESSION_SECRET not set — sessions will not persist across restarts.');
}
```

**Replace with:**
```js
if (!process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET must be set. Exiting.');
    process.exit(1);
}
```

**Current (line 82):**
```js
        secret: process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex'),
```

**Replace with:**
```js
        secret: process.env.SESSION_SECRET,
```

### Step 4b: Update 5 server spawn locations

These will CRASH without `SESSION_SECRET` after the change:

**1. `tests/integration/server-security.test.js` line 132:**
```js
// Current:
            env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'test' },
// Change to:
            env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'test', SESSION_SECRET: 'test-secret' },
```

**2. `tests/integration/api-endpoints.test.js` line 112:**
```js
// Current:
            env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'test' },
// Change to:
            env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'test', SESSION_SECRET: 'test-secret' },
```

**3. `tests/e2e/post-build-smoke.mjs` line 55:**
```js
// Current:
        env: { ...process.env, PORT: String(PORT) },
// Change to:
        env: { ...process.env, PORT: String(PORT), SESSION_SECRET: 'test-secret' },
```

**4. `package.json` line 19:**
```json
// Current:
"serve:e2e": "npm run build && PORT=8000 node server/server.cjs"
// Change to:
"serve:e2e": "npm run build && SESSION_SECRET=test-secret PORT=8000 node server/server.cjs"
```

**5. `playwright.config.js`** -- uses `npm run serve:e2e`, so it's covered by #4.

### Step 4c: Check auth-server.test.js

`tests/unit/auth-server.test.js` line 62-64 only asserts `process.env.SESSION_SECRET` appears in the source text. Our change keeps that string, so this test still passes. NO update needed.

### New test
Add to `server-security.test.js`: spawn a server process WITHOUT `SESSION_SECRET` in the env, verify it exits with a non-zero code.

### Verify
```bash
npm run format && npm test
```

---

## Fix 5: Dynamic E2E Test Users (MEDIUM RISK)

### Problem
12 E2E spec files have hardcoded usernames and passwords (e.g., `e2e_test_user` / `e2eTestPass123!`). These credentials are committed to git.

### Current pattern (already in use)
The E2E specs ALREADY create users dynamically in `beforeAll` by directly writing to `users.json`:
```js
const CREDS = { username: 'e2e_test_user', password: 'e2eTestPass123!' };
test.beforeAll(async () => {
    let users = [];
    try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')); } catch {}
    if (!users.find(u => u.username === CREDS.username)) {
        const hash = await bcryptjs.hash(CREDS.password, 10);
        users.push({ username: CREDS.username, passwordHash: hash, role: 'admin' });
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
});
```

### Important: manage-users.cjs does NOT support --password flag
`server/manage-users.cjs` uses interactive `readline` prompts for the password. You CANNOT pass the password via CLI args. The E2E specs already work around this by directly writing to `users.json` using `bcryptjs.hash()`. The helper must use the same approach.

### Strategy
Create a shared helper that uses `bcryptjs` + direct `fs` writes (same pattern the specs already use), but centralized:

**Create new file:** `tests/e2e/helpers/test-user.mjs`
```js
import bcryptjs from 'bcryptjs';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_FILE = resolve(__dirname, '../../../server/users.json');

export async function ensureTestUser(username, password, role = 'admin') {
    let users = [];
    try {
        users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch {
        // File missing or corrupt -- start fresh
    }
    if (!users.find(u => u.username === username)) {
        const hash = await bcryptjs.hash(password, 10);
        users.push({ username, passwordHash: hash, role });
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    }
    return { username, password };
}

export function removeTestUser(username) {
    let users = [];
    try {
        users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch {
        return;
    }
    const filtered = users.filter(u => u.username !== username);
    if (filtered.length !== users.length) {
        fs.writeFileSync(USERS_FILE, JSON.stringify(filtered, null, 2));
    }
}
```

**Then update each E2E spec** to:
1. Import `ensureTestUser` / `removeTestUser` from the helper
2. Use a unique prefixed username (e.g., `__e2e_smoke__`)
3. Call `ensureTestUser` in `beforeAll`, `removeTestUser` in `afterAll`
4. Remove the inline `bcryptjs`, `fs`, and `USERS_FILE` imports and user creation code

### E2E spec files to update (12 files):

**Group A -- Playwright specs with inline user creation (already have beforeAll pattern):**
1. `tests/e2e/smoke-e2e.spec.mjs` -- `e2e_test_user` (no beforeAll user creation -- just uses hardcoded CREDS)
2. `tests/e2e/xray-drilldown.spec.mjs` -- `e2e_test_user` (has beforeAll user creation)
3. `tests/e2e/xray-all-pages.spec.mjs` -- `e2e_test_user` (has beforeAll user creation)
4. `tests/e2e/xray-click-everything.spec.mjs` -- `e2e_test_user` (has beforeAll user creation)
5. `tests/e2e/xray-click-surface.spec.mjs` -- `e2e_xray_surface` (has beforeAll user creation)
6. `tests/e2e/xray-data-driven.spec.mjs` -- `e2e_data_driven` (has beforeAll user creation)
7. `tests/e2e/verify-all-features.spec.mjs` -- `e2e_test_user` (no beforeAll -- just uses CREDS)
8. `tests/e2e/verify-ui-placement.spec.mjs` -- `e2e_test_user` (no beforeAll)
9. `tests/e2e/data-integrity.spec.mjs` -- `e2e_test_user` (no beforeAll)

**Group B -- Raw scripts (not Playwright test runner), NO beforeAll user creation:**
10. `tests/e2e/take-screenshots.mjs` -- `e2e_test_user` (hardcoded inline strings, no CREDS object, no beforeAll)
11. `tests/e2e/validate-sort-consistency.mjs` -- uses `avner` account (no beforeAll)
12. `tests/e2e/post-build-smoke.mjs` -- uses `avner` account (no beforeAll)

**Note on files 10-12:** These are standalone scripts, not Playwright specs. They don't use `test.beforeAll`.
- File 10: Replace inline `e2e_test_user` strings with the helper pattern (call `ensureTestUser` at the start of the script, `removeTestUser` at the end).
- Files 11-12: These use the `avner` account. Leave these as-is since they need the real admin user. Just ensure they don't hardcode the password if it can be read from env (e.g., `process.env.E2E_PASS || 'avner'`).

**After updating:** Remove the `e2e_*` entries from `server/users.json` (keep only `avner`).

### Verify
```bash
npm run format && npm test
npx playwright test tests/e2e/smoke-e2e.spec.mjs --project=chromium
```

---

## Fix 6: CSP Tightening (DEFERRED)

DO NOT execute this fix. It requires removing `'unsafe-inline'` and `'unsafe-eval'` from `script-src` in both `server/server.cjs` (Helmet config, line 45) and `vercel.json`. This could break:
- DuckDB WASM loading (entire dashboard goes blank)
- All `safeOnclick()` inline handlers from `src/lib/sanitize.js` (~37 files use it)
- The enforcement test `tests/enforcement/deployment-readiness.test.js` line 36-38 asserts `unsafe-eval` in `script-src`

This needs its own dedicated planning session.

---

## Execution Checklist

Execute in order: Fix 1, Fix 2, Fix 3, Fix 4, Fix 5.

After EACH fix:
```bash
cd game_analytics_export
npm run format
npm test
npm run format:check
```
Verify the vitest output shows 0 failures and no new skipped tests.

After ALL 5 fixes:
```bash
npm run build
npm run test:gate
npx playwright test tests/e2e/smoke-e2e.spec.mjs --project=chromium
```
If Playwright fails, diagnose and fix. You have full authority to add/modify tests.

### Do NOT commit unless the user explicitly asks you to.

---

## Key Files Quick Reference

| File | What it is | Which fixes |
|------|-----------|-------------|
| `server/server.cjs` | Main Express server (223 lines) | Fix 1, 3, 4 |
| `server/routes/auth.cjs` | Login/logout/session routes (50 lines) | Fix 2 |
| `src/lib/api-client.js` | Centralized fetch wrapper (84 lines) | Fix 3 |
| `src/lib/auth.js` | Client auth with raw fetch (111 lines) | Fix 3 |
| `tests/integration/server-security.test.js` | Integration tests + server spawn | Fix 3 (httpReq helper), Fix 4 (env), new tests |
| `tests/integration/api-endpoints.test.js` | API integration tests + server spawn | Fix 3 (httpPost helper), Fix 4 (env) |
| `tests/unit/api-client.test.js` | Unit tests for api-client | Fix 3 (add header assertion) |
| `tests/unit/auth-client.test.js` | Unit tests for auth.js | Fix 3 (add header assertion) |
| `tests/unit/auth-server.test.js` | Source string checks | Verify no breakage from Fix 4 |
| `tests/e2e/post-build-smoke.mjs` | E2E server spawn | Fix 4 (env) |
| `package.json` | serve:e2e script | Fix 4 (add SESSION_SECRET) |
| `playwright.config.js` | Playwright webServer config | Covered by package.json Fix 4 |
| `server/users.json` | User accounts (gitignored) | Fix 5 |
| `tests/e2e/*.spec.mjs` + `*.mjs` | 12 E2E specs with hardcoded CREDS | Fix 5 |
| `server/manage-users.cjs` | CLI for user CRUD | Fix 5 (used by helper) |
| `tests/enforcement/deployment-readiness.test.js` | CSP enforcement | Fix 6 only (deferred) |

---

## Risk Summary

| Fix | Risk | Danger |
|-----|------|--------|
| Fix 1 | LOW | Server-side only. No client impact. |
| Fix 2 | MEDIUM | Session cookie changes after login. Browser handles automatically. Verify "remember me" works. |
| Fix 3 | HIGH | If ANY POST/PATCH/DELETE fetch call misses the header, that feature silently returns 403. All 7 raw GET fetches are safe. Only `auth.js` has raw POST fetches outside `api-client.js`. |
| Fix 4 | LOW | Server won't start without SESSION_SECRET. 5 spawn locations must be updated simultaneously. |
| Fix 5 | MEDIUM | Test infrastructure only. Back up `users.json` before modifying. |
| Fix 6 | HIGHEST | DEFERRED. Could break entire dashboard. |
