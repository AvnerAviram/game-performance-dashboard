import { describe, it, expect } from 'vitest';

const {
    diagnoseField,
    detectInconsistencies,
    buildProviderStats,
    extractRulesEvidence,
    getExtractionMethod,
    getContextWindow,
    computeCoverageStats,
    computeRulesMatchPct,
    resolveSourceLabel,
    SOURCE_LABELS,
    RELEASE_DATE_SOURCE_LABELS,
} = require('../../server/helpers/provenance-diagnosis.cjs');

describe('provenance-diagnosis', () => {
    describe('diagnoseField', () => {
        const LONG_RULES =
            'This is a sufficiently long rules text to pass the length check, containing lots of details about the game mechanics and payout structure.';

        it('detects RTP in rules text that was not extracted', () => {
            const text = LONG_RULES + ' The RTP is 96.5% for this game.';
            const result = diagnoseField('rtp', null, null, text, {}, null);
            expect(result).toContain('rules text');
            expect(result).toContain('extraction missed');
        });

        it('detects volatility in rules text that was not extracted', () => {
            const text = LONG_RULES + ' The volatility of this game is high and rewarding.';
            const result = diagnoseField('volatility', null, null, text, {}, null);
            expect(result).toContain('rules text');
            expect(result).toContain('extraction missed');
        });

        it('explains missing value when no rules text', () => {
            const result = diagnoseField('rtp', null, null, null, {}, null);
            expect(result).toContain('No rules page matched');
        });

        it('explains text_inferred confidence', () => {
            const result = diagnoseField('theme_primary', 'Egyptian', 'text_inferred', '', {}, null);
            expect(result).toContain('Inferred from game name');
        });

        it('explains estimated confidence with rules text', () => {
            const text = LONG_RULES + ' Various paylines and configurations are described here.';
            const result = diagnoseField('rtp', 96.5, 'estimated', text, {}, null);
            expect(result).toContain('Estimated');
        });

        it('explains overall gt_verified but field not verified', () => {
            const game = { data_confidence: 'gt_verified' };
            const result = diagnoseField('rtp', 96.5, 'extracted', '', game, null);
            expect(result).toContain('not in the verification round');
        });

        it('returns null for well-sourced field', () => {
            const result = diagnoseField(
                'rtp',
                96.5,
                'verified',
                'rtp is 96.5%',
                { data_confidence: 'verified' },
                null
            );
            expect(result).toBeNull();
        });

        it('handles provider stats for low RTP coverage', () => {
            const game = { provider: 'TestProvider' };
            const providerStats = { TestProvider: { total: 100, rtpCoverage: 30 } };
            const result = diagnoseField('rtp', 96.5, null, '', game, providerStats);
            expect(result).toContain('30%');
        });
    });

    describe('detectInconsistencies', () => {
        it('detects RTP missing from master but present in rules', () => {
            const game = {};
            const issues = detectInconsistencies(game, {}, 'The RTP is 96.5% for this slot.');
            expect(issues.length).toBeGreaterThan(0);
            expect(issues[0].field).toBe('rtp');
        });

        it('detects RTP mismatch between master and rules', () => {
            const game = { rtp: 94.0 };
            const issues = detectInconsistencies(game, {}, 'The RTP is 96.5% and it is great.');
            expect(issues.some(i => i.field === 'rtp' && i.severity === 'high')).toBe(true);
        });

        it('detects weak fields in verified game', () => {
            const game = { data_confidence: 'gt_verified' };
            const conf = { rtp_confidence: 'estimated', volatility_confidence: 'text_inferred' };
            const issues = detectInconsistencies(game, conf, '');
            expect(issues.some(i => i.field === 'data_confidence')).toBe(true);
        });

        it('returns empty for clean game', () => {
            const game = { rtp: 96.5, volatility: 'High', reels: 5, rows: 3, name: 'Test' };
            const issues = detectInconsistencies(game, {}, '');
            expect(issues.length).toBe(0);
        });
    });

    describe('buildProviderStats', () => {
        it('calculates provider RTP coverage', () => {
            const games = [{ provider: 'A', rtp: 96.5 }, { provider: 'A' }, { provider: 'B', rtp: 95 }];
            const stats = buildProviderStats(games);
            expect(stats.A.total).toBe(2);
            expect(stats.A.rtpCoverage).toBe(50);
            expect(stats.B.total).toBe(1);
            expect(stats.B.rtpCoverage).toBe(100);
        });

        it('handles empty input', () => {
            expect(buildProviderStats(null)).toEqual({});
            expect(buildProviderStats([])).toEqual({});
        });
    });

    describe('extractRulesEvidence', () => {
        it('extracts RTP evidence', () => {
            const text = 'This slot has a return to player (RTP) of 96.5%.';
            const result = extractRulesEvidence(text, 'rtp');
            expect(result).toContain('96.5');
        });

        it('extracts volatility evidence', () => {
            const text = 'The volatility of this game is high.';
            const result = extractRulesEvidence(text, 'volatility');
            expect(result).toContain('high');
        });

        it('returns null for unknown field', () => {
            expect(extractRulesEvidence('some text', 'unknown_field')).toBeNull();
        });

        it('returns null when no match', () => {
            expect(extractRulesEvidence('no relevant data here', 'rtp')).toBeNull();
        });
    });

    describe('getExtractionMethod', () => {
        it('returns manual verification for gt_verified', () => {
            const result = getExtractionMethod('rtp', 'gt_verified', 96.5, {});
            expect(result.method).toBe('Manual verification');
        });

        it('returns regex extraction for extracted rtp', () => {
            const result = getExtractionMethod('rtp', 'extracted', 96.5, {});
            expect(result.method).toContain('Regex extraction');
            expect(result.detail).toContain('RTP');
        });

        it('returns regex extraction for extracted volatility', () => {
            const result = getExtractionMethod('volatility', 'extracted', 'High', {});
            expect(result.detail).toContain('volatility');
        });

        it('returns text inference for text_inferred', () => {
            const result = getExtractionMethod('theme_primary', 'text_inferred', 'Egyptian', {});
            expect(result.method).toBe('Text inference');
        });

        it('returns estimation for estimated', () => {
            const result = getExtractionMethod('rtp', 'estimated', 96.5, {});
            expect(result.method).toBe('Estimation');
        });

        it('returns CSV import for provider', () => {
            const result = getExtractionMethod('provider', null, 'IGT', {});
            expect(result.method).toBe('CSV import');
        });

        it('returns CSV import for theo_win', () => {
            const result = getExtractionMethod('theo_win', null, 29.5, {});
            expect(result.method).toBe('CSV import');
        });

        it('returns calculated metric for market_share_pct', () => {
            const result = getExtractionMethod('market_share_pct', null, 0.013, {});
            expect(result.method).toBe('Calculated');
        });

        it('returns GT verification for theme when game is gt_verified', () => {
            const result = getExtractionMethod('theme_primary', null, 'Adventure', { data_confidence: 'gt_verified' });
            expect(result.method).toBe('Ground truth + rules text');
        });

        it('returns slotcatalog for release year from slotcatalog', () => {
            const result = getExtractionMethod('original_release_year', null, 2023, {
                original_release_date_source: 'slotcatalog',
            });
            expect(result.method).toBe('SlotCatalog');
        });

        it('returns null for null field', () => {
            expect(getExtractionMethod(null, null, null, {})).toBeNull();
        });
    });

    describe('getContextWindow', () => {
        const RULES_TEXT =
            'This is a slot game with many features. The expected return for this game is 94.00%. Legal notices apply.';

        it('extracts context window around RTP', () => {
            const result = getContextWindow(RULES_TEXT, 'rtp', 94);
            expect(result).not.toBeNull();
            expect(result.match).toContain('94.00%');
            expect(result.captured_value).toBe('94.00');
        });

        it('includes surrounding text', () => {
            const result = getContextWindow(RULES_TEXT, 'rtp', 94);
            expect(result.before).toBeTruthy();
            expect(result.after).toBeTruthy();
        });

        it('extracts volatility context window', () => {
            const text = 'Game features include expanding wilds. The volatility is high for this game. Enjoy!';
            const result = getContextWindow(text, 'volatility', 'high');
            expect(result).not.toBeNull();
            expect(result.match).toContain('high');
        });

        it('returns null for unmatched field', () => {
            expect(getContextWindow(RULES_TEXT, 'rtp_nonexistent', 94)).toBeNull();
        });

        it('returns null when pattern not found', () => {
            expect(getContextWindow('No relevant data here at all.', 'rtp', 94)).toBeNull();
        });

        it('returns null for null inputs', () => {
            expect(getContextWindow(null, 'rtp', 94)).toBeNull();
            expect(getContextWindow(RULES_TEXT, null, 94)).toBeNull();
        });
    });

    describe('computeCoverageStats', () => {
        it('computes coverage from real game data', () => {
            const games = [
                { rtp: 96.5, volatility: 'High', symbols: ['A'], features: ['FS'], theme_primary: 'Gold' },
                { rtp: null, volatility: null, symbols: [], features: [], theme_primary: null },
                { rtp: 95.0, volatility: 'Medium', symbols: ['B', 'C'], features: ['Wild'], theme_primary: 'Asian' },
            ];
            const stats = computeCoverageStats(games);
            expect(stats.rtp.pct).toBe(67);
            expect(stats.rtp.count).toBe(2);
            expect(stats.rtp.total).toBe(3);
            expect(stats.rtp.desc).toContain('67%');
            expect(stats.volatility.pct).toBe(67);
            expect(stats.symbols.pct).toBe(67);
            expect(stats.features.pct).toBe(67);
            expect(stats.theme_primary.pct).toBe(67);
        });

        it('returns empty for empty input', () => {
            expect(computeCoverageStats([])).toEqual({});
            expect(computeCoverageStats(null)).toEqual({});
        });
    });

    describe('computeRulesMatchPct', () => {
        it('computes percentage from array', () => {
            const matches = [{ game: 'a' }, { game: 'b' }];
            expect(computeRulesMatchPct(matches, 4)).toBe(50);
        });

        it('computes percentage from object', () => {
            expect(computeRulesMatchPct({ a: {}, b: {}, c: {} }, 10)).toBe(30);
        });

        it('returns null for null input', () => {
            expect(computeRulesMatchPct(null, 100)).toBeNull();
        });
    });

    describe('resolveSourceLabel', () => {
        it('resolves known source keys to labels', () => {
            expect(resolveSourceLabel('slotcatalog')).toBe('SlotCatalog');
            expect(resolveSourceLabel('html')).toBe('Rules HTML');
            expect(resolveSourceLabel('ags_gt')).toBe('AGS ground truth');
        });

        it('returns raw key for unknown source', () => {
            expect(resolveSourceLabel('some_unknown')).toBe('some_unknown');
        });
    });

    describe('all release date sources are handled', () => {
        const ALL_RELEASE_SOURCES = [
            'slotcatalog',
            'slotcatalog_fuzzy',
            'slotreport',
            'slotreport_fuzzy',
            'slotreport_corrected',
            'html_copyright',
            'html_extract',
            'nj_corrected',
            'verified_reference',
            'evolution',
            'claude_lookup_high',
            'claude_lookup_medium',
            'claude_lookup_low',
        ];

        for (const src of ALL_RELEASE_SOURCES) {
            it(`handles original_release_date_source="${src}"`, () => {
                const game = { original_release_date_source: src, original_release_year: 2023 };
                const result = getExtractionMethod('original_release_year', null, 2023, game, null);
                expect(result).not.toBeNull();
                expect(result.method).not.toBe('CSV import');
                expect(result.method).toBeTruthy();
                expect(result.detail).toBeTruthy();
            });
        }
    });

    describe('SOURCE_LABELS completeness', () => {
        it('has labels for all known staged_best_of_sources values', () => {
            const KNOWN_SOURCES = [
                'slotcatalog',
                'slotreport',
                'html',
                'ags_gt',
                'sc+sr_consensus',
                'evolution',
                'lnw_official',
                'greentube_official',
                'wazdan_official',
                'gamingrealms_official',
                'microgaming_official',
            ];
            for (const key of KNOWN_SOURCES) {
                expect(SOURCE_LABELS[key]).toBeTruthy();
            }
        });
    });

    describe('no hardcoded coverage percentages', () => {
        it('diagnoseField uses computed stats when provided', () => {
            const stats = { rtp: { pct: 42, count: 420, total: 1000, desc: '42% coverage (420/1,000 games).' } };
            const result = diagnoseField('rtp', null, null, null, {}, null, stats, 75);
            expect(result).toContain('75%');
            expect(result).toContain('42%');
        });

        it('diagnoseField works without stats (no crash, no hardcoded values)', () => {
            const result = diagnoseField('rtp', null, null, null, {}, null);
            expect(result).toContain('No rules page matched');
            expect(result).toContain('--');
        });
    });

    describe('getExtractionMethod never returns generic Data pipeline', () => {
        it('returns null for unknown field with value', () => {
            const result = getExtractionMethod('some_random_field', null, 'test', {}, null);
            expect(result).toBeNull();
        });
    });
});
