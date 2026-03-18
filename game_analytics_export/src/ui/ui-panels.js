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
    ACCENTS,
    EmptyState
} from '../components/dashboard-components.js';
import { SYMBOL_CATEGORIES, SYMBOL_CAT_COLORS, categorizeSymbol, parseSymbols } from '../lib/symbol-utils.js';

function collapsibleList(listHtml, totalCount, initialShow, containerId) {
    if (totalCount <= initialShow) return listHtml;
    const uid = containerId || ('cl-' + Math.random().toString(36).slice(2, 8));
    return `
        <div id="${uid}-wrap">
            <div id="${uid}-items">${listHtml}</div>
            <button id="${uid}-btn" onclick="window._toggleCL('${uid}',${initialShow},${totalCount})" data-expanded="0"
            class="mt-2 w-full text-center text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 cursor-pointer py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
                Show all ${totalCount} items
            </button>
        </div>
    `;
}

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
        accent: ACCENTS.performance,
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
        accent: ACCENTS.specs,
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
        accent: ACCENTS.category,
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
        accent: ACCENTS.provider,
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
            accent: ACCENTS.performance,
            content: demoContent
        });
    }
    
    // ===== SYMBOLS SECTION =====
    const symbols = parseSymbols(game.symbols);
    let symbolsSection = '';
    if (symbols.length > 0) {
        const grouped = {};
        symbols.forEach(s => {
            const cat = categorizeSymbol(String(s));
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(String(s).replace(/</g, '&lt;'));
        });
        const symbolsContent = SYMBOL_CATEGORIES.filter(c => grouped[c]).map(cat => {
            const col = SYMBOL_CAT_COLORS[cat];
            return `
            <div class="mb-2 last:mb-0">
                <div class="text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">${cat}</div>
                <div class="flex flex-wrap gap-1">${grouped[cat].map(s => `<span class="inline-flex items-center px-1.5 py-0.5 text-[11px] rounded-md ring-1 ${col.cls} ${col.ring}">${s}</span>`).join('')}</div>
            </div>`;
        }).join('');
        symbolsSection = PanelSection({
            title: `Symbols (${symbols.length})`,
            icon: '🎰',
            gradient: GRADIENTS.specs,
            accent: ACCENTS.specs,
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
        accent: ACCENTS.release,
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
        
        similarGamesContent = `<div class="space-y-0">${gamesList}</div>`;
    } else {
        similarGamesContent = EmptyState('No similar games found');
    }
    
    const similarSection = PanelSection({
        title: 'Similar Games',
        icon: '🎯',
        gradient: GRADIENTS.similar,
        accent: ACCENTS.similar,
        content: similarGamesContent
    });
    
    // ===== FEEDBACK SECTION =====
    const feedbackGameName = game.name || game.game_name || 'Unknown';
    const feedbackContent = `
    <button onclick="window.openFeedbackModal('${feedbackGameName.replace(/'/g, "\\'")}')"
        class="w-full px-4 py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-xl transition-colors flex items-center justify-center gap-2 border border-indigo-200 dark:border-indigo-800">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg>
        Report an issue with this game
    </button>
`;
    
    const feedbackSection = PanelSection({
        title: 'Feedback',
        icon: '📝',
        gradient: GRADIENTS.release,
        accent: ACCENTS.feedback,
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
    
    // ===== TOP GAMES SECTION =====
    const allProvGames = [...providerGames]
        .sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));
    
    const GAMES_INIT = 5;
    const topGamesItems = allProvGames.map((g, i) => {
        const hidden = i >= GAMES_INIT ? ' style="display:none"' : '';
        return `<div data-cl-item${hidden}>${GameListItem({
            name: g.name,
            provider: g.provider_studio,
            theoWin: g.performance_theo_win?.toFixed(2),
            extra: `${g.theme_consolidated}`
        })}</div>`;
    }).join('');
    
    const topGamesHtml = allProvGames.length > GAMES_INIT 
        ? collapsibleList(topGamesItems, allProvGames.length, GAMES_INIT, 'prov-games')
        : topGamesItems;
    
    // ===== TOP THEMES SECTION =====
    const themes = {};
    providerGames.forEach(g => {
        const theme = g.theme_consolidated || 'Unknown';
        if (!themes[theme]) themes[theme] = { count: 0, totalTheo: 0 };
        themes[theme].count++;
        themes[theme].totalTheo += g.performance_theo_win || 0;
    });
    
    const allThemes = Object.entries(themes)
        .map(([name, data]) => ({ name, ...data, avgTheo: data.totalTheo / data.count }))
        .sort((a, b) => b.count - a.count);
    
    const THEMES_INIT = 5;
    const maxThemeCount = allThemes.length ? allThemes[0].count : 1;
    const themeItems = allThemes.map((t, i) => {
        const hidden = i >= THEMES_INIT ? ' style="display:none"' : '';
        const barW = ((t.count / maxThemeCount) * 100).toFixed(0);
        return `<div data-cl-item class="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg px-2 transition-colors"
                     onclick="window.showThemeDetails('${(t.name || '').replace(/'/g, "\\'")}')"${hidden}>
                    <span class="text-[13px] font-medium text-gray-800 dark:text-gray-200 w-28 truncate flex-shrink-0">${t.name}</span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-violet-400 dark:bg-violet-500 rounded-full" style="width:${barW}%"></div></div>
                    <span class="text-[11px] text-gray-400 dark:text-gray-500 w-10 text-right flex-shrink-0">${t.count}</span>
                </div>`;
    }).join('');
    
    const themesContent = `<div class="space-y-0.5">${allThemes.length > THEMES_INIT ? collapsibleList(themeItems, allThemes.length, THEMES_INIT, 'prov-themes') : themeItems}</div>`;
    
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
    
    const allMechanics = Object.entries(mechanics)
        .map(([name, data]) => ({ name, ...data, avgTheo: data.totalTheo / data.count }))
        .sort((a, b) => b.count - a.count);
    
    const MECHS_INIT = 5;
    const maxMechCount = allMechanics.length ? allMechanics[0].count : 1;
    const mechItems = allMechanics.map((m, i) => {
        const hidden = i >= MECHS_INIT ? ' style="display:none"' : '';
        const barW = ((m.count / maxMechCount) * 100).toFixed(0);
        return `<div data-cl-item class="flex items-center gap-2 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 rounded-lg px-2 transition-colors"
                     onclick="window.showMechanicDetails('${(m.name || '').replace(/'/g, "\\'")}')"${hidden}>
                    <span class="text-[13px] font-medium text-gray-800 dark:text-gray-200 w-28 truncate flex-shrink-0">${m.name}</span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-purple-400 dark:bg-purple-500 rounded-full" style="width:${barW}%"></div></div>
                    <span class="text-[11px] text-gray-400 dark:text-gray-500 w-10 text-right flex-shrink-0">${m.count}</span>
                </div>`;
    }).join('');
    
    const mechanicsContent = `<div class="space-y-0.5">${allMechanics.length > MECHS_INIT ? collapsibleList(mechItems, allMechanics.length, MECHS_INIT, 'prov-mechs') : mechItems}</div>`;
    
    // ===== VOLATILITY DISTRIBUTION SECTION =====
    const volatility = {};
    providerGames.forEach(g => {
        const vol = g.specs_volatility || 'Unknown';
        volatility[vol] = (volatility[vol] || 0) + 1;
    });
    
    const maxVolCount = Math.max(...Object.values(volatility));
    const volContent = `
        <div class="space-y-2">
            ${Object.entries(volatility).sort((a, b) => b[1] - a[1]).map(([vol, count]) => {
                const percent = ((count / gameCount) * 100).toFixed(0);
                const barW = ((count / maxVolCount) * 100).toFixed(0);
                return `
                    <div class="flex items-center gap-2">
                        <div class="w-20 flex-shrink-0">${VolatilityBadge(vol)}</div>
                        <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full bg-gray-300 dark:bg-gray-500 rounded-full" style="width:${barW}%"></div></div>
                        <span class="text-[11px] text-gray-400 dark:text-gray-500 w-12 text-right flex-shrink-0">${count} (${percent}%)</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
    
    // Build panel content using PanelSection
    const panelContent = document.getElementById('provider-panel-content');
    let html = '';
    html += PanelSection({ title: 'Statistics', icon: '📊', gradient: GRADIENTS.performance, accent: ACCENTS.performance, content: MetricGrid(statsMetrics) });
    html += PanelSection({ title: 'Performance', icon: '🎯', gradient: GRADIENTS.specs, accent: ACCENTS.specs, content: MetricGrid(perfMetrics) });
    html += PanelSection({ title: 'Themes', icon: '🎨', gradient: GRADIENTS.category, accent: ACCENTS.category, content: themesContent });
    html += PanelSection({ title: 'Features', icon: '⚙️', gradient: GRADIENTS.similar, accent: ACCENTS.similar, content: mechanicsContent });
    html += PanelSection({ title: 'Volatility Distribution', icon: '🎲', gradient: GRADIENTS.stats, accent: ACCENTS.stats, content: volContent });
    html += PanelSection({ title: `Top Games (${allProvGames.length})`, icon: '🎮', gradient: GRADIENTS.provider, accent: ACCENTS.provider, content: `<div class="space-y-0">${topGamesHtml}</div>` });
    panelContent.innerHTML = html;
    
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

// --- Feedback modal (used by hamburger menu and game panel) ---
window.openFeedbackModal = function(gameName) {
    const modal = document.getElementById('feedback-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (gameName) {
        const gameInput = document.getElementById('modal-feedback-game');
        if (gameInput) gameInput.value = gameName;
    }
    // Close hamburger dropdown
    const dropdown = document.getElementById('hamburger-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
};

window.closeFeedbackModal = function() {
    const modal = document.getElementById('feedback-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    // Reset form
    const gameInput = document.getElementById('modal-feedback-game');
    const descInput = document.getElementById('modal-feedback-desc');
    const statusEl = document.getElementById('modal-feedback-status');
    if (gameInput) gameInput.value = '';
    if (descInput) descInput.value = '';
    if (statusEl) statusEl.classList.add('hidden');
};

window.submitModalTicket = async function() {
    const gameName = document.getElementById('modal-feedback-game')?.value?.trim();
    const issueType = document.getElementById('modal-feedback-type')?.value;
    const description = document.getElementById('modal-feedback-desc')?.value?.trim();
    const statusEl = document.getElementById('modal-feedback-status');

    if (!gameName || !description) {
        if (statusEl) {
            statusEl.textContent = 'Please fill in game name and description';
            statusEl.className = 'text-sm text-red-500';
            statusEl.classList.remove('hidden');
        }
        return;
    }

    try {
        const res = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameName, issueType, description }),
        });

        if (res.ok) {
            if (statusEl) {
                statusEl.innerHTML = '✓ Feedback submitted successfully!';
                statusEl.className = 'text-sm text-green-600 dark:text-green-400 font-medium';
                statusEl.classList.remove('hidden');
            }
            setTimeout(() => window.closeFeedbackModal(), 1500);
        } else {
            const data = await res.json();
            throw new Error(data.error || 'Failed to submit');
        }
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = 'Error: ' + err.message;
            statusEl.className = 'text-sm text-red-500';
            statusEl.classList.remove('hidden');
        }
    }
};
