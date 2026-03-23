// Mechanic and Theme detail slide-out panels
import { gameData } from '../lib/data.js';
import { getMechanicDefinition } from '../config/mechanics.js';
import { escapeHtml, safeOnclick } from '../lib/sanitize.js';
import { parseFeatures } from '../lib/parse-features.js';
import {
    PanelSection,
    MetricGrid,
    GameListItem,
    GRADIENTS,
    ACCENTS,
    EmptyState,
} from '../components/dashboard-components.js';
import { log } from '../lib/env.js';
import { collapsibleList } from './collapsible-list.js';
import { F } from '../lib/game-fields.js';

let themeBreakdowns = null;
(async function loadThemeBreakdowns() {
    try {
        let response;
        try {
            response = await fetch('/api/data/theme-breakdowns', { credentials: 'same-origin' });
        } catch {
            /* API unavailable, fall back to static */
        }
        if (!response || !response.ok) response = await fetch('./src/config/theme-breakdowns.json');
        const data = await response.json();
        themeBreakdowns = data.themes;
        log('✅ Theme breakdowns loaded:', Object.keys(themeBreakdowns).length, 'themes');
    } catch (error) {
        console.error('Failed to load theme breakdowns:', error);
    }
})();

/**
 * Sub-themes derived from themes_all tags across all games in this consolidated theme.
 * Filters out generic cross-theme tags (colors, valuables, etc.) and other consolidated theme names.
 * Falls back to theme_primary if themes_all unavailable.
 */
function buildRuntimeSubThemeRows(themeGames, consolidatedThemeName) {
    if (!themeGames.length) return [];

    const allGames = gameData.allGames || [];
    const consolidatedLower = (consolidatedThemeName || '').toLowerCase();

    // Build comprehensive set of known theme names to exclude
    const consolidatedNames = new Set();
    if (gameData.themes) {
        gameData.themes.forEach(t => consolidatedNames.add((t.Theme || '').toLowerCase()));
    }
    allGames.forEach(g => {
        const ct = F.themeConsolidated(g).trim().toLowerCase();
        if (ct && ct !== 'unknown') consolidatedNames.add(ct);
    });
    // Also add consolidation map keys and values
    if (gameData.themeConsolidationMap) {
        for (const [key, val] of Object.entries(gameData.themeConsolidationMap)) {
            if (typeof key === 'string') consolidatedNames.add(key.toLowerCase());
            if (typeof val === 'string') consolidatedNames.add(val.toLowerCase());
        }
    }

    // Count how many different consolidated themes each tag appears in
    const tagThemeSpread = {};
    allGames.forEach(g => {
        const ct = F.themeConsolidated(g).toLowerCase();
        if (!ct || ct === 'unknown') return;
        let tags;
        try {
            tags = typeof g.themes_all === 'string' ? JSON.parse(g.themes_all) : g.themes_all;
        } catch {
            tags = null;
        }
        if (!Array.isArray(tags)) return;
        tags.forEach(t => {
            if (!tagThemeSpread[t]) tagThemeSpread[t] = new Set();
            tagThemeSpread[t].add(ct);
        });
    });
    // Tags appearing across 5+ different consolidated themes are generic/cross-cutting
    const genericTags = new Set();
    for (const [tag, themes] of Object.entries(tagThemeSpread)) {
        if (themes.size >= 5) genericTags.add(tag);
    }

    const tagCounts = {};
    let hasThemesAll = false;
    themeGames.forEach(g => {
        let tags;
        try {
            tags = typeof g.themes_all === 'string' ? JSON.parse(g.themes_all) : g.themes_all;
        } catch {
            tags = null;
        }
        if (!Array.isArray(tags) || !tags.length) return;
        hasThemesAll = true;
        tags.forEach(t => {
            if (t.toLowerCase() === consolidatedLower) return;
            if (genericTags.has(t)) return;
            if (consolidatedNames.has(t.toLowerCase())) return;
            tagCounts[t] = (tagCounts[t] || 0) + 1;
        });
    });

    const total = themeGames.length;

    if (hasThemesAll && Object.keys(tagCounts).length > 0) {
        return Object.entries(tagCounts)
            .filter(([, n]) => n >= 2)
            .map(([label, count]) => ({ label, count, pct: (count / total) * 100 }))
            .sort((a, b) => b.count - a.count);
    }

    // Fallback: use theme_primary when themes_all is empty
    const primaryCounts = {};
    themeGames.forEach(g => {
        const p = String(g.theme_primary || '').trim() || 'Unknown';
        if (p.toLowerCase() !== consolidatedLower) {
            primaryCounts[p] = (primaryCounts[p] || 0) + 1;
        }
    });
    return Object.entries(primaryCounts)
        .filter(([, n]) => n >= 2)
        .map(([label, count]) => ({ label, count, pct: (count / total) * 100 }))
        .sort((a, b) => b.count - a.count);
}

function renderRuntimeSubThemeBreakdownSection(rows) {
    if (!rows.length) return '';

    const INITIAL_SHOW = 5;
    const uid = 'stb-' + Math.random().toString(36).slice(2, 8);

    const makeRow = ({ label, count, pct }) => {
        const w = Math.min(100, Math.max(0, Math.round(pct)));
        const pctStr = pct >= 10 || pct === Math.round(pct) ? `${Math.round(pct)}` : pct.toFixed(1);
        return `<div class="flex items-center gap-2">
      <span class="text-[11px] font-medium text-gray-800 dark:text-gray-200 w-24 truncate" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
      <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div class="h-full bg-indigo-400 dark:bg-indigo-500 rounded-full" style="width:${w}%"></div>
      </div>
      <span class="text-[10px] text-gray-500 dark:text-gray-400 w-20 text-right">${count} (${pctStr}%)</span>
    </div>`;
    };

    const visibleRows = rows.slice(0, INITIAL_SHOW).map(makeRow).join('');
    const hiddenRows = rows.slice(INITIAL_SHOW).map(makeRow).join('');
    const hasMore = rows.length > INITIAL_SHOW;

    return `<div class="mb-4">
  <h4 class="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
    <span>📂</span> Theme Crossovers <span class="text-[10px] font-normal text-gray-400">(${rows.length})</span>
    <div class="relative group ml-1 inline-flex"><button class="w-3.5 h-3.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-400 hover:bg-indigo-100 hover:text-indigo-600 flex items-center justify-center text-[8px] font-bold leading-none">?</button><span class="hidden group-hover:block absolute left-0 top-full mt-1 w-48 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-[9999] text-[10px] text-gray-600 dark:text-gray-400 leading-relaxed font-normal">Other theme tags that co-occur with games in this theme.</span></div>
  </h4>
  <div class="space-y-1.5">
    ${visibleRows}
    ${
        hasMore
            ? `<div id="${uid}-more" class="hidden space-y-1.5">${hiddenRows}</div>
    <button id="${uid}-btn" onclick="(function(){var m=document.getElementById('${uid}-more'),b=document.getElementById('${uid}-btn');if(m.classList.contains('hidden')){m.classList.remove('hidden');b.textContent='Show less';}else{m.classList.add('hidden');b.textContent='Show ${rows.length - INITIAL_SHOW} more…';}})()" class="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium mt-1 cursor-pointer">Show ${rows.length - INITIAL_SHOW} more…</button>`
            : ''
    }
  </div>
</div>`;
}

window._toggleCL = function (uid, initialShow, totalCount) {
    const itemsEl = document.getElementById(uid + '-items');
    const btn = document.getElementById(uid + '-btn');
    if (!itemsEl || !btn) return;
    const items = itemsEl.querySelectorAll('[data-cl-item]');
    const isExpanded = btn.dataset.expanded === '1';
    for (let i = 0; i < items.length; i++) {
        if (i >= initialShow) items[i].style.display = isExpanded ? 'none' : '';
    }
    btn.dataset.expanded = isExpanded ? '0' : '1';
    btn.textContent = isExpanded ? 'Show all ' + totalCount + ' items' : 'Show less';
};

window.showThemeForProvider = function (theme, provider) {
    window.showThemeDetails(theme, { provider });
};
window.showMechForProvider = function (mechanic, provider) {
    window.showMechanicDetails(mechanic, { provider });
};

window.showMechanicDetails = function (mechanicName, opts) {
    const scopeProvider = opts?.provider || null;
    const mechDef = getMechanicDefinition(mechanicName);
    const mechData = gameData.mechanics.find(m => m.Mechanic === mechanicName);

    if (!mechData) {
        console.error('Mechanic data not found:', mechanicName);
        return;
    }

    const titleEl = document.getElementById('mechanic-panel-title');
    if (titleEl) {
        if (scopeProvider) {
            titleEl.innerHTML = `<span class="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showMechanicDetails', mechanicName)}">${escapeHtml(mechanicName)}</span> <span class="text-gray-400 font-normal">›</span> <span class="text-gray-500 dark:text-gray-400 font-normal text-sm">${escapeHtml(scopeProvider)}</span>`;
        } else {
            titleEl.textContent = mechanicName;
        }
    }

    let allMechGames = gameData.allGames.filter(g => parseFeatures(g.features).includes(mechanicName));
    if (scopeProvider) {
        allMechGames = allMechGames.filter(g => F.provider(g) === scopeProvider);
    }
    allMechGames.sort((a, b) => (F.theoWin(b) || 0) - (F.theoWin(a) || 0));

    const scopedAvgTheo =
        allMechGames.length > 0 ? allMechGames.reduce((s, g) => s + (F.theoWin(g) || 0), 0) / allMechGames.length : 0;

    const statsMetrics = scopeProvider
        ? [
              { label: 'Games', value: allMechGames.length },
              { label: 'Provider', value: scopeProvider },
              { label: 'Avg Theo Win', value: scopedAvgTheo.toFixed(3) },
              { label: 'Global Avg', value: mechData['Avg Theo Win Index'].toFixed(3) },
          ]
        : [
              { label: 'Games', value: mechData['Game Count'] },
              { label: 'Market Share', value: `${mechData['Market Share %'].toFixed(1)}%` },
              { label: 'Avg Theo Win', value: mechData['Avg Theo Win Index'].toFixed(3) },
              {
                  label: 'Smart Index',
                  value: `<span class="text-green-600 dark:text-green-400">${mechData['Smart Index'].toFixed(2)}</span>`,
              },
          ];

    const effectiveCount = scopeProvider ? allMechGames.length : mechData['Game Count'];
    const effectiveShare = scopeProvider ? null : mechData['Market Share %'];
    const description = mechDef?.description || `${mechanicName} is a game feature found in ${effectiveCount} games.`;
    const howItWorks = mechDef?.whatItDoes || '';
    const freqText = mechDef?.frequency || 'Common in modern slot games';
    const usageInfo = !effectiveShare
        ? ''
        : effectiveShare > 50
          ? ' • Industry standard feature'
          : effectiveShare > 10
            ? ' • Popular feature'
            : ' • Specialty feature';
    const frequency = freqText + usageInfo;

    let examplesHtml;
    const allGamesLookup = gameData.allGames || [];
    const exampleGamesRaw = scopeProvider ? allMechGames.slice(0, 10) : (mechDef?.examples || []).slice(0, 10);
    if (exampleGamesRaw.length > 0) {
        examplesHtml = exampleGamesRaw
            .map(ex => {
                const isObj = typeof ex === 'object' && ex !== null;
                const gameName = isObj
                    ? ex.name || 'Unknown'
                    : String(ex)
                          .replace(/\s*\([^)]*\)$/, '')
                          .trim();
                const matchedGame = isObj
                    ? ex
                    : allGamesLookup.find(g => g.name === gameName) ||
                      allGamesLookup.find(g => g.name.toLowerCase().startsWith(gameName.toLowerCase())) ||
                      allGamesLookup.find(g => g.name.toLowerCase().includes(gameName.toLowerCase()));
                const resolvedName = matchedGame ? matchedGame.name : gameName;
                const provName = matchedGame ? F.provider(matchedGame) : '';
                const theo = matchedGame ? F.theoWin(matchedGame) : null;
                const clickAttr = matchedGame
                    ? `onclick="${safeOnclick('window.showGameDetails', resolvedName)}" class="flex items-center gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded px-1 transition-colors"`
                    : `class="flex items-center gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0 rounded px-1 opacity-60"`;
                return `<div ${clickAttr}>
                <div class="flex-1 min-w-0">
                    <div class="text-[13px] font-medium text-gray-800 dark:text-gray-200 truncate">${escapeHtml(resolvedName)}</div>
                    ${provName ? `<div class="text-[10px] text-gray-400 dark:text-gray-500 truncate">${escapeHtml(provName)}</div>` : ''}
                </div>
                ${theo != null && theo > 0 ? `<div class="flex-shrink-0 text-right"><span class="text-xs font-bold text-gray-700 dark:text-gray-300">${Number(theo).toFixed(1)}</span><span class="text-[8px] text-gray-400 block leading-none">theo</span></div>` : ''}
            </div>`;
            })
            .join('');
    } else {
        examplesHtml = '<div class="py-1.5 text-sm text-gray-400">No examples available</div>';
    }

    const INITIAL_SHOW = 5;
    const topGamesItems = allMechGames
        .map((game, i) => {
            const hidden = i >= INITIAL_SHOW ? ' style="display:none"' : '';
            return `<div data-cl-item${hidden}>${GameListItem(game)}</div>`;
        })
        .join('');

    let topGamesHtml;
    if (allMechGames.length > 0) {
        topGamesHtml = collapsibleList(topGamesItems, allMechGames.length, INITIAL_SHOW, 'mech-games');
    } else {
        topGamesHtml = EmptyState('No games found for this mechanic');
    }

    const mechPanelContent = document.getElementById('mechanic-panel-content');
    let mechHtml = '';

    if (scopeProvider) {
        mechHtml += `<div class="mx-4 mb-3 px-3 py-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
            <span class="text-xs text-indigo-700 dark:text-indigo-300">Filtered to <strong>${escapeHtml(scopeProvider)}</strong></span>
            <button class="flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 px-2.5 py-1 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors" onclick="${safeOnclick('window.showProviderDetails', scopeProvider)}">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                Back to ${escapeHtml(scopeProvider)}
            </button>
        </div>`;
    }

    mechHtml += PanelSection({
        title: 'Statistics',
        icon: '📊',
        gradient: GRADIENTS.performance,
        accent: ACCENTS.performance,
        content: MetricGrid(statsMetrics),
    });
    const descContent = `
        <div class="space-y-3">
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${escapeHtml(description)}</p>
            ${
                howItWorks
                    ? `
                <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-1">How It Works</div>
                    <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${escapeHtml(howItWorks)}</p>
                </div>
            `
                    : ''
            }
            <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                <svg class="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                <span>${escapeHtml(frequency)}</span>
            </div>
        </div>
    `;
    mechHtml += PanelSection({
        title: 'Description',
        icon: '📖',
        gradient: GRADIENTS.themes,
        accent: ACCENTS.themes,
        content: descContent,
    });
    mechHtml += PanelSection({
        title: 'Example Games',
        icon: '🎰',
        gradient: GRADIENTS.games,
        accent: ACCENTS.games,
        content: `<div class="space-y-0">${examplesHtml}</div>`,
    });
    mechHtml += PanelSection({
        title: `Top Games (${allMechGames.length})`,
        icon: '🏆',
        gradient: GRADIENTS.similar,
        accent: ACCENTS.similar,
        content: `<div class="space-y-0">${topGamesHtml}</div>`,
    });
    if (mechPanelContent) mechPanelContent.innerHTML = mechHtml;

    window.closeAllPanels('mechanic-panel');
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
};

import { restorePageScroll } from './panel-utils.js';

window.closeMechanicPanel = function () {
    const panel = document.getElementById('mechanic-panel');
    const bg = document.getElementById('mechanic-backdrop');
    if (panel) panel.style.right = '-650px';
    if (bg) {
        bg.classList.add('hidden');
        bg.classList.remove('block');
    }
    restorePageScroll(panel);
};

window.closeAllPanels = function (except) {
    const panelIds = ['mechanic-panel', 'theme-panel', 'game-panel', 'provider-panel'];
    const panels = panelIds.filter(id => id !== except).map(id => document.getElementById(id));
    panels.forEach(el => {
        if (el) el.style.right = '-650px';
    });
    if (!except) {
        const bg = document.getElementById('mechanic-backdrop');
        if (bg) {
            bg.classList.add('hidden');
            bg.classList.remove('block');
        }
    }
    restorePageScroll(...panels.filter(Boolean));
};

window.closeAnyPanel = function () {
    window.closeAllPanels();
};

window.showThemeDetails = function (themeName, opts) {
    const scopeProvider = opts?.provider || null;

    let themeData = gameData.themes.find(t => (t.Theme || '').toLowerCase() === themeName.toLowerCase());

    if (!themeData && gameData.themeConsolidationMap) {
        const mapped = Object.entries(gameData.themeConsolidationMap).find(
            ([k]) => typeof k === 'string' && k.toLowerCase() === themeName.toLowerCase()
        );
        if (mapped && typeof mapped[1] === 'string') {
            const consolidated = gameData.themes.find(t => (t.Theme || '').toLowerCase() === mapped[1].toLowerCase());
            if (consolidated) {
                themeData = consolidated;
                themeName = consolidated.Theme;
            }
        }
    }

    const titleEl = document.getElementById('theme-panel-title');
    if (titleEl) {
        if (scopeProvider) {
            titleEl.innerHTML = `<span class="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showThemeDetails', themeName)}">${escapeHtml(themeName)}</span> <span class="text-gray-400 font-normal">›</span> <span class="text-gray-500 dark:text-gray-400 font-normal text-sm">${escapeHtml(scopeProvider)}</span>`;
        } else {
            titleEl.textContent = themeName;
        }
    }

    const allGames = gameData.allGames || [];
    let themeGames = allGames.filter(g => {
        const primary = F.themeConsolidated(g);
        if (primary.toLowerCase() === themeName.toLowerCase()) return true;
        const all = F.themesAll(g);
        return Array.isArray(all) && all.some(t => t.toLowerCase() === themeName.toLowerCase());
    });

    if (scopeProvider) {
        themeGames = themeGames.filter(g => F.provider(g) === scopeProvider);
    }

    if (!themeData && themeGames.length === 0) {
        console.error('Theme not found:', themeName);
        return;
    }

    const avgTheo =
        themeGames.length > 0 ? themeGames.reduce((s, g) => s + (F.theoWin(g) || 0), 0) / themeGames.length : 0;
    const maxTheo = themeGames.length > 0 ? Math.max(...themeGames.map(g => F.theoWin(g) || 0)) : 0;
    const minTheo = themeGames.length > 0 ? Math.min(...themeGames.map(g => F.theoWin(g) || 0)) : 0;
    const providers = new Set(themeGames.map(g => F.provider(g)));

    const marketShare = themeData ? (themeData['Market Share %'] || 0).toFixed(1) : '—';
    const statsMetrics = [
        { label: 'Games', value: themeGames.length },
        {
            label: scopeProvider ? 'Provider' : 'Market Share',
            value: scopeProvider ? scopeProvider : `${marketShare}%`,
        },
        { label: 'Avg Theo Win', value: avgTheo.toFixed(2) },
        { label: 'Range', value: `${minTheo.toFixed(1)} – ${maxTheo.toFixed(1)}` },
    ];

    const breakdown = themeBreakdowns?.[themeName];
    const runtimeSubRows = buildRuntimeSubThemeRows(themeGames, themeName);
    const runtimeSubHtml = renderRuntimeSubThemeBreakdownSection(runtimeSubRows);

    let descContent;
    if (breakdown) {
        const desc = breakdown.description || `Games themed around ${themeName.toLowerCase()}.`;
        const subThemes = breakdown.sub_themes || [];
        descContent = `
            <div class="space-y-3">
                <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${escapeHtml(desc)}</p>
                ${
                    subThemes.length > 0
                        ? `
                    <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800">
                        <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-1">Sub-themes</div>
                        <div class="flex flex-wrap gap-1.5 mt-1">${subThemes.map(s => `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 ring-1 ring-inset ring-gray-200 dark:ring-gray-600">${escapeHtml(s)}</span>`).join('')}</div>
                    </div>
                `
                        : ''
                }
                ${runtimeSubHtml}
            </div>
        `;
    } else {
        const gameCountLabel = themeData ? themeData['Game Count'] : themeGames.length;
        descContent = `
            <div class="space-y-3">
                <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Games themed around ${escapeHtml(themeName.toLowerCase())}. ${scopeProvider ? `${escapeHtml(scopeProvider)} has ${themeGames.length} games in this theme.` : `This theme has ${gameCountLabel} games across ${providers.size} providers.`}</p>
                ${runtimeSubHtml}
            </div>
        `;
    }

    const PROV_INITIAL = 8;
    const sortedProviders = Array.from(providers).sort();
    const providerItemsHtml = sortedProviders
        .map((p, i) => {
            const pGames = themeGames.filter(g => F.provider(g) === p);
            const pAvg = pGames.reduce((s, g) => s + (F.theoWin(g) || 0), 0) / (pGames.length || 1);
            const hidden = i >= PROV_INITIAL ? ' style="display:none"' : '';
            return `<div data-cl-item${hidden} class="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showProviderDetails', p)}">
            <span class="text-sm text-gray-700 dark:text-gray-300">${escapeHtml(p)}</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">${pGames.length} games · ${pAvg.toFixed(2)} avg</span>
        </div>`;
        })
        .join('');
    const providerContent =
        sortedProviders.length > PROV_INITIAL
            ? collapsibleList(providerItemsHtml, sortedProviders.length, PROV_INITIAL, 'theme-providers')
            : providerItemsHtml;

    const INITIAL_SHOW = 5;
    const sortedGames = [...themeGames].sort((a, b) => (F.theoWin(b) || 0) - (F.theoWin(a) || 0));
    const topGamesItems = sortedGames
        .map((game, i) => {
            const hidden = i >= INITIAL_SHOW ? ' style="display:none"' : '';
            return `<div data-cl-item${hidden}>${GameListItem(game)}</div>`;
        })
        .join('');

    let topGamesHtml;
    if (sortedGames.length > 0) {
        topGamesHtml = collapsibleList(topGamesItems, sortedGames.length, INITIAL_SHOW, 'theme-games');
    } else {
        topGamesHtml = EmptyState('No games found for this theme');
    }

    const featureMap = {};
    themeGames.forEach(g => {
        parseFeatures(g.features).forEach(f => {
            if (!featureMap[f]) featureMap[f] = { count: 0, totalTheo: 0 };
            featureMap[f].count++;
            featureMap[f].totalTheo += F.theoWin(g) || 0;
        });
    });
    const topFeatures = Object.entries(featureMap)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);

    let featuresHtml;
    if (topFeatures.length > 0) {
        featuresHtml = `<div class="space-y-1.5">${topFeatures
            .map(([f, d]) => {
                const avg = d.totalTheo / d.count;
                const pct = ((d.count / themeGames.length) * 100).toFixed(0);
                return `<div class="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <span class="text-sm text-gray-700 dark:text-gray-300">${escapeHtml(f)}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400">${d.count} games (${pct}%) · ${avg.toFixed(2)} avg</span>
            </div>`;
            })
            .join('')}</div>`;
    } else {
        featuresHtml = EmptyState('No feature data available');
    }

    const themePanelContent = document.getElementById('theme-panel-content');
    let html = '';

    if (scopeProvider) {
        html += `<div class="mx-4 mb-3 px-3 py-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
            <span class="text-xs text-indigo-700 dark:text-indigo-300">Filtered to <strong>${escapeHtml(scopeProvider)}</strong></span>
            <button class="flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 px-2.5 py-1 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors" onclick="${safeOnclick('window.showProviderDetails', scopeProvider)}">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                Back to ${escapeHtml(scopeProvider)}
            </button>
        </div>`;
    }

    html += PanelSection({
        title: 'Statistics',
        icon: '📊',
        gradient: GRADIENTS.performance,
        accent: ACCENTS.performance,
        content: MetricGrid(statsMetrics),
    });
    html += PanelSection({
        title: 'About',
        icon: '📖',
        gradient: GRADIENTS.themes,
        accent: ACCENTS.themes,
        content: descContent,
    });
    if (!scopeProvider) {
        html += PanelSection({
            title: `Providers (${providers.size})`,
            icon: '🏢',
            gradient: GRADIENTS.providers,
            accent: ACCENTS.providers,
            content: providerContent || EmptyState('No provider data'),
        });
    }
    html += PanelSection({
        title: `Top Games (${sortedGames.length})`,
        icon: '🏆',
        gradient: GRADIENTS.similar,
        accent: ACCENTS.similar,
        content: `<div class="space-y-0">${topGamesHtml}</div>`,
    });
    html += PanelSection({
        title: `Features (${topFeatures.length})`,
        icon: '⚙️',
        gradient: GRADIENTS.games,
        accent: ACCENTS.games,
        content: featuresHtml,
    });
    if (themePanelContent) themePanelContent.innerHTML = html;

    window.closeAllPanels('theme-panel');
    const panel = document.getElementById('theme-panel');
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
};

window.closeThemePanel = function () {
    const panel = document.getElementById('theme-panel');
    const bg = document.getElementById('mechanic-backdrop');
    if (panel) panel.style.right = '-650px';
    if (bg) {
        bg.classList.add('hidden');
        bg.classList.remove('block');
    }
    restorePageScroll(panel);
};
