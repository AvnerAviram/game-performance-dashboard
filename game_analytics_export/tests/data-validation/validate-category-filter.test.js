/**
 * Category Filter Propagation Tests
 *
 * Validates that the per-page category filter (Slot / Table Game / etc.)
 * correctly flows through getActiveGames / getActiveThemes / getActiveMechanics
 * and that every downstream consumer sees the filtered data.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
    gameData,
    loadTestData,
    getActiveGames,
    getActiveThemes,
    getActiveMechanics,
} from '../utils/load-test-data.js';
import { F } from '../../src/lib/game-fields.js';
import { getThemeMetrics, getFeatureMetrics, addSmartIndex } from '../../src/lib/metrics.js';

beforeAll(async () => {
    await loadTestData();
});

afterEach(() => {
    gameData.viewGames = null;
    gameData.viewThemes = null;
    gameData.viewMechanics = null;
    gameData.activeCategory = null;
});

// ── Helper: simulate selecting a category (mirrors chart-config.js applyCategory) ──
function selectCategory(category) {
    const allGames = gameData.allGames;
    gameData.activeCategory = category || null;

    if (category) {
        gameData.viewGames = allGames.filter(g => F.gameCategory(g) === category);

        const rawThemes = getThemeMetrics(gameData.viewGames).filter(t => t.theme && !/^unknown$/i.test(t.theme));
        const mapped = rawThemes.map(t => ({
            Theme: t.theme,
            theme: t.theme,
            'Game Count': t.count,
            game_count: t.count,
            'Avg Theo Win Index': t.avgTheo,
            avg_theo_win: t.avgTheo,
        }));
        gameData.viewThemes = addSmartIndex(mapped.map(r => ({ ...r, count: r.game_count }))).map(r => ({
            ...r,
            'Smart Index': r.smartIndex,
        }));

        const rawMech = getFeatureMetrics(gameData.viewGames);
        const mechMapped = rawMech.map(f => ({
            Mechanic: f.feature,
            mechanic: f.feature,
            'Game Count': f.count,
            game_count: f.count,
            'Avg Theo Win Index': f.avgTheo,
            avg_theo_win: f.avgTheo,
        }));
        gameData.viewMechanics = addSmartIndex(mechMapped.map(r => ({ ...r, count: r.game_count }))).map(r => ({
            ...r,
            'Smart Index': r.smartIndex,
        }));
    } else {
        gameData.viewGames = null;
        gameData.viewThemes = null;
        gameData.viewMechanics = null;
    }
}

// ── 1. Getter contract ──────────────────────────────────────────────────

describe('getActiveGames / getActiveThemes / getActiveMechanics contract', () => {
    it('returns all games when no filter is active', () => {
        expect(getActiveGames()).toBe(gameData.allGames);
        expect(getActiveGames().length).toBe(gameData.allGames.length);
    });

    it('returns all themes when no filter is active', () => {
        expect(getActiveThemes()).toBe(gameData.themes);
    });

    it('returns all mechanics when no filter is active', () => {
        expect(getActiveMechanics()).toBe(gameData.mechanics);
    });

    it('returns filtered games when category is set', () => {
        selectCategory('Slot');
        const active = getActiveGames();
        expect(active.length).toBeLessThan(gameData.allGames.length);
        expect(active.every(g => F.gameCategory(g) === 'Slot')).toBe(true);
    });

    it('returns filtered themes when category is set', () => {
        selectCategory('Slot');
        const themes = getActiveThemes();
        expect(themes.length).toBeGreaterThan(0);
        expect(themes).not.toBe(gameData.themes);
    });

    it('returns filtered mechanics when category is set', () => {
        selectCategory('Slot');
        const mechs = getActiveMechanics();
        expect(mechs.length).toBeGreaterThan(0);
        expect(mechs).not.toBe(gameData.mechanics);
    });

    it('returns unfiltered data after clearing the filter', () => {
        selectCategory('Slot');
        expect(getActiveGames().length).toBeLessThan(gameData.allGames.length);

        selectCategory(null);
        expect(getActiveGames()).toBe(gameData.allGames);
        expect(getActiveThemes()).toBe(gameData.themes);
        expect(getActiveMechanics()).toBe(gameData.mechanics);
    });
});

// ── 2. Filter invariants ────────────────────────────────────────────────

describe('Category filter invariants', () => {
    it('filtered games are always a strict subset of allGames', () => {
        selectCategory('Slot');
        const active = getActiveGames();
        const allNames = new Set(gameData.allGames.map(g => g.name));
        active.forEach(g => {
            expect(allNames.has(g.name)).toBe(true);
        });
    });

    it('all games in filtered set match the selected category', () => {
        selectCategory('Slot');
        getActiveGames().forEach(g => {
            expect(F.gameCategory(g)).toBe('Slot');
        });
    });

    it('sum of per-category counts equals total games', () => {
        const categories = [...new Set(gameData.allGames.map(g => F.gameCategory(g)))].filter(Boolean);
        let totalCounted = 0;
        categories.forEach(cat => {
            selectCategory(cat);
            totalCounted += getActiveGames().length;
        });
        const uncategorized = gameData.allGames.filter(g => !F.gameCategory(g)).length;
        expect(totalCounted + uncategorized).toBe(gameData.allGames.length);
    });

    it('filtered themes only contain themes from filtered games', () => {
        selectCategory('Slot');
        const activeGames = getActiveGames();
        const gameThemes = new Set(activeGames.map(g => g.theme_consolidated || g.theme_primary).filter(Boolean));
        const activeThemes = getActiveThemes();
        activeThemes.forEach(t => {
            expect(gameThemes.has(t.Theme)).toBe(true);
        });
    });

    it('filtered theme game counts do not exceed total theme game counts', () => {
        selectCategory('Slot');
        const activeThemes = getActiveThemes();
        activeThemes.forEach(at => {
            const fullTheme = gameData.themes.find(t => t.Theme === at.Theme);
            if (fullTheme) {
                expect(at['Game Count']).toBeLessThanOrEqual(fullTheme['Game Count']);
            }
        });
    });

    it('filtered mechanic game counts do not exceed total mechanic game counts', () => {
        selectCategory('Slot');
        const activeMechs = getActiveMechanics();
        activeMechs.forEach(am => {
            const fullMech = gameData.mechanics.find(m => m.Mechanic === am.Mechanic);
            if (fullMech) {
                expect(am['Game Count']).toBeLessThanOrEqual(fullMech['Game Count']);
            }
        });
    });
});

// ── 3. Smart Index recalculation ────────────────────────────────────────

describe('Smart Index recalculation on filter', () => {
    it('filtered themes have valid Smart Index values', () => {
        selectCategory('Slot');
        getActiveThemes().forEach(t => {
            expect(t['Smart Index']).toBeDefined();
            expect(typeof t['Smart Index']).toBe('number');
            expect(t['Smart Index']).toBeGreaterThanOrEqual(0);
        });
    });

    it('filtered mechanics have valid Smart Index values', () => {
        selectCategory('Slot');
        getActiveMechanics().forEach(m => {
            expect(m['Smart Index']).toBeDefined();
            expect(typeof m['Smart Index']).toBe('number');
            expect(m['Smart Index']).toBeGreaterThanOrEqual(0);
        });
    });

    it('themes are sorted by Smart Index descending', () => {
        selectCategory('Slot');
        const themes = getActiveThemes();
        for (let i = 1; i < themes.length; i++) {
            expect(themes[i - 1]['Smart Index']).toBeGreaterThanOrEqual(themes[i]['Smart Index']);
        }
    });
});

// ── 4. Cross-category consistency ───────────────────────────────────────

describe('Cross-category consistency', () => {
    it('switching between categories does not corrupt allGames', () => {
        const originalLength = gameData.allGames.length;
        const firstName = gameData.allGames[0]?.name;

        selectCategory('Slot');
        selectCategory('Table Game');
        selectCategory(null);

        expect(gameData.allGames.length).toBe(originalLength);
        expect(gameData.allGames[0]?.name).toBe(firstName);
    });

    it('switching between categories does not corrupt stored themes', () => {
        const originalThemeCount = gameData.themes.length;
        const firstTheme = gameData.themes[0]?.Theme;

        selectCategory('Slot');
        selectCategory('Table Game');
        selectCategory(null);

        expect(gameData.themes.length).toBe(originalThemeCount);
        expect(gameData.themes[0]?.Theme).toBe(firstTheme);
    });

    it('different categories produce different filtered results', () => {
        selectCategory('Slot');
        const slotCount = getActiveGames().length;

        selectCategory('Table Game');
        const tableCount = getActiveGames().length;

        if (slotCount > 0 && tableCount > 0) {
            expect(slotCount).not.toBe(tableCount);
        }
    });

    it('no game appears in two different category filters', () => {
        const categories = [...new Set(gameData.allGames.map(g => F.gameCategory(g)))].filter(Boolean);
        const seen = new Set();
        categories.forEach(cat => {
            selectCategory(cat);
            getActiveGames().forEach(g => {
                expect(seen.has(g.name)).toBe(false);
                seen.add(g.name);
            });
        });
    });
});
