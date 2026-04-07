/**
 * Enforcement: No Unreferenced Renderer Modules
 *
 * Every .js file in src/ui/renderers/ must be imported by at least one other file.
 * This prevents dead code from accumulating and shipping unused modules.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const RENDERERS_DIR = path.join(SRC_DIR, 'ui', 'renderers');

function getAllJsFiles(dir, base = '') {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = path.join(base, entry.name);
        if (entry.isDirectory()) {
            results.push(...getAllJsFiles(path.join(dir, entry.name), rel));
        } else if (entry.name.endsWith('.js')) {
            results.push(rel);
        }
    }
    return results;
}

describe('No Dead Renderer Modules', () => {
    it('every renderer module is imported by at least one file in src/', () => {
        const rendererFiles = fs.readdirSync(RENDERERS_DIR).filter(f => f.endsWith('.js'));
        const allSrcFiles = getAllJsFiles(SRC_DIR);
        const allContent = allSrcFiles.map(rel => fs.readFileSync(path.join(SRC_DIR, rel), 'utf-8')).join('\n');

        const orphans = [];
        for (const renderer of rendererFiles) {
            const baseName = renderer.replace('.js', '');
            const importPattern = new RegExp(`['"].*/${baseName}(\\.js)?['"]`);
            if (!importPattern.test(allContent)) {
                orphans.push(renderer);
            }
        }

        if (orphans.length > 0) {
            expect.fail(
                `Found ${orphans.length} unreferenced renderer module(s):\n` +
                    orphans.map(f => `  src/ui/renderers/${f}`).join('\n') +
                    '\n\nRemove dead modules or add an import.'
            );
        }
    });
});
