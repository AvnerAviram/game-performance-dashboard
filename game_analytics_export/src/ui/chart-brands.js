// Brand / franchise landscape bubble chart
import { getActiveGames } from '../lib/data.js';
import { F } from '../lib/game-fields.js';
import { median, quadrantLabel, createBubbleLandscape } from './chart-utils.js';
import { chartInstances } from './chart-config.js';
import { escapeHtml } from '../lib/sanitize.js';

const FRANCHISE_BLOCKLIST = new Set([
    'BOOK',
    'KING',
    'SECRETS',
    'GOLD',
    'CASH',
    'WILD',
    'FIRE',
    'DRAGON',
    'DIAMOND',
    'LUCKY',
    'MAGIC',
    'POWER',
    'STAR',
    'HOT',
    'SUPER',
    'MEGA',
    'FRUIT',
    'QUEEN',
]);

function getFranchiseBubbles(allGames, minGames = 2) {
    const buckets = {};
    for (const g of allGames) {
        const fname = F.franchise(g);
        if (!fname) continue;
        if (FRANCHISE_BLOCKLIST.has(fname.toUpperCase())) continue;
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

export function createBrandsChart() {
    try {
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const franchises = getFranchiseBubbles(allGames);
        if (!franchises.length) return;

        const majors = franchises.slice(0, 35);
        const maxShare = Math.max(...majors.map(f => f.totalShare), 0.01);
        const medX = median(majors.map(f => f.count));
        const medY = median(majors.map(f => f.avgTheo));

        const data = majors.map(f => ({
            name: `🎮 ${f.name}`,
            x: f.count,
            y: f.avgTheo,
            r: Math.max(8, Math.min(24, 8 + Math.sqrt(f.totalShare / maxShare) * 16)),
            _f: f,
        }));

        createBubbleLandscape('chart-brands', {
            data,
            instanceKey: 'brands',
            instanceRegistry: chartInstances,
            xLabel: 'Title Count',
            yLabel: 'Avg Performance Index',
            labels: 'none',
            medianX: medX,
            medianY: medY,
            tooltipFn: item => {
                const f = item._f;
                const q = quadrantLabel(f.count, f.avgTheo, medX, medY);
                return [
                    `Titles: ${f.count}  |  Avg PI: ${f.avgTheo.toFixed(2)}  |  Share: ${f.totalShare.toFixed(1)}%  |  ${q}`,
                ];
            },
            onBubbleClick: item => {
                if (item._f && window.showFranchiseDetails) window.showFranchiseDetails(item._f.name);
            },
        });
    } catch (err) {
        console.error('[BRANDS-CHART] FAILED:', err);
    }
}

// ── Brand Landscape (Market Insights page) ──

export function createBrandLandscapeChart() {
    try {
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const franchises = getFranchiseBubbles(allGames, 5);
        if (!franchises.length) return;

        const majors = franchises.slice(0, 30);
        const maxCount = Math.max(...majors.map(f => f.count), 1);
        const medX = median(majors.map(f => f.count));
        const medY = median(majors.map(f => f.avgTheo));
        const branded = franchises.reduce((s, f) => s + f.count, 0);

        const data = majors.map(f => ({
            name: `🎮 ${f.name}`,
            x: f.count,
            y: f.avgTheo,
            r: 6 + Math.sqrt(f.count / maxCount) * 32,
            _f: f,
        }));

        createBubbleLandscape('chart-brand-landscape', {
            data,
            instanceKey: 'brandLandscape',
            instanceRegistry: chartInstances,
            xLabel: 'Title Count',
            yLabel: 'Avg Performance Index',
            labels: 'all',
            medianX: medX,
            medianY: medY,
            tooltipFn: item => {
                const f = item._f;
                const provStr = f.providers.slice(0, 3).join(', ');
                const q = quadrantLabel(f.count, f.avgTheo, medX, medY);
                return [
                    `Titles: ${f.count}  |  Avg PI: ${f.avgTheo.toFixed(2)}  |  Share: ${f.totalShare.toFixed(1)}%`,
                    `Providers: ${provStr}  |  ${q}`,
                ];
            },
            onBubbleClick: item => {
                if (item._f && window.showFranchiseDetails) window.showFranchiseDetails(item._f.name);
            },
            coveragePill: { covered: branded, total: allGames.length, label: 'in branded franchises' },
        });
    } catch (err) {
        console.error('[BRAND-LANDSCAPE] FAILED:', err);
    }
}
