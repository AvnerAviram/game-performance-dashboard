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
        
        // Update count
        if (countEl) countEl.textContent = providers.length;
        
        if (providers.length === 0) {
            container.innerHTML = '<div class="empty-state" style="text-align: center; padding: 3rem; color: var(--text-secondary);">No providers found</div>';
            return;
        }
        
        // Sort by game count (descending)
        providers.sort((a, b) => b.game_count - a.game_count);
        
        // PAGINATION LOGIC
        const ITEMS_PER_PAGE = window.providersPerPage || 50;
        const currentPage = window.providersCurrentPage || 1;
        const totalPages = Math.ceil(providers.length / ITEMS_PER_PAGE);
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const paginatedProviders = providers.slice(startIndex, endIndex);
        
        let html = `
            <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
                <table id="providers-table" class="w-full">
                    <thead class="bg-gray-50 dark:bg-gray-900">
                            <tr class="border-b border-gray-200 dark:border-gray-700">
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable" onclick="sortTable('providers-table', 0)">Rank</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="sortTable('providers-table', 1)">Provider</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="sortTable('providers-table', 2)">Games</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="sortTable('providers-table', 3)">Avg Theo Win</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="sortTable('providers-table', 4)">Market Share</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="sortTable('providers-table', 5)">Avg RTP</th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sortable cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onclick="sortTable('providers-table', 6)">Volatility</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
        `;
        
        paginatedProviders.forEach((provider, index) => {
            const globalIndex = startIndex + index;
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
                    <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${globalIndex + 1}</td>
                    <td class="px-4 py-3">
                        <span class="text-indigo-600 dark:text-indigo-400 cursor-pointer hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors" 
                              onclick="${safeOnclick('window.showProviderDetails', provider.studio)}">${escapeHtml(provider.studio)}</span>
                        ${parentInfo}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">${provider.game_count}</td>
                    <td class="px-4 py-3">
                        <span class="text-amber-600 dark:text-amber-400">${provider.avg_theo_win ? provider.avg_theo_win.toFixed(2) : 'N/A'}</span>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${provider.total_market_share ? provider.total_market_share.toFixed(2) + '%' : 'N/A'}</td>
                    <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${provider.avg_rtp ? provider.avg_rtp.toFixed(1) + '%' : 'N/A'}</td>
                    <td class="px-4 py-3">${volatilityBadge}</td>
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
let currentGamesSortField = 'performance_rank';
let currentGamesSortDirection = 'asc';
let currentGameViewFilter = 'all';
let GAMES_PER_PAGE = 100;

export function renderGames() {
    log('🎮 Rendering Games page...');
    
    const container = document.getElementById('games-content');
    const countEl = document.getElementById('games-count');
    if (!container) return;
    
    // Update count
    if (countEl) countEl.textContent = gameData.allGames.length;
    
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
    
    if (currentGameViewFilter === 'topPerformers') {
        filteredGames = [...filteredGames].sort((a, b) => (b.performance_theo_win || 0) - (a.performance_theo_win || 0));
        filteredGames = filteredGames.slice(0, Math.ceil(filteredGames.length * 0.2));
    } else if (currentGameViewFilter === 'highVolatility') {
        filteredGames = filteredGames.filter(g => g.specs_volatility && g.specs_volatility.toLowerCase() === 'high');
    }
    
    // Apply sorting
    filteredGames.sort((a, b) => {
        let valA = a[currentGamesSortField];
        let valB = b[currentGamesSortField];
        
        // Handle nulls
        if (valA == null) valA = currentGamesSortField === 'performance_rank' ? 999 : 0;
        if (valB == null) valB = currentGamesSortField === 'performance_rank' ? 999 : 0;
        
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
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-6 -mr-8">
            <table id="games-table" class="w-full">
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
                <td colspan="10" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                    No games match your filters
                </td>
            </tr>
        `;
    } else {
        paginatedGames.forEach(game => {
            const volatilityBadge = game.specs_volatility ? 
                (() => {
                    const v = game.specs_volatility;
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
                    <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${game.performance_rank || 'N/A'}</td>
                    <td class="px-4 py-3">
                        <span class="cursor-pointer text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors" 
                              onclick="${safeOnclick('window.showGameDetails', game.name)}">${escapeHtml(game.name)}</span>
                    </td>
                    <td class="px-4 py-3">
                        <span class="cursor-pointer text-cyan-700 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 transition-colors" 
                              onclick="${safeOnclick('window.showProviderDetails', game.provider_studio || '')}">${escapeHtml(game.provider_studio || 'N/A')}</span>
                    </td>
                    <td class="px-4 py-3 text-sm">${game.theme_consolidated ? `<span class="cursor-pointer text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showThemeDetails', game.theme_consolidated || '')}">${escapeHtml(game.theme_consolidated)}</span>` : 'N/A'}</td>
                    <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">${(() => {
                        let f = game.features;
                        if (typeof f === 'string') { try { f = JSON.parse(f); } catch(e) { f = []; } }
                        if (!Array.isArray(f) || f.length === 0) return '—';
                        return f.slice(0, 2).map(feat => `<span class="cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors" onclick="${safeOnclick('window.showMechanicDetails', feat)}">${escapeHtml(feat)}</span>`).join(', ') + (f.length > 2 ? ` <span class="text-gray-400">+${f.length-2}</span>` : '');
                    })()}</td>
                    <td class="px-4 py-3">
                        <span class="text-amber-600 dark:text-amber-400">${game.performance_theo_win?.toFixed(2) || 'N/A'}</span>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${game.performance_market_share_percent?.toFixed(2) || 'N/A'}%</td>
                    <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${game.specs_rtp ? game.specs_rtp + '%' : 'N/A'}</td>
                    <td class="px-4 py-3">${volatilityBadge}</td>
                    <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">${game.release_year || 'N/A'}</td>
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
        currentGamesSortDirection = field === 'performance_rank' ? 'asc' : 'desc';
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
