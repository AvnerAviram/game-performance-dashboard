import { describe, it, expect } from 'vitest';
import { F, FIELD_NAMES, getTheme, getProvider, getPerformance } from '../../src/lib/game-fields.js';

const flatGame = {
    id: 'game-001-test',
    name: 'Test Slot',
    performance_theo_win: 42.5,
    performance_market_share_percent: 1.23,
    performance_rank: 5,
    performance_anomaly: 'over',
    provider_studio: 'NetEnt',
    provider_parent: 'Evolution',
    theme_primary: 'Egypt',
    theme_consolidated: 'Ancient',
    theme_secondary: 'Adventure',
    themes_all: ['Egypt', 'Adventure', 'Ancient'],
    features: ['Free Spins', 'Multiplier'],
    specs_rtp: 96.5,
    specs_volatility: 'High',
    specs_reels: 5,
    specs_rows: 3,
    specs_paylines: '20 Lines',
    min_bet: 0.2,
    max_bet: 100,
    max_win: '5000x',
    sites: 450,
    avg_bet: 1.5,
    median_bet: 1.0,
    games_played_index: 85,
    coin_in_index: 72,
    release_year: 2024,
    release_month: 6,
    original_release_year: 2019,
};

const nestedGame = {
    id: 'game-002-nested',
    name: 'Nested Slot',
    performance: { theo_win: 30.1, market_share_percent: 0.5, rank: 12, anomaly: 'under' },
    provider: { studio: 'Pragmatic Play', parent: 'Pragmatic Group' },
    theme: { primary: 'Fantasy', secondary: 'Magic', consolidated: 'Fantasy & Magic' },
    features: ['Cascading Reels'],
    rtp: 95.0,
    volatility: 'Medium',
    reels: 6,
    rows: 4,
    release: { year: 2023, month: 3 },
};

const emptyGame = {};

describe('F accessor functions — flat DuckDB row', () => {
    it('F.id', () => expect(F.id(flatGame)).toBe('game-001-test'));
    it('F.name', () => expect(F.name(flatGame)).toBe('Test Slot'));
    it('F.theoWin', () => expect(F.theoWin(flatGame)).toBe(42.5));
    it('F.marketShare', () => expect(F.marketShare(flatGame)).toBe(1.23));
    it('F.rank', () => expect(F.rank(flatGame)).toBe(5));
    it('F.anomaly', () => expect(F.anomaly(flatGame)).toBe('over'));
    it('F.provider', () => expect(F.provider(flatGame)).toBe('NetEnt'));
    it('F.providerParent', () => expect(F.providerParent(flatGame)).toBe('Evolution'));
    it('F.theme', () => expect(F.theme(flatGame)).toBe('Egypt'));
    it('F.themeConsolidated', () => expect(F.themeConsolidated(flatGame)).toBe('Ancient'));
    it('F.themeSecondary', () => expect(F.themeSecondary(flatGame)).toBe('Adventure'));
    it('F.themesAll', () => expect(F.themesAll(flatGame)).toEqual(['Egypt', 'Adventure', 'Ancient']));
    it('F.features', () => expect(F.features(flatGame)).toEqual(['Free Spins', 'Multiplier']));
    it('F.rtp', () => expect(F.rtp(flatGame)).toBe(96.5));
    it('F.volatility', () => expect(F.volatility(flatGame)).toBe('High'));
    it('F.reels', () => expect(F.reels(flatGame)).toBe(5));
    it('F.rows', () => expect(F.rows(flatGame)).toBe(3));
    it('F.paylines', () => expect(F.paylines(flatGame)).toBe('20 Lines'));
    it('F.minBet', () => expect(F.minBet(flatGame)).toBe(0.2));
    it('F.maxBet', () => expect(F.maxBet(flatGame)).toBe(100));
    it('F.maxWin', () => expect(F.maxWin(flatGame)).toBe('5000x'));
    it('F.sites', () => expect(F.sites(flatGame)).toBe(450));
    it('F.avgBet', () => expect(F.avgBet(flatGame)).toBe(1.5));
    it('F.medianBet', () => expect(F.medianBet(flatGame)).toBe(1.0));
    it('F.gamesPlayedIndex', () => expect(F.gamesPlayedIndex(flatGame)).toBe(85));
    it('F.coinIn', () => expect(F.coinIn(flatGame)).toBe(72));
    it('F.releaseYear', () => expect(F.releaseYear(flatGame)).toBe(2024));
    it('F.releaseMonth', () => expect(F.releaseMonth(flatGame)).toBe(6));
    it('F.originalReleaseYear', () => expect(F.originalReleaseYear(flatGame)).toBe(2019));
    it('F.hasGlobalReleaseYear', () => expect(F.hasGlobalReleaseYear(flatGame)).toBe(true));
});

describe('F accessor functions — nested JSON row', () => {
    it('F.theoWin', () => expect(F.theoWin(nestedGame)).toBe(30.1));
    it('F.marketShare', () => expect(F.marketShare(nestedGame)).toBe(0.5));
    it('F.rank', () => expect(F.rank(nestedGame)).toBe(12));
    it('F.anomaly', () => expect(F.anomaly(nestedGame)).toBe('under'));
    it('F.provider', () => expect(F.provider(nestedGame)).toBe('Pragmatic Play'));
    it('F.providerParent', () => expect(F.providerParent(nestedGame)).toBe('Pragmatic Group'));
    it('F.theme', () => expect(F.theme(nestedGame)).toBe('Fantasy'));
    it('F.themeConsolidated', () => expect(F.themeConsolidated(nestedGame)).toBe('Fantasy & Magic'));
    it('F.themeSecondary', () => expect(F.themeSecondary(nestedGame)).toBe('Magic'));
    it('F.rtp', () => expect(F.rtp(nestedGame)).toBe(95.0));
    it('F.volatility', () => expect(F.volatility(nestedGame)).toBe('Medium'));
    it('F.reels', () => expect(F.reels(nestedGame)).toBe(6));
    it('F.rows', () => expect(F.rows(nestedGame)).toBe(4));
    it('F.releaseYear', () => expect(F.releaseYear(nestedGame)).toBe(2023));
    it('F.releaseMonth', () => expect(F.releaseMonth(nestedGame)).toBe(3));
});

describe('F accessor functions — missing fields (defaults)', () => {
    it('F.id', () => expect(F.id(emptyGame)).toBe(''));
    it('F.name', () => expect(F.name(emptyGame)).toBe(''));
    it('F.theoWin', () => expect(F.theoWin(emptyGame)).toBe(0));
    it('F.marketShare', () => expect(F.marketShare(emptyGame)).toBe(0));
    it('F.rank', () => expect(F.rank(emptyGame)).toBe(999));
    it('F.anomaly', () => expect(F.anomaly(emptyGame)).toBeNull());
    it('F.provider', () => expect(F.provider(emptyGame)).toBe('Unknown'));
    it('F.providerParent', () => expect(F.providerParent(emptyGame)).toBe('Unknown'));
    it('F.theme', () => expect(F.theme(emptyGame)).toBe('Unknown'));
    it('F.themeConsolidated', () => expect(F.themeConsolidated(emptyGame)).toBe('Unknown'));
    it('F.themeSecondary', () => expect(F.themeSecondary(emptyGame)).toBe(''));
    it('F.themesAll', () => expect(F.themesAll(emptyGame)).toEqual([]));
    it('F.features', () => expect(F.features(emptyGame)).toEqual([]));
    it('F.rtp', () => expect(F.rtp(emptyGame)).toBe(0));
    it('F.volatility', () => expect(F.volatility(emptyGame)).toBe(''));
    it('F.reels', () => expect(F.reels(emptyGame)).toBe(0));
    it('F.rows', () => expect(F.rows(emptyGame)).toBe(0));
    it('F.paylines', () => expect(F.paylines(emptyGame)).toBe(0));
    it('F.minBet', () => expect(F.minBet(emptyGame)).toBe(0));
    it('F.maxBet', () => expect(F.maxBet(emptyGame)).toBe(0));
    it('F.maxWin', () => expect(F.maxWin(emptyGame)).toBe(''));
    it('F.sites', () => expect(F.sites(emptyGame)).toBe(0));
    it('F.avgBet', () => expect(F.avgBet(emptyGame)).toBe(0));
    it('F.coinIn', () => expect(F.coinIn(emptyGame)).toBe(0));
    it('F.releaseYear', () => expect(F.releaseYear(emptyGame)).toBe(0));
    it('F.releaseMonth', () => expect(F.releaseMonth(emptyGame)).toBe(0));
    it('F.originalReleaseYear', () => expect(F.originalReleaseYear(emptyGame)).toBe(0));
    it('F.hasGlobalReleaseYear', () => expect(F.hasGlobalReleaseYear(emptyGame)).toBe(false));
});

describe('F.originalReleaseYear — no NJ fallback', () => {
    it('F.originalReleaseYear does NOT fall back to release_year', () => {
        const njOnly = { release_year: 2024 };
        expect(F.originalReleaseYear(njOnly)).toBe(0);
        expect(F.hasGlobalReleaseYear(njOnly)).toBe(false);
    });
});

describe('FIELD_NAMES constants', () => {
    it('maps to correct DuckDB column names', () => {
        expect(FIELD_NAMES.THEO_WIN).toBe('performance_theo_win');
        expect(FIELD_NAMES.MARKET_SHARE).toBe('performance_market_share_percent');
        expect(FIELD_NAMES.PROVIDER).toBe('provider_studio');
        expect(FIELD_NAMES.THEME).toBe('theme_primary');
        expect(FIELD_NAMES.THEME_CONSOLIDATED).toBe('theme_consolidated');
        expect(FIELD_NAMES.VOLATILITY).toBe('specs_volatility');
        expect(FIELD_NAMES.RTP).toBe('specs_rtp');
        expect(FIELD_NAMES.REELS).toBe('specs_reels');
        expect(FIELD_NAMES.ROWS).toBe('specs_rows');
        expect(FIELD_NAMES.NAME).toBe('name');
        expect(FIELD_NAMES.RELEASE_YEAR).toBe('release_year');
        expect(FIELD_NAMES.MIN_BET).toBe('min_bet');
        expect(FIELD_NAMES.MAX_BET).toBe('max_bet');
        expect(FIELD_NAMES.SITES).toBe('sites');
    });
});

describe('F.provider normalizes through PROVIDER_NORMALIZATION_MAP', () => {
    it('normalizes White Hat Studios to Blueprint Gaming', () => {
        expect(F.provider({ provider_studio: 'White Hat Studios' })).toBe('Blueprint Gaming');
    });
    it('normalizes Lucksome to Blueprint Gaming', () => {
        expect(F.provider({ provider_studio: 'Lucksome' })).toBe('Blueprint Gaming');
    });
    it('normalizes Igt to IGT via nested fallback', () => {
        expect(F.provider({ provider: { studio: 'Igt' } })).toBe('IGT');
    });
    it('passes through unknown providers unchanged', () => {
        expect(F.provider({ provider_studio: 'NetEnt' })).toBe('NetEnt');
    });
    it('returns Unknown for missing provider', () => {
        expect(F.provider({})).toBe('Unknown');
    });
});

describe('F.franchise and F.franchiseType accessors', () => {
    it('returns franchise from flat field', () => {
        expect(F.franchise({ franchise: 'Ted' })).toBe('Ted');
    });
    it('returns franchiseType from flat field', () => {
        expect(F.franchiseType({ franchise_type: 'licensed_ip' })).toBe('licensed_ip');
    });
    it('returns null when franchise is not set', () => {
        expect(F.franchise({})).toBeNull();
        expect(F.franchiseType({})).toBeNull();
    });
});

describe('F.gameCategory and F.gameSubCategory accessors', () => {
    it('returns category from flat field', () => {
        expect(F.gameCategory({ game_category: 'Live Casino' })).toBe('Live Casino');
    });
    it('defaults to Slot when missing', () => {
        expect(F.gameCategory({})).toBe('Slot');
    });
    it('returns sub-category when present', () => {
        expect(F.gameSubCategory({ game_sub_category: 'Slingo' })).toBe('Slingo');
    });
    it('returns null for missing sub-category', () => {
        expect(F.gameSubCategory({})).toBeNull();
    });
});

describe('FIELD_NAMES includes GAME_CATEGORY', () => {
    it('maps to correct column name', () => {
        expect(FIELD_NAMES.GAME_CATEGORY).toBe('game_category');
    });
});

describe('backward-compatible object builders (compat.js replacement)', () => {
    it('getTheme returns object with primary/secondary/consolidated', () => {
        const t = getTheme(flatGame);
        expect(t.primary).toBe('Egypt');
        expect(t.secondary).toBe('Adventure');
        expect(t.consolidated).toBe('Ancient');
    });

    it('getTheme falls back for nested', () => {
        const t = getTheme(nestedGame);
        expect(t.primary).toBe('Fantasy');
        expect(t.consolidated).toBe('Fantasy & Magic');
    });

    it('getProvider returns object with studio/parent', () => {
        const p = getProvider(flatGame);
        expect(p.studio).toBe('NetEnt');
        expect(p.parent).toBe('Evolution');
    });

    it('getProvider falls back for nested', () => {
        const p = getProvider(nestedGame);
        expect(p.studio).toBe('Pragmatic Play');
        expect(p.parent).toBe('Pragmatic Group');
    });

    it('getPerformance returns object with theo_win/rank/anomaly/market_share_percent', () => {
        const perf = getPerformance(flatGame);
        expect(perf.theo_win).toBe(42.5);
        expect(perf.rank).toBe(5);
        expect(perf.anomaly).toBe('over');
        expect(perf.market_share_percent).toBe(1.23);
    });

    it('getPerformance falls back for nested', () => {
        const perf = getPerformance(nestedGame);
        expect(perf.theo_win).toBe(30.1);
        expect(perf.market_share_percent).toBe(0.5);
    });

    it('getPerformance defaults for empty game', () => {
        const perf = getPerformance(emptyGame);
        expect(perf.theo_win).toBe(0);
        expect(perf.rank).toBe(999);
        expect(perf.market_share_percent).toBe(0);
    });
});
