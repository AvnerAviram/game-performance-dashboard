import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const root = resolve(__dirname, '../..');
const repoRoot = resolve(root, '..');

describe('Coding Standards: Configuration files exist and are correct', () => {
    it('.editorconfig exists with correct settings', () => {
        const filepath = resolve(root, '.editorconfig');
        expect(existsSync(filepath), '.editorconfig missing').toBe(true);

        const content = readFileSync(filepath, 'utf8');
        expect(content).toContain('indent_style = space');
        expect(content).toContain('indent_size = 4');
        expect(content).toContain('end_of_line = lf');
        expect(content).toContain('charset = utf-8');
        expect(content).toContain('trim_trailing_whitespace = true');
        expect(content).toContain('insert_final_newline = true');
    });

    it('.prettierrc exists with correct settings', () => {
        const filepath = resolve(root, '.prettierrc');
        expect(existsSync(filepath), '.prettierrc missing').toBe(true);

        const config = JSON.parse(readFileSync(filepath, 'utf8'));
        expect(config.singleQuote).toBe(true);
        expect(config.semi).toBe(true);
        expect(config.tabWidth).toBe(4);
        expect(config.printWidth).toBe(120);
        expect(config.trailingComma).toBe('es5');
    });

    it('.prettierignore exists and excludes dist and generated files', () => {
        const filepath = resolve(root, '.prettierignore');
        expect(existsSync(filepath), '.prettierignore missing').toBe(true);

        const content = readFileSync(filepath, 'utf8');
        expect(content).toContain('dist/');
        expect(content).toContain('node_modules/');
        expect(content).toContain('coverage/');
        expect(content).toContain('src/output.css');
    });

    it('.editorconfig and .prettierrc are consistent (indent)', () => {
        const editorconfig = readFileSync(resolve(root, '.editorconfig'), 'utf8');
        const prettierrc = JSON.parse(readFileSync(resolve(root, '.prettierrc'), 'utf8'));

        const ecIndentSize = editorconfig.match(/^indent_size\s*=\s*(\d+)/m);
        expect(ecIndentSize).not.toBeNull();
        expect(parseInt(ecIndentSize[1])).toBe(prettierrc.tabWidth);

        expect(editorconfig).toContain('indent_style = space');
    });

    it('eslint.config.js includes eslint-config-prettier', () => {
        const filepath = resolve(root, 'eslint.config.js');
        expect(existsSync(filepath), 'eslint.config.js missing').toBe(true);

        const content = readFileSync(filepath, 'utf8');
        expect(content).toContain('eslint-config-prettier');
        expect(content).toContain('prettierConfig');
    });

    it('package.json has format and format:check scripts', () => {
        const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
        expect(pkg.scripts.format).toBeTruthy();
        expect(pkg.scripts['format:check']).toBeTruthy();
        expect(pkg.scripts.format).toContain('prettier --write');
        expect(pkg.scripts['format:check']).toContain('prettier --check');
    });

    it('package.json has prettier and eslint-config-prettier as devDependencies', () => {
        const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
        expect(pkg.devDependencies.prettier).toBeTruthy();
        expect(pkg.devDependencies['eslint-config-prettier']).toBeTruthy();
    });
});

describe('Coding Standards: Cursor rule exists', () => {
    it('.cursor/rules/coding-standards.mdc exists with alwaysApply', () => {
        const filepath = resolve(repoRoot, '.cursor/rules/coding-standards.mdc');
        expect(existsSync(filepath), 'coding-standards.mdc missing').toBe(true);

        const content = readFileSync(filepath, 'utf8');
        expect(content).toContain('alwaysApply: true');
    });

    it('coding-standards rule covers key conventions', () => {
        const content = readFileSync(resolve(repoRoot, '.cursor/rules/coding-standards.mdc'), 'utf8');
        expect(content).toContain('F.xxx(game)');
        expect(content).toContain('escapeHtml');
        expect(content).toContain('safeOnclick');
        expect(content).toContain('page-container');
        expect(content).toContain('cursor-help');
    });
});

describe('Coding Standards: Prettier formatting check', () => {
    it('all source files pass prettier --check', () => {
        try {
            execSync('npx prettier --check "src/**/*.{js,html,css}" "server/**/*.cjs"', {
                cwd: root,
                encoding: 'utf8',
                stdio: 'pipe',
            });
        } catch (e) {
            const output = (e.stdout || '') + (e.stderr || '');
            throw new Error('Prettier formatting issues found:\n' + output);
        }
    });
});
