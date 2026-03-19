/**
 * Tests for parseFeatures utility — centralized JSON feature parsing.
 */
import { describe, it, expect } from 'vitest';
import { parseFeatures } from '../../src/lib/parse-features.js';

describe('parseFeatures', () => {
    it('should parse a valid JSON string array', () => {
        expect(parseFeatures('["Free Spins","Hold and Spin"]')).toEqual(['Free Spins', 'Hold and Spin']);
    });

    it('should return the array as-is when given an array', () => {
        expect(parseFeatures(['Wild Reels'])).toEqual(['Wild Reels']);
    });

    it('should return empty array for null/undefined', () => {
        expect(parseFeatures(null)).toEqual([]);
        expect(parseFeatures(undefined)).toEqual([]);
    });

    it('should return empty array for empty string', () => {
        expect(parseFeatures('')).toEqual([]);
    });

    it('should return empty array for malformed JSON', () => {
        expect(parseFeatures('{invalid}')).toEqual([]);
        expect(parseFeatures('not json')).toEqual([]);
    });

    it('should return empty array for non-array JSON', () => {
        expect(parseFeatures('{"key":"value"}')).toEqual([]);
        expect(parseFeatures('"just a string"')).toEqual([]);
    });

    it('should handle empty JSON array', () => {
        expect(parseFeatures('[]')).toEqual([]);
    });

    it('should handle numbers and booleans gracefully', () => {
        expect(parseFeatures(42)).toEqual([]);
        expect(parseFeatures(true)).toEqual([]);
    });
});
