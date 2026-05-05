// Shared Chart.js utilities: color palettes, gradients, tooltips, grid config, label helpers

import { Chart, Tooltip } from './chart-setup.js';
import { saLabelSolver } from '../lib/sa-label-solver.js';

Tooltip.positioners.bubbleAvoid = function (elements, eventPosition) {
    if (!elements.length) return false;
    const el = elements[0].element;
    const r = el.options?.radius ?? el.outerRadius ?? 12;
    const chart = this.chart || this._chart;
    const chartArea = chart?.chartArea;
    const dataIdx = elements[0].index;
    const offset = r + 30;

    let placeBelow = true;
    const labelEntry = chart?._saCachedLabels?.find(e => e.dataIndex === dataIdx);
    if (labelEntry) {
        const labelCy = (labelEntry.rect.y1 + labelEntry.rect.y2) / 2;
        placeBelow = labelCy < el.y;
    } else {
        const spaceAbove = chartArea ? el.y - chartArea.top : el.y;
        const spaceBelow = chartArea ? chartArea.bottom - el.y : 200;
        placeBelow = spaceBelow >= spaceAbove;
    }

    this.yAlign = placeBelow ? 'top' : 'bottom';
    return { x: el.x, y: placeBelow ? el.y + offset : el.y - offset };
};

Chart.register({
    id: 'coverageAnnotation',
    afterDraw(chart) {
        const txt = chart._coverageText;
        if (!txt) return;
        const canvas = chart.canvas;
        if (!canvas) return;
        const card = canvas.closest('.bg-white, .dark\\:bg-gray-800') || canvas.parentElement;
        const inline = card?.querySelector(`.coverage-inline[data-for="${canvas.id}"]`);
        if (inline) {
            inline.textContent = txt;
            card.querySelectorAll('.coverage-footnote').forEach(el => el.remove());
            return;
        }
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        ctx.save();
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(txt, chartArea.right - 4, chart.height - 6);
        ctx.restore();
    },
});

const modernColors = {
    gold: { start: '#fbbf24', end: '#f59e0b' },
    purple: { start: '#a855f7', end: '#e879f9' },
    cyan: { start: '#06b6d4', end: '#3b82f6' },
    emerald: { start: '#10b981', end: '#059669' },
    orange: { start: '#f97316', end: '#ef4444' },
    indigo: { start: '#6366f1', end: '#8b5cf6' },
    rose: { start: '#f43f5e', end: '#fb7185' },
    amber: { start: '#fbbf24', end: '#fb923c' },
};

export function createGradient(ctx, color, direction = 'vertical') {
    const gradient =
        direction === 'vertical' ? ctx.createLinearGradient(0, 0, 0, 400) : ctx.createLinearGradient(0, 0, 400, 0);

    gradient.addColorStop(0, color.start);
    gradient.addColorStop(1, color.end);
    return gradient;
}

export function generateModernColors(ctx, count) {
    const colorKeys = ['gold', 'purple', 'cyan', 'emerald', 'orange', 'indigo', 'rose', 'amber'];
    const result = [];

    for (let i = 0; i < count; i++) {
        const colorKey = colorKeys[i % colorKeys.length];
        result.push(createGradient(ctx, modernColors[colorKey]));
    }

    return result;
}

export function getChartColors() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        textColor: isDark ? '#e2e8f0' : '#1E293B',
        gridColor: isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(148, 163, 184, 0.3)',
        backgroundColor: isDark ? 'transparent' : '#ffffff',
        tooltipBg: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        tooltipBorder: isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.2)',
    };
}

export function getModernTooltipConfig() {
    const colors = getChartColors();
    return {
        enabled: true,
        backgroundColor: colors.tooltipBg,
        titleColor: colors.textColor,
        bodyColor: colors.textColor,
        borderColor: colors.tooltipBorder,
        borderWidth: 1,
        padding: 12,
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 },
        displayColors: true,
        boxWidth: 10,
        boxHeight: 10,
        cornerRadius: 6,
        caretSize: 5,
    };
}

export function stripParenthetical(label) {
    if (typeof label !== 'string') return label;
    return label.replace(/\s*\([^)]*\)\s*$/, '').trim() || label;
}

export function wrapLabel(str, maxLen) {
    if (!str || str.length <= maxLen) return str;
    const words = str.split(/[\s/]+/);
    const lines = [];
    let cur = '';
    for (const w of words) {
        if (cur && (cur + ' ' + w).length > maxLen) {
            lines.push(cur);
            cur = w;
        } else {
            cur = cur ? cur + ' ' + w : w;
        }
    }
    if (cur) lines.push(cur);
    return lines.length > 4 ? [...lines.slice(0, 3), lines.slice(3).join(' ')] : lines;
}

export function getModernGridConfig() {
    const colors = getChartColors();
    return {
        color: colors.gridColor,
        lineWidth: 1,
        drawBorder: false,
        drawTicks: false,
    };
}

export { modernColors };

// ── Shared bubble-chart helpers (quadrant lines, labels, coloring) ───

const QUADRANT = {
    opportunity: { bg: 'rgba(16,185,129,', border: 'rgb(16,185,129)', label: '💎 Opportunity' },
    leader: { bg: 'rgba(99,102,241,', border: 'rgb(99,102,241)', label: '🏆 Leaders' },
    niche: { bg: 'rgba(156,163,175,', border: 'rgb(156,163,175)', label: '🔍 Niche' },
    saturated: { bg: 'rgba(239,68,68,', border: 'rgb(239,68,68)', label: '⚠️ Saturated' },
};

export function quadrantBgColor(x, y, medX, medY, opacity = 0.65) {
    if (y >= medY && x < medX) return QUADRANT.opportunity.bg + opacity + ')';
    if (y >= medY && x >= medX) return QUADRANT.leader.bg + opacity + ')';
    if (y < medY && x < medX) return QUADRANT.niche.bg + (opacity * 0.85).toFixed(2) + ')';
    return QUADRANT.saturated.bg + (opacity * 0.85).toFixed(2) + ')';
}

export function quadrantBorderColor(x, y, medX, medY) {
    if (y >= medY && x < medX) return QUADRANT.opportunity.border;
    if (y >= medY && x >= medX) return QUADRANT.leader.border;
    if (y < medY && x < medX) return QUADRANT.niche.border;
    return QUADRANT.saturated.border;
}

export function quadrantLabel(x, y, medX, medY) {
    if (y >= medY) return x < medX ? '💎 Opportunity' : '🏆 Leader';
    return x < medX ? '🔍 Niche' : '⚠️ Saturated';
}

export function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
}

export function createQuadrantPlugin(id, medX, medY, chartColors, { showLabels = true } = {}) {
    return {
        id,
        beforeDatasetsDraw(chart) {
            const {
                ctx: c,
                chartArea: { left, right, top, bottom },
                scales: { x: xScale, y: yScale },
            } = chart;
            const mx = xScale.getPixelForValue(medX);
            const my = yScale.getPixelForValue(medY);
            c.save();
            c.setLineDash([5, 4]);
            c.lineWidth = 1;
            c.strokeStyle = chartColors.gridColor || 'rgba(148,163,184,0.4)';
            c.beginPath();
            c.moveTo(mx, top);
            c.lineTo(mx, bottom);
            c.stroke();
            c.beginPath();
            c.moveTo(left, my);
            c.lineTo(right, my);
            c.stroke();
            c.setLineDash([]);
            c.restore();
        },
        afterDatasetsDraw(chart) {
            if (!showLabels) return;
            const {
                ctx: c,
                chartArea: { left, right, top, bottom },
            } = chart;
            const pad = 8;
            c.save();
            c.font = 'bold 10px Inter, system-ui, sans-serif';
            c.globalAlpha = 0.55;
            c.fillStyle = QUADRANT.opportunity.border;
            c.textAlign = 'left';
            c.textBaseline = 'top';
            c.fillText(QUADRANT.opportunity.label, left + pad, top + pad);
            c.fillStyle = QUADRANT.leader.border;
            c.textAlign = 'right';
            c.textBaseline = 'top';
            c.fillText(QUADRANT.leader.label, right - pad, top + pad);
            c.fillStyle = QUADRANT.niche.border;
            c.textAlign = 'left';
            c.textBaseline = 'bottom';
            c.fillText(QUADRANT.niche.label, left + pad, bottom - pad);
            c.fillStyle = QUADRANT.saturated.border;
            c.textAlign = 'right';
            c.textBaseline = 'bottom';
            c.fillText(QUADRANT.saturated.label, right - pad, bottom - pad);
            c.restore();
        },
    };
}

export function createBubbleLabelPlugin(id, bubbleData, labels) {
    return {
        id,
        afterDatasetsDraw(chart) {
            const { ctx: c, chartArea } = chart;
            const meta = chart.getDatasetMeta(0);
            c.save();
            const isDark = document.documentElement.classList.contains('dark');
            const labelColor = isDark ? '#94a3b8' : '#64748b';
            const placedRects = [];
            const sorted = meta.data.map((pt, i) => ({ pt, i, r: bubbleData[i].r })).sort((a, b) => b.r - a.r);
            const bubblePixels = meta.data.map(el => ({
                x: el.x,
                y: el.y,
                r: el.options?.radius ?? el.outerRadius ?? 12,
            }));

            sorted.forEach(({ pt, i }) => {
                const label = labels[i] || '';
                if (!label) return;
                const pxR = bubblePixels[i].r;
                const fontSize = pxR >= 18 ? 11 : 10;
                c.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
                const tw = c.measureText(label).width;
                const th = fontSize + 2;
                const gap = 10;
                const cx = pt.x,
                    cy = pt.y;
                const candidates = [
                    { x: cx, y: cy - pxR - gap, al: 'center', bl: 'bottom' },
                    { x: cx + pxR + gap, y: cy, al: 'left', bl: 'middle' },
                    { x: cx - pxR - gap, y: cy, al: 'right', bl: 'middle' },
                    { x: cx, y: cy + pxR + gap, al: 'center', bl: 'top' },
                    { x: cx + pxR + gap, y: cy - pxR * 0.5, al: 'left', bl: 'bottom' },
                    { x: cx - pxR - gap, y: cy - pxR * 0.5, al: 'right', bl: 'bottom' },
                    { x: cx, y: cy - pxR - gap - th - 4, al: 'center', bl: 'bottom' },
                    { x: cx + pxR + gap, y: cy + pxR * 0.5, al: 'left', bl: 'top' },
                    { x: cx - pxR - gap, y: cy + pxR * 0.5, al: 'right', bl: 'top' },
                ];

                const toRect = (lx, ly, al, bl) => {
                    const x1 = al === 'center' ? lx - tw / 2 : al === 'right' ? lx - tw : lx;
                    const y1 = bl === 'bottom' ? ly - th : bl === 'top' ? ly : ly - th / 2;
                    return { x1, x2: x1 + tw, y1, y2: y1 + th };
                };
                const overlapsRect = (a, b) =>
                    !(a.x2 < b.x1 - 3 || a.x1 > b.x2 + 3 || a.y2 < b.y1 - 1 || a.y1 > b.y2 + 1);
                const overlapsCircle = (rect, bx, by, br) => {
                    const nx = Math.max(rect.x1, Math.min(bx, rect.x2));
                    const ny = Math.max(rect.y1, Math.min(by, rect.y2));
                    return Math.hypot(nx - bx, ny - by) < br + 4;
                };
                const inBounds = rect =>
                    rect.x1 >= chartArea.left - 4 &&
                    rect.x2 <= chartArea.right + 4 &&
                    rect.y1 >= chartArea.top - 4 &&
                    rect.y2 <= chartArea.bottom + 4;

                let best = null;
                let bestScore = -1;
                for (const cand of candidates) {
                    const rect = toRect(cand.x, cand.y, cand.al, cand.bl);
                    if (!inBounds(rect)) continue;
                    const hitsLabel = placedRects.some(p => overlapsRect(rect, p));
                    const hitsBub = bubblePixels.some((b, bi) => bi !== i && overlapsCircle(rect, b.x, b.y, b.r));
                    const score = (hitsLabel ? 0 : 2) + (hitsBub ? 0 : 1);
                    if (score > bestScore) {
                        bestScore = score;
                        best = { ...cand, rect };
                        if (score === 3) break;
                    }
                }
                if (!best || bestScore < 2) return;
                c.textAlign = best.al;
                c.textBaseline = best.bl;
                c.fillStyle = labelColor;
                c.fillText(label, best.x, best.y);
                placedRects.push(best.rect);
            });
            c.restore();
        },
    };
}

/**
 * Decide whether a label needs a leader line.
 * Skip if the label is close to its bubble AND no other bubbles crowd it.
 * Crowding radius scales with the bubble's own radius: if the nearest neighbor
 * is farther than crowdingRadius, the bubble is "alone" and the line is noise.
 */
export function needsLeaderLine(dist, threshold, idx, ancs) {
    if (dist <= threshold) return false;
    const a = ancs[idx];
    const crowdingRadius = a.r * 3 + 40;
    for (let j = 0; j < ancs.length; j++) {
        if (j === idx) continue;
        const d = Math.hypot(ancs[j].x - a.x, ancs[j].y - a.y);
        if (d < crowdingRadius) return true;
    }
    return false;
}

/**
 * Snap a label to sit snugly beside its bubble (just outside the radius).
 * Picks the best cardinal position (top/right/bottom/left) that stays in bounds.
 */
export function snapLabelToBubble(lab, anc, chartArea, allAncs) {
    const gap = 4;
    const candidates = [
        { x: anc.x - lab.width / 2, y: anc.y - anc.r - gap - lab.height },
        { x: anc.x + anc.r + gap, y: anc.y - lab.height / 2 },
        { x: anc.x - lab.width / 2, y: anc.y + anc.r + gap },
        { x: anc.x - anc.r - gap - lab.width, y: anc.y - lab.height / 2 },
    ];
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
        const inX = c.x >= chartArea.left && c.x + lab.width <= chartArea.right;
        const inY = c.y >= chartArea.top && c.y + lab.height <= chartArea.bottom;
        let score = (inX ? 2 : 0) + (inY ? 2 : 0);
        if (allAncs) {
            for (const aj of allAncs) {
                if (aj === anc) continue;
                const cx = Math.max(c.x, Math.min(aj.x, c.x + lab.width));
                const cy = Math.max(c.y, Math.min(aj.y, c.y + lab.height));
                if (Math.hypot(cx - aj.x, cy - aj.y) < aj.r + 4) score -= 5;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            best = c;
        }
    }
    lab.x = Math.max(chartArea.left, Math.min(chartArea.right - lab.width, best.x));
    lab.y = Math.max(chartArea.top, Math.min(chartArea.bottom - lab.height, best.y));
}

/** Pixels added to bubble radius on hover. */
const HOVER_GROW = 4;

/**
 * Unified hover handler for bubble charts with SA labels.
 * Manages hover state on chart instance (`chart._saLastHoverIdx`) so
 * both onHover and mouseleave can coordinate. Uses `chart.draw()` to
 * repaint without recalculating layout (hover visuals are drawn by the plugin).
 */
export function createSAHoverHandler() {
    return (e, _elements, chart) => {
        const native = e.native;
        if (!native) return;

        let targetIdx = -1;
        let locked = false;

        if (chart._saFindLabel) {
            const rect = chart.canvas.getBoundingClientRect();
            const idx = chart._saFindLabel(native.clientX - rect.left, native.clientY - rect.top);
            if (idx >= 0) {
                targetIdx = idx;
                locked = true;
            }
        }

        if (targetIdx < 0) {
            const hits = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
            if (hits.length) targetIdx = hits[0].index;
        }

        const lastIdx = chart._saLastHoverIdx ?? -1;

        if (targetIdx >= 0) {
            if (targetIdx !== lastIdx) {
                chart._saLastHoverIdx = targetIdx;
                chart._saTooltipLocked = locked;
                chart._saSetHovered?.(targetIdx);
                chart.setActiveElements([{ datasetIndex: 0, index: targetIdx }]);
                const pt = chart.getDatasetMeta(0).data?.[targetIdx];
                if (pt) {
                    chart.tooltip.setActiveElements([{ datasetIndex: 0, index: targetIdx }], { x: pt.x, y: pt.y });
                }
                chart.draw();
            }
            native.target.style.cursor = 'pointer';
        } else if (lastIdx >= 0) {
            deactivateSAHover(chart);
            native.target.style.cursor = 'default';
        }
    };
}

/** Clear all hover state and redraw. Shared by onHover and mouseleave. */
export function deactivateSAHover(chart) {
    chart._saLastHoverIdx = -1;
    chart._saTooltipLocked = false;
    chart._saSetHovered?.(-1);
    chart.setActiveElements([]);
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update('none');
}

export function createSAClickHandler(clickFn) {
    return (evt, _elements, chart) => {
        if (window.xrayActive) return;
        const native = evt.native;
        if (!native) return;
        if (chart._saFindLabel) {
            const rect = chart.canvas.getBoundingClientRect();
            const idx = chart._saFindLabel(native.clientX - rect.left, native.clientY - rect.top);
            if (idx >= 0) {
                clickFn(idx);
                return;
            }
        }
        const hits = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
        if (hits.length) clickFn(hits[0].index);
    };
}

export function createSABubbleLabelPlugin(id, bubbleData, labels, borderColors, opts = {}) {
    let cachedLabels = null;
    let lastPosKey = null;
    let lastShowAll = null;
    let hoveredIdx = -1;

    function findLabelAtPoint(x, y) {
        if (!cachedLabels) return -1;
        for (let i = cachedLabels.length - 1; i >= 0; i--) {
            const r = cachedLabels[i].rect;
            if (x >= r.x1 - 8 && x <= r.x2 + 8 && y >= r.y1 - 6 && y <= r.y2 + 6) {
                return cachedLabels[i].dataIndex;
            }
        }
        return -1;
    }

    /** Compute pixel offset for a hovered label pushed outward from its bubble. */
    function hoverOffset(entry) {
        if (entry.dataIndex !== hoveredIdx) return { ox: 0, oy: 0 };
        const cx = (entry.rect.x1 + entry.rect.x2) / 2;
        const cy = (entry.rect.y1 + entry.rect.y2) / 2;
        const ang = Math.atan2(cy - entry.by, cx - entry.bx);
        return { ox: Math.cos(ang) * HOVER_GROW, oy: Math.sin(ang) * HOVER_GROW };
    }

    return {
        id,
        afterDatasetsDraw(chart) {
            chart._saFindLabel = (cx, cy) => findLabelAtPoint(cx, cy);
            chart._saSetHovered = idx => {
                hoveredIdx = idx;
            };
            chart._saGetHovered = () => hoveredIdx;
            chart._saResetCache = () => {
                cachedLabels = null;
                lastPosKey = null;
            };
            chart._saCachedLabels = cachedLabels;

            const { ctx: c, chartArea } = chart;
            c.save();
            const isDark = document.documentElement.classList.contains('dark');
            const labelColor = isDark ? '#94a3b8' : '#64748b';
            const highlightColor = isDark ? '#e2e8f0' : '#1e293b';
            const bgColor = isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.92)';

            const hasActiveHover = chart.getActiveElements().length > 0;
            const meta0 = chart.getDatasetMeta(0);
            const posKey = meta0.data.map(el => `${el.x.toFixed(0)},${el.y.toFixed(0)}`).join('|');
            const showAll = !!chart._showAllLabels;
            const shouldRecalc = !cachedLabels || (!hasActiveHover && posKey !== lastPosKey) || showAll !== lastShowAll;

            if (shouldRecalc) {
                lastPosKey = posKey;
                lastShowAll = showAll;
                const areaW = chartArea.right - chartArea.left;
                const areaH = chartArea.bottom - chartArea.top;
                const fontSize = 10;
                const fontStr = `600 ${fontSize}px Inter, system-ui, sans-serif`;
                c.font = fontStr;

                const maxLabels = showAll ? labels.length : opts.maxLabels || labels.length;
                const truncMax = opts.truncate || 18;
                const truncName = (name, max = truncMax) => (name.length > max ? name.slice(0, max - 1) + '…' : name);

                let labelIndices;
                if (maxLabels < labels.length) {
                    const allowed = new Set();
                    const mX = opts.medX;
                    const mY = opts.medY;
                    if (mX != null && mY != null) {
                        const quads = { tl: [], tr: [], bl: [], br: [] };
                        bubbleData.forEach((d, i) => {
                            const qx = d.x >= mX ? 'r' : 'l';
                            const qy = d.y >= mY ? 't' : 'b';
                            quads[qy + qx].push({ i, r: d.r, y: d.y });
                        });
                        const perQ = Math.max(8, Math.ceil(maxLabels / 4));
                        for (const q of Object.values(quads)) {
                            const byR = [...q].sort((a, b) => b.r - a.r);
                            const byY = [...q].sort((a, b) => b.y - a.y);
                            const half = Math.ceil(perQ / 2);
                            for (let j = 0; j < Math.min(half, byR.length); j++) allowed.add(byR[j].i);
                            for (let j = 0; j < Math.min(half, byY.length); j++) allowed.add(byY[j].i);
                        }
                    }
                    const topByY = bubbleData.map((d, i) => ({ i, y: d.y })).sort((a, b) => b.y - a.y);
                    for (let j = 0; j < Math.min(5, topByY.length); j++) allowed.add(topByY[j].i);
                    if (allowed.size < maxLabels) {
                        const ranked = bubbleData.map((d, i) => ({ i, r: d.r })).sort((a, b) => b.r - a.r);
                        for (const item of ranked) {
                            if (allowed.size >= maxLabels) break;
                            allowed.add(item.i);
                        }
                    }
                    labelIndices = allowed;
                } else {
                    labelIndices = null;
                }

                const labs = [];
                const ancs = [];
                const labMeta = [];
                const swatchPad = opts.labelColorFn ? 13 : 0;
                const midX = chartArea.left + areaW / 2;
                const midY = chartArea.top + areaH / 2;
                meta0.data.forEach((pt, i) => {
                    if (labelIndices && !labelIndices.has(i)) return;
                    const label = truncName(labels[i] || '');
                    if (!label) return;
                    const pxR = pt.options?.radius ?? bubbleData[i]?.r ?? 12;
                    const tw = c.measureText(label).width + swatchPad;
                    const th = fontSize + 2;
                    let ix, iy;
                    if (opts.labelPosition === 'below') {
                        ix = pt.x - tw / 2;
                        iy = pt.y + pxR + 4;
                    } else {
                        const ang = Math.atan2(pt.y - midY, pt.x - midX);
                        const offX = Math.cos(ang) * (pxR + 6);
                        const offY = Math.sin(ang) * (pxR + 6);
                        ix = pt.x + offX - tw / 2;
                        iy = pt.y + offY - th / 2;
                    }
                    ix = Math.max(chartArea.left, Math.min(chartArea.right - tw, ix));
                    iy = Math.max(chartArea.top, Math.min(chartArea.bottom - th - 18, iy));
                    labs.push({ x: ix, y: iy, width: tw, height: th });
                    ancs.push({ x: pt.x, y: pt.y, r: pxR });
                    labMeta.push({
                        label,
                        index: i,
                        leaderColor: borderColors?.[i] || labelColor,
                    });
                });

                saLabelSolver(labs, ancs, areaW, areaH - 18, chartArea.left, chartArea.top);

                const candidates = labs.map((l, k) => ({
                    label: labMeta[k].label,
                    dataIndex: labMeta[k].index,
                    rect: { x1: l.x, x2: l.x + l.width, y1: l.y, y2: l.y + l.height },
                    fs: fontStr,
                    dx: l.x + swatchPad + (l.width - swatchPad) / 2,
                    dy: l.y + l.height / 2,
                    al: 'center',
                    bl: 'middle',
                    bx: ancs[k].x,
                    by: ancs[k].y,
                    leaderColor: labMeta[k].leaderColor,
                    ancR: ancs[k].r,
                }));

                candidates.sort((a2, b2) => (bubbleData[a2.dataIndex]?.r || 0) - (bubbleData[b2.dataIndex]?.r || 0));
                cachedLabels = candidates;
            }

            // --- Hover bubble: erase original, redraw at HOVER_GROW larger ---
            if (hoveredIdx >= 0) {
                const hPt = chart.getDatasetMeta(0).data[hoveredIdx];
                if (hPt) {
                    const baseR = hPt.options?.radius ?? bubbleData[hoveredIdx]?.r ?? 12;
                    const ds = chart.data.datasets[0];
                    const bgCol = Array.isArray(ds.backgroundColor)
                        ? ds.backgroundColor[hoveredIdx]
                        : ds.backgroundColor;
                    const bdCol = Array.isArray(ds.borderColor) ? ds.borderColor[hoveredIdx] : ds.borderColor;
                    c.save();
                    c.beginPath();
                    c.arc(hPt.x, hPt.y, baseR + 2, 0, Math.PI * 2);
                    c.fillStyle = isDark ? '#0f172a' : '#ffffff';
                    c.fill();
                    c.beginPath();
                    c.arc(hPt.x, hPt.y, baseR + HOVER_GROW, 0, Math.PI * 2);
                    c.fillStyle = bgCol;
                    c.fill();
                    c.strokeStyle = bdCol;
                    c.lineWidth = 2;
                    c.stroke();
                    c.restore();
                }
            }

            // --- Leader lines ---
            const LEADER_GAP = 4;
            cachedLabels.forEach(entry => {
                const isHov = entry.dataIndex === hoveredIdx;
                const cx = (entry.rect.x1 + entry.rect.x2) / 2;
                const cy = (entry.rect.y1 + entry.rect.y2) / 2;
                const ang = Math.atan2(cy - entry.by, cx - entry.bx);
                const effR = entry.ancR + (isHov ? HOVER_GROW : 0);
                const startX = entry.bx + Math.cos(ang) * (effR + LEADER_GAP);
                const startY = entry.by + Math.sin(ang) * (effR + LEADER_GAP);
                const dist = Math.hypot(cx - entry.bx, cy - entry.by) + (isHov ? HOVER_GROW : 0);
                const endX = entry.bx + Math.cos(ang) * (dist - LEADER_GAP);
                const endY = entry.by + Math.sin(ang) * (dist - LEADER_GAP);
                c.save();
                c.strokeStyle = isHov
                    ? isDark
                        ? 'rgba(226,232,240,0.75)'
                        : 'rgba(30,41,59,0.6)'
                    : isDark
                      ? 'rgba(148,163,184,0.4)'
                      : 'rgba(71,85,105,0.35)';
                c.lineWidth = isHov ? 1.5 : 1;
                c.beginPath();
                c.moveTo(startX, startY);
                c.lineTo(endX, endY);
                c.stroke();
                c.restore();
            });

            // --- Label backgrounds (opaque backing to prevent bleed-through) ---
            cachedLabels.forEach(entry => {
                const { ox, oy } = hoverOffset(entry);
                const r = entry.rect;
                c.fillStyle = bgColor;
                c.fillRect(r.x1 - 2 + ox, r.y1 - 1 + oy, r.x2 - r.x1 + 4, r.y2 - r.y1 + 2);
            });

            // --- Label text ---
            cachedLabels.forEach(entry => {
                const isHov = entry.dataIndex === hoveredIdx;
                const { ox, oy } = hoverOffset(entry);
                c.font = isHov ? entry.fs.replace('600', '700').replace('10px', '11px') : entry.fs;
                const perLabelColor = opts.labelColors?.[entry.dataIndex];
                c.fillStyle = isHov ? highlightColor : perLabelColor || labelColor;
                c.textAlign = entry.al;
                c.textBaseline = entry.bl;
                if (opts.labelColorFn) {
                    const swatchColor = opts.labelColorFn(entry.dataIndex);
                    if (swatchColor) {
                        const sw = 8;
                        c.fillStyle = swatchColor;
                        c.fillRect(entry.rect.x1 + 1 + ox, entry.dy - sw / 2 + oy, sw, sw);
                        c.strokeStyle = 'rgba(0,0,0,0.15)';
                        c.lineWidth = 0.5;
                        c.strokeRect(entry.rect.x1 + 1 + ox, entry.dy - sw / 2 + oy, sw, sw);
                        c.fillStyle = isHov ? highlightColor : perLabelColor || labelColor;
                    }
                }
                c.fillText(entry.label, entry.dx + ox, entry.dy + oy);
            });

            c.restore();
        },
    };
}

export function bubbleScaleOptions(chartColors, xLabel = 'Game Count', yLabel = 'Avg Performance Index') {
    return {
        y: {
            beginAtZero: true,
            grace: '10%',
            title: { display: true, text: yLabel, color: chartColors.textColor, font: { size: 10, weight: 'bold' } },
            ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
            grid: getModernGridConfig(),
        },
        x: {
            grace: '10%',
            title: { display: true, text: xLabel, color: chartColors.textColor, font: { size: 10, weight: 'bold' } },
            ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
            grid: getModernGridConfig(),
        },
    };
}

/**
 * Inject a coverage pill badge into a chart card's subtitle area.
 * Only shown when coverage < 100% (partial data). Idempotent.
 * Places a subtle "· X% of games" next to the subtitle text for clean UX.
 */
export function injectCoveragePill(canvasId, covered, total, label) {
    if (!total) return;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const card = canvas.closest('.bg-white, .dark\\:bg-gray-800');
    if (!card) return;
    if (card.querySelector(`[data-coverage-pill="${canvasId}"]`)) return;

    const pct = covered > 0 ? Math.max(1, Math.round((covered / total) * 100)) : 0;

    const pill = document.createElement('span');
    pill.setAttribute('data-coverage-pill', canvasId);
    pill.className = 'relative group inline-flex items-center';
    pill.innerHTML =
        `<span class="text-[10px] font-medium text-gray-400 dark:text-gray-500 cursor-help whitespace-nowrap"> · ${pct}% of games</span>` +
        `<span class="hidden group-hover:block absolute left-0 top-full mt-1 w-52 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed font-normal whitespace-normal">${covered.toLocaleString()} of ${total.toLocaleString()} games ${label}.</span>`;

    const subtitle = card.querySelector('.border-b p, .pb-3 p');
    if (subtitle) {
        subtitle.appendChild(pill);
    } else {
        const h3 = card.querySelector('h3');
        if (h3) h3.insertAdjacentElement('afterend', pill);
    }
}

export function bubbleScaleOptionsLog(
    chartColors,
    xLabel = 'Game Count (log scale)',
    yLabel = 'Avg Performance Index'
) {
    return {
        y: {
            beginAtZero: true,
            grace: '10%',
            title: { display: true, text: yLabel, color: chartColors.textColor, font: { size: 10, weight: 'bold' } },
            ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
            grid: getModernGridConfig(),
        },
        x: {
            type: 'logarithmic',
            min: 1,
            title: { display: true, text: xLabel, color: chartColors.textColor, font: { size: 10, weight: 'bold' } },
            ticks: {
                color: chartColors.textColor,
                font: { size: 10 },
                padding: 6,
                callback: val => ([2, 5, 10, 20, 50, 100, 200].includes(val) ? val : ''),
            },
            grid: getModernGridConfig(),
        },
    };
}

export function createXWarp(xVals) {
    const logX = v => Math.log10(Math.max(1, v));
    const logVals = xVals.map(logX);
    const sorted = [...logVals].sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.05)] || 0;
    const hi = sorted[Math.floor(sorted.length * 0.8)] || 2.0;
    const k = 2.5;
    const span = (hi - lo) * k;
    const warp = lv => {
        if (lv <= lo) return lv;
        if (lv <= hi) return lo + (lv - lo) * k;
        return lo + span + (lv - hi);
    };
    const unwarp = wv => {
        if (wv <= lo) return wv;
        const whi = lo + span;
        if (wv <= whi) return lo + (wv - lo) / k;
        return hi + (wv - whi);
    };
    const warpVal = v => warp(logX(v));
    const unwarpVal = wv => Math.pow(10, unwarp(wv));
    return { logX, warp, unwarp, warpVal, unwarpVal };
}

/**
 * Y-axis warp: sqrt + piecewise stretch of the dense band.
 * Same proven approach used in the Market Landscape chart.
 * sqrt compresses the high end; piecewise stretches the crowded middle.
 */
export function createYWarp(yVals, stretchK = 16.0) {
    const sqrtVals = (yVals || []).map(v => Math.sqrt(Math.max(0, v)));
    const sorted = [...sqrtVals].sort((a, b) => a - b);
    const lo = sorted.length ? sorted[Math.floor(sorted.length * 0.15)] : 1;
    const hi = sorted.length ? sorted[Math.floor(sorted.length * 0.85)] : 2;
    const k = stretchK;
    const span = (hi - lo) * k;
    const warp = v => {
        const s = Math.sqrt(Math.max(0, v));
        if (s <= lo) return s;
        if (s <= hi) return lo + (s - lo) * k;
        return lo + span + (s - hi);
    };
    const unwarp = wv => {
        let s;
        if (wv <= lo) {
            s = wv;
        } else {
            const whi = lo + span;
            s = wv <= whi ? lo + (wv - lo) / k : hi + (wv - whi);
        }
        return s * s;
    };
    return { warp, unwarp };
}

// ── Unified Bubble Landscape Factory ─────────────────────────────────
export function createBubbleLandscape(
    canvasId,
    {
        data,
        instanceKey,
        instanceRegistry,
        xLabel = 'Number of Games',
        yLabel = 'Avg Performance Index',
        labels = 'none',
        quadrants = true,
        quadrantLabels = true,
        medianX,
        medianY,
        colorFn,
        tooltipFn,
        maxLabels = 8,
        onBubbleClick,
        coveragePill,
        extraDatasets,
        extraPlugins,
        warp = true,
        warpY = true,
        labelColorFn,
        labelPosition,
    }
) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const chartColors = getChartColors();

    if (instanceRegistry && instanceKey && instanceRegistry[instanceKey]) {
        instanceRegistry[instanceKey].destroy();
        instanceRegistry[instanceKey] = null;
    }
    Chart.getChart(canvas)?.destroy();

    if (coveragePill) {
        const cp = coveragePill;
        const pct = cp.covered > 0 ? Math.max(1, Math.round((cp.covered / cp.total) * 100)) : 0;
        const card = canvas.closest('.bg-white, .dark\\:bg-gray-800');
        const inline = card?.querySelector(`.coverage-inline[data-for="${canvasId}"]`);
        if (inline) {
            inline.textContent = `${pct}% coverage · ${cp.covered.toLocaleString()} of ${cp.total.toLocaleString()} games ${cp.label}`;
            card.querySelectorAll('.coverage-footnote').forEach(el => el.remove());
        }
    }

    if (!data || !data.length) return null;

    const xWarp = warp ? createXWarp(data.map(d => d.x)) : null;
    const warpX = v => (xWarp ? xWarp.warpVal(v) : v);

    const yWarpFns = warpY ? createYWarp(data.map(d => d.y)) : null;
    const doWarpY = v => (yWarpFns ? yWarpFns.warp(v) : v);

    const medX = xWarp ? xWarp.warpVal(medianX ?? median(data.map(d => d.x))) : (medianX ?? median(data.map(d => d.x)));
    const rawMedY = medianY ?? median(data.map(d => d.y));
    const medY = doWarpY(rawMedY);

    const bubbleData = data.map(d => ({ x: warpX(d.x), y: doWarpY(d.y), r: d.r }));

    const defaultColor = (d, i) => ({
        bg: quadrantBgColor(bubbleData[i].x, bubbleData[i].y, medX, medY),
        border: quadrantBorderColor(bubbleData[i].x, bubbleData[i].y, medX, medY),
    });

    const datasets = [
        {
            label: 'Main',
            data: bubbleData,
            clip: false,
            backgroundColor: data.map((d, i) => {
                if (colorFn) return colorFn(d, 'bg');
                return defaultColor(d, i).bg;
            }),
            borderColor: data.map((d, i) => {
                if (colorFn) return colorFn(d, 'border');
                return defaultColor(d, i).border;
            }),
            borderWidth: 1.5,
            hoverBorderWidth: 3,
            hoverBorderColor: 'rgba(0,0,0,0.4)',
        },
        ...(extraDatasets || []),
    ];

    const plugins = [];
    if (quadrants)
        plugins.push(createQuadrantPlugin(canvasId + 'Quad', medX, medY, chartColors, { showLabels: quadrantLabels }));

    if (labels !== 'none') {
        const borderArr = data.map((d, i) => {
            if (colorFn) return colorFn(d, 'border');
            return defaultColor(d, i).border;
        });
        const effectiveMax = labels === 'all' ? data.length : maxLabels;
        const saOpts = {
            maxLabels: effectiveMax,
            truncate: 999,
            labelColorFn: labelColorFn ? idx => labelColorFn(data[idx], idx) : null,
            medX,
            medY,
            labelPosition,
        };
        plugins.push(
            createSABubbleLabelPlugin(
                canvasId + 'Labels',
                bubbleData,
                data.map(d => d.shortName || d.name || ''),
                borderArr,
                saOpts
            )
        );
    }

    if (extraPlugins) plugins.push(...extraPlugins);

    const rawXMin = Math.min(...data.map(d => d.x));
    const scales = xWarp
        ? bubbleScaleOptionsWarped(chartColors, xWarp, xLabel, yLabel, yWarpFns, rawXMin)
        : {
              x: {
                  type: 'linear',
                  beginAtZero: true,
                  title: {
                      display: true,
                      text: xLabel,
                      color: chartColors.textColor,
                      font: { size: 10, weight: 'bold' },
                  },
                  ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
                  grid: getModernGridConfig(),
              },
              y: {
                  type: 'linear',
                  beginAtZero: true,
                  title: {
                      display: true,
                      text: yLabel,
                      color: chartColors.textColor,
                      font: { size: 10, weight: 'bold' },
                  },
                  ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
                  grid: getModernGridConfig(),
              },
          };

    const chart = new Chart(ctx, {
        type: 'bubble',
        data: { datasets },
        plugins,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            hover: labels !== 'none' ? { mode: null } : { mode: 'nearest', intersect: true },
            onHover: labels !== 'none' ? createSAHoverHandler() : undefined,
            onClick:
                labels !== 'none'
                    ? createSAClickHandler(idx => {
                          if (window.xrayActive) return;
                          if (onBubbleClick) onBubbleClick(data[idx], idx);
                      })
                    : (e, elements) => {
                          if (window.xrayActive) return;
                          if (elements.length && elements[0].datasetIndex === 0 && onBubbleClick) {
                              onBubbleClick(data[elements[0].index], elements[0].index);
                          }
                      },
            layout: { padding: { top: 2, right: 8, bottom: 16, left: 16 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...getModernTooltipConfig(),
                    mode: 'nearest',
                    intersect: true,
                    position: 'bubbleAvoid',
                    caretPadding: 10,
                    filter: extraDatasets?.length ? ti => ti.datasetIndex === 0 : undefined,
                    callbacks: {
                        title: items => {
                            if (!items?.length) return '';
                            const idx = items[0].dataIndex;
                            return data[idx]?.name ?? '';
                        },
                        label: context => {
                            if (!context || context.dataIndex == null) return '';
                            const item = data[context.dataIndex];
                            if (!item) return '';
                            if (tooltipFn) return tooltipFn(item);
                            return [`Games: ${item.x}`, `PI: ${item.y?.toFixed(2)}`];
                        },
                    },
                },
            },
            scales,
        },
    });

    if (labels !== 'none') {
        const origHandleEvent = chart.tooltip.handleEvent.bind(chart.tooltip);
        chart.tooltip.handleEvent = function (ev, replay) {
            if (chart._saTooltipLocked) return false;
            return origHandleEvent(ev, replay);
        };
    }

    canvas.addEventListener('mouseleave', () => {
        const c = Chart.getChart(canvas);
        if (c) deactivateSAHover(c);
    });

    if (coveragePill) {
        const card = canvas.closest('.bg-white, .dark\\:bg-gray-800');
        const hasInline = card?.querySelector(`.coverage-inline[data-for="${canvasId}"]`);
        if (!hasInline) {
            injectCoveragePill(canvasId, coveragePill.covered, coveragePill.total, coveragePill.label);
        }
    }

    if (instanceRegistry && instanceKey) {
        instanceRegistry[instanceKey] = chart;
    }

    return chart;
}

export function bubbleScaleOptionsWarped(
    chartColors,
    warpFns,
    xLabel = 'Game Count',
    yLabel = 'Avg Performance Index',
    yWarpFns = null,
    rawXMin = 1
) {
    const { warpVal, unwarpVal } = warpFns;

    const niceTicks = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const tickIdx = niceTicks.findIndex(t => t >= rawXMin);
    const firstVisibleTick = niceTicks[Math.max(0, tickIdx - 1)] || 1;
    const xMin = warpVal(firstVisibleTick) - 0.15;

    const yScale = {
        beginAtZero: true,
        grace: '1%',
        title: { display: true, text: yLabel, color: chartColors.textColor, font: { size: 10, weight: 'bold' } },
        ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
        grid: getModernGridConfig(),
    };

    if (yWarpFns) {
        const { unwarp: yUnwarp, niceOrigTicks } = yWarpFns;
        yScale.afterBuildTicks = axis => {
            const ticks = niceOrigTicks || [0, 1, 2, 3, 4, 5, 6];
            axis.ticks = ticks
                .map(v => yWarpFns.warp(v))
                .filter(wv => wv >= 0 && wv <= (axis.max ?? 999))
                .map(v => ({ value: v }));
        };
        yScale.ticks.callback = val => {
            const orig = yUnwarp(val);
            const rounded = Math.round(orig * 10) / 10;
            return rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
        };
    }

    return {
        y: yScale,
        x: {
            type: 'linear',
            min: xMin,
            title: { display: true, text: xLabel, color: chartColors.textColor, font: { size: 10, weight: 'bold' } },
            afterBuildTicks(axis) {
                axis.ticks = niceTicks
                    .map(v => warpVal(v))
                    .filter(wv => wv >= (axis.min ?? 0) && wv <= (axis.max || 5))
                    .map(v => ({ value: v }));
            },
            ticks: {
                color: chartColors.textColor,
                font: { size: 10 },
                padding: 6,
                callback: val => {
                    if (val < 0.01) return '';
                    const orig = Math.round(unwarpVal(val));
                    if (orig < 1) return '';
                    const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
                    return nice.reduce((a, b) => (Math.abs(b - orig) < Math.abs(a - orig) ? b : a)).toLocaleString();
                },
            },
            grid: getModernGridConfig(),
        },
    };
}
