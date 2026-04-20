'use strict';

const RTP_RE = /(?:rtp|return\s+to\s+player)[^.]{0,60}?(\d{2,3}(?:\.\d+)?)\s*%/i;
const VOLATILITY_RE = /(?:volatility|variance)[^.]{0,40}?(low|medium|high|very\s*high|med-high|med|low-medium)/i;

// Computed once from actual game data — no hardcoded percentages
function computeCoverageStats(games) {
    if (!Array.isArray(games) || games.length === 0) return {};
    const total = games.length;
    const fields = {
        rtp: g => g.rtp != null,
        volatility: g => !!g.volatility,
        symbols: g => Array.isArray(g.symbols) && g.symbols.length > 0,
        features: g => Array.isArray(g.features) && g.features.length > 0,
        theme_primary: g => !!g.theme_primary,
    };
    const stats = {};
    for (const [field, test] of Object.entries(fields)) {
        let count = 0;
        for (const g of games) {
            if (test(g)) count++;
        }
        const pct = Math.round((count / total) * 100);
        stats[field] = { pct, count, total, desc: `${pct}% coverage (${count}/${total.toLocaleString()} games).` };
    }
    return stats;
}

function computeRulesMatchPct(rulesMatches, totalGames) {
    if (!rulesMatches || totalGames <= 0) return null;
    const matchCount = Array.isArray(rulesMatches) ? rulesMatches.length : Object.keys(rulesMatches).length;
    return Math.round((matchCount / totalGames) * 100);
}

function diagnoseField(field, value, confidence, rulesText, game, providerStats, coverageStats, rulesMatchPct) {
    if (!field) return null;

    const cs = coverageStats || {};
    const hasRulesText = rulesText && rulesText.length > 50;
    const isMissing = value == null || value === '' || value === 'N/A';
    const coverageInfo = cs[field];

    if (isMissing && hasRulesText && field === 'rtp' && RTP_RE.test(rulesText)) {
        const stat = coverageInfo ? ` ${coverageInfo.desc}` : '';
        return `Present in rules text but extraction missed it.${stat}`;
    }

    if (isMissing && hasRulesText && field === 'volatility' && VOLATILITY_RE.test(rulesText)) {
        return 'Present in rules text but extraction missed it.';
    }

    if (isMissing && !hasRulesText) {
        const pctStr = rulesMatchPct != null ? `${rulesMatchPct}%` : '--';
        const reason = `No rules page matched (${pctStr} rules coverage).`;
        return coverageInfo ? `${reason} ${coverageInfo.desc}` : reason;
    }

    if (isMissing && coverageInfo) {
        return coverageInfo.desc;
    }

    if (confidence === 'text_inferred') {
        return 'Inferred from game name/description, not explicit data.';
    }

    if (confidence === 'estimated' && hasRulesText) {
        return 'Estimated — rules text ambiguous or value not explicitly stated.';
    }

    const overall = game?.data_confidence;
    if (overall === 'gt_verified' && confidence && confidence !== 'gt_verified' && confidence !== 'verified') {
        return 'Game verified but this field was not in the verification round.';
    }

    if (field === 'original_release_year' && value && game?.release_year && value === game.release_year) {
        return 'No global release date found; CSV launch year used.';
    }

    if (field === 'original_release_year') {
        const src = game?.original_release_date_source;
        if (src === 'claude_lookup_medium' || src === 'claude_lookup_low') {
            return `AI web lookup (${src}).`;
        }
    }

    if (providerStats && field === 'rtp') {
        const ps = providerStats[game?.provider];
        if (ps && ps.rtpCoverage < 40) {
            return `${game.provider}: ${ps.rtpCoverage}% RTP coverage.`;
        }
    }

    return null;
}

function detectInconsistencies(game, confidence, rulesText) {
    const issues = [];
    if (!game) return issues;

    if (rulesText) {
        const rtpMatch = rulesText.match(RTP_RE);
        if (rtpMatch) {
            const rulesRtp = parseFloat(rtpMatch[1]);
            if (!game.rtp && rulesRtp > 0) {
                issues.push({
                    field: 'rtp',
                    issue: 'Value missing but found in rules text',
                    rules_evidence: rtpMatch[0].trim().slice(0, 200),
                    severity: 'high',
                    diagnosis: diagnoseField('rtp', null, confidence?.rtp_confidence, rulesText, game, null),
                });
            } else if (game.rtp && Math.abs(game.rtp - rulesRtp) > 1) {
                issues.push({
                    field: 'rtp',
                    issue: `Dashboard has ${game.rtp}% but rules text says ${rulesRtp}%`,
                    rules_evidence: rtpMatch[0].trim().slice(0, 200),
                    severity: 'high',
                    diagnosis: `Dashboard: ${game.rtp}%, rules text: ${rulesRtp}%.`,
                });
            }
        }
    }

    const overall = game.data_confidence;
    if (overall === 'gt_verified' || overall === 'verified') {
        const weakFields = [];
        if (confidence) {
            for (const [k, v] of Object.entries(confidence)) {
                if (k.endsWith('_confidence') && (v === 'estimated' || v === 'text_inferred')) {
                    weakFields.push(k.replace('_confidence', ''));
                }
            }
        }
        if (weakFields.length > 0) {
            issues.push({
                field: 'data_confidence',
                issue: `Overall confidence is ${overall} but ${weakFields.join(', ')} still marked as estimated/inferred`,
                severity: 'medium',
                diagnosis: `Fields not in verification round: ${weakFields.join(', ')}.`,
            });
        }
    }

    if (game.html_rules_available || rulesText) {
        const missingSpecs = [];
        if (!game.rtp) missingSpecs.push('rtp');
        if (!game.volatility) missingSpecs.push('volatility');
        if (!game.reels) missingSpecs.push('reels');
        if (!game.rows) missingSpecs.push('rows');
        if (missingSpecs.length >= 3) {
            issues.push({
                field: 'specs',
                issue: `Rules text available but ${missingSpecs.join(', ')} are missing`,
                severity: 'low',
                diagnosis: `Missing from extraction: ${missingSpecs.join(', ')}.`,
            });
        }
    }

    const featureCount = Array.isArray(game.features) ? game.features.length : 0;
    const detailCount = game.feature_details ? Object.keys(game.feature_details).length : 0;
    if (featureCount > 0 && detailCount > 0 && Math.abs(featureCount - detailCount) > 2) {
        issues.push({
            field: 'features',
            issue: `Feature list has ${featureCount} items but feature_details has ${detailCount}`,
            severity: 'low',
            diagnosis: `Count mismatch: features=${featureCount}, feature_details=${detailCount}.`,
        });
    }

    return issues;
}

function buildProviderStats(games) {
    const stats = {};
    if (!Array.isArray(games)) return stats;
    const provCounts = {};
    const provRtp = {};
    for (const g of games) {
        const p = g.provider || 'Unknown';
        provCounts[p] = (provCounts[p] || 0) + 1;
        if (g.rtp) provRtp[p] = (provRtp[p] || 0) + 1;
    }
    for (const [p, total] of Object.entries(provCounts)) {
        stats[p] = { total, rtpCoverage: Math.round(((provRtp[p] || 0) / total) * 100) };
    }
    return stats;
}

function extractRulesEvidence(rulesText, field) {
    if (!rulesText || !field) return null;
    const patterns = {
        rtp: RTP_RE,
        volatility: VOLATILITY_RE,
        paylines: /(?:paylines|pay\s*lines|ways)[^.]{0,80}/i,
        reels: /(\d)\s*(?:reels?|x\s*\d)/i,
        rows: /\d\s*x\s*(\d)\s*(?:rows?|grid)/i,
    };
    const re = patterns[field];
    if (!re) return null;
    const m = rulesText.match(re);
    return m ? m[0].trim().slice(0, 200) : null;
}

const SOURCE_LABELS = {
    slotcatalog: 'SlotCatalog',
    slotreport: 'SlotReport',
    html: 'Rules HTML',
    ags_gt: 'AGS ground truth',
    'sc+sr_consensus': 'SlotCatalog + SlotReport consensus',
    evolution: 'Evolution official',
    lnw_official: 'Light & Wonder official',
    greentube_official: 'Greentube official',
    wazdan_official: 'Wazdan official',
    gamingrealms_official: 'Gaming Realms official',
    microgaming_official: 'Microgaming official',
};

const RELEASE_DATE_SOURCE_LABELS = {
    slotcatalog: 'SlotCatalog',
    slotcatalog_fuzzy: 'SlotCatalog (fuzzy match)',
    slotreport: 'SlotReport',
    slotreport_fuzzy: 'SlotReport (fuzzy match)',
    slotreport_corrected: 'SlotReport (corrected)',
    html_copyright: 'Rules HTML (copyright notice)',
    html_extract: 'Rules HTML extraction',
    nj_corrected: 'CSV (corrected)',
    verified_reference: 'Verified reference',
    evolution: 'Evolution official',
    claude_lookup_high: 'AI web lookup (high confidence)',
    claude_lookup_medium: 'AI web lookup (medium confidence)',
    claude_lookup_low: 'AI web lookup (low confidence)',
};

function resolveSourceLabel(key) {
    return SOURCE_LABELS[key] || key;
}

function getExtractionMethod(field, confidence, value, game, dataSource) {
    if (!field) return null;

    if (dataSource) {
        const label = SOURCE_LABELS[dataSource] || dataSource;
        return { method: label, detail: `Value from ${label}.` };
    }

    if (confidence === 'gt_verified' || confidence === 'verified')
        return { method: 'Manual verification', detail: 'Verified by human reviewer against source.' };
    if (confidence === 'extracted') {
        const methods = {
            rtp: { method: 'Regex extraction', detail: 'Matched "RTP"/"return to player" + percentage.' },
            volatility: { method: 'Regex extraction', detail: 'Matched "volatility"/"variance" + level keyword.' },
            reels: { method: 'Regex extraction', detail: 'Matched reel count or NxM grid notation.' },
            rows: { method: 'Regex extraction', detail: 'Matched NxM grid notation (M = rows).' },
            paylines: { method: 'Regex extraction', detail: 'Matched "paylines"/"ways" + count.' },
        };
        return methods[field] || { method: 'Automated extraction', detail: 'Extracted from game rules page.' };
    }
    if (confidence === 'text_inferred')
        return { method: 'Text inference', detail: 'Inferred from game name/description, not explicit in rules.' };
    if (confidence === 'estimated')
        return { method: 'Estimation', detail: 'Source ambiguous or value not explicitly available.' };

    if (field === 'theme_primary' || field === 'theme_consolidated') {
        const conf = game?.data_confidence;
        if (conf === 'gt_verified')
            return {
                method: 'Ground truth + rules text',
                detail: 'Classified from thematic keywords in rules text, verified against game name.',
            };
        return {
            method: 'AI classification',
            detail: 'Classified from thematic keywords in rules text (setting, symbols, characters).',
        };
    }
    if (field === 'original_release_year') {
        const src = game?.original_release_date_source;
        if (src && RELEASE_DATE_SOURCE_LABELS[src]) {
            const label = RELEASE_DATE_SOURCE_LABELS[src];
            return { method: label, detail: `Release date from ${label}.` };
        }
        if (src?.endsWith('_official')) {
            return { method: 'Provider official', detail: `From ${src.replace('_official', '')} official specs.` };
        }
        return { method: 'CSV import', detail: 'Launch date from imported CSV.' };
    }
    if (field === 'name') return { method: 'CSV import', detail: 'Game title from imported CSV.' };

    if (field === 'provider' || field === 'provider_studio')
        return { method: 'CSV import', detail: 'Provider/studio from CSV, normalized via provider map.' };

    if (field === 'theo_win') return { method: 'CSV import', detail: 'Theo win index from imported CSV.' };
    if (field === 'market_share_pct') return { method: 'Calculated', detail: 'theo_win / total market.' };
    if (field === 'avg_bet') return { method: 'CSV import', detail: 'Average bet from imported CSV.' };
    if (field === 'release_year')
        return { method: 'CSV import', detail: 'Launch year from CSV (may differ from global release).' };
    if (field === 'description') return { method: 'AI extraction', detail: 'Generated from rules HTML + metadata.' };
    if (field === 'symbols') return { method: 'Rules HTML extraction', detail: 'From rules paytable section.' };
    if (field === 'features')
        return { method: 'Rules HTML classification', detail: 'Mechanics classified from rules HTML text.' };
    if (field === 'max_win') return { method: 'Rules HTML extraction', detail: 'Max win multiplier from rules HTML.' };
    if (field === 'min_bet' || field === 'max_bet')
        return { method: 'Rules HTML extraction', detail: 'From rules HTML betting section.' };
    if (field === 'rtp') return { method: 'Rules HTML extraction', detail: 'RTP% pattern-matched from rules HTML.' };
    if (field === 'volatility') return { method: 'Rules HTML extraction', detail: 'Volatility from rules HTML.' };
    if (field === 'reels')
        return { method: 'Rules HTML extraction', detail: 'Reel count from rules HTML grid description.' };
    if (field === 'rows')
        return { method: 'Rules HTML extraction', detail: 'Row count from rules HTML grid description.' };
    if (field === 'paylines')
        return { method: 'Rules HTML extraction', detail: 'From rules HTML payline/ways section.' };

    if (field?.startsWith('art_'))
        return value != null
            ? { method: 'Art characterization pipeline', detail: 'Derived from game visual analysis and rules text.' }
            : null;

    return value != null ? null : null;
}

const THEME_KEYWORDS = {
    Fire: /\b(fire|flame|volcano|lava|eruption|inferno|blaze|fiery|sizzl|burn|ignit|fireball|magma|ember)\b/i,
    Asian: /\b(dragon|fortune|lucky|jade|bamboo|lotus|lantern|dynasty|emperor|geisha|samurai|ninja|koi|panda|fu|shou)\b/i,
    Egyptian: /\b(egypt|pharaoh|pyramid|cleopatra|sphinx|anubis|ra|nile|scarab|hieroglyph|tomb|sarcophagus)\b/i,
    Animals: /\b(wolf|lion|eagle|bear|buffalo|horse|rhino|gorilla|panther|tiger|stag|mustang|stallion)\b/i,
    Fantasy: /\b(wizard|witch|magic|fairy|elf|unicorn|enchant|mystical|sorcerer|spell|potion|mythical)\b/i,
    Horror: /\b(vampire|zombie|ghost|haunted|dark|blood|monster|werewolf|skeleton|skull|undead|demon)\b/i,
    Gold: /\b(gold|treasure|riches|wealth|nugget|golden|midas|bullion)\b/i,
    Greek: /\b(zeus|athena|poseidon|olympus|greek|hercules|apollo|titan|spartan|medusa|minotaur)\b/i,
    Irish: /\b(irish|leprechaun|clover|shamrock|rainbow|celtic|ireland|pot\s+of\s+gold|emerald\s+isle)\b/i,
    Aztec: /\b(aztec|maya|inca|temple|ancient.*ruins|jungle.*temple|totem|tribal)\b/i,
    Space: /\b(space|galaxy|cosmic|star.*ship|alien|planet|astronaut|nebula|orbit|stellar)\b/i,
    Ocean: /\b(ocean|sea|underwater|mermaid|dolphin|fish|coral|shark|deep\s+blue|nautical|pirate)\b/i,
    Arabian: /\b(arabian|genie|aladdin|sultan|desert|camel|oasis|carpet|lamp|bazaar|persia)\b/i,
    '7s': /\b(seven|classic.*slot|retro|fruit.*machine|cherry|bar.*symbol|bell)\b/i,
    Casino: /\b(poker|blackjack|roulette|casino|card|dice|chip|dealer|jackpot.*city|vegas)\b/i,
    Western: /\b(cowboy|western|wild\s*west|sheriff|saloon|outlaw|frontier|ranch|rodeo|revolver)\b/i,
    Music: /\b(music|rock|guitar|band|dance|rhythm|disco|concert|song|melody|jazz|blues)\b/i,
    Sports: /\b(football|soccer|basketball|baseball|hockey|boxing|racing|champion|trophy|stadium)\b/i,
};

function findThemeEvidence(rulesText, themeValue) {
    if (!rulesText || !themeValue) return null;
    const re = THEME_KEYWORDS[themeValue];
    if (!re) {
        const escaped = themeValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fallbackRe = new RegExp(`\\b(${escaped})\\b`, 'i');
        const m = rulesText.match(fallbackRe);
        if (!m) return null;
        return buildWindow(rulesText, m, themeValue);
    }
    const allMatches = [];
    let m;
    const globalRe = new RegExp(re.source, 'gi');
    while ((m = globalRe.exec(rulesText)) !== null) {
        allMatches.push({ index: m.index, length: m[0].length, text: m[0] });
        if (allMatches.length >= 5) break;
    }
    if (!allMatches.length) return null;
    const best = allMatches[0];
    const windowStart = Math.max(0, best.index - 60);
    const windowEnd = Math.min(rulesText.length, best.index + best.length + 60);
    const before = rulesText.slice(windowStart, best.index);
    const match = rulesText.slice(best.index, best.index + best.length);
    const after = rulesText.slice(best.index + best.length, windowEnd);
    const keywords = allMatches.map(m => m.text.toLowerCase());
    const unique = [...new Set(keywords)];
    return {
        before: (windowStart > 0 ? '...' : '') + before,
        match,
        after: after + (windowEnd < rulesText.length ? '...' : ''),
        full_match: match,
        captured_value: themeValue,
        all_evidence: unique,
        evidence_count: allMatches.length,
    };
}

function buildWindow(rulesText, m, value) {
    const matchStart = m.index;
    const matchEnd = matchStart + m[0].length;
    const windowStart = Math.max(0, matchStart - 60);
    const windowEnd = Math.min(rulesText.length, matchEnd + 60);
    return {
        before: (windowStart > 0 ? '...' : '') + rulesText.slice(windowStart, matchStart),
        match: m[0],
        after: rulesText.slice(matchEnd, windowEnd) + (windowEnd < rulesText.length ? '...' : ''),
        full_match: m[0],
        captured_value: value,
    };
}

function getContextWindow(rulesText, field, value) {
    if (!rulesText || !field) return null;

    if (field === 'theme_primary' || field === 'theme_consolidated') {
        return findThemeEvidence(rulesText, value);
    }

    const re = {
        rtp: /(?:rtp|return\s+to\s+player|theoretical\s+return|expected\s+return)[^.]{0,120}?(\d{2,3}(?:\.\d+)?)\s*%[^.]*\.?/i,
        volatility: /(?:volatility|variance)[^.]{0,120}?(low|medium|high|very\s*high|med-high|med|low-medium)[^.]*\.?/i,
        reels: /[^.]*(\d)\s*(?:reels?|reel\s+layout)[^.]*\.?/i,
        rows: /[^.]*\d\s*x\s*(\d)[^.]*(?:rows?|grid)[^.]*\.?/i,
        paylines: /[^.]*(?:paylines|pay\s*lines|ways)[^.]{0,80}\.?/i,
    }[field];
    if (re) {
        const m = rulesText.match(re);
        if (m) return buildWindow(rulesText, m, m[1] || m[0]);
    }

    if (value != null) {
        const searchTerms = Array.isArray(value)
            ? value.slice(0, 5).map(v => (typeof v === 'object' && v.name ? v.name : String(v)))
            : [String(value)];
        for (const term of searchTerms) {
            if (term.length < 3) continue;
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const termRe = new RegExp(`\\b${escaped}\\b`, 'i');
            const m = rulesText.match(termRe);
            if (m) return buildWindow(rulesText, m, term);
        }
    }

    return null;
}

module.exports = {
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
    RTP_RE,
    VOLATILITY_RE,
};
