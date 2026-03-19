/**
 * Tests for the Express auth server and user management CLI.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

const ROOT = resolve(__dirname, '../..');
const SERVER_DIR = join(ROOT, 'server');
const TEST_USERS_FILE = join(SERVER_DIR, 'users.test.json');

describe('Auth Server - server.cjs', () => {
    const serverPath = join(SERVER_DIR, 'server.cjs');

    it('server.cjs should exist', () => {
        expect(existsSync(serverPath)).toBe(true);
    });

    it('should use PORT from environment variable', () => {
        const code = readFileSync(serverPath, 'utf-8');
        expect(code).toContain('process.env.PORT');
    });

    it('should have login, logout, and session endpoints', () => {
        const authRoute = readFileSync(join(SERVER_DIR, 'routes', 'auth.cjs'), 'utf-8');
        expect(authRoute).toContain("'/api/login'");
        expect(authRoute).toContain("'/api/logout'");
        expect(authRoute).toContain("'/api/session'");
    });

    it('should use bcrypt for password verification', () => {
        const authRoute = readFileSync(join(SERVER_DIR, 'routes', 'auth.cjs'), 'utf-8');
        expect(authRoute).toContain('bcrypt.compare');
    });

    it('should use secure session cookies in production', () => {
        const code = readFileSync(serverPath, 'utf-8');
        expect(code).toContain('httpOnly: true');
        expect(code).toContain('secure:');
        expect(code).toContain("sameSite: 'lax'");
    });

    it('should serve static files from dist/', () => {
        const code = readFileSync(serverPath, 'utf-8');
        expect(code).toContain('express.static');
        expect(code).toContain('dist');
    });

    it('should redirect unauthenticated users to login', () => {
        const code = readFileSync(serverPath, 'utf-8');
        expect(code).toContain("redirect('/login.html')");
    });

    it('should allow public access to login page and assets', () => {
        const code = readFileSync(serverPath, 'utf-8');
        expect(code).toContain('/login.html');
        expect(code).toContain('/src/output.css');
        expect(code).toContain('/src/assets/');
    });

    it('should not hardcode a session secret in production mode', () => {
        const code = readFileSync(serverPath, 'utf-8');
        expect(code).toContain('process.env.SESSION_SECRET');
    });
});

describe('User Manager - manage-users.cjs', () => {
    const managerPath = join(SERVER_DIR, 'manage-users.cjs');

    it('manage-users.cjs should exist', () => {
        expect(existsSync(managerPath)).toBe(true);
    });

    it('should support add, remove, and list commands', () => {
        const code = readFileSync(managerPath, 'utf-8');
        expect(code).toContain("case 'add'");
        expect(code).toContain("case 'remove'");
        expect(code).toContain("case 'list'");
    });

    it('should use bcrypt with 12 rounds', () => {
        const code = readFileSync(managerPath, 'utf-8');
        expect(code).toContain('bcrypt.hash');
        expect(code).toMatch(/BCRYPT_ROUNDS\s*=\s*12/);
    });

    it('should enforce minimum password length', () => {
        const code = readFileSync(managerPath, 'utf-8');
        expect(code).toContain('password.length');
    });

    it('should require password confirmation', () => {
        const code = readFileSync(managerPath, 'utf-8');
        expect(code).toContain('Confirm password');
    });

    it('list command should work with no users file', () => {
        const output = execSync('node server/manage-users.cjs list', {
            cwd: ROOT,
            env: { ...process.env, NODE_ENV: 'test' },
        }).toString();
        expect(output).toMatch(/No users|Users \(/);
    });
});

describe('Auth Module - auth.js (client-side)', () => {
    const authPath = join(ROOT, 'src', 'lib', 'auth.js');

    it('should call /api/login for authentication', () => {
        const code = readFileSync(authPath, 'utf-8');
        expect(code).toContain("fetch('/api/login'");
    });

    it('should call /api/logout for sign-out', () => {
        const code = readFileSync(authPath, 'utf-8');
        expect(code).toContain("fetch('/api/logout'");
    });

    it('should have a verifySession function that calls /api/session', () => {
        const code = readFileSync(authPath, 'utf-8');
        expect(code).toContain('verifySession');
        expect(code).toContain("fetch('/api/session')");
    });

    it('should NOT accept any credentials (demo mode removed)', () => {
        const code = readFileSync(authPath, 'utf-8');
        expect(code).not.toContain('Demo');
        expect(code).not.toContain('accept any');
    });
});

describe('Web.config - IIS Configuration', () => {
    const configPath = join(ROOT, 'web.config');

    it('web.config should exist', () => {
        expect(existsSync(configPath)).toBe(true);
    });

    it('should use httpPlatformHandler module', () => {
        const xml = readFileSync(configPath, 'utf-8');
        expect(xml).toContain('httpPlatformHandler');
        expect(xml).toContain('httpPlatform');
    });

    it('should reference server.cjs as the entry point', () => {
        const xml = readFileSync(configPath, 'utf-8');
        expect(xml).toContain('server\\server.cjs');
    });

    it('should use %HTTP_PLATFORM_PORT% for dynamic port', () => {
        const xml = readFileSync(configPath, 'utf-8');
        expect(xml).toContain('%HTTP_PLATFORM_PORT%');
    });

    it('should set NODE_ENV to production', () => {
        const xml = readFileSync(configPath, 'utf-8');
        expect(xml).toContain('production');
    });

    it('should have security headers', () => {
        const xml = readFileSync(configPath, 'utf-8');
        expect(xml).toContain('X-Content-Type-Options');
        expect(xml).toContain('X-Frame-Options');
        expect(xml).toContain('Strict-Transport-Security');
    });

    it('should delegate CSP to Helmet (not duplicate in web.config)', () => {
        const xml = readFileSync(configPath, 'utf-8');
        expect(xml).toContain('CSP is managed by Helmet');
    });

    it('should block sensitive paths', () => {
        const xml = readFileSync(configPath, 'utf-8');
        expect(xml).toContain('.env');
        expect(xml).toContain('.git');
        expect(xml).toContain('node_modules');
    });

    it('should remove X-Powered-By header', () => {
        const xml = readFileSync(configPath, 'utf-8');
        expect(xml).toContain('remove name="X-Powered-By"');
    });

    it('should enable stdout logging', () => {
        const xml = readFileSync(configPath, 'utf-8');
        expect(xml).toContain('stdoutLogEnabled="true"');
    });
});

describe('Login Page', () => {
    it('login.html should not mention demo mode', () => {
        const html = readFileSync(join(ROOT, 'login.html'), 'utf-8');
        expect(html.toLowerCase()).not.toContain('demo');
        expect(html).not.toContain('any username and password');
    });

    it('login-page.js should POST to /api/login', () => {
        const code = readFileSync(join(ROOT, 'src', 'pages', 'login-page.js'), 'utf-8');
        expect(code).toContain('login(username, password');
    });
});

describe('Deploy Script - deploy.ps1', () => {
    const deployPath = join(ROOT, 'deploy', 'deploy.ps1');

    it('deploy.ps1 should exist', () => {
        expect(existsSync(deployPath)).toBe(true);
    });

    it('should check for .env leak in dist', () => {
        const script = readFileSync(deployPath, 'utf-8');
        expect(script).toContain('.env');
        expect(script).toContain('SECURITY ERROR');
    });

    it('should stop and start IIS app pool', () => {
        const script = readFileSync(deployPath, 'utf-8');
        expect(script).toContain('Stop-WebAppPool');
        expect(script).toContain('Start-WebAppPool');
    });

    it('should exclude users.json from deployment', () => {
        const script = readFileSync(deployPath, 'utf-8');
        expect(script).toContain('users.json');
    });
});

describe('Gitignore', () => {
    it('should exclude server/users.json', () => {
        const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf-8');
        expect(gitignore).toContain('server/users.json');
    });
});
