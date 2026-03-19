import { describe, it, expect, beforeEach, vi } from 'vitest';
import { login, logout, isLoggedIn, getCurrentUser, isAdmin, verifySession } from '../../src/lib/auth.js';

describe('Auth Client Module', () => {
    beforeEach(() => {
        sessionStorage.clear();
        vi.restoreAllMocks();
    });

    describe('isLoggedIn', () => {
        it('returns false when no session data', () => {
            expect(isLoggedIn()).toBe(false);
        });

        it('returns true when valid session data exists', () => {
            sessionStorage.setItem('game-dashboard-auth', JSON.stringify({ username: 'alice', role: 'user' }));
            expect(isLoggedIn()).toBe(true);
        });

        it('returns false when session data is malformed JSON', () => {
            sessionStorage.setItem('game-dashboard-auth', 'not-json');
            expect(isLoggedIn()).toBe(false);
        });

        it('returns false when username is missing', () => {
            sessionStorage.setItem('game-dashboard-auth', JSON.stringify({ role: 'user' }));
            expect(isLoggedIn()).toBe(false);
        });

        it('returns false when username is empty string', () => {
            sessionStorage.setItem('game-dashboard-auth', JSON.stringify({ username: '', role: 'user' }));
            expect(isLoggedIn()).toBe(false);
        });
    });

    describe('getCurrentUser', () => {
        it('returns null when no session', () => {
            expect(getCurrentUser()).toBeNull();
        });

        it('returns username when session exists', () => {
            sessionStorage.setItem('game-dashboard-auth', JSON.stringify({ username: 'bob', role: 'admin' }));
            expect(getCurrentUser()).toBe('bob');
        });

        it('returns null for malformed data', () => {
            sessionStorage.setItem('game-dashboard-auth', '{bad');
            expect(getCurrentUser()).toBeNull();
        });
    });

    describe('isAdmin', () => {
        it('returns false when no session', () => {
            expect(isAdmin()).toBe(false);
        });

        it('returns true for admin role', () => {
            sessionStorage.setItem('game-dashboard-auth', JSON.stringify({ username: 'admin', role: 'admin' }));
            expect(isAdmin()).toBe(true);
        });

        it('returns false for user role', () => {
            sessionStorage.setItem('game-dashboard-auth', JSON.stringify({ username: 'user', role: 'user' }));
            expect(isAdmin()).toBe(false);
        });

        it('returns false for malformed data', () => {
            sessionStorage.setItem('game-dashboard-auth', 'garbage');
            expect(isAdmin()).toBe(false);
        });
    });

    describe('login', () => {
        it('rejects empty username', async () => {
            const result = await login('', 'password');
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/required/i);
        });

        it('rejects empty password', async () => {
            const result = await login('user', '');
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/required/i);
        });

        it('rejects null username', async () => {
            const result = await login(null, 'password');
            expect(result.success).toBe(false);
        });

        it('rejects whitespace-only username', async () => {
            const result = await login('   ', 'password');
            expect(result.success).toBe(false);
        });

        it('stores session on successful login', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ user: { username: 'alice', role: 'admin' } }),
            });

            const result = await login('alice', 'pass123');
            expect(result.success).toBe(true);
            expect(result.user.username).toBe('alice');
            expect(isLoggedIn()).toBe(true);
            expect(getCurrentUser()).toBe('alice');
            expect(isAdmin()).toBe(true);
        });

        it('returns error on failed login', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({ error: 'Invalid credentials' }),
            });

            const result = await login('alice', 'wrong');
            expect(result.success).toBe(false);
            expect(result.error).toBe('Invalid credentials');
        });

        it('handles network errors gracefully', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

            const result = await login('alice', 'pass');
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/network/i);
        });

        it('trims username before sending', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ user: { username: 'alice', role: 'user' } }),
            });

            await login('  alice  ', 'pass');
            const body = JSON.parse(global.fetch.mock.calls[0][1].body);
            expect(body.username).toBe('alice');
        });
    });

    describe('logout', () => {
        it('clears session storage', async () => {
            sessionStorage.setItem('game-dashboard-auth', JSON.stringify({ username: 'alice' }));
            global.fetch = vi.fn().mockResolvedValue({ ok: true });

            await logout();
            expect(isLoggedIn()).toBe(false);
        });

        it('still clears session if fetch fails', async () => {
            sessionStorage.setItem('game-dashboard-auth', JSON.stringify({ username: 'alice' }));
            global.fetch = vi.fn().mockRejectedValue(new Error('down'));

            await logout();
            expect(isLoggedIn()).toBe(false);
        });
    });

    describe('verifySession', () => {
        it('returns user on valid session', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ user: { username: 'bob', role: 'admin' } }),
            });

            const user = await verifySession();
            expect(user.username).toBe('bob');
            expect(isLoggedIn()).toBe(true);
            expect(isAdmin()).toBe(true);
        });

        it('returns null and clears session on expired session', async () => {
            sessionStorage.setItem('game-dashboard-auth', JSON.stringify({ username: 'old' }));
            global.fetch = vi.fn().mockResolvedValue({ ok: false });

            const user = await verifySession();
            expect(user).toBeNull();
            expect(isLoggedIn()).toBe(false);
        });

        it('returns null on network error', async () => {
            global.fetch = vi.fn().mockRejectedValue(new Error('offline'));

            const user = await verifySession();
            expect(user).toBeNull();
        });
    });
});
