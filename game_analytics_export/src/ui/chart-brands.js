// Brand / franchise landscape bubble chart
import { Chart } from './chart-setup.js';
import { getActiveGames } from '../lib/data.js';
import { F } from '../lib/game-fields.js';
import {
    getChartColors,
    getModernTooltipConfig,
    createQuadrantPlugin,
    quadrantBgColor,
    quadrantBorderColor,
    quadrantLabel,
    median,
    bubbleScaleOptionsWarped,
    createXWarp,
    createYWarp,
    createSABubbleLabelPlugin,
    createSAHoverHandler,
    createSAClickHandler,
    injectCoveragePill,
} from './chart-utils.js';
import { chartInstances } from './chart-config.js';
import { escapeHtml } from '../lib/sanitize.js';

let _clusterPopup = null;
let _popupHovered = false;

function removeClusterPopup() {
    if (_clusterPopup) {
        _clusterPopup.remove();
        _clusterPopup = null;
        _popupHovered = false;
    }
}

function showClusterPopup(items, anchorX, anchorY, canvas) {
    removeClusterPopup();
    const div = document.createElement('div');
    div.className =
        'absolute z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl p-3 max-h-64 overflow-y-auto';
    div.style.minWidth = '180px';
    div.style.maxWidth = '240px';

    const title = document.createElement('div');
    title.className =
        'text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 pb-1.5 border-b border-gray-100 dark:border-gray-700';
    title.textContent = `${items.length} brands`;
    div.appendChild(title);

    for (const f of items) {
        const row = document.createElement('div');
        row.className =
            'w-full text-left px-2 py-1.5 text-xs rounded-lg hover:bg-indigo-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 cursor-pointer flex justify-between items-center gap-2 transition-colors';
        row.style.pointerEvents = 'auto';
        row.innerHTML = `<span class="font-medium truncate" style="pointer-events:none">${escapeHtml(f.name)}</span><span class="text-gray-400 text-[10px] whitespace-nowrap" style="pointer-events:none">${f.count} titles</span>`;
        row.addEventListener('mousedown', e => {
            e.preventDefault();
            e.stopPropagation();
            removeClusterPopup();
            if (window.showFranchiseDetails) window.showFranchiseDetails(f.name);
        });
        div.appendChild(row);
    }

    const wrapper = canvas.parentElement;
    if (!wrapper) return;
    if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';
    wrapper.style.overflow = 'visible';
    const rect = canvas.getBoundingClientRect();
    const wRect = wrapper.getBoundingClientRect();
    let left = anchorX - wRect.left;
    let top = anchorY - wRect.top + 10;
    if (left + 240 > rect.right - wRect.left) left = rect.right - wRect.left - 250;
    if (left < 0) left = 4;

    // Flip above if it would clip below the chart container
    const popupHeight = Math.min(items.length * 30 + 40, 260);
    const spaceBelow = wRect.bottom - anchorY;
    if (spaceBelow < popupHeight + 20) {
        top = anchorY - wRect.top - popupHeight - 10;
        if (top < 0) top = 4;
    }

    div.style.left = `${left}px`;
    div.style.top = `${top}px`;
    wrapper.appendChild(div);
    _clusterPopup = div;
    _popupHovered = false;

    div.addEventListener('mouseenter', () => {
        _popupHovered = true;
    });
    div.addEventListener('mouseleave', () => {
        _popupHovered = false;
    });

    const dismiss = e => {
        if (!div.contains(e.target)) {
            removeClusterPopup();
            document.removeEventListener('mousedown', dismiss);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', dismiss), 50);
}

function getFranchiseBubbles(allGames, minGames = 1) {
    const buckets = {};
    for (const g of allGames) {
        const fname = F.franchise(g);
        if (!fname) continue;
        if (!buckets[fname]) buckets[fname] = [];
        buckets[fname].push(g);
    }
    return Object.entries(buckets)
        .filter(([, gs]) => gs.length >= minGames)
        .map(([fname, gs]) => {
            const sumTheo = gs.reduce((s, g) => s + F.theoWin(g), 0);
            const totalShare = gs.reduce((s, g) => s + F.marketShare(g), 0);
            const providers = [...new Set(gs.map(g => F.provider(g)).filter(p => p && p !== 'Unknown'))];
            return { name: fname, count: gs.length, avgTheo: sumTheo / gs.length, totalShare, providers };
        })
        .sort((a, b) => b.totalShare - a.totalShare);
}

const MAJOR_COUNT = 35;

export function createBrandsChart() {
    const canvas = document.getElementById('chart-brands');
    if (!canvas) return;

    if (chartInstances.brands) {
        chartInstances.brands.destroy();
        chartInstances.brands = null;
    }

    try {
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const franchises = getFranchiseBubbles(allGames);
        if (!franchises.length) return;

        const majors = franchises.slice(0, MAJOR_COUNT);
        const minors = franchises.slice(MAJOR_COUNT);

        const xVals = majors.map(f => f.count);
        const yVals = majors.map(f => f.avgTheo);
        const xWarpOv = createXWarp(xVals);
        const medX = xWarpOv.warpVal(median(xVals));
        const medY = median(yVals);

        const maxShare = Math.max(...majors.map(f => f.totalShare), 0.01);
        const majorData = majors.map(f => ({
            x: xWarpOv.warpVal(f.count),
            y: f.avgTheo,
            r: Math.max(8, Math.min(24, 8 + Math.sqrt(f.totalShare / maxShare) * 16)),
        }));

        const minorData = minors.map(f => ({
            x: xWarpOv.warpVal(f.count),
            y: f.avgTheo,
            r: 4,
        }));

        const majorLabels = majors.map(f => f.name);

        const datasets = [
            {
                label: 'Top Brands',
                data: majorData,
                backgroundColor: majorData.map(d => quadrantBgColor(d.x, d.y, medX, medY)),
                borderColor: majorData.map(d => quadrantBorderColor(d.x, d.y, medX, medY)),
                borderWidth: 1.5,
                hoverRadius: 4,
            },
        ];

        if (minorData.length) {
            datasets.push({
                label: `${minors.length} other brands`,
                data: minorData,
                backgroundColor: 'rgba(148,163,184,0.25)',
                borderColor: 'rgba(148,163,184,0.4)',
                borderWidth: 0.5,
                hoverRadius: 2,
            });
        }

        chartInstances.brands = new Chart(ctx, {
            type: 'bubble',
            data: { datasets },
            plugins: [createQuadrantPlugin('brandQuadrant', medX, medY, chartColors)],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 600 },
                layout: { padding: { top: 24, right: 16, bottom: 24, left: 4 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        callbacks: {
                            title: items => {
                                const dsIdx = items[0].datasetIndex;
                                const idx = items[0].dataIndex;
                                const f = dsIdx === 0 ? majors[idx] : minors[idx];
                                return f ? `🎮 ${f.name}` : '';
                            },
                            label: item => {
                                const f = item.datasetIndex === 0 ? majors[item.dataIndex] : minors[item.dataIndex];
                                if (!f) return '';
                                const q = quadrantLabel(xWarpOv.warpVal(f.count), f.avgTheo, medX, medY);
                                return `Titles: ${f.count}  |  Avg PI: ${f.avgTheo.toFixed(2)}  |  Share: ${f.totalShare.toFixed(1)}%  |  ${q}`;
                            },
                        },
                    },
                },
                scales: bubbleScaleOptionsWarped(chartColors, xWarpOv, 'Title Count', 'Avg Performance Index'),
                onClick: (_evt, elements) => {
                    if (!elements.length) return;
                    const el = elements[0];
                    const f = el.datasetIndex === 0 ? majors[el.index] : minors[el.index];
                    if (f && window.showFranchiseDetails) window.showFranchiseDetails(f.name);
                },
            },
        });
        const branded = franchises.reduce((s, f) => s + f.count, 0);
        // Coverage pill omitted on overview
    } catch (err) {
        console.error('[BRANDS-CHART] FAILED:', err);
    }
}

// ── Brand Landscape (Market Insights page) ──

export function createBrandLandscapeChart() {
    const canvas = document.getElementById('chart-brand-landscape');
    if (!canvas) return;

    if (chartInstances.brandLandscape) {
        chartInstances.brandLandscape.destroy();
        chartInstances.brandLandscape = null;
    }

    try {
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const franchises = getFranchiseBubbles(allGames, 5);
        if (!franchises.length) {
            console.warn('[BRAND-LANDSCAPE] No franchises with >= 5 games found.');
            return;
        }

        const LABEL_COUNT = 30;
        const majors = franchises.slice(0, LABEL_COUNT);
        const minors = franchises.slice(LABEL_COUNT);

        const allX = franchises.map(f => f.count);
        const allY = franchises.map(f => f.avgTheo);
        const xWarp = createXWarp(allX);
        const yWarp = createYWarp(allY, 5.0);
        const medX = xWarp.warpVal(median(allX));
        const medY = yWarp.warp(median(allY));

        const maxCount = Math.max(...allX, 1);
        const rMin = 6;
        const rMax = 38;

        // Group by count to compute rank-based jitter — prevents same-count brands from stacking
        const countGroups = {};
        majors.forEach((f, i) => {
            if (!countGroups[f.count]) countGroups[f.count] = [];
            countGroups[f.count].push(i);
        });
        const jitterX = i => {
            const f = majors[i];
            const grp = countGroups[f.count];
            if (grp.length <= 1) return 0;
            const pos = grp.indexOf(i);
            return (pos / (grp.length - 1) - 0.5) * 0.35;
        };
        const jitterY = i => {
            const f = majors[i];
            const grp = countGroups[f.count];
            if (grp.length <= 1) return 0;
            const pos = grp.indexOf(i);
            return ((pos % 3) - 1) * 0.06;
        };

        const majorData = majors.map((f, i) => ({
            x: xWarp.warpVal(f.count) + jitterX(i),
            y: yWarp.warp(f.avgTheo) + jitterY(i),
            r: rMin + Math.sqrt(f.count / maxCount) * (rMax - rMin),
        }));
        const majorLabels = majors.map(f => f.name);
        const majorBorders = majorData.map(d => quadrantBorderColor(d.x, d.y, medX, medY));

        // Cluster minor brands by quadrant — one bubble per quadrant with "+N" label
        const clusters = [
            { key: 'tl', items: [], xA: 0.15, yA: 0.85 },
            { key: 'tr', items: [], xA: 0.85, yA: 0.85 },
            { key: 'bl', items: [], xA: 0.15, yA: 0.15 },
            { key: 'br', items: [], xA: 0.85, yA: 0.15 },
        ];
        for (const f of minors) {
            const wx = xWarp.warpVal(f.count);
            const wy = yWarp.warp(f.avgTheo);
            const ci = wx < medX ? (wy >= medY ? 0 : 2) : wy >= medY ? 1 : 3;
            clusters[ci].items.push(f);
        }
        const clusterData = [];
        const clusterLabels = [];
        const clusterMeta = [];
        for (const c of clusters) {
            if (!c.items.length) continue;
            const avgX = c.items.reduce((s, f) => s + xWarp.warpVal(f.count), 0) / c.items.length;
            const avgY = c.items.reduce((s, f) => s + yWarp.warp(f.avgTheo), 0) / c.items.length;
            clusterData.push({ x: avgX, y: avgY, r: 12 + Math.sqrt(c.items.length) * 3 });
            clusterLabels.push(`+${c.items.length}`);
            clusterMeta.push(c.items);
        }

        const datasets = [
            {
                label: 'Top Brands',
                data: majorData,
                backgroundColor: majorData.map(d => quadrantBgColor(d.x, d.y, medX, medY, 0.45)),
                borderColor: majorBorders,
                borderWidth: 1.5,
                hoverRadius: 5,
            },
        ];

        if (clusterData.length) {
            datasets.push({
                label: `${minors.length} other brands`,
                data: clusterData,
                backgroundColor: 'rgba(148,163,184,0.15)',
                borderColor: 'rgba(148,163,184,0.4)',
                borderWidth: 1,
                borderDash: [3, 2],
                hoverRadius: 4,
            });
        }

        // Plugin to draw "+N" count labels on cluster bubbles
        const clusterLabelPlugin = {
            id: 'brandClusterLabels',
            afterDatasetsDraw(chart) {
                if (!clusterData.length) return;
                const { ctx: c } = chart;
                const meta1 = chart.getDatasetMeta(1);
                if (!meta1?.data?.length) return;
                c.save();
                c.font = 'bold 11px Inter, system-ui, sans-serif';
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillStyle = 'rgba(100,116,139,0.7)';
                meta1.data.forEach((pt, i) => {
                    c.fillText(clusterLabels[i], pt.x, pt.y);
                });
                c.restore();
            },
        };

        const saPlugin = createSABubbleLabelPlugin('brandLandscapeLabels', majorData, majorLabels, majorBorders);

        chartInstances.brandLandscape = new Chart(ctx, {
            type: 'bubble',
            data: { datasets },
            plugins: [
                createQuadrantPlugin('brandLandscapeQuadrant', medX, medY, chartColors),
                saPlugin,
                clusterLabelPlugin,
            ],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 400 },
                layout: { padding: { top: 24, right: 16, bottom: 24, left: 4 } },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        filter: ti => ti.datasetIndex === 0,
                        callbacks: {
                            title: items => {
                                const f = majors[items[0]?.dataIndex];
                                return f ? `🎮 ${f.name}` : '';
                            },
                            label: item => {
                                const f = majors[item.dataIndex];
                                if (!f) return '';
                                const provStr = f.providers.slice(0, 3).join(', ');
                                const q = quadrantLabel(xWarp.warpVal(f.count), yWarp.warp(f.avgTheo), medX, medY);
                                return [
                                    `Titles: ${f.count}  |  Avg PI: ${f.avgTheo.toFixed(2)}  |  Share: ${f.totalShare.toFixed(1)}%`,
                                    `Providers: ${provStr}  |  ${q}`,
                                ];
                            },
                        },
                    },
                },
                scales: bubbleScaleOptionsWarped(chartColors, xWarp, 'Title Count', 'Avg Performance Index', yWarp),
                onHover: (evt, elements) => {
                    const chart = chartInstances.brandLandscape;
                    if (!chart) return;
                    const native = evt.native;
                    if (!native) return;
                    const isCluster = elements.length && elements[0].datasetIndex === 1;
                    canvas.style.cursor =
                        elements.length || chart._saFindLabel?.(native.offsetX, native.offsetY) >= 0
                            ? 'pointer'
                            : 'default';
                    const hoveringOtherElement = !isCluster && elements.length > 0;
                    if (hoveringOtherElement && _clusterPopup && !_popupHovered) {
                        removeClusterPopup();
                    }
                    if (isCluster) {
                        const idx = elements[0].index;
                        const cm = clusterMeta[idx];
                        if (cm) {
                            const meta1 = chart.getDatasetMeta(1);
                            const pt = meta1.data[idx];
                            const cRect = canvas.getBoundingClientRect();
                            showClusterPopup(cm, cRect.left + pt.x, cRect.top + pt.y, canvas);
                        }
                    }
                    if (elements.length && elements[0].datasetIndex === 0) {
                        chart.setActiveElements([{ datasetIndex: 0, index: elements[0].index }]);
                        chart.update('none');
                    }
                },
                onClick: (evt, elements) => {
                    if (!elements.length) {
                        const chart = chartInstances.brandLandscape;
                        if (chart?._saFindLabel) {
                            const rect = chart.canvas.getBoundingClientRect();
                            const cx = evt.native.clientX - rect.left;
                            const cy = evt.native.clientY - rect.top;
                            const li = chart._saFindLabel(cx, cy);
                            if (li >= 0 && majors[li] && window.showFranchiseDetails) {
                                window.showFranchiseDetails(majors[li].name);
                                return;
                            }
                        }
                        return;
                    }
                    const el = elements[0];
                    if (el.datasetIndex === 0) {
                        removeClusterPopup();
                        const f = majors[el.index];
                        if (f && window.showFranchiseDetails) window.showFranchiseDetails(f.name);
                    } else {
                        const cm = clusterMeta[el.index];
                        if (cm) {
                            const chart = chartInstances.brandLandscape;
                            const meta1 = chart.getDatasetMeta(1);
                            const pt = meta1.data[el.index];
                            const rect = canvas.getBoundingClientRect();
                            showClusterPopup(cm, rect.left + pt.x, rect.top + pt.y, canvas);
                        }
                    }
                },
            },
        });

        const branded = franchises.reduce((s, f) => s + f.count, 0);
        injectCoveragePill('chart-brand-landscape', branded, allGames.length, 'in branded franchises');
    } catch (err) {
        console.error('[BRAND-LANDSCAPE] FAILED:', err);
    }
}
