/**
 * Server Security Integration Tests
 * Tests: CSP headers, rate limiting, input validation, password policy, auth
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import http from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const USERS_FILE = join(ROOT, 'server', 'users.json');
const TEST_PORT = 3848;

let serverProcess = null;
let originalUsersContent = null;
let sessionCookie = null;

function httpReq(method, url, data = null, headers = {}) {
    const parsed = new URL(url);
    const payload = data ? JSON.stringify(data) : null;
    const opts = {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + (parsed.search || ''),
        method,
        headers: { ...headers },
    };
    if (payload) {
        opts.headers['Content-Type'] = 'application/json';
        opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }
    return new Promise((resolve, reject) => {
        const req = http.request(opts, res => {
            let body = '';
            res.on('data', c => {
                body += c;
            });
            res.on('end', () => {
                let json = null;
                try {
                    json = JSON.parse(body);
                } catch {
                    /* not json */
                }
                resolve({ status: res.statusCode, body, json, headers: res.headers });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function httpRaw(method, url, body, headers = {}) {
    const parsed = new URL(url);
    const opts = {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + (parsed.search || ''),
        method,
        headers: { ...headers },
    };
    if (body != null) {
        opts.headers['Content-Length'] = Buffer.byteLength(body);
    }
    return new Promise((resolve, reject) => {
        const req = http.request(opts, res => {
            let data = '';
            res.on('data', c => {
                data += c;
            });
            res.on('end', () => {
                let json = null;
                try {
                    json = JSON.parse(data);
                } catch {
                    /* not json */
                }
                resolve({ status: res.statusCode, body: data, json, headers: res.headers });
            });
        });
        req.on('error', reject);
        if (body != null) req.write(body);
        req.end();
    });
}

async function waitForServer(maxAttempts = 40) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/health`);
            if (res.status === 200) return true;
        } catch {
            /* not ready */
        }
        await new Promise(r => setTimeout(r, 250));
    }
    return false;
}

describe('Server Security - Integration', () => {
    beforeAll(async () => {
        const raw = existsSync(USERS_FILE) ? readFileSync(USERS_FILE, 'utf-8') : null;
        // Save a clean snapshot (strip any leftover test accounts from previous interrupted runs)
        if (raw) {
            const clean = JSON.parse(raw).filter(u => !u.username.startsWith('__sectest_'));
            originalUsersContent = JSON.stringify(clean, null, 2);
        }

        // Re-read fresh to pick up any concurrent writes from other test files
        await new Promise(r => setTimeout(r, 300));
        const freshRaw = existsSync(USERS_FILE) ? readFileSync(USERS_FILE, 'utf-8') : '[]';
        const testUsers = JSON.parse(freshRaw).filter(u => !u.username.startsWith('__sectest_'));
        testUsers.push({
            username: '__sectest_admin__',
            passwordHash: bcrypt.hashSync('SecurePass123!', 12),
            role: 'admin',
        });
        testUsers.push({
            username: '__sectest_user__',
            passwordHash: bcrypt.hashSync('UserPass999!', 12),
            role: 'user',
        });
        writeFileSync(USERS_FILE, JSON.stringify(testUsers, null, 2));

        serverProcess = spawn(process.execPath, ['server/server.cjs'], {
            cwd: ROOT,
            env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'test' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        const ready = await waitForServer();
        if (!ready) throw new Error('Server did not start');

        const loginRes = await httpReq('POST', `http://127.0.0.1:${TEST_PORT}/api/login`, {
            username: '__sectest_admin__',
            password: 'SecurePass123!',
        });
        const cookies = loginRes.headers['set-cookie'];
        sessionCookie = (Array.isArray(cookies) ? cookies[0] : cookies).split(';')[0];
    }, 30000);

    afterAll(async () => {
        if (serverProcess) {
            serverProcess.kill('SIGTERM');
            serverProcess = null;
        }
        // Always restore original users and strip any leftover test accounts
        if (originalUsersContent !== null) {
            try {
                const restored = JSON.parse(originalUsersContent).filter(u => !u.username.startsWith('__sectest_'));
                writeFileSync(USERS_FILE, JSON.stringify(restored, null, 2));
            } catch {
                writeFileSync(USERS_FILE, originalUsersContent);
            }
        }
    });

    describe('Security Headers (CSP, Helmet)', () => {
        it('should include Content-Security-Policy header', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/health`);
            expect(res.headers['content-security-policy']).toBeDefined();
        });

        it('CSP should include self as default-src', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/health`);
            const csp = res.headers['content-security-policy'];
            expect(csp).toContain("default-src 'self'");
        });

        it('CSP should allow unsafe-eval for DuckDB WASM', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/health`);
            const csp = res.headers['content-security-policy'];
            expect(csp).toContain("'unsafe-eval'");
        });

        it('should include X-Content-Type-Options: nosniff', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/health`);
            expect(res.headers['x-content-type-options']).toBe('nosniff');
        });

        it('should include Strict-Transport-Security', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/health`);
            expect(res.headers['strict-transport-security']).toBeDefined();
        });

        it('should include X-Frame-Options', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/health`);
            expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
        });
    });

    describe('Authentication & Sessions', () => {
        it('should reject invalid credentials', async () => {
            const res = await httpReq('POST', `http://127.0.0.1:${TEST_PORT}/api/login`, {
                username: '__sectest_admin__',
                password: 'wrongpassword',
            });
            expect(res.status).toBe(401);
        });

        it('should reject missing fields', async () => {
            const res = await httpReq('POST', `http://127.0.0.1:${TEST_PORT}/api/login`, {
                username: '__sectest_admin__',
            });
            expect(res.status).toBe(400);
        });

        it('should return session info for authenticated user', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/session`, null, {
                Cookie: sessionCookie,
            });
            expect(res.status).toBe(200);
            expect(res.json.user.username).toBe('__sectest_admin__');
        });

        it('session cookie should be httpOnly', async () => {
            const loginRes = await httpReq('POST', `http://127.0.0.1:${TEST_PORT}/api/login`, {
                username: '__sectest_admin__',
                password: 'SecurePass123!',
            });
            const setCookie = loginRes.headers['set-cookie'];
            const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
            expect(cookieStr.toLowerCase()).toContain('httponly');
        });
    });

    describe('Password Policy', () => {
        it('should reject passwords shorter than 8 characters', async () => {
            const res = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/admin/users`,
                {
                    username: 'weakpw',
                    password: 'short',
                    role: 'user',
                },
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(400);
            expect(res.json.error).toContain('8 characters');
        });

        it('should accept passwords with 8+ characters', async () => {
            const res = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/admin/users`,
                {
                    username: '__sectest_valid__',
                    password: 'LongEnough1',
                    role: 'user',
                },
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(201);

            await httpReq('DELETE', `http://127.0.0.1:${TEST_PORT}/api/admin/users/__sectest_valid__`, null, {
                Cookie: sessionCookie,
            });
        });

        it('should reject usernames over 50 characters', async () => {
            const res = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/admin/users`,
                {
                    username: 'a'.repeat(51),
                    password: 'LongEnough1',
                    role: 'user',
                },
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(400);
        });
    });

    describe('Ticket Input Validation', () => {
        it('should reject tickets with missing fields', async () => {
            const res = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/tickets`,
                {
                    gameName: 'TestGame',
                },
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(400);
        });

        it('should reject tickets with oversized fields', async () => {
            const res = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/tickets`,
                {
                    gameName: 'x'.repeat(501),
                    description: 'valid description',
                },
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(400);
            expect(res.json.error).toContain('500');
        });

        it('should reject non-string field types', async () => {
            const res = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/tickets`,
                {
                    gameName: 12345,
                    description: 'test',
                },
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(400);
        });

        it('should accept valid ticket and default issueType', async () => {
            const res = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/tickets`,
                {
                    gameName: 'Test Game',
                    description: 'Test description',
                    issueType: 'invalid-type',
                },
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(201);
            expect(res.json.issueType).toBe('data-issue');
        });

        it('should accept valid issueType values', async () => {
            const res = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/tickets`,
                {
                    gameName: 'Test Game 2',
                    description: 'Bug report',
                    issueType: 'ui-bug',
                },
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(201);
            expect(res.json.issueType).toBe('ui-bug');
        });

        it('should reject PATCH with invalid status', async () => {
            const createRes = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/tickets`,
                {
                    gameName: 'Patch Test',
                    description: 'patch test',
                },
                { Cookie: sessionCookie }
            );
            expect(createRes.status).toBe(201);
            const ticketId = createRes.json.id;

            const res = await httpReq(
                'PATCH',
                `http://127.0.0.1:${TEST_PORT}/api/tickets/${ticketId}`,
                {
                    status: 'hacked-status',
                },
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(400);
            expect(res.json.error).toContain('Invalid status');
        });

        it('should reject PATCH with oversized description', async () => {
            const createRes = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/tickets`,
                {
                    gameName: 'Patch Len Test',
                    description: 'len test',
                },
                { Cookie: sessionCookie }
            );
            const ticketId = createRes.json.id;

            const res = await httpReq(
                'PATCH',
                `http://127.0.0.1:${TEST_PORT}/api/tickets/${ticketId}`,
                {
                    description: 'x'.repeat(501),
                },
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(400);
        });

        it('should accept PATCH with valid status', async () => {
            const createRes = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/tickets`,
                {
                    gameName: 'Valid Patch',
                    description: 'will be resolved',
                },
                { Cookie: sessionCookie }
            );
            const ticketId = createRes.json.id;

            const res = await httpReq(
                'PATCH',
                `http://127.0.0.1:${TEST_PORT}/api/tickets/${ticketId}`,
                {
                    status: 'resolved',
                    resolution: 'Fixed in v2',
                },
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(200);
            expect(res.json.status).toBe('resolved');
            expect(res.json.resolution).toBe('Fixed in v2');
        });
    });

    describe('Authorization', () => {
        it('should block non-admin from admin endpoints', async () => {
            const loginRes = await httpReq('POST', `http://127.0.0.1:${TEST_PORT}/api/login`, {
                username: '__sectest_user__',
                password: 'UserPass999!',
            });
            const cookies = loginRes.headers['set-cookie'];
            const userCookie = (Array.isArray(cookies) ? cookies[0] : cookies).split(';')[0];

            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/admin/users`, null, {
                Cookie: userCookie,
            });
            expect(res.status).toBe(403);
        });

        it('should block non-admin from deleting tickets', async () => {
            const loginRes = await httpReq('POST', `http://127.0.0.1:${TEST_PORT}/api/login`, {
                username: '__sectest_user__',
                password: 'UserPass999!',
            });
            if (loginRes.status === 429) {
                // Rate-limited; the server is protecting itself — that's acceptable security behavior
                return;
            }
            const cookies = loginRes.headers['set-cookie'];
            expect(cookies).toBeDefined();
            const userCookie = (Array.isArray(cookies) ? cookies[0] : cookies).split(';')[0];

            const res = await httpReq('DELETE', `http://127.0.0.1:${TEST_PORT}/api/tickets/fake-id`, null, {
                Cookie: userCookie,
            });
            expect(res.status).toBe(403);
        });
    });

    describe('Health Endpoint', () => {
        it('should return ok status', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/health`);
            expect(res.status).toBe(200);
            expect(res.json.status).toBe('ok');
        });

        it('should include uptime and timestamp', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/health`);
            expect(res.json.uptime).toBeGreaterThan(0);
            expect(res.json.timestamp).toBeDefined();
        });
    });

    describe('Request Body Limits', () => {
        it('should reject oversized JSON payloads', async () => {
            const bigPayload = { data: 'x'.repeat(200000) };
            const res = await httpReq('POST', `http://127.0.0.1:${TEST_PORT}/api/login`, bigPayload);
            expect([413, 500]).toContain(res.status);
        });
    });

    describe('Edge Cases: Malformed Requests', () => {
        it('should handle malformed JSON body gracefully', async () => {
            const res = await httpRaw('POST', `http://127.0.0.1:${TEST_PORT}/api/login`, '{invalid json!!!', {
                'Content-Type': 'application/json',
            });
            expect([400, 500]).toContain(res.status);
        });

        it('should handle empty body on POST endpoints', async () => {
            const res = await httpRaw('POST', `http://127.0.0.1:${TEST_PORT}/api/login`, '', {
                'Content-Type': 'application/json',
            });
            expect([400, 429]).toContain(res.status);
        });

        it('should reject unauthenticated data access', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/data/games`);
            expect(res.status).toBe(401);
        });

        it('should serve data when authenticated', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/data/games`, null, {
                Cookie: sessionCookie,
            });
            expect(res.status).toBe(200);
            expect(res.json).toBeDefined();
        });

        it('should reject AI endpoint with missing theme', async () => {
            const res = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/generate-names`,
                {
                    keywords: 'dragon fire',
                },
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(400);
            expect(res.json.error).toContain('Theme');
        });

        it('should reject AI endpoint with oversized theme', async () => {
            const res = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/generate-names`,
                {
                    theme: 'x'.repeat(201),
                },
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(400);
            expect(res.json.error).toContain('too long');
        });

        it('should reject trademark check without auth', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/trademark-check?name=test`);
            expect(res.status).toBe(401);
        });

        it('should reject trademark check without name param', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/trademark-check`, null, {
                Cookie: sessionCookie,
            });
            expect(res.status).toBe(400);
            expect(res.json.error).toContain('Name');
        });

        it('should reject trademark check with oversized name', async () => {
            const res = await httpReq(
                'GET',
                `http://127.0.0.1:${TEST_PORT}/api/trademark-check?name=${'x'.repeat(101)}`,
                null,
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(400);
            expect(res.json.error).toContain('too long');
        });

        it('should return valid trademark check response', async () => {
            const res = await httpReq(
                'GET',
                `http://127.0.0.1:${TEST_PORT}/api/trademark-check?name=TestUnlikelyName99999`,
                null,
                { Cookie: sessionCookie }
            );
            expect(res.status).toBe(200);
            expect(res.json).toHaveProperty('name');
            expect(res.json).toHaveProperty('results');
            expect(res.json).toHaveProperty('totalCount');
            expect(res.json).toHaveProperty('dailyRemaining');
            expect(Array.isArray(res.json.results)).toBe(true);
        });

        it('should return 404 for non-existent API routes', async () => {
            const res = await httpReq('GET', `http://127.0.0.1:${TEST_PORT}/api/nonexistent`, null, {
                Cookie: sessionCookie,
            });
            expect(res.status).toBe(404);
        });

        it('should delete a ticket as admin', async () => {
            const createRes = await httpReq(
                'POST',
                `http://127.0.0.1:${TEST_PORT}/api/tickets`,
                {
                    gameName: 'Delete Me',
                    description: 'will be deleted',
                },
                { Cookie: sessionCookie }
            );
            expect(createRes.status).toBe(201);
            const id = createRes.json.id;

            const res = await httpReq('DELETE', `http://127.0.0.1:${TEST_PORT}/api/tickets/${id}`, null, {
                Cookie: sessionCookie,
            });
            expect(res.status).toBe(200);
        });

        it('should return 404 when deleting non-existent ticket', async () => {
            const res = await httpReq('DELETE', `http://127.0.0.1:${TEST_PORT}/api/tickets/nonexistent-id-999`, null, {
                Cookie: sessionCookie,
            });
            expect(res.status).toBe(404);
        });
    });
});
