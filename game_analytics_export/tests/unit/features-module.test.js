/**
 * Tests for the shared features module.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CANONICAL_FEATURES, SHORT_FEATURE_LABELS, buildFeatureColorMap, getFeatureColor } from '../../src/lib/features.js';

describe('Features Module', () => {
    describe('CANONICAL_FEATURES', () => {
        it('has 11 entries', () => {
            expect(CANONICAL_FEATURES).toHaveLength(11);
        });

        it('includes all expected features', () => {
            ['Cash On Reels', 'Free Spins', 'Hold and Spin', 'Wild Reels'].forEach(f => {
                expect(CANONICAL_FEATURES).toContain(f);
            });
        });
    });

    describe('SHORT_FEATURE_LABELS', () => {
        it('maps every canonical feature to a short label', () => {
            CANONICAL_FEATURES.forEach(f => {
                expect(SHORT_FEATURE_LABELS[f]).toBeDefined();
                expect(typeof SHORT_FEATURE_LABELS[f]).toBe('string');
            });
        });

        it('uses full canonical names', () => {
            expect(SHORT_FEATURE_LABELS['Cash On Reels']).toBe('Cash On Reels');
            expect(SHORT_FEATURE_LABELS['Hold and Spin']).toBe('Hold & Spin');
            expect(SHORT_FEATURE_LABELS['Static Jackpot']).toBe('Jackpot');
        });

        it('keeps short names as-is', () => {
            expect(SHORT_FEATURE_LABELS['Wheel']).toBe('Wheel');
            expect(SHORT_FEATURE_LABELS['Free Spins']).toBe('Free Spins');
        });
    });

    describe('getFeatureColor', () => {
        it('returns a color string for known features', () => {
            const color = getFeatureColor('Free Spins');
            expect(color).toMatch(/^rgba\(/);
        });

        it('returns a fallback color for unknown features', () => {
            const color = getFeatureColor('Unknown Feature XYZ');
            expect(color).toMatch(/^rgba\(/);
        });
    });

    describe('buildFeatureColorMap', () => {
        it('maps features to colors', () => {
            const map = buildFeatureColorMap(['A', 'B', 'C']);
            expect(Object.keys(map)).toHaveLength(3);
            Object.values(map).forEach(c => expect(c).toMatch(/^rgba\(/));
        });

        it('assigns different colors to different features', () => {
            const map = buildFeatureColorMap(['A', 'B']);
            expect(map['A']).not.toBe(map['B']);
        });
    });
});
