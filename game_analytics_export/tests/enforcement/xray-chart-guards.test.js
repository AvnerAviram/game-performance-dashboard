/**
 * Enforcement: xrayActive guards on Chart.js click handlers
 *
 * Every Chart.js onClick handler and canvas.addEventListener('click')
 * in chart/renderer files must check `window.xrayActive` and return early
 * so that X-Ray mode can intercept clicks instead of the native handler.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

const CHART_FILES = [
    'ui/chart-themes.js',
    'ui/chart-providers.js',
    'ui/chart-volatility.js',
    'ui/chart-rtp.js',
    'ui/chart-brands.js',
    'ui/chart-art.js',
    'ui/chart-utils.js',
    'ui/renderers/art-renderer.js',
    'features/trends.js',
];

describe('xrayActive guards on chart handlers', () => {
    for (const relPath of CHART_FILES) {
        const filePath = path.join(SRC_DIR, relPath);
        if (!fs.existsSync(filePath)) continue;
        const content = fs.readFileSync(filePath, 'utf8');

        it(`${relPath}: every onClick handler checks xrayActive`, () => {
            const lines = content.split('\n');
            const violations = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (/onClick\s*[:=]\s*\(/.test(line) || /\.addEventListener\(\s*['"]click['"]/.test(line)) {
                    const isComment = line.trimStart().startsWith('//') || line.trimStart().startsWith('*');
                    if (isComment) continue;

                    const contextWindow = lines.slice(Math.max(0, i - 3), Math.min(i + 8, lines.length)).join('\n');
                    const isUIControl =
                        contextWindow.includes('btn.addEventListener') ||
                        contextWindow.includes('button') ||
                        contextWindow.includes('pagination') ||
                        contextWindow.includes('Show more') ||
                        contextWindow.includes('toggle');
                    if (isUIControl && line.includes('addEventListener')) continue;

                    const nearbyLines = lines.slice(i, Math.min(i + 5, lines.length)).join('\n');
                    if (!nearbyLines.includes('xrayActive')) {
                        const handlerType = line.includes('addEventListener') ? 'addEventListener' : 'onClick';
                        violations.push(`Line ${i + 1}: ${handlerType} handler missing xrayActive guard`);
                    }
                }
            }

            if (violations.length > 0) {
                expect.fail(
                    `${relPath} has ${violations.length} click handler(s) without xrayActive guard:\n` +
                        violations.map(v => `  - ${v}`).join('\n')
                );
            }
        });
    }
});
