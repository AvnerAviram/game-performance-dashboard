# MEDIUM: the Free Spins mechanic line in Mechanic Trends chart showing spike in 2013

**Page:** trends
**Bug Type:** trend_spike
**Confidence:** 4/5
**Severity:** MEDIUM
**Verdict:** CONFIRMED_ISSUE

## What was found

Free Spins mechanic shows a sharp spike to ~5 in 2013, then drops significantly in 2014. This appears to be an isolated peak that doesn't follow the gradual trend patterns of other mechanics.

## Claude's Analysis

The X-Ray panel reveals critical data quality problems with the Free Spins mechanic detection. The panel shows 'No verbatim evidence captured for this feature' and relies on keyword matching against a feature taxonomy, but without source text evidence, we cannot verify the accuracy of the classification that created the 2013 spike.

## X-Ray Evidence

The X-Ray shows: (1) Features identified via keyword matching against taxonomy, (2) 'No verbatim evidence captured for this feature' under the source text section, (3) Only shows one game example (Cash Eruption by IGT) but no actual text evidence of Free Spins classification, (4) 2435 games classified but no confidence score visible

## Recommended Action

Review the keyword matching algorithm and feature taxonomy for Free Spins classification. Investigate why no source text evidence was captured, and audit the games classified as having Free Spins in 2013 to verify they actually contain this mechanic. Consider implementing stricter evidence requirements for feature classification.

## Steps to Reproduce

1. Open the dashboard and navigate to **trends** page
2. Look at: the Free Spins mechanic line in Mechanic Trends chart showing spike in 2013
3. Ctrl+Click to open X-Ray
4. Compare the X-Ray data with what the chart shows

## Screenshots

![xray-trends-1.png](xray-trends-1.png)
