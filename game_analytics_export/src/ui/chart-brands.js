// Brand / franchise landscape bubble chart
import { gameData, getActiveGames } from '../lib/data.js';
import { F } from '../lib/game-fields.js';
import { escapeHtml } from '../lib/sanitize.js';
import { saLabelSolver } from '../lib/sa-label-solver.js';
import {
    getChartColors,
    getModernTooltipConfig,
    createQuadrantPlugin,
    quadrantBgColor,
    quadrantBorderColor,
    quadrantLabel,
    median,
    bubbleScaleOptions,
    bubbleScaleOptionsLog,
    bubbleScaleOptionsWarped,
    createXWarp,
    createYWarp,
    createBubbleLabelPlugin,
    createSABubbleLabelPlugin,
    createSAHoverHandler,
    createSAClickHandler,
    injectCoveragePill,
} from './chart-utils.js';
import { chartInstances } from './chart-config.js';

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
            const totalTheo = gs.reduce((s, g) => s + F.theoWin(g), 0);
            const totalShare = gs.reduce((s, g) => s + F.marketShare(g), 0);
            const providers = [...new Set(gs.map(g => F.provider(g)).filter(p => p && p !== 'Unknown'))];
            return { name: fname, count: gs.length, avgTheo: totalTheo / gs.length, totalShare, providers };
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
        injectCoveragePill('chart-brands', branded, allGames.length, 'in branded franchises');
    } catch (err) {
        console.error('[BRANDS-CHART] FAILED:', err);
    }
}

// ── Brand Landscape (Market Insights page) ──

const BRAND_LANDSCAPE_MAJOR = 40;

const QUAD_META = {
    opportunity: { label: '💎 Opportunity', bg: 'rgba(16,185,129,0.25)', border: 'rgb(16,185,129)' },
    leader: { label: '🏆 Leaders', bg: 'rgba(99,102,241,0.25)', border: 'rgb(99,102,241)' },
    niche: { label: '🔍 Niche', bg: 'rgba(100,116,139,0.20)', border: 'rgb(100,116,139)' },
    saturated: { label: '⚠️ Saturated', bg: 'rgba(239,68,68,0.25)', border: 'rgb(239,68,68)' },
};

function classifyQuadrant(wx, wy, medX, medY) {
    if (wy >= medY) return wx < medX ? 'opportunity' : 'leader';
    return wx < medX ? 'niche' : 'saturated';
}

function removeClusterPopup() {
    const el = document.getElementById('brand-cluster-popup');
    if (el) el.remove();
}

function showClusterPopup(canvas, cluster, px, py) {
    removeClusterPopup();
    const qm = QUAD_META[cluster.quadrant];
    const items = cluster.brands
        .sort((a, b) => b.totalShare - a.totalShare)
        .map(
            f =>
                `<div class="flex items-center justify-between gap-3 py-1.5 px-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded cursor-pointer transition-colors" onclick="window.showFranchiseDetails && window.showFranchiseDetails('${escapeHtml(f.name).replace(/'/g, "\\'")}')">
            <span class="text-xs text-gray-800 dark:text-gray-200 truncate">${escapeHtml(f.name)}</span>
            <span class="text-[10px] text-gray-400 shrink-0">${f.count} titles</span>
        </div>`
        )
        .join('');

    const popup = document.createElement('div');
    popup.id = 'brand-cluster-popup';
    popup.className =
        'absolute z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden';
    popup.style.cssText = `left:${px + 14}px; top:${Math.max(8, py - 140)}px; width:270px; max-height:340px;`;
    popup.innerHTML = `
        <div class="px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <span class="text-xs font-bold text-gray-700 dark:text-gray-200">${qm.label} · ${cluster.brands.length} brands</span>
            <button onclick="this.closest('#brand-cluster-popup').remove()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm leading-none cursor-pointer">✕</button>
        </div>
        <div class="overflow-y-auto p-1" style="max-height:290px">${items}</div>`;

    const wrapper = canvas.parentElement;
    wrapper.style.position = 'relative';
    wrapper.appendChild(popup);

    const closeOnOutside = e => {
        if (!popup.contains(e.target)) {
            removeClusterPopup();
            document.removeEventListener('mousedown', closeOnOutside);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', closeOnOutside), 50);
}

export function createBrandLandscapeChart() {
    const canvas = document.getElementById('chart-brand-landscape');
    if (!canvas) return;

    if (chartInstances.brandLandscape) {
        chartInstances.brandLandscape.destroy();
        chartInstances.brandLandscape = null;
    }
    removeClusterPopup();

    try {
        const ctx = canvas.getContext('2d');
        const chartColors = getChartColors();
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const franchises = getFranchiseBubbles(allGames, 2);
        if (!franchises.length) return;

        const majors = franchises.slice(0, BRAND_LANDSCAPE_MAJOR);
        const minors = franchises.slice(BRAND_LANDSCAPE_MAJOR);

        const allX = franchises.map(f => f.count);
        const allY = franchises.map(f => f.avgTheo);
        const xWarp = createXWarp(allX);
        const yWarp = createYWarp(allY);
        const medX = xWarp.warpVal(median(allX));
        const medY = yWarp.warp(median(allY));

        const maxCount = Math.max(...allX, 1);
        const rMin = 5;
        const rMax = 34;
        const majorData = majors.map(f => ({
            x: xWarp.warpVal(f.count),
            y: yWarp.warp(f.avgTheo),
            r: rMin + Math.sqrt(f.count / maxCount) * (rMax - rMin),
        }));
        const majorLabels = majors.map(f => f.name);
        const majorBorders = majorData.map(d => quadrantBorderColor(d.x, d.y, medX, medY));

        // Cluster remaining brands by quadrant
        const clusterBuckets = {};
        for (const f of minors) {
            const wx = xWarp.warpVal(f.count);
            const wy = yWarp.warp(f.avgTheo);
            const q = classifyQuadrant(wx, wy, medX, medY);
            if (!clusterBuckets[q]) clusterBuckets[q] = { quadrant: q, brands: [] };
            clusterBuckets[q].brands.push(f);
        }

        const clusterList = Object.values(clusterBuckets).filter(c => c.brands.length > 0);

        // Position clusters at quadrant midpoints (between median and edge)
        const warpedX = majorData.map(d => d.x);
        const warpedY = majorData.map(d => d.y);
        const xMax = Math.max(...warpedX);
        const yMax = Math.max(...warpedY);

        const clusterData = clusterList.map(c => {
            const isLeft = c.quadrant === 'opportunity' || c.quadrant === 'niche';
            const isTop = c.quadrant === 'opportunity' || c.quadrant === 'leader';
            const wx = isLeft ? medX * 0.4 : medX + (xMax - medX) * 0.75;
            const wy = isTop ? medY + (yMax - medY) * 0.75 : medY * 0.5;
            return {
                x: wx,
                y: wy,
                r: Math.max(18, Math.min(48, 18 + Math.sqrt(c.brands.length / 15) * 20)),
            };
        });

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
                label: 'Brand Clusters',
                data: clusterData,
                backgroundColor: clusterList.map(c => QUAD_META[c.quadrant].bg),
                borderColor: clusterList.map(c => QUAD_META[c.quadrant].border),
                borderWidth: 2,
                borderDash: [4, 3],
                hoverRadius: 4,
            });
        }

        const saPlugin = createSABubbleLabelPlugin('brandLandscapeLabels', majorData, majorLabels, majorBorders);

        const clusterLabelPlugin = {
            id: 'brandClusterLabels',
            afterDatasetsDraw(chart) {
                if (!clusterList.length) return;
                const meta = chart.getDatasetMeta(1);
                if (!meta || !meta.data) return;
                const c = chart.ctx;
                c.save();
                meta.data.forEach((pt, i) => {
                    const cl = clusterList[i];
                    const qm = QUAD_META[cl.quadrant];
                    c.font = 'bold 11px Inter, system-ui, sans-serif';
                    c.fillStyle = qm.border;
                    c.textAlign = 'center';
                    c.textBaseline = 'middle';
                    c.fillText(`+${cl.brands.length}`, pt.x, pt.y);
                });
                c.restore();
            },
        };

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
                        callbacks: {
                            title: items => {
                                const el = items[0];
                                if (el.datasetIndex === 1) {
                                    const cl = clusterList[el.dataIndex];
                                    return cl
                                        ? `${QUAD_META[cl.quadrant].label} · ${cl.brands.length} brands (click to browse)`
                                        : '';
                                }
                                const f = majors[el.dataIndex];
                                return f ? `🎮 ${f.name}` : '';
                            },
                            label: item => {
                                if (item.datasetIndex === 1) {
                                    const cl = clusterList[item.dataIndex];
                                    if (!cl) return '';
                                    const top3 = cl.brands
                                        .slice(0, 3)
                                        .map(f => f.name)
                                        .join(', ');
                                    return [`Top: ${top3}${cl.brands.length > 3 ? '…' : ''}`];
                                }
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
                onHover: (e, elements, chart) => {
                    const native = e.native;
                    if (!native) return;
                    if (elements.length && elements[0].datasetIndex === 1) {
                        native.target.style.cursor = 'pointer';
                        return;
                    }
                    createSAHoverHandler()(e, elements, chart);
                },
                onClick: (evt, elements, chart) => {
                    if (elements.length && elements[0].datasetIndex === 1) {
                        const ci = elements[0].index;
                        const cl = clusterList[ci];
                        if (!cl) return;
                        const meta = chart.getDatasetMeta(1);
                        const pt = meta.data[ci];
                        showClusterPopup(canvas, cl, pt.x, pt.y);
                        return;
                    }
                    createSAClickHandler(idx => {
                        const f = majors[idx];
                        if (f && window.showFranchiseDetails) window.showFranchiseDetails(f.name);
                    })(evt, elements, chart);
                },
            },
        });
        chartInstances.brandLandscape._saModule = { saLabelSolver };
        const branded = franchises.reduce((s, f) => s + f.count, 0);
        injectCoveragePill('chart-brand-landscape', branded, allGames.length, 'in branded franchises');
    } catch (err) {
        console.error('[BRAND-LANDSCAPE] FAILED:', err);
    }
}
