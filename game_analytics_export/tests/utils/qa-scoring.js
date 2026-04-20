/**
 * QA Scoring Utilities — three-tier gating for data quality findings.
 *
 * DEFINITE — reuses EXACT production filter/aggregation logic; test fails.
 * LIKELY   — statistical, magnitude-based; configurable thresholds; warns loudly.
 * POSSIBLE — coverage/info only; never fails, logs for review.
 */

/**
 * Score a QA finding based on evidence strength.
 * @param {'DEFINITE'|'LIKELY'|'POSSIBLE'} tier
 * @param {string} dimension - e.g. 'theme', 'provider', 'feature'
 * @param {string} description - human-readable description
 * @param {Object} [evidence] - supporting data
 * @returns {{ tier, dimension, description, evidence }}
 */
export function scoreFinding(tier, dimension, description, evidence = {}) {
    return { tier, dimension, description, evidence };
}

/**
 * Format findings for Vitest assertion messages.
 * @param {Array} findings
 * @param {'DEFINITE'|'LIKELY'|'POSSIBLE'} minTier
 * @returns {string}
 */
export function formatFindings(findings, minTier = 'DEFINITE') {
    const tiers = { DEFINITE: 3, LIKELY: 2, POSSIBLE: 1 };
    const threshold = tiers[minTier] || 3;
    const filtered = findings.filter(f => (tiers[f.tier] || 0) >= threshold);

    if (filtered.length === 0) return '';

    return filtered
        .map(f => {
            const evidence = Object.entries(f.evidence)
                .map(([k, v]) => `    ${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                .join('\n');
            return `[${f.tier}] ${f.dimension}: ${f.description}\n${evidence}`;
        })
        .join('\n\n');
}

/**
 * Assert that no DEFINITE findings exist. LIKELY findings are logged as warnings.
 */
export function assertNoDefiniteFindings(findings, expect) {
    const definite = findings.filter(f => f.tier === 'DEFINITE');
    const likely = findings.filter(f => f.tier === 'LIKELY');

    if (likely.length > 0) {
        console.warn(`⚠️  ${likely.length} LIKELY finding(s):\n${formatFindings(likely, 'LIKELY')}`);
    }

    if (definite.length > 0) {
        expect.fail(`${definite.length} DEFINITE finding(s):\n\n${formatFindings(definite)}`);
    }
}

/**
 * Check if a percentage sum is within tolerance of 100%.
 * Accounts for rounding and coverage gaps.
 * @param {number} sum
 * @param {number} tolerance - default 5%
 * @returns {boolean}
 */
export function isReasonablePercentageSum(sum, tolerance = 5) {
    return sum >= 100 - tolerance && sum <= 100 + tolerance;
}
