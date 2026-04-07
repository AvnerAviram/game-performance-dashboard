/**
 * Integration tests for the server data API.
 * Spawns the real server, verifies auth, content-type, and Cache-Control.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import http from 'http';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SERVER_DIR = join(ROOT, 'server');
const USERS_FILE = join(SERVER_DIR, 'users.json');
const TEST_PORT = 3847;

let serverProcess = null;
let originalUsersContent = null;

function httpGet(url, cookie = null) {
    const parsed = new URL(url);
    const opts = { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: 'GET', headers: {} };
    if (cookie) opts.headers['Cookie'] = cookie;
    return new Promise((resolve, reject) => {
        http.get(opts, res => {
            let body = '';
            res.on('data', c => {
                body += c;
            });
            res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
        }).on('error', reject);
    });
}

function httpPost(url, data, headers = {}) {
    const parsed = new URL(url);
    const payload = JSON.stringify(data);
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: parsed.hostname,
                port: parsed.port,
                path: parsed.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                    'Content-Length': Buffer.byteLength(payload),
                },
            },
            res => {
                let body = '';
                res.on('data', c => {
                    body += c;
                });
                res.on('end', () =>
                    resolve({ status: res.statusCode, body, headers: res.headers, rawHeaders: res.rawHeaders })
                );
            }
        );
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function waitForServer(url, maxAttempts = 20) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const res = await httpGet(url);
            if (res.status === 401 || res.status === 200) return true;
        } catch {
            // Server not ready yet
        }
        await new Promise(r => setTimeout(r, 250));
    }
    return false;
}

describe('API Data Endpoints - Integration', () => {
    beforeAll(async () => {
        originalUsersContent = existsSync(USERS_FILE) ? readFileSync(USERS_FILE, 'utf-8') : null;

        const testUser = {
            username: '__apitest__',
            passwordHash: bcrypt.hashSync('testpass123', 12),
            role: 'user',
        };
        writeFileSync(USERS_FILE, JSON.stringify([testUser], null, 2));

        const nodePath = process.execPath;
        serverProcess = spawn(nodePath, ['server/server.cjs'], {
            cwd: ROOT,
            env: { ...process.env, PORT: String(TEST_PORT), NODE_ENV: 'test' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stderr = '';
        serverProcess.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const baseUrl = `http://127.0.0.1:${TEST_PORT}`;
        const ready = await waitForServer(`${baseUrl}/api/session`, 40);
        if (!ready) {
            throw new Error(`Server did not start. stderr: ${stderr}`);
        }
    }, 30000);

    afterAll(async () => {
        if (serverProcess) {
            serverProcess.kill('SIGTERM');
            serverProcess = null;
        }
        if (originalUsersContent !== null) {
            writeFileSync(USERS_FILE, originalUsersContent);
        } else if (existsSync(USERS_FILE)) {
            unlinkSync(USERS_FILE);
        }
    });

    it('should return 401 for /api/data/games without session', async () => {
        const res = await httpGet(`http://127.0.0.1:${TEST_PORT}/api/data/games`);
        expect(res.status).toBe(401);
    });

    it('should return 401 for /api/data/theme-map without session', async () => {
        const res = await httpGet(`http://127.0.0.1:${TEST_PORT}/api/data/theme-map`);
        expect(res.status).toBe(401);
    });

    it('should return 401 for /api/data/theme-breakdowns without session', async () => {
        const res = await httpGet(`http://127.0.0.1:${TEST_PORT}/api/data/theme-breakdowns`);
        expect(res.status).toBe(401);
    });

    it('should return JSON content-type on 401 responses', async () => {
        const res = await httpGet(`http://127.0.0.1:${TEST_PORT}/api/data/games`);
        const ct = res.headers['content-type'] || '';
        expect(ct).toContain('application/json');
    });

    it('should return Cache-Control: public with max-age on successful data response', async () => {
        const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

        const loginRes = await httpPost(`${baseUrl}/api/login`, {
            username: '__apitest__',
            password: 'testpass123',
        });
        expect(loginRes.status).toBe(200);

        const cookies = loginRes.headers['set-cookie'];
        if (!cookies) {
            throw new Error('No session cookie received from login');
        }
        const cookie = (Array.isArray(cookies) ? cookies[0] : cookies).split(';')[0];

        const dataRes = await httpGet(`http://127.0.0.1:${TEST_PORT}/api/data/games`, cookie);
        expect(dataRes.status).toBe(200);

        const cacheControl = (dataRes.headers['cache-control'] || '').toLowerCase();
        expect(cacheControl).toContain('public');
        expect(cacheControl).toContain('max-age=300');
        expect(cacheControl).toContain('stale-while-revalidate=86400');
    });

    it('should return JSON content-type on successful data response', async () => {
        const baseUrl = `http://127.0.0.1:${TEST_PORT}`;

        const loginRes = await httpPost(`${baseUrl}/api/login`, {
            username: '__apitest__',
            password: 'testpass123',
        });
        expect(loginRes.status).toBe(200);

        const cookies = loginRes.headers['set-cookie'];
        if (!cookies) {
            throw new Error('No session cookie received from login');
        }
        const cookie = (Array.isArray(cookies) ? cookies[0] : cookies).split(';')[0];

        const dataRes = await httpGet(`http://127.0.0.1:${TEST_PORT}/api/data/games`, cookie);
        expect(dataRes.status).toBe(200);

        const ct = dataRes.headers['content-type'] || '';
        expect(ct).toContain('application/json');
    });
});
