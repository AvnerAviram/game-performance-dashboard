# Production Readiness Plan

**Goal:** Elevate the dashboard from internal-tool quality to industry production standard.

---

## Phase 1: Quick Wins (~1–2 days)

### 1.1 Security & Polish

| Task | File(s) | Action |
|------|---------|--------|
| Remove stack trace from error UI | `src/app.js` | Show generic message in prod; keep full error in dev only |
| Strip/gate console.log | All `src/*.js` | Add `if (import.meta.env?.DEV)` or simple `DEBUG` flag; remove or wrap in dev-only check |
| Fix page title | `dashboard.html` | Change `"v2.5-ANOMALIES-FIXED"` → `"Game Analytics Dashboard"` |

### 1.2 UX

| Task | File(s) | Action |
|------|---------|--------|
| Add loading state | `dashboard.html`, `src/app.js` | Show spinner/skeleton while DuckDB initializes; hide when `loadGameData()` resolves |
| Add retry on failure | `src/app.js` | Show "Retry" button on error page instead of static error |

### 1.3 Checklist

- [ ] Error UI no longer exposes stack trace (production)
- [ ] console.log removed or gated by DEBUG
- [ ] Title is production-ready
- [ ] Loading indicator visible during init
- [ ] Retry button on error state

---

## Phase 2: Short Term (~1–2 weeks)

### 2.1 Build Pipeline

| Task | Action |
|------|--------|
| Add Vite | `npm install -D vite`; create `vite.config.js` |
| Configure Vite | Entry: `dashboard.html`; output: `dist/`; handle `data/` as static |
| Add build script | `"build": "vite build"` |
| Add dev script | `"dev": "vite"` (replace python + watch:css) |
| Tailwind in Vite | Use `tailwindcss` PostCSS plugin or `@tailwindcss/vite` |

### 2.2 Environment Config

| Task | Action |
|------|--------|
| Add `.env.example` | `DEBUG=false`, `API_URL=` (optional for future) |
| Add `.env` to `.gitignore` | Avoid committing secrets |
| Use `import.meta.env` | Gate debug logs, feature flags |

### 2.3 CI/CD

| Task | Action |
|------|--------|
| Add GitHub Actions | `.github/workflows/ci.yml` |
| Jobs | Lint (optional ESLint), `npm run build`, `npm test` |
| On push to main | Run build + tests |

### 2.4 Deployment

| Task | Action |
|------|--------|
| Add deploy script | `"deploy": "npm run build && <deploy-to-vercel/netlify/etc>"` |
| Static hosting | Vercel, Netlify, or GitHub Pages for `dist/` |

### 2.5 Checklist

- [ ] `npm run build` produces valid `dist/`
- [ ] `npm run dev` runs Vite dev server with HMR
- [ ] `.env` support for DEBUG flag
- [ ] CI runs on push/PR
- [ ] Deployable to static host

---

## Phase 3: Medium Term (~1 month)

### 3.1 TypeScript (Optional)

| Task | Action |
|------|--------|
| Add TypeScript | `npm install -D typescript @types/...` |
| Rename critical files | `data.js` → `data.ts`, `duckdb-client.js` → `duckdb-client.ts` |
| Add `tsconfig.json` | Strict mode; allow gradual adoption |
| Vite + TS | Already supported by Vite |

### 3.2 Error Tracking

| Task | Action |
|------|--------|
| Add Sentry (or similar) | `npm install @sentry/browser` |
| Init in `app.js` | `Sentry.init({ dsn: '...' })` |
| Wrap init | `Sentry.captureException` in catch block |

### 3.3 Accessibility

| Task | Action |
|------|--------|
| Add `aria-*` to nav | `aria-current="page"`, `aria-label` on buttons |
| Add focus management | Focus trap in panels; restore focus on close |
| Add skip link | "Skip to main content" at top |

### 3.4 Data Architecture (If Needed)

| Task | Action |
|------|--------|
| Add simple API | Optional: Express/Fastify server for `/api/games` |
| Or keep JSON | Fine for static/internal; defer if not needed |

---

## Phase 1–3 Status: Implemented

- [x] Phase 1: Security, title, loading, retry, debug flag
- [x] Phase 2: Vite build, env, CI/CD
- [x] Phase 3: Sentry (optional), a11y (skip link, aria-labels)

---

## Phase 4: To Be Discussed

Whether phase 4 is needed depends on:

- **Scale:** How many users, how often?
- **Data:** Will it grow beyond 10MB? Need auth?
- **Compliance:** Any accessibility or security requirements?
- **Team:** Will others maintain this?

---

## Execution Order

1. **Phase 1** → Do fully first.
2. **Phase 2** → Do fully next.
3. **Phase 3** → Decide per item:
   - TypeScript: Only if team will maintain long-term.
   - Sentry: Yes if deployed to real users.
   - A11y: Yes if public or enterprise.
   - API: Only if data grows or needs protection.
4. **Phase 4** → Skip unless we identify specific needs.

---

## Next Step

Start with **Phase 1** and implement each task. When done, we can review Phase 4 and decide what to keep or drop.
