# Z-Index Scale

This document defines the z-index hierarchy used across the dashboard. **Tooltips must stay below overlay panels.**

## Scale (bottom to top)

| Value | Use | Elements |
|-------|-----|----------|
| 0 | Default | Page content |
| 10 | Local stacking | Panel headers, badges within components |
| 200 | Sticky headers | Page headers (overview, themes, games, etc.) |
| 300 | Filters | Filter tabs container |
| 400 | Tooltips | Info icons, tooltips (MUST be below overlay panels) |
| 500 | Sidebar & footers | Sidebar, pagination footers |
| 1000 | Backdrop | Modal/panel backdrop overlay |
| 1100 | Overlay panels | Right panels (game, provider, mechanic, theme) |

## Key Rule

**Tooltips (z-400) must be below overlay panels (z-1100).** When a right panel is open, tooltips from the main content should not appear above it.

## Files

- `src/input.css` – Tooltip z-index, scale documentation
- `dashboard.html` – Sidebar (500), backdrop (1000), panels (1100)
- `src/pages/*.html` – Sticky headers (200), pagination footers (500)
