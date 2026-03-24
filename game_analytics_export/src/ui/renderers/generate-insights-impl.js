/**
 * Insights orchestrator — wires up heatmaps, recipes, strategic cards,
 * combo explorer, outliers, and delegates to blueprint-advisor.js.
 */
import { gameData } from '../../lib/data.js';
import { log, warn } from '../../lib/env.js';
import { createMarketLandscapeChart } from '../charts-modern.js';
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
            log('  ✅ Market Landscape chart created');
        } catch (e) {
            warn('Market Landscape chart:', e);
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

    log('💡 All insights generated successfully');
}
