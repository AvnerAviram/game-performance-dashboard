# HIGH: X-Ray panel showing Animals theme classification

**Page:** mechanics
**Bug Type:** xray_provenance
**Confidence:** 5/5
**Severity:** HIGH
**Verdict:** CONFIRMED_ISSUE

## What was found

X-Ray panel shows 'Animals' theme classification with 467 games, but this is a Mechanics page and the highlighted row in the table is 'Respin' (row 9). The X-Ray should show mechanic data, not theme data.

## Claude's Analysis

This is definitely a real data quality issue. The user is on a Mechanics page looking at game mechanics data, with 'Respin' highlighted as row 9. However, the X-Ray panel clearly shows 'THEME CLASSIFICATION' for 'Animals' theme data, not mechanic data. The X-Ray should be showing information about the 'Respin' mechanic when clicked from a mechanics table.

## X-Ray Evidence

The X-Ray panel header explicitly states 'THEME CLASSIFICATION' and shows 'Animals' as the classification type. The drilldown section shows 'theme_primary' as the extracted field, and the explanation describes how 'Themes are classified by matching keywords in game rules HTML text' - all of which confirms this is theme data, not mechanic data as expected on a Mechanics page.

## Recommended Action

Fix the X-Ray panel to show mechanic-related data when clicking on mechanic rows. The panel should display information about the 'Respin' mechanic instead of the 'Animals' theme classification.

## Steps to Reproduce

1. Open the dashboard and navigate to **mechanics** page
2. Look at: X-Ray panel showing Animals theme classification
3. Ctrl+Click to open X-Ray
4. Compare the X-Ray data with what the chart shows

## Screenshots

![xray-mechanics-0.png](xray-mechanics-0.png)
