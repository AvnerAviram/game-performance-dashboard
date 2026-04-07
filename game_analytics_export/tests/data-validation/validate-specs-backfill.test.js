import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

describe('AGS specs backfill validation', () => {
    let games;
    let gt;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
        gt = JSON.parse(readFileSync(resolve(DATA_DIR, 'ground_truth_ags.json'), 'utf-8'));
    });

    test('all GT games with rtp have rtp in master', () => {
        const norm = n =>
            n
                .toLowerCase()
                .replace(/[^a-z0-9 ]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        const masterByNorm = {};
        for (const g of games) masterByNorm[norm(g.name)] = g;

        const missing = [];
        for (const [name, entry] of Object.entries(gt)) {
            if (!entry.rtp) continue;
            const g = masterByNorm[norm(name)] || masterByNorm[norm(entry.ags_name || '')];
            if (!g) continue;
            if (!g.rtp) missing.push(name);
        }
        expect(missing).toEqual([]);
    });

    test('all GT games with volatility have volatility in master', () => {
        const norm = n =>
            n
                .toLowerCase()
                .replace(/[^a-z0-9 ]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        const masterByNorm = {};
        for (const g of games) masterByNorm[norm(g.name)] = g;

        const missing = [];
        for (const [name, entry] of Object.entries(gt)) {
            if (!entry.volatility) continue;
            const g = masterByNorm[norm(name)] || masterByNorm[norm(entry.ags_name || '')];
            if (!g) continue;
            if (!g.volatility) missing.push(name);
        }
        expect(missing).toEqual([]);
    });

    test('Capital Gains theme is Money, not Gold', () => {
        const cg = games.find(g => g.name === 'Capital Gains');
        expect(cg).toBeDefined();
        expect(cg.theme_primary).toBe('Money');
    });

    test('GT-verified games have theme_primary matching themes_all[0]', () => {
        const norm = n =>
            n
                .toLowerCase()
                .replace(/[^a-z0-9 ]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        const masterByNorm = {};
        for (const g of games) masterByNorm[norm(g.name)] = g;

        const mismatches = [];
        for (const [name, entry] of Object.entries(gt)) {
            const themes = entry.themes || [];
            if (!themes.length) continue;
            const g = masterByNorm[norm(name)] || masterByNorm[norm(entry.ags_name || '')];
            if (!g) continue;
            if (g.theme_primary !== themes[0]) {
                mismatches.push(`${name}: master=${g.theme_primary}, gt=${themes[0]}`);
            }
        }
        expect(mismatches).toEqual([]);
    });
});
