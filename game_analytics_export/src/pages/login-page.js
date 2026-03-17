/**
 * Login page – handles form submit and redirect
 * Runs only on login.html
 */
import { login, isLoggedIn } from '../lib/auth.js';

const REMEMBER_PREF_KEY = 'game-dashboard-remember-pref';

// If already logged in, redirect to dashboard
if (isLoggedIn()) {
    window.location.replace('dashboard.html');
}

const form = document.getElementById('login-form');
const rememberCheckbox = document.getElementById('login-remember');

// Restore Remember me preference (default: checked)
if (rememberCheckbox) {
    const saved = localStorage.getItem(REMEMBER_PREF_KEY);
    rememberCheckbox.checked = saved === null ? true : saved === 'true';
}
const errorEl = document.getElementById('login-error');
const submitBtn = document.getElementById('login-submit');

form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username')?.value?.trim();
    const password = document.getElementById('login-password')?.value;
    const rememberMe = document.getElementById('login-remember')?.checked ?? true;

    if (!username || !password) {
        if (errorEl) {
            errorEl.textContent = 'Please enter username and password';
            errorEl.classList.remove('hidden');
        }
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="animate-pulse">Signing in...</span>';
    }
    if (errorEl) errorEl.classList.add('hidden');

    // Auth handles both demo (localStorage/sessionStorage) and future API – see auth.js
    const result = await login(username, password, rememberMe);

    if (result.success) {
        localStorage.setItem(REMEMBER_PREF_KEY, String(rememberMe));
        window.location.replace('dashboard.html');
    } else {
        if (errorEl) {
            errorEl.textContent = result.error || 'Login failed';
            errorEl.classList.remove('hidden');
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Sign in</span><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>';
        }
    }
});
