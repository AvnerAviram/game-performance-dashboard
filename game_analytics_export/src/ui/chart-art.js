import { getActiveGames } from '../lib/data.js';
import { getArtThemeMetrics } from '../lib/metrics.js';
import { F } from '../lib/game-fields.js';
import { createBubbleLandscape, quadrantLabel, median } from './chart-utils.js';
import { chartInstances } from './chart-config.js';

export async function createArtThemeChart() {
    try {
        const allGames = getActiveGames();
        const artGames = allGames.filter(g => F.artTheme(g));
        if (!artGames.length) return;

        const themes = await getArtThemeMetrics(gameData.activeCategory);
        if (!themes.length) return;

        const maxCount = Math.max(...themes.map(s => s.count), 1);
        const medX = median(themes.map(s => s.count));
        const medY = median(themes.map(s => s.avgTheo));

        const data = themes.map(s => ({
            name: s.theme,
            x: s.count,
            y: s.avgTheo,
            r: 6 + Math.sqrt(s.count / maxCount) * 34,
            _theme: s,
        }));

        createBubbleLandscape('chart-art-themes', {
            data,
            instanceKey: 'artThemes',
            instanceRegistry: chartInstances,
            labels: 'none',
            medianX: medX,
            medianY: medY,
            tooltipFn: item => {
                const s = item._theme;
                const q = quadrantLabel(s.count, s.avgTheo, medX, medY);
                return [`Games: ${s.count}  |  Avg PI: ${s.avgTheo.toFixed(2)}  |  ${q}`];
            },
            onBubbleClick: item => {
                if (item._theme?.theme && window.showArtTheme) window.showArtTheme(item._theme.theme);
            },
        });
    } catch (err) {
        console.error('[ART-THEMES-CHART] FAILED:', err);
    }
}
