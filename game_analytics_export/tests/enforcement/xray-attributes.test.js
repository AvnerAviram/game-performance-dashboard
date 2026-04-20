/**
 * Enforcement: data-xray attributes on clickable data elements
 *
 * Every element with an onclick handler that opens a data panel
 * (showGameDetails, showProviderDetails, showThemeDetails, showMechanicDetails)
 * must have a data-xray attribute on itself or a nearby element in the same
 * HTML template expression so that the X-Ray feature can correctly identify
 * what was clicked without falling back to fragile regex-based onclick parsing.
 *
 * Exceptions:
 *   - data-xray.js (the X-Ray feature itself)
 *   - xray-panel.js (X-Ray rendering, not clickable data)
 *   - Elements that use event.stopPropagation() as navigation breadcrumbs
 *   - Collapsible list controls, sort headers, and other UI-only interactions
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

const PANEL_HANDLERS = [
    'showGameDetails',
    'showProviderDetails',
    'showThemeDetails',
    'showMechanicDetails',
    'showThemeForProvider',
    'showMechForProvider',
];

const HANDLER_RE = new RegExp(`(?:${PANEL_HANDLERS.join('|')})`, 'g');

const EXCLUDED_FILES = new Set([
    'features/data-xray.js',
    'ui/renderers/xray-panel.js',
    'ui/chart-providers.js',
    'ui/chart-themes.js',
    'ui/chart-volatility.js',
    'ui/chart-rtp.js',
    'ui/chart-brands.js',
    'ui/chart-art.js',
    'ui/chart-utils.js',
    'features/trends.js',
    'ui/renderers/blueprint-core.js',
]);

function getAllJsFiles(dir, base = '') {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            results.push(...getAllJsFiles(path.join(dir, entry.name), rel));
        } else if (entry.name.endsWith('.js')) {
            results.push(rel);
        }
    }
    return results;
}

describe('data-xray attribute coverage', () => {
    const files = getAllJsFiles(SRC_DIR);

    it('all source files with panel-opening onclick handlers also have data-xray attributes', () => {
        const violations = [];

        for (const relPath of files) {
            if (EXCLUDED_FILES.has(relPath)) continue;

            const content = fs.readFileSync(path.join(SRC_DIR, relPath), 'utf-8');
            const lines = content.split('\n');

            const hasHandler = HANDLER_RE.test(content);
            HANDLER_RE.lastIndex = 0;
            if (!hasHandler) continue;

            const hasDataXray = content.includes('data-xray') || content.includes('dataset.xray');
            if (!hasDataXray) {
                const handlerLines = [];
                lines.forEach((line, idx) => {
                    if (HANDLER_RE.test(line)) {
                        HANDLER_RE.lastIndex = 0;
                        const isBreadcrumb = line.includes('stopPropagation') && line.includes('onclick');
                        const isImport = line.trimStart().startsWith('import ');
                        const isComment = line.trimStart().startsWith('//') || line.trimStart().startsWith('*');
                        if (!isBreadcrumb && !isImport && !isComment) {
                            handlerLines.push(idx + 1);
                        }
                    }
                });

                if (handlerLines.length > 0) {
                    violations.push(
                        `${relPath} has panel handlers at lines [${handlerLines.join(', ')}] but no data-xray attributes`
                    );
                }
            }
        }

        if (violations.length > 0) {
            expect.fail(
                `${violations.length} file(s) with panel-opening handlers missing data-xray attributes:\n` +
                    violations.map(v => `  - ${v}`).join('\n') +
                    '\n\nEvery file with showGameDetails/showProviderDetails/showThemeDetails/showMechanicDetails ' +
                    'onclick handlers must also include data-xray attributes for X-Ray feature support.'
            );
        }
    });

    it('data-xray JSON payloads have required keys', () => {
        const badPayloads = [];
        const XRAY_JSON_RE = /data-xray='(\$\{escapeAttr\(JSON\.stringify\(([^)]+)\)\)})'/g;
        const XRAY_DATASET_RE = /dataset\.xray\s*=\s*JSON\.stringify\(([^)]+)\)/g;

        for (const relPath of files) {
            const content = fs.readFileSync(path.join(SRC_DIR, relPath), 'utf-8');

            for (const re of [XRAY_JSON_RE, XRAY_DATASET_RE]) {
                let m;
                while ((m = re.exec(content)) !== null) {
                    const objStr = (m[2] || m[1]).trim();
                    const hasGame = /\bgame\b/.test(objStr);
                    const hasDimension = /\bdimension\b/.test(objStr);
                    const hasMetric = /\bmetric\b/.test(objStr);
                    if (!hasGame && !hasDimension && !hasMetric) {
                        badPayloads.push(
                            `${relPath}: data-xray payload missing 'game', 'dimension', or 'metric' key: ${objStr.slice(0, 80)}`
                        );
                    }
                }
                re.lastIndex = 0;
            }
        }

        if (badPayloads.length > 0) {
            expect.fail(
                `${badPayloads.length} data-xray payload(s) missing required keys:\n` +
                    badPayloads.map(v => `  - ${v}`).join('\n')
            );
        }
    });
});
