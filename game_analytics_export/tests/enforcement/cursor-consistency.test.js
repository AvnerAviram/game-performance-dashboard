/**
 * Enforcement: Cursor Consistency
 *
 * Every interactive element (onclick handler) must have an explicit cursor class:
 *   - cursor-pointer for clickable actions
 *   - cursor-help for tooltip triggers
 *
 * This prevents inconsistent hover behavior across the UI where some buttons
 * show a pointer and others show the default arrow.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_DIR = path.join(ROOT, 'src');
const PAGES_DIR = path.join(SRC_DIR, 'pages');

const CURSOR_CLASSES = ['cursor-pointer', 'cursor-help', 'cursor-grab', 'cursor-move', 'cursor-default'];
const CURSOR_RE = new RegExp(CURSOR_CLASSES.map(c => c.replace('-', '\\-')).join('|'));

function collectFiles(dir, ext, results = []) {
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectFiles(full, ext, results);
        } else if (entry.name.endsWith(ext)) {
            results.push(full);
        }
    }
    return results;
}

function findOnclickWithoutCursor(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const violations = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue;
        if (!line.includes('onclick=')) continue;

        // event.stopPropagation()-only handlers don't need cursor (parent has it)
        if (/onclick="event\.stopPropagation\(\)"/.test(line)) continue;
        // querySelector strings referencing onclick are not actual elements
        if (/querySelector|querySelectorAll/.test(line)) continue;

        // Look at surrounding context (the element's class attribute may be on a nearby line)
        const context = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)).join(' ');
        if (!CURSOR_RE.test(context)) {
            violations.push({
                file: path.relative(ROOT, filePath),
                line: i + 1,
                text: line.trim().slice(0, 120),
            });
        }
    }
    return violations;
}

describe('Cursor Consistency', () => {
    const jsFiles = collectFiles(path.join(SRC_DIR, 'ui'), '.js');
    const htmlFiles = collectFiles(PAGES_DIR, '.html');
    const allFiles = [...jsFiles, ...htmlFiles];

    it('should have found files to scan', () => {
        expect(allFiles.length).toBeGreaterThan(5);
    });

    it('every onclick element has an explicit cursor class', () => {
        const allViolations = [];
        for (const file of allFiles) {
            allViolations.push(...findOnclickWithoutCursor(file));
        }
        if (allViolations.length > 0) {
            expect.fail(
                `Found ${allViolations.length} onclick element(s) without a cursor class:\n` +
                    allViolations.map(v => `  ${v.file}:${v.line}: ${v.text}`).join('\n') +
                    '\n\nAdd cursor-pointer (clickable) or cursor-help (tooltip) to every onclick element.'
            );
        }
    });
});
