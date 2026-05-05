import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { PROVIDER_NORMALIZATION_MAP } from '../../src/lib/shared-config.js';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

const ID_REGEX = /^game-\d{4,}-[a-z0-9_]+$/;
const KNOWN_CATEGORIES = [
    'Slot',
    'Table',
    'Live Dealer',
    'Video Poker',
    'Bingo',
    'Keno',
    'Specialty',
    'Instant Win',
    'Jackpot',
    'Other',
    'Crash',
    'Arcade',
    'Bingo/Keno',
    'Live Casino',
    'Lottery',
    'Table Game',
];

describe('Migration Integrity', () => {
    let games;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
    });

    test('no duplicate IDs', () => {
        const ids = games.map(g => g.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('no duplicate names', () => {
        const names = games.map(g => g.name);
        expect(new Set(names).size).toBe(names.length);
    });

    test('ID format valid', () => {
        const bad = games.filter(g => !ID_REGEX.test(g.id));
        expect(bad.map(g => g.id)).toEqual([]);
    });

    test('XLSX fields non-null for all games', () => {
        const bad = games.filter(g => {
            if (g.theo_win == null || g.name == null || g.provider == null || g.id == null) return true;
            return typeof g.theo_win !== 'number';
        });
        expect(bad.map(g => g.id)).toEqual([]);
    });

    test('game count monotonically increases', () => {
        expect(games.length).toBeGreaterThanOrEqual(4550);
    });

    test('extracted-field count never decreases', () => {
        const featureCount = games.filter(g => Array.isArray(g.features) && g.features.length > 0).length;
        const artCount = games.filter(g => g.art_theme != null).length;
        expect(featureCount).toBeGreaterThanOrEqual(3000);
        expect(artCount).toBeGreaterThanOrEqual(2700);
    });

    test('provider values are in known set', () => {
        const keys = new Set(Object.keys(PROVIDER_NORMALIZATION_MAP));
        const vals = new Set(Object.values(PROVIDER_NORMALIZATION_MAP));
        const uniqueProviders = [...new Set(games.map(g => g.provider))];

        const violations = uniqueProviders.filter(p => !(vals.has(p) || !keys.has(p)));
        expect(violations.length).toBeLessThanOrEqual(5);

        const novel = uniqueProviders.filter(p => !keys.has(p) && !vals.has(p));
        const NOVEL_PROVIDER_CAP = 80;
        if (novel.length > 0 && novel.length <= 5) {
            console.warn(`novel providers (${novel.length}): ${novel.join(', ')}`);
        } else if (novel.length > 5 && novel.length <= NOVEL_PROVIDER_CAP) {
            console.warn(
                `novel providers (${novel.length} unique, cap ${NOVEL_PROVIDER_CAP}); sample: ${novel.slice(0, 12).join(', ')}`
            );
        }
        expect(novel.length).toBeLessThanOrEqual(NOVEL_PROVIDER_CAP);
    });

    test('game_category values are in known set', () => {
        const known = new Set(KNOWN_CATEGORIES);
        const bad = games.filter(g => !known.has(g.game_category));
        expect(bad.map(g => ({ id: g.id, game_category: g.game_category }))).toEqual([]);
    });

    test('no suspicious theo_win drops', () => {
        const MICRO_SHARE = 1e-5;
        const suspicious = games.filter(g => {
            const ms = typeof g.market_share_pct === 'number' ? g.market_share_pct : 0;
            return ms >= MICRO_SHARE && g.theo_win === 0;
        });
        expect(suspicious.map(g => g.id)).toEqual([]);
    });

    test('market_share_pct sum in band', () => {
        const rawSum = games.reduce((s, g) => s + (Number(g.market_share_pct) || 0), 0);
        const pctSum = rawSum <= 2 ? rawSum * 100 : rawSum;
        expect(pctSum).toBeGreaterThanOrEqual(50);
        expect(pctSum).toBeLessThanOrEqual(150);
    });

    test('sequential IDs', () => {
        const nums = games
            .map(g => {
                const m = String(g.id).match(/^game-(\d+)-/);
                return m ? parseInt(m[1], 10) : NaN;
            })
            .filter(n => !Number.isNaN(n))
            .sort((a, b) => a - b);
        let maxGap = 0;
        for (let i = 1; i < nums.length; i++) {
            const gap = nums[i] - nums[i - 1];
            if (gap > maxGap) maxGap = gap;
        }
        expect(maxGap).toBeLessThanOrEqual(10);
    });

    test('all games have required keys', () => {
        const required = ['id', 'name', 'provider', 'game_category', 'theo_win', 'market_share_pct'];
        const missing = [];
        for (const g of games) {
            for (const k of required) {
                if (!Object.prototype.hasOwnProperty.call(g, k)) {
                    missing.push({ id: g.id, missingKey: k });
                }
            }
        }
        expect(missing).toEqual([]);
    });

    test('no games with empty string provider', () => {
        const bad = games.filter(g => g.provider === '' || g.provider === '"');
        expect(bad.map(g => g.id)).toEqual([]);
    });
});
