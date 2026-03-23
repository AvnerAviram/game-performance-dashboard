// Game Analytics UI Module - Thin orchestrator
// Re-exports from focused modules for backward compatibility

export { updateHeaderStats, renderOverview } from './renderers/overview-renderer.js';
import { getFilteredThemes } from './renderers/themes-renderer.js';
export { renderThemes, searchThemes, setupThemeClickHandlers, getFilteredThemes } from './renderers/themes-renderer.js';
export { renderMechanics, setupMechanicSearch, getFilteredMechanics } from './renderers/mechanics-renderer.js';
export { renderAnomalies, showAnomalies, generateInsights } from './renderers/insights-renderer.js';
export { showPage } from './router.js';
export { setupSearch } from './search.js';
export { setupDarkMode } from './dark-mode.js';
export { setupPrediction, predictGameSuccess } from '../features/prediction.js';
export { sendAIMessage, askAI } from '../features/ai-assistant.js';
export { renderTickets } from '../features/tickets.js';

// Table sorting utility
export function sortTable(tableId, colIdx) {
    const table = document.getElementById(tableId);
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.rows);
    const headers = table.querySelectorAll('th');
    const currentHeader = headers[colIdx];

    const isDescending = !currentHeader.classList.contains('sorted-desc');
    headers.forEach(h => h.classList.remove('sorted-desc', 'sorted-asc'));
    currentHeader.classList.add(isDescending ? 'sorted-desc' : 'sorted-asc');

    rows.sort((a, b) => {
        let aVal = a.cells[colIdx].textContent.replace(/[^0-9.-]/g, '');
        let bVal = b.cells[colIdx].textContent.replace(/[^0-9.-]/g, '');
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);
        const comparison = !isNaN(aNum) && !isNaN(bNum) ? bNum - aNum : bVal.localeCompare(aVal);
        return isDescending ? comparison : -comparison;
    });

    rows.forEach(row => tbody.appendChild(row));
}

// CSV export setup
import { setupExportButtons as setupExportButtonsBase } from './ui-export.js';
export function setupExportButtons() {
    setupExportButtonsBase(() => getFilteredThemes());
}

// Side-effect imports: register window globals
import './panel-details.js';
import './pagination-state.js';
