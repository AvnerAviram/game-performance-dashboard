/**
 * Insights orchestrator — wires up heatmaps, recipes, strategic cards,
 * combo explorer, outliers, and delegates to blueprint-advisor.js.
 */
import { gameData, getActiveGames } from '../../lib/data.js';
import { log, warn } from '../../lib/env.js';
import { getProviderMetrics } from '../../lib/metrics.js';
import { escapeHtml, escapeAttr } from '../../lib/sanitize.js';
import { F } from '../../lib/game-fields.js';
import {
    createMarketLandscapeChart,
    createVolatilityLandscapeChart,
    createRtpLandscapeChart,
    createProviderLandscapeChart,
    createBrandLandscapeChart,
} from '../charts-modern.js';
import { initCategoryFilter } from '../chart-config.js';
import { initBlueprint } from './blueprint-advisor.js';
import { renderComboExplorer } from './insights-combos.js';
import { renderStrategicCards } from './insights-cards.js';
import { generateProviderThemeMatrix } from './insights-providers.js';
import { renderFranchiseIntelligence } from './insights-franchises.js';
import {
    renderFeatureHeatmap,
    renderFeatureStacking,
    renderLayoutCorrelation,
    renderRecipeLeaderboard,
    renderRecipeDNA,
} from './insights-recipes.js';

export function generateInsights() {
    log('💡 generateInsights() called');

    const heatmapDiv = document.getElementById('heatmap-container');
    const comboDiv = document.getElementById('combo-explorer');
    const buildNextDiv = document.getElementById('insight-build-next');
    const avoidDiv = document.getElementById('insight-avoid');
    const watchDiv = document.getElementById('insight-watch');

    log('  - Generating insights from', gameData.themes?.length || 0, 'themes...');

    renderRecipeLeaderboard();
    renderRecipeDNA();
    renderFeatureHeatmap(heatmapDiv);
    renderLayoutCorrelation();
    renderFeatureStacking();

    // Game Blueprint (Game Lab page only)
    const isGameLabPage = !!heatmapDiv;
    if (isGameLabPage || document.getElementById('blueprint-advisor-wrapper')) {
        try {
            initBlueprint();
            log('  ✅ Blueprint advisor initialized');
        } catch (e) {
            warn('Blueprint init:', e);
        }
    }

    renderComboExplorer(comboDiv);
    renderStrategicCards(buildNextDiv, avoidDiv, watchDiv);

    if (document.getElementById('market-landscape-chart')) {
        try {
            createMarketLandscapeChart();
            wireThemeLandscapeProviderFilter();
            log('  ✅ Market Landscape chart created');
        } catch (e) {
            warn('Market Landscape chart:', e);
        }
    }

    const landscapeCharts = [
        ['volatility-landscape-chart', createVolatilityLandscapeChart, 'Volatility Landscape'],
        ['rtp-landscape-chart', createRtpLandscapeChart, 'RTP Landscape'],
        ['provider-landscape-chart', createProviderLandscapeChart, 'Provider Landscape'],
        ['brand-landscape-chart', createBrandLandscapeChart, 'Brand Landscape'],
    ];
    for (const [elId, createFn, label] of landscapeCharts) {
        if (document.getElementById(elId)) {
            try {
                createFn();
                log(`  ✅ ${label} chart created`);
            } catch (e) {
                warn(`${label} chart:`, e);
            }
        }
    }
    if (document.getElementById('provider-theme-matrix')) {
        generateProviderThemeMatrix();
        log('  ✅ Provider theme matrix generated');
    }

    const franchiseDiv = document.getElementById('franchise-intelligence');
    if (franchiseDiv) {
        try {
            renderFranchiseIntelligence(franchiseDiv);
            log('  ✅ Brand Intelligence rendered');
        } catch (e) {
            warn('Brand Intelligence:', e);
        }
    }

    initCategoryFilter();
    log('💡 All insights generated successfully');
}

function wireThemeLandscapeProviderFilter() {
    const select = document.getElementById('theme-landscape-provider-filter');
    if (!select) return;

    const allGames = getActiveGames();
    const providers = getProviderMetrics(allGames, { minGames: 2 });
    const sorted = [...providers].sort((a, b) => b.count - a.count);

    select.innerHTML =
        '<option value="">All Providers</option>' +
        sorted.map(p => `<option value="${escapeAttr(p.name)}">${escapeHtml(p.name)} (${p.count})</option>`).join('');

    select.addEventListener('change', () => {
        const prov = select.value || undefined;
        const sub = document.getElementById('theme-landscape-subtitle');
        if (sub) {
            sub.textContent = prov
                ? `Showing themes for ${prov} — X = game count, Y = avg Performance Index`
                : 'X = game count, Y = avg Performance Index, bubble size = game count';
        }
        try {
            createMarketLandscapeChart(prov);
        } catch (e) {
            warn('Market Landscape filter:', e);
        }
    });
}
