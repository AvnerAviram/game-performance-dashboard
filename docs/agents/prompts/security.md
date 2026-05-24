# Security Agent — Current Task

> **Updated by Atlas**: 2026-04-25
> **Status**: BACKLOG — not yet prioritized
> **Read first**: `AGENTS.md`, then `agents/security.md`

## Task: CSP Tightening (Fix 6)

### Background

Fixes 1-5 from the security remediation have been completed. Fix 6 (Content Security Policy tightening) was deferred.

### What to Do

Review and tighten the CSP configuration in `server/server.cjs` (the `helmet()` configuration). Current CSP may be more permissive than necessary.

### Status

Waiting for Atlas to prioritize and write detailed implementation instructions.

### When Done

Update `agents/prompts/atlas.md` with your report: what you changed, test results, any issues. Atlas reads it next session.
