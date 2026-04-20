import { Chart } from '../chart-setup.js';
import { getActiveGames } from '../../lib/data.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../../lib/sanitize.js';
import { F } from '../../lib/game-fields.js';
import {
    getArtThemeMetrics,
    getArtMoodMetrics,
    getArtNarrativeMetrics,
    getArtCharacterMetrics,
    getArtElementMetrics,
    getArtStyleMetrics,
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
    needsLeaderLine,
    snapLabelToBubble,
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

const MOOD_PALETTE = [
    '#8b5cf6',
    '#0ea5e9',
    '#ec4899',
    '#ef4444',
    '#f59e0b',
    '#14b8a6',
    '#eab308',
    '#3b82f6',
    '#f472b6',
    '#6b7280',
    '#22c55e',
    '#7c3aed',
    '#f97316',
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
            dims.push({ label: 'Themes', items: sorted, clickFn: 'window.showArtTheme', dim: 'art_theme' });
    }

    if (excludeDimension !== 'mood') {
        const map = {};
        games.forEach(g => {
            const v = F.artMood(g);
            if (v) map[v] = (map[v] || 0) + 1;
        });
        const sorted = Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
        if (sorted.length) dims.push({ label: 'Moods', items: sorted, clickFn: 'window.showArtMood', dim: 'art_mood' });
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
            dims.push({ label: 'Elements', items: sorted, clickFn: 'window.showArtElement', dim: 'art_elements' });
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
                clickFn: 'window.showArtNarrative',
                dim: 'art_narrative',
            });
    }

    if (excludeDimension !== 'style') {
        const map = {};
        games.forEach(g => {
            const v = F.artStyle(g);
            if (v) map[v] = (map[v] || 0) + 1;
        });
        const sorted = Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
        if (sorted.length)
            dims.push({ label: 'Styles', items: sorted, clickFn: 'window.showArtStyle', dim: 'art_style' });
    }

    if (excludeDimension !== 'colorTone') {
        const map = {};
        games.forEach(g => {
            const v = F.artColorTone(g);
            if (v) map[v] = (map[v] || 0) + 1;
        });
        const sorted = Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
        if (sorted.length)
            dims.push({
                label: 'Color tones',
                items: sorted,
                clickFn: 'window.showArtColorTone',
                dim: 'art_color_tone',
            });
    }

    if (!dims.length) return '';

    return dims
        .map(
            d => `
        <div class="mb-3 last:mb-0">
            <div class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">${d.label}</div>
            <div class="flex flex-wrap gap-1.5">${d.items
                .map(([name, count]) => {
                    const pct = ((count / total) * 100).toFixed(0);
                    return `<span class="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors" data-xray='${escapeAttr(JSON.stringify({ dimension: d.dim, value: name }))}' onclick="${safeOnclick(d.clickFn, name)}">${escapeHtml(name)} <span class="text-[9px] text-gray-400">${count} · ${pct}%</span></span>`;
                })
                .join('')}</div>
        </div>
    `
        )
        .join('');
}

function showArtFilteredGames(title, filterFn, opts) {
    const allGames = getActiveGames();
    const games = allGames.filter(filterFn).sort((a, b) => F.theoWin(b) - F.theoWin(a));
    const globalAvg = getGlobalAvgTheo(allGames);
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

window.showArtTheme = function (setting) {
    showArtFilteredGames(`Theme: ${setting}`, g => F.artTheme(g) === setting, { excludeDimension: 'theme' });
};
window.showArtMood = function (mood) {
    showArtFilteredGames(`Mood: ${mood}`, g => F.artMood(g) === mood, { excludeDimension: 'mood' });
};
window.showArtCharacter = function (character) {
    showArtFilteredGames(`Character: ${character}`, g => F.artCharacters(g).includes(character), {
        excludeDimension: 'character',
    });
};
window.showArtElement = function (element) {
    showArtFilteredGames(`Element: ${element}`, g => F.artElements(g).includes(element), {
        excludeDimension: 'element',
    });
};
window.showArtNarrative = function (narrative) {
    showArtFilteredGames(`Narrative: ${narrative}`, g => F.artNarrative(g) === narrative, {
        excludeDimension: 'narrative',
    });
};
window.showArtStyle = function (style) {
    showArtFilteredGames(`Style: ${style}`, g => F.artStyle(g) === style, { excludeDimension: 'style' });
};
window.showArtColorTone = function (tone) {
    showArtFilteredGames(`Color tone: ${tone}`, g => F.artColorTone(g) === tone, {
        excludeDimension: 'colorTone',
    });
};
window.showArtRecipe = function (setting, mood) {
    showArtFilteredGames(`${setting} + ${mood}`, g => F.artTheme(g) === setting && F.artMood(g) === mood);
};

export function renderArt() {
    const allGames = getActiveGames();
    const artGames = allGames.filter(g => F.artTheme(g));

    const themes = getArtThemeMetrics(artGames);
    const moods = getArtMoodMetrics(artGames);
    const narratives = getArtNarrativeMetrics(artGames);
    const characters = getArtCharacterMetrics(artGames);
    const elements = getArtElementMetrics(artGames);
    const styles = getArtStyleMetrics(artGames);
    const colorTones = getArtColorToneMetrics(artGames);
    const recipes = getArtRecipeMetrics(artGames, { minGames: 3 });
    const globalAvg = getGlobalAvgTheo(allGames);

    renderStats(allGames, artGames, themes, moods, styles, colorTones);
    renderThemeLandscape(themes, globalAvg);
    wireMoodDropdown(artGames, moods, globalAvg);
    renderThemesChart(themes, artGames);
    renderMoodChart(moods);
    renderArtStylesChart(styles);
    renderArtColorToneChart(colorTones);
    renderCharactersChart(characters);
    renderElementsChart(elements);
    renderNarrativeChart(narratives);
    renderArtTrends(artGames);
    renderBlueOcean(artGames, globalAvg);
    renderArtRecipes(recipes, globalAvg, artGames);
    renderProviderArtCards(artGames, globalAvg);
    renderArtStrategicCards(artGames, globalAvg);
}

function renderStats(allGames, artGames, themes, moods, styles, colorTones) {
    const pct = allGames.length > 0 ? ((artGames.length / allGames.length) * 100).toFixed(1) : '0';
    const avgTheo = artGames.length > 0 ? artGames.reduce((s, g) => s + F.theoWin(g), 0) / artGames.length : 0;

    const el = id => document.getElementById(id);
    const set = (id, val) => {
        const e = el(id);
        if (e) e.textContent = val;
    };

    set('art-stat-coverage', `${artGames.length} (${pct}%)`);
    set('art-stat-themes', themes.length);
    set('art-stat-moods', moods.length);
    set('art-stat-avg-theo', avgTheo.toFixed(2));
    set('art-stat-styles', styles.length);
    set('art-stat-color-tones', colorTones.length);

    const sub = el('art-subtitle');
    if (sub) {
        sub.textContent = `Visual design analysis across ${artGames.length} classified games — ${themes.length} themes, ${moods.length} moods, ${styles.length} styles, ${colorTones.length} color tones`;
    }
}

// ── Art Landscape bubble chart (mirrors Theme Landscape pattern) ──

function renderThemeLandscape(themes, globalAvg) {
    destroyChart('opportunity');
    const canvas = document.getElementById('art-opportunity-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chartColors = getChartColors();

    if (!themes.length) return;

    const xVals = themes.map(s => s.count);
    const yVals = themes.map(s => s.avgTheo);
    const rawMedX = median(xVals);
    const rawMedY = median(yVals);

    const maxCount = Math.max(...xVals, 1);
    const rMin = 6;
    const rMax = 40;

    const sqrtY = v => Math.sqrt(Math.max(0, v));

    // X-axis warp: log10 + piecewise stretch (data-driven percentiles)
    const logX = v => Math.log10(Math.max(1, v));
    const logXVals = xVals.map(logX);
    const sortedLogX = [...logXVals].sort((a, b) => a - b);
    const WX_LO = sortedLogX[Math.floor(sortedLogX.length * 0.2)] || 1.0;
    const WX_HI = sortedLogX[Math.floor(sortedLogX.length * 0.8)] || 2.0;
    const WX_K = 2.5;
    const WX_SPAN = (WX_HI - WX_LO) * WX_K;
    const warpX = lv => {
        if (lv <= WX_LO) return lv;
        if (lv <= WX_HI) return WX_LO + (lv - WX_LO) * WX_K;
        return WX_LO + WX_SPAN + (lv - WX_HI);
    };
    const unwarpX = wv => {
        if (wv <= WX_LO) return wv;
        const warpedHi = WX_LO + WX_SPAN;
        if (wv <= warpedHi) return WX_LO + (wv - WX_LO) / WX_K;
        return WX_HI + (wv - warpedHi);
    };

    // Y-axis warp: sqrt + piecewise stretch (data-driven percentiles)
    const sqrtVals = yVals.map(sqrtY);
    const sortedSqrt = [...sqrtVals].sort((a, b) => a - b);
    const WY_LO = sortedSqrt.length ? sortedSqrt[Math.floor(sortedSqrt.length * 0.2)] : 0.3;
    const WY_HI = sortedSqrt.length ? sortedSqrt[Math.floor(sortedSqrt.length * 0.8)] : 0.8;
    const WY_K = 3.0;
    const WY_SPAN = (WY_HI - WY_LO) * WY_K;
    const warpY = sv => {
        if (sv <= WY_LO) return sv;
        if (sv <= WY_HI) return WY_LO + (sv - WY_LO) * WY_K;
        return WY_LO + WY_SPAN + (sv - WY_HI);
    };
    const unwarpY = wv => {
        if (wv <= WY_LO) return wv;
        const warpedHi = WY_LO + WY_SPAN;
        if (wv <= warpedHi) return WY_LO + (wv - WY_LO) / WY_K;
        return WY_HI + (wv - warpedHi);
    };

    const medX = warpX(logX(rawMedX));
    const warpedMedY = warpY(sqrtY(rawMedY));

    const quadrantColor = (wy, wx) => {
        if (wy >= warpedMedY && wx < medX) return { bg: 'rgba(16,185,129,', border: 'rgba(16,185,129,' };
        if (wy >= warpedMedY && wx >= medX) return { bg: 'rgba(99,102,241,', border: 'rgba(99,102,241,' };
        if (wy < warpedMedY && wx < medX) return { bg: 'rgba(100,116,139,', border: 'rgba(100,116,139,' };
        return { bg: 'rgba(239,68,68,', border: 'rgba(239,68,68,' };
    };
    const quadrantName = (wy, wx) => {
        if (wy >= warpedMedY) return wx < medX ? '💎 Opportunity' : '🏆 Leader';
        return wx < medX ? '🔍 Niche' : '⚠️ Saturated';
    };

    const bubbleData = themes.map(s => ({
        x: warpX(logX(s.count)),
        y: warpY(sqrtY(s.avgTheo)),
        r: rMin + Math.sqrt(s.count / maxCount) * (rMax - rMin),
        yOrig: s.avgTheo,
        theme: s.theme,
        _label: s.theme,
        count: s.count,
    }));

    const bubbleLabels = themes.map(s => shortLabel(s.theme));
    const bgColors = bubbleData.map(d => quadrantColor(d.y, d.x).bg + '0.45)');
    const borderColors = bubbleData.map(d => quadrantColor(d.y, d.x).border + '0.7)');

    const truncName = (name, max = 18) => (name.length > max ? name.slice(0, max - 1) + '…' : name);

    // Quadrant plugin (inline, like Theme Landscape)
    const quadrantPlugin = {
        id: 'artLandscapeQuadrants',
        beforeDatasetsDraw(chart) {
            const {
                ctx: c,
                chartArea: { left, right, top, bottom },
                scales: { x: xScale, y: yScale },
            } = chart;
            const mx = xScale.getPixelForValue(medX);
            const my = yScale.getPixelForValue(warpedMedY);
            c.save();
            c.setLineDash([5, 4]);
            c.lineWidth = 1;
            c.strokeStyle = chartColors.gridColor || 'rgba(148,163,184,0.4)';
            c.beginPath();
            c.moveTo(mx, top);
            c.lineTo(mx, bottom);
            c.stroke();
            c.beginPath();
            c.moveTo(left, my);
            c.lineTo(right, my);
            c.stroke();
            c.setLineDash([]);
            c.restore();
        },
        afterDatasetsDraw(chart) {
            const {
                ctx: c,
                chartArea: { left, right, top, bottom },
            } = chart;
            const pad = 8;
            c.save();
            c.font = 'bold 10px Inter, system-ui, sans-serif';
            c.globalAlpha = 0.55;
            c.fillStyle = 'rgb(16,185,129)';
            c.textAlign = 'left';
            c.textBaseline = 'top';
            c.fillText('💎 Opportunity', left + pad, top + pad);
            c.fillStyle = 'rgb(99,102,241)';
            c.textAlign = 'right';
            c.textBaseline = 'top';
            c.fillText('🏆 Leaders', right - pad, top + pad);
            c.fillStyle = 'rgb(156,163,175)';
            c.textAlign = 'left';
            c.textBaseline = 'bottom';
            c.fillText('🔍 Niche', left + pad, bottom - pad);
            c.fillStyle = 'rgb(239,68,68)';
            c.textAlign = 'right';
            c.textBaseline = 'bottom';
            c.fillText('⚠️ Saturated', right - pad, bottom - pad);
            c.restore();
        },
    };

    // Inline label plugin with hit-box tracking (mirrors Theme Landscape)
    let labelHitBoxes = [];
    let cachedLabels = null;
    let lastPosKey = null;

    const bubbleLabelPlugin = {
        id: 'artBubbleLabels',
        afterDatasetsDraw(chart) {
            const { ctx: c, chartArea } = chart;
            c.save();
            const isDark = document.documentElement.classList.contains('dark');
            const labelColor = isDark ? '#94a3b8' : '#64748b';

            const hasActiveHover = chart.getActiveElements().length > 0;
            const meta0 = chart.getDatasetMeta(0);
            const posKey = meta0.data.map(el => `${el.x.toFixed(0)},${el.y.toFixed(0)}`).join('|');
            const positionsChanged = posKey !== lastPosKey;
            const shouldRecalc = !cachedLabels || (!hasActiveHover && positionsChanged);

            if (shouldRecalc) {
                lastPosKey = posKey;

                const areaW = chartArea.right - chartArea.left;
                const areaH = chartArea.bottom - chartArea.top;
                const fontSize = 10;
                const fontStr = `600 ${fontSize}px Inter, system-ui, sans-serif`;
                c.font = fontStr;

                const labs = [];
                const ancs = [];
                const labMeta = [];
                const midX = chartArea.left + areaW / 2;
                const midY = chartArea.top + areaH / 2;

                meta0.data.forEach((pt, i) => {
                    const label = truncName(bubbleLabels[i]);
                    if (!label) return;
                    const pxR = pt.options?.radius ?? bubbleData[i]?.r ?? 12;
                    const tw = c.measureText(label).width;
                    const th = fontSize + 2;

                    const ang = Math.atan2(pt.y - midY, pt.x - midX);
                    const offX = Math.cos(ang) * (pxR + 8);
                    const offY = Math.sin(ang) * (pxR + 8);
                    let ix = pt.x + offX - tw / 2;
                    let iy = pt.y + offY - th / 2;
                    ix = Math.max(chartArea.left, Math.min(chartArea.right - tw, ix));
                    iy = Math.max(chartArea.top, Math.min(chartArea.bottom - th, iy));

                    labs.push({ x: ix, y: iy, width: tw, height: th });
                    ancs.push({ x: pt.x, y: pt.y, r: pxR });
                    labMeta.push({ label, index: i, leaderColor: borderColors[i] });
                });

                saLabelSolver(labs, ancs, areaW, areaH, chartArea.left, chartArea.top);

                const hitBoxes = [];
                const entries = [];
                const leaderThreshold = 15;

                for (let k = 0; k < labs.length; k++) {
                    const l = labs[k];
                    const a = ancs[k];
                    const meta = labMeta[k];
                    const dist = Math.hypot(l.x + l.width / 2 - a.x, l.y + l.height / 2 - a.y);
                    const showLeader = needsLeaderLine(dist, leaderThreshold, k, ancs);

                    if (!showLeader && dist > a.r + 6) {
                        snapLabelToBubble(l, a, chartArea);
                    }

                    const rect = { x1: l.x, x2: l.x + l.width, y1: l.y, y2: l.y + l.height };
                    hitBoxes.push({ rect, index: meta.index });
                    entries.push({
                        label: meta.label,
                        rect,
                        fs: fontStr,
                        key: `0:${meta.index}`,
                        dx: l.x + l.width / 2,
                        dy: l.y + l.height / 2,
                        al: 'center',
                        bl: 'middle',
                        leader: showLeader,
                        bx: a.x,
                        by: a.y,
                        br: a.r,
                        leaderColor: meta.leaderColor,
                    });
                }

                labelHitBoxes = hitBoxes;
                cachedLabels = entries;
            }

            const highlightColor = isDark ? '#e2e8f0' : '#1e293b';
            const bgColor = isDark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.88)';

            cachedLabels.forEach(entry => {
                if (!entry.leader) return;
                const isHovered = hoveredLabelKey === entry.key;
                const r = entry.rect;
                const nearX = (r.x1 + r.x2) / 2;
                const nearY = (r.y1 + r.y2) / 2;
                const lc = isHovered ? highlightColor : entry.leaderColor;
                c.save();
                c.strokeStyle = lc;
                c.lineWidth = 1.5;
                c.setLineDash([4, 3]);
                c.beginPath();
                c.moveTo(entry.bx, entry.by);
                c.lineTo(nearX, nearY);
                c.stroke();
                c.setLineDash([]);
                c.restore();
            });

            cachedLabels.forEach(entry => {
                const r = entry.rect;
                c.fillStyle = bgColor;
                c.fillRect(r.x1 - 2, r.y1 - 1, r.x2 - r.x1 + 4, r.y2 - r.y1 + 2);
            });
            cachedLabels.forEach(entry => {
                const isHovered = hoveredLabelKey === entry.key;
                if (isHovered) {
                    const boldFont = entry.fs
                        .replace(/\d+px/, m => Math.min(parseInt(m) + 1, 13) + 'px')
                        .replace(/^(bold|\d{3})\s/, '700 ');
                    c.font = boldFont;
                    c.fillStyle = highlightColor;
                } else {
                    c.font = entry.fs;
                    c.fillStyle = labelColor;
                }
                c.textAlign = entry.al;
                c.textBaseline = entry.bl;
                c.fillText(entry.label, entry.dx, entry.dy);
            });

            c.restore();
        },
    };

    // Label hit detection
    const findLabelHit = (mouseX, mouseY) => {
        const canvasRect = canvas.getBoundingClientRect();
        const cx = mouseX - canvasRect.left;
        const cy = mouseY - canvasRect.top;
        let closest = null;
        let closestDist = Infinity;
        for (const hb of labelHitBoxes) {
            const r = hb.rect;
            const mx = (r.x1 + r.x2) / 2;
            const my = (r.y1 + r.y2) / 2;
            const hw = (r.x2 - r.x1) / 2 + 12;
            const hh = (r.y2 - r.y1) / 2 + 8;
            const dx = Math.max(0, Math.abs(cx - mx) - hw);
            const dy = Math.max(0, Math.abs(cy - my) - hh);
            if (dx === 0 && dy === 0) {
                const dist = Math.hypot(cx - mx, cy - my);
                if (dist < closestDist) {
                    closestDist = dist;
                    closest = hb;
                }
            }
        }
        return closest;
    };

    let labelHoverActive = false;
    let hoveredLabelKey = null;

    const showArtLabelTooltip = (hit, mouseX, mouseY) => {
        const tip = document.getElementById('art-label-tooltip');
        const titleEl = document.getElementById('art-label-tooltip-title');
        const bodyEl = document.getElementById('art-label-tooltip-body');
        const swatchEl = document.getElementById('art-label-tooltip-swatch');
        if (!tip || !titleEl || !bodyEl) return;
        const d = bubbleData[hit.index];
        if (!d) return;
        const q = quadrantName(d.y, d.x);
        titleEl.textContent = `🎨 ${d.theme}`;
        bodyEl.textContent = `Games: ${d.count}  |  Avg Theo: ${d.yOrig.toFixed(2)}  |  ${q}`;
        if (swatchEl) {
            const color = quadrantColor(d.y, d.x);
            swatchEl.style.backgroundColor = color.bg + '0.6)';
        }
        const container = canvas.parentElement;
        const containerRect = container.getBoundingClientRect();
        tip.classList.remove('hidden');
        const tipW = tip.offsetWidth;
        const tipH = tip.offsetHeight;
        let lx = mouseX - containerRect.left + 14;
        let ly = mouseY - containerRect.top - tipH - 15;
        if (ly < 4) ly = mouseY - containerRect.top + 25;
        if (lx + tipW > containerRect.width - 8) lx = mouseX - containerRect.left - tipW - 14;
        tip.style.left = `${Math.max(4, lx)}px`;
        tip.style.top = `${Math.max(4, ly)}px`;
    };

    const hideArtLabelTooltip = () => {
        const tip = document.getElementById('art-label-tooltip');
        if (tip) tip.classList.add('hidden');
    };

    chartInstances.opportunity = new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: [
                {
                    label: 'Themes',
                    data: bubbleData,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1.5,
                    hoverRadius: 6,
                },
            ],
        },
        plugins: [quadrantPlugin, bubbleLabelPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400 },
            layout: { padding: { top: 24, right: 16, bottom: 24, left: 24 } },
            onClick: (e, elements) => {
                if (window.xrayActive) return;
                const chart = chartInstances.opportunity;
                if (!chart) return;
                if (elements.length) {
                    const d = bubbleData[elements[0].index];
                    if (d?.theme) window.showArtTheme(d.theme);
                    return;
                }
            },
            onHover: (e, elements) => {
                const chart = chartInstances.opportunity;
                if (!chart) return;
                const native = e.native;

                if (elements.length && native) {
                    const el = elements[0];
                    showArtLabelTooltip({ index: el.index }, native.clientX, native.clientY);
                    labelHoverActive = true;
                    const newKey = `0:${el.index}`;
                    if (hoveredLabelKey !== newKey) {
                        hoveredLabelKey = newKey;
                        chart.draw();
                    }
                    native.target.style.cursor = 'pointer';
                    return;
                }

                if (native) {
                    const hit = findLabelHit(native.clientX, native.clientY);
                    if (hit) {
                        native.target.style.cursor = 'pointer';
                        showArtLabelTooltip(hit, native.clientX, native.clientY);
                        const newKey = `0:${hit.index}`;
                        if (hoveredLabelKey !== newKey) hoveredLabelKey = newKey;
                        chart.setActiveElements([{ datasetIndex: 0, index: hit.index }]);
                        chart.draw();
                        labelHoverActive = true;
                        return;
                    }
                }

                if (labelHoverActive || hoveredLabelKey) {
                    labelHoverActive = false;
                    hoveredLabelKey = null;
                    hideArtLabelTooltip();
                    chart.setActiveElements([]);
                    chart.draw();
                }
                if (native) native.target.style.cursor = 'default';
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false },
            },
            scales: {
                y: {
                    min: 0,
                    title: {
                        display: true,
                        text: 'Avg Performance Index',
                        color: chartColors.textColor,
                        font: { size: 10, weight: 'bold' },
                    },
                    afterBuildTicks(axis) {
                        const nice = [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6];
                        axis.ticks = nice
                            .map(v => warpY(sqrtY(v)))
                            .filter(wv => wv >= 0 && wv <= (axis.max || 2))
                            .map(v => ({ value: v }));
                    },
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 10 },
                        padding: 6,
                        callback: val => {
                            const sv = unwarpY(val);
                            const orig = sv * sv;
                            if (orig === 0) return '0';
                            return orig < 1 ? orig.toFixed(2) : orig.toFixed(1);
                        },
                    },
                    grid: getModernGridConfig(),
                },
                x: {
                    type: 'linear',
                    min: warpX(logX(1)) - 0.15,
                    title: {
                        display: true,
                        text: 'Number of Games',
                        color: chartColors.textColor,
                        font: { size: 10, weight: 'bold' },
                    },
                    afterBuildTicks(axis) {
                        const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500];
                        const seen = new Set();
                        axis.ticks = nice
                            .map(v => warpX(logX(v)))
                            .filter(wv => {
                                if (wv < (axis.min ?? 0) || wv > (axis.max || 5)) return false;
                                const k = wv.toFixed(6);
                                if (seen.has(k)) return false;
                                seen.add(k);
                                return true;
                            })
                            .map(v => ({ value: v }));
                    },
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 10 },
                        padding: 6,
                        callback: val => {
                            const lv = unwarpX(val);
                            const orig = Math.round(Math.pow(10, lv));
                            const nice = [1, 2, 5, 10, 20, 50, 100, 200, 500];
                            const closest = nice.reduce((a, b) => (Math.abs(b - orig) < Math.abs(a - orig) ? b : a));
                            return closest.toLocaleString();
                        },
                    },
                    grid: getModernGridConfig(),
                },
            },
        },
    });

    // Label click handler (click on displaced labels opens panel)
    canvas.addEventListener('click', e => {
        if (window.xrayActive) return;
        const chart = chartInstances.opportunity;
        if (!chart) return;
        const hit = findLabelHit(e.clientX, e.clientY);
        if (hit) {
            const d = bubbleData[hit.index];
            if (d?.theme) window.showArtTheme(d.theme);
        }
    });
}

// ── Blue Ocean Opportunities bubble chart (recipe-level: Theme × Mood) ──

function renderBlueOcean(artGames, globalAvg) {
    destroyChart('blueOcean');
    const canvas = document.getElementById('art-blue-ocean-chart');
    if (!canvas) return;

    const combos = getArtComboMetrics(artGames, { minGames: 2 });
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
            theme: c.theme,
            mood: c.mood,
            count: c.count,
            avgTheo: c.avgTheo,
            mktShare: c.mktShare,
            _label: `${shortLabel(c.theme)} + ${shortLabel(c.mood)}`,
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
                            const d = ctx[0]?.raw;
                            return d ? `${d.theme} + ${d.mood}` : '';
                        },
                        label: ctx => {
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
            if (d) window.showArtRecipe(d.theme, d.mood);
            return;
        }

        if (resolvedLabels) {
            const rect = canvas.getBoundingClientRect();
            const cx = e.clientX - rect.left;
            const cy = e.clientY - rect.top;
            for (const lb of resolvedLabels) {
                if (cx >= lb.x && cx <= lb.x + lb.w && cy >= lb.y && cy <= lb.y + lb.h) {
                    const d = bubbleData[lb.index];
                    if (d) window.showArtRecipe(d.theme, d.mood);
                    return;
                }
            }
        }
    });
}

// ── Mood filter for Art Landscape ──

function wireMoodDropdown(artGames, moods, globalAvg) {
    const select = document.getElementById('art-landscape-mood-filter');
    if (!select) return;

    const sortedMoods = [...moods].sort((a, b) => b.count - a.count);

    select.innerHTML =
        '<option value="">All Moods</option>' +
        sortedMoods
            .map(m => `<option value="${escapeAttr(m.mood)}">${escapeHtml(m.mood)} (${m.count})</option>`)
            .join('');

    select.addEventListener('change', () => {
        const mood = select.value;
        const filtered = mood ? artGames.filter(g => F.artMood(g) === mood) : artGames;
        if (filtered.length < 2) {
            const canvas = document.getElementById('art-opportunity-chart');
            if (canvas) {
                destroyChart('opportunity');
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.font = '13px Inter, system-ui, sans-serif';
                ctx.fillStyle = '#94a3b8';
                ctx.textAlign = 'center';
                ctx.fillText('Not enough art data for this mood', canvas.width / 2, canvas.height / 2);
            }
            return;
        }
        const minGames = mood ? 2 : 1;
        const filteredThemes = getArtThemeMetrics(filtered).filter(s => s.count >= minGames);
        renderThemeLandscape(filteredThemes, globalAvg);
    });
}

// ── Art Trends ──

function computeArtMoodTrends(artGames) {
    const now = new Date().getFullYear();
    const recentCutoff = now - 2;
    const byMood = {};
    for (const g of artGames) {
        const mood = F.artMood(g);
        const yr = F.releaseYear(g);
        if (!mood || !yr || yr < 2000) continue;
        if (!byMood[mood]) byMood[mood] = { recent: 0, older: 0, total: 0 };
        byMood[mood].total++;
        if (yr >= recentCutoff) byMood[mood].recent++;
        else byMood[mood].older++;
    }
    const totalRecent = Object.values(byMood).reduce((s, e) => s + e.recent, 0) || 1;
    const totalOlder = Object.values(byMood).reduce((s, e) => s + e.older, 0) || 1;
    const result = {};
    for (const [mood, d] of Object.entries(byMood)) {
        if (d.total < 5) {
            result[mood] = { direction: 'insufficient', recentPct: 0, olderPct: 0, change: 0, total: d.total };
            continue;
        }
        const recentPct = d.recent / totalRecent;
        const olderPct = d.older / totalOlder;
        const ratio = olderPct > 0 ? recentPct / olderPct : recentPct > 0 ? 2 : 1;
        const change = (ratio - 1) * 100;
        let direction = 'stable';
        if (ratio >= 1.2) direction = 'rising';
        else if (ratio <= 0.8) direction = 'declining';
        result[mood] = { direction, recentPct, olderPct, change, total: d.total };
    }
    return result;
}

function renderArtTrends(artGames) {
    const canvas = document.getElementById('art-trend-chart');
    if (!canvas) return;

    const DIMENSION_CONFIG = {
        environment: { accessor: g => [F.artTheme(g)].filter(Boolean), label: 'Themes' },
        mood: { accessor: g => [F.artMood(g)].filter(Boolean), label: 'Moods' },
        elements: { accessor: g => F.artElements(g) || [], label: 'Elements' },
        characters: { accessor: g => F.artCharacters(g) || [], label: 'Characters' },
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
            .slice(0, 10);
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
                            title: items => items[0]?.label || '',
                            label: item => `${item.dataset.label}: ${item.formattedValue} games`,
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
                        title: items => top12[items[0].dataIndex],
                        label: item =>
                            `${metric}: ${typeof item.raw === 'number' && item.raw % 1 !== 0 ? item.raw.toFixed(2) : item.raw}`,
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

function renderMoodChart(moods) {
    createHorizontalBar(
        'art-mood-chart',
        moods.map(m => m.mood),
        moods.map(m => m.avgTheo),
        'Avg Performance Index',
        'moods',
        '#a855f7',
        name => window.showArtMood(name)
    );
}

function renderArtStylesChart(styles) {
    if (!styles.length) {
        destroyChart('styles');
        return;
    }
    createHorizontalBar(
        'art-styles-chart',
        styles.map(s => s.style),
        styles.map(s => s.count),
        'Games',
        'styles',
        '#ec4899',
        name => window.showArtStyle(name)
    );
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
            sorted.sort((a, b) => (a.theme + a.mood).localeCompare(b.theme + b.mood));
            break;
        case 'opportunity':
        default:
            sorted.sort((a, b) => oppScore(b) - oppScore(a));
            break;
    }
    return sorted;
}

function renderArtRecipes(recipes, globalAvg, artGames) {
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
    renderArtRecipesInner(sorted, avg, container, artGames);
}

function reRenderRecipes(mode) {
    _recipeCache.sortMode = mode;
    const { recipes, avg, artGames } = _recipeCache;
    const sorted = sortRecipes(recipes, avg, mode);
    const container = document.getElementById('art-combos-table');
    if (!container) return;
    renderArtRecipesInner(sorted, avg, container, artGames);
}

function renderArtRecipesInner(sorted, avg, container, artGames) {
    if (!sorted.length) {
        container.innerHTML = '<div class="text-center text-gray-400 dark:text-gray-500 py-8">No recipes found</div>';
        return;
    }

    const INITIAL_SHOW = 10;
    const PAGE_SIZE = 20;
    const maxTheo = Math.max(...sorted.map(r => r.avgTheo), 1);
    const MEDALS = ['🥇', '🥈', '🥉'];

    const trendMap = artGames ? computeArtThemeTrends(artGames) : {};

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

            const recipeGames = artGames
                ? artGames.filter(g => F.artTheme(g) === r.theme && F.artMood(g) === r.mood)
                : [];
            const domVol = recipeGames.length ? getDominantVolatility(recipeGames) : '';
            const domLayout = recipeGames.length ? getDominantLayout(recipeGames) : '';
            const avgRtp = recipeGames.length ? getAvgRtp(recipeGames) : 0;

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
                .slice(0, 3);
            const elems = (r.topElements || []).slice(0, 3);
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
                        <div class="flex flex-wrap items-start gap-3">
                            ${hasSpecs ? `<div><div class="text-[8px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">Specs</div><div class="flex flex-wrap items-center gap-1.5">${specPills.join(SEP)}</div></div>` : ''}
                            ${hasSpecs && hasArt ? '<div class="w-px h-10 bg-gray-300 dark:bg-gray-600 self-center shrink-0"></div>' : ''}
                            ${hasArt ? `<div><div class="text-[8px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">Art Details</div><div class="flex flex-wrap items-center gap-1.5">${artPills.join(SEP)}</div></div>` : ''}
                        </div>
                    </div>`
                    : '';

            return `<div class="recipe-row group hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors cursor-pointer ${rowBg}" data-xray='${escapeAttr(JSON.stringify({ dimension: 'art_theme', value: r.theme }))}' onclick="${safeOnclick('window.showArtRecipe', r.theme, r.mood)}">
            <div class="px-4 py-4">
                <div class="flex items-center gap-3">
                    <div class="w-8 text-center shrink-0">${rank}</div>
                    <div class="w-px h-10 bg-gray-300 dark:bg-gray-600 shrink-0"></div>
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-center gap-1.5 mb-2">
                            <span class="text-[10px] font-semibold text-gray-500 dark:text-gray-400">Theme</span>
                            ${multiPill(r.theme, THEME_PALETTE)}
                            <span class="text-gray-300 dark:text-gray-600 text-xs mx-0.5">×</span>
                            <span class="text-[10px] font-semibold text-gray-500 dark:text-gray-400">Mood</span>
                            ${multiPill(r.mood, MOOD_PALETTE)}
                            ${trendBadge}
                            ${isOpp ? '<span class="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded-full">💎 Opportunity</span>' : ''}
                            <span class="text-[9px] font-medium ${riskColor} px-1.5 py-0.5 rounded-full">${riskLevel} Risk</span>
                            <span class="text-[9px] text-gray-400 dark:text-gray-500">${provCount} provider${provCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div class="border-t border-dashed border-gray-200 dark:border-gray-700 pt-1.5 mt-1.5 flex items-center gap-2">
                            <span class="text-[10px] font-semibold text-gray-500 dark:text-gray-400">Avg Theo</span>
                            <div class="w-28 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden shrink-0">
                                <div class="h-full rounded-full bg-gradient-to-r ${barGradient}" style="width:${barWidth.toFixed(0)}%"></div>
                            </div>
                            <span class="text-sm font-bold text-gray-900 dark:text-white tabular-nums">${r.avgTheo.toFixed(1)}</span>
                        </div>
                    </div>
                    <div class="w-px h-14 bg-gray-300 dark:bg-gray-600 shrink-0"></div>
                    <div class="flex items-center gap-1 shrink-0">
                        <div class="text-center px-2.5">
                            <div class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 leading-none mb-1">Lift</div>
                            <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${liftColor} ${liftBg}">${liftIcon}${Math.abs(lift).toFixed(0)}%</span>
                        </div>
                        <div class="w-px h-8 bg-gray-200 dark:bg-gray-700 shrink-0"></div>
                        <div class="text-center px-2.5">
                            <div class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 leading-none mb-1">Games</div>
                            <span class="text-sm font-bold text-gray-800 dark:text-gray-200 tabular-nums">${r.count}</span>
                        </div>
                        <div class="w-px h-8 bg-gray-200 dark:bg-gray-700 shrink-0"></div>
                        <div class="text-center px-2.5">
                            <div class="text-[10px] font-semibold text-gray-500 dark:text-gray-400 leading-none mb-1">Opportunity</div>
                            <span class="text-sm font-bold tabular-nums ${opp >= 0.5 ? 'text-emerald-600 dark:text-emerald-400' : opp >= 0.3 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'}">${opp.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
                ${detailSection}
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
        reRenderRecipes(sel.value);
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

function renderProviderArtCards(artGames, globalAvg) {
    const container = document.getElementById('art-provider-cards');
    if (!container) return;

    const providers = getProviderMetrics(artGames, { minGames: 3 }).slice(0, 8);
    if (!providers.length) {
        container.innerHTML = '<p class="text-xs text-gray-400 dark:text-gray-500">Not enough data</p>';
        return;
    }

    const artAvg = artGames.length > 0 ? artGames.reduce((s, g) => s + F.theoWin(g), 0) / artGames.length : globalAvg;

    const cards = providers.map(p => {
        const provGames = artGames.filter(g => F.provider(g) === p.name);
        const envMap = {};
        const moodMap = {};
        for (const g of provGames) {
            const env = F.artTheme(g);
            const mood = F.artMood(g);
            if (env) {
                if (!envMap[env]) envMap[env] = { count: 0, theoSum: 0 };
                envMap[env].count++;
                envMap[env].theoSum += F.theoWin(g);
            }
            if (mood) moodMap[mood] = (moodMap[mood] || 0) + 1;
        }
        const bestEnv = Object.entries(envMap)
            .filter(([, d]) => d.count >= 2)
            .sort((a, b) => b[1].theoSum / b[1].count - a[1].theoSum / a[1].count)[0];
        const topMood = Object.entries(moodMap).sort((a, b) => b[1] - a[1])[0];
        const avgTheo = p.avgTheo;
        const lift = artAvg > 0 ? ((avgTheo / artAvg - 1) * 100).toFixed(0) : '0';
        const liftNum = Number(lift);
        const topGame = [...provGames].sort((a, b) => F.theoWin(b) - F.theoWin(a))[0];
        const envCount = Object.keys(envMap).length;

        return { name: p.name, count: p.count, avgTheo, lift: liftNum, bestEnv, topMood, topGame, envCount };
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
            const topMoodName = c.topMood ? c.topMood[0] : '—';
            const topGameName = c.topGame?.name || '—';

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
                    <div class="flex items-center justify-between">
                        <span class="text-[10px] text-gray-400 dark:text-gray-500">Mood</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-pink-50 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 font-medium truncate max-w-[120px]">${escapeHtml(shortLabel(topMoodName))}</span>
                    </div>
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
    const games = artGames.filter(g => F.artTheme(g) === r.theme && F.artMood(g) === r.mood);
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
            <div class="min-w-0"><div class="text-xs font-semibold text-gray-900 dark:text-white truncate"><span class="${s.title1}">${escapeHtml(shortLabel(c.theme))}</span> <span class="text-[8px] text-gray-400 font-normal">theme</span> + <span class="${s.title2}">${escapeHtml(shortLabel(c.mood))}</span> <span class="text-[8px] text-gray-400 font-normal">mood</span></div></div>
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

function renderArtStrategicCards(artGames, globalAvg) {
    const recipes = getArtRecipeMetrics(artGames, { minGames: 2 });
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
            ? opps.map(c => renderCardItem(c, 'emerald', safeOnclick('window.showArtRecipe', c.theme, c.mood))).join('')
            : '<p class="text-xs text-gray-400">No opportunities detected</p>';
    }

    if (avoidDiv) {
        const avoid = recipes
            .filter(r => r.avgTheo < avg * 0.9 && r.count >= 5)
            .map(r => enrichRecipe(r, artGames, avg))
            .sort((a, b) => a.avgTheo - b.avgTheo)
            .slice(0, 5);

        avoidDiv.innerHTML = avoid.length
            ? avoid.map(c => renderCardItem(c, 'red', safeOnclick('window.showArtRecipe', c.theme, c.mood))).join('')
            : '<p class="text-xs text-gray-400">No underperformers</p>';
    }

    if (watchDiv) {
        const themes = getArtThemeMetrics(artGames);
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
                const dominantMood = (() => {
                    const moodMap = {};
                    themeGames.forEach(g => {
                        const m = F.artMood(g);
                        if (m) moodMap[m] = (moodMap[m] || 0) + 1;
                    });
                    return Object.entries(moodMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
                })();
                return {
                    theme: s.theme,
                    mood: dominantMood,
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
