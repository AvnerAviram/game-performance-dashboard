import { Chart } from '../chart-setup.js';
import { getActiveGames, gameData } from '../../lib/data.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../../lib/sanitize.js';
import { F } from '../../lib/game-fields.js';
import {
    getArtThemeMetrics,
    getArtNarrativeMetrics,
    getArtCharacterMetrics,
    getArtElementMetrics,
    getArtColorToneMetrics,
    getArtRecipeMetrics,
    getArtComboMetrics,
    getGlobalAvgTheo,
    getDominantVolatility,
    getDominantLayout,
    getAvgRtp,
    getProviderMetrics,
} from '../../lib/metrics.js';
import {
    getChartColors,
    getModernGridConfig,
    getModernTooltipConfig,
    median,
    generateModernColors,
    quadrantLabel,
    needsLeaderLine,
    snapLabelToBubble,
    createBubbleLandscape,
} from '../chart-utils.js';
import { saLabelSolver } from '../../lib/sa-label-solver.js';
import {
    PanelSection,
    MetricGrid,
    GameListItem,
    GRADIENTS,
    ACCENTS,
    EmptyState,
} from '../../components/dashboard-components.js';
import { collapsibleList } from '../collapsible-list.js';

let chartInstances = {};

function destroyChart(key) {
    if (chartInstances[key]) {
        chartInstances[key].destroy();
        chartInstances[key] = null;
    }
}

// ── Pill helpers ──

const THEME_PALETTE = [
    '#6366f1',
    '#a855f7',
    '#ec4899',
    '#f43f5e',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#14b8a6',
    '#06b6d4',
    '#3b82f6',
    '#8b5cf6',
    '#d946ef',
    '#f59e0b',
    '#10b981',
    '#0ea5e9',
    '#64748b',
    '#84cc16',
    '#e11d48',
    '#7c3aed',
    '#0891b2',
];

function hashColor(name, palette) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
    return palette[Math.abs(h) % palette.length];
}

function darkenHex(hex, factor = 0.65) {
    const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
    const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
    const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function multiPill(compoundName, palette) {
    const parts = compoundName
        .split('/')
        .map(s => s.trim())
        .filter(Boolean);
    const baseColor = hashColor(compoundName, palette);
    const textColor = darkenHex(baseColor, 0.55);
    return parts
        .map(
            p =>
                `<span class="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded" style="background:${baseColor}15;color:${textColor};border:1px solid ${baseColor}25">${escapeHtml(p)}</span>`
        )
        .join(' ');
}

function shortLabel(compoundName) {
    const parts = compoundName.split('/');
    return parts[0].trim();
}

function buildArtBreakdown(games, excludeDimension) {
    const total = games.length;
    if (!total) return '';

    const gamesWithChars = games.filter(g => {
        const chars = F.artCharacters(g);
        return Array.isArray(chars) && chars.some(c => c && c !== 'No Characters (symbol-only game)');
    }).length;
    const gamesWithElems = games.filter(g => (F.artElements(g) || []).length > 0).length;
    const gamesWithColors = games.filter(g => {
        const v = F.artColorTone(g);
        return Array.isArray(v) ? v.length > 0 : !!v;
    }).length;

    const dims = [];

    if (excludeDimension !== 'theme') {
        const map = {};
        games.forEach(g => {
            const v = F.artTheme(g);
            if (v) map[v] = (map[v] || 0) + 1;
        });
        const sorted = Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
        if (sorted.length)
            dims.push({
                label: 'Themes',
                items: sorted,
                base: total,
                clickFn: 'window.showArtTheme',
                dim: 'art_theme',
            });
    }

    if (excludeDimension !== 'character') {
        const map = {};
        games.forEach(g => {
            const chars = F.artCharacters(g);
            if (Array.isArray(chars))
                chars.forEach(c => {
                    if (c && c !== 'No Characters (symbol-only game)') map[c] = (map[c] || 0) + 1;
                });
        });
        const sorted = Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
        if (sorted.length)
            dims.push({
                label: 'Characters',
                items: sorted,
                base: gamesWithChars,
                clickFn: 'window.showArtCharacter',
                dim: 'art_characters',
            });
    }

    if (excludeDimension !== 'element') {
        const map = {};
        games.forEach(g => {
            const elems = F.artElements(g);
            if (Array.isArray(elems))
                elems.forEach(e => {
                    if (e) map[e] = (map[e] || 0) + 1;
                });
        });
        const sorted = Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
        if (sorted.length)
            dims.push({
                label: 'Elements',
                items: sorted,
                base: gamesWithElems,
                clickFn: 'window.showArtElement',
                dim: 'art_elements',
            });
    }

    if (excludeDimension !== 'narrative') {
        const map = {};
        games.forEach(g => {
            const v = F.artNarrative(g);
            if (v) map[v] = (map[v] || 0) + 1;
        });
        const sorted = Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
        if (sorted.length)
            dims.push({
                label: 'Narratives',
                items: sorted,
                base: total,
                clickFn: 'window.showArtNarrative',
                dim: 'art_narrative',
            });
    }

    if (excludeDimension !== 'colorTone') {
        const map = {};
        games.forEach(g => {
            const v = F.artColorTone(g);
            if (Array.isArray(v))
                v.forEach(t => {
                    if (t) map[t] = (map[t] || 0) + 1;
                });
            else if (v) map[v] = (map[v] || 0) + 1;
        });
        const sorted = Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
        if (sorted.length)
            dims.push({
                label: 'Color tones',
                items: sorted,
                base: gamesWithColors,
                clickFn: 'window.showArtColorTone',
                dim: 'art_color_tone',
            });
    }

    if (!dims.length) return '';

    const DIM_COLORS = {
        art_theme: 'bg-violet-400 dark:bg-violet-500',
        art_characters: 'bg-amber-400 dark:bg-amber-500',
        art_elements: 'bg-teal-400 dark:bg-teal-500',
        art_narrative: 'bg-rose-400 dark:bg-rose-500',
        art_color_tone: 'bg-sky-400 dark:bg-sky-500',
    };

    return dims
        .map(d => {
            const maxCount = d.items.length ? d.items[0][1] : 1;
            const barColor = DIM_COLORS[d.dim] || 'bg-indigo-400 dark:bg-indigo-500';
            const rows = d.items
                .map(([name, count]) => {
                    const barW = ((count / maxCount) * 100).toFixed(0);
                    const pct = d.base > 0 ? ((count / d.base) * 100).toFixed(0) : '0';
                    return `<div class="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg px-2 transition-colors" data-xray='${escapeAttr(JSON.stringify({ dimension: d.dim, value: name }))}' onclick="${safeOnclick(d.clickFn, name)}">
                    <span class="text-[12px] font-medium text-gray-800 dark:text-gray-200 w-32 truncate flex-shrink-0">${escapeHtml(name)}</span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full ${barColor} rounded-full" style="width:${barW}%"></div></div>
                    <span class="text-[10px] text-gray-400 dark:text-gray-500 w-14 text-right flex-shrink-0">${count} (${pct}%)</span>
                </div>`;
                })
                .join('');
            return `<div class="mb-4 last:mb-0">
            <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">${d.label}${d.base < total ? ` <span class="font-normal">(${d.base} of ${total} games)</span>` : ''}</div>
            <div class="space-y-0.5">${rows}</div>
        </div>`;
        })
        .join('');
}

async function showArtFilteredGames(title, filterFn, opts) {
    const allGames = getActiveGames();
    const games = allGames.filter(filterFn).sort((a, b) => F.theoWin(b) - F.theoWin(a));
    const globalAvg = await getGlobalAvgTheo(gameData.activeCategory);
    const avgTheo = games.length ? games.reduce((s, g) => s + F.theoWin(g), 0) / games.length : 0;
    const maxTheo = games.length ? Math.max(...games.map(g => F.theoWin(g) || 0)) : 0;
    const minTheo = games.length ? Math.min(...games.map(g => F.theoWin(g) || 0)) : 0;
    const providers = new Set(games.map(g => F.provider(g)));
    const vsMarket = avgTheo > 0 ? ((avgTheo / globalAvg - 1) * 100).toFixed(0) : null;

    const panelContent = document.getElementById('mechanic-panel-content');
    const panelTitle = document.getElementById('mechanic-panel-title');
    if (!panelContent || !panelTitle) return;

    panelTitle.textContent = title;

    let html = '';

    const statsMetrics = [
        { label: 'Games', value: String(games.length) },
        { label: 'Providers', value: String(providers.size) },
        { label: 'Avg Performance Index', value: avgTheo.toFixed(2) },
        {
            label: 'vs Market',
            value:
                vsMarket != null
                    ? `<span class="${Number(vsMarket) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}">${Number(vsMarket) >= 0 ? '+' : ''}${vsMarket}%</span>`
                    : '—',
        },
        { label: 'Range', value: `${minTheo.toFixed(1)} – ${maxTheo.toFixed(1)}` },
        { label: 'Market Avg', value: globalAvg.toFixed(2) },
    ];

    html += PanelSection({
        title: 'Statistics',
        icon: '📊',
        gradient: GRADIENTS.performance,
        accent: ACCENTS.performance,
        content: MetricGrid(statsMetrics),
    });

    const excludeDim = opts?.excludeDimension || null;
    const artGames = games.filter(g => F.artTheme(g));
    const artBreakdown = buildArtBreakdown(artGames, excludeDim);
    if (artBreakdown) {
        html += PanelSection({
            title: `Art Profile (${artGames.length})`,
            icon: '🎨',
            gradient: GRADIENTS.category,
            accent: ACCENTS.category,
            content: artBreakdown,
        });
    }

    const provSorted = Array.from(providers).sort();
    if (provSorted.length > 1) {
        const PROV_INITIAL = 8;
        const provHtml = provSorted
            .map((p, i) => {
                const pGames = games.filter(g => F.provider(g) === p);
                const pAvg = pGames.reduce((s, g) => s + (F.theoWin(g) || 0), 0) / (pGames.length || 1);
                const hidden = i >= PROV_INITIAL ? ' style="display:none"' : '';
                return `<div data-cl-item${hidden} class="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" data-xray='${escapeAttr(JSON.stringify({ dimension: 'provider', value: p }))}' onclick="${safeOnclick('window.showProviderDetails', p)}">
                <span class="text-sm text-gray-700 dark:text-gray-300">${escapeHtml(p)}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400">${pGames.length} games · ${pAvg.toFixed(2)} avg</span>
            </div>`;
            })
            .join('');
        const provContent =
            provSorted.length > PROV_INITIAL
                ? collapsibleList(provHtml, provSorted.length, PROV_INITIAL, 'art-prov')
                : provHtml;
        html += PanelSection({
            title: `Providers (${provSorted.length})`,
            icon: '🏢',
            gradient: GRADIENTS.provider,
            accent: ACCENTS.provider,
            content: `<div class="space-y-0">${provContent}</div>`,
        });
    }

    const INITIAL_SHOW = 5;
    const gameItems = games
        .map((g, i) => {
            const hidden = i >= INITIAL_SHOW ? ' style="display:none"' : '';
            return `<div data-cl-item${hidden}>${GameListItem(g, i)}</div>`;
        })
        .join('');

    let topGamesHtml;
    if (games.length > 0) {
        topGamesHtml = collapsibleList(gameItems, games.length, INITIAL_SHOW, 'art-panel-games');
    } else {
        topGamesHtml = EmptyState('No games found');
    }

    html += PanelSection({
        title: `Top Games (${games.length})`,
        icon: '🏆',
        gradient: GRADIENTS.similar,
        accent: ACCENTS.similar,
        content: `<div class="space-y-0">${topGamesHtml}</div>`,
    });

    panelContent.innerHTML = html;

    if (window.closeAllPanels) window.closeAllPanels('mechanic-panel');
    const panel = document.getElementById('mechanic-panel');
    const bg = document.getElementById('mechanic-backdrop');
    if (panel) {
        panel.scrollTop = 0;
        panel.style.right = '0px';
    }
    if (bg) {
        bg.classList.remove('hidden');
        bg.classList.add('block');
    }
    document.body.style.overflow = 'hidden';
}

window.showArtTheme = async function (setting) {
    await showArtFilteredGames(`Theme: ${setting}`, g => F.artTheme(g) === setting, { excludeDimension: 'theme' });
};
window.showArtCharacter = async function (character) {
    await showArtFilteredGames(`Character: ${character}`, g => F.artCharacters(g).includes(character), {
        excludeDimension: 'character',
    });
};
window.showArtElement = async function (element) {
    await showArtFilteredGames(`Element: ${element}`, g => F.artElements(g).includes(element), {
        excludeDimension: 'element',
    });
};
window.showArtNarrative = async function (narrative) {
    await showArtFilteredGames(`Narrative: ${narrative}`, g => F.artNarrative(g) === narrative, {
        excludeDimension: 'narrative',
    });
};
window.showArtColor = async function (tone) {
    await showArtFilteredGames(`Color tone: ${tone}`, g => (F.artColorTone(g) || []).includes(tone), {
        excludeDimension: 'colorTone',
    });
};
window.showArtColorTone = async function (tone) {
    await showArtFilteredGames(`Color tone: ${tone}`, g => (F.artColorTone(g) || []).includes(tone), {
        excludeDimension: 'colorTone',
    });
};
window.showArtRecipe = async function (theme) {
    await showArtFilteredGames(`Theme: ${theme}`, g => F.artTheme(g) === theme);
};
window.showArtCombo = async function (dimA, dimB) {
    await showArtFilteredGames(`${dimA} + ${dimB}`, g => {
        if (F.artTheme(g) !== dimA) return false;
        const elems = F.artElements(g);
        return Array.isArray(elems) && elems.some(e => e === dimB);
    });
};

export async function renderArt() {
    const allGames = getActiveGames();
    const artGames = allGames.filter(g => F.artTheme(g));

    const [themes, narratives, characters, elements, colorTones, recipes, globalAvg] = await Promise.all([
        getArtThemeMetrics(gameData.activeCategory),
        getArtNarrativeMetrics(gameData.activeCategory),
        getArtCharacterMetrics(gameData.activeCategory),
        getArtElementMetrics(gameData.activeCategory),
        getArtColorToneMetrics(gameData.activeCategory),
        getArtRecipeMetrics(gameData.activeCategory, { minGames: 3 }),
        getGlobalAvgTheo(gameData.activeCategory),
    ]);

    renderStats(allGames, artGames, themes, characters, elements, colorTones);
    renderThemeLandscape(themes, globalAvg);
    renderDimensionLandscape(
        'characters',
        'art-characters-landscape',
        characters.filter(c => c.character !== 'No Characters (symbol-only game)' && c.count > 1),
        'character',
        c => c.character,
        'showArtCharacter'
    );
    renderDimensionLandscape(
        'elements',
        'art-elements-landscape',
        elements,
        'element',
        c => c.element,
        'showArtElement'
    );
    renderDimensionLandscape(
        'colors',
        'art-colors-landscape',
        colorTones,
        'colorTone',
        c => c.colorTone,
        'showArtColor',
        {
            labelColorFn: item => {
                const colorMap = {
                    Gold: '#FFD700',
                    Silver: '#C0C0C0',
                    Red: '#EF4444',
                    Blue: '#3B82F6',
                    Green: '#22C55E',
                    Purple: '#A855F7',
                    Pink: '#EC4899',
                    Teal: '#14B8A6',
                    Yellow: '#EAB308',
                    Orange: '#F97316',
                    Black: '#1F2937',
                    White: '#F3F4F6',
                    Beige: '#D2B48C',
                    Brown: '#92400E',
                    Crimson: '#DC143C',
                    Magenta: '#FF00FF',
                    Coral: '#FF7F50',
                    Navy: '#000080',
                    Turquoise: '#40E0D0',
                    Ivory: '#FFFFF0',
                    Lavender: '#E6E6FA',
                    Indigo: '#4B0082',
                    Maroon: '#800000',
                    Olive: '#808000',
                    Emerald: '#50C878',
                    Ruby: '#E0115F',
                    Sapphire: '#0F52BA',
                    Amber: '#FFBF00',
                    Copper: '#B87333',
                    Bronze: '#CD7F32',
                    Platinum: '#E5E4E2',
                    Charcoal: '#36454F',
                    Rose: '#FF007F',
                    Burgundy: '#800020',
                    Slate: '#708090',
                    Tan: '#D2B48C',
                    Peach: '#FFCBA4',
                    Mint: '#98FB98',
                    Aqua: '#00FFFF',
                    Neon: '#39FF14',
                    Pastel: '#FFD1DC',
                    Earth: '#5C4033',
                    Warm: '#FF6B35',
                    Cool: '#4A90D9',
                    Dark: '#2D2D2D',
                    Light: '#F0F0F0',
                    Bright: '#FFD700',
                    Muted: '#9E9E9E',
                    Metallic: '#AAA9AD',
                    Rainbow: '#FF0000',
                    Multi: '#FF69B4',
                };
                const name = item.name || '';
                const firstName = name.split(/[\s/]/)[0];
                if (colorMap[firstName]) return colorMap[firstName];
                const hash = name.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
                return '#' + ((hash & 0xffffff) | 0x404040).toString(16).slice(-6);
            },
        }
    );
    renderDimensionLandscape(
        'narratives',
        'art-narrative-landscape',
        narratives,
        'narrative',
        c => c.narrative,
        'showArtNarrative'
    );
    renderThemesChart(themes, artGames);
    renderArtColorToneChart(colorTones);
    renderCharactersChart(characters);
    renderElementsChart(elements);
    renderNarrativeChart(narratives);
    renderArtTrends(artGames);
    await renderArtRecipes(recipes, globalAvg, artGames);
    await renderProviderArtCards(artGames, globalAvg);
    renderOpportunityGaps(artGames, globalAvg, themes, narratives, characters, elements, colorTones);
    await renderTopCombos(artGames, globalAvg);
}

function renderStats(allGames, artGames, themes, characters, elements, colorTones) {
    const fullArt = artGames.filter(g => {
        const elems = F.artElements(g);
        const chars = F.artCharacters(g);
        return elems.length > 0 && chars.length > 0;
    });
    const pct = artGames.length > 0 ? ((fullArt.length / artGames.length) * 100).toFixed(0) : '0';
    const avgTheo = artGames.length > 0 ? artGames.reduce((s, g) => s + F.theoWin(g), 0) / artGames.length : 0;

    const el = id => document.getElementById(id);
    const set = (id, val) => {
        const e = el(id);
        if (e) e.textContent = val;
    };

    set('art-stat-coverage', `${fullArt.length} of ${artGames.length} (${pct}%)`);
    set('art-stat-themes', themes.length);
    set('art-stat-characters', characters.length);
    set('art-stat-avg-theo', avgTheo.toFixed(2));
    set('art-stat-elements', elements.length);
    set('art-stat-color-tones', colorTones.length);

    const sub = el('art-subtitle');
    if (sub) {
        sub.textContent = `Visual design analysis across ${artGames.length} classified games — ${themes.length} themes, ${characters.length} characters, ${elements.length} elements, ${colorTones.length} color tones`;
    }
}

function renderDimensionLandscape(key, canvasId, metrics, dimKey, nameAccessor, clickHandler, extraOpts = {}) {
    destroyChart(key + 'Landscape');
    if (!metrics.length) return;

    const maxCount = Math.max(...metrics.map(m => m.count), 1);
    const medX = median(metrics.map(m => m.count));
    const medY = median(metrics.map(m => m.avgTheo));

    const data = metrics.map(m => {
        const full = nameAccessor(m);
        let short = full.includes('/') ? full.split('/')[0].trim() : full;
        short = short.replace(/\s*\(.*?\)\s*$/, '').trim();
        return {
            name: full,
            shortName: short,
            x: m.count,
            y: m.avgTheo,
            r: 6 + Math.sqrt(m.count / maxCount) * 34,
            _m: m,
        };
    });

    const chart = createBubbleLandscape(canvasId, {
        data,
        instanceKey: key + 'Landscape',
        instanceRegistry: chartInstances,
        labels: 'all',
        medianX: medX,
        medianY: medY,
        tooltipFn: item => {
            const m = item._m;
            const q = quadrantLabel(m.count, m.avgTheo, medX, medY);
            return [`Games: ${m.count}  |  Avg PI: ${m.avgTheo.toFixed(2)}  |  ${q}`];
        },
        onBubbleClick: item => {
            if (window[clickHandler]) window[clickHandler](item.name);
        },
        ...extraOpts,
    });
}

// ── Art Landscape bubble chart (unified via createBubbleLandscape) ──

function renderThemeLandscape(themes, globalAvg) {
    destroyChart('opportunity');
    if (!themes.length) return;

    const maxCount = Math.max(...themes.map(s => s.count), 1);
    const medX = median(themes.map(s => s.count));
    const medY = median(themes.map(s => s.avgTheo));

    const data = themes.map(s => {
        const full = s.theme;
        return {
            name: full,
            shortName: full.includes('/') ? full.split('/')[0].trim() : full,
            x: s.count,
            y: s.avgTheo,
            r: 6 + Math.sqrt(s.count / maxCount) * 34,
            _theme: s,
        };
    });

    createBubbleLandscape('art-opportunity-chart', {
        data,
        instanceKey: 'opportunity',
        instanceRegistry: chartInstances,
        labels: 'all',
        medianX: medX,
        medianY: medY,
        tooltipFn: item => {
            const s = item._theme;
            const q = quadrantLabel(s.count, s.avgTheo, medX, medY);
            return [`Games: ${s.count}  |  Avg PI: ${s.avgTheo.toFixed(2)}  |  ${q}`];
        },
        onBubbleClick: item => {
            if (item._theme?.theme) window.showArtTheme(item._theme.theme);
        },
    });
}

// ── Blue Ocean Opportunities bubble chart (recipe-level: Theme × Mood) ──

// ── Combo Heatmap ──

const COMBO_DIM_MAP = {
    theme_elements: { dimA: 'theme', dimB: 'elements' },
    theme_characters: { dimA: 'theme', dimB: 'characters' },
    theme_colors: { dimA: 'theme', dimB: 'colorTone' },
    characters_elements: { dimA: 'characters', dimB: 'elements' },
};

let _comboArtGames = null;

async function renderComboHeatmap(artGames) {
    _comboArtGames = artGames;
    const picker = document.getElementById('art-combo-dim-picker');
    if (!picker) return;
    await buildComboHeatmap(artGames, picker.value);
    picker.addEventListener('change', () => void buildComboHeatmap(_comboArtGames, picker.value));
}

async function buildComboHeatmap(artGames, comboKey) {
    const container = document.getElementById('art-combo-heatmap');
    if (!container) return;

    const dims = COMBO_DIM_MAP[comboKey] || COMBO_DIM_MAP.theme_elements;
    const combos = await getArtComboMetrics(gameData.activeCategory, {
        dimA: dims.dimA,
        dimB: dims.dimB,
        minGames: 2,
    });
    if (!combos.length) {
        container.innerHTML = '<div class="text-center text-gray-400 dark:text-gray-500 py-8">No combos found</div>';
        return;
    }

    const dimACounts = {};
    const dimBCounts = {};
    combos.forEach(c => {
        dimACounts[c.dimA] = (dimACounts[c.dimA] || 0) + c.count;
        dimBCounts[c.dimB] = (dimBCounts[c.dimB] || 0) + c.count;
    });
    const topA = Object.entries(dimACounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(e => e[0]);
    const topB = Object.entries(dimBCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(e => e[0]);

    const matrix = {};
    const allPI = [];
    combos.forEach(c => {
        if (topA.includes(c.dimA) && topB.includes(c.dimB)) {
            const key = `${c.dimA}|||${c.dimB}`;
            matrix[key] = c;
            allPI.push(c.avgTheo);
        }
    });

    if (!allPI.length) {
        container.innerHTML = '<div class="text-center text-gray-400 dark:text-gray-500 py-8">No combos found</div>';
        return;
    }

    allPI.sort((a, b) => a - b);
    const p33 = allPI[Math.floor(allPI.length * 0.33)] || 0;
    const p66 = allPI[Math.floor(allPI.length * 0.66)] || 0;

    const isDark = document.documentElement.classList.contains('dark');
    const piColor = v => {
        if (v >= p66) return isDark ? 'background:rgba(16,185,129,0.4)' : 'background:rgba(16,185,129,0.2)';
        if (v >= p33) return isDark ? 'background:rgba(148,163,184,0.25)' : 'background:rgba(148,163,184,0.12)';
        return isDark ? 'background:rgba(239,68,68,0.25)' : 'background:rgba(239,68,68,0.12)';
    };

    let html = '<table class="w-full border-collapse text-[10px]">';
    html +=
        '<thead><tr><th class="p-1 text-left text-gray-500 dark:text-gray-400 font-semibold sticky left-0 bg-white dark:bg-gray-800 z-10"></th>';
    topB.forEach(b => {
        html += `<th class="p-1 text-center text-gray-600 dark:text-gray-300 font-medium max-w-[80px] truncate" title="${escapeAttr(b)}">${escapeHtml(shortLabel(b))}</th>`;
    });
    html += '</tr></thead><tbody>';

    topA.forEach(a => {
        html += `<tr><td class="p-1.5 font-semibold text-gray-700 dark:text-gray-200 whitespace-nowrap sticky left-0 bg-white dark:bg-gray-800 z-10 max-w-[120px] truncate" title="${escapeAttr(a)}">${escapeHtml(shortLabel(a))}</td>`;
        topB.forEach(b => {
            const key = `${a}|||${b}`;
            const c = matrix[key];
            if (c) {
                html += `<td class="p-1 text-center cursor-pointer hover:ring-2 hover:ring-indigo-500 rounded transition-all" style="${piColor(c.avgTheo)}" title="${escapeAttr(a)} × ${escapeAttr(b)}: ${c.count} games, PI ${c.avgTheo.toFixed(2)}" onclick="${safeOnclick('window.showArtCombo', a, b)}"><span class="font-bold text-gray-800 dark:text-gray-100">${c.count}</span></td>`;
            } else {
                html += '<td class="p-1"></td>';
            }
        });
        html += '</tr>';
    });

    html += '</tbody></table>';

    html += `<div class="flex items-center gap-2 mt-3 text-[9px] text-gray-500 dark:text-gray-400">
        <span>Performance:</span>
        <span class="px-1.5 py-0.5 rounded" style="${isDark ? 'background:rgba(239,68,68,0.3)' : 'background:rgba(239,68,68,0.15)'}">Low</span>
        <span class="px-1.5 py-0.5 rounded" style="${isDark ? 'background:rgba(148,163,184,0.25)' : 'background:rgba(148,163,184,0.15)'}">Mid</span>
        <span class="px-1.5 py-0.5 rounded" style="${isDark ? 'background:rgba(16,185,129,0.45)' : 'background:rgba(16,185,129,0.25)'}">High</span>
    </div>`;

    container.innerHTML = html;
}

async function renderBlueOcean(artGames, globalAvg) {
    destroyChart('blueOcean');
    const canvas = document.getElementById('art-blue-ocean-chart');
    if (!canvas) return;

    const combos = await getArtComboMetrics(gameData.activeCategory, { minGames: 2 });
    if (!combos.length) return;

    const ctx = canvas.getContext('2d');
    const chartColors = getChartColors();

    const xVals = combos.map(c => c.count);
    const yVals = combos.map(c => c.avgTheo);
    const maxCount = Math.max(...xVals, 1);
    const rMin = 5;
    const rMax = 32;

    // X-axis: inverted game count (fewer games = further right = more opportunity)
    const maxX = Math.max(...xVals);
    const invertX = v => Math.log10(Math.max(1, maxX + 1 - v));
    const rawMedCount = median(xVals);
    const medXInv = invertX(rawMedCount);
    const rawMedY = median(yVals);

    // Y-axis: sqrt for spread
    const sqrtY = v => Math.sqrt(Math.max(0, v));
    const warpedMedY = sqrtY(rawMedY);

    const quadrantColor = (wy, wx) => {
        if (wy >= warpedMedY && wx >= medXInv) return { bg: 'rgba(6,182,212,', border: 'rgba(6,182,212,' }; // Blue Ocean
        if (wy >= warpedMedY && wx < medXInv) return { bg: 'rgba(99,102,241,', border: 'rgba(99,102,241,' }; // Red Ocean
        if (wy < warpedMedY && wx >= medXInv) return { bg: 'rgba(100,116,139,', border: 'rgba(100,116,139,' }; // Unproven
        return { bg: 'rgba(239,68,68,', border: 'rgba(239,68,68,' }; // Avoid
    };

    const bubbleData = combos.map(c => {
        const wx = invertX(c.count);
        const wy = sqrtY(c.avgTheo);
        return {
            x: wx,
            y: wy,
            r: rMin + Math.sqrt(c.mktShare / Math.max(...combos.map(cc => cc.mktShare), 0.001)) * (rMax - rMin),
            dimA: c.dimA,
            dimB: c.dimB,
            count: c.count,
            avgTheo: c.avgTheo,
            mktShare: c.mktShare,
            _label: `${shortLabel(c.dimA)} + ${shortLabel(c.dimB)}`,
        };
    });

    const bgColors = bubbleData.map(d => quadrantColor(d.y, d.x).bg + '0.5)');
    const borderColors = bubbleData.map(d => quadrantColor(d.y, d.x).border + '0.8)');

    const quadrantPlugin = {
        id: 'blueOceanQuadrants',
        beforeDatasetsDraw(chart) {
            const {
                ctx: c,
                chartArea: { left, right, top, bottom },
                scales: { x: xScale, y: yScale },
            } = chart;
            const mx = xScale.getPixelForValue(medXInv);
            const my = yScale.getPixelForValue(warpedMedY);
            const isDark = document.documentElement.classList.contains('dark');

            const drawQuad = (x1, y1, x2, y2, color, labelText) => {
                c.save();
                c.fillStyle = isDark ? color.replace('0.06', '0.12') : color;
                c.fillRect(x1, y1, x2 - x1, y2 - y1);
                c.restore();
                c.save();
                c.font = '700 11px Inter, system-ui, sans-serif';
                c.fillStyle = isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.18)';
                c.textAlign = x1 < mx ? 'left' : 'right';
                c.textBaseline = y1 < my ? 'top' : 'bottom';
                const px = x1 < mx ? x1 + 8 : x2 - 8;
                const py = y1 < my ? y1 + 6 : y2 - 6;
                c.fillText(labelText, px, py);
                c.restore();
            };

            drawQuad(mx, top, right, my, 'rgba(6,182,212,0.06)', '🌊 Blue Ocean');
            drawQuad(left, top, mx, my, 'rgba(99,102,241,0.06)', '🔴 Red Ocean');
            drawQuad(left, my, mx, bottom, 'rgba(239,68,68,0.06)', '⚠️ Avoid');
            drawQuad(mx, my, right, bottom, 'rgba(100,116,139,0.06)', '🔍 Unproven');

            c.save();
            c.setLineDash([4, 4]);
            c.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)';
            c.lineWidth = 1;
            c.beginPath();
            c.moveTo(mx, top);
            c.lineTo(mx, bottom);
            c.stroke();
            c.beginPath();
            c.moveTo(left, my);
            c.lineTo(right, my);
            c.stroke();
            c.restore();
        },
    };

    // SA label solver for non-overlapping labels
    const topN = bubbleData
        .map((d, i) => ({ ...d, _i: i }))
        .sort((a, b) => {
            const aOpp = a.avgTheo / Math.max(a.count, 1);
            const bOpp = b.avgTheo / Math.max(b.count, 1);
            return bOpp - aOpp;
        })
        .slice(0, 30);

    const placements = saLabelSolver({
        bubbles: topN.map(d => ({ x: d.x, y: d.y, r: d.r })),
        labels: topN.map(d => d._label),
        canvasWidth: canvas.parentElement?.clientWidth || 800,
        canvasHeight: 520,
        maxIter: 500,
    });

    let resolvedLabels = null;

    const labelPlugin = {
        id: 'blueOceanLabels',
        afterDatasetsDraw(chart) {
            const {
                ctx: c,
                chartArea: { left, right, top, bottom },
                scales: { x: xScale, y: yScale },
            } = chart;
            const isDark = document.documentElement.classList.contains('dark');
            resolvedLabels = [];

            for (let i = 0; i < topN.length; i++) {
                const d = topN[i];
                const p = placements[i];
                if (!p) continue;

                const bx = xScale.getPixelForValue(d.x);
                const by = yScale.getPixelForValue(d.y);
                const lbl = d._label.length > 28 ? d._label.slice(0, 27) + '…' : d._label;

                c.save();
                c.font = '600 9px Inter, system-ui, sans-serif';
                const tw = c.measureText(lbl).width;
                c.restore();

                let lx, ly;
                if (needsLeaderLine(p)) {
                    const pxOff = ((p.x - d.x) / (Math.abs(p.x - d.x) || 1)) * 40;
                    const pyOff = ((p.y - d.y) / (Math.abs(p.y - d.y) || 1)) * 20;
                    lx = bx + pxOff;
                    ly = by + pyOff;
                    c.save();
                    c.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)';
                    c.lineWidth = 0.8;
                    c.beginPath();
                    c.moveTo(bx, by);
                    c.lineTo(lx, ly);
                    c.stroke();
                    c.restore();
                } else {
                    ({ lx, ly } = snapLabelToBubble(bx, by, d.r, tw, 11, left, right, top, bottom));
                }

                lx = Math.max(left + 2, Math.min(right - tw - 2, lx));
                ly = Math.max(top + 12, Math.min(bottom - 4, ly));

                resolvedLabels.push({ x: lx, y: ly - 11, w: tw + 4, h: 14, index: d._i });

                c.save();
                c.font = '600 9px Inter, system-ui, sans-serif';
                c.fillStyle = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.65)';
                c.fillText(lbl, lx, ly);
                c.restore();
            }
        },
    };

    chartInstances.blueOcean = new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: [
                {
                    data: bubbleData,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1.5,
                    hoverBorderWidth: 2.5,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 600 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...getModernTooltipConfig(),
                    callbacks: {
                        title: ctx => {
                            if (!ctx?.length) return '';
                            const d = ctx[0]?.raw;
                            return d ? `${d.dimA} + ${d.dimB}` : '';
                        },
                        label: ctx => {
                            if (!ctx) return '';
                            const d = ctx.raw;
                            if (!d) return '';
                            return [
                                `Performance: ${d.avgTheo.toFixed(2)}`,
                                `Games: ${d.count}`,
                                `Market Share: ${(d.mktShare * 100).toFixed(1)}%`,
                            ];
                        },
                    },
                },
            },
            scales: {
                y: {
                    title: {
                        display: true,
                        text: 'Performance Index',
                        color: chartColors.textColor,
                        font: { size: 10, weight: 'bold' },
                    },
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 10 },
                        callback: val => {
                            const orig = val * val;
                            return orig.toFixed(1);
                        },
                    },
                    grid: getModernGridConfig(),
                },
                x: {
                    title: {
                        display: true,
                        text: 'Competition (fewer games →)',
                        color: chartColors.textColor,
                        font: { size: 10, weight: 'bold' },
                    },
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 10 },
                        callback: val => {
                            const count = Math.round(maxX + 1 - Math.pow(10, val));
                            return count > 0 ? count : '';
                        },
                    },
                    grid: getModernGridConfig(),
                },
            },
        },
        plugins: [quadrantPlugin, labelPlugin],
    });

    canvas.addEventListener('click', e => {
        if (window.xrayActive) return;
        const chart = chartInstances.blueOcean;
        if (!chart) return;

        const points = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
        if (points.length > 0) {
            const d = bubbleData[points[0].index];
            if (d) window.showArtCombo(d.dimA, d.dimB);
            return;
        }

        if (resolvedLabels) {
            const rect = canvas.getBoundingClientRect();
            const cx = e.clientX - rect.left;
            const cy = e.clientY - rect.top;
            for (const lb of resolvedLabels) {
                if (cx >= lb.x && cx <= lb.x + lb.w && cy >= lb.y && cy <= lb.y + lb.h) {
                    const d = bubbleData[lb.index];
                    if (d) window.showArtCombo(d.dimA, d.dimB);
                    return;
                }
            }
        }
    });
}

// ── Art Trends ──

function renderArtTrends(artGames) {
    const canvas = document.getElementById('art-trend-chart');
    if (!canvas) return;

    const DIMENSION_CONFIG = {
        environment: { accessor: g => [F.artTheme(g)].filter(Boolean), label: 'Themes' },
        elements: { accessor: g => F.artElements(g) || [], label: 'Elements' },
        characters: { accessor: g => F.artCharacters(g) || [], label: 'Characters' },
        colors: { accessor: g => F.artColorTone(g) || [], label: 'Colors' },
        narrative: { accessor: g => [F.artNarrative(g)].filter(Boolean), label: 'Narratives' },
    };

    function buildYearData(dimension) {
        const cfg = DIMENSION_CONFIG[dimension] || DIMENSION_CONFIG.environment;
        const byDim = {};
        const yearSet = new Set();
        for (const g of artGames) {
            const vals = cfg.accessor(g);
            const yr = F.releaseYear(g);
            if (!vals.length || !yr || yr < 2015) continue;
            yearSet.add(yr);
            for (const dim of vals) {
                if (!dim || dim === 'No Characters (symbol-only game)' || dim === 'No Narrative (classic/abstract)')
                    continue;
                if (!byDim[dim]) byDim[dim] = {};
                byDim[dim][yr] = (byDim[dim][yr] || 0) + 1;
            }
        }
        const years = [...yearSet].sort((a, b) => a - b);
        const dims = Object.entries(byDim)
            .map(([name, yrMap]) => ({
                name,
                total: Object.values(yrMap).reduce((s, v) => s + v, 0),
                data: years.map(y => yrMap[y] || 0),
            }))
            .filter(d => d.total >= 5)
            .sort((a, b) => b.total - a.total)
            .slice(0, 15);
        return { years, dims };
    }

    const TREND_COLORS = [
        '#6366f1',
        '#ec4899',
        '#f97316',
        '#22c55e',
        '#06b6d4',
        '#a855f7',
        '#eab308',
        '#f43f5e',
        '#14b8a6',
        '#3b82f6',
        '#8b5cf6',
        '#10b981',
        '#f59e0b',
        '#ef4444',
        '#0ea5e9',
    ];

    function drawTrendChart(dimension) {
        destroyChart('artTrend');
        const { years, dims } = buildYearData(dimension);
        if (!years.length || !dims.length) return;
        const chartColors = getChartColors();
        const ctx = canvas.getContext('2d');

        const datasets = dims.map((d, i) => ({
            label: shortLabel(d.name),
            data: d.data,
            borderColor: TREND_COLORS[i % TREND_COLORS.length],
            _origColor: TREND_COLORS[i % TREND_COLORS.length],
            _origWidth: 2.5,
            backgroundColor: TREND_COLORS[i % TREND_COLORS.length] + '22',
            borderWidth: 2.5,
            pointRadius: 4,
            pointHoverRadius: 8,
            tension: 0.3,
            fill: false,
        }));

        const hlDataset = (chart, activeIdx) => {
            chart.data.datasets.forEach((ds, i) => {
                if (activeIdx < 0) {
                    ds.borderWidth = ds._origWidth || 2.5;
                    if (ds._origColor) ds.borderColor = ds._origColor;
                } else if (i === activeIdx) {
                    ds.borderWidth = 4.5;
                } else {
                    ds.borderWidth = 1;
                    const c = ds._origColor || ds.borderColor;
                    ds.borderColor = typeof c === 'string' && c.startsWith('#') ? c + '40' : c;
                }
            });
            chart.update('none');
            if (activeIdx < 0) {
                chart.data.datasets.forEach(ds => {
                    if (ds._origColor) ds.borderColor = ds._origColor;
                });
                chart.update('none');
            }
        };

        const soloDs = (chart, idx) => {
            const allHidden = chart.data.datasets.every((ds, j) => (j === idx ? !ds.hidden : ds.hidden));
            chart.data.datasets.forEach((ds, j) => {
                if (allHidden) {
                    ds.hidden = false;
                    ds.borderWidth = ds._origWidth || 2.5;
                    if (ds._origColor) ds.borderColor = ds._origColor;
                } else {
                    ds.hidden = j !== idx;
                    if (j === idx) {
                        ds.borderWidth = ds._origWidth || 2.5;
                        if (ds._origColor) ds.borderColor = ds._origColor;
                    }
                }
            });
            chart.update();
        };

        chartInstances.artTrend = new Chart(ctx, {
            type: 'line',
            data: { labels: years.map(String), datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 400 },
                layout: { padding: { top: 16, right: 24, bottom: 8, left: 16 } },
                interaction: { mode: 'nearest', intersect: true },
                onHover: (evt, elements, chart) => hlDataset(chart, elements.length ? elements[0].datasetIndex : -1),
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            color: chartColors.textColor,
                            font: { size: 10 },
                            boxWidth: 12,
                            padding: 12,
                            usePointStyle: true,
                            pointStyle: 'circle',
                        },
                        onClick: (evt, legendItem, legend) => {
                            if (window.xrayActive) return;
                            soloDs(legend.chart, legendItem.datasetIndex);
                        },
                        onHover: (evt, legendItem, legend) => {
                            evt.native.target.style.cursor = 'pointer';
                            hlDataset(legend.chart, legendItem.datasetIndex);
                        },
                        onLeave: (evt, legendItem, legend) => {
                            evt.native.target.style.cursor = 'default';
                            hlDataset(legend.chart, -1);
                        },
                    },
                    tooltip: {
                        ...getModernTooltipConfig(),
                        callbacks: {
                            title: items => {
                                if (!items?.length) return '';
                                return items[0]?.label || '';
                            },
                            label: item => {
                                if (!item) return '';
                                return `${item.dataset.label}: ${item.formattedValue} games`;
                            },
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Game Count',
                            color: chartColors.textColor,
                            font: { size: 10, weight: 'bold' },
                        },
                        ticks: { color: chartColors.textColor, font: { size: 10 } },
                        grid: getModernGridConfig(),
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Release Year (OGPD)',
                            color: chartColors.textColor,
                            font: { size: 10, weight: 'bold' },
                        },
                        ticks: { color: chartColors.textColor, font: { size: 10 } },
                        grid: getModernGridConfig(),
                    },
                },
            },
        });
    }

    const updateSubtitle = dim => {
        const sub = document.getElementById('art-trend-subtitle');
        if (sub) {
            const label = (DIMENSION_CONFIG[dim] || DIMENSION_CONFIG.environment).label.toLowerCase();
            sub.textContent = `How art ${label} trend year over year`;
        }
    };

    drawTrendChart('environment');

    const dimSelect = document.getElementById('art-trend-dimension');
    if (dimSelect) {
        dimSelect.addEventListener('change', () => {
            drawTrendChart(dimSelect.value);
            updateSubtitle(dimSelect.value);
        });
    }
}

// ── Bar charts (gradient style matching overview) ──

function createHorizontalBar(canvasId, labels, values, metric, chartKey, color, onClickFn, displayLabelOverrides) {
    destroyChart(chartKey);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chartColors = getChartColors();
    const top12 = labels.slice(0, 12);
    const top12Vals = values.slice(0, 12);

    const displayLabels = displayLabelOverrides ? displayLabelOverrides.slice(0, 12) : top12.map(l => shortLabel(l));
    const gradientColors = generateModernColors(ctx, top12.length);

    chartInstances[chartKey] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top12,
            datasets: [
                {
                    label: metric,
                    data: top12Vals,
                    backgroundColor: gradientColors,
                    borderWidth: 0,
                    borderRadius: 6,
                    borderSkipped: false,
                    barThickness: 18,
                },
            ],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { left: 4, right: 8 } },
            onClick: (e, elements) => {
                if (window.xrayActive) return;
                if (elements.length && onClickFn) {
                    const idx = elements[0].index;
                    onClickFn(top12[idx]);
                }
            },
            onHover: (e, elements) => {
                const native = e.native;
                if (native) native.target.style.cursor = elements.length ? 'pointer' : 'default';
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...getModernTooltipConfig(),
                    callbacks: {
                        title: items => {
                            if (!items?.length) return '';
                            return top12[items[0].dataIndex] || '';
                        },
                        label: item => {
                            if (!item) return '';
                            return `${metric}: ${typeof item.raw === 'number' && item.raw % 1 !== 0 ? item.raw.toFixed(2) : item.raw}`;
                        },
                    },
                },
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: getModernGridConfig(),
                    title: {
                        display: true,
                        text: metric,
                        color: chartColors.textColor,
                        font: { size: 10, weight: 'bold' },
                    },
                    ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 4 },
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 11 },
                        autoSkip: false,
                        padding: 6,
                        callback: (_, idx) => displayLabels[idx] || top12[idx],
                    },
                },
            },
        },
    });
}

function renderThemesChart(themes, artGames) {
    const trendMap = artGames ? computeArtThemeTrends(artGames) : {};
    const trendSuffix = name => {
        const t = trendMap[name];
        if (!t || t.direction === 'stable' || t.direction === 'insufficient') return '';
        return t.direction === 'rising' ? ' ▲' : ' ▼';
    };
    createHorizontalBar(
        'art-themes-chart',
        themes.map(s => s.theme),
        themes.map(s => s.count),
        'Games',
        'settings',
        '#6366f1',
        name => window.showArtTheme(name),
        themes.map(s => shortLabel(s.theme) + trendSuffix(s.theme))
    );
    const legendEl = document.getElementById('art-themes-trend-legend');
    if (legendEl) {
        const rising = Object.values(trendMap).filter(t => t.direction === 'rising').length;
        const declining = Object.values(trendMap).filter(t => t.direction === 'declining').length;
        legendEl.innerHTML = `<span class="text-[9px] text-gray-400 dark:text-gray-500">Trends (last 2yr vs prior): <span class="text-emerald-500">▲ rising (${rising})</span> · <span class="text-red-400">▼ declining (${declining})</span></span>`;
    }
}

function renderArtColorToneChart(colorTones) {
    if (!colorTones.length) {
        destroyChart('colorTones');
        return;
    }
    createHorizontalBar(
        'art-color-tone-chart',
        colorTones.map(s => s.colorTone),
        colorTones.map(s => s.count),
        'Games',
        'colorTones',
        '#06b6d4',
        name => window.showArtColorTone(name)
    );
}

function renderCharactersChart(characters) {
    createHorizontalBar(
        'art-characters-chart',
        characters.map(c => c.character),
        characters.map(c => c.count),
        'Games',
        'characters',
        '#f59e0b',
        name => window.showArtCharacter(name)
    );
}

function renderElementsChart(elements) {
    createHorizontalBar(
        'art-elements-chart',
        elements.map(e => e.element),
        elements.map(e => e.count),
        'Games',
        'elements',
        '#14b8a6',
        name => window.showArtElement(name)
    );
}

function renderNarrativeChart(narratives) {
    createHorizontalBar(
        'art-narrative-chart',
        narratives.map(n => n.narrative),
        narratives.map(n => n.avgTheo),
        'Avg Performance Index',
        'narratives',
        '#f43f5e',
        name => window.showArtNarrative(name)
    );
}

// ── Art Recipes (replaces combos table) ──

let _recipeCache = { recipes: [], avg: 0, sortMode: 'opportunity' };

function calcOppScore(r, avg) {
    if (avg <= 0) return 0;
    const lift = r.avgTheo / avg;
    const gap = Math.pow(r.count, -0.7);
    const confidence = Math.min(1, (r.count - 1) / 4);
    return lift * gap * confidence;
}

function sortRecipes(recipes, avg, mode) {
    const oppScore = r => calcOppScore(r, avg);
    const sorted = [...recipes];
    switch (mode) {
        case 'theo-desc':
            sorted.sort((a, b) => b.avgTheo - a.avgTheo);
            break;
        case 'count-asc':
            sorted.sort((a, b) => a.count - b.count || b.avgTheo - a.avgTheo);
            break;
        case 'count-desc':
            sorted.sort((a, b) => b.count - a.count || b.avgTheo - a.avgTheo);
            break;
        case 'name-az':
            sorted.sort((a, b) => (a.theme || '').localeCompare(b.theme || ''));
            break;
        case 'opportunity':
        default:
            sorted.sort((a, b) => oppScore(b) - oppScore(a));
            break;
    }
    return sorted;
}

async function renderArtRecipes(recipes, globalAvg, artGames) {
    const container = document.getElementById('art-combos-table');
    if (!container) return;

    const artAvg =
        recipes.length > 0
            ? recipes.reduce((s, r) => s + r.avgTheo * r.count, 0) / recipes.reduce((s, r) => s + r.count, 0)
            : globalAvg;
    const avg = artAvg > 0 ? artAvg : globalAvg;

    _recipeCache = { recipes, avg, sortMode: 'opportunity', artGames };
    setupRecipeSortButtons();

    const sorted = sortRecipes(recipes, avg, 'opportunity');
    await renderArtRecipesInner(sorted, avg, container, artGames);
}

async function reRenderRecipes(mode) {
    _recipeCache.sortMode = mode;
    const { recipes, avg, artGames } = _recipeCache;
    const sorted = sortRecipes(recipes, avg, mode);
    const container = document.getElementById('art-combos-table');
    if (!container) return;
    await renderArtRecipesInner(sorted, avg, container, artGames);
}

async function renderArtRecipesInner(sorted, avg, container, artGames) {
    if (!sorted.length) {
        container.innerHTML = '<div class="text-center text-gray-400 dark:text-gray-500 py-8">No recipes found</div>';
        return;
    }

    const INITIAL_SHOW = 10;
    const PAGE_SIZE = 20;
    const maxTheo = Math.max(...sorted.map(r => r.avgTheo), 1);
    const MEDALS = ['🥇', '🥈', '🥉'];

    const trendMap = artGames ? computeArtThemeTrends(artGames) : {};
    const avgRtpMarket = await getAvgRtp(gameData.activeCategory);

    const rows = sorted
        .map((r, i) => {
            const lift = avg > 0 ? ((r.avgTheo - avg) / avg) * 100 : 0;
            const liftColor = lift > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
            const liftBg = lift >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20';
            const liftIcon = lift >= 0 ? '▲' : '▼';
            const barWidth = maxTheo > 0 ? (r.avgTheo / maxTheo) * 100 : 0;
            const opp = calcOppScore(r, avg);
            const isOpp = r.avgTheo > avg && r.count <= 15;
            const barGradient =
                i < 3
                    ? 'from-amber-400 to-orange-500'
                    : lift >= 0
                      ? 'from-indigo-400 to-emerald-400'
                      : 'from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-500';
            const rowBg = i < 3 ? 'bg-gradient-to-r from-amber-50/40 to-transparent dark:from-amber-900/10' : '';

            const rank =
                i < 3
                    ? `<div class="flex flex-col items-center gap-0.5"><span class="text-base leading-none">${MEDALS[i]}</span><span class="text-[9px] font-bold text-amber-600 dark:text-amber-400">#${i + 1}</span></div>`
                    : `<span class="text-xs font-bold text-gray-400 dark:text-gray-500 tabular-nums">#${i + 1}</span>`;

            const trend = trendMap[r.theme];
            const trendBadge =
                trend && trend.direction !== 'stable' && trend.direction !== 'insufficient'
                    ? trend.direction === 'rising'
                        ? `<span class="text-[9px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">▲ Rising</span>`
                        : `<span class="text-[9px] font-medium text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-1.5 py-0.5 rounded-full">▼ Declining</span>`
                    : '';

            const recipeGames = artGames ? artGames.filter(g => F.artTheme(g) === r.theme) : [];
            const domVol = recipeGames.length ? getDominantVolatility(recipeGames) : '';
            const domLayout = recipeGames.length ? getDominantLayout(recipeGames) : '';
            const avgRtp = recipeGames.length ? avgRtpMarket : 0;

            const providerSet = new Set(recipeGames.map(g => F.provider(g)).filter(Boolean));
            const provCount = providerSet.size;
            const riskLevel =
                r.count >= 10 && provCount >= 3 ? 'Low' : r.count >= 5 && provCount >= 2 ? 'Medium' : 'High';
            const riskColor =
                riskLevel === 'Low'
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
                    : riskLevel === 'Medium'
                      ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30'
                      : 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/30';

            const chars = (r.topCharacters || [])
                .filter(c => c && c !== 'No Characters (symbol-only game)')
                .slice(0, 4);
            const elems = (r.topElements || []).slice(0, 5);
            const narr = r.narrative && r.narrative !== 'No Narrative (classic/abstract)' ? r.narrative : '';

            const pipeSep =
                '<span class="inline-block w-px h-3 bg-gray-300 dark:bg-gray-600 mx-1 align-middle"></span>';
            const pill = (label, values, bgCls, textCls) => {
                const display = Array.isArray(values) ? values.map(v => `<span>${v}</span>`).join(pipeSep) : values;
                return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md ${bgCls}"><span class="text-[9px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">${label}</span><span class="text-[11px] font-bold ${textCls}">${display}</span></span>`;
            };

            const specPills = [];
            if (domVol)
                specPills.push(
                    pill(
                        'Volatility',
                        escapeHtml(domVol),
                        'bg-violet-50 dark:bg-violet-900/20',
                        'text-violet-700 dark:text-violet-300'
                    )
                );
            if (domLayout)
                specPills.push(
                    pill(
                        'Layout',
                        escapeHtml(domLayout),
                        'bg-sky-50 dark:bg-sky-900/20',
                        'text-sky-700 dark:text-sky-300'
                    )
                );
            if (avgRtp > 0)
                specPills.push(
                    pill(
                        'RTP',
                        `${avgRtp.toFixed(1)}%`,
                        'bg-orange-50 dark:bg-orange-900/20',
                        'text-orange-700 dark:text-orange-300'
                    )
                );

            const artPills = [];
            if (chars.length)
                artPills.push(
                    pill(
                        'Characters',
                        chars.map(c => escapeHtml(shortLabel(c))),
                        'bg-amber-50 dark:bg-amber-900/20',
                        'text-amber-700 dark:text-amber-300'
                    )
                );
            if (elems.length)
                artPills.push(
                    pill(
                        'Elements',
                        elems.map(e => escapeHtml(shortLabel(e))),
                        'bg-teal-50 dark:bg-teal-900/20',
                        'text-teal-700 dark:text-teal-300'
                    )
                );
            if (narr)
                artPills.push(
                    pill(
                        'Narrative',
                        escapeHtml(shortLabel(narr)),
                        'bg-rose-50 dark:bg-rose-900/20',
                        'text-rose-700 dark:text-rose-300'
                    )
                );

            const hasSpecs = specPills.length > 0;
            const hasArt = artPills.length > 0;
            const SEP = '<span class="text-gray-300 dark:text-gray-600 text-[10px] mx-0.5">·</span>';
            const detailSection =
                hasSpecs || hasArt
                    ? `<div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        ${hasArt ? `<div class="mb-2"><div class="flex flex-wrap items-center gap-1.5">${artPills.join(SEP)}</div></div>` : ''}
                        ${hasSpecs ? `<div class="text-[9px] text-gray-400 dark:text-gray-500">${specPills.map(p => p.replace(/text-\[10px\]/g, 'text-[9px]')).join(' · ')}</div>` : ''}
                    </div>`
                    : '';

            const recipeDims = [];
            recipeDims.push(
                `<div class="flex items-center gap-1.5"><span class="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 w-16 shrink-0">Theme</span><span class="px-2.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-xs font-bold">${escapeHtml(shortLabel(r.theme, 24))}</span></div>`
            );
            if (chars.length)
                recipeDims.push(
                    `<div class="flex items-center gap-1.5"><span class="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 w-16 shrink-0">Characters</span><span class="flex flex-wrap gap-1">${chars.map(c => `<span class="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs font-semibold">${escapeHtml(shortLabel(c, 18))}</span>`).join('')}</span></div>`
                );
            if (elems.length)
                recipeDims.push(
                    `<div class="flex items-center gap-1.5"><span class="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 w-16 shrink-0">Elements</span><span class="flex flex-wrap gap-1">${elems.map(e => `<span class="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 text-xs font-semibold">${escapeHtml(shortLabel(e, 18))}</span>`).join('')}</span></div>`
                );
            if (narr)
                recipeDims.push(
                    `<div class="flex items-center gap-1.5"><span class="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 w-16 shrink-0">Narrative</span><span class="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 text-xs font-semibold">${escapeHtml(shortLabel(narr, 20))}</span></div>`
                );

            const specLine = [domVol, domLayout, avgRtp > 0 ? `RTP ${avgRtp.toFixed(1)}%` : '']
                .filter(Boolean)
                .join(' · ');

            return `<div class="recipe-row group hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors cursor-pointer ${rowBg}" data-xray='${escapeAttr(JSON.stringify({ dimension: 'art_theme', value: r.theme }))}' onclick="${safeOnclick('window.showArtRecipe', r.theme)}">
            <div class="px-5 py-4">
                <div class="flex items-start gap-4">
                    <div class="text-sm font-bold text-gray-400 dark:text-gray-500 w-6 shrink-0 pt-1">${rank}</div>
                    <div class="min-w-0 flex-1">
                        <div class="space-y-1.5 mb-3">${recipeDims.join('')}</div>
                        <div class="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                            <span class="font-medium text-gray-900 dark:text-white">PI: ${r.avgTheo.toFixed(2)}</span>
                            <span>${r.count} games</span>
                            <span class="font-medium ${liftColor}">${liftIcon}${Math.abs(lift).toFixed(0)}% vs avg</span>
                            ${trendBadge}
                            ${isOpp ? '<span class="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full">💎 Opportunity</span>' : ''}
                        </div>
                        ${specLine ? `<div class="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5">${specLine}</div>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
        })
        .join('');

    const beatingMarket = sorted.filter(r => r.avgTheo > avg).length;
    const hasMore = sorted.length > INITIAL_SHOW;
    const SORT_LABELS = {
        opportunity: 'opportunity score',
        'theo-desc': 'avg theo (high → low)',
        'count-asc': 'game count (low → high)',
        'count-desc': 'game count (high → low)',
        'name-az': 'name A–Z',
    };

    container.innerHTML = `
        <div class="divide-y divide-gray-200 dark:divide-gray-700" id="art-recipes-list">${rows}</div>
        ${hasMore ? '<div class="px-3 pt-2 pb-1" id="art-recipes-show-more-wrap"><button id="art-recipes-show-more" class="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium cursor-pointer"></button></div>' : ''}
        <div class="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
            ${sorted.length} recipes · ${beatingMarket} beating art avg (${avg.toFixed(2)}) · sorted by ${SORT_LABELS[_recipeCache.sortMode] || 'opportunity score'}
        </div>`;

    const listEl = document.getElementById('art-recipes-list');
    if (listEl && hasMore) {
        const allRows = listEl.querySelectorAll('.recipe-row');
        let visible = INITIAL_SHOW;
        allRows.forEach((row, idx) => {
            if (idx >= INITIAL_SHOW) row.style.display = 'none';
        });

        const btn = document.getElementById('art-recipes-show-more');
        const updateBtn = () => {
            if (!btn) return;
            const remaining = sorted.length - visible;
            if (remaining <= 0) {
                const wrap = document.getElementById('art-recipes-show-more-wrap');
                if (wrap) wrap.remove();
            } else {
                const next = Math.min(PAGE_SIZE, remaining);
                btn.textContent = `Show ${next} more… (${remaining} remaining)`;
            }
        };
        updateBtn();

        if (btn) {
            btn.addEventListener('click', () => {
                const nextLimit = Math.min(visible + PAGE_SIZE, sorted.length);
                for (let j = visible; j < nextLimit; j++) {
                    if (allRows[j]) allRows[j].style.display = '';
                }
                visible = nextLimit;
                updateBtn();
            });
        }
    }
}

function setupRecipeSortButtons() {
    const sel = document.getElementById('art-recipe-sort');
    if (!sel) return;
    sel.addEventListener('change', () => {
        void reRenderRecipes(sel.value);
    });
}

// ── Art Theme Trends ──

function computeArtThemeTrends(artGames) {
    const now = new Date().getFullYear();
    const recentCutoff = now - 2;
    const byEnv = {};
    for (const g of artGames) {
        const env = F.artTheme(g);
        const yr = F.releaseYear(g);
        if (!env || !yr || yr < 2000) continue;
        if (!byEnv[env]) byEnv[env] = { recent: 0, older: 0, total: 0 };
        byEnv[env].total++;
        if (yr >= recentCutoff) byEnv[env].recent++;
        else byEnv[env].older++;
    }
    const totalRecent = Object.values(byEnv).reduce((s, e) => s + e.recent, 0) || 1;
    const totalOlder = Object.values(byEnv).reduce((s, e) => s + e.older, 0) || 1;
    const result = {};
    for (const [env, d] of Object.entries(byEnv)) {
        if (d.total < 5) {
            result[env] = { direction: 'insufficient', recentPct: 0, olderPct: 0, change: 0, total: d.total };
            continue;
        }
        const recentPct = d.recent / totalRecent;
        const olderPct = d.older / totalOlder;
        const ratio = olderPct > 0 ? recentPct / olderPct : recentPct > 0 ? 2 : 1;
        const change = (ratio - 1) * 100;
        let direction = 'stable';
        if (ratio >= 1.2) direction = 'rising';
        else if (ratio <= 0.8) direction = 'declining';
        result[env] = { direction, recentPct, olderPct, change, total: d.total };
    }
    return result;
}

// ── Provider Art Specialization ──

// ── Opportunity Gaps ──

function renderOpportunityGaps(artGames, globalAvg, themes, narratives, characters, elements, colorTones) {
    const container = document.getElementById('art-opportunity-gaps');
    if (!container) return;

    const artAvg = artGames.length > 0 ? artGames.reduce((s, g) => s + F.theoWin(g), 0) / artGames.length : globalAvg;

    const dimSources = [
        { label: 'Theme', metrics: themes, nameKey: 'theme', handler: 'showArtTheme' },
        {
            label: 'Character',
            metrics: characters.filter(c => c.character !== 'No Characters (symbol-only game)'),
            nameKey: 'character',
            handler: 'showArtCharacter',
        },
        { label: 'Element', metrics: elements, nameKey: 'element', handler: 'showArtElement' },
        { label: 'Color', metrics: colorTones, nameKey: 'colorTone', handler: 'showArtColor' },
        {
            label: 'Narrative',
            metrics: narratives,
            nameKey: 'narrative',
            handler: 'showArtNarrative',
        },
    ];

    const totalGames = artGames.length;
    const gaps = [];
    for (const dim of dimSources) {
        for (const m of dim.metrics) {
            const lift = artAvg > 0 ? (m.avgTheo / artAvg - 1) * 100 : 0;
            const penetration = totalGames > 0 ? (m.count / totalGames) * 100 : 0;
            const isUnderserved = m.count >= 3 && penetration < 5;
            const isHighPerf = lift > 5;
            if (isUnderserved && isHighPerf) {
                const oppScore = lift * (1 + (5 - penetration) / 5);
                gaps.push({
                    dimension: dim.label,
                    value: m[dim.nameKey],
                    count: m.count,
                    avgTheo: m.avgTheo,
                    handler: dim.handler,
                    lift,
                    penetration,
                    oppScore,
                });
            }
        }
    }

    gaps.sort((a, b) => b.oppScore - a.oppScore);
    const top = gaps.slice(0, 20);

    if (!top.length) {
        container.innerHTML = '<p class="text-xs text-gray-400">No opportunity gaps detected</p>';
        return;
    }

    const byDim = {};
    top.forEach(g => {
        if (!byDim[g.dimension]) byDim[g.dimension] = [];
        byDim[g.dimension].push(g);
    });

    let html = '';
    for (const [dim, items] of Object.entries(byDim)) {
        html += `<div class="mb-4 last:mb-0">
            <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">${escapeHtml(dim)}</div>
            <div class="flex flex-wrap gap-2">`;
        for (const g of items) {
            const liftSign = g.lift > 0 ? '+' : '';
            html += `<div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors" onclick="${safeOnclick('window.' + g.handler, g.value)}">
                <span class="text-xs font-semibold text-gray-800 dark:text-gray-200">${escapeHtml(shortLabel(g.value))}</span>
                <span class="text-[9px] text-gray-500 dark:text-gray-400">${g.count} games</span>
                <span class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">${liftSign}${g.lift.toFixed(0)}%</span>
                <span class="text-[9px] px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium">💎</span>
            </div>`;
        }
        html += '</div></div>';
    }

    container.innerHTML = html;
}

// ── Top Performing Combos ──

async function renderTopCombos(artGames, globalAvg) {
    const container = document.getElementById('art-top-combos');
    if (!container) return;

    const [themeElem, themeChar] = await Promise.all([
        getArtComboMetrics(gameData.activeCategory, { dimA: 'theme', dimB: 'elements', minGames: 5 }),
        getArtComboMetrics(gameData.activeCategory, { dimA: 'theme', dimB: 'characters', minGames: 5 }),
    ]);
    const artAvg = artGames.length > 0 ? artGames.reduce((s, g) => s + F.theoWin(g), 0) / artGames.length : globalAvg;

    const charByTheme = {};
    themeChar.forEach(c => {
        if (!charByTheme[c.dimA] || c.count > charByTheme[c.dimA].count) charByTheme[c.dimA] = c;
    });

    const enriched = themeElem.map(c => ({
        theme: c.dimA,
        element: c.dimB,
        character: charByTheme[c.dimA]?.dimB || null,
        count: c.count,
        avgTheo: c.avgTheo,
    }));
    const sorted = enriched.sort((a, b) => b.avgTheo - a.avgTheo).slice(0, 10);

    if (!sorted.length) {
        container.innerHTML = '<p class="text-xs text-gray-400">Not enough data</p>';
        return;
    }

    let html = '<table class="w-full text-xs">';
    html += '<thead><tr class="border-b border-gray-200 dark:border-gray-700">';
    html += '<th class="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-semibold">#</th>';
    html += '<th class="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-semibold">Theme</th>';
    html += '<th class="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-semibold">Character</th>';
    html += '<th class="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-semibold">Element</th>';
    html += '<th class="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-semibold">Games</th>';
    html += '<th class="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-semibold">Avg PI</th>';
    html += '<th class="text-right py-2 px-2 text-gray-500 dark:text-gray-400 font-semibold">Lift</th>';
    html += '</tr></thead><tbody>';

    sorted.forEach((c, i) => {
        const lift = artAvg > 0 ? (c.avgTheo / artAvg - 1) * 100 : 0;
        const liftColor = lift >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400';
        const liftSign = lift >= 0 ? '+' : '';
        const charCell = c.character
            ? `<span class="text-gray-600 dark:text-gray-300">${escapeHtml(shortLabel(c.character))}</span>`
            : '<span class="text-gray-300 dark:text-gray-600">—</span>';
        html += `<tr class="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onclick="${safeOnclick('window.showArtCombo', c.theme, c.element)}">
            <td class="py-2 px-2 text-gray-400 dark:text-gray-500 font-bold">${i + 1}</td>
            <td class="py-2 px-2 font-semibold text-gray-800 dark:text-gray-200">${escapeHtml(shortLabel(c.theme))}</td>
            <td class="py-2 px-2">${charCell}</td>
            <td class="py-2 px-2 text-gray-600 dark:text-gray-300">${escapeHtml(shortLabel(c.element))}</td>
            <td class="py-2 px-2 text-right tabular-nums text-gray-700 dark:text-gray-300">${c.count}</td>
            <td class="py-2 px-2 text-right font-bold tabular-nums text-gray-900 dark:text-white">${c.avgTheo.toFixed(2)}</td>
            <td class="py-2 px-2 text-right font-bold tabular-nums ${liftColor}">${liftSign}${lift.toFixed(0)}%</td>
        </tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

async function renderProviderArtCards(artGames, globalAvg) {
    const container = document.getElementById('art-provider-cards');
    if (!container) return;

    const providerRows = await getProviderMetrics(gameData.activeCategory, { minGames: 3 });
    const providers = providerRows.slice(0, 8);
    if (!providers.length) {
        container.innerHTML = '<p class="text-xs text-gray-400 dark:text-gray-500">Not enough data</p>';
        return;
    }

    const artAvg = artGames.length > 0 ? artGames.reduce((s, g) => s + F.theoWin(g), 0) / artGames.length : globalAvg;

    const cards = providers.map(p => {
        const provGames = artGames.filter(g => F.provider(g) === p.name);
        const envMap = {};
        const colorMap = {};
        for (const g of provGames) {
            const env = F.artTheme(g);
            if (env) {
                if (!envMap[env]) envMap[env] = { count: 0, theoSum: 0 };
                envMap[env].count++;
                envMap[env].theoSum += F.theoWin(g);
            }
            const tones = F.artColorTone(g);
            if (Array.isArray(tones))
                tones.forEach(t => {
                    if (t) colorMap[t] = (colorMap[t] || 0) + 1;
                });
            else if (tones) colorMap[tones] = (colorMap[tones] || 0) + 1;
        }
        const bestEnv = Object.entries(envMap)
            .filter(([, d]) => d.count >= 2)
            .sort((a, b) => b[1].theoSum / b[1].count - a[1].theoSum / a[1].count)[0];
        const topColors = Object.entries(colorMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
        const avgTheo = p.avgTheo;
        const lift = artAvg > 0 ? ((avgTheo / artAvg - 1) * 100).toFixed(0) : '0';
        const liftNum = Number(lift);
        const topGame = [...provGames].sort((a, b) => F.theoWin(b) - F.theoWin(a))[0];
        const envCount = Object.keys(envMap).length;

        return { name: p.name, count: p.count, avgTheo, lift: liftNum, bestEnv, topColors, topGame, envCount };
    });

    const html = cards
        .map(c => {
            const liftColor =
                c.lift > 10
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : c.lift < -10
                      ? 'text-red-500 dark:text-red-400'
                      : 'text-gray-600 dark:text-gray-400';
            const liftSign = c.lift > 0 ? '+' : '';
            const bestEnvName = c.bestEnv ? c.bestEnv[0] : '—';
            const bestEnvTheo = c.bestEnv ? (c.bestEnv[1].theoSum / c.bestEnv[1].count).toFixed(1) : '—';
            const topGameName = c.topGame?.name || '—';
            const colorsPills = c.topColors
                .map(
                    ([name]) =>
                        `<span class="text-[9px] px-1 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">${escapeHtml(shortLabel(name))}</span>`
                )
                .join(' ');

            return `<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow cursor-pointer" data-xray='${escapeAttr(JSON.stringify({ dimension: 'art_theme', value: bestEnvName }))}' onclick="${safeOnclick('window.showArtTheme', bestEnvName)}">
                <div class="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-bold text-gray-900 dark:text-white truncate">${escapeHtml(c.name)}</span>
                        <span class="text-[10px] px-2 py-0.5 rounded-full bg-white/70 dark:bg-gray-800/70 text-gray-600 dark:text-gray-400 font-medium">${c.count} games</span>
                    </div>
                </div>
                <div class="px-4 py-3 space-y-2.5">
                    <div class="flex items-center justify-between">
                        <span class="text-[10px] text-gray-400 dark:text-gray-500">Avg Theo</span>
                        <div class="flex items-center gap-1.5">
                            <span class="text-xs font-bold text-gray-900 dark:text-white tabular-nums">${c.avgTheo.toFixed(1)}</span>
                            <span class="text-[10px] font-semibold ${liftColor}">${liftSign}${c.lift}%</span>
                        </div>
                    </div>
                    <div class="flex items-center justify-between">
                        <span class="text-[10px] text-gray-400 dark:text-gray-500">Best Env</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium truncate max-w-[120px]">${escapeHtml(shortLabel(bestEnvName))} <span class="text-gray-400">(${bestEnvTheo})</span></span>
                    </div>
                    ${colorsPills ? `<div class="flex items-center justify-between"><span class="text-[10px] text-gray-400 dark:text-gray-500">Colors</span><div class="flex flex-wrap gap-0.5">${colorsPills}</div></div>` : ''}
                    <div class="flex items-center justify-between">
                        <span class="text-[10px] text-gray-400 dark:text-gray-500">Diversity</span>
                        <span class="text-[10px] text-gray-600 dark:text-gray-400 font-medium">${c.envCount} themes</span>
                    </div>
                    <div class="pt-1 border-t border-gray-100 dark:border-gray-700">
                        <div class="text-[9px] text-gray-400 dark:text-gray-500 truncate">Top: ${escapeHtml(topGameName)}</div>
                    </div>
                </div>
            </div>`;
        })
        .join('');

    container.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">${html}</div>`;
}

// ── Strategic Art Recommendations (Build Next / Avoid / Watch) ──

function enrichRecipe(r, artGames, avg) {
    const games = artGames.filter(g => F.artTheme(g) === r.theme);
    const provArr = Object.entries(
        games.reduce((m, g) => {
            const p = F.provider(g);
            if (p) m[p] = (m[p] || 0) + 1;
            return m;
        }, {})
    ).sort((a, b) => b[1] - a[1]);
    const topGame = [...games].sort((a, b) => F.theoWin(b) - F.theoWin(a))[0];
    const lift = avg > 0 ? ((r.avgTheo / avg - 1) * 100).toFixed(0) : '0';
    return {
        ...r,
        provCount: provArr.length,
        dominantProvider: provArr[0]?.[0] || '',
        topGameName: topGame?.name || '',
        lift,
    };
}

function renderCardItem(c, color, clickAction) {
    const colors = {
        emerald: {
            hover: 'hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10',
            title1: 'text-emerald-700 dark:text-emerald-400',
            title2: 'text-indigo-700 dark:text-indigo-400',
            badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
            theo: 'text-emerald-600 dark:text-emerald-400',
            pill: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
            provPill: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
        },
        red: {
            hover: 'hover:bg-red-50/50 dark:hover:bg-red-900/10',
            title1: 'text-red-700 dark:text-red-400',
            title2: 'text-red-600 dark:text-red-400',
            badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
            theo: 'text-red-600 dark:text-red-400',
            pill: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300',
            provPill: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300',
        },
        amber: {
            hover: 'hover:bg-amber-50/50 dark:hover:bg-amber-900/10',
            title1: 'text-amber-700 dark:text-amber-400',
            title2: 'text-amber-600 dark:text-amber-400',
            badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
            theo: 'text-amber-600 dark:text-amber-400',
            pill: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300',
            provPill: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300',
        },
    };
    const s = colors[color];
    const liftNum = Number(c.lift);
    const liftSign = liftNum >= 0 ? '+' : '';

    return `<div class="space-y-0.5 cursor-pointer ${s.hover} rounded-lg px-2 py-1.5 -mx-2 transition-colors" data-xray='${escapeAttr(JSON.stringify({ dimension: 'art_theme', value: c.theme }))}' onclick="${clickAction}">
        <div class="flex items-center justify-between gap-2">
            <div class="min-w-0"><div class="text-xs font-semibold text-gray-900 dark:text-white truncate"><span class="${s.title1}">${escapeHtml(shortLabel(c.theme))}</span></div></div>
            <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-[10px] px-1.5 py-0.5 rounded ${s.badge} font-medium">${c.count} games</span>
                <span class="text-[10px] font-bold ${s.theo}">${c.avgTheo.toFixed(1)} avg theo</span>
            </div>
        </div>
        <div class="flex flex-wrap gap-1 mt-1">
            <span class="text-[9px] px-1 py-0.5 rounded ${s.pill}">📊 ${liftSign}${c.lift}% vs avg</span>
            ${c.narrative ? `<span class="text-[9px] px-1 py-0.5 rounded ${s.pill}">📜 ${escapeHtml(shortLabel(c.narrative))}</span>` : ''}
            ${c.dominantProvider ? `<span class="text-[9px] px-1 py-0.5 rounded ${s.provPill}">🏢 ${escapeHtml(c.dominantProvider)}</span>` : ''}
            ${c.provCount > 1 ? `<span class="text-[9px] px-1 py-0.5 rounded ${s.pill}">🌐 ${c.provCount} providers</span>` : ''}
        </div>
        ${c.topGameName ? `<div class="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">e.g. ${escapeHtml(c.topGameName)}</div>` : ''}
    </div>`;
}

async function renderArtStrategicCards(artGames, globalAvg) {
    const recipes = await getArtRecipeMetrics(gameData.activeCategory, { minGames: 2 });
    const artAvg = artGames.length > 0 ? artGames.reduce((s, g) => s + F.theoWin(g), 0) / artGames.length : globalAvg;
    const avg = artAvg;

    const buildNextDiv = document.getElementById('art-build-next');
    const avoidDiv = document.getElementById('art-avoid');
    const watchDiv = document.getElementById('art-watch');

    if (buildNextDiv) {
        const opps = recipes
            .filter(r => r.avgTheo > avg && r.count <= 20)
            .map(r => ({
                ...enrichRecipe(r, artGames, avg),
                oppScore: (r.avgTheo / avg) * (1 / Math.sqrt(r.count)),
            }))
            .sort((a, b) => b.oppScore - a.oppScore)
            .slice(0, 5);

        buildNextDiv.innerHTML = opps.length
            ? opps.map(c => renderCardItem(c, 'emerald', safeOnclick('window.showArtTheme', c.theme))).join('')
            : '<p class="text-xs text-gray-400">No opportunities detected</p>';
    }

    if (avoidDiv) {
        const avoid = recipes
            .filter(r => r.avgTheo < avg * 0.9 && r.count >= 5)
            .map(r => enrichRecipe(r, artGames, avg))
            .sort((a, b) => a.avgTheo - b.avgTheo)
            .slice(0, 5);

        avoidDiv.innerHTML = avoid.length
            ? avoid.map(c => renderCardItem(c, 'red', safeOnclick('window.showArtTheme', c.theme))).join('')
            : '<p class="text-xs text-gray-400">No underperformers</p>';
    }

    if (watchDiv) {
        const themes = await getArtThemeMetrics(gameData.activeCategory);
        const watch = themes
            .filter(s => s.count >= 2 && s.count <= 15 && s.avgTheo > avg)
            .map(s => {
                const themeGames = artGames.filter(g => F.artTheme(g) === s.theme);
                const provArr = Object.entries(
                    themeGames.reduce((m, g) => {
                        const p = F.provider(g);
                        if (p) m[p] = (m[p] || 0) + 1;
                        return m;
                    }, {})
                ).sort((a, b) => b[1] - a[1]);
                const topGame = [...themeGames].sort((a, b) => F.theoWin(b) - F.theoWin(a))[0];
                const lift = ((s.avgTheo / avg - 1) * 100).toFixed(0);
                return {
                    theme: s.theme,
                    count: s.count,
                    avgTheo: s.avgTheo,
                    narrative: '',
                    provCount: provArr.length,
                    dominantProvider: provArr[0]?.[0] || '',
                    topGameName: topGame?.name || '',
                    lift,
                    score: s.avgTheo / avg,
                };
            })
            .filter(s => s.provCount >= 2)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        watchDiv.innerHTML = watch.length
            ? watch.map(s => renderCardItem(s, 'amber', safeOnclick('window.showArtTheme', s.theme))).join('')
            : '<p class="text-xs text-gray-400">No emerging themes</p>';
    }
}
