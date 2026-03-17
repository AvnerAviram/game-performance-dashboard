# Game Analytics Dashboard - Architecture

## Current Structure: Single-Page Application (SPA)

All pages are in `index.html` for these reasons:

1. **Fast Navigation** - No page reloads, instant switching
2. **Shared Data** - Game data loaded once, used by all pages
3. **Smooth Transitions** - Pages can animate in/out
4. **Working State** - Everything is functional and tested

## Finding Pages in index.html

Use these line numbers to jump to each page:

- **Overview** (line ~391): Dashboard homepage with stats
- **Themes** (line ~534): Theme analysis and rankings  
- **Mechanics** (line ~680): Game mechanic breakdowns
- **Anomalies** (line ~815): Performance outliers
- **Insights** (line ~865): Market insights cards
- **Prediction** (line ~987): Success prediction tool
- **AI Assistant** (line ~1095): AI chat interface
- **Trends** (line ~1179): Trending analysis
- **Providers** (line ~1217): Provider comparison
- **Games** (line ~1255): Full games database

## Future: Split into Modules (When Needed)

When the file becomes unmaintainable, we can split like this:

```
pages/
  ├── overview.html
  ├── themes.html
  ├── mechanics.html
  └── ... (8 more)
```

The `page-manager.js` system is ready for this migration.

## Quick Edit Tips

**Find a page fast:**
```bash
# In your editor, search for:
id="overview"
id="themes"
id="mechanics"
# etc.
```

**Or use grep:**
```bash
grep -n 'id="themes"' index.html
```
