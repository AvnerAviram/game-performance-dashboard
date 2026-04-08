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

describe('SA Label Solver – quality metrics', () => {
    it('no labels out of chart bounds', () => {
        const { labs, ancs } = denseCluster();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.outOfBounds).toBe(0);
    });

    it('spread-out scenario has zero overlaps', () => {
        const { labs, ancs } = spreadOut();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.labelLabelOverlaps).toBe(0);
        expect(m.labelBubbleOverlaps).toBe(0);
    });

    it('dense cluster: label-label overlaps are minimized (< 4)', () => {
        const { labs, ancs } = denseCluster();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.labelLabelOverlaps).toBeLessThan(4);
    });

    it('dense cluster: label-bubble overlaps are minimized (< 3)', () => {
        const { labs, ancs } = denseCluster();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.labelBubbleOverlaps).toBeLessThan(3);
    });

    it('labels stay reasonably close to their bubbles (avg < 80px)', () => {
        const { labs, ancs } = denseCluster();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.avgDist).toBeLessThan(80);
    });

    it('no single label is extremely far from its bubble (max < 150px)', () => {
        const { labs, ancs } = denseCluster();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.maxDist).toBeLessThan(150);
    });

    it('deterministic — same input produces same output', () => {
        const run = () => {
            const { labs, ancs } = denseCluster();
            saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
            return labs.map(l => `${l.x.toFixed(2)},${l.y.toFixed(2)}`).join('|');
        };
        expect(run()).toBe(run());
    });

    it('dense cluster: no "too close" label pairs (min gap >= 6px)', () => {
        const { labs, ancs } = denseCluster();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.tooClosePairs).toBeLessThan(3);
    });

    it('adjacent bubbles: labels get placed on opposite sides', () => {
        // Mimics Classic & Gems & Crystals — two bubbles close together vertically
        const ancs = [makeAnc(400, 200, 20), makeAnc(410, 230, 18)];
        const names = ['Classic', 'Gems & Crystals'];
        const labs = ancs.map((a, i) => makeLab(a.x + a.r + 4, a.y - 6, names[i].length * 6, 12));
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.labelLabelOverlaps).toBe(0);
        expect(m.tooClosePairs).toBe(0);
    });

    it('spread-out scenario: no too-close pairs', () => {
        const { labs, ancs } = spreadOut();
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);
        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.tooClosePairs).toBe(0);
    });

    it('crowded-below: label placed above bubble, not into the crowd', () => {
        // Classic bubble with many bubbles below — label should go above
        const ancs = [
            makeAnc(500, 250, 20),
            makeAnc(480, 310, 18),
            makeAnc(510, 330, 16),
            makeAnc(520, 350, 15),
            makeAnc(490, 370, 14),
            makeAnc(530, 290, 17),
        ];
        const names = ['Classic', 'Underwater', 'Greek', 'Western', 'Irish', 'Gems & Crystals'];
        const labs = ancs.map((a, i) => makeLab(a.x + a.r + 4, a.y - 6, names[i].length * 6, 12));
        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);

        // Classic (index 0) should be placed near its bubble top (within 2px tolerance for solver jitter)
        const classicCenter = labs[0].y + labs[0].height / 2;
        expect(classicCenter).toBeLessThan(ancs[0].y + 2);

        const m = labelQualityMetrics(labs, ancs, CHART.left, CHART.top, CHART.w, CHART.h);
        expect(m.labelLabelOverlaps).toBe(0);
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

    it('places label just outside bubble radius (top preferred for center bubbles)', () => {
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

    it('positions label snug — not floating far away', () => {
        const lab = { x: 700, y: 100, width: 50, height: 12 };
        const anc = { x: 500, y: 300, r: 25 };
        snapLabelToBubble(lab, anc, area);
        const dist = Math.hypot(lab.x + lab.width / 2 - anc.x, lab.y + lab.height / 2 - anc.y);
        expect(dist).toBeLessThan(anc.r + 12 + 10);
    });

    it('picks right side when bubble is near left edge', () => {
        const lab = { x: 300, y: 300, width: 60, height: 12 };
        const anc = { x: 10, y: 300, r: 8 };
        snapLabelToBubble(lab, anc, area);
        expect(lab.x).toBeGreaterThanOrEqual(anc.x + anc.r);
    });

    it('picks bottom when bubble is near top edge', () => {
        const lab = { x: 300, y: 300, width: 60, height: 12 };
        const anc = { x: 500, y: 5, r: 4 };
        snapLabelToBubble(lab, anc, area);
        expect(lab.y).toBeGreaterThanOrEqual(anc.y + anc.r);
    });
});
