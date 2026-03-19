/**
 * Tests for the HTML/attribute escaping utility (XSS prevention).
 */
import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeAttr, safeOnclick, sanitizeUrl } from '../../src/lib/sanitize.js';

describe('escapeHtml', () => {
    it('should escape & < > " and single quotes', () => {
        expect(escapeHtml('a & b')).toBe('a &amp; b');
        expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
        expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
        expect(escapeHtml("it's")).toBe('it&#39;s');
    });

    it('should handle combined special chars', () => {
        expect(escapeHtml('<img src="x" onerror="alert(1)">')).toBe(
            '&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;'
        );
    });

    it('should return empty string for null/undefined', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });

    it('should convert numbers to string', () => {
        expect(escapeHtml(42)).toBe('42');
        expect(escapeHtml(0)).toBe('0');
    });

    it('should pass through safe strings unchanged', () => {
        expect(escapeHtml('Hello World')).toBe('Hello World');
        expect(escapeHtml('game-name_123')).toBe('game-name_123');
    });
});

describe('escapeAttr', () => {
    it('should escape attribute-unsafe chars', () => {
        expect(escapeAttr('value"with"quotes')).toBe('value&quot;with&quot;quotes');
        expect(escapeAttr("it's a 'test'")).toBe('it&#39;s a &#39;test&#39;');
    });

    it('should escape HTML tags inside attributes', () => {
        expect(escapeAttr('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;');
    });
});

describe('safeOnclick', () => {
    it('should produce a safe onclick string for simple values', () => {
        const result = safeOnclick('window.showGameDetails', 'Huff N Puff');
        expect(result).toBe("window.showGameDetails('Huff N Puff')");
    });

    it('should escape single quotes in values', () => {
        const result = safeOnclick('fn', "it's");
        expect(result).toContain("\\'");
        expect(result).not.toContain("it's'");
    });

    it('should escape double quotes in values', () => {
        const result = safeOnclick('fn', 'say "hello"');
        expect(result).toContain('\\"');
    });

    it('should escape < and > to prevent HTML injection', () => {
        const result = safeOnclick('fn', '<script>alert(1)</script>');
        expect(result).not.toContain('<script>');
        expect(result).toContain('\\x3c');
        expect(result).toContain('\\x3e');
    });

    it('should handle null/undefined arguments', () => {
        const result = safeOnclick('fn', null);
        expect(result).toBe("fn('')");
    });

    it('should handle multiple arguments', () => {
        const result = safeOnclick('fn', 'theme', 'mechanic');
        expect(result).toBe("fn('theme','mechanic')");
    });

    it('should escape backslashes', () => {
        const result = safeOnclick('fn', 'path\\to\\thing');
        expect(result).toContain('\\\\');
    });
});

describe('sanitizeUrl', () => {
    it('should allow http and https URLs', () => {
        expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
        expect(sanitizeUrl('http://example.com/path')).toBe('http://example.com/path');
    });

    it('should allow relative paths', () => {
        expect(sanitizeUrl('/api/data')).toBe('/api/data');
    });

    it('should block javascript: URLs', () => {
        expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    });

    it('should block data: URLs', () => {
        expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    });

    it('should block vbscript: URLs', () => {
        expect(sanitizeUrl('vbscript:MsgBox("xss")')).toBe('');
    });

    it('should handle null/undefined', () => {
        expect(sanitizeUrl(null)).toBe('');
        expect(sanitizeUrl(undefined)).toBe('');
    });

    it('should trim whitespace', () => {
        expect(sanitizeUrl('  https://example.com  ')).toBe('https://example.com');
    });
});

describe('escapeHtml - control character stripping', () => {
    it('should strip null bytes', () => {
        expect(escapeHtml('hello\x00world')).toBe('helloworld');
    });

    it('should preserve tabs and newlines', () => {
        expect(escapeHtml('line1\nline2\ttab')).toBe('line1\nline2\ttab');
    });
});

describe('XSS attack vectors', () => {
    it('should prevent script injection via escapeHtml', () => {
        const attack = '<script>document.cookie</script>';
        const escaped = escapeHtml(attack);
        expect(escaped).not.toContain('<script>');
        expect(escaped).toContain('&lt;script&gt;');
    });

    it('should prevent event handler injection via escapeHtml', () => {
        const attack = '" onmouseover="alert(1)"';
        const escaped = escapeHtml(attack);
        expect(escaped).not.toContain('" onmouseover');
    });

    it('should prevent onclick breakout via safeOnclick', () => {
        const attack = "'); alert('xss'); ('";
        const result = safeOnclick('fn', attack);
        expect(result).not.toContain("alert('xss')");
    });

    it('should prevent HTML attribute breakout via safeOnclick', () => {
        const attack = '"><img src=x onerror=alert(1)>';
        const result = safeOnclick('fn', attack);
        expect(result).not.toContain('<img');
    });
});
