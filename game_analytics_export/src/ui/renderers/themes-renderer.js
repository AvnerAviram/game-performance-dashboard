// Themes page renderer
import { gameData, getActiveThemes, getActiveGames } from '../../lib/data.js';
import { F } from '../../lib/game-fields.js';
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
        const isQualified = theme.qualified !== false;
        const barW = Math.max(4, (si / maxSI) * 100);
        const gcBarW = Math.max(4, (gc / maxGC) * 100);
        const msBarW = Math.max(2, (ms / maxMS) * 100);
        const isAboveAvg = si >= avgSI;
        const medal =
            isQualified && globalIndex === 0
                ? '<span class="mr-1">🥇</span>'
                : isQualified && globalIndex === 1
                  ? '<span class="mr-1">🥈</span>'
                  : isQualified && globalIndex === 2
                    ? '<span class="mr-1">🥉</span>'
                    : '';
        const rankBg = globalIndex < 3 ? 'bg-indigo-50 dark:bg-indigo-900/20' : '';

        const themeName = theme.Theme;

        const row = tbody.insertRow();
        row.className = `theme-row group hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all duration-150 cursor-pointer ${rankBg}`;
        row.dataset.themeIndex = globalIndex;

        row.addEventListener('click', e => {
            const onExpand = e.target.closest('.expand-toggle');
            if (onExpand) {
                e.preventDefault();
                e.stopPropagation();
                window.toggleArtDrill(globalIndex, themeName);
                return;
            }
            window.showThemeDetails(themeName);
        });

        const xDim = (metric, dv) =>
            escapeAttr(JSON.stringify({ metric, dimension: 'theme', value: themeName, displayValue: dv }));
        row.innerHTML = `
            <td class="px-4 py-3.5 text-sm font-medium text-gray-400 dark:text-gray-500 w-16">${medal}${globalIndex + 1}</td>
            <td class="px-4 py-3.5" data-xray='${escapeAttr(JSON.stringify({ dimension: 'theme', value: themeName, rank: globalIndex + 1 }))}'>
                <span class="inline-flex items-center gap-1">
                    <span class="expand-toggle inline-flex min-h-[28px] min-w-[28px] items-center justify-center cursor-pointer rounded text-gray-400 hover:bg-gray-200/70 hover:text-gray-700 dark:hover:bg-gray-700/70 dark:hover:text-gray-200 select-none text-xs shrink-0" role="button" tabindex="0" aria-label="${escapeAttr(`Expand art drill-down for ${themeName}`)}" aria-expanded="false"><span class="expand-icon pointer-events-none">▶</span></span>
                    <span class="text-[15px] font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${escapeHtml(themeName)}</span>
                </span>
            </td>
            <td class="px-4 py-3.5 w-36" data-xray='${xDim('game_count', String(gc))}'>
                <div class="flex items-center gap-2">
                    <span class="text-sm tabular-nums text-gray-700 dark:text-gray-300 w-8 text-right">${gc}</span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full bg-gray-400 dark:bg-gray-500 transition-all" style="width:${gcBarW}%"></div></div>
                </div>
            </td>
            <td class="px-4 py-3.5 w-56" data-xray='${xDim('smart_index', si.toFixed(2))}'>
                <div class="flex items-center gap-2">
                    <span class="text-sm font-bold tabular-nums ${!isQualified ? 'text-gray-400 dark:text-gray-500' : isAboveAvg ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}">${si.toFixed(2)}${!isQualified ? '<span class="text-[9px] ml-0.5" title="Below ${20}-game minimum — ranking may not be statistically reliable">†</span>' : ''}</span>
                    <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full transition-all ${!isQualified ? 'bg-gray-300 dark:bg-gray-600 opacity-50' : isAboveAvg ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-gray-300 to-gray-400 dark:from-gray-500 dark:to-gray-600'}" style="width:${barW}%"></div></div>
                    <span class="text-[10px] ${isAboveAvg ? 'text-emerald-500' : 'text-gray-400'}">${isAboveAvg ? '▲' : '▼'}</span>
                </div>
            </td>
            <td class="px-4 py-3.5 w-36" data-xray='${xDim('market_share', ms.toFixed(2) + '%')}'>
                <div class="flex items-center gap-2">
                    <span class="text-sm tabular-nums text-gray-600 dark:text-gray-400 w-12 text-right">${ms.toFixed(2)}%</span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full bg-blue-400 dark:bg-blue-500 transition-all" style="width:${msBarW}%"></div></div>
                </div>
            </td>
        `;
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

window.toggleArtDrill = function (index, themeName) {
    const existingDrill = document.getElementById(`art-drill-${index}`);
    const expandIcon = document.querySelector(`[data-theme-index="${index}"] .expand-icon`);

    if (existingDrill) {
        const isHidden = existingDrill.style.display === 'none';
        existingDrill.style.display = isHidden ? 'table-row' : 'none';
        if (expandIcon) expandIcon.textContent = isHidden ? '▼' : '▶';
        return;
    }

    const allGames = getActiveGames();
    const themeGames = allGames.filter(g => F.themeConsolidated(g) === themeName);
    if (themeGames.length === 0) {
        if (expandIcon) expandIcon.textContent = '▼';
        const parentRow = document.querySelector(`[data-theme-index="${index}"]`);
        const drillRow = document.createElement('tr');
        drillRow.id = `art-drill-${index}`;
        drillRow.className = 'bg-gray-50/80 dark:bg-gray-800/50';
        drillRow.innerHTML = `<td></td><td colspan="4" class="px-4 py-3">
            <span class="text-xs text-gray-400 dark:text-gray-500 italic">No games found for this theme in current view</span>
        </td>`;
        if (parentRow && parentRow.nextSibling) {
            parentRow.parentNode.insertBefore(drillRow, parentRow.nextSibling);
        } else {
            parentRow?.parentNode?.appendChild(drillRow);
        }
        return;
    }

    const characterCounts = {};
    const elementCounts = {};
    const colorCounts = {};
    const secondaryCounts = {};
    const providerCounts = {};
    for (const g of themeGames) {
        const chars = F.artCharacters(g);
        if (Array.isArray(chars))
            chars.forEach(c => {
                if (c && c !== 'No Characters (symbol-only game)') characterCounts[c] = (characterCounts[c] || 0) + 1;
            });
        const elems = F.artElements(g);
        if (Array.isArray(elems))
            elems.forEach(e => {
                if (e) elementCounts[e] = (elementCounts[e] || 0) + 1;
            });
        const colors = F.artColorTone(g);
        if (Array.isArray(colors))
            colors.forEach(c => {
                if (c) colorCounts[c] = (colorCounts[c] || 0) + 1;
            });
        const sec = F.artThemeSecondary(g);
        if (sec) secondaryCounts[sec] = (secondaryCounts[sec] || 0) + 1;
        const prov = F.provider(g);
        if (prov) providerCounts[prov] = (providerCounts[prov] || 0) + 1;
    }

    const sortAndLimit = (obj, min, limit) =>
        Object.entries(obj)
            .filter(([, n]) => n >= min)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);

    const total = themeGames.length;
    const minCount = Math.max(2, Math.ceil(total * 0.03));

    const gamesWithChars = themeGames.filter(g => F.artCharacters(g).length > 0).length;
    const gamesWithElems = themeGames.filter(g => F.artElements(g).length > 0).length;
    const gamesWithColors = themeGames.filter(g => F.artColorTone(g).length > 0).length;
    const gamesWithSec = themeGames.filter(g => F.artThemeSecondary(g)).length;

    const topChars = sortAndLimit(characterCounts, minCount, 5);
    const topElems = sortAndLimit(elementCounts, minCount, 5);
    const topColors = sortAndLimit(colorCounts, minCount, 5);
    const topSec = sortAndLimit(secondaryCounts, minCount, 5);
    const topProviders = sortAndLimit(providerCounts, minCount, 5);

    const pill = (label, count, base, bgClass, textClass) => {
        const pct = base > 0 ? ((count / base) * 100).toFixed(0) : '0';
        return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${bgClass} ${textClass}"><span>${escapeHtml(label)}</span><span class="font-semibold">${pct}%</span></span>`;
    };

    const cardSection = (title, items, base, borderColor, pillBg, pillText) => {
        if (!items.length) return '';
        const baseLabel = base < total ? ` (${base} of ${total} games)` : ` (${total} games)`;
        const pills = `<div class="flex flex-wrap gap-1.5">${items.map(([l, c]) => pill(l, c, base, pillBg, pillText)).join('')}</div>`;
        return `<div class="py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0">
            <div class="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">${escapeHtml(title)}<span class="font-normal text-gray-400 dark:text-gray-500">${baseLabel}</span></div>
            ${pills}
        </div>`;
    };

    const sections = [
        cardSection(
            'Sub-Themes',
            topSec,
            gamesWithSec,
            'border-purple-400',
            'bg-purple-100 dark:bg-purple-900/40',
            'text-purple-700 dark:text-purple-300'
        ),
        cardSection(
            'Characters',
            topChars,
            gamesWithChars,
            'border-blue-400',
            'bg-blue-100 dark:bg-blue-900/40',
            'text-blue-700 dark:text-blue-300'
        ),
        cardSection(
            'Elements',
            topElems,
            gamesWithElems,
            'border-green-400',
            'bg-green-100 dark:bg-green-900/40',
            'text-green-700 dark:text-green-300'
        ),
        cardSection(
            'Color Tones',
            topColors,
            gamesWithColors,
            'border-amber-400',
            'bg-amber-100 dark:bg-amber-900/40',
            'text-amber-700 dark:text-amber-300'
        ),
        cardSection(
            'Top Providers',
            topProviders,
            total,
            'border-indigo-400',
            'bg-indigo-100 dark:bg-indigo-900/40',
            'text-indigo-700 dark:text-indigo-300'
        ),
    ].filter(Boolean);

    const content = sections.length
        ? sections.join('')
        : '<span class="text-xs text-gray-400 dark:text-gray-500 italic">No detailed breakdown data available</span>';

    const parentRow = document.querySelector(`[data-theme-index="${index}"]`);
    const drillRow = document.createElement('tr');
    drillRow.id = `art-drill-${index}`;
    drillRow.className = 'bg-gray-50/80 dark:bg-gray-800/50';
    drillRow.innerHTML = `<td></td><td colspan="4" class="px-4 py-3">
        <div class="space-y-0">${content}</div>
    </td>`;

    if (parentRow && parentRow.nextSibling) {
        parentRow.parentNode.insertBefore(drillRow, parentRow.nextSibling);
    } else {
        parentRow?.parentNode?.appendChild(drillRow);
    }

    if (expandIcon) expandIcon.textContent = '▼';
};

window.switchRankingFormula = function (formulaType) {
    log('🔄 Switching themes to formula:', formulaType);

    document.querySelectorAll('.filter-btn[data-formula]').forEach(btn => {
        if (btn.onclick && btn.onclick.toString().includes('switchRankingFormula')) {
            btn.classList.toggle('active', btn.dataset.formula === formulaType);
        }
    });

    gameData.themes.forEach(theme => {
        theme['Smart Index'] = theme._formulas?.[formulaType] ?? theme['Smart Index'] ?? 0;
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
