/**
 * Auth module -- server-backed session authentication.
 *
 * Login calls POST /api/login on the Express auth server.
 * Session state is verified via GET /api/session.
 * A local flag in sessionStorage is used as a fast-path check to
 * avoid flashing the login page on every navigation.
 */

const SESSION_FLAG = 'game-dashboard-auth';

export async function login(username, password, remember = false) {
    if (!username?.trim() || !password?.trim()) {
        return { success: false, error: 'Username and password are required' };
    }

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username.trim(), password, remember }),
        });
        const data = await res.json();
        if (!res.ok) {
            return { success: false, error: data.error || 'Login failed' };
        }
        sessionStorage.setItem(
            SESSION_FLAG,
            JSON.stringify({ username: data.user.username, role: data.user.role || 'user', loggedInAt: Date.now() })
        );
        return { success: true, user: data.user };
    } catch (_e) {
        return { success: false, error: 'Network error. Please try again.' };
    }
}

export async function logout() {
    sessionStorage.removeItem(SESSION_FLAG);
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch {
        /* best-effort */
    }
}

/**
 * Fast synchronous check using the sessionStorage flag.
 * The real session is enforced server-side; this is only used
 * client-side to decide whether to show the loading overlay or redirect.
 */
export function isLoggedIn() {
    try {
        const data = sessionStorage.getItem(SESSION_FLAG);
        if (!data) return false;
        const user = JSON.parse(data);
        return !!user?.username;
    } catch {
        /* corrupt session storage — treat as logged out */
        return false;
    }
}

/**
 * Verify the server-side session is still valid.
 * Returns the user object or null.
 */
export async function verifySession() {
    try {
        const res = await fetch('/api/session');
        if (!res.ok) {
            sessionStorage.removeItem(SESSION_FLAG);
            return null;
        }
        const data = await res.json();
        sessionStorage.setItem(
            SESSION_FLAG,
            JSON.stringify({ username: data.user.username, role: data.user.role || 'user', loggedInAt: Date.now() })
        );
        return data.user;
    } catch {
        /* network error — treat as no session */
        return null;
    }
}

export function getCurrentUser() {
    try {
        const data = sessionStorage.getItem(SESSION_FLAG);
        if (!data) return null;
        return JSON.parse(data)?.username || null;
    } catch {
        /* corrupt session storage */
        return null;
    }
}

export function isAdmin() {
    try {
        const data = sessionStorage.getItem(SESSION_FLAG);
        if (!data) return false;
        return JSON.parse(data)?.role === 'admin';
    } catch {
        /* corrupt session storage */
        return false;
    }
}

export function redirectToLogin() {
    window.location.replace('/login.html');
}
