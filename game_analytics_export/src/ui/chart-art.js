import { getActiveGames } from '../lib/data.js';
import { getArtNarrativeMetrics, getArtColorToneMetrics } from '../lib/metrics.js';
import { F } from '../lib/game-fields.js';
import { createBubbleLandscape, quadrantLabel, median, injectCoveragePill } from './chart-utils.js';
import { chartInstances } from './chart-config.js';

const COLOR_HEX = {
    Gold: '#EAB308',
    Silver: '#C0C0C0',
    Red: '#EF4444',
    Blue: '#3B82F6',
    Green: '#22C55E',
    Purple: '#A855F7',
    Pink: '#EC4899',
    Teal: '#14B8A6',
    Yellow: '#FFD700',
    Orange: '#F97316',
    Black: '#1F2937',
    White: '#F3F4F6',
    Brown: '#92400E',
    Crimson: '#DC143C',
    Navy: '#000080',
    Turquoise: '#40E0D0',
    Lavender: '#E6E6FA',
    Indigo: '#4B0082',
    Emerald: '#50C878',
    Amber: '#FFBF00',
    Copper: '#B87333',
    Bronze: '#CD7F32',
    Charcoal: '#36454F',
    Rose: '#FF007F',
    Burgundy: '#800020',
    Slate: '#708090',
    Beige: '#D2B48C',
    Coral: '#FF7F50',
    Magenta: '#FF00FF',
};

function colorHex(name) {
    const first = (name || '').split(/[\s/]/)[0];
    if (COLOR_HEX[first]) return COLOR_HEX[first];
    const hash = name.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    return '#' + ((hash & 0xffffff) | 0x404040).toString(16).slice(-6);
}

export async function createColorLandscapeChart() {
    try {
        const allGames = getActiveGames();
        const artGames = allGames.filter(g => {
            const ct = F.artColorTone(g);
            return ct && ct.length > 0;
        });
        if (!artGames.length) return;

        const colorTones = await getArtColorToneMetrics(gameData.activeCategory);
        if (!colorTones.length) return;

        const top = colorTones.slice(0, 12);
        const maxCount = Math.max(...colorTones.map(s => s.count), 1);
        const medX = median(colorTones.map(s => s.count));
        const medY = median(colorTones.map(s => s.avgTheo));

        const data = top.map(s => ({
            name: s.colorTone,
            shortName: s.colorTone,
            x: s.count,
            y: s.avgTheo,
            r: 6 + Math.sqrt(s.count / maxCount) * 34,
            _color: s,
        }));

        createBubbleLandscape('chart-color-landscape', {
            data,
            instanceKey: 'colorLandscape',
            instanceRegistry: chartInstances,
            labels: 'top',
            maxLabels: 4,
            quadrantLabels: false,
            labelPosition: 'below',
            medianX: medX,
            medianY: medY,
            colorFn: d => colorHex(d.name),
            tooltipFn: item => {
                const s = item._color;
                const q = quadrantLabel(s.count, s.avgTheo, medX, medY);
                return [`Games: ${s.count}  |  Avg PI: ${s.avgTheo.toFixed(2)}  |  ${q}`];
            },
            onBubbleClick: item => {
                if (item._color?.colorTone && window.showArtColor) window.showArtColor(item._color.colorTone);
            },
        });
        injectCoveragePill('chart-color-landscape', artGames.length, allGames.length, 'with color data');
    } catch (err) {
        console.error('[COLOR-LANDSCAPE] FAILED:', err);
    }
}

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
            labelPosition: 'below',
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
        injectCoveragePill('chart-narratives', artGames.length, allGames.length, 'with narrative data');
    } catch (err) {
        console.error('[NARRATIVE-CHART] FAILED:', err);
    }
}
