import { gameData } from '../lib/data.js';
import { log } from '../lib/env.js';
import { escapeHtml, safeOnclick } from '../lib/sanitize.js';

// ==========================================
// PROVIDERS PAGE - USING DUCKDB
// ==========================================

// Initialize providers pagination
if (!window.providersCurrentPage) {
    window.providersCurrentPage = 1;
}
if (!window.providersPerPage) {
    window.providersPerPage = 50;
}

// Global pagination function for providers
window.goToProvidersPage = function(page) {
    window.providersCurrentPage = page;
    renderProviders();
};

// Change items per page
window.changeProvidersPerPage = function(perPage) {
    window.providersPerPage = parseInt(perPage);
    window.providersCurrentPage = 1; // Reset to first page
    renderProviders();
};

export async function renderProviders(providersData = null) {
    log('📊 Rendering Providers page...');
    
    const container = document.getElementById('providers-content');
    const countEl = document.getElementById('providers-count');
    if (!container) return;
    
    // Show loading
    container.innerHTML = '<div class="loading" style="text-align: center; padding: 3rem; color: var(--text-secondary);">Loading providers from DuckDB...</div>';
    
    try {
        // USE DUCKDB QUERY
        const { getProviderDistribution } = await import('../lib/db/duckdb-client.js');
        let providers = providersData || await getProviderDistribution();
        
        // Store in gameData for filter tabs (Top Studios, High Quality)
        if (!providersData && providers.length > 0) {
            gameData.providers = providers;
        }
        
        log(`✅ Loaded ${providers.length} providers from DuckDB`);
        
        // APPLY FILTERS FROM DROPDOWNS
        const searchInput = document.getElementById('provider-search');
        
        if (searchInput && searchInput.value.trim()) {
            const searchTerm = searchInput.value.toLowerCase().trim();
            providers = providers.filter(p => 
                p.studio.toLowerCase().includes(searchTerm) ||
                (p.parent && p.parent.toLowerCase().includes(searchTerm))
            );
            log(`  🔍 Filtered by search "${searchTerm}": ${providers.length} results`);
        }
        
        // Read mechanic and theme dropdown values
        const mechanicFilter = document.getElementById('providers-filter-mechanic');
        const themeFilter = document.getElementById('providers-filter-theme');
        
        if (mechanicFilter && mechanicFilter.value) {
            const mechVal = mechanicFilter.value;
            const providerNames = new Set(
                gameData.allGames
                    .filter(g => g.mechanic_primary === mechVal)
                    .map(g => g.provider_studio)
            );
            providers = providers.filter(p => providerNames.has(p.studio));
        }
        
        if (themeFilter && themeFilter.value) {
            const themeVal = themeFilter.value;
            const providerNames = new Set(
                gameData.allGames
                    .filter(g => g.theme_primary === themeVal)
                    .map(g => g.provider_studio)
            );
            providers = providers.filter(p => providerNames.has(p.studio));
        }
        
        // Update count
        if (countEl) countEl.textContent = providers.length;
        
        if (providers.length === 0) {
            container.innerHTML = '<div class="empty-state" style="text-align: center; padding: 3rem; color: var(--text-secondary);">No providers found</div>';
            return;
        }
        
        // Provider Score: avg_theo_win weighted by portfolio depth (like Smart Index)
        // Rewards both quality and breadth; single-game providers won't dominate
        providers.forEach(p => {
            p.provider_score = (p.avg_theo_win || 0) * Math.sqrt(p.game_count || 1);
        });
        providers.sort((a, b) => (b.provider_score || 0) - (a.provider_score || 0));
        
        // PAGINATION LOGIC
        const ITEMS_PER_PAGE = window.providersPerPage || 50;
        const currentPage = window.providersCurrentPage || 1;
        const totalPages = Math.ceil(providers.length / ITEMS_PER_PAGE);
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const paginatedProviders = providers.slice(startIndex, endIndex);
        
        const maxScore = Math.max(...providers.map(p => p.provider_score || 0), 1);
        const maxGC = Math.max(...providers.map(p => p.game_count || 0), 1);
        const maxMS = Math.max(...providers.map(p => p.total_market_share || 0), 0.01);
        const avgTheo = providers.reduce((s, p) => s + (p.avg_theo_win || 0), 0) / (providers.length || 1);
        
        let html = `
            <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto mb-6 -mr-8">
                <table id="providers-table" class="w-full min-w-[800px]">
                    <thead class="bg-gray-50 dark:bg-gray-900">
                            <tr class="border-b border-gray-200 dark:border-gray-700">
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable" onclick="sortTable('providers-table', 0)">Rank</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="sortTable('providers-table', 1)">Provider</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="sortTable('providers-table', 2)">Games</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="sortTable('providers-table', 3)">
                                    Avg Theo Win
                                    <span class="info-icon">ⓘ
                                        <div class="filter-tooltip">
                                            <strong>Avg Theoretical Win</strong>
                                            <p>Average Theo Win Index across all games from this provider</p>
                                            <hr>
                                            <p>✓ Higher = stronger average game quality</p>
                                            <p>✓ Independent of portfolio size</p>
                                        </div>
                                    </span>
                                </th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="sortTable('providers-table', 4)">Market Share</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable sorted-desc cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="sortTable('providers-table', 5)">
                                    Score
                                    <span class="info-icon">ⓘ
                                        <div class="filter-tooltip">
                                            <strong>Provider Score</strong>
                                            <p>Avg Theo Win &times; &radic;Game Count</p>
                                            <hr>
                                            <p>✓ Balances quality with catalog depth</p>
                                            <p>✓ A 1-game wonder won't outrank a proven studio</p>
                                            <p>✓ Default sort — best overall providers first</p>
                                        </div>
                                    </span>
                                </th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="sortTable('providers-table', 6)">Avg RTP</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="sortTable('providers-table', 7)">Volatility</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
        `;
        
        paginatedProviders.forEach((provider, index) => {
            const globalIndex = startIndex + index;
            const parentInfo = provider.parent !== provider.studio ? `<div class="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">${escapeHtml(provider.parent)}</div>` : '';
            const gc = provider.game_count || 0;
            const theo = provider.avg_theo_win || 0;
            const ms = provider.total_market_share || 0;
            const score = provider.provider_score || 0;
            const gcBarW = Math.max(4, (gc / maxGC) * 100);
            const msBarW = Math.max(2, (ms / maxMS) * 100);
            const scoreBarW = Math.max(4, (score / maxScore) * 100);
            const isAboveAvg = theo >= avgTheo;
            const medal = globalIndex === 0 ? '<span class="mr-1">🥇</span>' : globalIndex === 1 ? '<span class="mr-1">🥈</span>' : globalIndex === 2 ? '<span class="mr-1">🥉</span>' : '';
            const rankBg = globalIndex < 3 ? 'bg-indigo-50 dark:bg-indigo-900/20' : '';
            
            const volatilityBadge = provider.dominant_volatility ? 
                (() => {
                    const v = provider.dominant_volatility;
                    const colors = {
                        'Low': { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
                        'Low-Medium': { bg: 'bg-lime-100 dark:bg-lime-900/30', text: 'text-lime-700 dark:text-lime-300' },
                        'Medium': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
                        'Medium-High': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
                        'High': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
                        'Very High': { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300' },
                    };
                    const c = colors[v] || colors['Medium'];
                    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}">${v}</span>`;
                })() : '<span class="text-gray-300 dark:text-gray-600">—</span>';
            
            html += `
                <tr class="group hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all duration-150 ${rankBg}">
                    <td class="px-4 py-3.5 text-sm font-medium text-gray-400 dark:text-gray-500 w-16">${medal}${globalIndex + 1}</td>
                    <td class="px-4 py-3.5">
                        <span class="font-semibold text-gray-900 dark:text-white cursor-pointer group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" 
                              onclick="${safeOnclick('window.showProviderDetails', provider.studio)}">${escapeHtml(provider.studio)}</span>
                        ${parentInfo}
                    </td>
                    <td class="px-4 py-3.5 w-36">
                        <div class="flex items-center gap-2">
                            <span class="text-sm tabular-nums text-gray-700 dark:text-gray-300 w-8 text-right">${gc}</span>
                            <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full bg-gray-400 dark:bg-gray-500 transition-all" style="width:${gcBarW}%"></div></div>
                        </div>
                    </td>
                    <td class="px-4 py-3.5">
                        <div class="flex items-center gap-1.5">
                            <span class="text-sm font-bold tabular-nums ${isAboveAvg ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}">${theo ? theo.toFixed(2) : '—'}</span>
                            <span class="text-[10px] ${isAboveAvg ? 'text-emerald-500' : 'text-gray-400'}">${theo ? (isAboveAvg ? '▲' : '▼') : ''}</span>
                        </div>
                    </td>
                    <td class="px-4 py-3.5 w-36">
                        <div class="flex items-center gap-2">
                            <span class="text-sm tabular-nums text-gray-600 dark:text-gray-400 w-12 text-right">${ms ? ms.toFixed(2) + '%' : '—'}</span>
                            <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full bg-blue-400 dark:bg-blue-500 transition-all" style="width:${msBarW}%"></div></div>
                        </div>
                    </td>
                    <td class="px-4 py-3.5 w-40">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-bold tabular-nums text-indigo-600 dark:text-indigo-400 w-12 text-right">${score ? score.toFixed(1) : '—'}</span>
                            <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-500 transition-all" style="width:${scoreBarW}%"></div></div>
                        </div>
                    </td>
                    <td class="px-4 py-3.5 text-sm tabular-nums text-gray-600 dark:text-gray-400">${provider.avg_rtp ? provider.avg_rtp.toFixed(1) + '%' : '—'}</td>
                    <td class="px-4 py-3.5">${volatilityBadge}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Update static footer values (footer is in HTML template now)
        const pageInfo = document.getElementById('providers-showing-info');
        if (pageInfo) {
            pageInfo.innerHTML = `Showing <span class="font-semibold">${startIndex + 1}-${Math.min(endIndex, providers.length)}</span> of <span class="font-semibold">${providers.length}</span>`;
        }
        
        const currentPageEl = document.getElementById('providers-current-page');
        const totalPagesEl = document.getElementById('providers-total-pages');
        if (currentPageEl) currentPageEl.textContent = currentPage;
        if (totalPagesEl) totalPagesEl.textContent = totalPages;
        
        // Update button states
        const prevBtn = document.getElementById('providers-prev-btn');
        const nextBtn = document.getElementById('providers-next-btn');
        if (prevBtn) prevBtn.disabled = currentPage === 1;
        if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
        
        // Update per-page selector
        const perPageSelect = document.getElementById('providers-per-page-footer');
        if (perPageSelect) {
            perPageSelect.value = ITEMS_PER_PAGE.toString();
        }
        
        // Setup search filter
        setupProviderSearch(providers);
        
    } catch (error) {
        console.error('❌ Error loading providers:', error);
        container.innerHTML = `<div class="error-state" style="text-align: center; padding: 3rem; color: #ef4444;">Error loading providers: ${error.message}</div>`;
    }
}

// Provider search functionality
function setupProviderSearch(providers) {
    const searchInput = document.getElementById('provider-search');
    const clearBtn = document.getElementById('clear-provider-search');
    
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        clearBtn.style.display = term ? 'block' : 'none';
        
        const filtered = term ? 
            providers.filter(p => p.studio.toLowerCase().includes(term) || (p.parent?.toLowerCase() || '').includes(term)) :
            providers;
        
        renderProvidersTable(filtered);
    });
    
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            renderProvidersTable(providers);
        });
    }
}

function renderProvidersTable(providers) {
    const tbody = document.querySelector('#providers-content table tbody');
    if (!tbody) return;
    
    let html = '';
    providers.forEach((provider, index) => {
        const parentInfo = provider.parent !== provider.studio ? `<div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${provider.parent}</div>` : '';
        
        const volatilityBadge = provider.dominant_volatility ? 
            (() => {
                const v = provider.dominant_volatility;
                const colors = {
                    'Low': { bg: '#dcfce7', text: '#166534' },
                    'Low-Medium': { bg: '#d9f99d', text: '#3f6212' },
                    'Medium': { bg: '#fef9c3', text: '#854d0e' },
                    'Medium-High': { bg: '#fed7aa', text: '#9a3412' },
                    'High': { bg: '#ffedd5', text: '#9a3412' },
                    'Very High': { bg: '#fecaca', text: '#991b1b' },
                };
                const c = colors[v] || colors['Medium'];
                return `<span style="display:inline-flex;align-items:center;padding:2px 10px;border-radius:9999px;font-size:0.75rem;font-weight:600;white-space:nowrap;background:${c.bg};color:${c.text}">${v}</span>`;
            })() : 'N/A';
        
        html += `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${index + 1}</td>
                <td class="px-4 py-3">
                    <span class="text-cyan-600 dark:text-cyan-400 cursor-pointer hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors font-medium" 
                          onclick="${safeOnclick('window.showProviderDetails', provider.studio)}">${escapeHtml(provider.studio)}</span>
                    ${parentInfo}
                </td>
                <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">${provider.game_count}</td>
                <td class="px-4 py-3">
                    <span class="text-amber-600 dark:text-amber-400 font-semibold">${provider.avg_theo_win.toFixed(2)}</span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${provider.total_market_share.toFixed(2)}%</td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${provider.avg_rtp ? provider.avg_rtp.toFixed(1) + '%' : 'N/A'}</td>
                <td class="px-4 py-3">${volatilityBadge}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html || '<tr><td colspan="7" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No providers match your search</td></tr>';
}

// ==========================================
// GAMES PAGE WITH PAGINATION & SORTING
// ==========================================

// Games Page State
let currentGamesPage = 0;
let currentGamesSortField = 'performance_theo_win';
let currentGamesSortDirection = 'desc';
let currentGameViewFilter = 'all';
let GAMES_PER_PAGE = 100;

export function renderGames() {
    log('🎮 Rendering Games page...');
    
    const container = document.getElementById('games-content');
    const countEl = document.getElementById('games-count');
    if (!container) return;
    
    // Populate filters (only once)
    const providerFilter = document.getElementById('games-filter-provider');
    const mechanicFilter = document.getElementById('games-filter-mechanic');
    
    if (providerFilter && providerFilter.options.length === 1) {
        const providers = [...new Set(gameData.allGames.map(g => g.provider_studio))].sort();
        providers.forEach(p => {
            const option = document.createElement('option');
            option.value = p;
            option.textContent = p;
            providerFilter.appendChild(option);
        });
    }
    
    if (mechanicFilter && mechanicFilter.options.length === 1) {
        const featureSet = new Set();
        gameData.allGames.forEach(g => {
            let feats = g.features;
            if (typeof feats === 'string') { try { feats = JSON.parse(feats); } catch(e) { feats = []; } }
            if (Array.isArray(feats)) feats.forEach(f => featureSet.add(f));
        });
        const mechanics = [...featureSet].sort();
        mechanics.forEach(m => {
            const option = document.createElement('option');
            option.value = m;
            option.textContent = m;
            mechanicFilter.appendChild(option);
        });
    }
    
    // Apply filters
    let filteredGames = gameData.allGames;
    
    const searchTerm = document.getElementById('games-search')?.value?.toLowerCase() || '';
    const providerVal = providerFilter?.value || '';
    const mechanicVal = mechanicFilter?.value || '';
    
    if (searchTerm) {
        filteredGames = filteredGames.filter(g => 
            g.name.toLowerCase().includes(searchTerm) ||
            (g.provider_studio?.toLowerCase() || '').includes(searchTerm)
        );
    }
    
    if (providerVal) {
        filteredGames = filteredGames.filter(g => g.provider_studio === providerVal);
    }
    
    if (mechanicVal) {
        filteredGames = filteredGames.filter(g => {
            let feats = g.features;
            if (typeof feats === 'string') { try { feats = JSON.parse(feats); } catch(e) { feats = []; } }
            return Array.isArray(feats) && feats.includes(mechanicVal);
        });
    }
    
    if (currentGameViewFilter === 'marketLeaders') {
        filteredGames = filteredGames.filter(g => (g.performance_market_share_percent || 0) >= 0.1);
        filteredGames.sort((a, b) => (b.performance_market_share_percent || 0) - (a.performance_market_share_percent || 0));
    } else if (currentGameViewFilter === 'newReleases') {
        const cutoffYear = new Date().getFullYear() - 1;
        filteredGames = filteredGames.filter(g => (g.release_year || 0) >= cutoffYear);
        filteredGames.sort((a, b) => {
            const yDiff = (b.release_year || 0) - (a.release_year || 0);
            if (yDiff !== 0) return yDiff;
            return (b.release_month || 0) - (a.release_month || 0);
        });
    } else if (currentGameViewFilter === 'hiddenGems') {
        const avgTheo = filteredGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / filteredGames.length;
        filteredGames = filteredGames.filter(g =>
            (g.performance_theo_win || 0) >= avgTheo &&
            (g.performance_market_share_percent || 0) < 1
        );
        filteredGames.sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));
    }
    
    // Update count to reflect filtered results
    if (countEl) countEl.textContent = filteredGames.length;
    if (filteredGames.length <= currentGamesPage * GAMES_PER_PAGE) {
        currentGamesPage = 0;
    }
    
    // Apply sorting
    filteredGames.sort((a, b) => {
        let valA = a[currentGamesSortField];
        let valB = b[currentGamesSortField];
        
        // Handle nulls
        if (valA == null) valA = 0;
        if (valB == null) valB = 0;
        
        if (currentGamesSortDirection === 'asc') {
            return valA > valB ? 1 : valA < valB ? -1 : 0;
        } else {
            return valA < valB ? 1 : valA > valB ? -1 : 0;
        }
    });
    
    // Pagination
    const totalPages = Math.ceil(filteredGames.length / GAMES_PER_PAGE);
    const startIdx = currentGamesPage * GAMES_PER_PAGE;
    const endIdx = Math.min(startIdx + GAMES_PER_PAGE, filteredGames.length);
    const paginatedGames = filteredGames.slice(startIdx, endIdx);
    
    // Build HTML - WRAP TABLE IN SAME CONTAINER AS THEMES/MECHANICS
    const sortClass = (field) => {
        if (currentGamesSortField === field) {
            return currentGamesSortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc';
        }
        return '';
    };
    
    let html = `
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto mb-6 -mr-8">
            <table id="games-table" class="w-full min-w-[800px]">
                <thead class="bg-gray-50 dark:bg-gray-900">
                    <tr class="border-b border-gray-200 dark:border-gray-700">
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors sortable whitespace-nowrap ${sortClass('performance_rank')}" onclick="window.sortGamesBy('performance_rank')">
                                Rank
                            </th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors sortable whitespace-nowrap ${sortClass('name')}" onclick="window.sortGamesBy('name')">
                                Game
                            </th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors sortable whitespace-nowrap ${sortClass('provider_studio')}" onclick="window.sortGamesBy('provider_studio')">
                                Provider
                            </th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors sortable whitespace-nowrap ${sortClass('theme_consolidated')}" onclick="window.sortGamesBy('theme_consolidated')">
                            Theme
                        </th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            Features
                        </th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors sortable whitespace-nowrap ${sortClass('performance_theo_win')}" onclick="window.sortGamesBy('performance_theo_win')">
                            Theo Win
                            <span class="info-icon">ⓘ
                                <div class="filter-tooltip">
                                    <strong>Theoretical Win Index</strong>
                                    <p>Expected casino profit per game &bull; Eilers &amp; Krejcik method</p>
                                    <hr>
                                    <p>✓ <b>1.00</b> = market average</p>
                                    <p>✓ Higher = stronger revenue potential</p>
                                    <p>✓ Independent of market share or volume</p>
                                </div>
                            </span>
                        </th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors sortable whitespace-nowrap ${sortClass('performance_market_share_percent')}" onclick="window.sortGamesBy('performance_market_share_percent')">
                            Market %
                        </th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors sortable whitespace-nowrap ${sortClass('specs_rtp')}" onclick="window.sortGamesBy('specs_rtp')">
                            RTP
                        </th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors sortable whitespace-nowrap ${sortClass('specs_volatility')}" onclick="window.sortGamesBy('specs_volatility')">
                            Volatility
                        </th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors sortable whitespace-nowrap ${sortClass('release_year')}" onclick="window.sortGamesBy('release_year')">
                            Release
                        </th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
    `;
    
    if (paginatedGames.length === 0) {
        html += `
            <tr>
                <td colspan="10" class="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
                    No games match your filters
                </td>
            </tr>
        `;
    } else {
        const maxTheo = Math.max(...filteredGames.map(g => g.performance_theo_win || 0), 1);
        const avgTheo = filteredGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / (filteredGames.length || 1);
        
        paginatedGames.forEach((game, idx) => {
            const globalIdx = startIdx + idx;
            const theo = game.performance_theo_win || 0;
            const isAboveAvg = theo >= avgTheo;
            const medal = globalIdx === 0 ? '<span class="mr-1">🥇</span>' : globalIdx === 1 ? '<span class="mr-1">🥈</span>' : globalIdx === 2 ? '<span class="mr-1">🥉</span>' : '';
            const rankBg = globalIdx < 3 ? 'bg-indigo-50 dark:bg-indigo-900/20' : '';
            
            const volatilityBadge = game.specs_volatility ? 
                (() => {
                    const v = game.specs_volatility;
                    const colors = {
                        'Low': { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300' },
                        'Low-Medium': { bg: 'bg-lime-100 dark:bg-lime-900/30', text: 'text-lime-700 dark:text-lime-300' },
                        'Medium': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
                        'Medium-High': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300' },
                        'High': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
                        'Very High': { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300' },
                    };
                    const c = colors[v] || colors['Medium'];
                    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${c.bg} ${c.text}">${v}</span>`;
                })() : '<span class="text-gray-300 dark:text-gray-600">—</span>';
            
            const featuresPills = (() => {
                let f = game.features;
                if (typeof f === 'string') { try { f = JSON.parse(f); } catch(e) { f = []; } }
                if (!Array.isArray(f) || f.length === 0) return '<span class="text-gray-300 dark:text-gray-600">—</span>';
                return '<div class="flex flex-wrap gap-1">' + f.slice(0, 2).map(feat => 
                    `<span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showMechanicDetails', feat)}">${escapeHtml(feat)}</span>`
                ).join('') + (f.length > 2 ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium text-gray-400">+${f.length-2}</span>` : '') + '</div>';
            })();
            
            const percentileBadge = (() => {
                const p = parseFloat(game.performance_percentile);
                if (!p || isNaN(p)) return '';
                const rank = 100 - p;
                if (rank <= 1) return '<span class="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Top 1%</span>';
                if (rank <= 5) return '<span class="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Top 5%</span>';
                if (rank <= 10) return '<span class="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">Top 10%</span>';
                if (rank <= 25) return '<span class="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">Top 25%</span>';
                return '';
            })();
            
            html += `
                <tr class="group hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all duration-150 ${rankBg}">
                    <td class="px-4 py-3.5 text-sm font-medium text-gray-400 dark:text-gray-500 w-16">${medal}${game.performance_rank || globalIdx + 1}</td>
                    <td class="px-4 py-3.5">
                        <span class="cursor-pointer font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" 
                              onclick="${safeOnclick('window.showGameDetails', game.name)}">${escapeHtml(game.name)}</span>
                    </td>
                    <td class="px-4 py-3.5">
                        <span class="cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" 
                              onclick="${safeOnclick('window.showProviderDetails', game.provider_studio || '')}">${escapeHtml(game.provider_studio || '—')}</span>
                    </td>
                    <td class="px-4 py-3.5 text-sm">${game.theme_consolidated ? `<span class="cursor-pointer text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showThemeDetails', game.theme_consolidated || '')}">${escapeHtml(game.theme_consolidated)}</span>` : '<span class="text-gray-300 dark:text-gray-600">—</span>'}</td>
                    <td class="px-4 py-3.5">${featuresPills}</td>
                    <td class="px-4 py-3.5">
                        <div class="flex items-center gap-1">
                            <span class="text-sm font-bold tabular-nums ${isAboveAvg ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}">${theo ? theo.toFixed(2) : '—'}</span>
                            <span class="text-[10px] ${isAboveAvg ? 'text-emerald-500' : 'text-gray-400'}">${theo ? (isAboveAvg ? '▲' : '▼') : ''}</span>
                            ${percentileBadge}
                        </div>
                    </td>
                    <td class="px-4 py-3.5 text-sm tabular-nums text-gray-600 dark:text-gray-400">${game.performance_market_share_percent ? game.performance_market_share_percent.toFixed(2) + '%' : '—'}</td>
                    <td class="px-4 py-3.5 text-sm tabular-nums text-gray-600 dark:text-gray-400">${game.specs_rtp ? game.specs_rtp + '%' : '—'}</td>
                    <td class="px-4 py-3.5">${volatilityBadge}</td>
                    <td class="px-4 py-3.5 text-sm tabular-nums text-gray-600 dark:text-gray-400">${game.release_year || '—'}</td>
                </tr>
            `;
        });
    }
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
    
    // Update static footer values (footer is in HTML template now)
    const showingInfo = document.getElementById('games-showing-info');
    if (showingInfo) {
        showingInfo.innerHTML = `Showing <span class="font-semibold text-gray-900 dark:text-white">${startIdx + 1}-${endIdx}</span> of <span class="font-semibold text-gray-900 dark:text-white">${filteredGames.length}</span> games`;
    }
    
    const currentPageEl = document.getElementById('games-current-page');
    const totalPagesEl = document.getElementById('games-total-pages');
    if (currentPageEl) currentPageEl.textContent = currentGamesPage + 1;
    if (totalPagesEl) totalPagesEl.textContent = totalPages;
    
    // Update button states
    const prevBtn = document.getElementById('games-prev-btn');
    const nextBtn = document.getElementById('games-next-btn');
    if (prevBtn) prevBtn.disabled = currentGamesPage === 0;
    if (nextBtn) nextBtn.disabled = currentGamesPage >= totalPages - 1;
}

// Global function for pagination
window.gamesGoToPage = function(page) {
    const searchTerm = document.getElementById('games-search')?.value?.toLowerCase() || '';
    const providerVal = document.getElementById('games-filter-provider')?.value || '';
    const mechanicVal = document.getElementById('games-filter-mechanic')?.value || '';
    
    let filteredGames = gameData.allGames;
    
    if (searchTerm) {
        filteredGames = filteredGames.filter(g => 
            g.name.toLowerCase().includes(searchTerm) ||
            (g.provider_studio?.toLowerCase() || '').includes(searchTerm)
        );
    }
    if (providerVal) filteredGames = filteredGames.filter(g => g.provider_studio === providerVal);
    if (mechanicVal) filteredGames = filteredGames.filter(g => {
        let feats = g.features;
        if (typeof feats === 'string') { try { feats = JSON.parse(feats); } catch(e) { feats = []; } }
        return Array.isArray(feats) && feats.includes(mechanicVal);
    });
    
    const totalPages = Math.ceil(filteredGames.length / GAMES_PER_PAGE);
    
    if (page >= 0 && page < totalPages) {
        currentGamesPage = page;
        renderGames();
    }
};

window._setGameViewFilter = function(view) {
    currentGameViewFilter = view;
    currentGamesPage = 0;
    renderGames();
};

window._setGamesPerPage = function(val) {
    GAMES_PER_PAGE = parseInt(val) || 100;
    currentGamesPage = 0;
    renderGames();
};

// Global function for sorting
window.sortGamesBy = function(field) {
    if (currentGamesSortField === field) {
        // Toggle direction
        currentGamesSortDirection = currentGamesSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // New field
        currentGamesSortField = field;
        currentGamesSortDirection = (field === 'performance_rank' || field === 'name') ? 'asc' : 'desc';
    }
    
    currentGamesPage = 0; // Reset to first page
    renderGames();
};

// Setup filters for games page
export function setupGamesFilters() {
    const searchInput = document.getElementById('games-search');
    const providerFilter = document.getElementById('games-filter-provider');
    const mechanicFilter = document.getElementById('games-filter-mechanic');
    
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            currentGamesPage = 0; // Reset to first page on filter change
            renderGames();
        });
    }
    
    if (providerFilter) {
        providerFilter.addEventListener('change', () => {
            currentGamesPage = 0; // Reset to first page on filter change
            renderGames();
        });
    }
    
    if (mechanicFilter) {
        mechanicFilter.addEventListener('change', () => {
            currentGamesPage = 0; // Reset to first page on filter change
            renderGames();
        });
    }
}

export function setupProvidersFilters() {
    const searchInput = document.getElementById('provider-search');
    const mechanicFilter = document.getElementById('providers-filter-mechanic');
    const themeFilter = document.getElementById('providers-filter-theme');
    
    // Cache the full providers list
    if (!window._cachedProviders) {
        window._cachedProviders = null;
    }
    
    if (searchInput) {
        searchInput.addEventListener('input', async () => {
            window.providersCurrentPage = 0;
            await renderProviders();
        });
    }
    
    if (mechanicFilter) {
        mechanicFilter.addEventListener('change', async () => {
            window.providersCurrentPage = 0;
            await renderProviders();
        });
    }
    
    if (themeFilter) {
        themeFilter.addEventListener('change', async () => {
            window.providersCurrentPage = 0;
            await renderProviders();
        });
    }
}

