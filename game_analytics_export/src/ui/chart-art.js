import { getActiveGames } from '../lib/data.js';
import { getArtNarrativeMetrics } from '../lib/metrics.js';
import { F } from '../lib/game-fields.js';
import { createBubbleLandscape, quadrantLabel, median } from './chart-utils.js';
import { chartInstances } from './chart-config.js';

export async function createNarrativeChart() {
    try {
        const allGames = getActiveGames();
        const artGames = allGames.filter(g => F.artNarrative(g));
        if (!artGames.length) return;

        const narratives = await getArtNarrativeMetrics(gameData.activeCategory);
        if (!narratives.length) return;

        const medX = median(narratives.map(s => s.count));
        const medY = median(narratives.map(s => s.avgTheo));

        const top = narratives.slice(0, 12);
        const maxCount = Math.max(...narratives.map(s => s.count), 1);

        const data = top.map(s => {
            const full = s.narrative;
            return {
                name: full,
                shortName: full.replace(/\s*\(.*?\)\s*$/, '').trim(),
                x: s.count,
                y: s.avgTheo,
                r: 6 + Math.sqrt(s.count / maxCount) * 34,
                _narr: s,
            };
        });

        createBubbleLandscape('chart-narratives', {
            data,
            instanceKey: 'narratives',
            instanceRegistry: chartInstances,
            labels: 'top',
            maxLabels: 4,
            quadrantLabels: false,
            medianX: medX,
            medianY: medY,
            tooltipFn: item => {
                const s = item._narr;
                const q = quadrantLabel(s.count, s.avgTheo, medX, medY);
                return [`Games: ${s.count}  |  Avg PI: ${s.avgTheo.toFixed(2)}  |  ${q}`];
            },
            onBubbleClick: item => {
                if (item._narr?.narrative && window.showArtNarrative) window.showArtNarrative(item._narr.narrative);
            },
        });
    } catch (err) {
        console.error('[NARRATIVE-CHART] FAILED:', err);
    }
}
