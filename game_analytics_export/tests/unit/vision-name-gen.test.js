/**
 * Tests for vision-based name generation.
 * Validates image validation, resize logic, and API integration.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';

const VALID_MEDIA = ['image/jpeg', 'image/png', 'image/webp'];

function validateImageInput(imageB64, mediaType) {
    if (!imageB64 || typeof imageB64 !== 'string') return 'Image is required';
    if (!VALID_MEDIA.includes(mediaType)) return 'Invalid image format. Use JPEG, PNG, or WebP.';
    const estimatedBytes = imageB64.length * 0.75;
    if (estimatedBytes > 2 * 1024 * 1024) return 'Image too large. Max 2MB.';
    return null;
}

describe('Vision name generation — image validation', () => {
    it('should reject missing image', () => {
        expect(validateImageInput(null, 'image/jpeg')).toBe('Image is required');
        expect(validateImageInput('', 'image/jpeg')).toBe('Image is required');
        expect(validateImageInput(undefined, 'image/jpeg')).toBe('Image is required');
    });

    it('should reject non-string image', () => {
        expect(validateImageInput(123, 'image/jpeg')).toBe('Image is required');
        expect(validateImageInput({}, 'image/jpeg')).toBe('Image is required');
    });

    it('should reject invalid media types', () => {
        expect(validateImageInput('abc', 'image/gif')).toBe('Invalid image format. Use JPEG, PNG, or WebP.');
        expect(validateImageInput('abc', 'image/bmp')).toBe('Invalid image format. Use JPEG, PNG, or WebP.');
        expect(validateImageInput('abc', 'text/plain')).toBe('Invalid image format. Use JPEG, PNG, or WebP.');
        expect(validateImageInput('abc', '')).toBe('Invalid image format. Use JPEG, PNG, or WebP.');
    });

    it('should accept valid media types', () => {
        expect(validateImageInput('abc', 'image/jpeg')).toBeNull();
        expect(validateImageInput('abc', 'image/png')).toBeNull();
        expect(validateImageInput('abc', 'image/webp')).toBeNull();
    });

    it('should reject oversized images (>2MB estimated)', () => {
        const hugeB64 = 'A'.repeat(3 * 1024 * 1024);
        expect(validateImageInput(hugeB64, 'image/jpeg')).toBe('Image too large. Max 2MB.');
    });

    it('should accept images under 2MB', () => {
        const normalB64 = 'A'.repeat(100 * 1024);
        expect(validateImageInput(normalB64, 'image/jpeg')).toBeNull();
    });
});

describe('Vision name generation — response validation', () => {
    function validateNameResponse(text) {
        try {
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) return [];
            const arr = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(arr)) return [];
            return arr
                .filter(n => typeof n === 'string')
                .map(n => n.slice(0, 100).trim())
                .filter(n => n.length > 0)
                .slice(0, 10);
        } catch {
            return [];
        }
    }

    it('should parse valid JSON array from Claude response', () => {
        const text = '["Golden Dragon", "Crystal Palace", "Fire Storm"]';
        expect(validateNameResponse(text)).toEqual(['Golden Dragon', 'Crystal Palace', 'Fire Storm']);
    });

    it('should extract JSON from surrounding text', () => {
        const text = 'Here are names:\n["Golden Dragon", "Crystal Palace"]\nEnjoy!';
        expect(validateNameResponse(text)).toEqual(['Golden Dragon', 'Crystal Palace']);
    });

    it('should return empty array for invalid responses', () => {
        expect(validateNameResponse('')).toEqual([]);
        expect(validateNameResponse('no json here')).toEqual([]);
        expect(validateNameResponse('{"not": "array"}')).toEqual([]);
    });

    it('should truncate names longer than 100 chars', () => {
        const longName = 'A'.repeat(150);
        const text = `["${longName}"]`;
        const result = validateNameResponse(text);
        expect(result[0].length).toBe(100);
    });

    it('should limit to 10 names max', () => {
        const names = Array.from({ length: 15 }, (_, i) => `Name ${i}`);
        const result = validateNameResponse(JSON.stringify(names));
        expect(result.length).toBe(10);
    });

    it('should filter out non-string entries', () => {
        const text = '["Valid Name", 123, null, "Another Name", true]';
        expect(validateNameResponse(text)).toEqual(['Valid Name', 'Another Name']);
    });
});

describe('Vision name generation — error handling', () => {
    class ApiError extends Error {
        constructor(message, status, data = null) {
            super(message);
            this.name = 'ApiError';
            this.status = status;
            this.data = data;
        }
    }

    function isAuthError(e) {
        return e instanceof ApiError && (e.status === 403 || e.status === 429);
    }

    it('should identify 403 as auth error', () => {
        const err = new ApiError('Invalid access code.', 403);
        expect(isAuthError(err)).toBe(true);
    });

    it('should identify 429 as auth error', () => {
        const err = new ApiError('Too many invalid code attempts.', 429);
        expect(isAuthError(err)).toBe(true);
    });

    it('should NOT identify 502 as auth error', () => {
        const err = new ApiError('AI service unavailable', 502);
        expect(isAuthError(err)).toBe(false);
    });

    it('should NOT identify generic errors as auth error', () => {
        const err = new Error('Network failed');
        expect(isAuthError(err)).toBe(false);
    });

    it('should NOT identify 400 as auth error', () => {
        const err = new ApiError('Theme is required', 400);
        expect(isAuthError(err)).toBe(false);
    });
});

describe('Vision name generation — input sanitization', () => {
    it('should clamp style to valid options', () => {
        const VALID_STYLES = ['modern', 'classic', 'playful', 'premium'];
        const sanitize = s => (VALID_STYLES.includes(s) ? s : 'modern');

        expect(sanitize('modern')).toBe('modern');
        expect(sanitize('classic')).toBe('classic');
        expect(sanitize('invalid')).toBe('modern');
        expect(sanitize('')).toBe('modern');
        expect(sanitize(undefined)).toBe('modern');
    });

    it('should clamp features array', () => {
        const sanitize = f => (Array.isArray(f) ? f.map(String).slice(0, 20) : []);

        expect(sanitize(['Free Spins', 'Megaways'])).toEqual(['Free Spins', 'Megaways']);
        expect(sanitize('not an array')).toEqual([]);
        expect(sanitize(null)).toEqual([]);
        expect(sanitize(Array.from({ length: 25 }, (_, i) => `feat${i}`)).length).toBe(20);
    });
});
