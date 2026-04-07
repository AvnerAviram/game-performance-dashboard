import { getActiveGames } from '../../lib/data.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../../lib/sanitize.js';
import { F } from '../../lib/game-fields.js';
import {
    getArtSettingMetrics,
    getArtMoodMetrics,
    getArtNarrativeMetrics,
    getArtCharacterMetrics,
    getArtElementMetrics,
    getArtRecipeMetrics,
    getGlobalAvgTheo,
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

const SETTING_PALETTE = [
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

function multiPill(compoundName, palette) {
    const parts = compoundName
        .split('/')
        .map(s => s.trim())
        .filter(Boolean);
    const baseColor = hashColor(compoundName, palette);
    return parts
        .map(
            p =>
                `<span class="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded" style="background:${baseColor}18;color:${baseColor};border:1px solid ${baseColor}30">${escapeHtml(p)}</span>`
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

    if (excludeDimension !== 'setting') {
        const map = {};
        games.forEach(g => {
            const v = F.artSetting(g);
            if (v) map[v] = (map[v] || 0) + 1;
        });
        const sorted = Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
        if (sorted.length) dims.push({ label: 'Settings', items: sorted, clickFn: 'window.showArtSetting' });
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
        if (sorted.length) dims.push({ label: 'Moods', items: sorted, clickFn: 'window.showArtMood' });
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
        if (sorted.length) dims.push({ label: 'Characters', items: sorted, clickFn: 'window.showArtCharacter' });
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
        if (sorted.length) dims.push({ label: 'Elements', items: sorted, clickFn: 'window.showArtElement' });
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
        if (sorted.length) dims.push({ label: 'Narratives', items: sorted, clickFn: 'window.showArtNarrative' });
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
                    return `<span class="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors" onclick="${safeOnclick(d.clickFn, name)}">${escapeHtml(name)} <span class="text-[9px] text-gray-400">${count} · ${pct}%</span></span>`;
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
    const artGames = games.filter(g => F.artSetting(g));
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
                return `<div data-cl-item${hidden} class="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showProviderDetails', p)}">
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

window.showArtSetting = function (setting) {
    showArtFilteredGames(`Setting: ${setting}`, g => F.artSetting(g) === setting, { excludeDimension: 'setting' });
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
window.showArtRecipe = function (setting, mood) {
    showArtFilteredGames(`${setting} + ${mood}`, g => F.artSetting(g) === setting && F.artMood(g) === mood);
};

export function renderArt() {
    const allGames = getActiveGames();
    const artGames = allGames.filter(g => F.artSetting(g));

    const settings = getArtSettingMetrics(artGames);
    const moods = getArtMoodMetrics(artGames);
    const narratives = getArtNarrativeMetrics(artGames);
    const characters = getArtCharacterMetrics(artGames);
    const elements = getArtElementMetrics(artGames);
    const recipes = getArtRecipeMetrics(artGames, { minGames: 3 });
    const globalAvg = getGlobalAvgTheo(allGames);

    renderStats(allGames, artGames, settings, moods);
    renderSettingLandscape(settings, globalAvg);
    renderSettingsChart(settings);
    renderMoodChart(moods);
    renderCharactersChart(characters);
    renderElementsChart(elements);
    renderNarrativeChart(narratives);
    renderArtRecipes(recipes, globalAvg);
    renderArtStrategicCards(artGames, globalAvg);
}

function renderStats(allGames, artGames, settings, moods) {
    const pct = allGames.length > 0 ? ((artGames.length / allGames.length) * 100).toFixed(1) : '0';
    const avgTheo = artGames.length > 0 ? artGames.reduce((s, g) => s + F.theoWin(g), 0) / artGames.length : 0;

    const el = id => document.getElementById(id);
    const set = (id, val) => {
        const e = el(id);
        if (e) e.textContent = val;
    };

    set('art-stat-coverage', `${artGames.length} (${pct}%)`);
    set('art-stat-settings', settings.length);
    set('art-stat-moods', moods.length);
    set('art-stat-avg-theo', avgTheo.toFixed(2));

    const sub = el('art-subtitle');
    if (sub) {
        sub.textContent = `Visual design analysis across ${artGames.length} classified games — ${settings.length} settings, ${moods.length} moods`;
    }
}

// ── Art Landscape bubble chart (mirrors Theme Landscape pattern) ──

function renderSettingLandscape(settings, globalAvg) {
    destroyChart('opportunity');
    const canvas = document.getElementById('art-opportunity-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chartColors = getChartColors();

    if (!settings.length) return;

    const xVals = settings.map(s => s.count);
    const yVals = settings.map(s => s.avgTheo);
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

    const bubbleData = settings.map(s => ({
        x: warpX(logX(s.count)),
        y: warpY(sqrtY(s.avgTheo)),
        r: rMin + Math.sqrt(s.count / maxCount) * (rMax - rMin),
        yOrig: s.avgTheo,
        setting: s.setting,
        count: s.count,
    }));

    const bubbleLabels = settings.map(s => shortLabel(s.setting));
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
        titleEl.textContent = `🎨 ${d.setting}`;
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
                    label: 'Settings',
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
            layout: { padding: { top: 24, right: 16, bottom: 24, left: 4 } },
            onClick: (e, elements) => {
                const chart = chartInstances.opportunity;
                if (!chart) return;
                if (elements.length) {
                    const d = bubbleData[elements[0].index];
                    if (d?.setting) window.showArtSetting(d.setting);
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
                    min: 0,
                    title: {
                        display: true,
                        text: 'Game Count',
                        color: chartColors.textColor,
                        font: { size: 10, weight: 'bold' },
                    },
                    afterBuildTicks(axis) {
                        const nice = [0, 2, 5, 10, 20, 50, 100, 200, 500];
                        const seen = new Set();
                        axis.ticks = nice
                            .map(v => warpX(logX(v)))
                            .filter(wv => {
                                if (wv < 0 || wv > (axis.max || 5)) return false;
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
                            if (val === 0) return '0';
                            const lv = unwarpX(val);
                            const orig = Math.round(Math.pow(10, lv));
                            const nice = [0, 2, 5, 10, 20, 50, 100, 200, 500];
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
        const chart = chartInstances.opportunity;
        if (!chart) return;
        const hit = findLabelHit(e.clientX, e.clientY);
        if (hit) {
            const d = bubbleData[hit.index];
            if (d?.setting) window.showArtSetting(d.setting);
        }
    });
}

// ── Bar charts (gradient style matching overview) ──

function createHorizontalBar(canvasId, labels, values, metric, chartKey, color, onClickFn) {
    destroyChart(chartKey);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const chartColors = getChartColors();
    const top12 = labels.slice(0, 12);
    const top12Vals = values.slice(0, 12);

    const displayLabels = top12.map(l => shortLabel(l));
    const gradientColors = generateModernColors(ctx, top12.length);

    chartInstances[chartKey] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: displayLabels,
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
                    ticks: { color: chartColors.textColor, font: { size: 10 }, padding: 4 },
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: chartColors.textColor,
                        font: { size: 11 },
                        autoSkip: false,
                        padding: 6,
                    },
                },
            },
        },
    });
}

function renderSettingsChart(settings) {
    createHorizontalBar(
        'art-settings-chart',
        settings.map(s => s.setting),
        settings.map(s => s.count),
        'Games',
        'settings',
        '#6366f1',
        name => window.showArtSetting(name)
    );
}

function renderMoodChart(moods) {
    createHorizontalBar(
        'art-mood-chart',
        moods.map(m => m.mood),
        moods.map(m => m.avgTheo),
        'Avg Theo',
        'moods',
        '#a855f7',
        name => window.showArtMood(name)
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
        'Avg Theo',
        'narratives',
        '#f43f5e',
        name => window.showArtNarrative(name)
    );
}

// ── Art Recipes (replaces combos table) ──

let _recipeCache = { recipes: [], avg: 0, sortMode: 'opportunity' };

function sortRecipes(recipes, avg, mode) {
    const oppScore = r => {
        if (avg <= 0) return 0;
        const lift = r.avgTheo / avg;
        const gap = 1 / Math.log2(r.count + 1);
        const confidence = Math.min(1, (r.count - 1) / 4);
        return lift * gap * confidence;
    };
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
            sorted.sort((a, b) => (a.setting + a.mood).localeCompare(b.setting + b.mood));
            break;
        case 'opportunity':
        default:
            sorted.sort((a, b) => oppScore(b) - oppScore(a));
            break;
    }
    return sorted;
}

function renderArtRecipes(recipes, globalAvg) {
    const container = document.getElementById('art-combos-table');
    if (!container) return;

    const artAvg =
        recipes.length > 0
            ? recipes.reduce((s, r) => s + r.avgTheo * r.count, 0) / recipes.reduce((s, r) => s + r.count, 0)
            : globalAvg;
    const avg = artAvg > 0 ? artAvg : globalAvg;

    _recipeCache = { recipes, avg, sortMode: 'opportunity' };
    setupRecipeSortButtons();

    const sorted = sortRecipes(recipes, avg, 'opportunity');
    renderArtRecipesInner(sorted, avg, container);
}

function reRenderRecipes(mode) {
    _recipeCache.sortMode = mode;
    const { recipes, avg } = _recipeCache;
    const sorted = sortRecipes(recipes, avg, mode);
    const container = document.getElementById('art-combos-table');
    if (!container) return;
    renderArtRecipesInner(sorted, avg, container);
}

function renderArtRecipesInner(sorted, avg, container) {
    if (!sorted.length) {
        container.innerHTML = '<div class="text-center text-gray-400 dark:text-gray-500 py-8">No recipes found</div>';
        return;
    }

    const INITIAL_SHOW = 25;
    const maxTheo = Math.max(...sorted.map(r => r.avgTheo), 1);
    const MEDALS = ['🥇', '🥈', '🥉'];

    const rows = sorted
        .map((r, i) => {
            const lift = avg > 0 ? ((r.avgTheo - avg) / avg) * 100 : 0;
            const liftSign = lift > 0 ? '+' : '';
            const liftColor =
                lift > 15
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : lift > 0
                      ? 'text-emerald-500 dark:text-emerald-400'
                      : lift < -15
                        ? 'text-red-500 dark:text-red-400'
                        : 'text-gray-500 dark:text-gray-400';
            const liftBg =
                lift > 0
                    ? 'bg-emerald-50 dark:bg-emerald-900/30'
                    : lift < 0
                      ? 'bg-red-50 dark:bg-red-900/30'
                      : 'bg-gray-50 dark:bg-gray-700';
            const barWidth = maxTheo > 0 ? (r.avgTheo / maxTheo) * 100 : 0;
            const isOpp = r.avgTheo > avg && r.count <= 15;
            const rowHighlight = i < 3 ? 'bg-gradient-to-r from-amber-50/30 to-transparent dark:from-amber-900/10' : '';

            const rankNum = i + 1;
            const rank =
                i < 3
                    ? `<span class="text-base leading-none">${MEDALS[i]}</span>`
                    : `<span class="text-xs font-bold text-gray-400 dark:text-gray-500 tabular-nums">${rankNum}</span>`;

            const charChips = (r.topCharacters || [])
                .filter(c => c && c !== 'No Characters (symbol-only game)')
                .slice(0, 3)
                .map(
                    c =>
                        `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">${escapeHtml(shortLabel(c))}</span>`
                )
                .join('');
            const elemChips = (r.topElements || [])
                .slice(0, 3)
                .map(
                    e =>
                        `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200">${escapeHtml(shortLabel(e))}</span>`
                )
                .join('');
            const narrChip =
                r.narrative && r.narrative !== 'No Narrative (classic/abstract)'
                    ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-800 dark:text-rose-200">${escapeHtml(shortLabel(r.narrative))}</span>`
                    : '';
            const hasDetails = charChips || elemChips || narrChip;

            return `<div class="recipe-row px-3 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer ${rowHighlight}" onclick="${safeOnclick('window.showArtRecipe', r.setting, r.mood)}">
                <div class="flex items-center gap-3">
                    <div class="w-6 text-center shrink-0">${rank}</div>
                    <div class="flex flex-wrap gap-1.5 min-w-0 flex-1">
                        ${multiPill(r.setting, SETTING_PALETTE)}
                        <span class="text-gray-300 dark:text-gray-600">+</span>
                        ${multiPill(r.mood, MOOD_PALETTE)}
                    </div>
                </div>
                <div class="ml-9 mt-2 flex flex-wrap items-center gap-4">
                    <div class="flex items-center gap-2">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Theo</span>
                        <div class="w-20 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div class="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400" style="width:${barWidth.toFixed(0)}%"></div>
                        </div>
                        <span class="text-sm font-bold text-gray-900 dark:text-white tabular-nums">${r.avgTheo.toFixed(2)}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Lift</span>
                        <span class="inline-flex px-1.5 py-0.5 rounded text-[11px] font-semibold ${liftColor} ${liftBg}">${lift >= 0 ? '▲' : '▼'}${liftSign}${Math.abs(lift).toFixed(0)}%</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Games</span>
                        <span class="text-sm font-bold text-gray-700 dark:text-gray-300 tabular-nums">${r.count}</span>
                    </div>
                    ${isOpp ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-800">💎 Opportunity</span>' : ''}
                </div>
                ${
                    hasDetails
                        ? `<div class="ml-9 mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
                    ${charChips ? `<div class="flex items-center gap-1.5"><span class="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Characters</span><div class="flex flex-wrap gap-1">${charChips}</div></div>` : ''}
                    ${elemChips ? `<div class="flex items-center gap-1.5"><span class="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Elements</span><div class="flex flex-wrap gap-1">${elemChips}</div></div>` : ''}
                    ${narrChip ? `<div class="flex items-center gap-1.5"><span class="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Narrative</span>${narrChip}</div>` : ''}
                </div>`
                        : ''
                }
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
        <div class="divide-y divide-gray-100 dark:divide-gray-700/50" id="art-recipes-list">${rows}</div>
        ${
            hasMore
                ? `<div class="px-3 pt-2 pb-1" id="art-recipes-show-more-wrap">
                    <button id="art-recipes-show-more" class="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium cursor-pointer">Show ${sorted.length - INITIAL_SHOW} more…</button>
                </div>`
                : ''
        }
        <div class="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
            ${sorted.length} recipes · ${beatingMarket} beating art avg (${avg.toFixed(2)}) · sorted by ${SORT_LABELS[_recipeCache.sortMode] || 'opportunity score'}
        </div>`;

    const listEl = document.getElementById('art-recipes-list');
    if (listEl && hasMore) {
        const allRows = listEl.querySelectorAll('.recipe-row');
        allRows.forEach((row, idx) => {
            if (idx >= INITIAL_SHOW) row.style.display = 'none';
        });
        const btn = document.getElementById('art-recipes-show-more');
        if (btn) {
            btn.addEventListener('click', () => {
                allRows.forEach(row => {
                    row.style.display = '';
                });
                const wrap = document.getElementById('art-recipes-show-more-wrap');
                if (wrap) wrap.remove();
            });
        }
    }
}

function setupRecipeSortButtons() {
    const wrap = document.getElementById('art-recipe-sort');
    if (!wrap) return;
    const activeCls = 'bg-white dark:bg-gray-600 text-indigo-700 dark:text-indigo-300 shadow-sm';
    const inactiveCls = 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300';
    wrap.querySelectorAll('.art-sort-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.sort;
            if (mode === _recipeCache.sortMode) return;
            wrap.querySelectorAll('.art-sort-btn').forEach(b => {
                b.className = b.className.replace(activeCls, '').replace(inactiveCls, '').trim();
                b.classList.add(...(b.dataset.sort === mode ? activeCls : inactiveCls).split(' '));
            });
            reRenderRecipes(mode);
        });
    });
}

// ── Strategic Art Recommendations (Build Next / Avoid / Watch) ──

function enrichRecipe(r, artGames, avg) {
    const games = artGames.filter(g => F.artSetting(g) === r.setting && F.artMood(g) === r.mood);
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

    return `<div class="space-y-0.5 cursor-pointer ${s.hover} rounded-lg px-2 py-1.5 -mx-2 transition-colors" onclick="${clickAction}">
        <div class="flex items-center justify-between gap-2">
            <div class="min-w-0"><div class="text-xs font-semibold text-gray-900 dark:text-white truncate"><span class="${s.title1}">${escapeHtml(shortLabel(c.setting))}</span> <span class="text-[8px] text-gray-400 font-normal">env</span> + <span class="${s.title2}">${escapeHtml(shortLabel(c.mood))}</span> <span class="text-[8px] text-gray-400 font-normal">mood</span></div></div>
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
            ? opps
                  .map(c => renderCardItem(c, 'emerald', safeOnclick('window.showArtRecipe', c.setting, c.mood)))
                  .join('')
            : '<p class="text-xs text-gray-400">No opportunities detected</p>';
    }

    if (avoidDiv) {
        const avoid = recipes
            .filter(r => r.avgTheo < avg * 0.9 && r.count >= 5)
            .map(r => enrichRecipe(r, artGames, avg))
            .sort((a, b) => a.avgTheo - b.avgTheo)
            .slice(0, 5);

        avoidDiv.innerHTML = avoid.length
            ? avoid.map(c => renderCardItem(c, 'red', safeOnclick('window.showArtRecipe', c.setting, c.mood))).join('')
            : '<p class="text-xs text-gray-400">No underperformers</p>';
    }

    if (watchDiv) {
        const settings = getArtSettingMetrics(artGames);
        const watch = settings
            .filter(s => s.count >= 2 && s.count <= 15 && s.avgTheo > avg)
            .map(s => {
                const settingGames = artGames.filter(g => F.artSetting(g) === s.setting);
                const provArr = Object.entries(
                    settingGames.reduce((m, g) => {
                        const p = F.provider(g);
                        if (p) m[p] = (m[p] || 0) + 1;
                        return m;
                    }, {})
                ).sort((a, b) => b[1] - a[1]);
                const topGame = [...settingGames].sort((a, b) => F.theoWin(b) - F.theoWin(a))[0];
                const lift = ((s.avgTheo / avg - 1) * 100).toFixed(0);
                const dominantMood = (() => {
                    const moodMap = {};
                    settingGames.forEach(g => {
                        const m = F.artMood(g);
                        if (m) moodMap[m] = (moodMap[m] || 0) + 1;
                    });
                    return Object.entries(moodMap).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
                })();
                return {
                    setting: s.setting,
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
            ? watch.map(s => renderCardItem(s, 'amber', safeOnclick('window.showArtSetting', s.setting))).join('')
            : '<p class="text-xs text-gray-400">No emerging environments</p>';
    }
}
