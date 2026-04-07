/**
 * Tests for chart UX transparency features:
 * - Coverage pill injection (injectCoveragePill)
 * - Confidence summary bar logic
 * - Category filter / viewGames integration
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { injectCoveragePill } from '../../src/ui/chart-utils.js';
import { isReliableConfidence, F } from '../../src/lib/game-fields.js';
import { gameData, loadGameData } from '../../src/lib/data.js';

describe('Coverage Pill (injectCoveragePill)', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    function setupCard(canvasId) {
        document.body.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-xl">
                <div class="px-5 pt-5 pb-3 border-b">
                    <h3 class="text-sm font-bold">Chart Title</h3>
                    <p class="text-xs text-gray-500">Subtitle text</p>
                </div>
                <div class="p-4">
                    <canvas id="${canvasId}"></canvas>
                </div>
            </div>
        `;
    }

    it('injects a pill with "X% of games" label', () => {
        setupCard('test-chart');
        injectCoveragePill('test-chart', 200, 300, 'with RTP data');

        const pill = document.querySelector('[data-coverage-pill="test-chart"]');
        expect(pill).not.toBeNull();
        const label = pill.querySelector('span:first-child').textContent;
        expect(label).toContain('67% of games');
    });

    it('shows detail text with counts and exclusion note on hover', () => {
        setupCard('test-chart');
        injectCoveragePill('test-chart', 2044, 3105, 'with RTP data');

        const pill = document.querySelector('[data-coverage-pill="test-chart"]');
        const tooltip = pill.querySelector('.hidden');
        expect(tooltip.textContent).toContain('2,044');
        expect(tooltip.textContent).toContain('3,105');
        expect(tooltip.textContent).toContain('with RTP data');
        expect(tooltip.textContent).toContain('excluded');
    });

    it('skips injection when coverage is 100%', () => {
        setupCard('test-chart');
        injectCoveragePill('test-chart', 3000, 3000, '');

        const pill = document.querySelector('[data-coverage-pill="test-chart"]');
        expect(pill).toBeNull();
    });

    it('is idempotent — does not duplicate pills', () => {
        setupCard('test-chart');
        injectCoveragePill('test-chart', 200, 300, 'with RTP data');
        injectCoveragePill('test-chart', 200, 300, 'with RTP data');
        injectCoveragePill('test-chart', 200, 300, 'with RTP data');

        const pills = document.querySelectorAll('[data-coverage-pill="test-chart"]');
        expect(pills.length).toBe(1);
    });

    it('handles zero total gracefully (no pill)', () => {
        setupCard('test-chart');
        injectCoveragePill('test-chart', 0, 0, 'with data');

        const pill = document.querySelector('[data-coverage-pill="test-chart"]');
        expect(pill).toBeNull();
    });

    it('inserts pill into subtitle <p> element', () => {
        document.body.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-xl">
                <div class="px-5 pt-5 pb-3 border-b">
                    <div class="flex items-center gap-1.5">
                        <h3 class="text-sm font-bold">RTP Landscape</h3>
                        <div class="relative group">
                            <button class="cursor-help">?</button>
                        </div>
                    </div>
                    <p class="text-xs text-gray-500">Performance vs Game Count</p>
                </div>
                <div class="p-4">
                    <canvas id="chart-rtp"></canvas>
                </div>
            </div>
        `;
        injectCoveragePill('chart-rtp', 200, 300, 'with RTP data');

        const pill = document.querySelector('[data-coverage-pill="chart-rtp"]');
        expect(pill).not.toBeNull();

        const subtitle = document.querySelector('.pb-3 p');
        expect(subtitle.contains(pill)).toBe(true);
    });

    it('does nothing if canvas not found', () => {
        setupCard('test-chart');
        injectCoveragePill('nonexistent-canvas', 100, 200, 'test');

        const pills = document.querySelectorAll('[data-coverage-pill]');
        expect(pills.length).toBe(0);
    });

    it('does nothing if no card wrapper found', () => {
        document.body.innerHTML = '<canvas id="orphan-canvas"></canvas>';
        injectCoveragePill('orphan-canvas', 100, 200, 'test');

        const pills = document.querySelectorAll('[data-coverage-pill]');
        expect(pills.length).toBe(0);
    });
});

describe('Confidence summary logic', () => {
    it('isReliableConfidence returns true for verified and extracted', () => {
        expect(isReliableConfidence('verified')).toBe(true);
        expect(isReliableConfidence('extracted')).toBe(true);
    });

    it('isReliableConfidence returns false for estimated and null', () => {
        expect(isReliableConfidence('estimated')).toBe(false);
        expect(isReliableConfidence(null)).toBe(false);
        expect(isReliableConfidence(undefined)).toBe(false);
    });

    it('confidence accessors return null for games without confidence data', () => {
        const game = { name: 'Test Game' };
        expect(F.rtpConfidence(game)).toBeNull();
        expect(F.volatilityConfidence(game)).toBeNull();
        expect(F.reelsConfidence(game)).toBeNull();
    });

    it('confidence accessors return the confidence value when present', () => {
        const game = { rtp_confidence: 'verified', volatility_confidence: 'extracted' };
        expect(F.rtpConfidence(game)).toBe('verified');
        expect(F.volatilityConfidence(game)).toBe('extracted');
    });

    it('all 7 confidence fields are accessible via F accessors', () => {
        const accessors = [
            'rtpConfidence',
            'volatilityConfidence',
            'reelsConfidence',
            'paylinesConfidence',
            'maxWinConfidence',
            'minBetConfidence',
            'maxBetConfidence',
        ];
        accessors.forEach(key => {
            expect(typeof F[key]).toBe('function');
        });
    });
});

describe('viewGames / category filter integration', () => {
    beforeAll(async () => {
        await loadGameData();
    });

    it('gameData has viewGames and activeCategory properties', () => {
        expect('viewGames' in gameData).toBe(true);
        expect('activeCategory' in gameData).toBe(true);
    });

    it('viewGames defaults to null', () => {
        expect(gameData.viewGames).toBeNull();
    });

    it('activeCategory defaults to null', () => {
        expect(gameData.activeCategory).toBeNull();
    });

    it('gameData.allGames is available and populated', () => {
        expect(Array.isArray(gameData.allGames)).toBe(true);
        expect(gameData.allGames.length).toBeGreaterThan(0);
    });

    it('F.gameCategory returns a valid category or defaults to Slot', () => {
        const game = {};
        expect(F.gameCategory(game)).toBe('Slot');

        const tableGame = { game_category: 'Table Game' };
        expect(F.gameCategory(tableGame)).toBe('Table Game');
    });

    it('filtering allGames by category produces a strict subset', () => {
        const allGames = gameData.allGames;
        const slots = allGames.filter(g => F.gameCategory(g) === 'Slot');
        expect(slots.length).toBeLessThanOrEqual(allGames.length);
        expect(slots.length).toBeGreaterThan(0);
        slots.forEach(g => {
            expect(allGames).toContain(g);
        });
    });

    it('all games have a valid category', () => {
        const allGames = gameData.allGames;
        allGames.forEach(g => {
            const cat = F.gameCategory(g);
            expect(typeof cat).toBe('string');
            expect(cat.length).toBeGreaterThan(0);
        });
    });

    it('category filter produces consistent counts', () => {
        const allGames = gameData.allGames;
        const categories = [...new Set(allGames.map(g => F.gameCategory(g)))];
        const totalFromCategories = categories.reduce(
            (sum, cat) => sum + allGames.filter(g => F.gameCategory(g) === cat).length,
            0
        );
        expect(totalFromCategories).toBe(allGames.length);
    });
});
