// CSV Export utilities - extracted from ui.js
import { gameData } from '../lib/data.js';

function downloadCSV(filename, csvContent) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export function exportOverviewCSV() {
    const headers = ['Rank', 'Theme', 'Game Count', 'Performance Index'];
    const rows = gameData.themes
        .slice(0, 10)
        .map((theme, i) => [i + 1, theme.Theme, theme['Game Count'], theme['Smart Index'].toFixed(2)]);
    const csv = [headers.map(escapeCSV).join(','), ...rows.map(row => row.map(escapeCSV).join(','))].join('\n');
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(`game-analytics-overview-${timestamp}.csv`, csv);
}

export function exportThemesCSV(filteredThemes = null) {
    const headers = ['Theme', 'Game Count', 'Performance Index', 'Market Share %'];
    const themes = filteredThemes || gameData.themes;
    const rows = themes.map(theme => [
        theme.Theme,
        theme['Game Count'],
        theme['Smart Index'].toFixed(2),
        theme['Market Share %'],
    ]);
    const csv = [headers.map(escapeCSV).join(','), ...rows.map(row => row.map(escapeCSV).join(','))].join('\n');
    const timestamp = new Date().toISOString().split('T')[0];
    const suffix = filteredThemes ? '-filtered' : '';
    downloadCSV(`game-analytics-themes${suffix}-${timestamp}.csv`, csv);
}

export function exportMechanicsCSV() {
    const headers = ['Mechanic', 'Game Count', 'Performance Index'];
    const rows = gameData.mechanics.map(mech => [mech.Mechanic, mech['Game Count'], mech['Smart Index'].toFixed(2)]);
    const csv = [headers.map(escapeCSV).join(','), ...rows.map(row => row.map(escapeCSV).join(','))].join('\n');
    const timestamp = new Date().toISOString().split('T')[0];
    downloadCSV(`game-analytics-mechanics-${timestamp}.csv`, csv);
}

export function setupExportButtons(getFilteredThemes) {
    const overviewBtn = document.getElementById('export-overview');
    const themesBtn = document.getElementById('export-themes');
    const mechanicsBtn = document.getElementById('export-mechanics');

    if (overviewBtn) overviewBtn.addEventListener('click', exportOverviewCSV);
    if (themesBtn) themesBtn.addEventListener('click', () => exportThemesCSV(getFilteredThemes?.()));
    if (mechanicsBtn) mechanicsBtn.addEventListener('click', exportMechanicsCSV);
}
