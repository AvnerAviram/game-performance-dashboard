// Pagination state and per-page/navigation handlers
import { gameData } from '../lib/data.js';
import { renderThemes, getFilteredThemes } from './renderers/themes-renderer.js';
import { renderMechanics, getFilteredMechanics } from './renderers/mechanics-renderer.js';

window.themesPerPage = 50;
window.mechanicsPerPage = 50;
window.gamesPerPage = 50;
window.providersPerPage = 50;

window.themesCurrentPage = 1;
window.mechanicsCurrentPage = 1;
window.gamesCurrentPage = 1;
window.providersCurrentPage = 1;

window.changeThemesPerPage = function (value) {
    window.themesPerPage = parseInt(value);
    window.themesCurrentPage = 1;
    renderThemes();
};

window.changeMechanicsPerPage = function (value) {
    window.mechanicsPerPage = parseInt(value);
    window.mechanicsCurrentPage = 1;
    renderMechanics();
};

window.changeGamesPerPage = function (value) {
    window.gamesPerPage = parseInt(value);
    window.gamesCurrentPage = 1;
    if (window._setGamesPerPage) {
        window._setGamesPerPage(value);
    } else {
        window.renderGames?.();
    }
};

window.changeProvidersPerPage = function (value) {
    window.providersPerPage = parseInt(value);
    window.providersCurrentPage = 1;
    window.renderProviders?.();
};

window.goToThemesPage = function (page) {
    const totalPages = Math.ceil((getFilteredThemes() || gameData.themes).length / window.themesPerPage);
    if (page < 1 || page > totalPages) return;
    window.themesCurrentPage = page;
    renderThemes(getFilteredThemes());
};

window.goToMechanicsPage = function (page) {
    const totalPages = Math.ceil((getFilteredMechanics() || gameData.mechanics).length / window.mechanicsPerPage);
    if (page < 1 || page > totalPages) return;
    window.mechanicsCurrentPage = page;
    renderMechanics(getFilteredMechanics());
};

window.goToGamesPage = function (page) {
    const totalPages = Math.ceil(gameData.allGames.length / window.gamesPerPage);
    if (page < 1 || page > totalPages) return;
    window.gamesCurrentPage = page;
    window.renderGames?.();
};

window.goToProvidersPage = function (page) {
    const totalPages = Math.ceil(gameData.providers.length / window.providersPerPage);
    if (page < 1 || page > totalPages) return;
    window.providersCurrentPage = page;
    window.renderProviders?.();
};
