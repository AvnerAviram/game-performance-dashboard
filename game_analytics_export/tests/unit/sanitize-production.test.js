/**
 * Production-grade tests for sanitize.js
 * Tests: escapeHtml control char stripping, sanitizeUrl, edge cases
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeAttr, sanitizeUrl, safeOnclick } from '../../src/lib/sanitize.js';

describe('escapeHtml - Control Characters', () => {
    it('should strip null bytes', () => {
        expect(escapeHtml('hello\x00world')).toBe('helloworld');
    });

    it('should strip ASCII control chars (0x01-0x08, 0x0E-0x1F)', () => {
        expect(escapeHtml('ab\x01cd\x08ef')).toBe('abcdef');
        expect(escapeHtml('\x0E\x0F\x10')).toBe('');
    });

    it('should preserve tabs, newlines, carriage returns', () => {
        expect(escapeHtml('line1\nline2\ttab\rcarriage')).toBe('line1\nline2\ttab\rcarriage');
    });

    it('should strip DEL character (0x7F)', () => {
        expect(escapeHtml('hello\x7Fworld')).toBe('helloworld');
    });

    it('should handle combined control chars and HTML entities', () => {
        expect(escapeHtml('\x00<script>\x01')).toBe('&lt;script&gt;');
    });
});

describe('escapeHtml - Edge Cases', () => {
    it('should handle null and undefined', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });

    it('should handle numbers and booleans', () => {
        expect(escapeHtml(42)).toBe('42');
        expect(escapeHtml(true)).toBe('true');
    });

    it('should handle objects', () => {
        expect(escapeHtml({})).toBe('[object Object]');
    });

    it('should escape all 5 dangerous characters', () => {
        expect(escapeHtml('&<>"\''))
            .toBe('&amp;&lt;&gt;&quot;&#39;');
    });

    it('should handle empty string', () => {
        expect(escapeHtml('')).toBe('');
    });

    it('should not double-escape', () => {
        expect(escapeHtml('&amp;')).toBe('&amp;amp;');
    });
});

describe('escapeAttr', () => {
    it('should be identical to escapeHtml', () => {
        const inputs = ['test', '<b>bold</b>', '"attr"', "'single'", '&amp;', null, 42];
        inputs.forEach(input => {
            expect(escapeAttr(input)).toBe(escapeHtml(input));
        });
    });
});

describe('sanitizeUrl', () => {
    it('should allow http URLs', () => {
        expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
    });

    it('should allow https URLs', () => {
        expect(sanitizeUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
    });

    it('should allow relative paths starting with /', () => {
        expect(sanitizeUrl('/dashboard')).toBe('/dashboard');
        expect(sanitizeUrl('/api/data/games')).toBe('/api/data/games');
    });

    it('should block javascript: URLs', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    });

    it('should block data: URLs', () => {
        expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('should block vbscript: URLs', () => {
        expect(sanitizeUrl('vbscript:msgbox')).toBe('');
    });

    it('should block file: URLs', () => {
        expect(sanitizeUrl('file:///etc/passwd')).toBe('');
    });

    it('should handle null and undefined', () => {
        expect(sanitizeUrl(null)).toBe('');
        expect(sanitizeUrl(undefined)).toBe('');
    });

    it('should trim whitespace', () => {
        expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
    });

    it('should allow bare relative paths', () => {
        expect(sanitizeUrl('page.html')).toBe('page.html');
    });
});

describe('safeOnclick', () => {
    it('should escape single quotes in arguments', () => {
        const result = safeOnclick('doThing', "it's");
        expect(result).toBe("doThing('it\\'s')");
    });

    it('should escape HTML entities in arguments', () => {
        const result = safeOnclick('fn', '<img onerror=alert(1)>');
        expect(result).toContain('\\x3c');
        expect(result).toContain('\\x3e');
    });

    it('should handle null arguments', () => {
        const result = safeOnclick('fn', null);
        expect(result).toBe("fn('')");
    });

    it('should handle multiple arguments', () => {
        const result = safeOnclick('fn', 'a', 'b', 'c');
        expect(result).toBe("fn('a','b','c')");
    });
});
