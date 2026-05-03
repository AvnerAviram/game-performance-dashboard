import { describe, it, expect } from 'vitest';
import { ELEMENT_CONSOLIDATION } from '../../src/lib/shared-config.js';

/**
 * Mirrors `consolidateElements` in `src/lib/metrics.js` (used by getArtElementMetrics).
 * Kept here so consolidation rules are tested against ELEMENT_CONSOLIDATION without DB.
 */
function consolidateElements(rows) {
    const merged = {};
    for (const r of rows) {
        const canonical = ELEMENT_CONSOLIDATION[r.element] || r.element;
        if (!merged[canonical]) {
            merged[canonical] = { element: canonical, count: 0, totalTheo: 0, _sumForAvg: 0 };
        }
        const m = merged[canonical];
        m.count += r.count;
        m.totalTheo += r.totalTheo;
        m._sumForAvg += r.avgTheo * r.count;
    }
    return Object.values(merged)
        .map(m => ({ element: m.element, count: m.count, totalTheo: m.totalTheo, avgTheo: m._sumForAvg / m.count }))
        .sort((a, b) => b.count - a.count);
}

describe('consolidateElements (art element metrics)', () => {
    it('merges Fire/Flames/Lava into Fire/Flames per ELEMENT_CONSOLIDATION', () => {
        expect(ELEMENT_CONSOLIDATION['Fire/Flames/Lava']).toBe('Fire/Flames');

        const rows = [
            { element: 'Fire/Flames', count: 10, totalTheo: 100, avgTheo: 10 },
            { element: 'Fire/Flames/Lava', count: 5, totalTheo: 40, avgTheo: 8 },
        ];
        const out = consolidateElements(rows);
        const fire = out.find(r => r.element === 'Fire/Flames');
        expect(fire).toBeDefined();
        expect(fire.count).toBe(15);
        expect(fire.totalTheo).toBe(140);
        expect(fire.avgTheo).toBeCloseTo((10 * 10 + 5 * 8) / 15, 8);
        expect(out.some(r => r.element === 'Fire/Flames/Lava')).toBe(false);
    });

    it('orders merged rows by count descending', () => {
        const rows = [
            { element: 'Water', count: 3, totalTheo: 30, avgTheo: 10 },
            { element: 'Fire/Flames/Lava', count: 10, totalTheo: 80, avgTheo: 8 },
            { element: 'Fire/Flames', count: 2, totalTheo: 24, avgTheo: 12 },
        ];
        const out = consolidateElements(rows);
        expect(out[0].element).toBe('Fire/Flames');
        expect(out[0].count).toBe(12);
    });
});
