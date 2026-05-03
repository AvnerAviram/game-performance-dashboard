# Dev Agent — Bubble Chart Fixes (8 bugs) + Unit Tests

## Critical Context: What WAS Working

The old Market Landscape (commit `cbea2469`, file `chart-themes.js` lines 635-900) had an **inline** label plugin that worked well. The migration to `createBubbleLandscape()` factory broke several things. Here are the key differences you MUST understand:

| Property | Old (working) | New (broken) | Impact |
|----------|--------------|--------------|--------|
| Bubble size range | `rMin=6, rMax=40` | `max(5, min(16, ...))` | Bubbles 2.5x smaller, cluster tightly |
| Labels | ALL themes labeled | Capped at 40 of 86+ | Important themes unlabeled |
| Recalculation | `lastPosKey` — recalc on resize | `!cachedLabels` — calc once | Stale positions after resize |
| Hover/tooltip | Custom inline div tooltip | Chart.js tooltip + `createSAHoverHandler` | Race condition kills tooltip |
| X warping | `log10 + piecewise stretch (K=2.5)` | `createXWarp()` | Different spread |

**The old code is at:** `git show cbea2469:game_analytics_export/src/ui/chart-themes.js` lines 635-900. READ IT before making changes.

Use `fnm use 20` before any npm commands.

---

## FIX 1: Restore bubble size range (CRITICAL — fixes label placement)

**File:** `src/ui/renderers/art-renderer.js` → `renderThemeLandscape()` line ~597, and `renderDimensionLandscape()` line ~560.

Also `src/ui/chart-themes.js` → anywhere `createBubbleLandscape` is called with bubble data.

**Current (broken):**
```js
r: Math.max(5, Math.min(16, Math.sqrt(m.count / maxCount) * 14 + 3)),
```
Or similar — bubbles capped at 16px.

**Fix — restore the old range:**
```js
r: 6 + Math.sqrt(m.count / maxCount) * 34,
```
This gives `rMin=6, rMax=40` — matching the old working version. Bigger bubbles spread out more, making labels easier to place.

Apply this to ALL `createBubbleLandscape` call sites that build bubble data.

---

## FIX 2: Labels invisible on left side (overlap in rendering)

**File:** `src/ui/chart-utils.js` → `createSABubbleLabelPlugin()`, after line 562

**Root cause:** When 40 labels are drawn, later labels' background `fillRect` covers earlier labels' text. Important left-side labels get hidden.

**Fix — add after `cachedLabels = candidates;` (line 562):**

```js
// Remove labels that are >25% hidden by a more important label
const removed = new Set();
for (let a = 0; a < candidates.length; a++) {
    if (removed.has(a)) continue;
    for (let b = a + 1; b < candidates.length; b++) {
        if (removed.has(b)) continue;
        const ra = candidates[a].rect;
        const rb = candidates[b].rect;
        const xO = Math.max(0, Math.min(ra.x2, rb.x2) - Math.max(ra.x1, rb.x1));
        const yO = Math.max(0, Math.min(ra.y2, rb.y2) - Math.max(ra.y1, rb.y1));
        if (xO <= 0 || yO <= 0) continue;
        const overlap = xO * yO;
        const areaA = (ra.x2 - ra.x1) * (ra.y2 - ra.y1);
        const areaB = (rb.x2 - rb.x1) * (rb.y2 - rb.y1);
        if (overlap / Math.min(areaA, areaB) > 0.25) {
            const rA = bubbleData[candidates[a].dataIndex]?.r || 0;
            const rB = bubbleData[candidates[b].dataIndex]?.r || 0;
            removed.add(rA < rB ? a : b);
        }
    }
}
const filtered = removed.size > 0 ? candidates.filter((_, idx) => !removed.has(idx)) : candidates;
filtered.sort((a2, b2) => {
    const rA = bubbleData[a2.dataIndex]?.r || 0;
    const rB = bubbleData[b2.dataIndex]?.r || 0;
    return rA - rB;
});
cachedLabels = filtered;
```

---

## FIX 3: Label hover tooltip doesn't work

**File:** `src/ui/chart-utils.js` → `createSAHoverHandler()` (line 356) and `createBubbleLandscape()` (line ~947)

**Root cause:** Chart.js tooltip plugin runs `handleEvent()` AFTER our `onHover` handler → clears our manually-set tooltip.

### Change A: Lock flag in `createSAHoverHandler()` 

Line 361 — add `chart._saTooltipLocked = false;` before `const idx`:
```js
if (elements.length) {
    chart._saTooltipLocked = false;
    const idx = elements[0].index;
```

Line 380 — add `chart._saTooltipLocked = true;` before `chart._saSetHovered`:
```js
if (idx >= 0) {
    chart._saTooltipLocked = true;
    chart._saSetHovered?.(idx);
```

Line 396 — add `chart._saTooltipLocked = false;` before the `if`:
```js
chart._saTooltipLocked = false;
if (chart._saGetHovered?.() >= 0) {
```

### Change B: Monkey-patch tooltip in `createBubbleLandscape()`

After `new Chart(...)` (line ~947), BEFORE `canvas.addEventListener('mouseleave', ...)`:

```js
if (labels !== 'none') {
    const origHandleEvent = chart.tooltip.handleEvent.bind(chart.tooltip);
    chart.tooltip.handleEvent = function (ev, replay) {
        if (chart._saTooltipLocked) return false;
        return origHandleEvent(ev, replay);
    };
}
```

### Change C: Clear lock on mouseleave

Add `c._saTooltipLocked = false;` as the first line in the mouseleave handler's `if (c) {` block.

---

## FIX 4: Restore `lastPosKey` recalculation

**File:** `src/ui/chart-utils.js` → `createSABubbleLabelPlugin()` line ~422, ~436, ~438

The old code recalculated labels when chart positions changed. Restore this.

Line ~422: Restore `let lastPosKey = null;`

Line ~436 (the `shouldRecalc` line): Change from:
```js
const shouldRecalc = !cachedLabels;
```
To:
```js
const posKey = meta0.data.map(el => `${el.x.toFixed(0)},${el.y.toFixed(0)}`).join('|');
const shouldRecalc = !cachedLabels || (!hasActiveHover && posKey !== lastPosKey);
```

Inside the `if (shouldRecalc) {` block, add: `lastPosKey = posKey;`

---

## FIX 5: Labels covering X-axis numbers

**File:** `src/ui/chart-utils.js` → `createSABubbleLabelPlugin()` lines ~479-480

When computing initial label positions, the Y clamping allows labels right at `chartArea.bottom`. Fix by adding a 20px margin:

Change line ~480:
```js
iy = Math.max(chartArea.top, Math.min(chartArea.bottom - th, iy));
```
To:
```js
iy = Math.max(chartArea.top, Math.min(chartArea.bottom - th - 18, iy));
```

Also in the SA solver (`src/lib/sa-label-solver.js`), the bounds check should use the same margin. Change the `h` parameter passed to `saLabelSolver` at line ~489:
```js
saLabelSolver(labs, ancs, areaW, areaH - 18, chartArea.left, chartArea.top);
```

---

## FIX 6: Leader lines messy / too many

**File:** `src/ui/chart-utils.js` → `createSABubbleLabelPlugin()` line ~492

Increase `leaderThreshold` from 15 to 25 — this means labels need to be further from their bubble before a leader line is drawn, reducing visual clutter:
```js
const leaderThreshold = 25;
```

---

## FIX 7: Overview hover TypeError (dataIndex undefined)

**File:** `src/ui/chart-themes.js` → `createScatterChart()` or wherever the Overview scatter tooltip is configured.

Find the tooltip `title` callback and add a null guard:
```js
title: items => {
    if (!items?.length) return '';
    // ... rest of callback
}
```

Also check the `label` callback for the same issue.

---

## FIX 8: Stuck hover highlights (bubbles dimmed after hover)

This should be fixed by FIX 3 (tooltip lock + proper mouseleave cleanup). Verify after implementing FIX 3 — if bubbles still get stuck dimmed, add explicit `chart.update('none')` after the `setActiveElements([])` in the mouseleave handler.

---

## MANDATORY: Unit Tests

Write unit tests in `tests/unit/bubble-labels.test.js` for:

1. **Per-quadrant selection**: Given 20 bubbles across 4 quadrants, all 4 quadrants get labels
2. **Overlap removal**: Given 2 overlapping label rects, the smaller-bubble label is removed
3. **Draw order**: After sorting, largest bubble's label is last in array
4. **findLabelAtPoint**: Returns correct dataIndex within ±4px of label rect, returns -1 outside
5. **Label Y constraint**: No label has `rect.y2 > chartArea.bottom - 18`
6. **SA solver**: For 10 synthetic labels, final overlap count < 3

These tests should import the functions directly and test with mock data — no browser/DOM needed.

---

## MANDATORY: Visual Verification (Rule 11)

After ALL fixes, `npm run build && npm start`, then Playwright:

1. **Art Themes Landscape**: ALL 4 bubble colors have labels. Left side green/gray bubbles HAVE labels.
2. **Hover over label text**: Tooltip appears and STAYS. Test on at least 3 different labels.
3. **First hover**: Chart does NOT jump/shift.
4. **Labels vs X-axis**: Labels do NOT overlap X-axis tick numbers at the bottom.
5. **Leader lines**: Clean, not crossing many bubbles. Fewer than before.
6. **Overview**: No console errors during hover.

**Take screenshots for EACH check. If ANY fail — FIX before reporting DONE.**

```bash
fnm use 20
npm test
npm run test:gate
```

---

## Report

**Append** to `/Users/avner/Projects/game-performace-dashboard/agents/prompts/atlas.md`:

### Dev Agent Report — Bubble Chart 8-Fix Batch

| Item | Status | Notes |
|------|--------|-------|
| FIX 1: Bubble size rMin=6,rMax=40 | | |
| FIX 2: Overlap removal + sort | | |
| FIX 3: Tooltip lock | | |
| FIX 4: lastPosKey restored | | |
| FIX 5: Label Y margin 18px | | |
| FIX 6: leaderThreshold 25 | | |
| FIX 7: TypeError null guard | | |
| FIX 8: Stuck highlights | | |
| Unit tests written | | count |
| Visual: left-side labels | | screenshot |
| Visual: tooltip on hover | | screenshot |
| Visual: no chart jump | | screenshot |
| Visual: labels above X-axis | | screenshot |
| npm test | | count |
| test:gate | | X/27 |

---

## MANDATORY: Before Reporting Done

### 1. Update QA prompt
Append to `## Dev Notes for QA` in `qa.md`.

### 2. Report to Atlas
Append to `atlas.md` as specified above.

---

## QA Findings for Dev

## QA Report: Bubble Chart 8-Fix Batch — PASS (all 10 checks)

No action items for Dev. All 8 fixes confirmed working: bubble sizes restored (7.8-40px, 5.1x ratio), quadrant labels on all 4 colors, tooltip appears on label hover and clears on mouse-out, no chart jump, labels above X-axis, leader lines clean (25px threshold), 0 console errors on overview hover, no stuck highlights. 1619 tests passing (6 new unit tests).
