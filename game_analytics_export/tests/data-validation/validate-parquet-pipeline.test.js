/**
 * Validates that build-parquet.mjs output (games_processed.json) matches
 * the source data in game_data_master.json after transformations.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

let masterGames;
let processedGames;
let themeMap;

beforeAll(() => {
    masterGames = JSON.parse(readFileSync(resolve(DATA_DIR, 'game_data_master.json'), 'utf-8'));
    themeMap = JSON.parse(readFileSync(resolve(DATA_DIR, 'theme_consolidation_map.json'), 'utf-8'));

    const processedPath = resolve(DATA_DIR, 'games_processed.json');
    if (existsSync(processedPath)) {
        processedGames = JSON.parse(readFileSync(processedPath, 'utf-8'));
    }
});

describe('Parquet pipeline: games_processed.json', () => {
    test('games_processed.json exists and is non-empty', () => {
        expect(processedGames).toBeDefined();
        expect(processedGames.length).toBeGreaterThan(4000);
    });

    test('row count matches master (minus Total rows)', () => {
        const validMaster = masterGames.filter(g => g.game_category !== 'Total' && g.name !== 'Total');
        expect(processedGames.length).toBe(validMaster.length);
    });

    test('all processed games have required DuckDB column names', () => {
        const requiredCols = [
            'id',
            'name',
            'theme_consolidated',
            'provider_studio',
            'performance_theo_win',
            'performance_market_share_percent',
            'game_category',
        ];
        for (const col of requiredCols) {
            const hasCol = processedGames.some(g => g[col] !== undefined);
            expect(hasCol, `Column ${col} missing from all rows`).toBe(true);
        }
    });

    test('theme_consolidated is populated from theme map', () => {
        const withTheme = processedGames.filter(g => g.theme_consolidated && g.theme_consolidated !== 'Unknown');
        expect(withTheme.length).toBeGreaterThan(2500);
    });

    test('provider_studio is normalized', () => {
        const igtGames = processedGames.filter(g => g.provider_studio === 'IGT');
        expect(igtGames.length).toBeGreaterThan(0);
        const rawIgt = processedGames.filter(g => g.provider_studio === 'Igt');
        expect(rawIgt.length).toBe(0);
    });

    test('performance_market_share_percent is multiplied by 100', () => {
        const withShare = processedGames.filter(g => g.performance_market_share_percent > 0);
        expect(withShare.length).toBeGreaterThan(0);
        const maxShare = Math.max(...withShare.map(g => g.performance_market_share_percent));
        expect(maxShare).toBeGreaterThan(1);
    });

    test('features are stored as JSON strings', () => {
        const withFeatures = processedGames.filter(g => g.features);
        expect(withFeatures.length).toBeGreaterThan(2500);
        for (const g of withFeatures.slice(0, 50)) {
            expect(g.features).toMatch(/^\[/);
            expect(() => JSON.parse(g.features)).not.toThrow();
        }
    });

    test('art data is populated', () => {
        const withArt = processedGames.filter(g => g.art_setting);
        expect(withArt.length).toBeGreaterThan(3000);
    });

    test('confidence fields are populated', () => {
        const withConf = processedGames.filter(g => g.rtp_confidence || g.volatility_confidence);
        expect(withConf.length).toBeGreaterThan(0);
    });

    test('performance_rank is contiguous for reliable games', () => {
        const ranked = processedGames
            .filter(g => g.performance_rank != null)
            .sort((a, b) => a.performance_rank - b.performance_rank);
        expect(ranked.length).toBeGreaterThan(2000);
        expect(ranked[0].performance_rank).toBe(1);
        for (let i = 1; i < Math.min(ranked.length, 100); i++) {
            expect(ranked[i].performance_rank).toBe(ranked[i - 1].performance_rank + 1);
        }
    });

    test('parquet file exists', () => {
        expect(existsSync(resolve(DATA_DIR, 'games.parquet'))).toBe(true);
    });
});
