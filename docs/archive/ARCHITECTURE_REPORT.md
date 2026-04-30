# 📊 Game Analytics Dashboard - Architecture Report

## ✅ Data Source: **100% DuckDB**

### Primary Data Loading
**Source:** `duckdb` (verified via `gameData._dataSource`)

All data is queried from DuckDB with SQL queries in `src/db/duckdb-client.js`:

1. **Games Data** (`getAllGames()`) - 50 games loaded
   - Main source: `games_master.json` → DuckDB
   
2. **Providers** (`getProviderDistribution()`)
   - Used in: `src/ui-providers-games.js`
   - Query: Aggregates by provider_studio
   
3. **Themes** (`getThemeDistribution()`)
   - Used in: `src/data.js`
   - Query: Groups by theme_consolidated
   
4. **Mechanics** (`getMechanicDistribution()`)
   - Used in: `src/data.js`
   - Query: Groups by mechanic_primary
   
5. **Anomalies** (`getAnomalies()`)
   - Top/bottom performers by z-score
   
6. **Overview Stats** (`getOverviewStats()`)
   - Total games, theme count, mechanic count

### Fallback System
- If DuckDB fails to initialize, falls back to direct JSON loading
- Current status: **DuckDB active** ✅

### Non-DuckDB Data
- `theme-breakdowns.json` - Static theme analysis data (loaded in `ui.js`)
- This is supplementary data for theme details, not game data

---

## 🎨 Styling: **Tailwind + Legacy CSS**

### Current State: **Hybrid Approach**

#### ✅ Tailwind CSS (Primary)
- Loaded via CDN: `https://cdn.jsdelivr.net/npm/tailwindcss@3.4.1/dist/tailwind.min.css`
- **Custom configuration** in `tailwind.config`:
  ```js
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'dash-primary': '#6366f1',
        'dash-secondary': '#8b5cf6',
        'dash-accent': '#ec4899'
      }
    }
  }
  ```
- Used extensively in:
  - All page headers (Games, Themes, Mechanics, Providers)
  - All side panels
  - All tables and data displays
  - Filter tabs and buttons
  - Cards and metrics

#### ⚠️ Legacy CSS Files (Still Present)
**9 CSS files totaling ~2,374 lines:**

1. **styles-minimal.css** (1,128 lines)
   - Core layout, tables, panels
   - Contains z-index rules, backdrop styles
   - **Status:** Essential for functionality
   
2. **styles-minimal-additions.css** (293 lines)
   - Additional table/card styles
   
3. **modern-layout.css** (281 lines)
   - Sidebar, navigation, page layout
   
4. **dark-mode.css** (234 lines)
   - Dark mode color variables and transitions
   
5. **info-tooltip.css** (116 lines)
   - Tooltip styling (z-index management)
   
6. **panels-style.css** (117 lines)
   - Side panel specific styles
   
7. **theme-chips.css** (97 lines)
   - Theme tag/chip styling
   
8. **providers-games.css** (55 lines)
   - Provider/games specific styles
   
9. **unified-themes.css** (53 lines)
   - Theme unification styles

#### Inline Styles
- **119 elements** with inline styles (mostly charts, logos, Chart.js canvases)
- Minimal compared to total elements
- Mostly for:
  - Chart dimensions
  - Logo sizing
  - Dynamic color values (gradients)
  - Loading/error states

---

## 📋 Summary

### Data Architecture ✅
| Aspect | Status |
|--------|--------|
| Primary data source | **100% DuckDB** |
| Games loading | DuckDB SQL queries |
| Provider aggregation | DuckDB SQL queries |
| Theme aggregation | DuckDB SQL queries |
| Mechanic aggregation | DuckDB SQL queries |
| Fallback available | Yes (JSON direct load) |

### Styling Architecture ⚠️
| Aspect | Status |
|--------|--------|
| Primary framework | **Tailwind CSS** |
| Tailwind adoption | ~70-80% of UI |
| Legacy CSS files | 9 files, 2,374 lines |
| Inline styles | 119 elements (mostly charts) |
| Custom components | `dashboard-components.js` (Tailwind-based) |

---

## 🎯 Recommendations

### To Achieve 100% Tailwind:

1. **Migrate `styles-minimal.css`**
   - Convert table styles to Tailwind utilities
   - Replace custom z-index with Tailwind z-classes
   - Move backdrop/panel styles to inline Tailwind

2. **Migrate `modern-layout.css`**
   - Sidebar layout → Tailwind flex/grid
   - Navigation → Tailwind utilities

3. **Consolidate dark mode**
   - Use Tailwind's `dark:` variant system
   - Remove `dark-mode.css` custom variables

4. **Remove specialty CSS**
   - Theme chips → Tailwind badge components
   - Tooltips → Tailwind positioning
   - Panel styles → Inline Tailwind classes

5. **Benefits of Full Migration**
   - Single source of truth
   - Easier maintenance
   - Smaller bundle size
   - Better consistency
   - Easier for new developers

---

## ✅ Current Status

**Data:** DuckDB fully operational ✅  
**Styling:** Tailwind primary, legacy CSS supplementary ⚠️  
**Functionality:** All features working correctly ✅

Last verified: 2026-02-01
