# Security Agent — Security Hardening & Audit

## Role

Audits and hardens the application's security posture. Reviews server config, auth, input sanitization, CSP, rate limiting, and data protection.

## Key Files

- `server/server.cjs` — Express server (helmet, CSP, rate limiters, session, auth)
- `server/routes/auth.cjs` — Authentication routes
- `src/lib/sanitize.js` — HTML sanitization (`escapeHtml`, `escapeAttr`, `safeOnclick`)
- `src/lib/auth.js` — Client-side auth
- `deploy/install.ps1` — First-time IIS setup (SESSION_SECRET, .env creation)

## Security Infrastructure Already in Place

| Layer | Implementation |
|-------|---------------|
| Helmet | Full CSP, X-Frame-Options, HSTS |
| Rate limiting | `writeLimiter` on API endpoints, `loginLimiter` on `/api/login` |
| Sessions | `express-session` + FileStore, secret from `.env` |
| Input sanitization | `escapeHtml()`, `escapeAttr()`, `safeOnclick()` in all dynamic HTML |
| Auth gate | Static files behind `req.session.user` check |
| Trust proxy | Set for IIS reverse proxy (correct client IP) |

## Tests to Know About

- `tests/integration/server-security.test.js` — server security checks
- `tests/unit/auth-server.test.js` — auth route tests
- `tests/unit/sanitize.test.js` — sanitization function tests
- `tests/unit/sanitize-production.test.js` — production sanitization checks
- `tests/unit/data-security.test.js` — data access security
- `tests/unit/production-readiness.test.js` — production config checks
- `tests/enforcement/deployment-readiness.test.js` — build/deploy integrity

## Previous Work

Security remediation (Fixes 1-5) completed. CSP tightening (Fix 6) deferred.
See `docs/archive/SECURITY_REMEDIATION_PROMPT.md` for history.

## Production Environment

- Windows Server 2025 + IIS with HttpPlatformHandler
- `web.config` sets `NODE_ENV=production`
- `.env` on server has `SESSION_SECRET` + `NODE_ENV=production`
- No reverse proxy or load balancer in front of IIS
