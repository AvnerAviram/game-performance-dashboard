import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stripParenthetical, wrapLabel, modernColors } from '../../src/ui/chart-utils.js';

describe('chart-utils', () => {
    describe('stripParenthetical', () => {
        it('removes trailing parenthetical from string', () => {
            expect(stripParenthetical('Hold & Win (Cash Eruption Bonus)')).toBe('Hold & Win');
        });

        it('returns original string when no parenthetical', () => {
            expect(stripParenthetical('Free Spins')).toBe('Free Spins');
        });

        it('returns non-string values unchanged', () => {
            expect(stripParenthetical(42)).toBe(42);
            expect(stripParenthetical(null)).toBe(null);
        });

        it('handles empty parenthetical', () => {
            expect(stripParenthetical('Some Label ()')).toBe('Some Label');
        });

        it('only strips trailing parenthetical', () => {
            expect(stripParenthetical('(prefix) Main Label')).toBe('(prefix) Main Label');
        });
    });

    describe('wrapLabel', () => {
        it('returns short strings unchanged', () => {
            expect(wrapLabel('Short', 20)).toBe('Short');
        });

        it('wraps long strings into multiple lines', () => {
            const result = wrapLabel('This Is A Very Long Label Name', 12);
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(1);
            result.forEach(line => expect(line.length).toBeLessThanOrEqual(15));
        });

        it('returns null/undefined for falsy input', () => {
            expect(wrapLabel('', 10)).toBe('');
            expect(wrapLabel(null, 10)).toBe(null);
        });

        it('caps at 4 lines max', () => {
            const result = wrapLabel('A B C D E F G H I J K L M', 3);
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeLessThanOrEqual(4);
        });

        it('splits on slashes as well as spaces', () => {
            const result = wrapLabel('Hold/Spin/Feature/Bonus', 8);
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(1);
        });
    });

    describe('modernColors', () => {
        it('has 8 color entries', () => {
            expect(Object.keys(modernColors)).toHaveLength(8);
        });

        it('each color has start and end hex values', () => {
            Object.values(modernColors).forEach(color => {
                expect(color.start).toMatch(/^#[0-9a-fA-F]{6}$/);
                expect(color.end).toMatch(/^#[0-9a-fA-F]{6}$/);
            });
        });
    });
});
