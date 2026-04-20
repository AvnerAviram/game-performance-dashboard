// Insights & Anomalies page renderer
import { gameData, getActiveGames } from '../../lib/data.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../../lib/sanitize.js';
import { log } from '../../lib/env.js';
import { analyzeGameSuccessFactors, generateRecommendations } from '../../lib/game-analytics-engine.js';
import { parseFeatures } from '../../lib/parse-features.js';
import { F } from '../../lib/game-fields.js';

export function renderAnomalies() {
    log('⚡ renderAnomalies() called');
    const topDiv = document.getElementById('top-anomalies');
    const bottomDiv = document.getElementById('bottom-anomalies');

    log('  - top-anomalies element:', !!topDiv);
    log('  - bottom-anomalies element:', !!bottomDiv);

    if (!topDiv || !bottomDiv) {
        console.error('❌ Anomaly containers not found!');
        return;
    }

    topDiv.style.display = 'grid';
    topDiv.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))';
    bottomDiv.style.display = 'none';
    bottomDiv.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))';

    topDiv.innerHTML = '';
    bottomDiv.innerHTML = '';

    log('  - Top anomalies to render:', gameData.top_anomalies?.length || 0);
    log('  - Bottom anomalies to render:', gameData.bottom_anomalies?.length || 0);

    const topAnomalies = gameData.top_anomalies.slice(0, 30);
    log(`  - About to render ${topAnomalies.length} top anomalies...`);
    topAnomalies.forEach((a, index) => {
        try {
            const card = document.createElement('div');
            card.className =
                'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow duration-200';
            card.dataset.anomalyIndex = index;
            card.dataset.anomalyType = 'top';

            const themeData = a.themes.map(theme => gameData.themes.find(t => t.Theme === theme)).filter(Boolean);

            const smartInsights = analyzeGameSuccessFactors(a.game, a.theo_win_index, a.z_score, a.themes);
            const recommendations = generateRecommendations(smartInsights, a.themes, a.z_score);

            const gameObj = getActiveGames().find(g => g.name === a.game);
            const provider = gameObj ? F.provider(gameObj) : '';
            const features = gameObj?.features || [];
            const featList = parseFeatures(features);
            const rank = gameObj?.performance_rank || null;
            const percentile = gameObj?.performance_percentile || '';
            const volatility = gameObj?.specs_volatility || '';
            const marketShare = gameObj?.performance_market_share_percent;

            const themeAvg =
                themeData.length > 0
                    ? themeData.reduce((sum, t) => sum + (t['Avg Theo Win Index'] || 0), 0) / themeData.length
                    : 0;
            const vsTheme = themeAvg > 0 ? ((a.theo_win_index || 0) / themeAvg - 1) * 100 : 0;

            card.innerHTML = `
            <div class="flex items-start justify-between mb-2">
                <div class="text-sm font-bold text-gray-900 dark:text-white leading-tight cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" data-xray='${escapeAttr(JSON.stringify({ game: a.game || '', field: 'name' }))}' onclick="event.stopPropagation(); ${safeOnclick('window.showGameDetails', a.game || '')}">${escapeHtml(a.game)}</div>
                <span class="text-gray-400 text-xs ml-1 shrink-0">▼</span>
            </div>
            <div class="flex items-baseline gap-2 mb-1.5">
                <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400">${(a.theo_win_index || 0).toFixed(2)}</span>
                ${rank ? `<span class="text-[10px] font-bold text-gray-400">#${rank}</span>` : ''}
                ${percentile ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-semibold">${escapeHtml(String(percentile))}</span>` : ''}
            </div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-gray-500 dark:text-gray-400 mb-2">
                <span>Z-Score: <strong class="text-gray-700 dark:text-gray-300">${(a.z_score || 0).toFixed(2)}</strong></span>
                ${marketShare != null ? `<span>Share: <strong class="text-gray-700 dark:text-gray-300">${marketShare.toFixed(2)}%</strong></span>` : '<span></span>'}
                ${vsTheme ? `<span>vs Theme: <strong class="${vsTheme > 0 ? 'text-emerald-600' : 'text-red-500'}">${vsTheme > 0 ? '+' : ''}${vsTheme.toFixed(0)}%</strong></span>` : '<span></span>'}
                ${volatility ? `<span>Vol: <strong class="text-gray-700 dark:text-gray-300">${escapeHtml(volatility)}</strong></span>` : '<span></span>'}
            </div>
            ${provider ? `<div class="text-[10px] text-gray-400 dark:text-gray-500 mb-1 cursor-pointer hover:text-indigo-500" data-xray='${escapeAttr(JSON.stringify({ dimension: 'provider', value: provider }))}' onclick="event.stopPropagation(); ${safeOnclick('window.showProviderDetails', provider)}">${escapeHtml(provider)}</div>` : ''}
            <div class="text-[11px] text-gray-700 dark:text-gray-300 mb-1">${a.themes.map(t => `<span class="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" data-xray='${escapeAttr(JSON.stringify({ dimension: 'theme', value: t }))}' onclick="event.stopPropagation(); ${safeOnclick('window.showThemeDetails', t)}">${escapeHtml(t)}</span>`).join(', ')}</div>
            ${
                featList.length
                    ? `<div class="flex flex-wrap gap-1 mt-1">${featList
                          .slice(0, 4)
                          .map(
                              f =>
                                  `<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-medium">${escapeHtml(f)}</span>`
                          )
                          .join(
                              ''
                          )}${featList.length > 4 ? `<span class="text-[9px] text-gray-400">+${featList.length - 4}</span>` : ''}</div>`
                    : ''
            }
            
            <div class="hidden mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 card-details">
                <div class="mb-4">
                    <h4 class="font-bold text-gray-900 dark:text-white mb-2">🎯 Why This Game Succeeds</h4>
                    <ul class="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                        ${smartInsights.map(insight => `<li>• ${escapeHtml(insight)}</li>`).join('')}
                    </ul>
                </div>
                
                ${
                    themeData.length > 0
                        ? `
                    <div class="mb-4">
                        <h4 class="font-bold text-gray-900 dark:text-white mb-2">📊 Theme Performance Breakdown</h4>
                        <div class="grid grid-cols-3 gap-2">
                            ${themeData
                                .slice(0, 3)
                                .map(
                                    t => `
                                <div class="text-center p-2 bg-white dark:bg-gray-800 rounded cursor-pointer hover:ring-2 hover:ring-emerald-400 transition-all" data-xray='${escapeAttr(JSON.stringify({ dimension: 'theme', value: t.Theme }))}' onclick="${safeOnclick('window.showThemeDetails', t.Theme)}">
                                    <div class="text-xs text-gray-600 dark:text-gray-400">${escapeHtml(t.Theme)}</div>
                                    <div class="text-lg font-bold text-emerald-600">${(t['Smart Index'] || 0).toFixed(1)}</div>
                                    <div class="text-xs text-gray-500">${(t['Market Share %'] || 0).toFixed(1)}% market</div>
                                </div>
                            `
                                )
                                .join('')}
                        </div>
                    </div>
                `
                        : ''
                }
                
                <div>
                    <h4 class="font-bold text-gray-900 dark:text-white mb-2">💡 Key Takeaways</h4>
                    <ul class="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                        ${recommendations.map(rec => `<li>• ${escapeHtml(rec)}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;

            card.addEventListener('click', e => toggleCardExpansion(e.currentTarget));
            topDiv.appendChild(card);
        } catch (err) {
            console.error(`Error rendering top anomaly #${index} (${a?.game}):`, err);
        }
    });

    const bottomAnomalies = gameData.bottom_anomalies.slice(0, 30);
    bottomAnomalies.forEach((a, index) => {
        const card = document.createElement('div');
        card.className =
            'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow duration-200';
        card.dataset.anomalyIndex = index;
        card.dataset.anomalyType = 'bottom';

        const themeData = a.themes.map(theme => gameData.themes.find(t => t.Theme === theme)).filter(Boolean);

        const bottomInsights = analyzeGameSuccessFactors(a.game, a.theo_win_index, a.z_score, a.themes);
        const bottomRecs = generateRecommendations(bottomInsights, a.themes, a.z_score);

        const gameObj = getActiveGames().find(g => g.name === a.game);
        const provider = gameObj ? F.provider(gameObj) : '';
        const features = gameObj?.features || [];
        const featList = parseFeatures(features);
        const rank = gameObj?.performance_rank || null;
        const percentile = gameObj?.performance_percentile || '';
        const volatility = gameObj?.specs_volatility || '';
        const marketShare = gameObj?.performance_market_share_percent;

        const themeAvg =
            themeData.length > 0
                ? themeData.reduce((sum, t) => sum + (t['Avg Theo Win Index'] || 0), 0) / themeData.length
                : 0;
        const vsTheme = themeAvg > 0 ? ((a.theo_win_index || 0) / themeAvg - 1) * 100 : 0;

        card.innerHTML = `
            <div class="flex items-start justify-between mb-2">
                <div class="text-sm font-bold text-gray-900 dark:text-white leading-tight cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" data-xray='${escapeAttr(JSON.stringify({ game: a.game || '', field: 'name' }))}' onclick="event.stopPropagation(); ${safeOnclick('window.showGameDetails', a.game || '')}">${escapeHtml(a.game)}</div>
                <span class="text-gray-400 text-xs ml-1 shrink-0">▼</span>
            </div>
            <div class="flex items-baseline gap-2 mb-1.5">
                <span class="text-2xl font-black text-red-600 dark:text-red-400">${(a.theo_win_index || 0).toFixed(2)}</span>
                ${rank ? `<span class="text-[10px] font-bold text-gray-400">#${rank}</span>` : ''}
                ${percentile ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-semibold">${escapeHtml(String(percentile))}</span>` : ''}
            </div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-gray-500 dark:text-gray-400 mb-2">
                <span>Z-Score: <strong class="text-gray-700 dark:text-gray-300">${(a.z_score || 0).toFixed(2)}</strong></span>
                ${marketShare != null ? `<span>Share: <strong class="text-gray-700 dark:text-gray-300">${marketShare.toFixed(2)}%</strong></span>` : '<span></span>'}
                ${vsTheme ? `<span>vs Theme: <strong class="${vsTheme > 0 ? 'text-emerald-600' : 'text-red-500'}">${vsTheme > 0 ? '+' : ''}${vsTheme.toFixed(0)}%</strong></span>` : '<span></span>'}
                ${volatility ? `<span>Vol: <strong class="text-gray-700 dark:text-gray-300">${escapeHtml(volatility)}</strong></span>` : '<span></span>'}
            </div>
            ${provider ? `<div class="text-[10px] text-gray-400 dark:text-gray-500 mb-1 cursor-pointer hover:text-indigo-500" data-xray='${escapeAttr(JSON.stringify({ dimension: 'provider', value: provider }))}' onclick="event.stopPropagation(); ${safeOnclick('window.showProviderDetails', provider)}">${escapeHtml(provider)}</div>` : ''}
            <div class="text-[11px] text-gray-700 dark:text-gray-300 mb-1">${a.themes.map(t => `<span class="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" data-xray='${escapeAttr(JSON.stringify({ dimension: 'theme', value: t }))}' onclick="event.stopPropagation(); ${safeOnclick('window.showThemeDetails', t)}">${escapeHtml(t)}</span>`).join(', ')}</div>
            ${
                featList.length
                    ? `<div class="flex flex-wrap gap-1 mt-1">${featList
                          .slice(0, 4)
                          .map(
                              f =>
                                  `<span class="text-[9px] px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-medium">${escapeHtml(f)}</span>`
                          )
                          .join(
                              ''
                          )}${featList.length > 4 ? `<span class="text-[9px] text-gray-400">+${featList.length - 4}</span>` : ''}</div>`
                    : ''
            }
            
            <div class="hidden mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 card-details">
                <div class="mb-4">
                    <h4 class="font-bold text-gray-900 dark:text-white mb-2">⚠️ Performance Analysis</h4>
                    <ul class="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                        ${bottomInsights.map(insight => `<li>• ${escapeHtml(insight)}</li>`).join('')}
                    </ul>
                </div>
                
                ${
                    themeData.length > 0
                        ? `
                    <div class="mb-4">
                        <h4 class="font-bold text-gray-900 dark:text-white mb-2">📊 Theme Context</h4>
                        <div class="grid grid-cols-3 gap-2">
                            ${themeData
                                .slice(0, 3)
                                .map(
                                    t => `
                                <div class="text-center p-2 bg-white dark:bg-gray-800 rounded cursor-pointer hover:ring-2 hover:ring-red-400 transition-all" data-xray='${escapeAttr(JSON.stringify({ dimension: 'theme', value: t.Theme }))}' onclick="${safeOnclick('window.showThemeDetails', t.Theme)}">
                                    <div class="text-xs text-gray-600 dark:text-gray-400">${escapeHtml(t.Theme)}</div>
                                    <div class="text-lg font-bold text-red-600">${(t['Smart Index'] || 0).toFixed(1)}</div>
                                    <div class="text-xs text-gray-500">${(t['Market Share %'] || 0).toFixed(1)}% market</div>
                                </div>
                            `
                                )
                                .join('')}
                        </div>
                    </div>
                `
                        : ''
                }
                
                <div>
                    <h4 class="font-bold text-gray-900 dark:text-white mb-2">💡 Improvement Opportunities</h4>
                    <ul class="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                        ${bottomRecs.map(rec => `<li>• ${escapeHtml(rec)}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;

        card.addEventListener('click', e => toggleCardExpansion(e.currentTarget));
        bottomDiv.appendChild(card);
    });

    setupAnomalyControls();
}

function setupAnomalyControls() {
    const searchInput = document.getElementById('anomaly-search');
    const sortSelect = document.getElementById('anomaly-sort');

    if (searchInput) {
        searchInput.addEventListener('input', () => filterAnomalyCards(searchInput.value));
    }
    if (sortSelect) {
        sortSelect.addEventListener('change', () => sortAnomalyCards(sortSelect.value));
    }
}

function filterAnomalyCards(query) {
    const term = query.toLowerCase().trim();
    document.querySelectorAll('#top-anomalies > div, #bottom-anomalies > div').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = !term || text.includes(term) ? '' : 'none';
    });
}

function sortAnomalyCards(sortBy) {
    ['top-anomalies', 'bottom-anomalies'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;
        const cards = [...container.children];
        cards.sort((a, b) => {
            const getVal = card => {
                const text = card.textContent;
                if (sortBy === 'theo') {
                    const match = text.match(/(\d+\.\d+)/);
                    return match ? parseFloat(match[1]) : 0;
                }
                if (sortBy === 'zscore') {
                    const match = text.match(/Z-Score:\s*(-?[\d.]+)/);
                    return match ? parseFloat(match[1]) : 0;
                }
                if (sortBy === 'name') return card.querySelector('.text-base')?.textContent?.trim() || '';
                if (sortBy === 'provider') return card.querySelector('.text-\\[11px\\]')?.textContent?.trim() || '';
                return 0;
            };
            const va = getVal(a),
                vb = getVal(b);
            if (sortBy === 'name' || sortBy === 'provider') return String(va).localeCompare(String(vb));
            return containerId.includes('top') ? vb - va : va - vb;
        });
        cards.forEach(card => container.appendChild(card));
    });
}

function toggleCardExpansion(card) {
    const details = card.querySelector('.card-details');
    const icon = card.querySelector('.float-right');

    if (details) {
        const isExpanded = !details.classList.contains('hidden');

        if (isExpanded) {
            details.classList.add('hidden');
            card.style.gridColumn = '';
            card.style.maxWidth = '';
            if (icon) icon.textContent = '▼';
        } else {
            details.classList.remove('hidden');
            card.style.gridColumn = 'span 2';
            card.style.maxWidth = '100%';
            if (icon) icon.textContent = '▲';
        }
    }
}

export function showAnomalies(type) {
    log(`🎯 showAnomalies('${type}') called`);

    const topButton = document.querySelector(`button[onclick*="showAnomalies('top')"]`);
    const bottomButton = document.querySelector(`button[onclick*="showAnomalies('bottom')"]`);

    if (!topButton || !bottomButton) {
        console.error('❌ Anomaly buttons not found!');
        return;
    }

    const activeGreenClasses =
        'border-emerald-500 dark:border-emerald-600 text-emerald-600 dark:text-emerald-400 shadow-md';
    const activeRedClasses = 'border-red-500 dark:border-red-600 text-red-600 dark:text-red-400 shadow-md';
    const inactiveClasses = 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300';

    if (type === 'top') {
        topButton.className = `anomaly-tab active px-5 py-2.5 bg-white dark:bg-gray-800 border-2 ${activeGreenClasses} rounded-lg font-semibold transition-all flex items-center gap-2`;
        bottomButton.className = `anomaly-tab px-5 py-2.5 bg-white dark:bg-gray-800 border-2 ${inactiveClasses} rounded-lg font-semibold transition-all flex items-center gap-2`;
    } else {
        topButton.className = `anomaly-tab px-5 py-2.5 bg-white dark:bg-gray-800 border-2 ${inactiveClasses} rounded-lg font-semibold transition-all flex items-center gap-2`;
        bottomButton.className = `anomaly-tab active px-5 py-2.5 bg-white dark:bg-gray-800 border-2 ${activeRedClasses} rounded-lg font-semibold transition-all flex items-center gap-2`;
    }

    const topContainer = document.getElementById('top-anomalies');
    const bottomContainer = document.getElementById('bottom-anomalies');

    if (!topContainer || !bottomContainer) {
        console.error('❌ Anomaly containers not found!');
        return;
    }

    if (type === 'top') {
        topContainer.style.cssText =
            'display: grid !important; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1rem;';
        bottomContainer.style.cssText = 'display: none !important;';
        log('✅ Showing TOP anomalies');
    } else {
        topContainer.style.cssText = 'display: none !important;';
        bottomContainer.style.cssText =
            'display: grid !important; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1rem;';
        log('✅ Showing BOTTOM anomalies');
    }

    log(`  Top display: ${topContainer.style.display}, cards: ${topContainer.children.length}`);
    log(`  Bottom display: ${bottomContainer.style.display}, cards: ${bottomContainer.children.length}`);
}

// Re-export generateInsights from the main insights logic (see generate-insights-impl.js)
export { generateInsights } from './generate-insights-impl.js';
