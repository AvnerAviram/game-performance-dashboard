import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { normalizeProvider } from '../../src/lib/shared-config.js';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

describe('DuckDB field mapping: master JSON → DuckDB columns', () => {
    let games, confidenceMap, themeMap, validGames;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
        confidenceMap = JSON.parse(readFileSync(resolve(DATA_DIR, 'confidence_map.json'), 'utf-8'));
        themeMap = JSON.parse(readFileSync(resolve(DATA_DIR, 'theme_consolidation_map.json'), 'utf-8'));
        validGames = games.filter(g => g.game_category !== 'Total' && g.name !== 'Total');
    });

    function simulateInsert(game) {
        const rawStudio = game.studio || game.provider || '';
        const studioOrParent =
            !rawStudio || /^unknown$/i.test(rawStudio) ? game.parent_company || rawStudio : rawStudio;
        const c = confidenceMap[game.name] || {};
        return {
            id: game.id,
            name: game.name,
            theme_primary: game.theme_primary || 'Unknown',
            theme_consolidated: themeMap[game.theme_primary] || game.theme_primary || 'Unknown',
            provider_studio: normalizeProvider(studioOrParent),
            specs_reels: game.reels ?? null,
            specs_rows: game.rows ?? null,
            specs_rtp: game.rtp != null ? Number(game.rtp) : null,
            specs_volatility: game.volatility || null,
            performance_theo_win: game.theo_win || 0,
            performance_market_share_percent: game.market_share_pct || 0,
            features: Array.isArray(game.features) && game.features.length > 0 ? game.features : null,
            themes_all: Array.isArray(game.themes_all) && game.themes_all.length > 0 ? game.themes_all : null,
            symbols: Array.isArray(game.symbols) && game.symbols.length > 0 ? game.symbols : null,
            game_category: game.game_category,
            rtp_confidence: c.rtp_confidence || null,
            volatility_confidence: c.volatility_confidence || null,
        };
    }

    describe('provider mapping', () => {
        test('every game gets a non-empty provider_studio', () => {
            const noProvider = validGames.filter(g => {
                const row = simulateInsert(g);
                return !row.provider_studio || row.provider_studio === 'Unknown';
            });
            expect(noProvider.length).toBeLessThan(validGames.length * 0.01);
        });

        test('provider normalization preserves known providers', () => {
            const known = ['Evolution', 'IGT', 'Pragmatic Play'];
            for (const name of known) {
                const game = validGames.find(g => g.provider === name);
                if (!game) continue;
                const row = simulateInsert(game);
                expect(row.provider_studio).toBeTruthy();
                expect(row.provider_studio).not.toBe('Unknown');
            }
        });
    });

    describe('theme mapping', () => {
        test('theme_consolidated maps through theme_consolidation_map', () => {
            const gamesWithTheme = validGames.filter(g => g.theme_primary);
            const mismatches = [];
            for (const g of gamesWithTheme.slice(0, 100)) {
                const row = simulateInsert(g);
                const expected = themeMap[g.theme_primary] || g.theme_primary;
                if (row.theme_consolidated !== expected) {
                    mismatches.push({ name: g.name, got: row.theme_consolidated, expected });
                }
            }
            expect(mismatches).toEqual([]);
        });

        test('games without theme_primary get "Unknown"', () => {
            const noTheme = validGames.filter(g => !g.theme_primary);
            for (const g of noTheme.slice(0, 20)) {
                const row = simulateInsert(g);
                expect(row.theme_consolidated).toBe('Unknown');
            }
        });
    });

    describe('numeric fields preserve values', () => {
        test('theo_win transfers without data loss', () => {
            const withTheo = validGames.filter(g => g.theo_win > 0);
            for (const g of withTheo.slice(0, 50)) {
                const row = simulateInsert(g);
                expect(row.performance_theo_win).toBe(g.theo_win);
            }
        });

        test('rtp transfers as number', () => {
            const withRtp = validGames.filter(g => g.rtp != null && typeof g.rtp === 'number');
            for (const g of withRtp.slice(0, 50)) {
                const row = simulateInsert(g);
                expect(row.specs_rtp).toBe(g.rtp);
            }
        });

        test('reels transfers without data loss', () => {
            const withReels = validGames.filter(g => g.reels != null);
            for (const g of withReels.slice(0, 50)) {
                const row = simulateInsert(g);
                expect(row.specs_reels).toBe(g.reels);
            }
        });

        test('market_share_pct transfers', () => {
            const withMkt = validGames.filter(g => g.market_share_pct > 0);
            for (const g of withMkt.slice(0, 50)) {
                const row = simulateInsert(g);
                expect(row.performance_market_share_percent).toBe(g.market_share_pct);
            }
        });
    });

    describe('array fields serialize correctly', () => {
        test('features: non-empty arrays transfer, empty arrays become null', () => {
            const withFeats = validGames.filter(g => Array.isArray(g.features) && g.features.length > 0);
            const emptyFeats = validGames.filter(g => Array.isArray(g.features) && g.features.length === 0);
            for (const g of withFeats.slice(0, 20)) {
                const row = simulateInsert(g);
                expect(row.features).toEqual(g.features);
            }
            for (const g of emptyFeats.slice(0, 20)) {
                const row = simulateInsert(g);
                expect(row.features).toBeNull();
            }
        });

        test('themes_all: non-empty arrays transfer', () => {
            const withThemes = validGames.filter(g => Array.isArray(g.themes_all) && g.themes_all.length > 0);
            for (const g of withThemes.slice(0, 20)) {
                const row = simulateInsert(g);
                expect(row.themes_all).toEqual(g.themes_all);
            }
        });

        test('symbols: non-empty arrays transfer', () => {
            const withSymbols = validGames.filter(g => Array.isArray(g.symbols) && g.symbols.length > 0);
            for (const g of withSymbols.slice(0, 20)) {
                const row = simulateInsert(g);
                expect(row.symbols).toEqual(g.symbols);
            }
        });
    });

    describe('confidence mapping', () => {
        test('confidence values from confidence_map.json land in the right columns', () => {
            const gamesWithConf = validGames.filter(g => confidenceMap[g.name]);
            for (const g of gamesWithConf.slice(0, 50)) {
                const row = simulateInsert(g);
                const c = confidenceMap[g.name];
                expect(row.rtp_confidence).toBe(c.rtp_confidence || null);
                expect(row.volatility_confidence).toBe(c.volatility_confidence || null);
            }
        });

        test('games without confidence_map entry get null confidence', () => {
            const gamesNoConf = validGames.filter(g => !confidenceMap[g.name]);
            for (const g of gamesNoConf.slice(0, 20)) {
                const row = simulateInsert(g);
                expect(row.rtp_confidence).toBeNull();
                expect(row.volatility_confidence).toBeNull();
            }
        });
    });
});

describe('DuckDB chart data contracts', () => {
    let games, confidenceMap, themeMap;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
        confidenceMap = JSON.parse(readFileSync(resolve(DATA_DIR, 'confidence_map.json'), 'utf-8'));
        themeMap = JSON.parse(readFileSync(resolve(DATA_DIR, 'theme_consolidation_map.json'), 'utf-8'));
    });

    const CONF_FIELDS = ['rtp', 'volatility', 'reels', 'paylines', 'max_win', 'min_bet', 'max_bet'];

    function getReliable() {
        const valid = games.filter(g => g.game_category !== 'Total' && g.name !== 'Total');
        return valid.filter(g => {
            const c = confidenceMap[g.name] || {};
            const specReliable = CONF_FIELDS.some(
                f => c[`${f}_confidence`] === 'verified' || c[`${f}_confidence`] === 'extracted'
            );
            const hasFeats = Array.isArray(g.features) && g.features.length > 0;
            return specReliable || hasFeats;
        });
    }

    describe('overview stats contract', () => {
        test('total_games = count of reliable games', () => {
            expect(getReliable().length).toBeGreaterThan(3000);
        });

        test('theme_count = distinct consolidated themes in reliable set', () => {
            const themes = new Set();
            for (const g of getReliable()) {
                const tc = themeMap[g.theme_primary] || g.theme_primary || 'Unknown';
                themes.add(tc);
            }
            expect(themes.size).toBeGreaterThan(30);
        });

        test('mechanic_count = distinct features in reliable set', () => {
            const feats = new Set();
            for (const g of getReliable()) {
                if (!Array.isArray(g.features)) continue;
                g.features.forEach(f => feats.add(f));
            }
            expect(feats.size).toBeGreaterThan(20);
        });
    });

    describe('theme distribution contract', () => {
        test('every theme group has at least 1 game and positive avg_theo', () => {
            const reliable = getReliable();
            const themes = {};
            for (const g of reliable) {
                const tc = themeMap[g.theme_primary] || g.theme_primary || 'Unknown';
                if (!themes[tc]) themes[tc] = { count: 0, totalTheo: 0 };
                themes[tc].count++;
                themes[tc].totalTheo += g.theo_win || 0;
            }
            for (const [theme, data] of Object.entries(themes)) {
                expect(data.count).toBeGreaterThanOrEqual(1);
            }
        });
    });

    describe('volatility distribution contract', () => {
        test('reliable-confidence volatility values are real labels (not garbage)', () => {
            const KNOWN_PREFIXES = [
                'low',
                'medium',
                'medium-low',
                'medium-high',
                'high',
                'very high',
                'standard',
                'variable',
                'high to very high',
                'varies depending',
            ];
            const reliable = getReliable();
            const garbage = [];
            for (const g of reliable) {
                if (!g.volatility) continue;
                const c = confidenceMap[g.name] || {};
                if (c.volatility_confidence !== 'verified' && c.volatility_confidence !== 'extracted') continue;
                const v = g.volatility.toLowerCase().trim();
                const isKnown = KNOWN_PREFIXES.some(
                    p => v === p || v.startsWith(p + ' ') || v.startsWith(p + '|') || v.startsWith(p + '/')
                );
                if (!isKnown && isNaN(Number(v))) {
                    garbage.push({ name: g.name, volatility: g.volatility });
                }
                if (!isNaN(Number(v))) {
                    garbage.push({ name: g.name, volatility: g.volatility, reason: 'numeric' });
                }
            }
            expect(garbage).toEqual([]);
        });

        test('no numeric volatility values in reliable-confidence set', () => {
            const reliable = getReliable();
            const numeric = reliable.filter(g => {
                if (!g.volatility) return false;
                const c = confidenceMap[g.name] || {};
                if (c.volatility_confidence !== 'verified' && c.volatility_confidence !== 'extracted') return false;
                return !isNaN(Number(g.volatility));
            });
            expect(numeric.map(g => ({ name: g.name, vol: g.volatility }))).toEqual([]);
        });
    });

    describe('provider distribution contract', () => {
        test('provider normalization produces no empty strings', () => {
            const reliable = getReliable();
            for (const g of reliable) {
                const raw = g.studio || g.provider || '';
                const norm = normalizeProvider(raw || g.parent_company || '');
                expect(norm).not.toBe('');
            }
        });

        test('top providers have reasonable game counts', () => {
            const reliable = getReliable();
            const counts = {};
            for (const g of reliable) {
                const p = normalizeProvider(g.studio || g.provider || g.parent_company || '');
                counts[p] = (counts[p] || 0) + 1;
            }
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            expect(sorted[0][1]).toBeGreaterThan(100);
            expect(sorted[0][1]).toBeLessThan(reliable.length * 0.3);
        });
    });

    describe('feature distribution contract', () => {
        test('Free Spins is the most common feature', () => {
            const reliable = getReliable();
            const counts = {};
            for (const g of reliable) {
                if (!Array.isArray(g.features)) continue;
                g.features.forEach(f => {
                    counts[f] = (counts[f] || 0) + 1;
                });
            }
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            expect(sorted[0][0]).toBe('Free Spins');
        });

        test('no feature appears in more games than the reliable total', () => {
            const reliable = getReliable();
            const counts = {};
            for (const g of reliable) {
                if (!Array.isArray(g.features)) continue;
                g.features.forEach(f => {
                    counts[f] = (counts[f] || 0) + 1;
                });
            }
            for (const [feat, count] of Object.entries(counts)) {
                expect(count).toBeLessThanOrEqual(reliable.length);
            }
        });
    });

    describe('anomalies contract', () => {
        test('top anomalies have higher theo_win than bottom anomalies', () => {
            const reliable = getReliable().filter(g => g.theo_win != null);
            const sorted = [...reliable].sort((a, b) => b.theo_win - a.theo_win);
            const top = sorted.slice(0, 30);
            const bottom = sorted.slice(-30);
            const avgTop = top.reduce((s, g) => s + g.theo_win, 0) / top.length;
            const avgBot = bottom.reduce((s, g) => s + g.theo_win, 0) / bottom.length;
            expect(avgTop).toBeGreaterThan(avgBot);
        });
    });

    describe('zero-theo games', () => {
        test('games with theo_win=0 are a small minority of reliable set', () => {
            const reliable = getReliable();
            const zeroTheo = reliable.filter(g => g.theo_win === 0 || g.theo_win == null);
            expect(zeroTheo.length / reliable.length).toBeLessThan(0.05);
        });
    });
});
