/**
 * Login page -- handles form submit and redirect.
 * Posts credentials to the Express auth server at /api/login.
 */
import { login, isLoggedIn } from '../lib/auth.js';

if (isLoggedIn()) {
    window.location.replace('/dashboard.html');
}

const form = document.getElementById('login-form');
const errorEl = document.getElementById('login-error');
const submitBtn = document.getElementById('login-submit');

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username')?.value?.trim();
    const password = document.getElementById('login-password')?.value;

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

    const remember = document.getElementById('login-remember')?.checked || false;
    const result = await login(username, password, remember);

    if (result.success) {
        window.location.replace('/dashboard.html');
    } else {
        if (errorEl) {
            errorEl.textContent = result.error || 'Login failed';
            errorEl.classList.remove('hidden');
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML =
                '<span>Sign in</span><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>';
        }
    }
}

form?.addEventListener('submit', handleLogin);

document.querySelectorAll('#login-username, #login-password').forEach(input => {
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleLogin(e);
        }
    });
});
