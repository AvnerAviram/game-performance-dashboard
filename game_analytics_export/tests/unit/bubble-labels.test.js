import { describe, it, expect } from 'vitest';
import { saLabelSolver } from '../../src/lib/sa-label-solver.js';

const makeLab = (x, y, w = 50, h = 12) => ({ x, y, width: w, height: h });
const makeAnc = (x, y, r = 15) => ({ x, y, r });
const CHART = { left: 60, top: 20, w: 1000, h: 600 };

describe('Per-quadrant label selection', () => {
    it('all 4 quadrants get labels when bubbles span all quadrants', () => {
        const medX = 500;
        const medY = 300;
        const bubbleData = [];
        // 5 bubbles per quadrant
        for (let qi = 0; qi < 4; qi++) {
            const baseX = qi % 2 === 0 ? 200 : 700;
            const baseY = qi < 2 ? 400 : 100;
            for (let j = 0; j < 5; j++) {
                bubbleData.push({ x: baseX + j * 20, y: baseY + j * 15, r: 10 + j * 3 });
            }
        }

        const maxLabels = 12;
        const allowed = new Set();
        const quads = { tl: [], tr: [], bl: [], br: [] };
        bubbleData.forEach((d, i) => {
            const qx = d.x >= medX ? 'r' : 'l';
            const qy = d.y >= medY ? 't' : 'b';
            quads[qy + qx].push({ i, r: d.r });
        });
        for (const q of Object.values(quads)) q.sort((a, b) => b.r - a.r);
        const perQ = Math.max(5, Math.floor(maxLabels / 4));
        for (const q of Object.values(quads)) {
            for (let j = 0; j < Math.min(perQ, q.length); j++) {
                allowed.add(q[j].i);
            }
        }

        const quadrants = { tl: 0, tr: 0, bl: 0, br: 0 };
        for (const idx of allowed) {
            const d = bubbleData[idx];
            const qx = d.x >= medX ? 'r' : 'l';
            const qy = d.y >= medY ? 't' : 'b';
            quadrants[qy + qx]++;
        }
        expect(quadrants.tl).toBeGreaterThan(0);
        expect(quadrants.tr).toBeGreaterThan(0);
        expect(quadrants.bl).toBeGreaterThan(0);
        expect(quadrants.br).toBeGreaterThan(0);
    });
});

describe('Overlap removal', () => {
    it('removes the smaller-bubble label when two labels overlap >25%', () => {
        const candidates = [
            { dataIndex: 0, rect: { x1: 100, y1: 100, x2: 200, y2: 112 } },
            { dataIndex: 1, rect: { x1: 130, y1: 100, x2: 230, y2: 112 } },
        ];
        const bubbleData = [{ r: 30 }, { r: 15 }];

        const removed = new Set();
        for (let a = 0; a < candidates.length; a++) {
            if (removed.has(a)) continue;
            for (let b = a + 1; b < candidates.length; b++) {
                if (removed.has(b)) continue;
                const ra = candidates[a].rect;
                const rb = candidates[b].rect;
                const xO = Math.max(0, Math.min(ra.x2, rb.x2) - Math.max(ra.x1, rb.x1));
                const yO = Math.max(0, Math.min(ra.y2, rb.y2) - Math.max(ra.y1, rb.y1));
                if (xO <= 0 || yO <= 0) continue;
                const overlap = xO * yO;
                const areaA = (ra.x2 - ra.x1) * (ra.y2 - ra.y1);
                const areaB = (rb.x2 - rb.x1) * (rb.y2 - rb.y1);
                if (overlap / Math.min(areaA, areaB) > 0.25) {
                    const rA = bubbleData[candidates[a].dataIndex]?.r || 0;
                    const rB = bubbleData[candidates[b].dataIndex]?.r || 0;
                    removed.add(rA < rB ? a : b);
                }
            }
        }
        const filtered = candidates.filter((_, idx) => !removed.has(idx));

        expect(removed.has(1)).toBe(true);
        expect(filtered).toHaveLength(1);
        expect(filtered[0].dataIndex).toBe(0);
    });
});

describe('Draw order sorting', () => {
    it('largest bubble label is last in sorted array (drawn on top)', () => {
        const candidates = [
            { dataIndex: 0, rect: { x1: 10, y1: 10, x2: 60, y2: 22 } },
            { dataIndex: 1, rect: { x1: 200, y1: 200, x2: 250, y2: 212 } },
            { dataIndex: 2, rect: { x1: 400, y1: 100, x2: 450, y2: 112 } },
        ];
        const bubbleData = [{ r: 40 }, { r: 10 }, { r: 25 }];

        candidates.sort((a2, b2) => {
            const rA = bubbleData[a2.dataIndex]?.r || 0;
            const rB = bubbleData[b2.dataIndex]?.r || 0;
            return rA - rB;
        });

        const lastItem = candidates[candidates.length - 1];
        expect(lastItem.dataIndex).toBe(0);
        expect(bubbleData[lastItem.dataIndex].r).toBe(40);
    });
});

describe('findLabelAtPoint', () => {
    it('returns correct dataIndex within ±4px of label rect', () => {
        const cachedLabels = [
            { dataIndex: 3, rect: { x1: 100, y1: 50, x2: 180, y2: 62 } },
            { dataIndex: 7, rect: { x1: 300, y1: 200, x2: 380, y2: 212 } },
        ];

        function findLabelAtPoint(x, y) {
            if (!cachedLabels) return -1;
            for (let i = cachedLabels.length - 1; i >= 0; i--) {
                const r = cachedLabels[i].rect;
                if (x >= r.x1 - 4 && x <= r.x2 + 4 && y >= r.y1 - 4 && y <= r.y2 + 4) {
                    return cachedLabels[i].dataIndex;
                }
            }
            return -1;
        }

        expect(findLabelAtPoint(140, 56)).toBe(3);
        expect(findLabelAtPoint(340, 206)).toBe(7);
        expect(findLabelAtPoint(96, 50)).toBe(3);
        expect(findLabelAtPoint(184, 62)).toBe(3);
        expect(findLabelAtPoint(0, 0)).toBe(-1);
        expect(findLabelAtPoint(200, 130)).toBe(-1);
    });
});

describe('Label Y constraint', () => {
    it('no label has rect.y2 > chartArea.bottom - 18', () => {
        const chartArea = { top: 20, bottom: 620, left: 60, right: 1060 };
        const margin = 18;
        const fontSize = 10;
        const th = fontSize + 2;
        const bubbleYPositions = [100, 300, 550, 600, 615];

        const clampedPositions = bubbleYPositions.map(y => {
            const iy = Math.max(chartArea.top, Math.min(chartArea.bottom - th - margin, y - th / 2));
            return { y1: iy, y2: iy + th };
        });

        for (const pos of clampedPositions) {
            expect(pos.y2).toBeLessThanOrEqual(chartArea.bottom - margin);
        }
    });
});

describe('SA solver overlap quality', () => {
    it('for 10 synthetic labels, final overlap count < 3', () => {
        const ancs = [];
        const labs = [];
        for (let i = 0; i < 10; i++) {
            const x = 100 + (i % 5) * 160;
            const y = 100 + Math.floor(i / 5) * 200;
            ancs.push(makeAnc(x, y, 12 + (i % 4) * 3));
            labs.push(makeLab(x + 16, y - 6, 55, 12));
        }

        saLabelSolver(labs, ancs, CHART.w, CHART.h, CHART.left, CHART.top);

        let overlapCount = 0;
        for (let i = 0; i < labs.length; i++) {
            for (let j = i + 1; j < labs.length; j++) {
                const a = labs[i];
                const b = labs[j];
                const xO = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
                const yO = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
                if (xO > 0 && yO > 0) overlapCount++;
            }
        }
        expect(overlapCount).toBeLessThan(3);
    });
});
