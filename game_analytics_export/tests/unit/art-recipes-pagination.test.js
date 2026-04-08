/**
 * Tests for Art Recipes pagination behaviour.
 * Validates that the renderer uses the correct initial-show and page-size
 * constants and generates the expected progressive "Show more" wiring.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ART_RENDERER = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../src/ui/renderers/art-renderer.js'
);
const src = fs.readFileSync(ART_RENDERER, 'utf-8');

describe('Art Recipes pagination', () => {
    it('defaults to showing 10 recipes initially', () => {
        expect(src).toMatch(/const INITIAL_SHOW\s*=\s*10/);
    });

    it('reveals 20 more recipes per click', () => {
        expect(src).toMatch(/const PAGE_SIZE\s*=\s*20/);
    });

    it('uses progressive reveal (visible += PAGE_SIZE), not show-all', () => {
        expect(src).toContain('visible + PAGE_SIZE');
    });

    it('updates button text with remaining count', () => {
        expect(src).toMatch(/remaining/);
        expect(src).toContain('btn.textContent');
    });

    it('removes button wrapper when no items remain', () => {
        expect(src).toMatch(/remaining\s*<=\s*0/);
        expect(src).toContain('wrap.remove()');
    });
});
