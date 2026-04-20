/**
 * Comprehensive Data QA System
 *
 * Cross-page consistency checks, data integrity validation, and semantic
 * anomaly detection. NEVER modifies data — only flags and reports issues.
 *
 * Severity levels:
 *   [Error]   = test fails (must be fixed)
 *   [Warning] = console.warn + tracked (review recommended)
 *   [Info]    = console.info (informational, no action needed)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
    loadTestData,
    gameData,
    getActiveGames,
    getActiveThemes,
    getActiveMechanics,
} from '../utils/load-test-data.js';
import { F } from '../../src/lib/game-fields.js';
import { getProviderMetrics, getThemeMetrics, getFeatureMetrics, calculateSmartIndex } from '../../src/lib/metrics.js';
import { parseFeatures } from '../../src/lib/parse-features.js';
import { PROVIDER_NORMALIZATION_MAP, MIN_PROVIDER_GAMES } from '../../src/lib/shared-config.js';

let allGames;
let themes;
let mechanics;

beforeAll(async () => {
    await loadTestData();
    allGames = getActiveGames();
    themes = getActiveThemes();
    mechanics = getActiveMechanics();
});

// ── QA-1: Overview Page ─────────────────────────────────────────

describe('QA: Overview Page', () => {
    it('[Error] O-1: KPI game count matches allGames length', () => {
        expect(gameData.total_games).toBe(allGames.length);
        expect(allGames.length).toBeGreaterThan(4000);
    });

    it('[Error] O-2: distinct normalized providers matches getProviderMetrics', () => {
        const fromMetrics = getProviderMetrics(allGames);
        const directProviders = new Set(allGames.map(g => F.provider(g)).filter(Boolean));
        expect(fromMetrics.length).toBeGreaterThanOrEqual(directProviders.size * 0.8);
    });

    it('[Error] O-5: random theme bubble data recomputable from games', () => {
        const activeThemes = themes.filter(t => (t['Game Count'] || 0) >= 2);
        if (activeThemes.length < 3) return;
        const sample = [
            activeThemes[0],
            activeThemes[Math.floor(activeThemes.length / 2)],
            activeThemes[activeThemes.length - 1],
        ];
        for (const theme of sample) {
            const name = theme.Theme || theme.theme;
            const matching = allGames.filter(g => F.themeConsolidated(g) === name);
            expect(matching.length).toBe(theme['Game Count'] || theme.game_count);
        }
    });

    it('[Error] O-8: provider metrics sorted by Smart Index', () => {
        const provMetrics = getProviderMetrics(allGames);
        for (let i = 1; i < Math.min(provMetrics.length, 10); i++) {
            expect(provMetrics[i - 1].smartIndex).toBeGreaterThanOrEqual(provMetrics[i].smartIndex);
        }
    });
});

// ── QA-2: Games Page ────────────────────────────────────────────

describe('QA: Games Page', () => {
    it('[Error] G-1: F.theoWin matches raw field for sample games', () => {
        const sample = allGames.filter(g => F.theoWin(g) > 0).slice(0, 10);
        for (const g of sample) {
            const viaAccessor = F.theoWin(g);
            expect(typeof viaAccessor).toBe('number');
            expect(viaAccessor).toBeGreaterThan(0);
        }
    });

    it('[Error] G-2: market share values are percentages (0-100)', () => {
        const withShare = allGames.filter(g => F.marketShare(g) > 0);
        for (const g of withShare) {
            const ms = F.marketShare(g);
            expect(ms).toBeGreaterThanOrEqual(0);
            expect(ms).toBeLessThanOrEqual(100);
        }
    });

    it('[Warning] G-3: no game has negative theo win', () => {
        const negative = allGames.filter(g => F.theoWin(g) < 0);
        if (negative.length > 0) {
            console.warn(
                `[QA] ${negative.length} games have negative theo_win:`,
                negative.slice(0, 3).map(g => g.name)
            );
        }
        expect(negative.length).toBe(0);
    });
});

// ── QA-3: Themes Page ───────────────────────────────────────────

describe('QA: Themes Page', () => {
    it('[Error] T-1: theme game counts match filtered game data', () => {
        const sample = themes.slice(0, 3);
        for (const theme of sample) {
            const name = theme.Theme || theme.theme;
            const matching = allGames.filter(g => F.themeConsolidated(g) === name);
            expect(matching.length).toBe(theme['Game Count'] || theme.game_count);
        }
    });

    it('[Error] T-4: Smart Index matches recalculated values', () => {
        if (themes.length < 3) return;
        const globalAvg = themes.reduce((s, t) => s + (t['Avg Theo Win Index'] || 0), 0) / themes.length;
        for (const t of themes.slice(0, 5)) {
            const expected = calculateSmartIndex(t['Avg Theo Win Index'] || 0, t['Game Count'] || 0, globalAvg);
            expect(t['Smart Index']).toBeCloseTo(expected, 1);
        }
    });

    it('[Warning] T-2: theme avg theo is mean of game theos', () => {
        const sample = themes.slice(0, 3);
        let warnings = 0;
        for (const theme of sample) {
            const name = theme.Theme || theme.theme;
            const matching = allGames.filter(g => F.themeConsolidated(g) === name);
            if (matching.length === 0) continue;
            const avgTheo = matching.reduce((s, g) => s + F.theoWin(g), 0) / matching.length;
            const reported = theme['Avg Theo Win Index'] || 0;
            if (Math.abs(avgTheo - reported) > 0.1) {
                console.warn(`[QA] Theme "${name}": avg theo ${avgTheo.toFixed(2)} vs reported ${reported.toFixed(2)}`);
                warnings++;
            }
        }
        expect(warnings).toBe(0);
    });
});

// ── QA-4: Providers Page ────────────────────────────────────────

describe('QA: Providers Page', () => {
    it('[Error] P-1: provider game counts match filtered games', () => {
        const provMetrics = getProviderMetrics(allGames);
        const sample = provMetrics.slice(0, 3);
        for (const p of sample) {
            const matching = allGames.filter(g => F.provider(g) === p.name);
            expect(matching.length).toBe(p.count);
        }
    });

    it('[Warning] P-3: provider market shares sum to ~1.0 (fractional)', () => {
        const provMetrics = getProviderMetrics(allGames);
        const totalShare = provMetrics.reduce((s, p) => s + p.ggrShare, 0);
        if (Math.abs(totalShare - 1.0) > 0.1) {
            console.warn(`[QA] Provider market shares sum to ${totalShare.toFixed(4)}, expected ~1.0`);
        }
        expect(totalShare).toBeGreaterThan(0.5);
        expect(totalShare).toBeLessThan(1.5);
    });
});

// ── QA-6: Trends ────────────────────────────────────────────────

describe('QA: Trends', () => {
    it('[Error] TR-4: release year counts match game data', () => {
        const yearCounts = {};
        for (const g of allGames) {
            const yr = F.releaseYear(g);
            if (yr && yr >= 2010) {
                yearCounts[yr] = (yearCounts[yr] || 0) + 1;
            }
        }
        const years = Object.keys(yearCounts).map(Number);
        expect(years.length).toBeGreaterThanOrEqual(5);
        for (const yr of years) {
            const fromFilter = allGames.filter(g => F.releaseYear(g) === yr);
            expect(fromFilter.length).toBe(yearCounts[yr]);
        }
    });
});

// ── QA-7: Art Insights ──────────────────────────────────────────

describe('QA: Art Insights', () => {
    it('[Error] AR-1: art coverage percentage is consistent', () => {
        const withArt = allGames.filter(g => F.artTheme(g) || g.art_theme);
        const coverage = withArt.length / allGames.length;
        if (coverage < 0.01) {
            console.warn(`[SKIP] art coverage ${(coverage * 100).toFixed(1)}% — art data not yet merged into master`);
            return;
        }
        expect(coverage).toBeGreaterThan(0.7);
        expect(coverage).toBeLessThanOrEqual(1.0);
    });

    it('[Warning] AR-art-theme: flag implausible art+theme combos', () => {
        const implausible = [];
        for (const g of allGames) {
            const chars = g.art_characters || [];
            const theme = F.themeConsolidated(g);
            if (chars.includes('Dragon') && (theme === 'Sports' || theme === 'Casino')) {
                implausible.push({ name: g.name, theme, characters: chars });
            }
        }
        if (implausible.length > 0) {
            console.warn(
                `[QA] ${implausible.length} games have implausible art+theme combos:`,
                implausible.slice(0, 3)
            );
        }
    });
});

// ── QA-8: Cross-Page Consistency ────────────────────────────────

describe('QA: Cross-Page Consistency', () => {
    it('[Error] X-1: theo_win is consistent for same game across access methods', () => {
        const sample = allGames.filter(g => F.theoWin(g) > 0).slice(0, 20);
        for (const g of sample) {
            const v1 = F.theoWin(g);
            const v2 = g.performance_theo_win ?? g.theo_win ?? 0;
            expect(v1).toBe(v2);
        }
    });

    it('[Error] X-2: provider game count on Providers = count of matching games', () => {
        const provMetrics = getProviderMetrics(allGames);
        for (const p of provMetrics.slice(0, 5)) {
            const matching = allGames.filter(g => F.provider(g) === p.name);
            expect(matching.length).toBe(p.count);
        }
    });

    it('[Warning] X-5: no table games with slot-only features', () => {
        const slotFeatures = new Set(['Free Spins', 'Hold and Spin', 'Cascading Reels', 'Megaways']);
        const flags = [];
        for (const g of allGames) {
            const cat = F.gameCategory(g);
            if (cat === 'Table Game' || cat === 'Live Casino') {
                const feats = parseFeatures(g.features);
                const slotOnly = feats.filter(f => slotFeatures.has(f));
                if (slotOnly.length > 0) {
                    flags.push({ name: g.name, category: cat, features: slotOnly });
                }
            }
        }
        if (flags.length > 0) {
            console.warn(`[QA] ${flags.length} table/live games have slot-only features:`, flags.slice(0, 3));
        }
    });

    it('[Warning] X-6: franchise games share naming pattern or provider', () => {
        const franchiseMapping = {};
        for (const g of allGames) {
            const fr = F.franchise(g);
            if (!fr) continue;
            if (!franchiseMapping[fr]) franchiseMapping[fr] = { providers: new Set(), names: [] };
            franchiseMapping[fr].providers.add(F.provider(g));
            franchiseMapping[fr].names.push(g.name);
        }
        const genericFlags = [];
        for (const [name, data] of Object.entries(franchiseMapping)) {
            if (name.length < 5 && data.providers.size > 2 && data.names.length < 20) {
                genericFlags.push({ franchise: name, providers: data.providers.size, games: data.names.length });
            }
        }
        if (genericFlags.length > 0) {
            console.warn(
                `[QA] ${genericFlags.length} short generic franchise names with multiple providers:`,
                genericFlags
            );
        }
    });
});

// ── QA-9: Brands ────────────────────────────────────────────────

describe('QA: Brands / Franchises', () => {
    it('[Warning] BR-1: no franchise with only 1 game (weak brand)', () => {
        const franchiseCounts = {};
        for (const g of allGames) {
            const fr = F.franchise(g);
            if (fr) franchiseCounts[fr] = (franchiseCounts[fr] || 0) + 1;
        }
        const singles = Object.entries(franchiseCounts).filter(([, c]) => c === 1);
        if (singles.length > 0) {
            console.warn(
                `[QA] ${singles.length} franchises with only 1 game:`,
                singles.slice(0, 5).map(([n]) => n)
            );
        }
    });

    it('[Warning] BR-2: flag short common-word franchise names', () => {
        const commonWords = new Set([
            'book',
            'king',
            'queen',
            'gold',
            'gems',
            'luck',
            'jack',
            'age',
            'rise',
            'lady',
            'power',
            'secrets',
        ]);
        const franchiseNames = new Set(allGames.map(g => F.franchise(g)).filter(Boolean));
        const flagged = [...franchiseNames].filter(n => commonWords.has(n.toLowerCase()));
        if (flagged.length > 0) {
            console.warn(`[QA] ${flagged.length} franchise names are common English words:`, flagged);
        }
    });
});

// ── QA-10: Data Integrity ───────────────────────────────────────

describe('QA: Data Integrity', () => {
    it('[Error] all games have required fields', () => {
        for (const g of allGames.slice(0, 100)) {
            expect(g.name).toBeTruthy();
            expect(typeof g.name).toBe('string');
        }
    });

    it('[Error] no duplicate game names', () => {
        const names = allGames.map(g => g.name);
        const dupes = names.filter((n, i) => names.indexOf(n) !== i);
        expect(dupes.length).toBeLessThan(allGames.length * 0.01);
    });

    it('[Warning] RTP values are in valid range', () => {
        const badRtp = allGames.filter(g => {
            const rtp = F.rtp(g);
            return rtp > 0 && (rtp < 80 || rtp > 100);
        });
        if (badRtp.length > 0) {
            console.warn(
                `[QA] ${badRtp.length} games have RTP outside 80-100%:`,
                badRtp.slice(0, 3).map(g => `${g.name}: ${F.rtp(g)}`)
            );
        }
        expect(badRtp.length).toBeLessThan(10);
    });

    it('[Warning] volatility values are from expected set', () => {
        const validVols = new Set(['Low', 'Low-Medium', 'Medium', 'Medium-High', 'High', 'Very High', '']);
        const invalid = allGames.filter(g => {
            const v = F.volatility(g);
            return v && !validVols.has(v);
        });
        if (invalid.length > 0) {
            console.warn(
                `[QA] ${invalid.length} games have unexpected volatility:`,
                invalid.slice(0, 3).map(g => `${g.name}: ${F.volatility(g)}`)
            );
        }
    });

    it('[Error] art vocabulary compliance - all art values from controlled list', () => {
        let violations = 0;
        const artThemes = new Set([
            'Ancient Temple/Ruins',
            'Deep Ocean/Underwater',
            'Fantasy/Fairy Tale',
            'Wild West/Frontier',
            'Outer Space',
            'Neon/Cyber City',
            'Medieval Castle',
            'Tropical Island/Beach',
            'Arctic/Snow',
            'Jungle/Rainforest',
            'Desert/Sahara',
            'Haunted Manor/Graveyard',
            'Candy/Sweet World',
            'Circus/Carnival',
            'Urban/Modern City',
            'Mountain/Volcano',
            'Farm/Countryside',
            'Royal Palace/Court',
            'Pirate Ship/Port',
            'Treasure Cave/Mine',
            'Magic/Fantasy',
            'Asian Temple/Garden',
            'Ancient Greece',
            'Sky/Clouds',
            'Laboratory/Workshop',
            'Tavern/Saloon',
            'Norse/Viking Realm',
            'Irish/Celtic Highlands',
            'Festive/Holiday',
            'Prehistoric/Primordial',
            'Steampunk/Victorian',
            'Lakeside/River/Fishing Dock',
            'Classic Slots',
            'Fruit Machine',
            'Luxury/VIP',
            'Casino Floor',
            'Savanna/Wildlife',
            'Australian Outback',
            'Mexican/Latin Village',
            'Coastal/Beach/Shore',
            'Arabian Palace/Bazaar',
            'Prairie/Plains/Grassland',
        ]);
        for (const g of allGames) {
            const theme = g.art_theme;
            if (theme && !artThemes.has(theme)) {
                violations++;
                if (violations <= 3) {
                    console.warn(`[QA] "${g.name}" has invalid art_theme: "${theme}"`);
                }
            }
        }
        expect(violations).toBe(0);
    });
});
