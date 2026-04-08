/**
 * Tests for USPTO trademark check logic.
 * Validates status classification, gaming class detection, bigram extraction,
 * result deduplication, and end-to-end API behavior.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';

// Re-implement the pure functions from ai.cjs to test them in isolation
// (ai.cjs is CJS with side effects; these are the exact same logic)

const GAMING_CLASSES = new Set(['009', '028', '041']);
const LIVE_CODES = new Set(['600', '601', '607', '608', '620', '622', '648', '700', '800']);

function classifyTMStatus(code) {
    if (LIVE_CODES.has(code)) return 'Live';
    const n = parseInt(code, 10);
    if ((n >= 630 && n <= 662) || code === '900') return 'Pending';
    return 'Dead';
}

function hasGamingClass(classStr) {
    return classStr.split(',').some(c => GAMING_CLASSES.has(c.trim()));
}

function extractQueries(name) {
    const trimmed = name.trim();
    const words = trimmed.split(/\s+/).filter(w => w.length > 0);
    const queries = [trimmed];
    if (words.length >= 3) {
        for (let i = 0; i <= words.length - 2; i++) {
            const bigram = words[i] + ' ' + words[i + 1];
            if (bigram.toLowerCase() !== trimmed.toLowerCase()) {
                queries.push(bigram);
            }
        }
    }
    return queries;
}

function deduplicateResults(batches) {
    const seen = new Set();
    const allResults = [];
    for (const batch of batches) {
        for (const r of batch.results) {
            const key = r.serial_number || r.mark + r.owner_name;
            if (!seen.has(key)) {
                seen.add(key);
                allResults.push({ ...r, matchedQuery: batch.query });
            }
        }
    }
    return allResults;
}

// =====================================================================
// Status Classification
// =====================================================================
describe('classifyTMStatus', () => {
    it('should classify registered/maintained codes as Live', () => {
        expect(classifyTMStatus('700')).toBe('Live');
        expect(classifyTMStatus('800')).toBe('Live');
        expect(classifyTMStatus('600')).toBe('Live');
        expect(classifyTMStatus('601')).toBe('Live');
        expect(classifyTMStatus('607')).toBe('Live');
        expect(classifyTMStatus('608')).toBe('Live');
        expect(classifyTMStatus('620')).toBe('Live');
        expect(classifyTMStatus('622')).toBe('Live');
        expect(classifyTMStatus('648')).toBe('Live');
    });

    it('should classify pending application codes as Pending', () => {
        expect(classifyTMStatus('630')).toBe('Pending');
        expect(classifyTMStatus('631')).toBe('Pending');
        expect(classifyTMStatus('640')).toBe('Pending');
        expect(classifyTMStatus('641')).toBe('Pending');
        expect(classifyTMStatus('644')).toBe('Pending');
        expect(classifyTMStatus('645')).toBe('Pending');
        expect(classifyTMStatus('650')).toBe('Pending');
        expect(classifyTMStatus('662')).toBe('Pending');
        expect(classifyTMStatus('900')).toBe('Pending');
    });

    it('should classify cancelled/abandoned/expired codes as Dead', () => {
        expect(classifyTMStatus('602')).toBe('Dead');
        expect(classifyTMStatus('603')).toBe('Dead');
        expect(classifyTMStatus('710')).toBe('Dead');
        expect(classifyTMStatus('711')).toBe('Dead');
        expect(classifyTMStatus('712')).toBe('Dead');
        expect(classifyTMStatus('780')).toBe('Dead');
    });

    it('should classify unknown codes as Dead', () => {
        expect(classifyTMStatus('999')).toBe('Dead');
        expect(classifyTMStatus('400')).toBe('Dead');
        expect(classifyTMStatus('')).toBe('Dead');
        expect(classifyTMStatus('abc')).toBe('Dead');
    });

    it('should treat 648 as Live (Registered - Issued) not Pending', () => {
        // 648 is in the pending numeric range (630-662) but explicitly in LIVE_CODES
        // The check order matters: LIVE_CODES is checked first
        expect(classifyTMStatus('648')).toBe('Live');
    });
});

// =====================================================================
// Gaming Class Detection
// =====================================================================
describe('hasGamingClass', () => {
    it('should detect single gaming classes', () => {
        expect(hasGamingClass('009')).toBe(true);
        expect(hasGamingClass('028')).toBe(true);
        expect(hasGamingClass('041')).toBe(true);
    });

    it('should detect gaming classes in multi-class strings', () => {
        expect(hasGamingClass('009,028')).toBe(true);
        expect(hasGamingClass('009,028,041')).toBe(true);
        expect(hasGamingClass('032,041')).toBe(true);
        expect(hasGamingClass('025,009')).toBe(true);
    });

    it('should return false for non-gaming classes', () => {
        expect(hasGamingClass('025')).toBe(false);
        expect(hasGamingClass('032')).toBe(false);
        expect(hasGamingClass('030')).toBe(false);
        expect(hasGamingClass('025,032,030')).toBe(false);
    });

    it('should handle whitespace in class strings', () => {
        expect(hasGamingClass('009, 028')).toBe(true);
        expect(hasGamingClass(' 041 ')).toBe(true);
        expect(hasGamingClass('032 , 025')).toBe(false);
    });
});

// =====================================================================
// Bigram Query Extraction
// =====================================================================
describe('extractQueries (bigram logic)', () => {
    it('should return only the full name for 2-word names', () => {
        const queries = extractQueries('Buffalo Gold');
        expect(queries).toEqual(['Buffalo Gold']);
    });

    it('should return full name + 2 bigrams for 3-word names', () => {
        const queries = extractQueries('Lost Jackpot Royale');
        expect(queries).toEqual(['Lost Jackpot Royale', 'Lost Jackpot', 'Jackpot Royale']);
    });

    it('should return full name + 3 bigrams for 4-word names', () => {
        const queries = extractQueries('Huff N More Puff');
        expect(queries).toEqual(['Huff N More Puff', 'Huff N', 'N More', 'More Puff']);
    });

    it('should return only the full name for 1-word names', () => {
        const queries = extractQueries('Starburst');
        expect(queries).toEqual(['Starburst']);
    });

    it('should handle extra whitespace', () => {
        const queries = extractQueries('  Lost   Jackpot   Royale  ');
        expect(queries[0]).toBe('Lost   Jackpot   Royale');
        expect(queries).toContain('Lost Jackpot');
        expect(queries).toContain('Jackpot Royale');
    });

    it('should not duplicate the full name in bigrams for a 2-word name processed as 3+', () => {
        // Edge case: name that looks like 2 words won't generate bigrams
        const queries = extractQueries('Dragon Fortune');
        expect(queries).toHaveLength(1);
    });
});

// =====================================================================
// Deduplication
// =====================================================================
describe('deduplicateResults', () => {
    it('should remove duplicate results by serial_number', () => {
        const batches = [
            {
                query: 'Buffalo Gold',
                results: [
                    { serial_number: '111', mark: 'BUFFALO GOLD', owner_name: 'Aristocrat' },
                    { serial_number: '222', mark: 'BUFFALO GOLD', owner_name: 'Aristocrat' },
                ],
            },
            {
                query: 'Buffalo',
                results: [
                    { serial_number: '111', mark: 'BUFFALO GOLD', owner_name: 'Aristocrat' },
                    { serial_number: '333', mark: 'BUFFALO KING', owner_name: 'Pragmatic' },
                ],
            },
        ];
        const results = deduplicateResults(batches);
        expect(results).toHaveLength(3);
        const serials = results.map(r => r.serial_number);
        expect(serials).toContain('111');
        expect(serials).toContain('222');
        expect(serials).toContain('333');
    });

    it('should preserve matchedQuery from the first occurrence', () => {
        const batches = [
            { query: 'Full Name', results: [{ serial_number: 'A', mark: 'TEST', owner_name: 'X' }] },
            { query: 'Sub Phrase', results: [{ serial_number: 'A', mark: 'TEST', owner_name: 'X' }] },
        ];
        const results = deduplicateResults(batches);
        expect(results).toHaveLength(1);
        expect(results[0].matchedQuery).toBe('Full Name');
    });

    it('should handle empty batches', () => {
        const batches = [
            { query: 'Nothing', results: [] },
            { query: 'Also Nothing', results: [] },
        ];
        expect(deduplicateResults(batches)).toHaveLength(0);
    });
});

// =====================================================================
// Real-World Validation (live API, skipped in CI)
// =====================================================================
import https from 'node:https';

function tmSearch(query) {
    return new Promise((resolve, reject) => {
        const url = `https://tmsearchapi.com/search/mark?q=${encodeURIComponent(query)}&limit=10`;
        const req = https
            .get(url, res => {
                let body = '';
                res.on('data', c => (body += c));
                res.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        resolve({
                            total_count: data.total_count ?? 0,
                            results: Array.isArray(data.results) ? data.results : [],
                        });
                    } catch {
                        reject(new Error('Invalid JSON from API'));
                    }
                });
            })
            .on('error', reject);
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('API timeout'));
        });
    });
}

const SKIP_LIVE = process.env.CI === 'true' || process.env.SKIP_LIVE_API === 'true';
const liveIt = SKIP_LIVE ? it.skip : it;

describe('Live API validation', () => {
    liveIt(
        'should find active trademarks for "Buffalo Gold"',
        async () => {
            const data = await tmSearch('Buffalo Gold');
            expect(data.total_count).toBeGreaterThan(0);

            const live = data.results.filter(r => LIVE_CODES.has(r.status_code));
            expect(live.length).toBeGreaterThan(0);

            const aristocrat = data.results.find(r => r.owner_name.includes('Aristocrat'));
            expect(aristocrat).toBeTruthy();
            expect(hasGamingClass(aristocrat.classes)).toBe(true);
        },
        15000
    );

    liveIt(
        'should find "Jackpot Royale" trademark via bigram of "Lost Jackpot Royale"',
        async () => {
            const queries = extractQueries('Lost Jackpot Royale');
            expect(queries).toContain('Jackpot Royale');

            const fullData = await tmSearch('Lost Jackpot Royale');
            expect(fullData.total_count).toBe(0);

            const bigramData = await tmSearch('Jackpot Royale');
            expect(bigramData.total_count).toBeGreaterThan(0);

            const gamingHit = bigramData.results.find(r => hasGamingClass(r.classes));
            expect(gamingHit).toBeTruthy();
        },
        15000
    );

    liveIt(
        'should find "More Puff" trademarks via bigram of "More Puff Link"',
        async () => {
            const queries = extractQueries('More Puff Link');
            expect(queries).toContain('More Puff');

            const data = await tmSearch('More Puff');
            expect(data.total_count).toBeGreaterThan(0);

            const lightWonder = data.results.find(r => r.owner_name && r.owner_name.toUpperCase().includes('LIGHT'));
            expect(lightWonder).toBeTruthy();
        },
        15000
    );

    liveIt(
        'should return zero results for a nonsense name',
        async () => {
            const data = await tmSearch('Xyzzy Quantum Nebula');
            expect(data.total_count).toBe(0);
            expect(data.results).toHaveLength(0);
        },
        15000
    );

    liveIt(
        'should find Mega Moolah as a known gaming trademark',
        async () => {
            const data = await tmSearch('Mega Moolah');
            expect(data.total_count).toBeGreaterThan(0);

            const hit = data.results[0];
            expect(hit.mark).toBe('MEGA MOOLAH');
            expect(hasGamingClass(hit.classes)).toBe(true);
        },
        15000
    );
});
