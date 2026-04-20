// Mechanics page renderer
import { getActiveMechanics } from '../../lib/data.js';
import { escapeHtml, escapeAttr, safeOnclick } from '../../lib/sanitize.js';
import { DEFAULT_PAGE_SIZE } from '../../lib/shared-config.js';

let filteredMechanics = null;

function updateMechanicsPaginationInfo(total, start, end) {
    const mechanicsPerPage = window.mechanicsPerPage ?? DEFAULT_PAGE_SIZE;
    const mechanicsCurrentPage = window.mechanicsCurrentPage ?? 1;
    const actualEnd = Math.min(end, total);
    const totalPages = Math.ceil(total / mechanicsPerPage);

    const select = document.getElementById('mechanics-per-page-footer');
    if (select) select.value = mechanicsPerPage;

    const currentPageSpan = document.getElementById('mechanics-current-page');
    const totalPagesSpan = document.getElementById('mechanics-total-pages');
    if (currentPageSpan) currentPageSpan.textContent = mechanicsCurrentPage;
    if (totalPagesSpan) totalPagesSpan.textContent = totalPages;

    const showingInfo = document.getElementById('mechanics-showing-info');
    if (showingInfo) {
        showingInfo.innerHTML = `Showing <span class="font-semibold">${start + 1}-${actualEnd}</span> of <span class="font-semibold">${total}</span>`;
    }

    const prevBtn = document.getElementById('mechanics-prev-btn');
    const nextBtn = document.getElementById('mechanics-next-btn');
    if (prevBtn) prevBtn.disabled = mechanicsCurrentPage === 1;
    if (nextBtn) nextBtn.disabled = mechanicsCurrentPage >= totalPages;
}

export function renderMechanics(mechanicsToRender = null) {
    const tbody = document.querySelector('#mechanics-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const allMechanics = mechanicsToRender || getActiveMechanics();
    const mechanicsPerPage = window.mechanicsPerPage ?? DEFAULT_PAGE_SIZE;
    let mechanicsCurrentPage = window.mechanicsCurrentPage ?? 1;

    if (typeof window !== 'undefined' && window.mechanicsCurrentPage !== undefined) {
        mechanicsCurrentPage = window.mechanicsCurrentPage;
    }

    const startIndex = (mechanicsCurrentPage - 1) * mechanicsPerPage;
    const endIndex = startIndex + mechanicsPerPage;
    const mechanics = allMechanics.slice(startIndex, endIndex);

    updateMechanicsPaginationInfo(allMechanics.length, startIndex, endIndex);

    const mechanicsCountSpan = document.getElementById('mechanics-count');
    if (mechanicsCountSpan) mechanicsCountSpan.textContent = allMechanics.length;

    const maxSI = Math.max(...allMechanics.map(m => m['Smart Index'] || 0), 1);
    const maxGC = Math.max(...allMechanics.map(m => m['Game Count'] || 0), 1);
    const avgSI = allMechanics.reduce((s, m) => s + (m['Smart Index'] || 0), 0) / (allMechanics.length || 1);

    mechanics.forEach((mech, index) => {
        const globalIndex = startIndex + index;
        const si = mech['Smart Index'] || 0;
        const gc = mech['Game Count'] || 0;
        const barW = Math.max(4, (si / maxSI) * 100);
        const gcBarW = Math.max(4, (gc / maxGC) * 100);
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

        const row = tbody.insertRow();
        row.className = `group hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all duration-150 cursor-pointer ${rankBg}`;
        row.onclick = () => window.showMechanicDetails(mech.Mechanic);
        const mechName = mech.Mechanic;
        const mxDim = (metric, dv) =>
            escapeAttr(JSON.stringify({ metric, dimension: 'feature', value: mechName, displayValue: dv }));
        row.innerHTML = `
            <td class="px-4 py-3.5 text-sm font-medium text-gray-400 dark:text-gray-500 w-16">${medal}${globalIndex + 1}</td>
            <td class="px-4 py-3.5" data-xray='${escapeAttr(JSON.stringify({ dimension: 'feature', value: mechName, rank: globalIndex + 1 }))}'>
                <span class="text-[15px] font-semibold text-gray-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${escapeHtml(mechName)}</span>
            </td>
            <td class="px-4 py-3.5 w-40" data-xray='${mxDim('game_count', String(gc))}'>
                <div class="flex items-center gap-2">
                    <span class="text-sm tabular-nums text-gray-700 dark:text-gray-300 w-8 text-right">${gc}</span>
                    <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full bg-gray-400 dark:bg-gray-500 transition-all" style="width:${gcBarW}%"></div></div>
                </div>
            </td>
            <td class="px-4 py-3.5 w-56" data-xray='${mxDim('smart_index', si.toFixed(2))}'>
                <div class="flex items-center gap-2">
                    <span class="text-sm font-bold tabular-nums ${isAboveAvg ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}">${si.toFixed(2)}</span>
                    <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div class="h-full rounded-full transition-all ${isAboveAvg ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-gray-300 to-gray-400 dark:from-gray-500 dark:to-gray-600'}" style="width:${barW}%"></div></div>
                    <span class="text-[10px] ${isAboveAvg ? 'text-emerald-500' : 'text-gray-400'}">${isAboveAvg ? '▲' : '▼'}</span>
                </div>
            </td>
        `;
    });
}

function searchMechanics(query) {
    const trimmedQuery = query.trim().toLowerCase();

    if (!trimmedQuery) {
        filteredMechanics = null;
        renderMechanics();
        return;
    }

    filteredMechanics = getActiveMechanics().filter(mech => mech.Mechanic.toLowerCase().includes(trimmedQuery));

    renderMechanics(filteredMechanics);
}

export function getFilteredMechanics() {
    return filteredMechanics;
}

export function setupMechanicSearch() {
    const searchInput = document.getElementById('mechanic-search');
    const clearBtn = document.getElementById('clear-mechanic-search');

    if (!searchInput) return;

    let mechanicSearchDebounceTimer = null;

    searchInput.addEventListener('input', e => {
        const query = e.target.value;

        if (clearBtn) {
            clearBtn.style.display = query ? 'block' : 'none';
        }

        clearTimeout(mechanicSearchDebounceTimer);
        mechanicSearchDebounceTimer = setTimeout(() => {
            searchMechanics(query);
        }, 300);
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            searchMechanics('');
            searchInput.focus();
        });
    }
}
