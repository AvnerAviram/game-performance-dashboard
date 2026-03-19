import { describe, it, expect } from 'vitest';
import { collapsibleList } from '../../src/ui/collapsible-list.js';

describe('collapsibleList', () => {
    it('returns listHtml unchanged when totalCount <= initialShow', () => {
        const html = '<div>item</div>';
        expect(collapsibleList(html, 3, 5)).toBe(html);
        expect(collapsibleList(html, 5, 5)).toBe(html);
    });

    it('wraps content with toggle button when totalCount > initialShow', () => {
        const html = '<div>items</div>';
        const result = collapsibleList(html, 10, 5, 'test-id');
        expect(result).toContain('test-id-wrap');
        expect(result).toContain('test-id-items');
        expect(result).toContain('test-id-btn');
        expect(result).toContain('Show all 10 items');
        expect(result).toContain('window._toggleCL');
    });

    it('generates a random uid when no containerId provided', () => {
        const result = collapsibleList('<div/>', 10, 5);
        expect(result).toMatch(/cl-[a-z0-9]+/);
    });

    it('passes correct arguments to _toggleCL', () => {
        const result = collapsibleList('<div/>', 15, 3, 'my-list');
        expect(result).toContain("window._toggleCL('my-list',3,15)");
    });
});
