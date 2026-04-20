/**
 * Phase 5: Art Insights QA
 *
 * Validates all 5 art dimensions (setting, mood, characters, elements, narrative)
 * using metrics.js functions and the shared dimension-filter module.
 *
 * CRITICAL: art_characters and art_elements are arrays — the filter uses
 * .some() matching, NOT strict equality. This was the root cause of 10 false
 * positives in the dry run.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadTestData, gameData } from '../utils/load-test-data.js';
import {
    getArtThemeMetrics,
    getArtMoodMetrics,
    getArtNarrativeMetrics,
    getArtCharacterMetrics,
    getArtElementMetrics,
} from '../../src/lib/metrics.js';
import { F } from '../../src/lib/game-fields.js';
import { matchGameToDimension } from '../../server/helpers/dimension-filter.cjs';
import { scoreFinding, assertNoDefiniteFindings } from '../utils/qa-scoring.js';

let allGames = [];

beforeAll(async () => {
    await loadTestData();
    allGames = gameData.allGames;
});

describe('Art Theme QA', () => {
    it('art theme counts match F.artTheme grouping', () => {
        const findings = [];
        const rows = getArtThemeMetrics(allGames);
        for (const r of rows.slice(0, 10)) {
            const manual = allGames.filter(g => F.artTheme(g) === r.theme).length;
            if (manual !== r.count) {
                findings.push(
                    scoreFinding('DEFINITE', 'art_theme', `${r.theme}: ${r.count} vs ${manual}`, {
                        theme: r.theme,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('dimension filter matches for top themes', () => {
        const findings = [];
        const rows = getArtThemeMetrics(allGames);
        for (const r of rows.slice(0, 5)) {
            const viaF = allGames.filter(g => F.artTheme(g) === r.theme).length;
            const viaFilter = allGames.filter(g => matchGameToDimension(g, 'art_theme', r.theme.toLowerCase())).length;
            if (viaF !== viaFilter) {
                findings.push(
                    scoreFinding('LIKELY', 'art_theme', `${r.theme}: F=${viaF} vs filter=${viaFilter}`, {
                        theme: r.theme,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});

describe('Art Mood QA', () => {
    it('art mood counts match F.artMood grouping', () => {
        const findings = [];
        const rows = getArtMoodMetrics(allGames);
        for (const r of rows.slice(0, 10)) {
            const manual = allGames.filter(g => F.artMood(g) === r.mood).length;
            if (manual !== r.count) {
                findings.push(
                    scoreFinding('DEFINITE', 'art_mood', `${r.mood}: ${r.count} vs ${manual}`, { mood: r.mood })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});

describe('Art Characters QA', () => {
    it('character counts match F.artCharacters array-aware grouping', () => {
        const findings = [];
        const rows = getArtCharacterMetrics(allGames);
        for (const r of rows.slice(0, 10)) {
            const manual = allGames.filter(g => {
                const chars = F.artCharacters(g);
                return Array.isArray(chars) && chars.includes(r.character);
            }).length;
            if (manual !== r.count) {
                findings.push(
                    scoreFinding('DEFINITE', 'art_characters', `${r.character}: ${r.count} vs ${manual}`, {
                        character: r.character,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });

    it('dimension filter uses .some() for array values (prevents false positives)', () => {
        const findings = [];
        const rows = getArtCharacterMetrics(allGames);
        for (const r of rows.slice(0, 5)) {
            const viaMetrics = r.count;
            const viaFilter = allGames.filter(g =>
                matchGameToDimension(g, 'art_characters', r.character.toLowerCase())
            ).length;
            if (viaMetrics !== viaFilter) {
                findings.push(
                    scoreFinding(
                        'LIKELY',
                        'art_characters',
                        `${r.character}: metrics=${viaMetrics} vs filter=${viaFilter}`,
                        { character: r.character }
                    )
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});

describe('Art Elements QA', () => {
    it('element counts match F.artElements array-aware grouping', () => {
        const findings = [];
        const rows = getArtElementMetrics(allGames);
        for (const r of rows.slice(0, 10)) {
            const manual = allGames.filter(g => {
                const elems = F.artElements(g);
                return Array.isArray(elems) && elems.includes(r.element);
            }).length;
            if (manual !== r.count) {
                findings.push(
                    scoreFinding('DEFINITE', 'art_elements', `${r.element}: ${r.count} vs ${manual}`, {
                        element: r.element,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});

describe('Art Narrative QA', () => {
    it('narrative counts match F.artNarrative grouping', () => {
        const findings = [];
        const rows = getArtNarrativeMetrics(allGames);
        for (const r of rows.slice(0, 10)) {
            const manual = allGames.filter(g => F.artNarrative(g) === r.narrative).length;
            if (manual !== r.count) {
                findings.push(
                    scoreFinding('DEFINITE', 'art_narrative', `${r.narrative}: ${r.count} vs ${manual}`, {
                        narrative: r.narrative,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});

describe('Art Coverage QA', () => {
    it('art dimension coverage is reasonable (at least 20% of games)', () => {
        const findings = [];
        const dims = [
            { name: 'art_theme', fn: g => F.artTheme(g) },
            { name: 'art_mood', fn: g => F.artMood(g) },
            { name: 'art_narrative', fn: g => F.artNarrative(g) },
            { name: 'art_characters', fn: g => F.artCharacters(g).length > 0 },
            { name: 'art_elements', fn: g => F.artElements(g).length > 0 },
        ];

        for (const dim of dims) {
            const count = allGames.filter(dim.fn).length;
            const pct = (count / allGames.length) * 100;
            if (pct < 20) {
                findings.push(
                    scoreFinding('POSSIBLE', dim.name, `Only ${pct.toFixed(1)}% coverage (${count} games)`, {
                        dimension: dim.name,
                        count,
                        total: allGames.length,
                    })
                );
            }
        }
        assertNoDefiniteFindings(findings, expect);
    });
});
