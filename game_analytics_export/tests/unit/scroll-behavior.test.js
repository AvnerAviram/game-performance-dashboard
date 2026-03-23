import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const overviewPath = resolve(__dirname, '../../src/pages/overview.html');
const routerPath = resolve(__dirname, '../../src/ui/router.js');

describe('Scroll Behavior – View more buttons', () => {
    const overview = readFileSync(overviewPath, 'utf8');

    test('View more buttons exist (exactly 2)', () => {
        const matches = overview.match(/View more/g) || [];
        expect(matches.length).toBe(2);
    });

    test('all View more scrolls use getBoundingClientRect, not offsetTop', () => {
        const scrollCalls = overview.match(/getBoundingClientRect/g) || [];
        expect(scrollCalls.length).toBe(4);

        expect(overview).not.toMatch(/sc\.scrollTop\s*=\s*\w+\.offsetTop/);
    });

    test('all scrolls use behavior: smooth', () => {
        const smoothCalls = overview.match(/behavior:\s*'smooth'/g) || [];
        expect(smoothCalls.length).toBe(2);
    });

    test('scrollTo is used instead of direct scrollTop assignment for View more', () => {
        const scrollToCalls = overview.match(/sc\.scrollTo\(\{/g) || [];
        expect(scrollToCalls.length).toBe(2);
    });

    test('no window.scrollTo calls in overview', () => {
        expect(overview).not.toContain('window.scrollTo');
    });

    test('no scrollIntoView calls in overview', () => {
        expect(overview).not.toContain('scrollIntoView');
    });

    test('Market Landscape View more targets market-landscape-chart', () => {
        expect(overview).toContain("getElementById('market-landscape-chart')");
    });

    test('Top Game Brands View more targets brand-intelligence-section', () => {
        expect(overview).toContain("getElementById('brand-intelligence-section')");
    });

    test('setTimeout delay is at least 600ms for layout settling', () => {
        const delays = overview.match(/setTimeout\(\(\)\s*=>\s*\{[\s\S]*?\},\s*(\d+)/g) || [];
        delays.forEach(block => {
            const ms = parseInt(block.match(/,\s*(\d+)$/)[1]);
            expect(ms).toBeGreaterThanOrEqual(600);
        });
    });
});

describe('Scroll Reset on Page Navigation', () => {
    const router = readFileSync(routerPath, 'utf8');

    test('router resets scrollTop to 0 after innerHTML update', () => {
        const lines = router.split('\n');
        const ihLine = lines.findIndex(l => l.includes('container.innerHTML = html'));
        const srLine = lines.findIndex(l => l.includes('container.scrollTop = 0'));
        expect(ihLine).toBeGreaterThan(-1);
        expect(srLine).toBeGreaterThan(-1);
        expect(srLine).toBeGreaterThan(ihLine);
        expect(srLine - ihLine).toBeLessThanOrEqual(2);
    });
});
