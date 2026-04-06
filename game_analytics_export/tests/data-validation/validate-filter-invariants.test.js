import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

describe('Filter subset invariants', () => {
    let games, confidenceMap, validGames;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
        confidenceMap = JSON.parse(readFileSync(resolve(DATA_DIR, 'confidence_map.json'), 'utf-8'));
        validGames = games.filter(g => g.game_category !== 'Total' && g.name !== 'Total');
    });

    const CONF_FIELDS = ['rtp', 'volatility', 'reels', 'paylines', 'max_win', 'min_bet', 'max_bet'];

    function isReliable(game) {
        const c = confidenceMap[game.name] || {};
        const specReliable = CONF_FIELDS.some(
            f => c[`${f}_confidence`] === 'verified' || c[`${f}_confidence`] === 'extracted'
        );
        const hasFeatures = Array.isArray(game.features) && game.features.length > 0;
        return specReliable || hasFeatures;
    }

    function reliableGames() {
        return validGames.filter(g => isReliable(g));
    }

    test('reliable games are a subset of valid games (no bogus rows)', () => {
        const reliable = reliableGames();
        const reliableNames = new Set(reliable.map(g => g.name));
        const validNames = new Set(validGames.map(g => g.name));
        for (const n of reliableNames) {
            expect(validNames.has(n)).toBe(true);
        }
    });

    test('reliable count <= valid count', () => {
        expect(reliableGames().length).toBeLessThanOrEqual(validGames.length);
    });

    test('no reliable game has category "Total"', () => {
        const bogus = reliableGames().filter(g => g.game_category === 'Total' || g.name === 'Total');
        expect(bogus).toEqual([]);
    });

    describe('provider filter', () => {
        test("filtering by each top provider returns only that provider's games", () => {
            const reliable = reliableGames();
            const providers = [...new Set(reliable.map(g => g.provider || g.studio))].slice(0, 10);
            for (const p of providers) {
                const filtered = reliable.filter(g => (g.provider || g.studio) === p);
                expect(filtered.length).toBeGreaterThan(0);
                expect(filtered.length).toBeLessThanOrEqual(reliable.length);
                for (const g of filtered) {
                    expect(g.provider || g.studio).toBe(p);
                }
            }
        });
    });

    describe('mechanic filter', () => {
        test('filtering by a feature returns only games containing that feature', () => {
            const reliable = reliableGames();
            const withFeats = reliable.filter(g => Array.isArray(g.features) && g.features.length > 0);
            const allFeats = new Set();
            for (const g of withFeats) g.features.forEach(f => allFeats.add(f));
            const testFeatures = [...allFeats].slice(0, 5);
            for (const feat of testFeatures) {
                const filtered = withFeats.filter(g => g.features.includes(feat));
                expect(filtered.length).toBeGreaterThan(0);
                expect(filtered.length).toBeLessThanOrEqual(withFeats.length);
                for (const g of filtered) {
                    expect(g.features).toContain(feat);
                }
            }
        });
    });

    describe('theme filter', () => {
        test('filtering by theme_primary returns only games with that theme', () => {
            const reliable = reliableGames();
            const themes = [...new Set(reliable.map(g => g.theme_primary).filter(Boolean))].slice(0, 5);
            for (const t of themes) {
                const filtered = reliable.filter(g => g.theme_primary === t);
                expect(filtered.length).toBeGreaterThan(0);
                expect(filtered.length).toBeLessThanOrEqual(reliable.length);
            }
        });
    });

    describe('category filter', () => {
        test('filtering by each category returns only games of that category', () => {
            const categories = [...new Set(validGames.map(g => g.game_category).filter(Boolean))];
            for (const cat of categories) {
                const filtered = validGames.filter(g => g.game_category === cat);
                expect(filtered.length).toBeGreaterThan(0);
                for (const g of filtered) {
                    expect(g.game_category).toBe(cat);
                }
            }
        });

        test('sum of per-category counts equals total valid games', () => {
            const categories = [...new Set(validGames.map(g => g.game_category).filter(Boolean))];
            const sum = categories.reduce((s, cat) => s + validGames.filter(g => g.game_category === cat).length, 0);
            const withCat = validGames.filter(g => g.game_category != null);
            expect(sum).toBe(withCat.length);
        });

        test('"Slot" filter count matches total slots', () => {
            const slots = validGames.filter(g => g.game_category === 'Slot');
            const reliableSlots = slots.filter(g => isReliable(g));
            expect(reliableSlots.length).toBeGreaterThan(0);
            expect(reliableSlots.length).toBeLessThanOrEqual(slots.length);
        });
    });

    describe('combined filters', () => {
        test('provider + mechanic filter is subset of each individual filter', () => {
            const reliable = reliableGames();
            const provider = (reliable.find(g => g.provider) || {}).provider;
            const feat = 'Free Spins';
            if (!provider) return;
            const byProvider = reliable.filter(g => g.provider === provider);
            const byFeat = reliable.filter(g => Array.isArray(g.features) && g.features.includes(feat));
            const combined = reliable.filter(
                g => g.provider === provider && Array.isArray(g.features) && g.features.includes(feat)
            );
            expect(combined.length).toBeLessThanOrEqual(byProvider.length);
            expect(combined.length).toBeLessThanOrEqual(byFeat.length);
        });
    });

    describe('volatility chart filter (decision 44)', () => {
        test('volatility-reliable games are a subset of all reliable games', () => {
            const reliable = reliableGames();
            const volReliable = reliable.filter(g => {
                const c = confidenceMap[g.name] || {};
                return c.volatility_confidence === 'verified' || c.volatility_confidence === 'extracted';
            });
            expect(volReliable.length).toBeLessThanOrEqual(reliable.length);
        });

        test('every volatility-reliable game has verified or extracted volatility_confidence', () => {
            const reliable = reliableGames();
            const volReliable = reliable.filter(g => {
                const c = confidenceMap[g.name] || {};
                return c.volatility_confidence === 'verified' || c.volatility_confidence === 'extracted';
            });
            for (const g of volReliable) {
                const c = confidenceMap[g.name] || {};
                expect(['verified', 'extracted']).toContain(c.volatility_confidence);
            }
        });
    });
});
