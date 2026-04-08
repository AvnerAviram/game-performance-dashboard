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

        const allX = franchises.map(f => f.count);
        const allY = franchises.map(f => f.avgTheo);
        const xWarp = createXWarp(allX);
        const yWarp = createYWarp(allY, 5.0);
        const medX = xWarp.warpVal(median(allX));
        const medY = yWarp.warp(median(allY));

        const maxCount = Math.max(...allX, 1);
        const rMin = 6;
        const rMax = 38;
        const jitter = (str, salt) => {
            const h = ((str.charCodeAt(0) || 0) * 31 + (str.charCodeAt(1) || 0) * 17 + salt) % 100;
            return (h / 100 - 0.5) * 0.3;
        };
        const bubbleData = franchises.map(f => ({
            x: xWarp.warpVal(f.count) + jitter(f.name, 0),
            y: yWarp.warp(f.avgTheo) + jitter(f.name, 7),
            r: rMin + Math.sqrt(f.count / maxCount) * (rMax - rMin),
        }));
        const labels = franchises.map(f => f.name);
        const borders = bubbleData.map(d => quadrantBorderColor(d.x, d.y, medX, medY));

        const datasets = [
            {
                label: 'Brands',
                data: bubbleData,
                backgroundColor: bubbleData.map(d => quadrantBgColor(d.x, d.y, medX, medY, 0.45)),
                borderColor: borders,
                borderWidth: 1.5,
                hoverRadius: 5,
            },
        ];

        const saPlugin = createSABubbleLabelPlugin('brandLandscapeLabels', bubbleData, labels, borders);

        chartInstances.brandLandscape = new Chart(ctx, {
            type: 'bubble',
            data: { datasets },
            plugins: [createQuadrantPlugin('brandLandscapeQuadrant', medX, medY, chartColors), saPlugin],
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
                                const f = franchises[items[0].dataIndex];
                                return f ? `🎮 ${f.name}` : '';
                            },
                            label: item => {
                                const f = franchises[item.dataIndex];
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
                onHover: createSAHoverHandler(),
                onClick: createSAClickHandler(idx => {
                    const f = franchises[idx];
                    if (f && window.showFranchiseDetails) window.showFranchiseDetails(f.name);
                }),
            },
        });

        const branded = franchises.reduce((s, f) => s + f.count, 0);
        injectCoveragePill('chart-brand-landscape', branded, allGames.length, 'in branded franchises');
    } catch (err) {
        console.error('[BRAND-LANDSCAPE] FAILED:', err);
    }
}
