import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    analyzeGameSuccessFactors,
    predictFromSimilarGames,
    getDatasetStats,
    generateRecommendations,
} from '../../src/lib/game-analytics-engine.js';
import { gameData } from '../utils/load-test-data.js';

describe('Game Analytics Engine', () => {
    let origAllGames, origThemes, origMechanics;

    beforeEach(() => {
        origAllGames = gameData.allGames;
        origThemes = gameData.themes;
        origMechanics = gameData.mechanics;
    });

    afterEach(() => {
        gameData.allGames = origAllGames;
        gameData.themes = origThemes;
        gameData.mechanics = origMechanics;
    });

    describe('analyzeGameSuccessFactors', () => {
        it('returns an array of insights', () => {
            const result = analyzeGameSuccessFactors('TestGame', 5.0, 2.0, []);
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
        });

        it('returns fallback message when no insights generated', () => {
            gameData.allGames = [];
            gameData.themes = [];
            const result = analyzeGameSuccessFactors('NoGame', 1, 0.5, []);
            expect(result).toContain('High performance detected - analyzing patterns...');
        });

        it('generates theme performance insights for high outperformance', () => {
            gameData.themes = [{ Theme: 'Asian', 'Smart Index': 1.0, 'Market Share %': 5 }];
            const result = analyzeGameSuccessFactors('TestGame', 5.0, 2.0, ['Asian']);
            const hasThemeInsight = result.some(r => r.includes('Outperforms') || r.includes('Performs'));
            expect(hasThemeInsight).toBe(true);
        });

        it('generates market position insights for high z-score', () => {
            gameData.themes = [{ Theme: 'Asian', 'Smart Index': 5, 'Market Share %': 8 }];
            const result = analyzeGameSuccessFactors('TestGame', 20, 6.0, ['Asian']);
            const hasZScoreInsight = result.some(r => r.includes('Top 1%'));
            expect(hasZScoreInsight).toBe(true);
        });

        it('generates provider insights when game and provider exist', () => {
            gameData.allGames = [
                { name: 'TestGame', provider: 'ProviderA', performance: { theo_win: 5 } },
                { name: 'Other1', provider: 'ProviderA', performance: { theo_win: 3 } },
                { name: 'Other2', provider: 'ProviderA', performance: { theo_win: 4 } },
                { name: 'Other3', provider: 'ProviderA', performance: { theo_win: 2 } },
            ];
            const result = analyzeGameSuccessFactors('TestGame', 5.0, 2.0, []);
            const hasProviderInsight = result.some(r => r.includes('ProviderA'));
            expect(hasProviderInsight).toBe(true);
        });

        it('generates synergy insight for multi-theme with high theo', () => {
            gameData.themes = [
                { Theme: 'Asian', 'Smart Index': 5, 'Market Share %': 3 },
                { Theme: 'Dragon', 'Smart Index': 4, 'Market Share %': 2 },
            ];
            const result = analyzeGameSuccessFactors('TestGame', 20, 2, ['Asian', 'Dragon']);
            const hasSynergyInsight = result.some(r => r.includes('synergy') || r.includes('Asian + Dragon'));
            expect(hasSynergyInsight).toBe(true);
        });

        it('generates statistical significance for extreme z-score', () => {
            gameData.themes = [{ Theme: 'Test', 'Smart Index': 5, 'Market Share %': 3 }];
            const result = analyzeGameSuccessFactors('TestGame', 50, 12, ['Test']);
            const hasStatInsight = result.some(r => r.includes('Extreme outlier') || r.includes('1 in 100,000'));
            expect(hasStatInsight).toBe(true);
        });

        it('skips provider analysis for excluded providers', () => {
            gameData.allGames = [{ name: 'TestGame', provider: 'Multiple' }];
            const result = analyzeGameSuccessFactors('TestGame', 5, 2, []);
            const hasProviderInsight = result.some(r => r.includes('Multiple'));
            expect(hasProviderInsight).toBe(false);
        });
    });

    describe('predictFromSimilarGames', () => {
        it('returns null when no games exist', () => {
            gameData.allGames = [];
            expect(predictFromSimilarGames('Asian', ['Free Spins'])).toBeNull();
        });

        it('returns null when allGames is undefined', () => {
            gameData.allGames = undefined;
            expect(predictFromSimilarGames('Asian', [])).toBeNull();
        });

        it('matches games by features array', () => {
            gameData.allGames = [
                {
                    name: 'G1',
                    theme_consolidated: 'Asian',
                    features: '["Free Spins","Hold and Spin"]',
                    performance_theo_win: 4,
                },
                {
                    name: 'G2',
                    theme_consolidated: 'Asian',
                    features: '["Free Spins","Wild Reels"]',
                    performance_theo_win: 6,
                },
                {
                    name: 'G3',
                    theme_consolidated: 'Western',
                    features: '["Free Spins"]',
                    performance_theo_win: 3,
                },
            ];
            const result = predictFromSimilarGames('Asian', ['Free Spins']);
            expect(result).not.toBeNull();
            expect(result.similarCount).toBe(2);
            expect(result.predictedTheo).toBe(5);
            expect(result.fallback).toBeNull();
        });

        it('maps UI mechanic names to canonical features (Hold & Win -> Hold and Spin)', () => {
            gameData.allGames = [
                {
                    name: 'G1',
                    theme_consolidated: 'Asian',
                    features: '["Hold and Spin","Cash On Reels"]',
                    performance_theo_win: 5,
                },
                {
                    name: 'G2',
                    theme_consolidated: 'Asian',
                    features: '["Free Spins"]',
                    performance_theo_win: 3,
                },
            ];
            const result = predictFromSimilarGames('Asian', ['Hold & Win']);
            expect(result).not.toBeNull();
            expect(result.similarCount).toBe(1);
            expect(result.predictedTheo).toBe(5);
        });

        it('maps Cash Collection to Cash On Reels', () => {
            gameData.allGames = [
                { name: 'G1', theme_consolidated: 'Asian', features: '["Cash On Reels"]', performance_theo_win: 7 },
            ];
            const result = predictFromSimilarGames('Asian', ['Cash Collection']);
            expect(result).not.toBeNull();
            expect(result.similarCount).toBe(1);
        });

        it('falls back to theme-only when no feature match', () => {
            gameData.allGames = [
                { name: 'G1', theme_consolidated: 'Asian', features: '["Wild Reels"]', performance_theo_win: 4 },
            ];
            const result = predictFromSimilarGames('Asian', ['Nudges']);
            expect(result).not.toBeNull();
            expect(result.fallback).toBe('theme-only');
        });

        it('returns all theme games when no mechanics selected', () => {
            gameData.allGames = [
                { name: 'G1', theme_consolidated: 'Asian', features: '["Free Spins"]', performance_theo_win: 4 },
                { name: 'G2', theme_consolidated: 'Asian', features: '["Hold and Spin"]', performance_theo_win: 6 },
            ];
            const result = predictFromSimilarGames('Asian', []);
            expect(result).not.toBeNull();
            expect(result.similarCount).toBe(2);
            expect(result.predictedTheo).toBe(5);
        });

        it('returns null when no theme match at all', () => {
            gameData.allGames = [
                { name: 'G1', theme_consolidated: 'Western', features: '["Free Spins"]', performance_theo_win: 4 },
            ];
            expect(predictFromSimilarGames('Asian', ['Free Spins'])).toBeNull();
        });

        it('includes percentile in result', () => {
            gameData.allGames = [
                { name: 'G1', theme_consolidated: 'Asian', features: '["Free Spins"]', performance_theo_win: 2 },
                { name: 'G2', theme_consolidated: 'Asian', features: '["Free Spins"]', performance_theo_win: 8 },
                { name: 'G3', theme_consolidated: 'Western', features: '["Hold and Spin"]', performance_theo_win: 1 },
            ];
            const result = predictFromSimilarGames('Asian', ['Free Spins']);
            expect(result.percentile).toBeGreaterThanOrEqual(0);
            expect(result.percentile).toBeLessThanOrEqual(100);
        });

        it('matches theme variants (prefix match)', () => {
            gameData.allGames = [
                {
                    name: 'G1',
                    theme_consolidated: 'Asian - Dragons',
                    features: '["Free Spins"]',
                    performance_theo_win: 5,
                },
            ];
            const result = predictFromSimilarGames('Asian', ['Free Spins']);
            expect(result).not.toBeNull();
            expect(result.similarCount).toBe(1);
        });

        it('ignores games with zero theo win', () => {
            gameData.allGames = [
                { name: 'G1', theme_consolidated: 'Asian', features: '["Free Spins"]', performance_theo_win: 0 },
                { name: 'G2', theme_consolidated: 'Asian', features: '["Free Spins"]', performance_theo_win: 4 },
            ];
            const result = predictFromSimilarGames('Asian', ['Free Spins']);
            expect(result.predictedTheo).toBe(4);
        });

        it('limits similar games returned to 5', () => {
            gameData.allGames = Array.from({ length: 10 }, (_, i) => ({
                name: `G${i}`,
                theme_consolidated: 'Asian',
                features: '["Free Spins"]',
                performance_theo_win: i + 1,
            }));
            const result = predictFromSimilarGames('Asian', ['Free Spins']);
            expect(result.similarGames.length).toBe(5);
            expect(result.similarCount).toBe(10);
        });

        it('handles multiple selected mechanics with partial feature overlap', () => {
            gameData.allGames = [
                {
                    name: 'G1',
                    theme_consolidated: 'Egyptian',
                    features: '["Free Spins","Hold and Spin"]',
                    performance_theo_win: 8,
                },
                { name: 'G2', theme_consolidated: 'Egyptian', features: '["Free Spins"]', performance_theo_win: 4 },
                { name: 'G3', theme_consolidated: 'Egyptian', features: '["Nudges"]', performance_theo_win: 2 },
            ];
            const result = predictFromSimilarGames('Egyptian', ['Free Spins', 'Hold & Win']);
            expect(result).not.toBeNull();
            expect(result.similarCount).toBe(2);
        });

        it('does not match games without features in features array', () => {
            gameData.allGames = [{ name: 'G1', theme_consolidated: 'Asian', features: [], performance_theo_win: 5 }];
            const result = predictFromSimilarGames('Asian', ['Slot']);
            expect(result.fallback).toBe('theme-only');
        });
    });

    describe('getDatasetStats', () => {
        it('returns null when themes are empty', () => {
            gameData.themes = [];
            gameData.mechanics = [{ 'Smart Index': 5 }];
            expect(getDatasetStats()).toBeNull();
        });

        it('returns null when mechanics are empty', () => {
            gameData.themes = [{ 'Smart Index': 5 }];
            gameData.mechanics = [];
            expect(getDatasetStats()).toBeNull();
        });

        it('returns stats object with correct keys', () => {
            gameData.themes = [
                { 'Smart Index': 100, 'Game Count': 50, 'Avg Theo Win Index': 1.5 },
                { 'Smart Index': 200, 'Game Count': 100, 'Avg Theo Win Index': 2.0 },
            ];
            gameData.mechanics = [{ 'Smart Index': 50 }, { 'Smart Index': 80 }];
            const stats = getDatasetStats();
            expect(stats).toHaveProperty('maxThemeSI', 200);
            expect(stats).toHaveProperty('maxMechSI', 80);
            expect(stats).toHaveProperty('maxThemeCount', 100);
            expect(stats).toHaveProperty('maxThemeTheo', 2.0);
        });

        it('uses defaults when Smart Index values are all zero', () => {
            gameData.themes = [{ 'Smart Index': 0, 'Game Count': 0, 'Avg Theo Win Index': 0 }];
            gameData.mechanics = [{ 'Smart Index': 0 }];
            const stats = getDatasetStats();
            expect(stats.maxThemeSI).toBe(250);
            expect(stats.maxMechSI).toBe(90);
        });
    });

    describe('generateRecommendations', () => {
        it('returns array of recommendations', () => {
            const result = generateRecommendations([], ['Asian'], 3);
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThanOrEqual(2);
        });

        it('includes benchmark recommendation for high z-score', () => {
            const result = generateRecommendations([], ['Asian'], 8);
            expect(result.some(r => r.includes('Benchmark'))).toBe(true);
        });

        it('includes study recommendation for normal z-score', () => {
            const result = generateRecommendations([], ['Asian'], 3);
            expect(result.some(r => r.includes('Study'))).toBe(true);
        });

        it('recommends theme combinations for multi-theme', () => {
            const result = generateRecommendations([], ['Asian', 'Dragon'], 5);
            expect(result.some(r => r.includes('Asian/Dragon'))).toBe(true);
        });

        it('recommends theme variations for single theme', () => {
            const result = generateRecommendations([], ['Asian'], 5);
            expect(result.some(r => r.includes('Asian theme'))).toBe(true);
        });

        it('recommends high priority for very high z-score', () => {
            const result = generateRecommendations([], ['Asian'], 6);
            expect(result.some(r => r.includes('exceptional market fit') || r.includes('prioritize'))).toBe(true);
        });
    });
});
