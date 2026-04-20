/**
 * Enforcement: No Made-Up Provenance Text
 *
 * Scans provenance-diagnosis.cjs and xray-panel.js for hardcoded
 * percentages, generic fallback messages, and other non-grounded text.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Enforcement: No made-up provenance text', () => {
    const diagFile = fs.readFileSync(path.join(ROOT, 'server/helpers/provenance-diagnosis.cjs'), 'utf8');
    const panelFile = fs.readFileSync(path.join(ROOT, 'src/ui/renderers/xray-panel.js'), 'utf8');

    it('provenance-diagnosis.cjs has no hardcoded COVERAGE_STATS object', () => {
        expect(diagFile).not.toMatch(/COVERAGE_STATS\s*=\s*\{[^}]*pct\s*:/);
    });

    it('provenance-diagnosis.cjs has no hardcoded "78% coverage"', () => {
        expect(diagFile).not.toContain('78% coverage');
        expect(diagFile).not.toContain("'78%'");
    });

    it('provenance-diagnosis.cjs has no generic "Data pipeline" fallback', () => {
        expect(diagFile).not.toContain("method: 'Data pipeline'");
    });

    it('provenance-diagnosis.cjs has no "NJ iGaming" references', () => {
        expect(diagFile).not.toMatch(/NJ iGaming/i);
    });

    it('provenance-diagnosis.cjs has no "platform data" or "operator data" generic labels', () => {
        expect(diagFile).not.toContain("'Operator performance data'");
        expect(diagFile).not.toContain("'Platform metadata'");
        expect(diagFile).not.toContain("'Platform data'");
    });

    it('xray-panel.js has no client-side SOURCE_LABELS map', () => {
        expect(panelFile).not.toMatch(/const SOURCE_LABELS\s*=/);
    });

    it('xray-panel.js has no "NJ iGaming" references', () => {
        expect(panelFile).not.toMatch(/NJ iGaming/i);
    });

    it('xray-panel.js has no "Source data not available" (too vague)', () => {
        expect(panelFile).not.toContain('Source data not available');
    });

    it('provenance-diagnosis.cjs exports computeCoverageStats for runtime computation', () => {
        expect(diagFile).toContain('computeCoverageStats');
        expect(diagFile).toContain('module.exports');
        expect(diagFile).toMatch(/computeCoverageStats/);
    });

    it('provenance-diagnosis.cjs exports RELEASE_DATE_SOURCE_LABELS', () => {
        expect(diagFile).toContain('RELEASE_DATE_SOURCE_LABELS');
    });

    it('all RELEASE_DATE_SOURCE_LABELS cover known original_release_date_source values', () => {
        const KNOWN = [
            'slotcatalog',
            'slotcatalog_fuzzy',
            'slotreport',
            'slotreport_fuzzy',
            'slotreport_corrected',
            'html_copyright',
            'html_extract',
            'nj_corrected',
            'verified_reference',
            'evolution',
            'claude_lookup_high',
            'claude_lookup_medium',
            'claude_lookup_low',
        ];
        const { RELEASE_DATE_SOURCE_LABELS } = require('../../server/helpers/provenance-diagnosis.cjs');
        for (const key of KNOWN) {
            expect(RELEASE_DATE_SOURCE_LABELS[key]).toBeTruthy();
        }
    });
});
