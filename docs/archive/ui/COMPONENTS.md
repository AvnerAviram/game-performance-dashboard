# Component System Documentation

## Overview

This project uses a **component-based styling system** with reusable CSS classes defined in the inline Tailwind config. This eliminates repetition and makes styling changes easier to maintain.

## Component Classes

### Page Container

```css
.page-container
```

**Purpose:** Standard page wrapper with scrolling, padding, and hidden by default.

**Usage:**
```html
<div id="mypage" class="page-container">
    <!-- Page content -->
</div>
```

**Properties:**
- `display: none` (shown when active)
- `max-height: calc(100vh - 4rem)` (fits viewport minus header)
- `overflow-y: auto` (vertical scrolling)
- `padding-bottom: 1.5rem; padding-right: 1.5rem; padding-left: 2rem`

### Simple Page Header

```css
.page-header-simple
.page-title-simple  
.page-subtitle-simple
```

**Purpose:** Header for pages without sticky navigation (Overview, Anomalies, Insights, Trends, Prediction, AI Assistant).

**Usage:**
```html
<div class="page-header-simple">
    <h2 class="page-title-simple">My Page Title</h2>
    <p class="page-subtitle-simple">My page description</p>
</div>
```

**Properties:**
- `.page-header-simple`: `margin-bottom: 1.5rem`
- `.page-title-simple`: Large, bold, dark text
- `.page-subtitle-simple`: Smaller, gray text

### Sticky Page Header

```css
.page-header-sticky
.page-header-sticky-content
.page-title-sticky
.page-subtitle-sticky
```

**Purpose:** Sticky header for pages with filters/tabs (Themes, Mechanics, Games, Providers).

**Usage:**
```html
<div class="page-header-sticky">
    <div class="page-header-sticky-content">
        <div>
            <h2 class="page-title-sticky">My Page Title</h2>
            <p class="page-subtitle-sticky">My page description</p>
        </div>
        <!-- Filter tabs or actions -->
    </div>
</div>
```

**Properties:**
- `.page-header-sticky`: Sticky positioning, extends left to edge, z-index 200
- `.page-header-sticky-content`: Flexbox for header + actions
- `.page-title-sticky`: Medium-large, semi-bold text  
- `.page-subtitle-sticky`: Small, gray text

## Page Patterns

### Pattern 1: Simple Page (6 pages)

**Used by:** Overview, Anomalies, Insights, Trends, Prediction, AI Assistant

```html
<div id="pagename" class="page-container [optional-bg-class]">
    <div class="page-header-simple">
        <h2 class="page-title-simple">Title</h2>
        <p class="page-subtitle-simple">Subtitle</p>
    </div>
    <!-- Page content -->
</div>
```

### Pattern 2: Sticky Header Page (4 pages)

**Used by:** Themes, Mechanics, Games, Providers

```html
<div id="pagename" class="page-container">
    <div class="page-header-sticky">
        <div class="page-header-sticky-content">
            <div>
                <h2 class="page-title-sticky">TITLE (COUNT)</h2>
                <p class="page-subtitle-sticky">Subtitle</p>
            </div>
            <div class="flex gap-2">
                <!-- Filter tabs -->
            </div>
        </div>
    </div>
    <!-- Page content -->
</div>
```

## CSS Architecture

### Files (5 total, ~36KB)

1. **layout-fixes.css** (892 bytes)
   - Page margin handling for sidebar layout
   - Separates pages inside/outside ml-60 wrapper

2. **modern-layout.css** (5.4KB)
   - Sidebar, navigation, collapse functionality

3. **essential-components.css** (11.6KB)
   - Tables, cards, filter tabs, anomaly cards

4. **comprehensive-fixes-v178.css** (15KB)
   - Prediction results, tooltips, dark mode overrides

5. **dark-mode-fixed.css** (3.4KB)
   - Dark mode color adjustments

### Component Classes (Inline)

Defined in `index.html` inside `<script>` tag that adds them to the DOM on load. Uses plain CSS (not @apply) for CDN compatibility.

## Testing

### Alignment Tests

Run: `npx playwright test tests/alignment/`

**What it tests:**
- All 10 pages have H2 headers aligned at X=272px
- Consistency across all pages (within 1px tolerance)

**When to run:**
- After changing padding/margins
- After modifying page headers
- Before committing layout changes

### Manual Testing

1. Load page: `http://localhost:8000/game_analytics_export/`
2. Click through all 10 pages in sidebar
3. Verify:
   - Headers align vertically on left edge
   - No extra gaps at top
   - Content is readable and properly spaced

## Making Changes

### Change header spacing for ALL pages

**Before (old way):**
- Update Tailwind classes in 10 different places
- Check for CSS conflicts
- Test manually on each page

**After (new way):**
1. Edit component class in `index.html` `<script>` section
2. Run alignment tests: `npx playwright test tests/alignment/`
3. Done!

**Example:**
```javascript
// In index.html <script> section
.page-title-simple {
    font-size: 1.875rem; // Change this
    // ...
}
```

### Add a new page

1. Copy an existing page pattern (simple or sticky)
2. Use component classes (don't repeat Tailwind classes)
3. Add page ID to CSS if needed (check layout-fixes.css)
4. Test with Playwright

## Benefits

- ✅ **Consistent:** Change once, apply everywhere
- ✅ **Maintainable:** Clear component boundaries
- ✅ **Testable:** Automated tests prevent regressions
- ✅ **Fast:** No build step, CDN Tailwind
- ✅ **Clean:** Reduced HTML repetition by ~50%
