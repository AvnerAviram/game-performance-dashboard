# MEDIUM: the Total Games KPI card and the Slot game count in RTP Chart

**Page:** overview
**Bug Type:** count_mismatch
**Confidence:** 4/5
**Severity:** MEDIUM
**Verdict:** CONFIRMED_ISSUE

## What was found

KPI card shows 'TOTAL GAMES 3135' but the RTP Chart filter shows 'Slot (3105)' - a difference of 30 games

## Claude's Analysis

The X-Ray panel confirms that the Total Games KPI is counting ALL games in the dashboard (3135), while the RTP Chart filter shows only Slot games (3105). This means there are 30 non-slot games included in the total count, creating a legitimate discrepancy between total games and slot-specific counts.

## X-Ray Evidence

The X-Ray panel shows the formula 'COUNT of all games in the dashboard' and data source description states 'Total games loaded from performance data CSV. Each game may have additional fields from rules HTML, SlotCatalog, or ground truth.' This confirms the KPI includes all game types, not just slots.

## Recommended Action

This appears to be correct behavior rather than an error - the Total Games should include all game types while the RTP chart filter correctly shows only slots. Consider adding clarity by labeling the KPI as 'TOTAL GAMES (ALL TYPES)' or adding a breakdown showing slot vs non-slot games to eliminate confusion.

## Steps to Reproduce

1. Open the dashboard and navigate to **overview** page
2. Look at: the Total Games KPI card and the Slot game count in RTP Chart
3. Ctrl+Click to open X-Ray
4. Compare the X-Ray data with what the chart shows

## Screenshots

![xray-overview-0.png](xray-overview-0.png)
