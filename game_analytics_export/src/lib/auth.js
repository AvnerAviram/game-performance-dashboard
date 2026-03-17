/**
 * Auth module – production-ready structure
 *
 * CURRENT: Demo mode – any non-empty credentials log in
 * Remember me: localStorage (persists). Not checked: sessionStorage (clears when tab closes).
 * PRODUCTION: Replace loginApi() with your backend API call – see loginApi below
 */

const STORAGE_KEY = 'game-dashboard-auth';

function getStorage(rememberMe) {
    return rememberMe ? localStorage : sessionStorage;
}

// =============================================================================
// PRODUCTION: Replace this with your auth API
// Example: POST /api/auth/login with { username, password }
// =============================================================================
async function loginApi(username, password) {
    // Demo: accept any non-empty credentials
    if (!username?.trim() || !password?.trim()) {
        return { success: false, error: 'Username and password are required' };
    }
    // In production, call your backend:
    // const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    // const data = await res.json();
    // if (!res.ok) return { success: false, error: data.message || 'Login failed' };
    // return { success: true, user: { username: data.user.name, ... } };
    return { success: true, user: { username: username.trim() } };
}

export async function login(username, password, rememberMe = true) {
    const result = await loginApi(username, password);
    if (!result.success) return result;

    const user = {
        username: result.user.username,
        loggedInAt: Date.now(),
    };
    try {
        const storage = getStorage(rememberMe);
        storage.setItem(STORAGE_KEY, JSON.stringify(user));
        // Clear the other storage so only one session type is active
        const other = rememberMe ? sessionStorage : localStorage;
        other.removeItem(STORAGE_KEY);
        return { success: true, user };
    } catch (e) {
        return { success: false, error: 'Failed to save session' };
    }
}

export function logout() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_KEY);
        return true;
    } catch (e) {
        return false;
    }
}

export function isLoggedIn() {
    try {
        const data = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
        if (!data) return false;
        const user = JSON.parse(data);
        return !!user?.username;
    } catch (e) {
        return false;
    }
}

export function getCurrentUser() {
    try {
        const data = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
        if (!data) return null;
        const user = JSON.parse(data);
        return user?.username || null;
    } catch (e) {
        return null;
    }
}

/** Redirect to login page (use when protecting routes) */
export function redirectToLogin() {
    const base = window.location.pathname.replace(/\/[^/]*$/, '') || '/';
    const sep = base.endsWith('/') ? '' : '/';
    window.location.replace(`${base}${sep}login.html`);
}

/** Redirect to dashboard (use after successful login) */
export function redirectToDashboard() {
    const base = window.location.pathname.replace(/\/[^/]*$/, '') || '/';
    const sep = base.endsWith('/') ? '' : '/';
    window.location.replace(`${base}${sep}dashboard.html`);
}
