import { describe, test, expect, beforeAll } from 'vitest';
import { loadTestData, gameData } from '../utils/load-test-data.js';
import { getProviderMetrics } from '../../src/lib/metrics.js';
import { F } from '../../src/lib/game-fields.js';

describe('Cross-page metric agreement', () => {
    beforeAll(async () => {
        await loadTestData();
    });

    describe('provider counts match across views', () => {
        test('metrics provider game_count matches filtering allGames by that provider', () => {
            const providerMetrics = getProviderMetrics(gameData.allGames);
            for (const pm of providerMetrics.slice(0, 10)) {
                const fromFilter = gameData.allGames.filter(g => F.provider(g) === pm.name).length;
                expect(pm.count).toBe(fromFilter);
            }
        });
    });

    describe('theme counts match across views', () => {
        test('themes page game_count matches filtering allGames by theme_primary', () => {
            for (const t of gameData.themes.slice(0, 10)) {
                const themeName = t.theme || t.Theme;
                const fromFilter = gameData.allGames.filter(g => g.theme_primary === themeName).length;
                const fromThemes = t.game_count || t['Game Count'];
                expect(fromThemes).toBe(fromFilter);
            }
        });
    });

    describe('mechanic counts match across views', () => {
        test('mechanics page game_count matches filtering allGames by feature', () => {
            for (const m of gameData.mechanics.slice(0, 10)) {
                const mechName = m.mechanic || m.Mechanic;
                const fromFilter = gameData.allGames.filter(
                    g => Array.isArray(g.features) && g.features.includes(mechName)
                ).length;
                const fromMechanics = m.game_count || m['Game Count'];
                expect(fromMechanics).toBe(fromFilter);
            }
        });
    });

    describe('top game agreement', () => {
        test('highest theo_win game in allGames matches top anomaly (if populated)', () => {
            const sorted = [...gameData.allGames]
                .filter(g => g.theo_win != null)
                .sort((a, b) => (b.theo_win || 0) - (a.theo_win || 0));
            if (sorted.length > 0 && gameData.top_anomalies.length > 0) {
                const topGame = sorted[0];
                const topAnomaly = gameData.top_anomalies[0];
                expect(topGame.theo_win).toBeGreaterThanOrEqual(topAnomaly['Theo Win'] || topAnomaly.theo_win_index);
            }
        });
    });

    describe('Smart Index structural invariants', () => {
        test('themes are sorted by Smart Index descending', () => {
            for (let i = 1; i < gameData.themes.length; i++) {
                expect(gameData.themes[i]['Smart Index']).toBeLessThanOrEqual(gameData.themes[i - 1]['Smart Index']);
            }
        });

        test('mechanics are sorted by Smart Index descending', () => {
            for (let i = 1; i < gameData.mechanics.length; i++) {
                expect(gameData.mechanics[i]['Smart Index']).toBeLessThanOrEqual(
                    gameData.mechanics[i - 1]['Smart Index']
                );
            }
        });

        test('every Smart Index is a positive finite number', () => {
            for (const t of gameData.themes) {
                expect(t['Smart Index']).toBeGreaterThan(0);
                expect(Number.isFinite(t['Smart Index'])).toBe(true);
            }
            for (const m of gameData.mechanics) {
                expect(m['Smart Index']).toBeGreaterThan(0);
                expect(Number.isFinite(m['Smart Index'])).toBe(true);
            }
        });
    });
});
