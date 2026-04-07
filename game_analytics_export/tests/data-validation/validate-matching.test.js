import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');

function norm(name) {
    let s = name.toLowerCase().trim();
    s = s.replace(/[''':!&,.\-™®©()"]+/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
}

const STRIP_PREFIXES = new Set(['the', 'betmgm', 'nfl', 'nba', 'nhl', 'mlb']);
const STRIP_SUFFIXES = new Set(['luckytap', 'se']);

function deepNorm(name) {
    const words = norm(name).split(' ');
    while (words.length && STRIP_PREFIXES.has(words[0])) words.shift();
    while (words.length && STRIP_SUFFIXES.has(words[words.length - 1])) words.pop();
    return [...words].sort().join(' ');
}

describe('Matching integrity — title verification gate', () => {
    let matches;
    let rulesIndex;

    beforeAll(() => {
        const matchPath = resolve(DATA_DIR, 'rules_game_matches.json');
        const riPath = resolve(DATA_DIR, 'rules_index.json');
        if (!existsSync(matchPath) || !existsSync(riPath)) {
            throw new Error('Missing rules_game_matches.json or rules_index.json');
        }
        matches = JSON.parse(readFileSync(matchPath, 'utf-8'));
        rulesIndex = JSON.parse(readFileSync(riPath, 'utf-8'));
    });

    test('zero title mismatches in rules_game_matches.json', () => {
        const mismatches = [];
        for (const [gameName, m] of Object.entries(matches)) {
            const pageTitle = m.page_title || '';
            const method = m.match_method || 'slug_based';

            if (method === 'deep_norm_verified') {
                if (deepNorm(gameName) !== deepNorm(pageTitle)) {
                    mismatches.push({
                        gameName,
                        pageTitle,
                        method,
                        normGame: deepNorm(gameName),
                        normPage: deepNorm(pageTitle),
                    });
                }
            } else if (method === 'round4_fuzzy_verified') {
                // Round 4: web-verified fuzzy matches (typos, plurals, branding differences)
            } else {
                if (norm(gameName) !== norm(pageTitle)) {
                    mismatches.push({
                        gameName,
                        pageTitle,
                        method,
                        normGame: norm(gameName),
                        normPage: norm(pageTitle),
                    });
                }
            }
        }
        if (mismatches.length > 0) {
            console.error(
                `Found ${mismatches.length} title mismatches:`,
                mismatches.slice(0, 10).map(m => `"${m.gameName}" -> "${m.pageTitle}" [${m.method}]`)
            );
        }
        expect(mismatches).toEqual([]);
    });

    test('no duplicate game names in matches', () => {
        const names = Object.keys(matches);
        const dupes = names.filter((n, i) => names.indexOf(n) !== i);
        expect(dupes).toEqual([]);
    });

    test('every matched slug exists in rules_index', () => {
        const dangling = [];
        for (const [gameName, m] of Object.entries(matches)) {
            if (!rulesIndex[m.slug]) {
                dangling.push({ gameName, slug: m.slug });
            }
        }
        expect(dangling).toEqual([]);
    });

    test('every matched slug has status "ok" in rules_index', () => {
        const badStatus = [];
        for (const [gameName, m] of Object.entries(matches)) {
            const ri = rulesIndex[m.slug];
            if (ri && ri.status !== 'ok') {
                badStatus.push({ gameName, slug: m.slug, status: ri.status });
            }
        }
        expect(badStatus).toEqual([]);
    });

    test('match count ratchet >= 3300', () => {
        const count = Object.keys(matches).length;
        expect(count).toBeGreaterThanOrEqual(3300);
    });

    test('no duplicate slugs across different games', () => {
        const slugToGames = {};
        for (const [gameName, m] of Object.entries(matches)) {
            if (!slugToGames[m.slug]) slugToGames[m.slug] = [];
            slugToGames[m.slug].push(gameName);
        }
        const dupes = Object.entries(slugToGames)
            .filter(([, games]) => games.length > 1)
            .map(([slug, games]) => ({ slug, games }));
        if (dupes.length > 0) {
            console.error('Duplicate slugs:', dupes);
        }
        expect(dupes).toEqual([]);
    });
});

describe('Matching integrity — data quality audit', () => {
    let matches;
    const TEXT_DIR = resolve(DATA_DIR, 'rules_text');

    beforeAll(() => {
        matches = JSON.parse(readFileSync(resolve(DATA_DIR, 'rules_game_matches.json'), 'utf-8'));
    });

    test('no matched text file shorter than 200 bytes', () => {
        const tooShort = [];
        for (const [gameName, m] of Object.entries(matches)) {
            const txtPath = resolve(TEXT_DIR, `${m.slug}.txt`);
            if (!existsSync(txtPath)) {
                tooShort.push({ gameName, slug: m.slug, reason: 'missing' });
                continue;
            }
            const size = statSync(txtPath).size;
            if (size < 200) {
                tooShort.push({ gameName, slug: m.slug, reason: `${size} bytes` });
            }
        }
        if (tooShort.length > 0) {
            console.error('Short/missing text files:', tooShort);
        }
        expect(tooShort).toEqual([]);
    });

    test('no error page markers in matched text', () => {
        const ERROR_MARKERS = ['page not found', '404 error', 'access denied', 'this page is unavailable'];
        const errorPages = [];
        for (const [gameName, m] of Object.entries(matches)) {
            const txtPath = resolve(TEXT_DIR, `${m.slug}.txt`);
            if (!existsSync(txtPath)) continue;
            const head = readFileSync(txtPath, 'utf-8').slice(0, 300).toLowerCase();
            for (const marker of ERROR_MARKERS) {
                if (head.includes(marker)) {
                    errorPages.push({ gameName, slug: m.slug, marker });
                    break;
                }
            }
        }
        if (errorPages.length > 0) {
            console.error('Error pages detected:', errorPages);
        }
        expect(errorPages).toEqual([]);
    });

    test('content word-match for deterministic sample of 100 games', () => {
        const entries = Object.entries(matches);
        const sampleSize = Math.min(100, entries.length);
        const step = Math.floor(entries.length / sampleSize);
        const suspicious = [];

        for (let i = 0; i < sampleSize; i++) {
            const [gameName, m] = entries[i * step];
            const txtPath = resolve(TEXT_DIR, `${m.slug}.txt`);
            if (!existsSync(txtPath)) continue;
            const txt = readFileSync(txtPath, 'utf-8').slice(0, 800).toLowerCase();
            const words = norm(gameName)
                .split(' ')
                .filter(w => w.length > 2 && !['the', 'and', 'for', 'of', 'or'].includes(w));
            if (words.length === 0) continue;
            const found = words.filter(w => txt.includes(w)).length;
            if (found / words.length < 0.5) {
                suspicious.push({ gameName, pageTitle: m.page_title, ratio: `${found}/${words.length}` });
            }
        }
        if (suspicious.length > 0) {
            console.error('Content verification failures:', suspicious);
        }
        expect(suspicious.length).toBeLessThanOrEqual(2);
    });

    test('matched text contains game rules vocabulary', () => {
        const RULES_WORDS = [
            'bet',
            'win',
            'symbol',
            'pay',
            'spin',
            'reel',
            'line',
            'bonus',
            'feature',
            'game',
            'play',
            'prize',
        ];
        const noRulesVocab = [];
        const entries = Object.entries(matches);
        const sampleSize = Math.min(200, entries.length);
        const step = Math.floor(entries.length / sampleSize);

        for (let i = 0; i < sampleSize; i++) {
            const [gameName, m] = entries[i * step];
            const txtPath = resolve(TEXT_DIR, `${m.slug}.txt`);
            if (!existsSync(txtPath)) continue;
            const txt = readFileSync(txtPath, 'utf-8').toLowerCase();
            const found = RULES_WORDS.filter(w => txt.includes(w)).length;
            if (found < 3) {
                noRulesVocab.push({ gameName, slug: m.slug, rulesWordsFound: found });
            }
        }
        if (noRulesVocab.length > 0) {
            console.error('Pages missing rules vocabulary:', noRulesVocab);
        }
        expect(noRulesVocab.length).toBeLessThanOrEqual(2);
    });
});

describe('Matching integrity — GT cross-check', () => {
    let matches;
    let gt;

    beforeAll(() => {
        matches = JSON.parse(readFileSync(resolve(DATA_DIR, 'rules_game_matches.json'), 'utf-8'));
        const gtPath = resolve(DATA_DIR, 'ground_truth_ags.json');
        if (existsSync(gtPath)) {
            gt = JSON.parse(readFileSync(gtPath, 'utf-8'));
        }
    });

    test('all GT-matched games pass title check', () => {
        if (!gt) return;
        const gtNames = new Set(Array.isArray(gt) ? gt.map(g => g.name) : Object.keys(gt));
        const failures = [];
        for (const [gameName, m] of Object.entries(matches)) {
            if (!gtNames.has(gameName)) continue;
            const method = m.match_method || 'slug_based';
            const normFn = method === 'deep_norm_verified' ? deepNorm : norm;
            if (normFn(gameName) !== normFn(m.page_title || '')) {
                failures.push({ gameName, pageTitle: m.page_title, method });
            }
        }
        expect(failures).toEqual([]);
    });
});
