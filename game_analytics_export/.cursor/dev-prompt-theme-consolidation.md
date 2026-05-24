# Dev Task: Theme Taxonomy Consolidation

## Objective

Fix theme data normalization so `theme_consolidated` always resolves to a clean ~43 industry-standard theme vocabulary. Currently it mixes 48 art themes with 40 performance themes, creating duplicates on charts.

## Root Cause

In `scripts/build-parquet.mjs` line 61 and `src/lib/db/duckdb-client.js` ~line 274:
```js
const themeConsolidated = game.art_theme || themeMap[game.theme_primary] || game.theme_primary || 'Unknown';
```
When `art_theme` exists (e.g. "Asian Temple/Garden"), it bypasses normalization entirely.

## Tasks (in order)

### 1. Create `data/art_theme_consolidation_map.json`

New file mapping all 48 art themes to consolidated names:

```json
{
  "Egyptian/Pharaoh": "Egyptian",
  "Ancient Greece/Rome": "Greek",
  "Norse/Viking Realm": "Norse",
  "Aztec/Mayan": "Aztec",
  "Asian Temple/Garden": "Asian",
  "Arabian Palace/Bazaar": "Arabian",
  "Indian/South Asian": "Indian",
  "Medieval Castle": "Medieval",
  "Prehistoric/Primordial": "Animals",
  "Irish/Celtic Highlands": "Irish",
  "Jungle/Rainforest": "Tropical",
  "Deep Ocean/Underwater": "Underwater",
  "Tropical Island/Beach": "Tropical",
  "Arctic/Snow": "Arctic",
  "Desert/Sahara": "African",
  "Mountain/Volcano": "Adventure",
  "Savanna/Wildlife": "African",
  "Prairie/Plains/Grassland": "Western",
  "Australian Outback": "Animals",
  "Lakeside/River/Fishing Dock": "Tropical",
  "Farm/Countryside": "Animals",
  "Forest/Woodland": "Fantasy",
  "Fantasy/Fairy Tale": "Fantasy",
  "Haunted Manor/Graveyard": "Horror",
  "Outer Space": "Space",
  "Urban/Modern City": "Urban",
  "Neon/Cyber City": "Urban",
  "Casino Floor": "Casino",
  "Luxury/VIP": "Money/Gold",
  "Wild West/Frontier": "Western",
  "Pirate Ship/Port": "Pirates",
  "Crime/Heist": "Adventure",
  "Sports": "Sports",
  "Music/Entertainment": "Music",
  "Food/Cooking": "Food",
  "Mexican/Latin Village": "Mexican",
  "Steampunk/Victorian": "Adventure",
  "Circus/Carnival": "Fantasy",
  "Branded/Licensed": "Branded",
  "Classic Slots": "Classic",
  "Fruit Machine": "Classic",
  "Candy/Sweet World": "Food",
  "Royal Palace/Court": "Medieval",
  "Treasure Cave/Mine": "Treasure",
  "Tavern/Saloon": "Western",
  "Laboratory/Workshop": "Mystery",
  "Festive/Holiday": "Seasonal/Holiday",
  "Inferno/Fire": "Fire"
}
```

### 2. Update `data/theme_consolidation_map.json`

Change these entries:
- `"7's"`: `"7s"` → `"Classic"`
- `"7s"`: `"7s"` → `"Classic"`
- `"Gold"`: `"Gold"` → `"Money/Gold"`
- `"Money"`: `"Money"` → `"Money/Gold"`
- Add `"Arctic"`: `"Arctic"` (passthrough for any performance-side Arctic tags)
- Add `"Branded"`: `"Branded"` (passthrough)
- Add `"Urban"`: `"Urban"` (passthrough)

### 3. Update `scripts/build-parquet.mjs`

- Load the new map: `const artThemeMap = readJSON('art_theme_consolidation_map.json');`
- Log it: `console.log(\`   ${Object.keys(artThemeMap).length} art theme mappings\`);`
- Change line 61 resolution to:
```js
const themeConsolidated = (game.art_theme && artThemeMap[game.art_theme]) || themeMap[game.theme_primary] || game.theme_primary || 'Unknown';
```
- Add build-time guard after processing all games:
```js
// Fail fast if any art_theme value has no mapping
const unmapped = [...new Set(validGames.map(g => g.art_theme).filter(t => t && !artThemeMap[t]))];
if (unmapped.length) {
    console.error('UNMAPPED art_theme values:', unmapped);
    process.exit(1);
}
```

### 4. Update `src/lib/db/duckdb-client.js`

- Add art theme map to `prefetchData()` fetches (same pattern as theme map)
- Use in `loadFromJSON()` / `loadGamesData()`:
```js
const themeConsolidated = (
    (game.art_theme && artThemeMap[game.art_theme]) ||
    themeMap[game.theme_primary] ||
    game.theme_primary ||
    'Unknown'
).replace(/'/g, "''");
```

### 5. Update `package.json` build script

Add `data/art_theme_consolidation_map.json` to the `cp` list in the `build` script so it ships to `dist/data/`.

### 6. Fix `tests/unit/validate-duckdb-field-mapping.test.js`

The `simulateInsert` function currently omits the `art_theme` branch. Update it to match the real resolver:
```js
const themeConsolidated = (game.art_theme && artThemeMap[game.art_theme]) || themeMap[game.theme_primary] || game.theme_primary || 'Unknown';
```

### 7. Add new tests

**a) Art theme map contract test** (`tests/unit/art-theme-consolidation.test.js`):
- Every key in the map matches one of the 48 `VALID_THEMES` from classify_art.py
- Every value is one of the ~43 allowed consolidated names
- Every non-null `art_theme` in `game_data_master.json` has a mapping
- No art theme maps to "Unknown"

**b) Theme count assertion** (add to existing data validation tests):
- After applying maps, distinct `theme_consolidated` values should be <= 45 (allowing small tolerance)
- No game that previously had a valid theme should become "Unknown"

### 8. Rebuild and verify

```bash
npm run build:data    # Regenerate parquet + processed JSON
npm run format        # Prettier
npm run format:check  # Verify
npm test              # All 1,614 tests
npm run build         # Full production build
```

## Critical Rules (from .cursor/rules)

- **DuckDB WASM** is the data layer -- NOT SQLite
- **NEVER rename DuckDB columns** -- `theme_consolidated` stays as-is
- **Field access** via `F.xxx(game)` from `game-fields.js` -- no inline access
- **All aggregation** via `metrics.js` functions -- no inline loops
- **`npm run build:data`** after changing data files
- **Prettier** formatting enforced (4-space indent, single quotes, semicolons)
- **No CDN imports** -- DuckDB WASM is self-hosted

## Expected Outcome

- `getThemeMetrics()` returns ~43 distinct theme rows (down from 65+)
- `getArtThemeMetrics()` still returns 48 distinct art themes (unchanged)
- Total game count unchanged (4,550)
- All tests pass
- Market Insights Theme Landscape shows clean ~43 bubbles
- Art Insights Art Themes Landscape unchanged (uses `art_theme` directly)

## Final Consolidated Taxonomy (~43 names)

African, Adventure, Animals, Arabian, Arcade, Arctic, Asian, Aztec, Branded, Casino, Classic, Dragons, Egyptian, Fantasy, Fire, Food, Greek, Horror, Indian, Irish, Las Vegas, Lightning, Magic, Medieval, Mexican, Money/Gold, Music, Mythical, Mystery, Norse, Pirates, Seasonal/Holiday, Space, Spanish, Sports, Table, Treasure, Tropical, Underwater, Urban, Western
