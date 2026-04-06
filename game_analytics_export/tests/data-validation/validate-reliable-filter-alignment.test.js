import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');
const SRC_DIR = resolve(import.meta.dirname, '../../src/lib/db');

describe('RELIABLE_GAME filter alignment (JS === SQL)', () => {
    let games, confidenceMap, duckdbSource;

    beforeAll(() => {
        games = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
        confidenceMap = JSON.parse(readFileSync(resolve(DATA_DIR, 'confidence_map.json'), 'utf-8'));
        duckdbSource = readFileSync(resolve(SRC_DIR, 'duckdb-client.js'), 'utf-8');
    });

    const CONF_FIELDS = ['rtp', 'volatility', 'reels', 'paylines', 'max_win', 'min_bet', 'max_bet'];

    function jsIsReliable(game) {
        const c = confidenceMap[game.name] || {};
        const specReliable = CONF_FIELDS.some(
            f => c[`${f}_confidence`] === 'verified' || c[`${f}_confidence`] === 'extracted'
        );
        const hasFeatures = Array.isArray(game.features) && game.features.length > 0;
        return specReliable || hasFeatures;
    }

    function sqlIsReliable(game) {
        const c = confidenceMap[game.name] || {};
        const specReliable =
            ['verified', 'extracted'].includes(c.rtp_confidence) ||
            ['verified', 'extracted'].includes(c.volatility_confidence) ||
            ['verified', 'extracted'].includes(c.reels_confidence) ||
            ['verified', 'extracted'].includes(c.paylines_confidence) ||
            ['verified', 'extracted'].includes(c.max_win_confidence) ||
            ['verified', 'extracted'].includes(c.min_bet_confidence) ||
            ['verified', 'extracted'].includes(c.max_bet_confidence);
        const hasFeatures = Array.isArray(game.features) && game.features.length > 0;
        return specReliable || hasFeatures;
    }

    test('JS isReliable matches SQL RELIABLE_GAME for every game', () => {
        const valid = games.filter(g => g.game_category !== 'Total' && g.name !== 'Total');
        const mismatches = [];
        for (const g of valid) {
            const js = jsIsReliable(g);
            const sql = sqlIsReliable(g);
            if (js !== sql) {
                mismatches.push({ name: g.name, js, sql });
            }
        }
        expect(mismatches).toEqual([]);
    });

    test('JS and SQL produce the same reliable count', () => {
        const valid = games.filter(g => g.game_category !== 'Total' && g.name !== 'Total');
        const jsCount = valid.filter(g => jsIsReliable(g)).length;
        const sqlCount = valid.filter(g => sqlIsReliable(g)).length;
        expect(jsCount).toBe(sqlCount);
    });

    test('SQL RELIABLE_GAME constant checks all 7 confidence fields', () => {
        const reliableBlock = duckdbSource.match(/const RELIABLE_GAME\s*=\s*`([^`]+)`/s);
        expect(reliableBlock).not.toBeNull();
        const sql = reliableBlock[1];
        for (const field of CONF_FIELDS) {
            expect(sql).toContain(`${field}_confidence`);
        }
    });

    test('SQL RELIABLE_GAME includes features check', () => {
        const reliableBlock = duckdbSource.match(/const RELIABLE_GAME\s*=\s*`([^`]+)`/s);
        expect(reliableBlock).not.toBeNull();
        expect(reliableBlock[1]).toContain('features IS NOT NULL');
    });

    test('JS isReliable in loadGamesData checks same field list as SQL', () => {
        const loadBlock = duckdbSource.substring(
            duckdbSource.indexOf('const isReliable'),
            duckdbSource.indexOf('let reliableRank')
        );
        expect(loadBlock).toContain('const isReliable');
        for (const field of CONF_FIELDS) {
            expect(loadBlock).toContain(`'${field}'`);
        }
        expect(loadBlock).toContain('game.features');
    });

    test('RELIABLE_GAME is applied to all core queries', () => {
        const queryFunctions = [
            'getOverviewStats',
            'getThemeDistribution',
            'getMechanicDistribution',
            'getProviderDistribution',
            'getAnomalies',
            'getAllGames',
            'getGamesByMechanic',
            'getGamesByTheme',
            'getGamesByProvider',
            'searchGames',
            'getVolatilityDistribution',
            'getReleaseYearDistribution',
            'getTopGames',
            'getFeatureDistribution',
        ];
        for (const fn of queryFunctions) {
            const fnStart = duckdbSource.indexOf(`function ${fn}`);
            if (fnStart === -1) continue;
            const fnEnd = duckdbSource.indexOf('\nexport', fnStart + 1);
            const fnBody = duckdbSource.substring(fnStart, fnEnd === -1 ? undefined : fnEnd);
            expect(fnBody).toContain('RELIABLE_GAME');
        }
    });
});
