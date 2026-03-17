import { describe, it, expect, beforeAll } from 'vitest';
import { getFilteredThemes, getFilteredMechanics } from '../../src/lib/filters.js';
import { loadGameData } from '../../src/lib/data.js';

describe('Smart Filters - Functional Tests', () => {
    beforeAll(async () => {
        // Load real data
        await loadGameData();
        
        // Make gameData globally available (filters expect window.gameData)
        global.window = { gameData: (await import('../../src/lib/data.js')).gameData };
    });

    describe('Theme Filters', () => {
        it('should return all themes for "all" view', () => {
            const result = getFilteredThemes('all');
            expect(result.length).toBeGreaterThan(0);
            expect(result.length).toBe(window.gameData.themes.length);
        });

        it('should filter Market Leaders (top 20% by game count)', () => {
            const result = getFilteredThemes('leaders');
            const allThemes = getFilteredThemes('all');
            
            expect(result.length).toBeGreaterThan(0);
            
            // Should be approximately top 20% (allow tolerance for ties at threshold)
            const expectedRatio = result.length / allThemes.length;
            expect(expectedRatio).toBeLessThanOrEqual(0.40); // At most 40% (ties can inflate)
            expect(expectedRatio).toBeGreaterThanOrEqual(0.15); // At least 15%
            
            // All results should have high game counts
            const sortedAll = [...allThemes].sort((a, b) => b['Game Count'] - a['Game Count']);
            const threshold = sortedAll[Math.floor(sortedAll.length * 0.20)]?.['Game Count'] || 30;
            
            result.forEach(theme => {
                expect(theme['Game Count']).toBeGreaterThanOrEqual(threshold);
            });
            
            console.log(`✅ Market Leaders: ${result.length} themes (top 20%, ${threshold}+ games each)`);
        });

        it('should filter Opportunities (5+ games, above-average quality, <5% market)', () => {
            const result = getFilteredThemes('opportunities');
            const allThemes = getFilteredThemes('all');
            
            // Calculate average performance
            const avgPerformance = allThemes.reduce((sum, t) => sum + (t['Avg Theo Win Index'] || 0), 0) / allThemes.length;
            
            // Verify ALL returned themes meet criteria
            result.forEach(theme => {
                expect(theme['Game Count']).toBeGreaterThanOrEqual(5);
                expect(theme['Avg Theo Win Index']).toBeGreaterThanOrEqual(avgPerformance);
                expect(theme['Market Share %']).toBeLessThan(5);
            });
            
            console.log(`✅ Opportunities: ${result.length} themes (5+ games, >avg quality ${avgPerformance.toFixed(2)}, <5% market)`);
        });

        it('should filter Premium Quality (top 25% by performance)', () => {
            const result = getFilteredThemes('premium');
            const allThemes = getFilteredThemes('all');
            
            expect(result.length).toBeGreaterThan(0);
            
            // Should be approximately top 25%
            const expectedRatio = result.length / allThemes.length;
            expect(expectedRatio).toBeLessThanOrEqual(0.30); // At most 30%
            expect(expectedRatio).toBeGreaterThanOrEqual(0.20); // At least 20%
            
            // Calculate threshold using Smart Index (matches filter logic)
            const sortedByPerf = [...allThemes].sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
            const threshold = sortedByPerf[Math.floor(sortedByPerf.length * 0.25)]?.['Smart Index'] || 2.5;
            
            // Verify ALL returned themes meet threshold
            result.forEach(theme => {
                expect(theme['Smart Index'] || 0).toBeGreaterThanOrEqual(threshold);
            });
            
            console.log(`✅ Premium Quality: ${result.length} themes (top 25%, ≥${threshold.toFixed(2)} performance)`);
        });

        it('should eliminate small samples in Market Leaders', () => {
            const all = getFilteredThemes('all');
            const leaders = getFilteredThemes('leaders');
            
            // Calculate actual threshold (top 20%)
            const sortedAll = [...all].sort((a, b) => b['Game Count'] - a['Game Count']);
            const threshold = sortedAll[Math.floor(sortedAll.length * 0.20)]?.['Game Count'] || 30;
            
            const smallSamples = all.filter(t => t['Game Count'] < threshold);
            expect(smallSamples.length).toBeGreaterThan(0); // Verify there ARE small samples
            
            const leadersWithSmallSample = leaders.filter(t => t['Game Count'] < threshold);
            expect(leadersWithSmallSample.length).toBe(0); // Verify they're ALL filtered out
            
            console.log(`✅ Eliminated ${smallSamples.length} small-sample themes (threshold: ${threshold} games)`);
        });
    });

    describe('Mechanic Filters', () => {
        it('should return all mechanics for "all" view', () => {
            const result = getFilteredMechanics('all');
            expect(result.length).toBeGreaterThan(0);
            expect(result.length).toBe(window.gameData.mechanics.length);
        });

        it('should filter Most Popular (top 20% by adoption)', () => {
            const result = getFilteredMechanics('popular');
            const allMechanics = getFilteredMechanics('all');
            
            expect(result.length).toBeGreaterThan(0);
            
            // With only 5 mechanics, discrete rounding means ratios can be higher
            const expectedRatio = result.length / allMechanics.length;
            expect(expectedRatio).toBeLessThanOrEqual(0.5);
            expect(expectedRatio).toBeGreaterThanOrEqual(0.1);
            
            // Calculate threshold
            const sortedAll = [...allMechanics].sort((a, b) => b['Game Count'] - a['Game Count']);
            const threshold = sortedAll[Math.floor(sortedAll.length * 0.20)]?.['Game Count'] || 20;
            
            // Verify ALL returned mechanics meet threshold
            result.forEach(mech => {
                expect(mech['Game Count']).toBeGreaterThanOrEqual(threshold);
            });
            
            console.log(`✅ Most Popular: ${result.length} mechanics (top 20%, ${threshold}+ games each)`);
        });

        it('should filter High Performing (top 30% by quality)', () => {
            const result = getFilteredMechanics('highPerforming');
            const allMechanics = getFilteredMechanics('all');
            
            expect(result.length).toBeGreaterThan(0);
            
            // With only 5 mechanics, discrete rounding means ratios can be higher
            const expectedRatio = result.length / allMechanics.length;
            expect(expectedRatio).toBeLessThanOrEqual(0.5);
            expect(expectedRatio).toBeGreaterThanOrEqual(0.1);
            
            // Calculate threshold using Smart Index (matches filter logic)
            const sortedByPerf = [...allMechanics].sort((a, b) => (b['Smart Index'] || 0) - (a['Smart Index'] || 0));
            const threshold = sortedByPerf[Math.floor(sortedByPerf.length * 0.30)]?.['Smart Index'] || 1.5;
            
            // Verify ALL returned mechanics meet threshold
            result.forEach(mech => {
                expect(mech['Smart Index'] || 0).toBeGreaterThanOrEqual(threshold);
            });
            
            console.log(`✅ High Performing: ${result.length} mechanics (top 30%, ≥${threshold.toFixed(2)} performance)`);
        });
    });

    describe('Filter Effectiveness', () => {
        it('should reduce list size meaningfully', () => {
            const allThemes = getFilteredThemes('all');
            const leaders = getFilteredThemes('leaders');
            const opportunities = getFilteredThemes('opportunities');
            const premium = getFilteredThemes('premium');
            
            // Each filter should reduce the list
            expect(leaders.length).toBeLessThan(allThemes.length);
            expect(opportunities.length).toBeLessThan(allThemes.length);
            expect(premium.length).toBeLessThan(allThemes.length);
            
            console.log(`📊 Filter Results:`);
            console.log(`   All: ${allThemes.length} themes`);
            console.log(`   🏆 Leaders: ${leaders.length} themes (${((leaders.length/allThemes.length)*100).toFixed(1)}%)`);
            console.log(`   💎 Opportunities: ${opportunities.length} themes (${((opportunities.length/allThemes.length)*100).toFixed(1)}%)`);
            console.log(`   ⭐ Premium: ${premium.length} themes (${((premium.length/allThemes.length)*100).toFixed(1)}%)`);
        });
    });
});
