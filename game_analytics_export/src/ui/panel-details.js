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
    EmptyState
} from '../components/dashboard-components.js';
import { log } from '../lib/env.js';
import { collapsibleList } from './collapsible-list.js';

let themeBreakdowns = null;
(async function loadThemeBreakdowns() {
    try {
        let response;
        try { response = await fetch('/api/data/theme-breakdowns', { credentials: 'same-origin' }); } catch { /* API unavailable, fall back to static */ }
        if (!response || !response.ok) response = await fetch('./src/config/theme-breakdowns.json');
        const data = await response.json();
        themeBreakdowns = data.themes;
        log('✅ Theme breakdowns loaded:', Object.keys(themeBreakdowns).length, 'themes');
    } catch (error) {
        console.error('Failed to load theme breakdowns:', error);
    }
})();

window._toggleCL = function(uid, initialShow, totalCount) {
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

window.showMechanicDetails = function(mechanicName) {
    const mechDef = getMechanicDefinition(mechanicName);
    const mechData = gameData.mechanics.find(m => m.Mechanic === mechanicName);
    
    if (!mechData) {
        console.error('Mechanic data not found:', mechanicName);
        return;
    }
    
    document.getElementById('mechanic-panel-title').textContent = mechanicName;
    
    const statsMetrics = [
        { label: 'Games', value: mechData['Game Count'] },
        { label: 'Market Share', value: `${mechData['Market Share %'].toFixed(1)}%` },
        { label: 'Avg Theo Win', value: mechData['Avg Theo Win Index'].toFixed(3) },
        { label: 'Total Theo Win', value: `<span class="text-green-600 dark:text-green-400">${mechData['Smart Index'].toFixed(2)}</span>` }
    ];
    
    const description = mechDef?.description || `${mechanicName} is a game feature found in ${mechData['Game Count']} games.`;
    const howItWorks = mechDef?.whatItDoes || '';
    const freqText = mechDef?.frequency || 'Common in modern slot games';
    const usageInfo = mechData['Market Share %'] > 50
        ? ' • Industry standard feature'
        : mechData['Market Share %'] > 10
            ? ' • Popular feature'
            : ' • Specialty feature';
    const frequency = freqText + usageInfo;
    
    let examplesHtml;
    if (mechDef?.examples && mechDef.examples.length > 0) {
        examplesHtml = mechDef.examples.slice(0, 10).map(ex => {
            const gameName = ex.replace(/\s*\([^)]*\)$/, '').trim();
            return `<li class="py-1.5 leading-relaxed cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showGameDetails', gameName)}">${escapeHtml(ex)}</li>`;
        }).join('');
    } else {
        examplesHtml = '<li class="py-1.5 mechanic-panel-body">No examples available</li>';
    }
    
    const allMechGames = gameData.allGames.filter(g => {
        return parseFeatures(g.features).includes(mechanicName);
    }).sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));
    
    const INITIAL_SHOW = 5;
    const topGamesItems = allMechGames.map((game, i) => {
        const hidden = i >= INITIAL_SHOW ? ' style="display:none"' : '';
        return `<div data-cl-item${hidden}>${GameListItem(game)}</div>`;
    }).join('');
    
    let topGamesHtml;
    if (allMechGames.length > 0) {
        topGamesHtml = collapsibleList(topGamesItems, allMechGames.length, INITIAL_SHOW, 'mech-games');
    } else {
        topGamesHtml = EmptyState('No games found for this mechanic');
    }
    
    const mechPanelContent = document.getElementById('mechanic-panel-content');
    let mechHtml = '';
    mechHtml += PanelSection({ title: 'Statistics', icon: '📊', gradient: GRADIENTS.performance, accent: ACCENTS.performance, content: MetricGrid(statsMetrics) });
    const descContent = `
        <div class="space-y-3">
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${escapeHtml(description)}</p>
            ${howItWorks ? `
                <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-1">How It Works</div>
                    <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${escapeHtml(howItWorks)}</p>
                </div>
            ` : ''}
            <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                <svg class="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>
                <span>${escapeHtml(frequency)}</span>
            </div>
        </div>
    `;
    mechHtml += PanelSection({ title: 'Description', icon: '📖', gradient: GRADIENTS.themes, accent: ACCENTS.themes, content: descContent });
    mechHtml += PanelSection({ title: 'Example Games', icon: '🎰', gradient: GRADIENTS.games, accent: ACCENTS.games, content: `<ul class="mechanic-panel-body text-sm text-gray-700 dark:text-gray-300 space-y-0">${examplesHtml}</ul>` });
    mechHtml += PanelSection({ title: `Top Games (${allMechGames.length})`, icon: '🏆', gradient: GRADIENTS.similar, accent: ACCENTS.similar, content: `<div class="space-y-0">${topGamesHtml}</div>` });
    mechPanelContent.innerHTML = mechHtml;
    
    window.closeAllPanels();
    const panel = document.getElementById('mechanic-panel');
    const bg = document.getElementById('mechanic-backdrop');
    if (panel) panel.style.right = '0px';
    if (bg) { bg.classList.remove('hidden'); bg.classList.add('block'); }
};

window.closeMechanicPanel = function() {
    const panel = document.getElementById('mechanic-panel');
    const bg = document.getElementById('mechanic-backdrop');
    if (panel) panel.style.right = '-650px';
    if (bg) {
        bg.classList.add('hidden');
        bg.classList.remove('block');
    }
};

window.closeAllPanels = function() {
    ['mechanic-panel', 'theme-panel', 'game-panel', 'provider-panel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.right = '-650px';
    });
    const bg = document.getElementById('mechanic-backdrop');
    if (bg) {
        bg.classList.add('hidden');
        bg.classList.remove('block');
    }
};

window.closeAnyPanel = function() {
    window.closeAllPanels();
};

window.showThemeDetails = function(themeName) {
    const themeData = gameData.themes.find(t => t.Theme === themeName);
    if (!themeData) {
        console.error('Theme not found:', themeName);
        return;
    }

    document.getElementById('theme-panel-title').textContent = themeName;

    const allGames = gameData.allGames || [];
    const themeGames = allGames.filter(g => {
        const t = g.theme_consolidated || g.theme || '';
        return t.toLowerCase() === themeName.toLowerCase();
    });

    const avgTheo = themeGames.length > 0
        ? themeGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / themeGames.length
        : 0;
    const maxTheo = themeGames.length > 0
        ? Math.max(...themeGames.map(g => g.performance_theo_win || 0))
        : 0;
    const minTheo = themeGames.length > 0
        ? Math.min(...themeGames.map(g => g.performance_theo_win || 0))
        : 0;
    const providers = new Set(themeGames.map(g => g.provider_studio || g.provider || 'Unknown'));

    const statsMetrics = [
        { label: 'Games', value: themeData['Game Count'] },
        { label: 'Market Share', value: `${(themeData['Market Share %'] || 0).toFixed(1)}%` },
        { label: 'Avg Theo Win', value: avgTheo.toFixed(2) },
        { label: 'Range', value: `${minTheo.toFixed(1)} – ${maxTheo.toFixed(1)}` }
    ];

    const breakdown = themeBreakdowns?.[themeName];
    let descContent;
    if (breakdown) {
        const desc = breakdown.description || `Games themed around ${themeName.toLowerCase()}.`;
        const subThemes = breakdown.sub_themes || [];
        descContent = `
            <div class="space-y-3">
                <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">${escapeHtml(desc)}</p>
                ${subThemes.length > 0 ? `
                    <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800">
                        <div class="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-1">Sub-themes</div>
                        <div class="flex flex-wrap gap-1.5 mt-1">${subThemes.map(s => `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 ring-1 ring-inset ring-gray-200 dark:ring-gray-600">${escapeHtml(s)}</span>`).join('')}</div>
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        descContent = `<p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Games themed around ${escapeHtml(themeName.toLowerCase())}. This theme has ${themeData['Game Count']} games across ${providers.size} providers.</p>`;
    }

    const providerItems = Array.from(providers).sort().map(p => {
        const pGames = themeGames.filter(g => (g.provider_studio || g.provider || '') === p);
        const pAvg = pGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / (pGames.length || 1);
        return `<div class="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showProviderDetails', p)}">
            <span class="text-sm text-gray-700 dark:text-gray-300">${escapeHtml(p)}</span>
            <span class="text-xs text-gray-500 dark:text-gray-400">${pGames.length} games · ${pAvg.toFixed(2)} avg</span>
        </div>`;
    }).join('');

    const INITIAL_SHOW = 5;
    const sortedGames = [...themeGames].sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));
    const topGamesItems = sortedGames.map((game, i) => {
        const hidden = i >= INITIAL_SHOW ? ' style="display:none"' : '';
        return `<div data-cl-item${hidden}>${GameListItem(game)}</div>`;
    }).join('');

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
            featureMap[f].totalTheo += g.performance_theo_win || 0;
        });
    });
    const topFeatures = Object.entries(featureMap)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10);
    
    let featuresHtml;
    if (topFeatures.length > 0) {
        featuresHtml = `<div class="space-y-1.5">${topFeatures.map(([f, d]) => {
            const avg = d.totalTheo / d.count;
            const pct = ((d.count / themeGames.length) * 100).toFixed(0);
            return `<div class="flex items-center justify-between py-1 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <span class="text-sm text-gray-700 dark:text-gray-300">${escapeHtml(f)}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400">${d.count} games (${pct}%) · ${avg.toFixed(2)} avg</span>
            </div>`;
        }).join('')}</div>`;
    } else {
        featuresHtml = EmptyState('No feature data available');
    }

    const themePanelContent = document.getElementById('theme-panel-content');
    let html = '';
    html += PanelSection({ title: 'Statistics', icon: '📊', gradient: GRADIENTS.performance, accent: ACCENTS.performance, content: MetricGrid(statsMetrics) });
    html += PanelSection({ title: 'About', icon: '📖', gradient: GRADIENTS.themes, accent: ACCENTS.themes, content: descContent });
    html += PanelSection({ title: `Providers (${providers.size})`, icon: '🏢', gradient: GRADIENTS.providers, accent: ACCENTS.providers, content: providerItems || EmptyState('No provider data') });
    html += PanelSection({ title: `Top Games (${sortedGames.length})`, icon: '🏆', gradient: GRADIENTS.similar, accent: ACCENTS.similar, content: `<div class="space-y-0">${topGamesHtml}</div>` });
    html += PanelSection({ title: `Features (${topFeatures.length})`, icon: '⚙️', gradient: GRADIENTS.games, accent: ACCENTS.games, content: featuresHtml });
    themePanelContent.innerHTML = html;

    window.closeAllPanels();
    const panel = document.getElementById('theme-panel');
    const bg = document.getElementById('mechanic-backdrop');
    if (panel) panel.style.right = '0px';
    if (bg) { bg.classList.remove('hidden'); bg.classList.add('block'); }
};

window.closeThemePanel = function() {
    const panel = document.getElementById('theme-panel');
    const bg = document.getElementById('mechanic-backdrop');
    if (panel) panel.style.right = '-650px';
    if (bg) {
        bg.classList.add('hidden');
        bg.classList.remove('block');
    }
};
