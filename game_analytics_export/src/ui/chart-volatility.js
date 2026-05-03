// Volatility landscape bubble chart — filtered to verified/extracted confidence only
import { gameData, getActiveGames } from '../lib/data.js';
import { VOL_COLORS } from '../lib/shared-config.js';
import { getVolatilityMetrics } from '../lib/metrics.js';
import { median, createBubbleLandscape, quadrantLabel } from './chart-utils.js';
import { chartInstances } from './chart-config.js';

export async function createVolatilityChart() {
    try {
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const sorted = (await getVolatilityMetrics(gameData.activeCategory)).map(v => ({
            name: v.volatility,
            count: v.count,
            avgTheo: v.avgTheo,
        }));
        if (!sorted.length) return;

        const reliableTotal = sorted.reduce((s, v) => s + v.count, 0);
        const maxCount = Math.max(...sorted.map(v => v.count), 1);
        const globalAvg = sorted.reduce((s, x) => s + x.avgTheo * x.count, 0) / sorted.reduce((s, x) => s + x.count, 0);

        const data = sorted.map(v => ({
            name: `🎲 ${v.name} Volatility`,
            x: v.count,
            y: v.avgTheo,
            r: Math.max(10, Math.min(28, 10 + Math.sqrt(v.count / maxCount) * 18)),
            _vol: v,
        }));

        createBubbleLandscape('chart-volatility', {
            data,
            instanceKey: 'volatility',
            instanceRegistry: chartInstances,
            labels: 'none',
            colorFn: (d, type) => {
                const c = VOL_COLORS[d._vol.name] || '#94a3b8';
                return type === 'bg' ? c + 'AA' : c;
            },
            tooltipFn: item => {
                const v = item._vol;
                const diff = v.avgTheo - globalAvg;
                const arrow = diff >= 0 ? '▲' : '▼';
                return [
                    `Games: ${v.count}  |  Avg PI: ${v.avgTheo.toFixed(2)}`,
                    `${arrow} ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} vs market avg (${globalAvg.toFixed(2)})`,
                    `Based on ${reliableTotal} verified games`,
                ];
            },
            onBubbleClick: item => {
                if (item._vol && window.showVolatilityDetails) window.showVolatilityDetails(item._vol.name);
            },
        });
    } catch (err) {
        console.error('[VOLATILITY-CHART] FAILED:', err);
    }
}

export async function createVolatilityLandscapeChart() {
    try {
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const sorted = (await getVolatilityMetrics(gameData.activeCategory)).map(v => ({
            name: v.volatility,
            count: v.count,
            avgTheo: v.avgTheo,
        }));
        if (!sorted.length) return;

        const reliableTotal = sorted.reduce((s, v) => s + v.count, 0);
        const maxCount = Math.max(...sorted.map(v => v.count), 1);

        const data = sorted.map(v => ({
            name: `🎲 ${v.name} Volatility`,
            shortName: `${v.name} Vol`,
            x: v.count,
            y: v.avgTheo,
            r: Math.max(8, Math.min(40, 8 + Math.sqrt(v.count / maxCount) * 32)),
            _vol: v,
        }));

        createBubbleLandscape('chart-volatility-landscape', {
            data,
            instanceKey: 'volatilityLandscape',
            instanceRegistry: chartInstances,
            labels: 'all',
            colorFn: (d, type) => {
                const c = VOL_COLORS[d._vol.name] || '#94a3b8';
                return type === 'bg' ? c + '99' : c;
            },
            tooltipFn: item => {
                const v = item._vol;
                const pct = ((v.count / reliableTotal) * 100).toFixed(1);
                return [
                    `Games: ${v.count} (${pct}%)  |  Avg PI: ${v.avgTheo.toFixed(2)}`,
                    `Based on ${reliableTotal} verified games`,
                ];
            },
            onBubbleClick: item => {
                if (item._vol && window.showVolatilityDetails) window.showVolatilityDetails(item._vol.name);
            },
            coveragePill: { covered: reliableTotal, total: allGames.length, label: 'with verified volatility' },
        });
    } catch (err) {
        console.error('[VOLATILITY-LANDSCAPE] FAILED:', err);
    }
}
