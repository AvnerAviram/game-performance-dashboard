/**
 * Greedy priority-based label placement solver.
 * Places labels one by one (largest bubble first), picking the closest
 * non-overlapping position around each bubble.
 *
 * @param {Array<{x:number, y:number, width:number, height:number}>} labs  – mutable label rects
 * @param {Array<{x:number, y:number, r:number}>} ancs  – anchor (bubble) positions
 * @param {number} w      – chart area width
 * @param {number} h      – chart area height
 * @param {number} left   – chart area left edge
 * @param {number} top    – chart area top edge
 */
export const saLabelSolver = (labs, ancs, w, h, left, top) => {
    const m = labs.length;
    if (m === 0) return;

    const PAD = 3;
    const ANGLES = 24;
    const DISTANCES = [16, 26, 38, 52, 68, 86, 110, 140];

    const rectsOverlap = (ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) => {
        return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
    };

    const rectOverlapsBubble = (rx1, ry1, rx2, ry2, bx, by, br) => {
        const cx = Math.max(rx1, Math.min(bx, rx2));
        const cy = Math.max(ry1, Math.min(by, ry2));
        return Math.hypot(cx - bx, cy - by) < br;
    };

    const placed = [];

    const order = Array.from({ length: m }, (_, i) => i);
    order.sort((a, b) => (ancs[b].r || 0) - (ancs[a].r || 0));

    const ANGLE_ORDER = [18, 17, 19, 16, 20, 15, 21, 14, 22, 0, 23, 1, 13, 2, 12, 3, 11, 4, 10, 5, 9, 6, 8, 7];

    for (const idx of order) {
        const a = ancs[idx];
        const lw = labs[idx].width;
        const lh = labs[idx].height;

        let bestPos = null;
        let bestScore = Infinity;

        for (const dist of DISTANCES) {
            if (bestScore <= 0) break;
            const r = a.r + dist;
            for (const ai of ANGLE_ORDER) {
                const angle = (ai / ANGLES) * Math.PI * 2;
                const cx = a.x + Math.cos(angle) * r;
                const cy = a.y + Math.sin(angle) * r;

                const lx = cx - lw / 2;
                const ly = cy - lh / 2;

                if (lx < left || lx + lw > left + w || ly < top || ly + lh > top + h) continue;

                if (rectOverlapsBubble(lx, ly, lx + lw, ly + lh, a.x, a.y, a.r + 4)) continue;

                let hitsBubble = false;
                for (let j = 0; j < m; j++) {
                    if (j === idx) continue;
                    if (rectOverlapsBubble(lx, ly, lx + lw, ly + lh, ancs[j].x, ancs[j].y, ancs[j].r + 6)) {
                        hitsBubble = true;
                        break;
                    }
                }
                if (hitsBubble) continue;

                const lx1 = lx - PAD;
                const ly1 = ly - PAD;
                const lx2 = lx + lw + PAD;
                const ly2 = ly + lh + PAD;

                let score = dist * 0.1;

                for (const p of placed) {
                    if (rectsOverlap(lx1, ly1, lx2, ly2, p.x1, p.y1, p.x2, p.y2)) {
                        const ox = Math.min(lx2, p.x2) - Math.max(lx1, p.x1);
                        const oy = Math.min(ly2, p.y2) - Math.max(ly1, p.y1);
                        score += ox * oy;
                    }
                }

                if (score < bestScore) {
                    bestScore = score;
                    bestPos = { x: lx, y: ly };
                    if (score <= dist * 0.1) break;
                }
            }
        }

        if (bestPos) {
            labs[idx].x = bestPos.x;
            labs[idx].y = bestPos.y;
        } else {
            let placed_fb = false;
            const fbCandidates = [
                { x: a.x + a.r + 16, y: a.y - a.r - lh - 8 },
                { x: a.x - lw - a.r - 16, y: a.y - a.r - lh - 8 },
                { x: a.x + a.r + 16, y: a.y + a.r + 8 },
                { x: a.x - lw - a.r - 16, y: a.y + a.r + 8 },
            ];
            for (const fb of fbCandidates) {
                const fx = Math.max(left, Math.min(left + w - lw, fb.x));
                const fy = Math.max(top, Math.min(top + h - lh, fb.y));
                let hits = false;
                for (let j = 0; j < m; j++) {
                    if (rectOverlapsBubble(fx, fy, fx + lw, fy + lh, ancs[j].x, ancs[j].y, ancs[j].r + 4)) {
                        hits = true;
                        break;
                    }
                }
                if (!hits) {
                    labs[idx].x = fx;
                    labs[idx].y = fy;
                    placed_fb = true;
                    break;
                }
            }
            if (!placed_fb) {
                labs[idx].x = -9999;
                labs[idx].y = -9999;
            }
        }

        placed.push({
            x1: labs[idx].x - PAD,
            y1: labs[idx].y - PAD,
            x2: labs[idx].x + lw + PAD,
            y2: labs[idx].y + lh + PAD,
        });
    }
};

/**
 * Compute quality metrics for a solved label layout.
 * Useful for automated UX validation.
 */
export const labelQualityMetrics = (labs, ancs, chartLeft, chartTop, chartW, chartH) => {
    const m = labs.length;
    let labelLabelOverlaps = 0;
    let labelBubbleOverlaps = 0;
    let tooClosePairs = 0;
    let minGap = Infinity;
    let maxDist = 0;
    let totalDist = 0;
    let outOfBounds = 0;
    const MIN_GAP = 6;

    for (let i = 0; i < m; i++) {
        const l = labs[i];
        const a = ancs[i];
        const dist = Math.hypot(l.x + l.width / 2 - a.x, l.y + l.height / 2 - a.y);
        totalDist += dist;
        if (dist > maxDist) maxDist = dist;

        if (
            l.x < chartLeft ||
            l.x + l.width > chartLeft + chartW ||
            l.y < chartTop ||
            l.y + l.height > chartTop + chartH
        )
            outOfBounds++;

        for (let j = i + 1; j < m; j++) {
            const o = labs[j];
            const xOver = Math.max(0, Math.min(l.x + l.width, o.x + o.width) - Math.max(l.x, o.x));
            const yOver = Math.max(0, Math.min(l.y + l.height, o.y + o.height) - Math.max(l.y, o.y));
            if (xOver > 0 && yOver > 0) {
                labelLabelOverlaps++;
            } else {
                const gapX = Math.max(0, Math.max(l.x, o.x) - Math.min(l.x + l.width, o.x + o.width));
                const gapY = Math.max(0, Math.max(l.y, o.y) - Math.min(l.y + l.height, o.y + o.height));
                const gap = Math.hypot(gapX, gapY);
                if (gap < minGap) minGap = gap;
                if (gap < MIN_GAP) tooClosePairs++;
            }
        }

        for (let j = 0; j < ancs.length; j++) {
            if (j === i) continue;
            const aj = ancs[j];
            const cx = Math.max(l.x, Math.min(aj.x, l.x + l.width));
            const cy = Math.max(l.y, Math.min(aj.y, l.y + l.height));
            const d = Math.hypot(cx - aj.x, cy - aj.y);
            if (d < aj.r) labelBubbleOverlaps++;
        }
    }

    return {
        labelLabelOverlaps,
        labelBubbleOverlaps,
        tooClosePairs,
        minGap: minGap === Infinity ? 0 : minGap,
        avgDist: m > 0 ? totalDist / m : 0,
        maxDist,
        outOfBounds,
    };
};
