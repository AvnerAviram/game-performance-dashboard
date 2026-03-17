/**
 * Auth UI - Hamburger menu: Log in, Log out (no username)
 * Uses event delegation so it works when DOM is replaced on page navigation
 */
import { logout, redirectToLogin, isLoggedIn } from '../lib/auth.js';

let hamburgerOpen = false;

export function updateAuthUI() {
    const loggedIn = isLoggedIn();
    const loginBtn = document.getElementById('auth-login-btn');
    const logoutBtn = document.getElementById('auth-logout-btn');
    if (loginBtn) loginBtn.classList.toggle('hidden', loggedIn);
    if (logoutBtn) logoutBtn.classList.toggle('hidden', !loggedIn);
}

function toggleHamburger() {
    hamburgerOpen = !hamburgerOpen;
    const dropdown = document.getElementById('hamburger-dropdown');
    const btn = document.getElementById('hamburger-btn');
    if (dropdown) dropdown.classList.toggle('hidden', !hamburgerOpen);
    if (btn) btn.setAttribute('aria-expanded', hamburgerOpen);
}

function closeHamburger() {
    hamburgerOpen = false;
    const dropdown = document.getElementById('hamburger-dropdown');
    const btn = document.getElementById('hamburger-btn');
    if (dropdown) dropdown.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}

function handleLogout() {
    logout();
    redirectToLogin();
}

export function setupAuthUI() {
    updateAuthUI();

    // Event delegation: hamburger/buttons are in page content that gets replaced on navigation
    document.addEventListener('click', (e) => {
        const hamburgerBtn = e.target.closest('#hamburger-btn');
        const loginBtn = e.target.closest('#auth-login-btn');
        const logoutBtn = e.target.closest('#auth-logout-btn');
        if (hamburgerBtn) {
            e.stopPropagation();
            toggleHamburger();
        } else if (loginBtn) {
            closeHamburger();
            redirectToLogin();
        } else if (logoutBtn) {
            handleLogout();
        } else if (hamburgerOpen) {
            const dropdown = document.getElementById('hamburger-dropdown');
            const btn = document.getElementById('hamburger-btn');
            if (dropdown && btn && !dropdown.contains(e.target) && !btn.contains(e.target)) {
                closeHamburger();
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && hamburgerOpen) closeHamburger();
    });
}
