// Shared Chart.js utilities: color palettes, gradients, tooltips, grid config, label helpers

if (typeof Chart !== 'undefined') {
    Chart.register({
        id: 'coverageAnnotation',
        afterDraw(chart) {
            const txt = chart._coverageText;
            if (!txt) return;
            const { ctx, chartArea } = chart;
            if (!chartArea) return;
            ctx.save();
            ctx.font = '10px system-ui, sans-serif';
            ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillText(txt, chartArea.right - 4, chartArea.bottom - 4);
            ctx.restore();
        },
    });
}

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

export function createQuadrantPlugin(id, medX, medY, chartColors) {
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
export function snapLabelToBubble(lab, anc, chartArea) {
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
        const score = (inX ? 2 : 0) + (inY ? 2 : 0);
        if (score > bestScore) {
            bestScore = score;
            best = c;
        }
    }
    lab.x = Math.max(chartArea.left, Math.min(chartArea.right - lab.width, best.x));
    lab.y = Math.max(chartArea.top, Math.min(chartArea.bottom - lab.height, best.y));
}

/**
 * SA-based label plugin with leader lines. Use for crowded bubble charts (>10 bubbles).
 * Mirrors the Market Landscape label quality.
 */
export function createSAHoverHandler() {
    return (e, elements, chart) => {
        const native = e.native;
        if (!native) return;

        if (elements.length) {
            const idx = elements[0].index;
            chart._saSetHovered?.(idx);
            chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
            chart.draw();
            native.target.style.cursor = 'pointer';
            return;
        }

        if (chart._saFindLabel) {
            const rect = chart.canvas.getBoundingClientRect();
            const idx = chart._saFindLabel(native.clientX - rect.left, native.clientY - rect.top);
            if (idx >= 0) {
                chart._saSetHovered?.(idx);
                chart.setActiveElements([{ datasetIndex: 0, index: idx }]);
                chart.draw();
                native.target.style.cursor = 'pointer';
                return;
            }
        }

        if (chart._saGetHovered?.() >= 0) {
            chart._saSetHovered?.(-1);
            chart.setActiveElements([]);
            chart.draw();
        }
        native.target.style.cursor = 'default';
    };
}

export function createSAClickHandler(clickFn) {
    return (evt, elements, chart) => {
        if (elements.length) {
            clickFn(elements[0].index);
            return;
        }
        const native = evt.native;
        if (!native || !chart._saFindLabel) return;
        const rect = chart.canvas.getBoundingClientRect();
        const idx = chart._saFindLabel(native.clientX - rect.left, native.clientY - rect.top);
        if (idx >= 0) clickFn(idx);
    };
}

export function createSABubbleLabelPlugin(id, bubbleData, labels, borderColors, opts = {}) {
    let cachedLabels = null;
    let lastPosKey = null;
    let hoveredIdx = -1;

    function findLabelAtPoint(x, y) {
        if (!cachedLabels) return -1;
        for (let i = cachedLabels.length - 1; i >= 0; i--) {
            const r = cachedLabels[i].rect;
            if (x >= r.x1 - 2 && x <= r.x2 + 2 && y >= r.y1 - 2 && y <= r.y2 + 2) {
                return cachedLabels[i].dataIndex;
            }
        }
        return -1;
    }

    return {
        id,
        afterDatasetsDraw(chart) {
            chart._saFindLabel = (cx, cy) => findLabelAtPoint(cx, cy);
            chart._saSetHovered = idx => {
                hoveredIdx = idx;
            };
            chart._saGetHovered = () => hoveredIdx;

            const { ctx: c, chartArea } = chart;
            c.save();
            const isDark = document.documentElement.classList.contains('dark');
            const labelColor = isDark ? '#94a3b8' : '#64748b';
            const highlightColor = isDark ? '#e2e8f0' : '#1e293b';
            const bgColor = isDark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.88)';

            const iconW = opts.iconWidth || 0;
            const hasActiveHover = chart.getActiveElements().length > 0;
            const meta0 = chart.getDatasetMeta(0);
            const posKey = meta0.data.map(el => `${el.x.toFixed(0)},${el.y.toFixed(0)}`).join('|');
            const shouldRecalc = !cachedLabels || (!hasActiveHover && posKey !== lastPosKey);

            if (shouldRecalc) {
                lastPosKey = posKey;
                const areaW = chartArea.right - chartArea.left;
                const areaH = chartArea.bottom - chartArea.top;
                const fontSize = 10;
                const fontStr = `600 ${fontSize}px Inter, system-ui, sans-serif`;
                c.font = fontStr;

                const truncName = (name, max = 18) => (name.length > max ? name.slice(0, max - 1) + '…' : name);
                const labs = [];
                const ancs = [];
                const labMeta = [];
                const midX = chartArea.left + areaW / 2;
                const midY = chartArea.top + areaH / 2;
                meta0.data.forEach((pt, i) => {
                    const label = truncName(labels[i] || '');
                    if (!label) return;
                    const pxR = pt.options?.radius ?? bubbleData[i]?.r ?? 12;
                    const tw = c.measureText(label).width + iconW;
                    const th = fontSize + 2;
                    const ang = Math.atan2(pt.y - midY, pt.x - midX);
                    const offX = Math.cos(ang) * (pxR + 8);
                    const offY = Math.sin(ang) * (pxR + 8);
                    let ix = pt.x + offX - tw / 2;
                    let iy = pt.y + offY - th / 2;
                    ix = Math.max(chartArea.left, Math.min(chartArea.right - tw, ix));
                    iy = Math.max(chartArea.top, Math.min(chartArea.bottom - th, iy));
                    labs.push({ x: ix, y: iy, width: tw, height: th });
                    ancs.push({ x: pt.x, y: pt.y, r: pxR });
                    labMeta.push({
                        label,
                        index: i,
                        leaderColor: borderColors?.[i] || labelColor,
                    });
                });

                const { saLabelSolver } = chart._saModule || {};
                if (saLabelSolver) {
                    saLabelSolver(labs, ancs, areaW, areaH, chartArea.left, chartArea.top);
                }

                const entries = [];
                const leaderThreshold = 15;
                for (let k = 0; k < labs.length; k++) {
                    const l = labs[k];
                    const a = ancs[k];
                    const meta = labMeta[k];
                    const dist = Math.hypot(l.x + l.width / 2 - a.x, l.y + l.height / 2 - a.y);
                    const wantsLeader = needsLeaderLine(dist, leaderThreshold, k, ancs);

                    if (!wantsLeader && dist > a.r + 6) {
                        snapLabelToBubble(l, a, chartArea);
                    }

                    const rect = { x1: l.x, x2: l.x + l.width, y1: l.y, y2: l.y + l.height };
                    entries.push({
                        label: meta.label,
                        dataIndex: meta.index,
                        rect,
                        fs: fontStr,
                        dx: l.x + l.width / 2,
                        dy: l.y + l.height / 2,
                        al: 'center',
                        bl: 'middle',
                        leader: wantsLeader,
                        bx: a.x,
                        by: a.y,
                        leaderColor: meta.leaderColor,
                    });
                }
                cachedLabels = entries;
            }

            cachedLabels.forEach(entry => {
                if (!entry.leader) return;
                const r = entry.rect;
                const nearX = (r.x1 + r.x2) / 2;
                const nearY = (r.y1 + r.y2) / 2;
                c.save();
                c.strokeStyle = entry.leaderColor;
                c.lineWidth = 1.5;
                c.setLineDash([4, 3]);
                c.beginPath();
                c.moveTo(entry.bx, entry.by);
                c.lineTo(nearX, nearY);
                c.stroke();
                c.setLineDash([]);
                c.restore();
            });

            cachedLabels.forEach(entry => {
                const r = entry.rect;
                c.fillStyle = bgColor;
                c.fillRect(r.x1 - 2, r.y1 - 1, r.x2 - r.x1 + 4, r.y2 - r.y1 + 2);
            });
            cachedLabels.forEach(entry => {
                const isHovered = entry.dataIndex === hoveredIdx;
                c.font = isHovered ? entry.fs.replace('600', '800') : entry.fs;
                const perLabelColor = opts.labelColors?.[entry.dataIndex];
                c.fillStyle = isHovered ? highlightColor : perLabelColor || labelColor;
                c.textAlign = entry.al;
                c.textBaseline = entry.bl;
                if (opts.drawIcon && iconW > 0) {
                    const iconX = entry.rect.x1;
                    const iconY = entry.dy - (entry.rect.y2 - entry.rect.y1) / 2;
                    opts.drawIcon(c, iconX, iconY, entry.rect.y2 - entry.rect.y1, entry.dataIndex, isDark);
                    c.font = isHovered ? entry.fs.replace('600', '800') : entry.fs;
                    c.fillStyle = isHovered ? highlightColor : perLabelColor || labelColor;
                    c.textAlign = 'left';
                    c.textBaseline = entry.bl;
                    c.fillText(entry.label, entry.rect.x1 + iconW, entry.dy);
                } else {
                    c.fillText(entry.label, entry.dx, entry.dy);
                }
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
    if (!total || covered >= total) return;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const card = canvas.closest('.bg-white, .dark\\:bg-gray-800');
    if (!card) return;
    if (card.querySelector(`[data-coverage-pill="${canvasId}"]`)) return;

    const pct = covered > 0 ? Math.max(1, Math.round((covered / total) * 100)) : 0;

    // Draw coverage on the chart canvas via the global coverageAnnotation plugin
    if (typeof Chart !== 'undefined') {
        const chartInstance = Chart.getChart(canvas);
        if (chartInstance) {
            chartInstance._coverageText = `${pct}% coverage · ${covered.toLocaleString()} of ${total.toLocaleString()} games ${label}`;
            chartInstance.draw();
        }
    }

    const pill = document.createElement('span');
    pill.setAttribute('data-coverage-pill', canvasId);
    pill.className = 'relative group inline-flex items-center';
    pill.innerHTML =
        `<span class="text-[10px] font-medium text-gray-400 dark:text-gray-500 cursor-help whitespace-nowrap"> · ${pct}% of games</span>` +
        `<span class="hidden group-hover:block absolute left-0 top-full mt-1 w-52 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed font-normal whitespace-normal">${covered.toLocaleString()} of ${total.toLocaleString()} games ${label}. Games without this data are excluded from the chart.</span>`;

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
    const lo = sorted[Math.floor(sorted.length * 0.2)] || 1.0;
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
    const OFFSET = 0.3;
    const warpVal = v => warp(logX(v)) + OFFSET;
    const unwarpVal = wv => Math.pow(10, unwarp(wv - OFFSET));
    return { logX, warp, unwarp, warpVal, unwarpVal };
}

/**
 * Y-axis warp: sqrt + piecewise stretch of the dense band.
 * Same proven approach used in the Market Landscape chart.
 * sqrt compresses the high end; piecewise stretches the crowded middle.
 */
export function createYWarp(yVals, stretchK = 3.0) {
    const sqrtVals = (yVals || []).map(v => Math.sqrt(Math.max(0, v)));
    const sorted = [...sqrtVals].sort((a, b) => a - b);
    const lo = sorted.length ? sorted[Math.floor(sorted.length * 0.2)] : 1;
    const hi = sorted.length ? sorted[Math.floor(sorted.length * 0.8)] : 2;
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

export function bubbleScaleOptionsWarped(
    chartColors,
    warpFns,
    xLabel = 'Game Count',
    yLabel = 'Avg Performance Index',
    yWarpFns = null
) {
    const { warpVal, unwarpVal } = warpFns;

    const yScale = {
        beginAtZero: true,
        grace: '10%',
        title: { display: true, text: yLabel, color: chartColors.textColor, font: { size: 10, weight: 'bold' } },
        ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 6 },
        grid: getModernGridConfig(),
    };

    if (yWarpFns) {
        const { unwarp: yUnwarp, niceOrigTicks } = yWarpFns;
        yScale.afterBuildTicks = axis => {
            const ticks = niceOrigTicks || [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
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
            min: 0,
            title: { display: true, text: xLabel, color: chartColors.textColor, font: { size: 10, weight: 'bold' } },
            afterBuildTicks(axis) {
                const nice = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
                axis.ticks = nice
                    .map(v => (v === 0 ? 0 : warpVal(v)))
                    .filter(wv => wv >= 0 && wv <= (axis.max || 5))
                    .map(v => ({ value: v }));
            },
            ticks: {
                color: chartColors.textColor,
                font: { size: 10 },
                padding: 6,
                callback: val => {
                    if (val < 0.01) return '0';
                    const orig = Math.round(unwarpVal(val));
                    const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
                    return nice.reduce((a, b) => (Math.abs(b - orig) < Math.abs(a - orig) ? b : a)).toLocaleString();
                },
            },
            grid: getModernGridConfig(),
        },
    };
}
