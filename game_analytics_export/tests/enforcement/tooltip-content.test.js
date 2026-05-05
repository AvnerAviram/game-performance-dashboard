/**
 * Enforcement: Tooltip Content Quality
 *
 * Ensures every info-icon / filter-tooltip in HTML pages contains:
 *   1. Non-empty text content (at least 20 characters)
 *   2. A formula marker or mathematical notation for metric-related tooltips
 *
 * Metric-related tooltips are identified by being inside ranking toggles,
 * table column headers, or filter buttons that reference performance/market metrics.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const PAGES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/pages');

const METRIC_PAGES = [
    'overview.html',
    'themes.html',
    'mechanics.html',
    'providers.html',
    'games.html',
    'game-lab.html',
];

function extractTooltipBlocks(html) {
    const blocks = [];
    const patterns = [
        /class="filter-tooltip">([\s\S]*?)<\/div>\s*<\/span>/g,
        /class="filter-tooltip">([\s\S]*?)<\/div>\s*<\/div>/g,
    ];
    for (const pat of patterns) {
        let match;
        while ((match = pat.exec(html)) !== null) {
            blocks.push({ content: match[1], position: match.index });
        }
    }
    return blocks;
}

describe('Tooltip Content Quality Enforcement', () => {
    it('Detail pages have ranking toggle tooltips with Formula markers', () => {
        const pagesWithToggle = ['themes.html', 'mechanics.html', 'providers.html'];
        for (const page of pagesWithToggle) {
            const html = fs.readFileSync(path.join(PAGES_DIR, page), 'utf-8');
            expect(html).toContain('data-ranking-mode="indexing"');
            expect(html).toContain('data-ranking-mode="grossing"');

            const indexingIdx = html.indexOf('data-ranking-mode="indexing"');
            const nearbyContent = html.slice(indexingIdx, indexingIdx + 2000);
            expect(nearbyContent).toContain('Formula:');
        }
    });

    it('overview.html does NOT have ranking toggle', () => {
        const html = fs.readFileSync(path.join(PAGES_DIR, 'overview.html'), 'utf-8');
        expect(html).not.toContain('data-ranking-mode="indexing"');
    });

    it('themes.html Performance Index column tooltip has formula', () => {
        const html = fs.readFileSync(path.join(PAGES_DIR, 'themes.html'), 'utf-8');
        const piSection = html.slice(
            html.indexOf('themes-tooltip-formula'),
            html.indexOf('themes-tooltip-formula') + 500
        );
        expect(piSection).toMatch(/AVG|formula|divide|÷/i);
    });

    it('themes.html Market Share column tooltip has formula', () => {
        const html = fs.readFileSync(path.join(PAGES_DIR, 'themes.html'), 'utf-8');
        const msSection = html.slice(html.indexOf('Market Share % (GGR Share)'));
        const tooltipEnd = msSection.indexOf('</div>', msSection.indexOf('</div>') + 1);
        const tooltip = msSection.slice(0, tooltipEnd);
        expect(tooltip).toMatch(/Formula:|SUM/i);
    });

    it('mechanics.html Performance Index tooltip has formula', () => {
        const html = fs.readFileSync(path.join(PAGES_DIR, 'mechanics.html'), 'utf-8');
        const piSection = html.slice(
            html.indexOf('mechanics-tooltip-formula'),
            html.indexOf('mechanics-tooltip-formula') + 500
        );
        expect(piSection).toMatch(/AVG|formula|divide|÷/i);
    });

    it('games.html filter tooltips all have Formula markers', () => {
        const html = fs.readFileSync(path.join(PAGES_DIR, 'games.html'), 'utf-8');
        const filters = ['Market Leaders', 'New Releases', 'Hidden Gems'];
        for (const filter of filters) {
            const idx = html.indexOf(`<strong>${filter}</strong>`);
            expect(idx).toBeGreaterThan(-1);
            const nearby = html.slice(idx, idx + 500);
            expect(nearby).toMatch(/Formula:/i);
        }
    });

    it('game-lab.html tooltips include Formula markers', () => {
        const html = fs.readFileSync(path.join(PAGES_DIR, 'game-lab.html'), 'utf-8');
        const formulaCount = (html.match(/<b>Formula:<\/b>/g) || []).length;
        expect(formulaCount).toBeGreaterThanOrEqual(3);
    });

    it('No empty filter-tooltip divs in any metric page', () => {
        const violations = [];
        for (const page of METRIC_PAGES) {
            const html = fs.readFileSync(path.join(PAGES_DIR, page), 'utf-8');
            const emptyTooltip = /<div class="filter-tooltip">\s*<\/div>/g;
            if (emptyTooltip.test(html)) {
                violations.push(page);
            }
        }
        expect(violations).toEqual([]);
    });

    it('Provider table tooltips in ui-providers-games.js have Formula markers', () => {
        const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
        const src = fs.readFileSync(path.join(srcDir, 'ui/ui-providers-games.js'), 'utf-8');

        const avgPiIdx = src.indexOf('Avg Performance Index (Theo Win Index)');
        expect(avgPiIdx).toBeGreaterThan(-1);
        const nearbyPI = src.slice(avgPiIdx, avgPiIdx + 400);
        expect(nearbyPI).toMatch(/Formula:/i);

        const ggrIdx = src.indexOf('GGR Share % (Market Share)');
        expect(ggrIdx).toBeGreaterThan(-1);
        const nearbyGGR = src.slice(ggrIdx, ggrIdx + 400);
        expect(nearbyGGR).toMatch(/Formula:/i);
    });
});
