# Game Performance Dashboard — Agent Entry Point

> You are an AI agent. Read this file FIRST. Follow the rules below, then read your role file from `agents/`.
> Human overview of this system → `agents/README.md`

## What This Project Is

Game analytics dashboard (Vanilla JS + Vite + Tailwind + DuckDB WASM) for **4,550 games** with performance metrics, features, themes, and art characterization. Deployed on Windows Server 2025 + IIS.

All code lives under `game_analytics_export/`. Run commands from there.

## Rules — Non-Negotiable

1. **Field access** → `F.xxx(game)` from `src/lib/game-fields.js`. Never raw field names.
2. **Aggregation** → functions from `src/lib/metrics.js`. No inline math.
3. **Data writes** → never write to `game_data_master.json` without explicit user approval.
4. **Schema** → read `.cursor/rules/data-schema-contract.mdc` before touching data layers.
5. **Tests** → `npm test` (1,600+ tests, all pass) + `npm run format` before declaring done.
6. **Chart.js** → import from `src/ui/chart-setup.js`. No CDN scripts.
7. **DuckDB** → self-hosted in `public/duckdb/`. No CDN.
8. **HTML** → sanitize all dynamic content: `escapeHtml()`, `escapeAttr()`, `safeOnclick()`.

## Your Role — Read Your File

| Agent | Role file | What you own |
|-------|-----------|-------------|
| **Atlas** | `agents/atlas.md` | Orchestration, validation, prompts → `.cursor/rules/atlas-*.mdc` |
| **Art** | `agents/art.md` | Art classification pipeline → `data/classify_art.py` |
| **Features** | `agents/features.md` | Feature/theme extraction → `data/extract_game_profile.py`, `data/sc_extract.py` |
| **Dev** | `agents/dev.md` | Dashboard UI, server, tests → `HANDOFF.md` has full schema |
| **Security** | `agents/security.md` | Security audit, hardening → `server/server.cjs`, auth, CSP |
| **QA** | `agents/qa.md` | Data verification, spot-checks, drift detection, claim validation |

## Where to Find Things

| What you need | Where it is |
|---------------|------------|
| Full data schema (3 layers), protected files | `HANDOFF.md` |
| What to work on next | `MASTER_PLAN.md` |
| Art pipeline docs | `data/ART_PIPELINE_HANDOFF.md` |
| Features pipeline trusted sources | `data/PHASE1_TRUTH_MASTER.md` |
| Enforcement rules (always loaded) | `.cursor/rules/` |
| Project file structure, where new files go | `agents/README.md` |

## Quality Gates (Code-Enforced)

- **Features**: 95% micro F1 → `sc_extract.py --validate-features`
- **Art**: theme ≥97% AND overall ≥95% → batch gate in `classify_art.py`
- **Tests**: 1,607 vitest tests, pre-commit enforced
- **Formatting**: Prettier, pre-commit enforced
