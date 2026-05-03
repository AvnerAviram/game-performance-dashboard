# QA Agent — Validate: Bubble Chart 8-Fix Batch + Unit Tests

## Context

Dev fixed 8 bubble chart bugs and wrote unit tests. This is a ping-pong cycle — if you find issues, append them to `dev.md` under `## QA Findings for Dev` and report FAIL. Dev will fix and re-run. Repeat until ALL checks pass.

Use `fnm use 20` before any npm commands.

**MANDATORY: Take Playwright screenshots for EVERY visual check. Actually LOOK at each screenshot and describe what you see. If you cannot visually confirm, report INCONCLUSIVE.**

---

## Q1: Automated Tests (unit + gate)

```bash
fnm use 20
npm test
npm run build
npm run test:gate
```

Also verify new unit tests exist:
```bash
ls -la tests/unit/bubble-labels.test.js
```

**FAIL if** any test fails or unit test file doesn't exist.

---

## Q2: Bubble Size Range Restored

**Page:** Art Insights → Art Themes Landscape (canvas: `art-opportunity-chart`)

Take screenshot. Bubbles should range from small (~6px) to large (~40px). The largest bubbles (Classic Slots, Animals) should be visibly BIG — roughly the same size as they appear in the old version.

**FAIL if** all bubbles are tiny (max ~16px) and clustered together. The biggest bubble should be clearly 3-4x larger than the smallest.

---

## Q3: Left-Side Bubbles Have Labels

**Pages:** Art Themes Landscape + Market Insights Theme Landscape (`chart-market-landscape`)

Take screenshot of each. Count labels per quadrant:
- Green (top-left, Opportunity): ___
- Blue (top-right, Leaders): ___
- Gray (bottom-left, Niche): ___
- Red (bottom-right, Saturated): ___

**FAIL if** any quadrant has zero labels, or left side has drastically fewer than right.

---

## Q4: Label Hover Shows Tooltip (CRITICAL)

**This has been reported broken 5+ times. Test thoroughly.**

**Page:** Art Insights → Art Themes Landscape

1. Find a visible label text in the chart
2. Move mouse directly onto the label text
3. Wait 800ms
4. Take screenshot — there MUST be a visible tooltip near the label
5. Move to a DIFFERENT label, wait, screenshot — tooltip must follow
6. Move OFF all labels — tooltip must disappear

Do this for at LEAST 3 different labels across different areas of the chart.

```js
const canvas = page.locator('#art-opportunity-chart');
await canvas.scrollIntoViewIfNeeded();
const box = await canvas.boundingBox();

// Hover right label area
await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.35);
await page.waitForTimeout(800);
await page.screenshot({ path: 'qa-screenshots/q4-hover-1.png' });

// Hover left label area
await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
await page.waitForTimeout(800);
await page.screenshot({ path: 'qa-screenshots/q4-hover-2.png' });

// Hover middle
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await page.waitForTimeout(800);
await page.screenshot({ path: 'qa-screenshots/q4-hover-3.png' });

// Move off chart
await page.mouse.move(box.x - 50, box.y - 50);
await page.waitForTimeout(500);
await page.screenshot({ path: 'qa-screenshots/q4-hover-off.png' });
```

**FAIL if** tooltip doesn't appear, or appears then instantly disappears, or stays stuck after moving away.

---

## Q5: No Chart Jump on First Hover

**Page:** Art Themes Landscape

1. Screenshot before any hover
2. Hover one bubble, wait 500ms
3. Screenshot during hover
4. Compare chart axes and gridline positions — must be identical

**FAIL if** chart shifts/jumps.

---

## Q6: Labels NOT Covering X-Axis Numbers

**Page:** Art Themes Landscape

Take screenshot. Look at the bottom edge of the chart where X-axis tick values are (1, 2, 5, 10, 20, 50, 100...).

**FAIL if** any label text overlaps or sits on top of X-axis tick numbers. Labels should stay above the axis area with a visible gap.

---

## Q7: Leader Lines Clean

**Page:** Art Themes Landscape, Market Theme Landscape

Take screenshots. Leader lines (dashed lines from bubble to label) should be:
- Relatively short
- Not crossing over many other bubbles
- Fewer than before (threshold increased)

**FAIL if** there are many long tangled leader lines crossing the chart.

---

## Q8: Overview No Console Errors

Navigate to Overview. Do a hover sweep over the theme landscape chart area.

**FAIL if** any `TypeError` or `Cannot read properties of undefined` errors appear in console.

---

## Q9: No Stuck Hover Highlights

**Page:** Art Themes Landscape

1. Hover over 5+ different bubbles in sequence
2. Move cursor completely off the chart
3. Take screenshot
4. All bubbles should return to normal appearance — none dimmed, none highlighted

**FAIL if** any bubble remains dimmed or highlighted after moving away.

---

## Q10: No Regressions

Quick check:
- Overview loads, all charts render
- Themes page loads
- Market Insights landscapes render with labels
- Providers page loads

**FAIL if** any page breaks.

---

## Report

**Append** to `/Users/avner/Projects/game-performace-dashboard/agents/prompts/atlas.md`:

### QA Agent Report — Bubble Chart 8-Fix Batch

| Check | Result | Notes |
|-------|--------|-------|
| Q1: Tests + unit tests | | pass count, unit test file exists? |
| Q2: Bubble size restored | | Max bubble visually ~40px? |
| Q3: Left-side labels | | Green/Gray/Blue/Red counts? |
| Q4: Tooltip on label hover | | Appears and STAYS? 3 labels tested? |
| Q5: No chart jump | | Before/after identical? |
| Q6: Labels above X-axis | | Gap visible? |
| Q7: Leader lines clean | | Short, not tangled? |
| Q8: Overview no errors | | Console clean? |
| Q9: No stuck highlights | | All bubbles normal after hover? |
| Q10: No regressions | | All pages load? |

**DECISION:** PASS / FAIL

**If FAIL:** Describe exactly what's wrong with screenshot evidence. Append findings to `dev.md` under `## QA Findings for Dev`.

---

## Dev Notes for QA

### Bubble Chart 8-Fix Batch — Manual Verification Points

**1. Bubble sizes restored (FIX 1)**
- All bubble landscape charts should have noticeably larger bubbles (rMin=6, rMax=40)
- Compare Market Insights Theme Landscape, Art Themes Landscape, and Overview scatter
- Largest bubbles should be ~40px radius, smallest ~6px

**2. Label overlap removal (FIX 2)**
- On dense charts (Market Insights, Art Themes), labels should not fully cover each other
- When two labels overlap >25%, the one for the smaller bubble is removed
- Larger-bubble labels are drawn on top (drawn last in render order)

**3. Label hover tooltip works (FIX 3)**
- Hover over a label text (not the bubble) → tooltip should appear and STAY
- Move cursor slowly across the label → tooltip should not flicker
- This was broken because Chart.js tooltip plugin was clearing our manually-set tooltip
- Test on Market Insights Theme Landscape and Art Themes Landscape

**4. Labels recalculate on resize (FIX 4)**
- Resize the browser window → labels should reposition correctly
- Previously labels were calculated once and never updated

**5. Labels don't cover X-axis (FIX 5)**
- Bottom-most labels should be at least 18px above the X-axis numbers
- Check Art Themes Landscape bottom edge — no label text overlapping "Number of Games"

**6. Fewer leader lines (FIX 6)**
- Leader lines (thin lines connecting labels to their bubbles) should only appear when labels are >25px from their bubble
- Previously threshold was 15px, causing too many lines

**7. Overview hover — no TypeError (FIX 7)**
- Open browser console, hover over Overview scatter chart bubbles rapidly
- Should see zero console errors (TypeError about undefined dataIndex)

**8. Stuck highlights cleared (FIX 8)**
- Hover over a bubble, then move cursor off the chart
- All bubbles should return to normal (no dimmed/stuck state)
- The mouseleave handler clears active elements and tooltip
