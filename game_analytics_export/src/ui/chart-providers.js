// Provider landscape bubble chart
import { gameData, getActiveGames } from '../lib/data.js';
import { getProviderMetrics } from '../lib/metrics.js';
import { median, quadrantLabel, createBubbleLandscape, injectCoveragePill } from './chart-utils.js';
import { F } from '../lib/game-fields.js';
import { chartInstances } from './chart-config.js';
import { getDefaultSort } from '../lib/filters.js';

export async function createProvidersChart() {
    try {
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const allProviders = await getProviderMetrics(gameData.activeCategory);
        if (!allProviders.length) return;

        const sorted = [...allProviders].sort(getDefaultSort());
        const medX = median(allProviders.map(p => p.count));
        const medY = median(allProviders.map(p => p.avgTheo));

        const majors = sorted.slice(0, 12);
        const maxShare = Math.max(...allProviders.map(p => p.ggrShare), 1);

        const data = majors.map(p => ({
            name: p.name,
            shortName: p.name,
            x: p.count,
            y: p.avgTheo,
            r: Math.max(6, Math.min(20, 6 + Math.sqrt(p.ggrShare / maxShare) * 14)),
            _prov: p,
        }));

        createBubbleLandscape('chart-providers', {
            data,
            instanceKey: 'providers',
            instanceRegistry: chartInstances,
            labels: 'top',
            maxLabels: 4,
            quadrantLabels: false,
            labelPosition: 'below',
            medianX: medX,
            medianY: medY,
            tooltipFn: item => {
                const p = item._prov;
                const q = quadrantLabel(p.count, p.avgTheo, medX, medY);
                return [
                    `Games: ${p.count}  |  Avg PI: ${p.avgTheo.toFixed(2)}  |  GGR: ${p.ggrShare.toFixed(1)}%  |  ${q}`,
                ];
            },
            onBubbleClick: item => {
                if (item._prov?.name && window.showProviderDetails) window.showProviderDetails(item._prov.name);
            },
        });
        const withTheo = allGames.filter(g => F.theoWin(g) > 0);
        injectCoveragePill('chart-providers', withTheo.length, allGames.length, 'with performance data');
    } catch (err) {
        console.error('[PROVIDERS-CHART] FAILED:', err);
    }
}

export async function createProviderLandscapeChart() {
    try {
        const allGames = getActiveGames();
        if (!allGames.length) return;

        const providers = await getProviderMetrics(gameData.activeCategory);
        if (!providers.length) return;

        const maxCount = Math.max(...providers.map(p => p.count), 1);
        const medX = median(providers.map(p => p.count));
        const medY = median(providers.map(p => p.avgTheo));
        const plWithTheo = allGames.filter(g => F.theoWin(g) > 0);

        const data = providers.map(p => ({
            name: `🏢 ${p.name}`,
            shortName: p.name,
            x: p.count,
            y: p.avgTheo,
            r: 6 + Math.sqrt(p.count / maxCount) * 30,
            _prov: p,
        }));

        createBubbleLandscape('chart-provider-landscape', {
            data,
            instanceKey: 'providerLandscape',
            instanceRegistry: chartInstances,
            labels: 'all',
            medianX: medX,
            medianY: medY,
            tooltipFn: item => {
                const p = item._prov;
                const q = quadrantLabel(p.count, p.avgTheo, medX, medY);
                return [
                    `Games: ${p.count}  |  Avg PI: ${p.avgTheo.toFixed(2)}  |  GGR: ${p.ggrShare.toFixed(1)}%  |  ${q}`,
                ];
            },
            onBubbleClick: item => {
                if (item._prov?.name && window.showProviderDetails) window.showProviderDetails(item._prov.name);
            },
            coveragePill: { covered: plWithTheo.length, total: allGames.length, label: 'with Theo Win data' },
        });
    } catch (err) {
        console.error('[PROVIDER-LANDSCAPE] FAILED:', err);
    }
}
