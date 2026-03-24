/**
 * Blueprint calculation integrity tests.
 *
 * Verifies that the performance-optimised code paths (pre-computed Sets,
 * cached feature lookups, single-pass aggregations) produce results
 * identical to the original naive implementations.
 */
import { describe, it, expect } from 'vitest';
import { parseFeatures } from '../../src/lib/parse-features.js';
import { CANONICAL_FEATURES } from '../../src/lib/features.js';

const FEATS = CANONICAL_FEATURES;

function makeGame(name, features, theoWin) {
    return {
        name,
        features: JSON.stringify(features),
        performance_theo_win: theoWin,
        specs_volatility: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)],
        specs_rtp: (90 + Math.random() * 6).toFixed(2),
    };
}

const GAMES = [
    makeGame('G1', ['Free Spins', 'Wild Reels', 'Cash On Reels'], 15.2),
    makeGame('G2', ['Free Spins', 'Hold and Spin'], 22.1),
    makeGame('G3', ['Cash On Reels', 'Hold and Spin', 'Megaways'], 18.7),
    makeGame('G4', ['Free Spins', 'Megaways', 'Wild Reels'], 25.3),
    makeGame('G5', ['Hold and Spin', 'Wild Reels'], 12.0),
    makeGame('G6', ['Free Spins', 'Cash On Reels', 'Wild Reels', 'Megaways'], 30.0),
    makeGame('G7', ['Free Spins'], 8.5),
    makeGame('G8', ['Hold and Spin', 'Megaways', 'Cash On Reels'], 19.9),
    makeGame('G9', ['Wild Reels', 'Free Spins', 'Hold and Spin'], 16.4),
    makeGame('G10', [], 5.0),
    makeGame('G11', ['Megaways'], 11.0),
    makeGame('G12', ['Cash On Reels', 'Free Spins', 'Hold and Spin', 'Wild Reels'], 28.0),
];

describe('Blueprint calculation integrity', () => {
    describe('Set.has() === Array.includes() for all feature values', () => {
        it('produces identical membership results', () => {
            GAMES.forEach(g => {
                const arr = parseFeatures(g.features);
                const set = new Set(arr);
                FEATS.forEach(f => {
                    expect(set.has(f)).toBe(arr.includes(f));
                });
            });
        });

        it('handles empty feature lists', () => {
            const arr = parseFeatures(null);
            const set = new Set(arr);
            expect(arr).toEqual([]);
            expect(set.size).toBe(0);
            FEATS.forEach(f => expect(set.has(f)).toBe(false));
        });

        it('handles JSON-encoded feature strings', () => {
            const raw = '["Free Spins","Wild Reels"]';
            const arr = parseFeatures(raw);
            const set = new Set(arr);
            expect(set.has('Free Spins')).toBe(true);
            expect(set.has('Wild Reels')).toBe(true);
            expect(set.has('Hold and Spin')).toBe(false);
            expect(arr.includes('Free Spins')).toBe(true);
        });
    });

    describe('Single-pass featGameMap matches per-feature filter', () => {
        it('produces identical counts and averages for every feature', () => {
            const themeGames = GAMES;
            const gameFeatSets = new Map();
            const gameTheos = new Map();
            themeGames.forEach(g => {
                gameFeatSets.set(g, new Set(parseFeatures(g.features)));
                gameTheos.set(g, g.performance_theo_win || 0);
            });

            // New: single-pass approach
            const featGameMap = {};
            FEATS.forEach(f => {
                featGameMap[f] = [];
            });
            themeGames.forEach(g => {
                const fs = gameFeatSets.get(g);
                const theo = gameTheos.get(g);
                FEATS.forEach(f => {
                    if (fs.has(f)) featGameMap[f].push(theo);
                });
            });

            // Old: per-feature filter approach
            FEATS.forEach(f => {
                const oldWithF = themeGames.filter(g => parseFeatures(g.features).includes(f));
                const oldTheos = oldWithF.map(g => g.performance_theo_win || 0);

                expect(featGameMap[f].length).toBe(oldTheos.length);

                const newSum = featGameMap[f].reduce((s, t) => s + t, 0);
                const oldSum = oldTheos.reduce((s, t) => s + t, 0);
                expect(newSum).toBeCloseTo(oldSum, 10);

                if (oldTheos.length >= 2) {
                    const newAvg = newSum / featGameMap[f].length;
                    const oldAvg = oldSum / oldTheos.length;
                    expect(newAvg).toBeCloseTo(oldAvg, 10);
                }
            });
        });
    });

    describe('computeBlueprintScore parity: Set vs Array, single-pass vs filter+reduce', () => {
        const themeGames = GAMES;
        const globalAvg = themeGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / themeGames.length;
        const themeAvg = globalAvg;

        function scoreLegacy(selectedFeatures) {
            let themeStrength = Math.min(
                100,
                Math.max(0, 50 + ((themeAvg - globalAvg) / Math.max(globalAvg, 0.01)) * 200)
            );

            const selFeatsArr = [...selectedFeatures];
            let featQuality = 50;
            if (selFeatsArr.length > 0) {
                const matchGames = themeGames.filter(g => {
                    const gf = parseFeatures(g.features);
                    return selFeatsArr.some(f => gf.includes(f));
                });
                let perfScore = 50;
                if (matchGames.length >= 2) {
                    const matchAvg =
                        matchGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / matchGames.length;
                    perfScore = Math.min(
                        100,
                        Math.max(0, 50 + ((matchAvg - globalAvg) / Math.max(globalAvg, 0.01)) * 200)
                    );
                }
                featQuality = Math.round(perfScore * 0.6 + 50 * 0.4);
            }

            let synergyScore = 50;
            if (selFeatsArr.length >= 2) {
                let totalSyn = 0,
                    pairs = 0;
                for (let i = 0; i < selFeatsArr.length; i++) {
                    for (let j = i + 1; j < selFeatsArr.length; j++) {
                        const bothGames = themeGames.filter(g => {
                            const gf = parseFeatures(g.features);
                            return gf.includes(selFeatsArr[i]) && gf.includes(selFeatsArr[j]);
                        });
                        if (bothGames.length >= 2) {
                            const pairAvg =
                                bothGames.reduce((s, g) => s + (g.performance_theo_win || 0), 0) / bothGames.length;
                            totalSyn += ((pairAvg - themeAvg) / Math.max(themeAvg, 0.01)) * 100;
                            pairs++;
                        }
                    }
                }
                if (pairs > 0) synergyScore = Math.min(100, Math.max(0, 50 + (totalSyn / pairs) * 3));
            }

            let marketOpp = 50;
            if (selFeatsArr.length > 0) {
                const exactMatches = themeGames.filter(g => {
                    const gf = parseFeatures(g.features);
                    return selFeatsArr.every(f => gf.includes(f));
                }).length;
                if (exactMatches === 0) marketOpp = 95;
                else if (exactMatches <= 2) marketOpp = 80;
                else if (exactMatches <= 5) marketOpp = 65;
                else if (exactMatches <= 10) marketOpp = 45;
                else marketOpp = 25;
            }
            return Math.round(themeStrength * 0.25 + featQuality * 0.3 + synergyScore * 0.2 + marketOpp * 0.25);
        }

        function scoreOptimised(selectedFeatures) {
            const gameFeatSets = new Map();
            const gameTheos = new Map();
            themeGames.forEach(g => {
                gameFeatSets.set(g, new Set(parseFeatures(g.features)));
                gameTheos.set(g, g.performance_theo_win || 0);
            });
            let themeStrength = Math.min(
                100,
                Math.max(0, 50 + ((themeAvg - globalAvg) / Math.max(globalAvg, 0.01)) * 200)
            );

            const selFeatsArr = [...selectedFeatures];
            let featQuality = 50;
            if (selFeatsArr.length > 0) {
                let matchSum = 0,
                    matchCount = 0;
                themeGames.forEach(g => {
                    const fs = gameFeatSets.get(g);
                    if (selFeatsArr.some(f => fs.has(f))) {
                        matchSum += gameTheos.get(g);
                        matchCount++;
                    }
                });
                let perfScore = 50;
                if (matchCount >= 2) {
                    perfScore = Math.min(
                        100,
                        Math.max(0, 50 + ((matchSum / matchCount - globalAvg) / Math.max(globalAvg, 0.01)) * 200)
                    );
                }
                featQuality = Math.round(perfScore * 0.6 + 50 * 0.4);
            }

            let synergyScore = 50;
            if (selFeatsArr.length >= 2) {
                let totalSyn = 0,
                    pairs = 0;
                for (let i = 0; i < selFeatsArr.length; i++) {
                    for (let j = i + 1; j < selFeatsArr.length; j++) {
                        let pairSum = 0,
                            pairCount = 0;
                        themeGames.forEach(g => {
                            const fs = gameFeatSets.get(g);
                            if (fs.has(selFeatsArr[i]) && fs.has(selFeatsArr[j])) {
                                pairSum += gameTheos.get(g);
                                pairCount++;
                            }
                        });
                        if (pairCount >= 2) {
                            totalSyn += ((pairSum / pairCount - themeAvg) / Math.max(themeAvg, 0.01)) * 100;
                            pairs++;
                        }
                    }
                }
                if (pairs > 0) synergyScore = Math.min(100, Math.max(0, 50 + (totalSyn / pairs) * 3));
            }

            let marketOpp = 50;
            if (selFeatsArr.length > 0) {
                let exactMatches = 0;
                themeGames.forEach(g => {
                    const fs = gameFeatSets.get(g);
                    if (selFeatsArr.every(f => fs.has(f))) exactMatches++;
                });
                if (exactMatches === 0) marketOpp = 95;
                else if (exactMatches <= 2) marketOpp = 80;
                else if (exactMatches <= 5) marketOpp = 65;
                else if (exactMatches <= 10) marketOpp = 45;
                else marketOpp = 25;
            }
            return Math.round(themeStrength * 0.25 + featQuality * 0.3 + synergyScore * 0.2 + marketOpp * 0.25);
        }

        it('identical score with no features selected', () => {
            const sel = new Set();
            expect(scoreOptimised(sel)).toBe(scoreLegacy(sel));
        });

        it('identical score with 1 feature', () => {
            const sel = new Set(['Free Spins']);
            expect(scoreOptimised(sel)).toBe(scoreLegacy(sel));
        });

        it('identical score with 2 features (synergy activated)', () => {
            const sel = new Set(['Free Spins', 'Wild Reels']);
            expect(scoreOptimised(sel)).toBe(scoreLegacy(sel));
        });

        it('identical score with 3 features', () => {
            const sel = new Set(['Free Spins', 'Wild Reels', 'Hold and Spin']);
            expect(scoreOptimised(sel)).toBe(scoreLegacy(sel));
        });

        it('identical score with 4 features (includes blue-ocean case)', () => {
            const sel = new Set(['Cash On Reels', 'Hold and Spin', 'Megaways', 'Wild Reels']);
            expect(scoreOptimised(sel)).toBe(scoreLegacy(sel));
        });

        it('identical score with rare feature combo (0 exact matches)', () => {
            const sel = new Set(['Megaways', 'Wild Reels', 'Hold and Spin']);
            expect(scoreOptimised(sel)).toBe(scoreLegacy(sel));
        });
    });

    describe('Cache safety: .slice().sort() does not mutate the cached array', () => {
        it('does not corrupt cached feature arrays', () => {
            const cache = new WeakMap();
            function gameFeats(g) {
                let cached = cache.get(g);
                if (!cached) {
                    cached = parseFeatures(g.features);
                    cache.set(g, cached);
                }
                return cached;
            }

            const g = GAMES[0]; // ['Free Spins', 'Wild Reels', 'Cash On Reels']
            const before = [...gameFeats(g)];

            // Simulate the recipe section — must use .slice().sort()
            const sorted = gameFeats(g).slice().sort();

            const after = gameFeats(g);
            expect(after).toEqual(before);
            expect(sorted).not.toEqual(before); // sorted order differs
        });
    });

    describe('Filter predicates: _gfs curried helper parity', () => {
        it('curried Set.has equals inline Array.includes for filtering', () => {
            const gameFeatSets = new Map();
            GAMES.forEach(g => gameFeatSets.set(g, new Set(parseFeatures(g.features))));

            FEATS.forEach(f => {
                const oldResult = GAMES.filter(g => parseFeatures(g.features).includes(f));
                const newResult = GAMES.filter(g => {
                    const s = gameFeatSets.get(g);
                    return s ? s.has(f) : parseFeatures(g.features).includes(f);
                });
                expect(newResult.length).toBe(oldResult.length);
                expect(newResult.map(g => g.name)).toEqual(oldResult.map(g => g.name));
            });
        });
    });

    describe('Competition tab: Jaccard and exact-match counts', () => {
        it('identical jaccard overlap with Set vs Array', () => {
            const selectedFeatures = new Set(['Free Spins', 'Wild Reels']);
            const selArr = [...selectedFeatures];

            GAMES.forEach(g => {
                const gfArr = parseFeatures(g.features);
                const gfSet = new Set(gfArr);

                const overlapOld = selArr.filter(f => gfArr.includes(f)).length;
                const overlapNew = selArr.filter(f => gfSet.has(f)).length;
                expect(overlapNew).toBe(overlapOld);

                const totalOld = new Set([...selectedFeatures, ...gfArr.filter(f => FEATS.includes(f))]).size;
                const totalNew = new Set([...selectedFeatures, ...gfArr.filter(f => FEATS.includes(f))]).size;
                expect(totalNew).toBe(totalOld);
            });
        });

        it('identical exact-match count with every()', () => {
            const selectedFeatures = new Set(['Free Spins', 'Wild Reels']);
            const selArr = [...selectedFeatures];

            const oldCount = GAMES.filter(g => {
                const gf = parseFeatures(g.features);
                return selArr.every(f => gf.includes(f));
            }).length;

            const newCount = GAMES.filter(g => {
                const fs = new Set(parseFeatures(g.features));
                return selArr.every(f => fs.has(f));
            }).length;

            expect(newCount).toBe(oldCount);
        });
    });
});
