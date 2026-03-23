import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Scroll reset tests — verifies that page navigation resets scroll position
 * and that the router code contains the scroll reset logic.
 */

const routerPath = resolve(__dirname, '../../src/ui/router.js');
const dashboardPath = resolve(__dirname, '../../dashboard.html');
const overviewPath = resolve(__dirname, '../../src/pages/overview.html');

describe('Scroll Reset on Page Navigation', () => {
    test('router.js should reset scrollTop after setting innerHTML', () => {
        const src = readFileSync(routerPath, 'utf8');
        const lines = src.split('\n');

        const setInnerHTMLLine = lines.findIndex(l => l.includes('container.innerHTML = html'));
        const scrollResetLine = lines.findIndex(l => l.includes('container.scrollTop = 0'));

        expect(setInnerHTMLLine).toBeGreaterThan(-1);
        expect(scrollResetLine).toBeGreaterThan(-1);
        expect(scrollResetLine).toBeGreaterThan(setInnerHTMLLine);
        expect(scrollResetLine - setInnerHTMLLine).toBeLessThanOrEqual(2);
    });

    test('page-container element exists in dashboard.html with overflow-y-auto', () => {
        const html = readFileSync(dashboardPath, 'utf8');
        expect(html).toContain('id="page-container"');
        expect(html).toContain('overflow-y-auto');
    });

    test('router.js references page-container by ID', () => {
        const src = readFileSync(routerPath, 'utf8');
        expect(src).toContain("getElementById('page-container')");
    });

    test('overview View more scroll targets use page-container, not window.scrollTo', () => {
        const html = readFileSync(overviewPath, 'utf8');
        const viewMoreButtons = html.match(/View more/g) || [];
        expect(viewMoreButtons.length).toBeGreaterThan(0);

        const windowScrollTo = (html.match(/window\.scrollTo/g) || []).length;
        const pageContainerScrolls = (html.match(/page-container/g) || []).length;
        expect(windowScrollTo).toBe(0);
        expect(pageContainerScrolls).toBeGreaterThan(0);
    });

    test('no scrollIntoView calls remain in overview (should use page-container.scrollTop)', () => {
        const html = readFileSync(overviewPath, 'utf8');
        const scrollIntoViewCalls = (html.match(/scrollIntoView/g) || []).length;
        expect(scrollIntoViewCalls).toBe(0);
    });
});
