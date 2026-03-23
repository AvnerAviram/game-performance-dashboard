import { describe, test, expect, beforeAll } from 'vitest';

/**
 * Duplicate Detection Tests
 *
 * CRITICAL: This test catches data integrity issues that cause UI bugs.
 * The "Toymaker Magic" duplicate bug was caused by having 39 duplicate games!
 */

describe('Data Integrity: Duplicate Detection', () => {
    let gamesData;
    let games;

    beforeAll(async () => {
        const response = await fetch('/data/games_dashboard.json');
        gamesData = await response.json();
        games = Array.isArray(gamesData) ? gamesData : gamesData.games || [];
    });

    test('should NOT have duplicate game names', () => {
        const nameCount = {};
        games.forEach(g => {
            nameCount[g.name] = (nameCount[g.name] || 0) + 1;
        });

        const duplicates = Object.entries(nameCount)
            .filter(([name, count]) => count > 1)
            .sort((a, b) => b[1] - a[1]);

        if (duplicates.length > 0) {
            console.error('❌ DUPLICATE GAMES FOUND:', duplicates.length);
            duplicates.slice(0, 10).forEach(([name, count]) => {
                console.error(`  ${name}: ${count} times`);
                const entries = games.filter(g => g.name === name);
                entries.forEach(e => console.error(`    - ID: ${e.id}`));
            });
            console.error('\nThis causes UI bugs like doubled content in side panels!');
        }

        expect(duplicates).toHaveLength(0);
    });

    test('should NOT have duplicate game IDs', () => {
        const idCount = {};
        games.forEach(g => {
            if (g.id) {
                idCount[g.id] = (idCount[g.id] || 0) + 1;
            }
        });

        const duplicates = Object.entries(idCount).filter(([id, count]) => count > 1);

        if (duplicates.length > 0) {
            console.error('❌ DUPLICATE IDS FOUND:', duplicates.length);
            duplicates.forEach(([id, count]) => {
                console.error(`  ${id}: ${count} times`);
            });
        }

        expect(duplicates).toHaveLength(0);
    });

    test('should NOT have games with identical data (true duplicates)', () => {
        const signatures = new Map();
        const trueDuplicates = [];

        games.forEach((game, index) => {
            const signature = `${game.name}|${game.provider ?? game.studio ?? game.provider?.studio}|${game.theme_primary ?? game.theme?.consolidated}|${game.mechanic_primary ?? game.mechanic?.primary}`;

            if (signatures.has(signature)) {
                const original = signatures.get(signature);
                trueDuplicates.push({
                    name: game.name,
                    original_id: original.id,
                    original_index: original.index,
                    duplicate_id: game.id,
                    duplicate_index: index,
                });
            } else {
                signatures.set(signature, { id: game.id, index });
            }
        });

        if (trueDuplicates.length > 0) {
            console.error('❌ TRUE DUPLICATES (same name + provider + theme + mechanic):');
            trueDuplicates.slice(0, 10).forEach(dup => {
                console.error(`  ${dup.name}`);
                console.error(`    Original: ${dup.original_id} (index ${dup.original_index})`);
                console.error(`    Duplicate: ${dup.duplicate_id} (index ${dup.duplicate_index})`);
            });
        }

        expect(trueDuplicates).toHaveLength(0);
    });

    test('should report total games after deduplication', () => {
        const uniqueNames = new Set(games.map(g => g.name));
        const duplicateCount = games.length - uniqueNames.size;

        console.log('📊 Deduplication Report:');
        console.log(`  Total games in file: ${games.length}`);
        console.log(`  Unique game names: ${uniqueNames.size}`);
        console.log(`  Duplicates to remove: ${duplicateCount}`);

        if (duplicateCount > 0) {
            console.warn(`⚠️  You have ${duplicateCount} duplicate entries that should be removed!`);
        }

        expect(games.length).toBe(uniqueNames.size);
    });

    test('game count should be consistent', () => {
        const uniqueNames = new Set(games.map(g => g.name));
        const actualUniqueCount = uniqueNames.size;

        console.log('Total games:', games.length);
        console.log('Unique names:', actualUniqueCount);

        expect(games.length).toBe(actualUniqueCount);
    });
});

describe('Data Integrity: Duplicate Prevention Recommendations', () => {
    test('should suggest deduplication strategy', () => {
        console.log('\n📋 DEDUPLICATION STRATEGY:');
        console.log('  1. Keep the entry with more complete data');
        console.log('  2. If data is identical, keep the first occurrence');
        console.log('  3. Update metadata.total_games to reflect unique count');
        console.log('  4. Re-run this test to verify');
        expect(true).toBe(true);
    });
});
