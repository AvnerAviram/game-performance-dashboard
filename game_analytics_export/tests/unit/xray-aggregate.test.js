/**
 * Unit tests for X-Ray aggregate metric explanation
 *
 * Validates that METRIC_DEFINITIONS in xray-panel.js covers all metric keys
 * used in data-xray attributes across the codebase.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_DIR = path.join(ROOT, 'src');

function getAllJsFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...getAllJsFiles(full));
        else if (entry.name.endsWith('.js')) results.push(full);
    }
    return results;
}

function extractMetricKeys(content) {
    const keys = new Set();
    const re = /metric:\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(content)) !== null) {
        keys.add(m[1]);
    }
    return keys;
}

describe('X-Ray aggregate metrics', () => {
    const panelFile = fs.readFileSync(path.join(SRC_DIR, 'ui/renderers/xray-panel.js'), 'utf8');

    it('METRIC_DEFINITIONS exists and is a non-empty map', () => {
        expect(panelFile).toContain('METRIC_DEFINITIONS');
        expect(panelFile).toMatch(/const METRIC_DEFINITIONS\s*=\s*\{/);
    });

    it('every metric key used in data-xray has a matching METRIC_DEFINITIONS entry', () => {
        const definedKeys = new Set();
        const defRe = /^\s+(\w+)\s*:\s*\{/gm;
        const defSection = panelFile.match(/const METRIC_DEFINITIONS\s*=\s*\{([\s\S]*?)\n\};/);
        if (defSection) {
            let m;
            while ((m = defRe.exec(defSection[1])) !== null) {
                definedKeys.add(m[1]);
            }
        }

        const allMetricKeys = new Set();
        for (const file of getAllJsFiles(SRC_DIR)) {
            if (file.includes('xray-panel.js')) continue;
            const content = fs.readFileSync(file, 'utf8');
            for (const key of extractMetricKeys(content)) {
                allMetricKeys.add(key);
            }
        }

        const missing = [...allMetricKeys].filter(k => !definedKeys.has(k));
        if (missing.length > 0) {
            expect.fail(
                `${missing.length} metric key(s) used in data-xray but missing from METRIC_DEFINITIONS:\n` +
                    missing.map(k => `  - "${k}"`).join('\n')
            );
        }
    });

    it('each METRIC_DEFINITIONS entry has label, formula, and source', () => {
        const defSection = panelFile.match(/const METRIC_DEFINITIONS\s*=\s*\{([\s\S]*?)\n\};/);
        expect(defSection).toBeTruthy();

        const entryRe = /(\w+)\s*:\s*\{[\s\S]*?\},/g;
        const entries = [];
        let m;
        while ((m = entryRe.exec(defSection[1])) !== null) {
            entries.push({ name: m[1], body: m[0] });
        }
        expect(entries.length).toBeGreaterThan(0);

        for (const { name, body } of entries) {
            expect(body, `${name} missing label`).toContain('label:');
            expect(body, `${name} missing formula`).toContain('formula:');
            expect(body, `${name} missing source`).toContain('source:');
        }
    });

    it('renderAggregateExplanation is exported', () => {
        expect(panelFile).toContain('export function renderAggregateExplanation');
    });

    it('data-xray.js imports renderAggregateExplanation', () => {
        const xrayFile = fs.readFileSync(path.join(SRC_DIR, 'features/data-xray.js'), 'utf8');
        expect(xrayFile).toContain('renderAggregateExplanation');
    });

    it('data-xray.js handles metric key in openFromAttribute', () => {
        const xrayFile = fs.readFileSync(path.join(SRC_DIR, 'features/data-xray.js'), 'utf8');
        expect(xrayFile).toContain('info.metric');
        expect(xrayFile).toContain('openXRayForAggregate');
    });

    it('no "NJ iGaming" or "platform data feed" in aggregate definitions', () => {
        expect(panelFile).not.toMatch(/NJ iGaming/i);
        expect(panelFile).not.toContain('platform data feed');
    });
});
