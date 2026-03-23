import { describe, it, expect } from 'vitest';
import {
    MechanicCategory,
    VALID_MECHANICS,
    INVALID_MECHANICS,
    MECHANIC_ALIASES,
    isValidMechanic,
    getMechanicDefinition,
    getValidMechanicNames,
    getMechanicsByCategory,
    getMechanicFullInfo,
    createTooltipsObject,
} from '../../src/config/mechanics.js';

describe('mechanics.js exports', () => {
    it('should export MechanicCategory enum with 4 categories', () => {
        expect(MechanicCategory.BONUS_FEATURES).toBe('BONUS_FEATURES');
        expect(MechanicCategory.REEL_MODIFIERS).toBe('REEL_MODIFIERS');
        expect(MechanicCategory.SYMBOL_FEATURES).toBe('SYMBOL_FEATURES');
        expect(MechanicCategory.WIN_MECHANICS).toBe('WIN_MECHANICS');
        expect(Object.keys(MechanicCategory)).toHaveLength(4);
    });

    it('should export VALID_MECHANICS with all 23 + extras', () => {
        expect(Object.keys(VALID_MECHANICS).length).toBeGreaterThanOrEqual(23);
        expect(VALID_MECHANICS['Free Spins']).toBeDefined();
        expect(VALID_MECHANICS['Hold & Win']).toBeDefined();
        expect(VALID_MECHANICS['Megaways']).toBeDefined();
        expect(VALID_MECHANICS['Multipliers']).toBeDefined();
    });

    it('every valid mechanic should have required fields', () => {
        for (const [name, def] of Object.entries(VALID_MECHANICS)) {
            expect(def.id, `${name}.id`).toBeTruthy();
            expect(def.name, `${name}.name`).toBe(name);
            expect(def.description, `${name}.description`).toBeTruthy();
            expect(def.category, `${name}.category`).toBeTruthy();
            expect(def.isValid, `${name}.isValid`).toBe(true);
            expect(def.examples, `${name}.examples`).toBeInstanceOf(Array);
            expect(def.examples.length, `${name}.examples count`).toBeGreaterThan(0);
        }
    });

    it('every invalid mechanic should have reason and isValid=false', () => {
        for (const [name, def] of Object.entries(INVALID_MECHANICS)) {
            expect(def.reason, `${name}.reason`).toBeTruthy();
            expect(def.isValid, `${name}.isValid`).toBe(false);
        }
    });

    it('every alias should map to a valid mechanic', () => {
        for (const [alias, target] of Object.entries(MECHANIC_ALIASES)) {
            expect(VALID_MECHANICS[target], `Alias "${alias}" -> "${target}" not found`).toBeDefined();
        }
    });
});

describe('isValidMechanic', () => {
    it('returns true for valid mechanic names', () => {
        expect(isValidMechanic('Free Spins')).toBe(true);
        expect(isValidMechanic('Hold & Win')).toBe(true);
        expect(isValidMechanic('Cascading Reels')).toBe(true);
    });

    it('returns true for aliases', () => {
        expect(isValidMechanic('Hold & Spin')).toBe(true);
        expect(isValidMechanic('Avalanche')).toBe(true);
        expect(isValidMechanic('Cash Collect')).toBe(true);
    });

    it('returns false for invalid/unknown names', () => {
        expect(isValidMechanic('Wild')).toBe(false);
        expect(isValidMechanic('Nonsense Mechanic')).toBe(false);
        expect(isValidMechanic('')).toBe(false);
    });
});

describe('getMechanicDefinition', () => {
    it('returns definition for valid mechanic', () => {
        const def = getMechanicDefinition('Free Spins');
        expect(def).not.toBeNull();
        expect(def.name).toBe('Free Spins');
        expect(def.isValid).toBe(true);
    });

    it('resolves aliases to the real mechanic', () => {
        const def = getMechanicDefinition('Avalanche');
        expect(def).not.toBeNull();
        expect(def.name).toBe('Cascading Reels');
    });

    it('returns invalid mechanic definition', () => {
        const def = getMechanicDefinition('Wild');
        expect(def).not.toBeNull();
        expect(def.isValid).toBe(false);
        expect(def.reason).toBeTruthy();
    });

    it('returns null for unknown mechanic', () => {
        expect(getMechanicDefinition('Unknown Mechanic')).toBeNull();
    });

    it('strips parentheses from mechanic names', () => {
        const def = getMechanicDefinition('Free Spins (10 spins)');
        expect(def).not.toBeNull();
        expect(def.name).toBe('Free Spins');
    });

    it('returns null for unknown name with parentheses', () => {
        expect(getMechanicDefinition('Nonexistent (thing)')).toBeNull();
    });
});

describe('getValidMechanicNames', () => {
    it('returns array of mechanic names', () => {
        const names = getValidMechanicNames();
        expect(names).toBeInstanceOf(Array);
        expect(names.length).toBeGreaterThanOrEqual(23);
        expect(names).toContain('Free Spins');
        expect(names).toContain('Megaways');
    });
});

describe('getMechanicsByCategory', () => {
    it('returns bonus features', () => {
        const bonusFeats = getMechanicsByCategory(MechanicCategory.BONUS_FEATURES);
        expect(bonusFeats.length).toBeGreaterThan(0);
        bonusFeats.forEach(m => expect(m.category).toBe(MechanicCategory.BONUS_FEATURES));
    });

    it('returns reel modifiers', () => {
        const reelMods = getMechanicsByCategory(MechanicCategory.REEL_MODIFIERS);
        expect(reelMods.length).toBeGreaterThan(0);
        reelMods.forEach(m => expect(m.category).toBe(MechanicCategory.REEL_MODIFIERS));
    });

    it('returns empty for invalid category', () => {
        expect(getMechanicsByCategory('NONEXISTENT')).toHaveLength(0);
    });
});

describe('getMechanicFullInfo', () => {
    it('returns full info for valid mechanic', () => {
        const info = getMechanicFullInfo('Hold & Win');
        expect(info).not.toBeNull();
        expect(info.name).toBe('Hold & Win');
        expect(info.description).toBeTruthy();
        expect(info.whatItDoes).toBeTruthy();
        expect(info.examples).toBeInstanceOf(Array);
        expect(info.category).toBe(MechanicCategory.BONUS_FEATURES);
    });

    it('returns null for invalid mechanic', () => {
        expect(getMechanicFullInfo('Wild')).toBeNull();
    });

    it('returns null for unknown mechanic', () => {
        expect(getMechanicFullInfo('Unknown')).toBeNull();
    });

    it('resolves alias to full info', () => {
        const info = getMechanicFullInfo('Avalanche');
        expect(info).not.toBeNull();
        expect(info.name).toBe('Cascading Reels');
    });
});

describe('createTooltipsObject', () => {
    it('returns tooltips for all valid mechanics', () => {
        const tips = createTooltipsObject();
        expect(Object.keys(tips).length).toBeGreaterThanOrEqual(Object.keys(VALID_MECHANICS).length);
        expect(tips['Free Spins']).toContain('scatter symbols');
    });

    it('includes alias tooltips', () => {
        const tips = createTooltipsObject();
        expect(tips['Avalanche']).toBeTruthy();
        expect(tips['Avalanche']).toContain(VALID_MECHANICS['Cascading Reels'].description);
    });

    it('includes example text in tooltips', () => {
        const tips = createTooltipsObject();
        expect(tips['Free Spins']).toContain('Examples:');
    });
});
