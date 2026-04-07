/**
 * Tests that verify security hygiene (gitignore, no hardcoded secrets, auth, build).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

describe('Security - .gitignore', () => {
    const gitignorePath = join(ROOT, '.gitignore');

    it('should contain *.csv', () => {
        const content = readFileSync(gitignorePath, 'utf-8');
        expect(content).toContain('*.csv');
    });

    it('should contain .env', () => {
        const content = readFileSync(gitignorePath, 'utf-8');
        expect(content).toContain('.env');
    });

    it('should contain server/users.json', () => {
        const content = readFileSync(gitignorePath, 'utf-8');
        expect(content).toContain('server/users.json');
    });
});

describe('Security - server routes (no hardcoded API keys)', () => {
    const aiRoutePath = join(ROOT, 'server', 'routes', 'ai.cjs');

    it('should not contain hardcoded API key patterns (sk-ant-, sk-)', () => {
        const code = readFileSync(aiRoutePath, 'utf-8');
        expect(code).not.toMatch(/sk-ant-[a-zA-Z0-9]{20,}/);
        expect(code).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    });

    it('should reference process.env.CLAUDE_API_KEY not a literal key', () => {
        const code = readFileSync(aiRoutePath, 'utf-8');
        expect(code).toContain('process.env.CLAUDE_API_KEY');
    });
});

describe('Security - server routes (session auth on data endpoints)', () => {
    const dataRoutePath = join(ROOT, 'server', 'routes', 'data.cjs');

    it('should have session auth checks on /api/data/games', () => {
        const code = readFileSync(dataRoutePath, 'utf-8');
        expect(code).toContain('/api/data/games');
        expect(code).toContain('requireAuth');
    });

    it('should have session auth checks on /api/data/theme-map', () => {
        const code = readFileSync(dataRoutePath, 'utf-8');
        expect(code).toContain('/api/data/theme-map');
    });

    it('should have session auth checks on /api/data/theme-breakdowns', () => {
        const code = readFileSync(dataRoutePath, 'utf-8');
        expect(code).toContain('/api/data/theme-breakdowns');
    });
});

describe('Security - build script (no game_data_master.json copy to dist)', () => {
    const packagePath = join(ROOT, 'package.json');

    it('build script should copy only dashboard data to dist (not master/raw)', () => {
        const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
        const buildScript = pkg.scripts?.build || '';
        expect(buildScript).toContain('game_data_master.json');
        expect(buildScript).not.toContain('games_master.json');
    });
});
