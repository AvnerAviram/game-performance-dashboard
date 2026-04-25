# Art Pipeline — Process Postmortem

**Date**: 2026-04-23 (updated 2026-04-13)  
**Reported by**: User  
**Fixed by**: Art Agent (sessions 6-8)

---

## The Incident

After Batch 5 spot-check returned **75% accuracy** (30 OK / 10 Fix out of 40 verdicts), the Art Agent immediately launched Batch 6 (~420 games, ~$4.20 in API calls) **without stopping to fix the issues first**.

This violated the sprint protocol which states: *"If spot-check reveals new vocab issues or systematic errors, fix them before continuing."*

The 10 fixes identified patterns that needed prompt/vocab changes:
- 2× Statues/Sculptures false positive (reel symbols tagged as background elements)
- 4× Missing subtle background elements (flowers, hearts, grass, wallpaper)
- 1× Wrong element category (Asian Architecture vs decoration)
- 1× Missing secondary theme (Luxury/VIP)
- 1× Character false positive (Statues tagged as character)
- 1× False positive elements on a symbols-only game

Batch 6 ran with the **old prompt** (without the fixes), meaning ~400 games were classified without the Statues fix, new Flowers/Hearts/Wallpaper vocab, or the false-positive guidance. Those games will need the prompt improvements applied during the Phase 5 re-classification pass.

## Root Cause

No automated enforcement existed to prevent starting a new batch before the previous spot-check's issues were resolved. The process relied entirely on the agent "remembering" the protocol — which failed.

## The Fix — Three-Layer Batch Gate

### Layer 1: Code Gate (`classify_art_v2.py`)

New function `check_batch_gate()` runs before any batch >10 games:
- Reads `art_pipeline/batch_gate.json`
- If `gate_open` is `false`, prints the reason and **exits with code 1**
- Small batches (≤10 games) bypass the gate — allows re-verification runs
- Emergency override: `--force-gate` flag

```
$ python3 classify_art_v2.py --select-batch 400

============================================================
BATCH GATE CLOSED — cannot start new batch
============================================================
  Last spot-check: Batch 5
  Accuracy: 75.0% (30 OK / 10 Fix)
  Fixes applied: False
  Post-fix regression: not run
  Reason: Spot-check issues not yet resolved

To open the gate, fix the issues, run --regression-full, then update batch_gate.json
Or pass --force-gate to bypass (not recommended).
```

### Layer 2: Gate File (`art_pipeline/batch_gate.json`)

Persistent state file tracking the batch gate:

```json
{
  "gate_open": true,
  "last_spot_check": {
    "batch": 6,
    "accuracy_pct": null,
    "total": null,
    "ok": null,
    "fix": null,
    "fixes_applied": null,
    "regression_post_fix": "98.0%"
  },
  "reason": "...",
  "updated_at": "2026-04-23"
}
```

**Gate closes** when spot-check feedback is received.  
**Gate opens** when: fixes applied + regression passes ≥97% theme adjusted.

### Layer 3: Cursor Rule (`.cursor/rules/art-pipeline-gates.mdc`)

Always-applied rule that tells any agent the exact protocol:

1. RECEIVE spot-check → gate auto-closes
2. SAVE verdicts to `user_reviews.json`
3. ANALYZE patterns in fixes
4. FIX prompt/vocab/corrections
5. RE-CLASSIFY affected games to verify
6. RUN `--regression-full` — must pass ≥97% theme
7. CHECK GATE — only proceed if open
8. THEN start next batch

**Accuracy thresholds:**
- ≥85%: Gate auto-opens after fixes + regression pass
- 75-84%: Gate stays closed until fixes verified
- <75%: Escalate to user

## What Atlas Should Review

1. **`.cursor/rules/art-pipeline-gates.mdc`** — Is the rule clear enough? Should thresholds change?
2. **`check_batch_gate()` in `classify_art_v2.py`** — Is the ≤10 bypass threshold right for re-verification?
3. **Gate file protocol** — Should the gate file be updated automatically by the script (e.g., `--regression-full` auto-opens if passing), or should it remain manual?
4. **Batch 6 impact** — Batch 6 ran with old prompt. The Phase 5 re-classification of batches 1-2 will also cover batch 6 games that need the new vocab. Is this acceptable, or should batch 6 be re-classified now?

## Files Changed (Batch Gate)

| File | Change |
|------|--------|
| `classify_art_v2.py` | Added `check_batch_gate()`, `--force-gate` flag, `BATCH_GATE_PATH` constant, gate checks before `--select-batch` and before classification |
| `art_pipeline/batch_gate.json` | NEW — gate state file |
| `.cursor/rules/art-pipeline-gates.mdc` | NEW — always-applied cursor rule enforcing the stop-fix-verify cycle |
| `.cursor/rules/atlas-working-memory.mdc` | Updated with session 6 progress, batch gate system docs |

---

## Incident 2: Regression Blind Spot (3 of 4 dimensions unmonitored)

**Date discovered**: 2026-04-13 (session 8)  
**Severity**: HIGH — we were reporting inflated confidence for 6+ sessions  
**Reported by**: User

### The Problem

The `--regression-full` command has been the primary quality gate since session 3. However, it only had fix-resolution logic for **theme** (`_fix_note_matches_theme()`). For characters, elements, and colors, fixes were counted but **never checked for resolution** — they were always reported as unresolved, even when the fix was clearly applied.

This meant:
- **Theme**: 24 fixes → 19 properly auto-resolved → 5 unresolved reported ✓
- **Characters**: 24 fixes → only 1 resolved (bad-screenshot) → **17 already-fixed issues silently ignored**
- **Elements**: 77 fixes → only 1 resolved (bad-screenshot) → **52 already-fixed issues silently ignored**
- **Colors**: 20 fixes → only 1 resolved (bad-screenshot) → **10 already-fixed issues silently ignored**

The old regression reported "88.3% overall adjusted" but the real number was **95.8%**. While the actual accuracy was _better_ than reported, we had no way to know that — and more critically, **no way to track if non-theme fixes were actually working**.

### Why This Is Bad

1. **False pessimism on elements**: Elements showed 71.0% adj when the real number is 90.8%. We couldn't tell which element fixes were working and which weren't.
2. **No feedback loop for characters/elements/colors**: Prompt improvements for these dimensions couldn't be validated. We were fixing blindly.
3. **Masked progress**: When the user asked "show me all metrics, not just theme" the gap became immediately obvious — 76 unresolved elements suddenly became 24 when proper resolution logic was added.
4. **Trust risk**: If the user had looked at element accuracy (71%) vs theme accuracy (98%), they might have reasonably questioned the pipeline quality, when in reality elements were at 91%.

### Root Cause

The `run_expanded_regression()` function was built incrementally:
1. First version only checked themes (the "gate" dimension)
2. Characters/elements/colors were added as counters but no resolution logic was written
3. The `_fix_note_matches_theme()` function was never generalized to other dimensions
4. Nobody noticed because the regression report only printed unresolved details for theme (the `if d == 'art_theme':` check on the per-game-issues collection)

### The Fix

Added three new resolution functions:

1. **`_fix_resolved_characters(note, result_chars, corrections_entry)`**
   - Checks corrections.json overrides
   - Resolves "no char" / "just symbols" notes when result is "No Characters"
   - Token-matches user character names against current result
   - Result: 24 fix → **18 resolved**, 6 truly unresolved

2. **`_fix_resolved_elements(note, result_elems, corrections_entry)`**
   - Checks corrections.json (override, must_not, must_have)
   - Detects frame removal fixes (frames no longer in output → resolved)
   - Detects vocab split fixes (old combined names gone → resolved)
   - Detects bloat/noise removal fixes
   - Result: 77 fix → **53 resolved**, 24 truly unresolved

3. **`_fix_resolved_color(note, result_colors, corrections_entry)`**
   - Checks "also X" patterns against current colors
   - Matches color names mentioned in notes against result
   - Result: 20 fix → **11 resolved**, 9 truly unresolved

Also modified the regression report to show unresolved details for **all** dimensions, not just theme.

### Impact — Before vs After

| Dimension | Old Adj% | New Adj% | Fixes properly resolved |
|-----------|----------|----------|------------------------|
| Theme | 98.1% | 98.1% | 19 (unchanged) |
| Characters | 91.2% | **97.7%** | 18 (was 1) |
| Elements | 71.0% | **90.8%** | 53 (was 1) |
| Colors | 92.7% | **96.6%** | 11 (was 1) |
| **Overall** | **88.3%** | **95.8%** | **101 (was 22)** |

### What Atlas Should Review

1. **Resolution logic correctness**: Are the three new `_fix_resolved_*` functions too aggressive (marking things as resolved that aren't)?  Run spot-checks on the "resolved" verdicts to validate.
2. **Coverage gaps**: The functions use heuristics (keyword matching, corrections.json lookups). Are there patterns they miss?
3. **Threshold question**: Should we add adjusted-accuracy gates for characters (>95%?) and elements (>85%?) in addition to the theme gate?
4. **Process rule**: Regression resolution logic should be added for ANY new dimension at the time the dimension is added to the regression — never as an afterthought.

### Incident 2b: Adj% Numbers Are Heuristic, Not Ground Truth

The fix above (adding resolution functions) improved visibility, but the Adj% numbers should **not be treated as reliable accuracy metrics**. They are estimates.

**Why Adj% can't be fully trusted:**

1. **False positives in resolution** — Token matching is fuzzy. If the user said "correct but should say Asian Lady" and the result has "Lady", the token "lady" matches → marked "resolved." But the user wanted "Asian Lady" specifically. The resolution function can't distinguish between "close enough" and "actually correct."

2. **Missing resolution patterns** — The element resolver checks corrections.json, frames, splits, and bloat removal — but misses the most common case: "user said X was missing, and X is now present." Example: user said "also flowers in the bg" for `Butterfly-Staxx`, result now has `Flowers/Blossoms`, but the function doesn't detect this and reports it UNRESOLVED. Errors go both ways.

3. **"OK" verdicts may be stale** — An "OK" verdict means the classification was correct *at the time of review*. Many games from batches 1-3 haven't been re-classified since then. If a subsequent re-run changes a correct answer to a wrong one, we'd never know — it's still counted as "OK" based on old review.

4. **Base% is the only honest number** — Base% counts only explicit "OK" verdicts from the user. That's ground truth. Adj% adds algorithmic guesswork on top. Real accuracy is somewhere between Base% (86.2%) and Adj% (95.8%).

**Decision for Atlas:**

The regression is useful for catching regressions (did theme drop below 97%?) but not for absolute accuracy measurement. The options:

1. **Accept Adj% as "good enough"** — Treat it as directional, not absolute. Keep theme gate at ≥97% adj.
2. **Add a periodic blind spot-check** — Generate a random N-game sample from ALL classified games (not just latest batch) and have the user do a clean review with no prior context. This gives an unbiased accuracy read. Recommended: 20-game random sample every 500 classifications.
3. **Tighten resolution logic** — Make the `_fix_resolved_*` functions stricter (fewer false positives) at the cost of more false negatives. The regression would show lower Adj% but higher confidence in the number.
4. **Track "resolution confidence"** — Each resolved fix could carry a confidence tag (high = corrections.json override matched exactly; medium = keyword match; low = fuzzy token). Report Adj% at each confidence level separately.

### Files Changed (Regression Fix)

| File | Change |
|------|--------|
| `classify_art_v2.py` | Added `_fix_resolved_characters()`, `_fix_resolved_elements()`, `_fix_resolved_color()`. Modified `run_expanded_regression()` to use all resolution functions. Report now shows unresolved details for all dimensions. |
| `.cursor/rules/atlas-working-memory.mdc` | Updated accuracy numbers, added regression blind spot note |
