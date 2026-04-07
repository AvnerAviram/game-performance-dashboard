// Themes page renderer
import { gameData, getActiveThemes } from '../../lib/data.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../../lib/sanitize.js';
import { log } from '../../lib/env.js';
import { renderOverview } from './overview-renderer.js';
import { refreshCharts } from '../charts-modern.js';
import { DEFAULT_PAGE_SIZE } from '../../lib/shared-config.js';

let filteredThemes = null;

export function getFilteredThemes() {
    return filteredThemes;
}

function updateThemesPaginationInfo(total, start, end) {
    const themesPerPage = window.themesPerPage ?? DEFAULT_PAGE_SIZE;
    const themesCurrentPage = window.themesCurrentPage ?? 1;
    const actualEnd = Math.min(end, total);
    const totalPages = Math.ceil(total / themesPerPage);

    const select = document.getElementById('themes-per-page-footer');
    if (select) select.value = themesPerPage;

    const currentPageSpan = document.getElementById('themes-current-page');
    const totalPagesSpan = document.getElementById('themes-total-pages');
    if (currentPageSpan) currentPageSpan.textContent = themesCurrentPage;
    if (totalPagesSpan) totalPagesSpan.textContent = totalPages;

    const showingInfo = document.getElementById('themes-showing-info');
    if (showingInfo) {
        showingInfo.innerHTML = `Showing <span class="font-semibold">${start + 1}-${actualEnd}</span> of <span class="font-semibold">${total}</span>`;
    }

    const prevBtn = document.getElementById('themes-prev-btn');
    const nextBtn = document.getElementById('themes-next-btn');
    if (prevBtn) prevBtn.disabled = themesCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = themesCurrentPage >= totalPages;
}

function updateFormulaTooltip(formulaType) {
    const title = document.getElementById('themes-tooltip-title') || document.getElementById('tooltip-title');
    const formula = document.getElementById('themes-tooltip-formula') || document.getElementById('tooltip-formula');
    const content = document.getElementById('themes-tooltip-content') || document.getElementById('tooltip-content');

    const tooltips = {
        totalTheo: {
            title: 'Total Theo Win',
            formula: 'Avg Theo × Game Count',
            content: `
                <p><strong>Industry Standard</strong><br>Total expected casino profit from this theme</p>
                <p><strong>Measures:</strong><br>• Total market value<br>• Overall revenue potential</p>
                <p><strong>Use Case:</strong><br>Which themes make the most money overall?</p>
            `,
        },
        avgTheo: {
            title: 'Avg Performance Index',
            formula: 'Average Theoretical Win Per Game',
            content: `
                <p><strong>Quality Metric</strong><br>Average expected profit per game</p>
                <p><strong>Measures:</strong><br>• Theme quality<br>• Performance per game</p>
                <p><strong>Use Case:</strong><br>Which themes are highest quality regardless of quantity?</p>
            `,
        },
        weightedTheo: {
            title: 'Weighted Theo',
            formula: 'Avg Theo × √(Game Count)',
            content: `
                <p><strong>Statistical Confidence</strong><br>Balances quality with sample size reliability</p>
                <p><strong>Balances:</strong><br>• Quality (Avg Theo)<br>• Sample Size (√Game Count)</p>
                <p><strong>Use Case:</strong><br>Find themes with both quality AND statistical confidence.</p>
            `,
        },
    };

    const info = tooltips[formulaType];
    if (title) title.textContent = info.title;
    if (formula) formula.textContent = info.formula;
    if (content) content.innerHTML = info.content;
}

export function renderThemes(themesToRender = null) {
    const tbody = document.querySelector('#themes-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const allThemes = themesToRender || getActiveThemes();
    const themesPerPage = window.themesPerPage ?? DEFAULT_PAGE_SIZE;
    let themesCurrentPage = window.themesCurrentPage ?? 1;

    if (typeof window !== 'undefined' && window.themesCurrentPage !== undefined) {
        themesCurrentPage = window.themesCurrentPage;
    }

    const startIndex = (themesCurrentPage - 1) * themesPerPage;
    const endIndex = startIndex + themesPerPage;
    const themes = allThemes.slice(startIndex, endIndex);

    updateThemesPaginationInfo(allThemes.length, startIndex, endIndex);

    const maxSI = Math.max(...allThemes.map(t => t['Smart Index'] || 0), 1);
    const maxGC = Math.max(...allThemes.map(t => t['Game Count'] || 0), 1);
    const maxMS = Math.max(...allThemes.map(t => t['Market Share %'] || 0), 0.01);
    const avgSI = allThemes.reduce((s, t) => s + (t['Smart Index'] || 0), 0) / (allThemes.length || 1);

    themes.forEach((theme, index) => {
        const globalIndex = startIndex + index;
        const si = theme['Smart Index'] || 0;
        const gc = theme['Game Count'] || 0;
        const ms = theme['Market Share %'] ?? 0;
        const barW = Math.max(4, (si / maxSI) * 100);
        const gcBarW = Math.max(4, (gc / maxGC) * 100);
        const msBarW = Math.max(2, (ms / maxMS) * 100);
        const isAboveAvg = si >= avgSI;
        const medal =
            globalIndex === 0
                ? '<span class="mr-1">🥇</span>'
                : globalIndex === 1
                  ? '<span class="mr-1">🥈</span>'
                  : globalIndex === 2
                    ? '<span class="mr-1">🥉</span>'
                    : '';
        const rankBg = globalIndex < 3 ? 'bg-indigo-50 dark:bg-indigo-900/20' : '';

        const isUnified = theme._isUnified && theme._subthemes && Object.keys(theme._subthemes).length > 0;
        const expandIcon = isUnified ? '<span class="expand-icon">▶</span> ' : '';
        const themeName = theme.Theme;
        const themeNameEscaped = escapeAttr(themeName);

        const row = tbody.insertRow();
        row.className = `theme-row group hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all duration-150 cursor-pointer ${rankBg}`;
        row.dataset.themeIndex = globalIndex;
        row.onclick = () => window.showThemeDetails(themeName);

        row.innerHTML = `
            <td class="px-4 py-3.5 text-sm font-medium text-gray-400 dark:text-gray-500 w-16">${medal}${globalIndex + 1}</td>
            <td class="px-4 py-3.5">
                ${isUnified ? `<span class="inline-flex items-center gap-1"><span class="expand-toggle cursor-pointer text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 select-none" onclick="event.stopPropagation();toggleSubThemes(${globalIndex})">${expandIcon}</span><span class="text-[15px] font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${escapeHtml(themeName)}</span></span>` : `<span class="text-[15px] font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${escapeHtml(themeName)}</span>`}
            </td>
            <td class="px-4 py-3.5 w-36">
                <div class="flex items-center gap-2">
                    <span class="text-sm tabular-nums text-gray-700 dark:text-gray-300 w-8 text-right">${gc}</span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full bg-gray-400 dark:bg-gray-500 transition-all" style="width:${gcBarW}%"></div></div>
                </div>
            </td>
            <td class="px-4 py-3.5 w-56">
                <div class="flex items-center gap-2">
                    <span class="text-sm font-bold tabular-nums ${isAboveAvg ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}">${si.toFixed(2)}</span>
                    <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full transition-all ${isAboveAvg ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-gray-300 to-gray-400 dark:from-gray-500 dark:to-gray-600'}" style="width:${barW}%"></div></div>
                    <span class="text-[10px] ${isAboveAvg ? 'text-emerald-500' : 'text-gray-400'}">${isAboveAvg ? '▲' : '▼'}</span>
                </div>
            </td>
            <td class="px-4 py-3.5 w-36">
                <div class="flex items-center gap-2">
                    <span class="text-sm tabular-nums text-gray-600 dark:text-gray-400 w-12 text-right">${ms.toFixed(2)}%</span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full bg-blue-400 dark:bg-blue-500 transition-all" style="width:${msBarW}%"></div></div>
                </div>
            </td>
        `;

        if (isUnified) {
            const subThemes = Object.values(theme._subthemes);
            const parentThemeName = theme.Theme;
            subThemes.forEach(subTheme => {
                const subRow = tbody.insertRow();
                subRow.className = `sub-theme-row sub-theme-${index} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer`;
                subRow.style.display = 'none';
                const subThemeName = subTheme.Theme;
                const subThemeNameEscaped = escapeAttr(subThemeName);
                subRow.onclick = e => {
                    e.stopPropagation();
                    window.showThemeDetails(subThemeName);
                };

                let displayName = subThemeName;
                if (parentThemeName === 'Asian' && !subThemeName.startsWith('Asian')) {
                    displayName = `Asian/${subThemeName}`;
                } else if (parentThemeName === 'Ancient Civilizations' && !subThemeName.includes('Ancient')) {
                    displayName = subThemeName.replace('Greek/', 'Ancient/Greek ');
                }

                const subSI = subTheme['Smart Index'] || 0;
                const subIsAbove = subSI >= avgSI;
                const subBarW = Math.max(4, (subSI / maxSI) * 100);
                const subMS = subTheme['Market Share %'] ?? 0;

                subRow.innerHTML = `
                    <td class="px-4 py-2.5"></td>
                    <td class="px-4 py-2.5 pl-12">
                        <span class="text-sm text-gray-500 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            └ ${escapeHtml(displayName)}
                        </span>
                    </td>
                    <td class="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">${subTheme['Game Count']}</td>
                    <td class="px-4 py-2.5">
                        <div class="flex items-center gap-2">
                            <span class="text-sm tabular-nums ${subIsAbove ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}">${subSI.toFixed(2)}</span>
                            <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full transition-all ${subIsAbove ? 'bg-emerald-400' : 'bg-gray-300 dark:bg-gray-600'}" style="width:${subBarW}%"></div></div>
                        </div>
                    </td>
                    <td class="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">${subMS.toFixed(2)}%</td>
                `;
            });
        }
    });

    const countSpan = document.getElementById('themes-count');
    if (countSpan) {
        countSpan.textContent = allThemes.length;
    }

    document.querySelectorAll('.theme-link').forEach(link => {
        link.addEventListener('click', function () {
            const themeName = this.dataset.theme?.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
            if (themeName) {
                window.showThemeDetails(themeName);
            }
        });
    });
}

window.toggleSubThemes = function (index) {
    const subRows = document.querySelectorAll(`.sub-theme-${index}`);
    const expandIcon = document.querySelector(`[data-theme-index="${index}"] .expand-icon`);

    const isExpanded = subRows[0]?.style.display !== 'none';

    subRows.forEach(row => {
        row.style.display = isExpanded ? 'none' : 'table-row';
    });

    if (expandIcon) {
        expandIcon.textContent = isExpanded ? '▶' : '▼';
    }
};

window.switchRankingFormula = function (formulaType) {
    log('🔄 Switching themes to formula:', formulaType);

    document.querySelectorAll('.filter-btn[data-formula]').forEach(btn => {
        if (btn.onclick && btn.onclick.toString().includes('switchRankingFormula')) {
            btn.classList.toggle('active', btn.dataset.formula === formulaType);
        }
    });

    gameData.themes.forEach(theme => {
        theme['Smart Index'] = theme._formulas[formulaType];

        if (theme._subthemes) {
            Object.values(theme._subthemes).forEach(subTheme => {
                subTheme['Smart Index'] = subTheme._formulas[formulaType];
            });
        }
    });

    gameData.themes.sort((a, b) => b['Smart Index'] - a['Smart Index']);

    updateFormulaTooltip(formulaType);

    const dropdowns = ['overview-ranking-formula', 'ranking-formula'];
    dropdowns.forEach(id => {
        const dropdown = document.getElementById(id);
        if (dropdown && dropdown.value !== formulaType) {
            dropdown.value = formulaType;
        }
    });

    renderThemes();
    renderOverview();
    refreshCharts();
};

export function searchThemes(query) {
    if (!query || query.trim() === '') {
        filteredThemes = null;
        renderThemes();
        return;
    }

    const searchTerm = query.toLowerCase().trim();
    filteredThemes = getActiveThemes().filter(theme => theme.Theme.toLowerCase().includes(searchTerm));

    renderThemes(filteredThemes);
}

export function setupThemeClickHandlers() {
    const tbody = document.querySelector('#themes-table tbody');
    if (tbody) {
        tbody.addEventListener('click', e => {
            const themeLink = e.target.closest('.theme-link');
            if (themeLink) {
                const themeName = themeLink.dataset.theme?.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
                if (themeName) {
                    window.showThemeDetails(themeName);
                }
            }
        });
    }
}
