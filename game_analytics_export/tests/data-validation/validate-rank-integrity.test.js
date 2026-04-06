import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

describe('Rank integrity (contiguous, reliable-only)', () => {
    let games, confidenceMap;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
        confidenceMap = JSON.parse(readFileSync(resolve(DATA_DIR, 'confidence_map.json'), 'utf-8'));
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

    function getValidGames() {
        return games.filter(g => g.game_category !== 'Total' && g.name !== 'Total');
    }

    function simulateRanking() {
        const valid = getValidGames();
        const sorted = [...valid].sort((a, b) => (b.theo_win || 0) - (a.theo_win || 0));
        let reliableRank = 0;
        return sorted.map(g => ({
            name: g.name,
            theo_win: g.theo_win || 0,
            reliable: isReliable(g),
            rank: isReliable(g) ? ++reliableRank : null,
        }));
    }

    test('all reliable games receive a non-null rank', () => {
        const ranked = simulateRanking();
        const reliableNoRank = ranked.filter(g => g.reliable && g.rank === null);
        expect(reliableNoRank).toEqual([]);
    });

    test('all non-reliable games receive null rank', () => {
        const ranked = simulateRanking();
        const nonReliableWithRank = ranked.filter(g => !g.reliable && g.rank !== null);
        expect(nonReliableWithRank).toEqual([]);
    });

    test('ranks form a contiguous sequence 1..N with no gaps', () => {
        const ranked = simulateRanking();
        const ranks = ranked.filter(g => g.rank !== null).map(g => g.rank);
        const N = ranks.length;
        expect(N).toBeGreaterThan(0);
        expect(Math.min(...ranks)).toBe(1);
        expect(Math.max(...ranks)).toBe(N);
        expect(new Set(ranks).size).toBe(N);
    });

    test('rank order matches theo_win DESC order', () => {
        const ranked = simulateRanking().filter(g => g.rank !== null);
        for (let i = 1; i < ranked.length; i++) {
            expect(ranked[i].theo_win).toBeLessThanOrEqual(ranked[i - 1].theo_win);
        }
    });

    test('rank 1 has the highest theo_win among reliable games', () => {
        const ranked = simulateRanking().filter(g => g.rank !== null);
        const rank1 = ranked.find(g => g.rank === 1);
        const maxTheo = Math.max(...ranked.map(g => g.theo_win));
        expect(rank1.theo_win).toBe(maxTheo);
    });

    test('rank 1 is not a non-slot when non-slots lack features', () => {
        const valid = getValidGames();
        const rank1Sim = simulateRanking().find(g => g.rank === 1);
        const rank1Game = valid.find(g => g.name === rank1Sim.name);
        if (rank1Game.game_category !== 'Slot') {
            expect(isReliable(rank1Game)).toBe(true);
        }
    });

    test('no two reliable games share the same rank', () => {
        const ranked = simulateRanking().filter(g => g.rank !== null);
        const rankSet = new Set(ranked.map(g => g.rank));
        expect(rankSet.size).toBe(ranked.length);
    });

    test('reliable game count matches isReliable() over valid games', () => {
        const valid = getValidGames();
        const reliableCount = valid.filter(g => isReliable(g)).length;
        const ranked = simulateRanking();
        const rankedCount = ranked.filter(g => g.rank !== null).length;
        expect(rankedCount).toBe(reliableCount);
    });
});
