import { describe, it, expect } from 'vitest';
import { saLabelSolver, labelQualityMetrics } from '../../src/lib/sa-label-solver.js';
import { needsLeaderLine, snapLabelToBubble } from '../../src/ui/chart-utils.js';

const CHART = { left: 60, top: 20, w: 1000, h: 600 };

const makeLab = (x, y, w = 50, h = 12) => ({ x, y, width: w, height: h });
const makeAnc = (x, y, r = 15) => ({ x, y, r });

/**
 * Realistic dense cluster scenario — mimics the Market Landscape chart's
 * middle band where ~12 bubbles compete for space.
 */
const denseCluster = () => {
    const ancs = [
        makeAnc(420, 320, 18),
        makeAnc(450, 335, 15),
        makeAnc(470, 310, 20),
        makeAnc(500, 325, 16),
        makeAnc(490, 345, 14),
        makeAnc(530, 320, 22),
        makeAnc(550, 340, 17),
        makeAnc(440, 350, 13),
        makeAnc(510, 310, 15),
        makeAnc(460, 360, 12),
        makeAnc(520, 350, 19),
        makeAnc(480, 330, 14),
    ];
    const names = [
        'Dragons',
        'Space',
        'Irish',
        'Magic',
        'Western',
        'Greek',
        'Seasonal/Holiday',
        'Music',
        'Norse',
        'Pirates',
        'Underwater',
        'Classic',
    ];
    const labs = ancs.map((a, i) => makeLab(a.x + a.r + 4, a.y - 6, names[i].length * 6, 12));
    return { labs, ancs, names };
};

/**
 * Spread-out scenario — labels should stay close to bubbles, no overlaps.
 */
const spreadOut = () => {
    const ancs = [
        makeAnc(100, 100, 20),
        makeAnc(300, 500, 18),
        makeAnc(700, 150, 25),
        makeAnc(900, 400, 15),
        makeAnc(500, 300, 22),
    ];
    const names = ['Fire', 'Sports', 'Asian', 'Fantasy', 'Lightning'];
    const labs = ancs.map((a, i) => makeLab(a.x + a.r + 4, a.y - 6, names[i].length * 6, 12));
    return { labs, ancs, names };
};

describe('Greedy Label Solver – core guarantees', () => {
    it('no labels out of chart bounds', () => {
        const { labs, ancs } = denseCluster();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.outOfBounds).toBe(0);
    });

    it('spread-out scenario has zero label-label overlaps', () => {
        const { labs, ancs } = spreadOut();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.labelLabelOverlaps).toBe(0);
    });

    it('spread-out scenario has zero label-bubble overlaps', () => {
        const { labs, ancs } = spreadOut();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.labelBubbleOverlaps).toBe(0);
    });

    it('spread-out: labels stay very close to their bubbles (avg < 40px)', () => {
        const { labs, ancs } = spreadOut();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.avgDist).toBeLessThan(40);
    });

    it('dense cluster: zero label-label overlaps (greedy guarantees this)', () => {
        const { labs, ancs } = denseCluster();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.labelLabelOverlaps).toBe(0);
    });

    it('dense cluster: zero label-bubble overlaps', () => {
        const { labs, ancs } = denseCluster();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.labelBubbleOverlaps).toBe(0);
    });

    it('dense cluster: labels stay reasonably close (avg < 60px)', () => {
        const { labs, ancs } = denseCluster();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.avgDist).toBeLessThan(60);
    });

    it('dense cluster: no single label extremely far (max < 100px)', () => {
        const { labs, ancs } = denseCluster();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.maxDist).toBeLessThan(100);
    });

    it('deterministic — same input produces same output', () => {
        const run = () => {
            const { labs, ancs } = denseCluster();
            saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
            return labs.map(l => `${l.x.toFixed(2)},${l.y.toFixed(2)}`).join('|');
        };
        expect(run()).toBe(run());
    });

    it('largest bubbles get priority placement (closer to their bubble)', () => {
        const { labs, ancs } = denseCluster();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const largestIdx = ancs.reduce((best, a, i) => (a.r > ancs[best].r ? i : best), 0);
        const largestDist = Math.hypot(
            labs[largestIdx].x + labs[largestIdx].width / 2 - ancs[largestIdx].x,
            labs[largestIdx].y + labs[largestIdx].height / 2 - ancs[largestIdx].y
        );
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(largestDist).toBeLessThan(m.avgDist);
    });

    it('adjacent bubbles: labels get placed without overlap', () => {
        const ancs = [makeAnc(400, 200, 20), makeAnc(410, 230, 18)];
        const names = ['Classic', 'Gems & Crystals'];
        const labs = ancs.map((a, i) => makeLab(a.x + a.r + 4, a.y - 6, names[i].length * 6, 12));
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.labelLabelOverlaps).toBe(0);
    });

    it('brand-density: 30 labels with clustering', () => {
        const CHART_BRAND = { left: 60, top: 20, w: 1100, h: 740 };
        const ancs = [];
        const names = [];
        for (let i = 0; i < 10; i++) {
            ancs.push(makeAnc(200 + (i - 5) * 6, 100 + i * 55, 10));
            names.push(`Brand${i}`);
        }
        for (let i = 0; i < 3; i++) {
            ancs.push(makeAnc(280 + i * 5, 150 + i * 80, 12));
            names.push(`Mid${i}`);
        }
        for (let i = 0; i < 4; i++) {
            ancs.push(makeAnc(350 + i * 4, 120 + i * 70, 13));
            names.push(`High${i}`);
        }
        for (let i = 0; i < 13; i++) {
            ancs.push(makeAnc(400 + i * 50, 80 + ((i * 137) % 600), 8 + (i % 5) * 3));
            names.push(`Spread${i}`);
        }
        const labs = ancs.map((a, i) => makeLab(a.x + a.r + 4, a.y - 6, names[i].length * 6, 12));
        saLabelSolver(labs, ancs, CHART_BRAND.w, CHART_BRAND.h, CHART_BRAND.left, CHART_BRAND.top);
        const m = labelQualityMetrics(labs, ancs, CHART_BRAND.left, CHART_BRAND.top, CHART_BRAND.w, CHART_BRAND.h);

        expect(m.labelLabelOverlaps).toBe(0);
        expect(m.labelBubbleOverlaps).toBeLessThan(2);
        expect(m.outOfBounds).toBe(0);
        expect(m.avgDist).toBeLessThan(80);
    });

    it('66 themes in realistic chart dimensions', () => {
        const CHART_THEME = { left: 60, top: 20, w: 1200, h: 850 };
        const ancs = [];
        const names = [];
        for (let i = 0; i < 66; i++) {
            const x = 80 + ((i * 17 + i * i * 3) % 1100);
            const y = 40 + ((i * 13 + i * i * 7) % 780);
            const r = 6 + (i % 10) * 3;
            ancs.push(makeAnc(x, y, r));
            names.push(`Theme${i}LongName`);
        }
        const labs = ancs.map((a, i) => makeLab(a.x + a.r + 4, a.y - 6, names[i].length * 6, 12));
        saLabelSolver(labs, ancs, CHART_THEME.w, CHART_THEME.h, CHART_THEME.left, CHART_THEME.top);
        const m = labelQualityMetrics(labs, ancs, CHART_THEME.left, CHART_THEME.top, CHART_THEME.w, CHART_THEME.h);

        expect(m.labelLabelOverlaps).toBeLessThanOrEqual(5);
        expect(m.outOfBounds).toBe(0);
    });
});

describe('needsLeaderLine', () => {
    it('returns false when label is close to its bubble (below threshold)', () => {
        const ancs = [makeAnc(300, 200, 20), makeAnc(500, 200, 20)];
        expect(needsLeaderLine(10, 15, 0, ancs)).toBe(false);
    });

    it('returns false for isolated bubble even when dist > threshold', () => {
        const ancs = [makeAnc(100, 100, 15), makeAnc(800, 500, 15)];
        const crowdRadius = ancs[0].r * 3 + 40;
        const neighborDist = Math.hypot(800 - 100, 500 - 100);
        expect(neighborDist).toBeGreaterThan(crowdRadius);
        expect(needsLeaderLine(25, 15, 0, ancs)).toBe(false);
    });

    it('returns true for crowded bubble when dist > threshold', () => {
        const ancs = [makeAnc(300, 200, 18), makeAnc(340, 220, 16), makeAnc(320, 180, 14)];
        expect(needsLeaderLine(25, 15, 0, ancs)).toBe(true);
    });

    it('returns true when at least one neighbor is within crowding radius', () => {
        const ancs = [makeAnc(300, 200, 20), makeAnc(370, 210, 15), makeAnc(900, 900, 15)];
        expect(needsLeaderLine(20, 15, 0, ancs)).toBe(true);
    });

    it('isolated bubble at chart edge: no leader line', () => {
        const ancs = [makeAnc(60, 580, 12), makeAnc(500, 300, 20), makeAnc(700, 100, 18)];
        expect(needsLeaderLine(30, 15, 0, ancs)).toBe(false);
    });

    it('single bubble in chart: never needs a leader', () => {
        const ancs = [makeAnc(400, 300, 25)];
        expect(needsLeaderLine(40, 15, 0, ancs)).toBe(false);
    });
});

describe('snapLabelToBubble', () => {
    const area = { left: 0, top: 0, right: 1000, bottom: 600 };

    it('places label just outside bubble radius', () => {
        const lab = { x: 200, y: 50, width: 60, height: 12 };
        const anc = { x: 400, y: 300, r: 20 };
        snapLabelToBubble(lab, anc, area);
        const dist = Math.hypot(lab.x + lab.width / 2 - anc.x, lab.y + lab.height / 2 - anc.y);
        expect(dist).toBeLessThan(anc.r + 12 + 10);
    });

    it('stays within chart bounds when bubble is near edge', () => {
        const lab = { x: 0, y: 0, width: 80, height: 12 };
        const anc = { x: 20, y: 20, r: 15 };
        snapLabelToBubble(lab, anc, area);
        expect(lab.x).toBeGreaterThanOrEqual(area.left);
        expect(lab.y).toBeGreaterThanOrEqual(area.top);
        expect(lab.x + lab.width).toBeLessThanOrEqual(area.right);
    });
});
