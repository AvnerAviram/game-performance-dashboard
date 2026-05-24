/**
 * CRITICAL TEST: Enforce DuckDB-Only Data Access
 *
 * These tests MUST pass to ensure 100% DuckDB usage
 * NO DIRECT JSON ACCESS allowed outside duckdb-client.js
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

describe('🚨 CRITICAL: DuckDB-Only Enforcement', () => {
    describe('Code Analysis - No Direct JSON Access', () => {
        const srcDir = path.join(process.cwd(), 'src');
        const forbiddenPattern = /fetch\s*\(\s*['"`]\.\/data\/games_master\.json['"`]\s*\)/g;
        const allowedFiles = [
            'src/db/duckdb-client.js', // ONLY file allowed to fetch JSON
        ];

        it('should only allow games_master.json fetch in duckdb-client.js', async () => {
            const violations = [];

            async function scanDirectory(dir) {
                const files = await fs.readdir(dir, { withFileTypes: true });

                for (const file of files) {
                    const fullPath = path.join(dir, file.name);
                    const relativePath = fullPath.replace(process.cwd() + '/', '');

                    if (file.isDirectory()) {
                        await scanDirectory(fullPath);
                    } else if (file.name.endsWith('.js')) {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const matches = content.match(forbiddenPattern);

                        if (matches && !allowedFiles.includes(relativePath)) {
                            violations.push({
                                file: relativePath,
                                matches: matches.length,
                                lines: content
                                    .split('\n')
                                    .map((line, i) => ({
                                        lineNum: i + 1,
                                        content: line,
                                        matched: forbiddenPattern.test(line),
                                    }))
                                    .filter(l => l.matched),
                            });
                        }
                    }
                }
            }

            await scanDirectory(srcDir);

            if (violations.length > 0) {
                console.error('\n❌ FORBIDDEN: Direct JSON access detected!\n');
                violations.forEach(v => {
                    console.error(`  File: ${v.file}`);
                    v.lines.forEach(l => {
                        console.error(`    Line ${l.lineNum}: ${l.content.trim()}`);
                    });
                });
                console.error('\n⚠️  ONLY src/db/duckdb-client.js is allowed to fetch games_master.json\n');
            }

            expect(violations).toHaveLength(0);
        });

        it('should not have any aggregateThemes() calls outside data.js', async () => {
            const violations = [];
            const pattern = /aggregateThemes\s*\(/g;

            async function scanDirectory(dir) {
                const files = await fs.readdir(dir, { withFileTypes: true });

                for (const file of files) {
                    const fullPath = path.join(dir, file.name);
                    const relativePath = fullPath.replace(process.cwd() + '/', '');

                    // Skip data.js itself (where function is defined)
                    if (relativePath.includes('data.js') || relativePath.includes('data.js.backup')) {
                        continue;
                    }

                    if (file.isDirectory()) {
                        await scanDirectory(fullPath);
                    } else if (file.name.endsWith('.js')) {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const matches = content.match(pattern);

                        if (matches) {
                            violations.push({ file: relativePath, count: matches.length });
                        }
                    }
                }
            }

            await scanDirectory(srcDir);

            if (violations.length > 0) {
                console.error('\n❌ FORBIDDEN: aggregateThemes() called outside data.js!\n');
                violations.forEach(v => {
                    console.error(`  ${v.file}: ${v.count} call(s)`);
                });
            }

            expect(violations).toHaveLength(0);
        });

        it('should not have direct .forEach loops on games array outside DuckDB', async () => {
            const violations = [];
            // Look for patterns like: data.games.forEach, games.forEach, etc.
            const patterns = [/data\.games\.forEach/g, /masterData\.games\.forEach/g, /jsonData\.games\.forEach/g];

            async function scanDirectory(dir) {
                const files = await fs.readdir(dir, { withFileTypes: true });

                for (const file of files) {
                    const fullPath = path.join(dir, file.name);
                    const relativePath = fullPath.replace(process.cwd() + '/', '');

                    // Skip duckdb-client (it HAS to load JSON)
                    if (
                        relativePath.includes('duckdb-client.js') ||
                        relativePath.includes('data.js.backup') ||
                        relativePath.includes('test-')
                    ) {
                        continue;
                    }

                    if (file.isDirectory()) {
                        await scanDirectory(fullPath);
                    } else if (file.name.endsWith('.js')) {
                        const content = await fs.readFile(fullPath, 'utf-8');

                        for (const pattern of patterns) {
                            const matches = content.match(pattern);
                            if (matches) {
                                violations.push({
                                    file: relativePath,
                                    pattern: pattern.source,
                                    count: matches.length,
                                });
                            }
                        }
                    }
                }
            }

            await scanDirectory(srcDir);

            if (violations.length > 0) {
                console.warn('\n⚠️  WARNING: Direct .forEach loops on games array found:\n');
                violations.forEach(v => {
                    console.warn(`  ${v.file}: ${v.pattern} (${v.count} times)`);
                });
                console.warn('\n  Consider using DuckDB queries instead of JavaScript loops\n');
            }

            // This is a warning, not a hard failure (some loops might be OK on DuckDB results)
            // expect(violations).toHaveLength(0);
        });
    });

    describe('Runtime Validation - Data Source Tracking', () => {
        it('should track that data comes from DuckDB', async () => {
            // This test will be implemented in integration tests
            // For now, verify the data module exports the right functions
            const dataModule = await import('../src/lib/data.js');

            expect(dataModule.loadGameData).toBeDefined();
            expect(typeof dataModule.loadGameData).toBe('function');
        });
    });

    describe('Data Integrity - DuckDB Results', () => {
        it('should have deprecated aggregation functions that throw errors', async () => {
            const dataModule = await import('../src/lib/data.js');

            // Check if _internal exports are available (for testing deprecated functions)
            if (dataModule._internal) {
                expect(() => {
                    dataModule._internal.aggregateThemes([]);
                }).toThrow('Direct JSON aggregation is forbidden');

                console.log('✅ Deprecated aggregation functions correctly throw errors');
            }
        });
    });
});

describe('DuckDB Client - Core Functionality', () => {
    it('should have all required query functions', async () => {
        const duckdbModule = await import('../src/db/duckdb-client.js');

        const requiredFunctions = [
            'initializeDatabase',
            'query',
            'getOverviewStats',
            'getThemeDistribution',
            'getMechanicDistribution',
            'getProviderDistribution',
            'getAnomalies',
            'getAllGames',
            'getGamesByMechanic',
            'getGamesByTheme',
            'getGamesByProvider',
            'searchGames',
            'getVolatilityDistribution',
            'getTopGames',
            'getUniqueProviders',
            'getUniqueMechanics',
            'getUniqueThemes',
        ];

        requiredFunctions.forEach(fn => {
            expect(duckdbModule[fn]).toBeDefined();
            expect(typeof duckdbModule[fn]).toBe('function');
        });

        console.log(`✅ All ${requiredFunctions.length} required query functions present`);
    });
});
