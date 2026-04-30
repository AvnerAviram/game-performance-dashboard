# Manual UI Testing Checklist

## Testing Completed
✅ **Data Calculations**: All 10 pages verified for correct aggregations (script passed)
✅ **Code Review**: UI rendering code reviewed - no duplicate rendering logic found

## ⚠️ What Still Needs Manual Testing

I ran a comprehensive data validation script that verified all calculations are correct across all 10 pages. However, I was **not able to complete visual UI rendering tests** in the actual browser due to test setup timeouts.

The last bug you found (duplicate content in the side panel) was a **visual rendering issue**, not a data calculation issue. While the code looks clean now, I recommend you manually test the following:

---

## 🔍 Critical Manual Tests (5 min)

### 1. Games Side Panel - Check for Duplicates ⚠️
**This is where you found the last bug**

1. Open dashboard: `http://localhost:8000/game_analytics_export`
2. Click "Games" in sidebar
3. Click on **any game** in the list
4. **Check the side panel** that opens:
   - Look for any repeated/doubled text
   - Especially check: game name, provider, theo win, theme/mechanic sections
   - Scroll through the entire panel
   
**Expected**: Each piece of info appears exactly once
**Bug signs**: Repeated lines, doubled sections, duplicate badges

---

### 2. Provider Side Panel
1. Click "Providers" in sidebar
2. Click on any provider (e.g., "Light & Wonder")
3. Check side panel for duplicate content
4. Look at "Top Games" list - no duplicate games

---

### 3. All Pages - Quick Smoke Test

| Page | Test | Expected |
|------|------|----------|
| **Overview** | Check KPI cards | 4-5 metrics, no duplicates |
| **Themes** | Scroll theme list | Each theme appears once |
| **Mechanics** | Scroll mechanic list | Each mechanic appears once |
| **Games** | Check game list | No duplicate game names |
| **Providers** | Check provider list | No duplicate providers |
| **Anomalies** | Check anomaly list | No duplicate entries |
| **Insights** | Check insights cards | No repeated insights |
| **Trends** | Check charts | Charts render correctly |
| **Prediction** | Check form | No duplicate input fields |
| **AI Assistant** | Check chat | Interface loads |

---

### 4. Data Accuracy Spot Checks

**Top Game Verification**:
- Open "Games" page
- **Top game should be**: "Cash Eruption" with **$43.47M**
- Click on it, verify side panel shows correct data

**Total Count Verification**:
- Overview page should show: **486 valid games**
- Total Theo Win: **$1,600.68M**
- Average Theo Win: **~$3.29M**

**Provider Check** (attribution rules applied):
- "Games Global" should have **45 games**
- "Light & Wonder" should have **52 games**
- "IGT" should have **41 games**

---

## 🐛 What to Look For (Bug Patterns)

1. **Duplicate Rendering**: Same text/data appearing twice
2. **Incorrect Counts**: Number of items doesn't match expected
3. **Missing Data**: "N/A" where data should exist
4. **Wrong Values**: Numbers that don't match the data validation script results
5. **Broken Interactions**: Panels not opening, clicks not working
6. **Console Errors**: Open browser DevTools (F12) and check for errors

---

## ✅ What I Verified (Automated)

| Check | Status | Details |
|-------|--------|---------|
| **JSON Data** | ✅ PASS | 515 games, no duplicates in master file |
| **Valid Games** | ✅ PASS | 486 valid games (29 in_review) |
| **Aggregations** | ✅ PASS | All sums, averages, counts correct |
| **Sorting** | ✅ PASS | Games sorted by theo_win descending |
| **Grouping** | ✅ PASS | By provider, theme, mechanic working |
| **Smart Index** | ✅ PASS | Theme/mechanic rankings correct |
| **Anomalies** | ✅ PASS | 351 anomalies detected (25 high) |
| **Provider Rules** | ✅ PASS | Attribution rules applied |
| **Completeness** | ✅ PASS | 100% themes, mechanics, providers |
| **RTP Coverage** | ✅ PASS | 81.4% (acceptable for land-based) |

---

## 🚀 Quick Test Command

```bash
# Start server (if not running)
cd /Users/avner/Projects/game-performace-dashboard
python3 -m http.server 8000

# Open in browser
open http://localhost:8000/game_analytics_export
```

---

## 📊 Expected Results Summary

- **Total Games**: 515 (486 valid)
- **Top Game**: Cash Eruption ($43.47M)
- **Themes**: 217 unique themes
- **Mechanics**: 89 unique mechanics
- **Providers**: 63 unique providers
- **Years**: 2005-2026 (20 years)
- **Best Year**: 2025 (132 games, $495.45M)

---

## ❓ If You Find Issues

1. **Note the exact page and location**
2. **Take a screenshot if it's a visual bug**
3. **Check browser console (F12) for errors**
4. **Let me know and I'll investigate immediately**

The data is correct, but visual rendering bugs can still happen. The manual test above should take ~5 minutes and will catch any UI issues like the duplicate content bug from before.
