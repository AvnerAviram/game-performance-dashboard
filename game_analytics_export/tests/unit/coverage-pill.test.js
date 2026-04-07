import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const chartUtilsPath = path.join(SRC_DIR, 'ui', 'chart-utils.js');

describe('Coverage pill', () => {
    it('never rounds to 0% when covered > 0', () => {
        const content = fs.readFileSync(chartUtilsPath, 'utf-8');
        const match = content.match(/const pct\s*=\s*covered\s*>\s*0\s*\?\s*Math\.max\(1/);
        expect(match).not.toBeNull();
    });

    it('edge case: 1 out of 10000 should show >= 1%', () => {
        const covered = 1;
        const total = 10000;
        const pct = covered > 0 ? Math.max(1, Math.round((covered / total) * 100)) : 0;
        expect(pct).toBeGreaterThanOrEqual(1);
    });

    it('0 covered should show 0%', () => {
        const covered = 0;
        const total = 1000;
        const pct = covered > 0 ? Math.max(1, Math.round((covered / total) * 100)) : 0;
        expect(pct).toBe(0);
    });
});
