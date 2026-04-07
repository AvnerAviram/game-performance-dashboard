/**
 * Simulated Annealing label solver.
 * Adapted from d3-labeler (Evan Wang, UC Berkeley).
 * Optimizes all label positions simultaneously to minimize overlaps.
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

    const wLabLab = 18.0;
    const wLabAnc = 50.0;
    const wLen = 0.12;
    const wInter = 1.0;
    const maxMove = 22.0;
    const maxAngle = 0.6;
    const nSweeps = 3000;
    const initialT = 1.8;

    let seed = 42;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) | 0;
        return (seed >>> 0) / 0xffffffff;
    };

    // Sequential smart init: place labels one at a time, each considering
    // bubbles AND already-placed labels to avoid stacking.
    const gap = 12;
    for (let i = 0; i < m; i++) {
        const a = ancs[i];
        const lw = labs[i].width;
        const lh = labs[i].height;
        const candidates = [
            { x: a.x + a.r + gap, y: a.y - lh / 2 },
            { x: a.x - a.r - gap - lw, y: a.y - lh / 2 },
            { x: a.x - lw / 2, y: a.y - a.r - gap - lh },
            { x: a.x - lw / 2, y: a.y + a.r + gap },
            { x: a.x + a.r + gap, y: a.y - a.r - gap - lh },
            { x: a.x - a.r - gap - lw, y: a.y - a.r - gap - lh },
            { x: a.x + a.r + gap, y: a.y + a.r + gap },
            { x: a.x - a.r - gap - lw, y: a.y + a.r + gap },
        ];
        let bestScore = Infinity;
        let bestC = candidates[0];
        for (const c of candidates) {
            if (c.x < left || c.x + lw > left + w || c.y < top || c.y + lh > top + h) continue;
            let score = 0;
            const cx = c.x + lw / 2;
            const cy = c.y + lh / 2;
            // Penalize nearby bubbles with wider radius and distance falloff
            for (let j = 0; j < m; j++) {
                if (j === i) continue;
                const aj = ancs[j];
                const dist = Math.hypot(cx - aj.x, cy - aj.y);
                const threshold = aj.r + 60;
                if (dist < threshold) {
                    const p = ((threshold - dist) / threshold) * 3;
                    score += p * p;
                }
            }
            // Penalize overlap/proximity with already-placed labels (0..i-1)
            for (let j = 0; j < i; j++) {
                const pl = labs[j];
                const pad = 10;
                const xOver = Math.max(
                    0,
                    Math.min(c.x + lw + pad, pl.x + pl.width + pad) - Math.max(c.x - pad, pl.x - pad)
                );
                const yOver = Math.max(
                    0,
                    Math.min(c.y + lh + pad, pl.y + pl.height + pad) - Math.max(c.y - pad, pl.y - pad)
                );
                if (xOver > 0 && yOver > 0) score += xOver * yOver * 0.8;
            }
            const dist = Math.hypot(c.x - a.x, c.y - a.y);
            score += dist * 0.1;
            if (score < bestScore) {
                bestScore = score;
                bestC = c;
            }
        }
        labs[i].x = bestC.x;
        labs[i].y = bestC.y;
    }

    const intersect = (x1, x2, x3, x4, y1, y2, y3, y4) => {
        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (denom === 0) return false;
        const mua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const mub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
        return mua >= 0 && mua <= 1 && mub >= 0 && mub <= 1;
    };

    const energy = idx => {
        const l = labs[idx];
        const a = ancs[idx];
        let ener = 0;
        const dx = l.x - a.x;
        const dy = l.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // No distance penalty within 35px — gives labels freedom to pick the emptiest side
        ener += Math.max(0, dist - 35) * wLen;

        const lx1 = l.x;
        const ly1 = l.y;
        const lx2 = l.x + l.width;
        const ly2 = l.y + l.height;
        const lArea = l.width * l.height;

        for (let i = 0; i < m; i++) {
            if (i === idx) continue;
            const o = labs[i];
            const ox1 = o.x;
            const oy1 = o.y;
            const ox2 = o.x + o.width;
            const oy2 = o.y + o.height;

            const padX = 8;
            const padY = 6;
            const xOver = Math.max(0, Math.min(lx2 + padX, ox2 + padX) - Math.max(lx1 - padX, ox1 - padX));
            const yOver = Math.max(0, Math.min(ly2 + padY, oy2 + padY) - Math.max(ly1 - padY, oy1 - padY));
            const frac = (xOver * yOver) / Math.min(lArea, o.width * o.height || 1);
            ener += frac * wLabLab;

            if (
                frac > 0 &&
                intersect(
                    a.x,
                    l.x + l.width / 2,
                    ancs[i].x,
                    o.x + o.width / 2,
                    a.y,
                    l.y + l.height / 2,
                    ancs[i].y,
                    o.y + o.height / 2
                )
            ) {
                ener += wInter;
            }
        }

        for (let i = 0; i < ancs.length; i++) {
            const ai = ancs[i];
            const ancPad = 8;
            const ax1 = ai.x - ai.r - ancPad;
            const ay1 = ai.y - ai.r - ancPad;
            const ax2 = ai.x + ai.r + ancPad;
            const ay2 = ai.y + ai.r + ancPad;
            const xOver = Math.max(0, Math.min(lx2, ax2) - Math.max(lx1, ax1));
            const yOver = Math.max(0, Math.min(ly2, ay2) - Math.max(ly1, ay1));
            const frac = (xOver * yOver) / lArea;
            ener += frac * wLabAnc;
        }

        return ener;
    };

    const mcMove = currT => {
        const i = Math.floor(rand() * m);
        const oldX = labs[i].x;
        const oldY = labs[i].y;
        const oldE = energy(i);

        labs[i].x += (rand() - 0.5) * maxMove;
        labs[i].y += (rand() - 0.5) * maxMove;

        if (labs[i].x < left || labs[i].x + labs[i].width > left + w) labs[i].x = oldX;
        if (labs[i].y < top || labs[i].y + labs[i].height > top + h) labs[i].y = oldY;

        const newE = energy(i);
        if (rand() >= Math.exp(-(newE - oldE) / currT)) {
            labs[i].x = oldX;
            labs[i].y = oldY;
        }
    };

    const mcRotate = currT => {
        const i = Math.floor(rand() * m);
        const oldX = labs[i].x;
        const oldY = labs[i].y;
        const oldE = energy(i);

        const angle = (rand() - 0.5) * maxAngle;
        const s = Math.sin(angle);
        const co = Math.cos(angle);
        let rx = labs[i].x - ancs[i].x;
        let ry = labs[i].y - ancs[i].y;
        labs[i].x = rx * co - ry * s + ancs[i].x;
        labs[i].y = rx * s + ry * co + ancs[i].y;

        if (labs[i].x < left || labs[i].x + labs[i].width > left + w) labs[i].x = oldX;
        if (labs[i].y < top || labs[i].y + labs[i].height > top + h) labs[i].y = oldY;

        const newE = energy(i);
        if (rand() >= Math.exp(-(newE - oldE) / currT)) {
            labs[i].x = oldX;
            labs[i].y = oldY;
        }
    };

    let currT = initialT;
    for (let i = 0; i < nSweeps; i++) {
        for (let j = 0; j < m; j++) {
            if (rand() < 0.5) mcMove(currT);
            else mcRotate(currT);
        }
        currT -= initialT / nSweeps;
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
