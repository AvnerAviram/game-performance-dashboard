// ==========================================
// GAME DETAIL PANEL - REFACTORED WITH COMPONENTS
// ==========================================

import { gameData } from '../lib/data.js';
import { log } from '../lib/env.js';
import { escapeHtml, safeOnclick } from '../lib/sanitize.js';
import { 
    PanelSection, 
    MetricGrid, 
    Metric,
    GameListItem, 
    VolatilityBadge, 
    AnomalyBadge,
    GRADIENTS,
    EmptyState
} from '../components/dashboard-components.js';

function parseJsonArray(val) {
    if (Array.isArray(val)) return val;
    if (!val || typeof val !== 'string') return [];
    try { const arr = JSON.parse(val); return Array.isArray(arr) ? arr : []; }
    catch { return []; }
}

export function showGameDetails(gameName) {
    const game = gameData.allGames.find(g => g.name === gameName);
    if (!game) return;
    
    log('🎮 Opening game panel for:', gameName);
    
    // Update title
    document.getElementById('game-panel-title').textContent = game.name;
    
    // ===== PERFORMANCE SECTION =====
    const performanceMetrics = [
        { 
            label: 'Rank', 
            value: `<span class="whitespace-nowrap">#${game.performance_rank || 'N/A'}${game.performance_anomaly ? AnomalyBadge(game.performance_anomaly) : ''}</span>`
        },
        { label: 'Theo Win', value: game.performance_theo_win?.toFixed(2) || 'N/A' },
        { label: 'Market Share', value: game.performance_market_share_percent != null ? `${game.performance_market_share_percent.toFixed(2)}%` : 'N/A' },
        { label: 'Percentile', value: game.performance_percentile || 'N/A' }
    ];
    
    const performanceSection = PanelSection({
        title: 'Performance',
        icon: '📊',
        gradient: GRADIENTS.performance,
        content: MetricGrid(performanceMetrics)
    });
    
    // ===== SPECS SECTION =====
    const specsMetrics = [
        { label: 'Layout', value: `${game.specs_reels || 'N/A'}x${game.specs_rows || 'N/A'}` },
        { label: 'Paylines', value: game.specs_paylines || 'N/A' },
        { label: 'RTP', value: game.specs_rtp ? `${game.specs_rtp}%` : 'N/A' },
        { 
            label: 'Volatility', 
            value: game.specs_volatility ? VolatilityBadge(game.specs_volatility) : 'N/A' 
        }
    ];
    
    const specsSection = PanelSection({
        title: 'Game Specs',
        icon: '⚙️',
        gradient: GRADIENTS.specs,
        content: MetricGrid(specsMetrics)
    });
    
    // ===== THEME & MECHANIC SECTION =====
    const features = parseJsonArray(game.features);
    const featuresHtml = features.length > 0
        ? features.map(f => `<span class="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 mr-1.5 mb-1.5">${f}</span>`).join('')
        : '<span class="text-sm text-gray-500 dark:text-gray-400">No features detected</span>';
    
    const themeMechContent = `
        <div class="space-y-3">
            ${Metric('Primary Theme', game.theme_primary || 'N/A')}
            ${game.theme_secondary ? `<div class="text-sm text-gray-600 dark:text-gray-400 ml-0">Secondary: ${game.theme_secondary}</div>` : ''}
            <div class="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3"></div>
            ${Metric('Game Type', game.mechanic_primary || 'Slot')}
            <div class="pt-1">
                <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Features (${features.length})</div>
                <div class="flex flex-wrap">${featuresHtml}</div>
            </div>
        </div>
    `;
    
    const themeMechSection = PanelSection({
        title: 'Theme & Mechanic',
        icon: '🎨',
        gradient: GRADIENTS.category,
        content: themeMechContent
    });
    
    // ===== PROVIDER SECTION =====
    const providerContent = `
        <div class="space-y-2">
            <div class="text-base font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                 onclick="window.showProviderDetails('${(game.provider_studio || '').replace(/'/g, "\\'")}')">${game.provider_studio || 'Unknown'}</div>
            ${game.provider_parent && game.provider_parent !== game.provider_studio ? 
                `<div class="text-sm text-gray-600 dark:text-gray-400">Parent: ${game.provider_parent}</div>` : ''}
        </div>
    `;
    
    const providerSection = PanelSection({
        title: 'Provider',
        icon: '🏢',
        gradient: GRADIENTS.provider,
        content: providerContent
    });
    
    // ===== DEMO URL SECTION =====
    let demoSection = '';
    if (game.demo_url) {
        const demoContent = `
            <a href="${game.demo_url}" target="_blank" rel="noopener noreferrer"
               style="background: linear-gradient(to right, #22c55e, #059669); color: #fff;"
               class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all shadow-md">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                Play Demo
            </a>
        `;
        demoSection = PanelSection({
            title: 'Demo',
            icon: '🎮',
            gradient: GRADIENTS.performance,
            content: demoContent
        });
    }
    
    // ===== SYMBOLS SECTION =====
    const symbols = parseJsonArray(game.symbols);
    let symbolsSection = '';
    if (symbols.length > 0) {
        const symbolsId = `symbols-${Date.now()}`;
        const symbolsContent = `
            <div>
                <button onclick="document.getElementById('${symbolsId}').classList.toggle('hidden')"
                        class="text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium cursor-pointer">
                    ${symbols.length} symbols — click to expand
                </button>
                <div id="${symbolsId}" class="hidden mt-2">
                    <div class="flex flex-wrap gap-1.5">
                        ${symbols.map(s => `<span class="inline-block px-2 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">${String(s).replace(/</g, '&lt;')}</span>`).join('')}
                    </div>
                </div>
            </div>
        `;
        symbolsSection = PanelSection({
            title: 'Symbols',
            icon: '🎰',
            gradient: GRADIENTS.specs,
            content: symbolsContent
        });
    }
    
    // ===== RELEASE INFO SECTION =====
    const releaseMetrics = [
        { label: 'Year', value: game.release_year || 'N/A' },
        { label: 'Month', value: game.release_month || 'N/A' }
    ];
    
    const releaseSection = PanelSection({
        title: 'Release Info',
        icon: '📅',
        gradient: GRADIENTS.release,
        content: MetricGrid(releaseMetrics)
    });
    
    // ===== SIMILAR GAMES SECTION =====
    const parseFeats = (val) => {
        if (Array.isArray(val)) return val;
        if (typeof val === 'string') { try { return JSON.parse(val); } catch(e) { return []; } }
        return [];
    };
    const gameFeats = new Set(parseFeats(game.features));
    const similarGames = gameData.allGames
        .filter(g => g.name !== game.name && (
            g.theme_consolidated === game.theme_consolidated || 
            parseFeats(g.features).some(f => gameFeats.has(f))
        ))
        .sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0))
        .slice(0, 5);
    
    let similarGamesContent;
    if (similarGames.length > 0) {
        const gamesList = similarGames.map(g => {
            const reasons = [];
            if (g.theme_consolidated === game.theme_consolidated) {
                reasons.push(`${g.theme_consolidated} theme`);
            }
            const sharedFeats = parseFeats(g.features).filter(f => gameFeats.has(f));
            if (sharedFeats.length > 0) {
                reasons.push(sharedFeats.slice(0, 2).join(', '));
            }
            const reasonText = reasons.join(' + ');
            
            return GameListItem({
                name: g.name,
                provider: g.provider_studio,
                theoWin: g.performance_theo_win?.toFixed(2),
                extra: reasonText
            });
        }).join('');
        
        similarGamesContent = `<ul class="space-y-0">${gamesList}</ul>`;
    } else {
        similarGamesContent = EmptyState('No similar games found');
    }
    
    const similarSection = PanelSection({
        title: 'Similar Games',
        icon: '🎯',
        gradient: GRADIENTS.similar,
        content: similarGamesContent
    });
    
    // ===== FEEDBACK SECTION =====
    const feedbackGameName = game.name || game.game_name || 'Unknown';
    const mailSubject = encodeURIComponent(`Data issue: ${feedbackGameName}`);
    const mailBody = encodeURIComponent(`Game: ${feedbackGameName}\nIssue: `);
    const feedbackContent = `
        <div>
            <a href="mailto:analytics-feedback@example.com?subject=${mailSubject}&body=${mailBody}"
               class="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors underline">
                Report something incorrect?
            </a>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">Opens your email client to send a report.</p>
        </div>
    `;
    
    const feedbackSection = PanelSection({
        title: 'Feedback',
        icon: '📝',
        gradient: 'from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-700/30',
        content: feedbackContent
    });
    
    // ===== RENDER ALL SECTIONS =====
    document.getElementById('game-performance').innerHTML = performanceSection;
    document.getElementById('game-specs').innerHTML = specsSection;
    document.getElementById('game-theme-mechanic').innerHTML = themeMechSection;
    document.getElementById('game-demo').innerHTML = demoSection;
    document.getElementById('game-symbols').innerHTML = symbolsSection;
    document.getElementById('game-provider').innerHTML = providerSection;
    document.getElementById('game-release').innerHTML = releaseSection;
    document.getElementById('game-similar').innerHTML = similarSection;
    document.getElementById('game-feedback').innerHTML = feedbackSection;
    
    // Close any other open panel first, then show this one
    if (window.closeAllPanels) window.closeAllPanels();
    const panel = document.getElementById('game-panel');
    const backdrop = document.getElementById('mechanic-backdrop');
    
    panel.scrollTop = 0;
    panel.style.right = '0px';
    backdrop.classList.remove('hidden');
    backdrop.classList.add('block');
    document.body.style.overflow = 'hidden';
}

window.showGameDetails = showGameDetails;


export function closeGamePanel() {
    // TAILWIND: Hide panel (slide out to right)
    const panel = document.getElementById('game-panel');
    const backdrop = document.getElementById('mechanic-backdrop');
    
    panel.style.right = '-650px'; // Slide out
    backdrop.classList.add('hidden');
    backdrop.classList.remove('block');
}

window.closeGamePanel = closeGamePanel;

// ==========================================
// PROVIDER DETAIL PANEL
// ==========================================

export function showProviderDetails(providerName) {
    const providerGames = gameData.allGames.filter(g => g.provider_studio === providerName);
    if (providerGames.length === 0) return;
    
    log('🏢 Opening provider panel for:', providerName);
    
    // Update title
    const parent = providerGames[0].provider_parent;
    document.getElementById('provider-panel-title').textContent = providerName;
    
    // Calculate stats
    const gameCount = providerGames.length;
    const avgTheo = providerGames.reduce((sum, g) => sum + (g.performance_theo_win || 0), 0) / gameCount;
    const totalMarketShare = providerGames.reduce((sum, g) => sum + (g.performance_market_share_percent || 0), 0);
    const gamesWithRTP = providerGames.filter(g => g.specs_rtp);
    const avgRTP = gamesWithRTP.length ? gamesWithRTP.reduce((sum, g) => sum + g.specs_rtp, 0) / gamesWithRTP.length : null;
    
    // ===== STATISTICS SECTION =====
    const statsMetrics = [
        { label: 'Total Games', value: gameCount },
        { label: 'Avg Theo Win', value: avgTheo.toFixed(2) },
        { label: 'Market Share', value: `${totalMarketShare.toFixed(2)}%` },
        { label: 'Avg RTP', value: avgRTP ? avgRTP.toFixed(1) + '%' : 'N/A' }
    ];
    
    if (parent && parent !== providerName) {
        statsMetrics.push({ label: 'Parent Company', value: parent });
    }
    
    document.getElementById('provider-stats').innerHTML = MetricGrid(statsMetrics);
    
    // ===== PERFORMANCE SECTION =====
    const highPerformers = providerGames.filter(g => g.performance_anomaly === 'high').length;
    const lowPerformers = providerGames.filter(g => g.performance_anomaly === 'low').length;
    const topRank = Math.min(...providerGames.map(g => g.performance_rank || 999));
    
    const perfMetrics = [
        { label: 'Best Rank', value: `#${topRank}` },
        { label: 'High Performers', value: highPerformers },
        { label: 'Low Performers', value: lowPerformers },
        { label: 'Quality Index', value: avgTheo.toFixed(2) }
    ];
    
    document.getElementById('provider-performance').innerHTML = MetricGrid(perfMetrics);
    
    // ===== TOP GAMES SECTION =====
    const topGames = [...providerGames]
        .sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0))
        .slice(0, 10);
    
    const topGamesHtml = topGames.map(g => GameListItem({
        name: g.name,
        provider: g.provider_studio,
        theoWin: g.performance_theo_win?.toFixed(2),
        extra: `${g.theme_consolidated}`
    })).join('');
    
    document.getElementById('provider-top-games').innerHTML = topGamesHtml;
    
    // ===== TOP THEMES SECTION =====
    const themes = {};
    providerGames.forEach(g => {
        const theme = g.theme_consolidated || 'Unknown';
        if (!themes[theme]) themes[theme] = { count: 0, totalTheo: 0 };
        themes[theme].count++;
        themes[theme].totalTheo += g.performance_theo_win || 0;
    });
    
    const topThemes = Object.entries(themes)
        .map(([name, data]) => ({ name, ...data, avgTheo: data.totalTheo / data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    
    const themesContent = `
        <div class="space-y-2">
            ${topThemes.map(t => `
                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors"
                     onclick="window.showThemeDetails('${(t.name || '').replace(/'/g, "\\'")}')">
                    <span class="font-semibold text-gray-900 dark:text-white">${t.name}</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">${t.count} games</span>
                </div>
            `).join('')}
        </div>
    `;
    
    document.getElementById('provider-top-themes').innerHTML = themesContent;
    
    // ===== TOP FEATURES SECTION =====
    const mechanics = {};
    providerGames.forEach(g => {
        let feats = g.features;
        if (typeof feats === 'string') { try { feats = JSON.parse(feats); } catch(e) { feats = []; } }
        if (!Array.isArray(feats)) feats = [];
        feats.forEach(feat => {
            if (!mechanics[feat]) mechanics[feat] = { count: 0, totalTheo: 0 };
            mechanics[feat].count++;
            mechanics[feat].totalTheo += g.performance_theo_win || 0;
        });
    });
    
    const topMechanics = Object.entries(mechanics)
        .map(([name, data]) => ({ name, ...data, avgTheo: data.totalTheo / data.count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    
    const mechanicsContent = `
        <div class="space-y-2">
            ${topMechanics.map(m => `
                <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors"
                     onclick="window.showMechanicDetails('${(m.name || '').replace(/'/g, "\\'")}')">
                    <span class="font-semibold text-gray-900 dark:text-white">${m.name}</span>
                    <span class="text-sm text-gray-600 dark:text-gray-400">${m.count} games</span>
                </div>
            `).join('')}
        </div>
    `;
    
    document.getElementById('provider-top-mechanics').innerHTML = mechanicsContent;
    
    // ===== VOLATILITY DISTRIBUTION SECTION =====
    const volatility = {};
    providerGames.forEach(g => {
        const vol = g.specs_volatility || 'Unknown';
        volatility[vol] = (volatility[vol] || 0) + 1;
    });
    
    const volContent = `
        <div class="space-y-3">
            ${Object.entries(volatility).sort((a, b) => b[1] - a[1]).map(([vol, count]) => {
                const percent = ((count / gameCount) * 100).toFixed(0);
                return `
                    <div class="flex items-center justify-between">
                        ${VolatilityBadge(vol)}
                        <span class="text-sm text-gray-600 dark:text-gray-400">${count} (${percent}%)</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    document.getElementById('provider-volatility').innerHTML = volContent;
    
    // Close any other open panel first, then show this one
    if (window.closeAllPanels) window.closeAllPanels();
    const panel = document.getElementById('provider-panel');
    const backdrop = document.getElementById('mechanic-backdrop');
    
    panel.scrollTop = 0;
    panel.style.right = '0px';
    backdrop.classList.remove('hidden');
    backdrop.classList.add('block');
    document.body.style.overflow = 'hidden';
}

window.showProviderDetails = showProviderDetails;

export function closeProviderPanel() {
    // TAILWIND: Hide panel (slide out to right)
    const panel = document.getElementById('provider-panel');
    const backdrop = document.getElementById('mechanic-backdrop');
    
    panel.style.right = '-650px'; // Slide out
    backdrop.classList.add('hidden');
    backdrop.classList.remove('block');
}

window.closeProviderPanel = closeProviderPanel;

// Update closeAnyPanel to include new panels
window.closeAnyPanel = function() {
    closeGamePanel();
    closeProviderPanel();
    if (window.closeThemePanel) window.closeThemePanel();
    if (window.closeMechanicPanel) window.closeMechanicPanel();
};
