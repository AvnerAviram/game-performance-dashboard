// Mechanic and Theme detail slide-out panels
import { gameData } from '../lib/data.js';
import { getMechanicDefinition } from '../config/mechanics.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../lib/sanitize.js';
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

function openDetailPanel() {
    if (window.closeAllPanels) window.closeAllPanels('theme-panel');
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
}

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

function _artBarRow(label, count, total) {
    const pct = total > 0 ? (count / total) * 100 : 0;
    const pctStr = pct >= 10 || pct === Math.round(pct) ? `${Math.round(pct)}` : pct.toFixed(1);
    const w = Math.min(100, Math.max(2, Math.round(pct)));
    return `<div class="py-1">
      <div class="flex items-baseline justify-between mb-0.5">
        <span class="text-[11px] font-medium text-gray-800 dark:text-gray-200">${escapeHtml(label)}</span>
        <span class="text-[10px] text-gray-500 dark:text-gray-400 ml-2 shrink-0">${count} (${pctStr}%)</span>
      </div>
      <div class="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div class="h-full bg-indigo-400 dark:bg-indigo-500 rounded-full" style="width:${w}%"></div>
      </div>
    </div>`;
}

function _renderArtSubSection(title, icon, rows, total, initialShow) {
    if (!rows.length) return '';
    const uid = 'art-' + Math.random().toString(36).slice(2, 8);
    const visible = rows
        .slice(0, initialShow)
        .map(([l, c]) => _artBarRow(l, c, total))
        .join('');
    const hidden = rows
        .slice(initialShow)
        .map(([l, c]) => _artBarRow(l, c, total))
        .join('');
    const hasMore = rows.length > initialShow;

    const header =
        title != null
            ? `<h4 class="text-[11px] font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
    <span class="text-xs">${icon}</span> ${escapeHtml(title)} <span class="font-normal">(${rows.length})</span>
  </h4>`
            : '';

    return `<div class="mb-3">
  ${header}
  <div class="space-y-0.5">
    ${visible}
    ${
        hasMore
            ? `<div id="${uid}-more" class="hidden space-y-0.5">${hidden}</div>
    <button id="${uid}-btn" onclick="(function(){var m=document.getElementById('${uid}-more'),b=document.getElementById('${uid}-btn');if(m.classList.contains('hidden')){m.classList.remove('hidden');b.textContent='Show less';}else{m.classList.add('hidden');b.textContent='Show ${rows.length - initialShow} more…';}})()" class="text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium mt-1 cursor-pointer">Show ${rows.length - initialShow} more…</button>`
            : ''
    }
  </div>
</div>`;
}

function _renderArtProfileContent(settings, moods, characters, total) {
    let html = '';
    html += _renderArtSubSection('Environments', '🌍', settings, total, 5);
    html += _renderArtSubSection('Moods', '🎭', moods, total, 5);
    if (characters.length) {
        html += _renderArtSubSection('Characters', '👤', characters, total, 5);
    }
    return html || EmptyState('No art data');
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
              { label: 'Avg Performance Index', value: scopedAvgTheo.toFixed(3) },
              { label: 'Global Avg', value: mechData['Avg Theo Win Index'].toFixed(3) },
          ]
        : [
              { label: 'Games', value: mechData['Game Count'] },
              { label: 'Market Share %', value: `${mechData['Market Share %'].toFixed(1)}%` },
              { label: 'Avg Performance Index', value: mechData['Avg Theo Win Index'].toFixed(3) },
              {
                  label: 'Performance Index',
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
    const configExamples = mechDef?.examples || [];
    const exampleGamesRaw = scopeProvider
        ? allMechGames.slice(0, 10)
        : configExamples.length > 0
          ? configExamples.slice(0, 10)
          : allMechGames.slice(0, 10);
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
            <button class="flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 px-2.5 py-1 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors cursor-pointer" onclick="${safeOnclick('window.showProviderDetails', scopeProvider)}">
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
            label: scopeProvider ? 'Provider' : 'Market Share %',
            value: scopeProvider ? scopeProvider : `${marketShare}%`,
        },
        { label: 'Avg Performance Index', value: avgTheo.toFixed(2) },
        { label: 'Range', value: `${minTheo.toFixed(1)} – ${maxTheo.toFixed(1)}` },
    ];

    const breakdown = themeBreakdowns?.[themeName];

    let descContent;
    const desc = breakdown
        ? breakdown.description || `Games themed around ${themeName.toLowerCase()}.`
        : `Games themed around ${escapeHtml(themeName.toLowerCase())}. ${scopeProvider ? `${escapeHtml(scopeProvider)} has ${themeGames.length} games in this theme.` : `This theme has ${themeData ? themeData['Game Count'] : themeGames.length} games across ${providers.size} providers.`}`;
    descContent = `
        <div class="space-y-3">
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${desc}</p>
        </div>
    `;

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
            <button class="flex items-center gap-1.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 px-2.5 py-1 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors cursor-pointer" onclick="${safeOnclick('window.showProviderDetails', scopeProvider)}">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                Back to ${escapeHtml(scopeProvider)}
            </button>
        </div>`;
    }

    // --- Build Art Profile from art characterization data ---
    const artGames = themeGames.filter(g => F.artSetting(g));
    let artProfileHtml = '';
    if (artGames.length > 0) {
        const settingCounts = {};
        const moodCounts = {};
        const characterCounts = {};
        for (const g of artGames) {
            const s = F.artSetting(g);
            if (s) settingCounts[s] = (settingCounts[s] || 0) + 1;
            const m = F.artMood(g);
            if (m) moodCounts[m] = (moodCounts[m] || 0) + 1;
            const chars = F.artCharacters(g);
            if (Array.isArray(chars)) {
                chars.forEach(c => {
                    if (c && c !== 'No Characters (symbol-only game)')
                        characterCounts[c] = (characterCounts[c] || 0) + 1;
                });
            }
        }
        const sortedSettings = Object.entries(settingCounts).sort((a, b) => b[1] - a[1]);
        const sortedMoods = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
        const sortedCharacters = Object.entries(characterCounts)
            .filter(([, n]) => n >= 2)
            .sort((a, b) => b[1] - a[1]);

        artProfileHtml = _renderArtProfileContent(sortedSettings, sortedMoods, sortedCharacters, artGames.length);
    }

    // --- Assemble panel in order of importance ---
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
    html += PanelSection({
        title: `Top Games (${sortedGames.length})`,
        icon: '🏆',
        gradient: GRADIENTS.similar,
        accent: ACCENTS.similar,
        content: `<div class="space-y-0">${topGamesHtml}</div>`,
    });
    if (artProfileHtml) {
        html += PanelSection({
            title: `Art Profile (${artGames.length})`,
            icon: '🎨',
            gradient: GRADIENTS.category,
            accent: ACCENTS.category,
            content: artProfileHtml,
        });
    }
    html += PanelSection({
        title: `Mechanics (${topFeatures.length})`,
        icon: '⚙️',
        gradient: GRADIENTS.games,
        accent: ACCENTS.games,
        content: featuresHtml,
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

// ===== RTP Band Details ============================================
window.showRtpBandDetails = function (bandLabel) {
    const allGames = gameData.allGames || [];
    const bandGames = allGames.filter(g => {
        const rtp = g.specs_rtp || g.rtp;
        if (!rtp) return false;
        return bandLabel.includes(String(rtp).slice(0, 4)) || bandLabel.includes(String(Math.floor(rtp)));
    });

    const rtpParseRange = bandLabel.match(/([\d.]+)\s*-\s*([\d.]+)/);
    let filteredGames = allGames;
    if (rtpParseRange) {
        const lo = parseFloat(rtpParseRange[1]);
        const hi = parseFloat(rtpParseRange[2]);
        filteredGames = allGames.filter(g => {
            const rtp = g.specs_rtp || g.rtp;
            return rtp && rtp >= lo && rtp <= hi;
        });
    }
    filteredGames.sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));

    const titleEl = document.getElementById('theme-panel-title');
    if (titleEl) titleEl.textContent = `RTP: ${bandLabel}`;
    const contentEl = document.getElementById('theme-panel-content');
    if (!contentEl) return;

    const avgTheo = filteredGames.length
        ? filteredGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / filteredGames.length
        : 0;

    const statsSection = PanelSection({
        title: 'RTP Band Stats',
        icon: '📐',
        gradient: GRADIENTS.specs,
        accent: ACCENTS.specs,
        content: MetricGrid([
            { label: 'Games', value: filteredGames.length },
            { label: 'Avg Performance Index', value: avgTheo.toFixed(2) },
        ]),
    });

    const INITIAL = 10;
    const gamesList = filteredGames
        .slice(0, INITIAL)
        .map(g => GameListItem(g))
        .join('');

    const gamesSection = PanelSection({
        title: `Top Games (${filteredGames.length})`,
        icon: '🎰',
        gradient: GRADIENTS.performance,
        accent: ACCENTS.performance,
        content: `<div class="space-y-0">${gamesList}</div>`,
    });

    contentEl.innerHTML = statsSection + gamesSection;

    openDetailPanel();
};

// ===== Volatility Level Details ====================================
window.showVolatilityDetails = function (volLevel) {
    const allGames = gameData.allGames || [];
    const volGames = allGames
        .filter(g => {
            const v = (g.specs_volatility || g.volatility || '').trim();
            return v.toLowerCase() === volLevel.toLowerCase();
        })
        .sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));

    const titleEl = document.getElementById('theme-panel-title');
    if (titleEl) titleEl.textContent = `${volLevel} Volatility`;
    const contentEl = document.getElementById('theme-panel-content');
    if (!contentEl) return;

    const avgTheo = volGames.length
        ? volGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / volGames.length
        : 0;

    const statsSection = PanelSection({
        title: 'Volatility Stats',
        icon: '📊',
        gradient: GRADIENTS.specs,
        accent: ACCENTS.specs,
        content: MetricGrid([
            { label: 'Games', value: volGames.length },
            { label: 'Avg Performance Index', value: avgTheo.toFixed(2) },
        ]),
    });

    const INITIAL = 10;
    const gamesList = volGames
        .slice(0, INITIAL)
        .map(g => GameListItem(g))
        .join('');

    const gamesSection = PanelSection({
        title: `Top Games (${volGames.length})`,
        icon: '🎰',
        gradient: GRADIENTS.performance,
        accent: ACCENTS.performance,
        content: `<div class="space-y-0">${gamesList}</div>`,
    });

    contentEl.innerHTML = statsSection + gamesSection;

    openDetailPanel();
};

// ===== Franchise / Brand Details ====================================
window.showFranchiseDetails = function (franchiseName) {
    const allGames = gameData.allGames || [];
    const fGames = allGames
        .filter(g => F.franchise(g) === franchiseName)
        .sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));

    const titleEl = document.getElementById('theme-panel-title');
    if (titleEl) titleEl.textContent = `Brand: ${franchiseName}`;
    const contentEl = document.getElementById('theme-panel-content');
    if (!contentEl) return;

    const totalTheo = fGames.reduce((s, g) => s + F.theoWin(g), 0);
    const avgTheo = fGames.length ? totalTheo / fGames.length : 0;
    const totalShare = fGames.reduce((s, g) => s + F.marketShare(g), 0);
    const providers = [...new Set(fGames.map(g => F.provider(g)).filter(p => p && p !== 'Unknown'))];
    const themes = [...new Set(fGames.map(g => F.themeConsolidated(g)).filter(Boolean))];
    const years = fGames.map(g => F.originalReleaseYear(g)).filter(y => y > 0);
    const minYear = years.length ? Math.min(...years) : null;
    const maxYear = years.length ? Math.max(...years) : null;
    const yearRange = minYear && maxYear ? (minYear === maxYear ? `${minYear}` : `${minYear}–${maxYear}`) : 'N/A';

    const statsSection = PanelSection({
        title: 'Brand Stats',
        icon: '🏷️',
        gradient: GRADIENTS.performance,
        accent: ACCENTS.performance,
        content: MetricGrid([
            { label: 'Titles', value: fGames.length },
            { label: 'Avg Performance Index', value: avgTheo.toFixed(2) },
            { label: 'Market Share %', value: `${totalShare.toFixed(1)}%` },
            { label: 'Providers', value: providers.length },
            { label: 'Year Range', value: yearRange },
        ]),
    });

    const provSection = providers.length
        ? PanelSection({
              title: 'Providers',
              icon: '🏢',
              gradient: GRADIENTS.provider,
              accent: ACCENTS.provider,
              content: `<div class="flex flex-wrap gap-1.5">${providers.map(p => `<span class="px-2 py-0.5 text-xs rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">${escapeHtml(p)}</span>`).join('')}</div>`,
          })
        : '';

    const themeSection = themes.length
        ? PanelSection({
              title: 'Themes',
              icon: '🎨',
              gradient: GRADIENTS.specs,
              accent: ACCENTS.specs,
              content: `<div class="flex flex-wrap gap-1.5">${themes.map(t => `<span class="px-2 py-0.5 text-xs rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">${escapeHtml(t)}</span>`).join('')}</div>`,
          })
        : '';

    const INITIAL = 10;
    const gamesList = fGames
        .slice(0, INITIAL)
        .map(g => GameListItem(g))
        .join('');

    const gamesSection = PanelSection({
        title: `Titles (${fGames.length})`,
        icon: '🎰',
        gradient: GRADIENTS.release,
        accent: ACCENTS.release,
        content: `<div class="space-y-0">${gamesList}</div>`,
    });

    contentEl.innerHTML = statsSection + provSection + themeSection + gamesSection;

    openDetailPanel();
};
