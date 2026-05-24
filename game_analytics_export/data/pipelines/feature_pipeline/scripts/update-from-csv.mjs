#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import { PROVIDER_NORMALIZATION_MAP } from '../../../../src/lib/shared-config.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { MASTER_JSON } = require('../../../../src/lib/data-paths.cjs');

const __dirname = import.meta.dirname;
const DATA_DIR = resolve(__dirname, '../../..');
const KNOWN_CATEGORIES = [
    'Slot',
    'Table Game',
    'Instant Win',
    'Live Casino',
    'Lottery',
    'Video Poker',
    'Bingo/Keno',
    'Crash',
    'Arcade',
];
const TABLE_KEYWORDS = ['blackjack', 'roulette', 'baccarat', 'poker', 'craps', 'sic bo'];
const FP_KEYS = [
    'art_characters',
    'art_color_tone',
    'art_elements',
    'art_narrative',
    'art_theme',
    'art_theme_secondary',
    'background_description',
    'description',
    'features',
    'symbols',
    'theme_primary',
    'themes_all',
];

function normalizeRowKeys(row) {
    const o = {};
    for (const [k, v] of Object.entries(row)) {
        o[String(k).trim()] = typeof v === 'string' ? v.trim() : v;
    }
    return o;
}

function parseArgs(argv) {
    const out = {
        csv: null,
        dryRun: true,
        apply: false,
        reviewed: false,
        addNew: false,
        limit: null,
        only: null,
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--csv') {
            out.csv = argv[++i];
        } else if (a === '--dry-run') {
            out.dryRun = true;
        } else if (a === '--apply') {
            out.apply = true;
            out.dryRun = false;
        } else if (a === '--reviewed') {
            out.reviewed = true;
        } else if (a === '--add-new') {
            out.addNew = true;
            out.dryRun = false;
        } else if (a === '--limit') {
            out.limit = parseInt(argv[++i], 10);
        } else if (a === '--only') {
            out.only = argv[++i];
        }
    }
    return out;
}

function readCsvBuffer(csvPath) {
    const buf = readFileSync(csvPath);
    if (buf[0] === 0xff && buf[1] === 0xfe) {
        return buf.toString('utf16le').slice(1);
    }
    return buf.toString('utf8').replace(/^\ufeff/, '');
}

function detectDelimiter(decoded) {
    const firstLine = decoded.split(/\r?\n/)[0] || '';
    return firstLine.includes('\t') ? '\t' : ',';
}

function parseAvgBet(val) {
    if (val === null || val === undefined || String(val).trim() === '') return null;
    const n = parseFloat(String(val).replace(/[$,]/g, ''));
    return isNaN(n) ? null : n;
}

function parseTheoWin(val) {
    if (val === null || val === undefined || String(val).trim() === '') return null;
    const n = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(n) ? null : n;
}

function parseMarketShare(val) {
    if (val === null || val === undefined || String(val).trim() === '') return null;
    const n = parseFloat(String(val).replace(/%/g, ''));
    return isNaN(n) ? null : n / 100;
}

function parseSites(val) {
    if (val === null || val === undefined || String(val).trim() === '') return null;
    const n = parseInt(String(val).replace(/,/g, ''), 10);
    return isNaN(n) ? null : n;
}

function parseReleaseDate(val) {
    if (!val || !String(val).trim()) return { release_year: null, release_month: null };
    const months = {
        january: 1,
        february: 2,
        march: 3,
        april: 4,
        may: 5,
        june: 6,
        july: 7,
        august: 8,
        september: 9,
        october: 10,
        november: 11,
        december: 12,
    };
    const parts = String(val)
        .split(',')
        .map(s => s.trim());
    const monthName = (parts[0] || '').toLowerCase();
    const year = parseInt(parts[1], 10);
    return { release_year: isNaN(year) ? null : year, release_month: months[monthName] || null };
}

function parseGamesPlayed(val) {
    if (val === null || val === undefined || String(val).trim() === '') return null;
    const n = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(n) ? null : n;
}

function normalizeProvider(raw) {
    if (!raw) return raw;
    const trimmed = String(raw).trim();
    return PROVIDER_NORMALIZATION_MAP[trimmed] || trimmed;
}

function tokenize(name) {
    return String(name || '')
        .toLowerCase()
        .split(/\W+/u)
        .filter(Boolean);
}

function tokenSetJaccard(a, b) {
    const setA = new Set(a);
    const setB = new Set(b);
    let inter = 0;
    for (const t of setA) {
        if (setB.has(t)) inter++;
    }
    const union = setA.size + setB.size - inter;
    return union === 0 ? 0 : inter / union;
}

function theoProximityOk(oldVal, newVal) {
    if (oldVal == null || newVal == null) return false;
    const o = Math.abs(Number(oldVal));
    const n = Math.abs(Number(newVal));
    const max = Math.max(o, n);
    if (max === 0) return true;
    const min = Math.min(o, n);
    return min / max >= 0.8;
}

function marketShareIssue(oldV, newV) {
    const oNull = oldV == null || oldV === 0;
    const nNull = newV == null || newV === 0;
    if (oNull && nNull) return false;
    if (oNull && !nNull) return newV > 0.01;
    if (!oNull && nNull) return oldV > 0.01;
    const ratio = oldV > newV ? oldV / newV : newV / oldV;
    return ratio > 10;
}

function sortArrayForFingerprint(arr) {
    if (!Array.isArray(arr)) return arr;
    const copy = arr.slice();
    const allPrimitive = copy.every(x => x === null || ['string', 'number', 'boolean'].includes(typeof x));
    if (allPrimitive) {
        copy.sort((a, b) => String(a).localeCompare(String(b)));
        return copy;
    }
    return copy
        .map(x => JSON.stringify(x))
        .sort()
        .map(s => JSON.parse(s));
}

function fingerprintGame(game) {
    const keys = [...FP_KEYS].sort();
    const obj = {};
    for (const k of keys) {
        let v = game[k];
        if (v === undefined || v === null) {
            obj[k] = null;
        } else if (Array.isArray(v)) {
            obj[k] = sortArrayForFingerprint(v);
        } else {
            obj[k] = v;
        }
    }
    const s = JSON.stringify(obj);
    return createHash('sha256').update(s).digest('hex');
}

function atomicWriteJson(filePath, data) {
    const tmp = filePath + '.tmp';
    writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
    renameSync(tmp, filePath);
}

function cloneGame(g) {
    return JSON.parse(JSON.stringify(g));
}

function buildChangesFromCsv(master, row) {
    const parsedDate = parseReleaseDate(row['Month, Year of OGPD Release Date']);
    const props = new Map([
        ['theo_win', parseTheoWin(row['Theo Win Index'])],
        ['market_share_pct', parseMarketShare(row['% of Total GGR'])],
        ['sites', parseSites(row['Casinos (Sites)'])],
        ['avg_bet', parseAvgBet(row['Avg. Average Bet'])],
        ['median_bet', parseAvgBet(row['Median Avg Bet'])],
        ['games_played_index', parseGamesPlayed(row['Avg. Games Played Index'])],
        ['coin_in_index', parseGamesPlayed(row['Avg. Coin In Index'])],
        ['release_year', parsedDate.release_year],
        ['release_month', parsedDate.release_month],
        ['game_category', row['Game Category'] ? String(row['Game Category']).trim() : master.game_category],
    ]);
    const changes = {};
    for (const [field, nv] of props) {
        const ov = master[field];
        const same =
            nv === ov ||
            (Number.isNaN(nv) && Number.isNaN(ov)) ||
            (nv != null && ov != null && typeof nv === 'number' && typeof ov === 'number' && Math.abs(nv - ov) < 1e-9);
        if (!same) {
            changes[field] = { old: ov === undefined ? null : ov, new: nv };
        }
    }
    return changes;
}

function validateUpdate(master, changes) {
    const reasons = [];
    const newTheo = Object.prototype.hasOwnProperty.call(changes, 'theo_win') ? changes.theo_win.new : master.theo_win;
    const oldTheo = master.theo_win;
    if (oldTheo > 5 && (newTheo === 0 || newTheo == null)) {
        reasons.push('theo_win_drop_from_high');
    }
    const newMs = Object.prototype.hasOwnProperty.call(changes, 'market_share_pct')
        ? changes.market_share_pct.new
        : master.market_share_pct;
    const oldMs = master.market_share_pct;
    if (marketShareIssue(oldMs, newMs)) {
        reasons.push('market_share_ratio');
    }
    const newCat = Object.prototype.hasOwnProperty.call(changes, 'game_category')
        ? changes.game_category.new
        : master.game_category;
    if (newCat != null && newCat !== '' && !KNOWN_CATEGORIES.includes(newCat)) {
        reasons.push('unknown_game_category');
    }
    return reasons;
}

function filterCsvRows(rows) {
    return rows.filter(r => {
        const name = String(r['Game Name'] || '').trim();
        if (!name) return false;
        const nl = name.toLowerCase();
        if (nl === 'total' || nl === 'grand total') return false;
        const ps = String(r['Parent Supplier'] || '').trim();
        if (!ps || ps === '"') return false;
        return true;
    });
}

function maxMasterNumericId(masters) {
    let max = 0;
    for (const g of masters) {
        const m = /^game-(\d+)-/.exec(g.id || '');
        if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max;
}

function makeSlug(name) {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40);
}

function allocateSlug(baseSlug, usedSlugs) {
    let slug = baseSlug.slice(0, 40) || 'game';
    let n = 2;
    while (usedSlugs.has(slug)) {
        const suf = `_${n}`;
        const maxBase = Math.max(1, 40 - suf.length);
        slug = `${baseSlug.slice(0, maxBase)}${suf}`;
        n++;
    }
    usedSlugs.add(slug);
    return slug;
}

function runPhase1(args) {
    const csvPath = args.csv;
    const decoded = readCsvBuffer(csvPath);
    const delimiter = detectDelimiter(decoded);
    const rawRows = parse(decoded, {
        delimiter,
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
    });
    const rows = rawRows.map(normalizeRowKeys);
    const headerKeys = rows.length ? Object.keys(rows[0]) : [];
    if (!headerKeys.includes('Game Name') || !headerKeys.includes('Theo Win Index')) {
        console.error('CSV must include columns "Game Name" and "Theo Win Index".');
        process.exit(1);
    }
    const filtered = filterCsvRows(rows);
    console.log(`Parsed ${rows.length} rows (${filtered.length} after filter).`);

    const masterPath = MASTER_JSON;
    const masters = JSON.parse(readFileSync(masterPath, 'utf8'));
    const nameKeyCounts = new Map();
    for (const r of filtered) {
        const nk = r['Game Name'].trim().toLowerCase();
        nameKeyCounts.set(nk, (nameKeyCounts.get(nk) || 0) + 1);
    }

    let exactN = 0;
    let relaxedN = 0;
    let fuzzyN = 0;
    const manualReview = [];
    const updateReport = [];
    const unmatchedCsvRows = [];
    const matchedMasterIds = new Set();

    const masterByExact = new Map();
    for (const g of masters) {
        const k = `${normalizeProvider(g.provider)}\0${g.name.trim().toLowerCase()}`;
        if (!masterByExact.has(k)) masterByExact.set(k, g);
    }

    let applyCount = 0;

    for (const raw of filtered) {
        const row = raw;
        const gameName = row['Game Name'].trim();
        if (args.only && gameName !== args.only) continue;

        const csvProv = normalizeProvider(row['Parent Supplier']);
        const nameLower = gameName.toLowerCase();
        const csvTheo = parseTheoWin(row['Theo Win Index']);

        let tier = null;
        let master = null;

        const exactKey = `${csvProv}\0${nameLower}`;
        if (masterByExact.has(exactKey)) {
            tier = 'exact';
            master = masterByExact.get(exactKey);
        } else if (nameKeyCounts.get(nameLower) === 1) {
            const nameMatches = masters.filter(g => g.name.trim().toLowerCase() === nameLower);
            if (nameMatches.length === 1) {
                tier = 'relaxed';
                master = nameMatches[0];
            }
        }

        if (!tier || !master) {
            const fuzzyHits = [];
            const csvTok = tokenize(gameName);
            for (const g of masters) {
                const j = tokenSetJaccard(csvTok, tokenize(g.name));
                if (j < 0.95) continue;
                if (!theoProximityOk(g.theo_win, csvTheo)) continue;
                fuzzyHits.push(g);
            }
            if (fuzzyHits.length === 1) {
                tier = 'fuzzy';
                master = fuzzyHits[0];
                fuzzyN++;
                manualReview.push({
                    name: gameName,
                    provider: csvProv,
                    reason: 'fuzzy_match_never_auto_apply',
                    csv_values: row,
                    master_values: {
                        id: master.id,
                        name: master.name,
                        provider: master.provider,
                        theo_win: master.theo_win,
                    },
                });
                updateReport.push({
                    id: master.id,
                    name: master.name,
                    match_tier: 'fuzzy',
                    changes: {},
                });
                matchedMasterIds.add(master.id);
                continue;
            }
            if (fuzzyHits.length > 1) {
                manualReview.push({
                    name: gameName,
                    provider: csvProv,
                    reason: 'ambiguous_fuzzy',
                    csv_values: row,
                    master_values: fuzzyHits.map(g => ({
                        id: g.id,
                        name: g.name,
                        provider: g.provider,
                    })),
                });
                unmatchedCsvRows.push(row);
                continue;
            }
            unmatchedCsvRows.push(row);
            continue;
        }

        if (tier === 'exact') exactN++;
        if (tier === 'relaxed') relaxedN++;

        const changes = buildChangesFromCsv(master, row);
        const reasons = validateUpdate(master, changes);
        if (Object.keys(changes).length === 0) {
            matchedMasterIds.add(master.id);
            continue;
        }

        if (reasons.length) {
            manualReview.push({
                name: gameName,
                provider: csvProv,
                reason: reasons.join(','),
                csv_values: row,
                master_values: {
                    id: master.id,
                    name: master.name,
                    provider: master.provider,
                    theo_win: master.theo_win,
                    market_share_pct: master.market_share_pct,
                    game_category: master.game_category,
                },
            });
            matchedMasterIds.add(master.id);
            continue;
        }

        if (args.limit != null && applyCount >= args.limit) {
            matchedMasterIds.add(master.id);
            continue;
        }
        applyCount++;

        updateReport.push({
            id: master.id,
            name: master.name,
            match_tier: tier,
            changes,
        });
        matchedMasterIds.add(master.id);
    }

    const unmatchedMaster = masters.filter(g => !matchedMasterIds.has(g.id));

    atomicWriteJson(join(DATA_DIR, 'csv_update_report.json'), updateReport);
    atomicWriteJson(join(DATA_DIR, 'csv_manual_review.json'), manualReview);
    atomicWriteJson(join(DATA_DIR, 'csv_unmatched_master.json'), unmatchedMaster);
    atomicWriteJson(join(DATA_DIR, 'csv_unmatched_csv.json'), unmatchedCsvRows);

    const fpBefore = new Map();
    for (const g of masters) {
        fpBefore.set(g.id, fingerprintGame(g));
    }

    const nextMaster = masters.map(cloneGame);
    const idToGame = new Map(nextMaster.map(g => [g.id, g]));
    for (const entry of updateReport) {
        if (entry.match_tier === 'fuzzy') continue;
        const g = idToGame.get(entry.id);
        if (!g) continue;
        for (const [field, { new: nv }] of Object.entries(entry.changes)) {
            g[field] = nv;
        }
    }

    const fpAfter = new Map();
    for (const g of nextMaster) {
        fpAfter.set(g.id, fingerprintGame(g));
    }

    for (const id of fpBefore.keys()) {
        if (fpBefore.get(id) !== fpAfter.get(id)) {
            console.error(`Fingerprint mismatch for ${id}: protected fields drifted.`);
            process.exit(1);
        }
    }

    if (args.apply) {
        if (manualReview.length > 0 && !args.reviewed) {
            console.error(
                `Refusing --apply: ${manualReview.length} manual review items (use --apply --reviewed to override).`
            );
            process.exit(1);
        }
        atomicWriteJson(MASTER_JSON, nextMaster);
    }

    const M = unmatchedMaster.length;
    const P = unmatchedCsvRows.length;
    console.log(
        `Matched: ${exactN} exact, ${relaxedN} relaxed, ${fuzzyN} fuzzy. Manual review: ${manualReview.length}. Unmatched master: ${M}. Unmatched CSV: ${P}.`
    );

    return { nextMaster, masters };
}

function rowFailsPhase2NewGameFilter(row, isTableName) {
    const rawName = String(row['Game Name'] || '').trim();
    const cat = String(row['Game Category'] || '').trim() || 'Slot';
    const theo = parseTheoWin(row['Theo Win Index']);
    const prov = normalizeProvider(row['Parent Supplier']);
    return !rawName || cat !== 'Slot' || !(theo > 0) || !prov || prov === '"' || isTableName(rawName);
}

function runPhase2(args, baseMasters) {
    const unmatchedPath = join(DATA_DIR, 'csv_unmatched_csv.json');
    if (!existsSync(unmatchedPath)) {
        console.error('Missing data/csv_unmatched_csv.json. Run Phase 1 first.');
        process.exit(1);
    }
    const rows = JSON.parse(readFileSync(unmatchedPath, 'utf8'));

    const isTableName = name => {
        const l = String(name).toLowerCase();
        return TABLE_KEYWORDS.some(kw => l.includes(kw));
    };

    let skipped = 0;
    for (const row of rows) {
        if (rowFailsPhase2NewGameFilter(row, isTableName)) skipped++;
    }

    const byNameProv = new Map();
    for (const row of rows) {
        if (rowFailsPhase2NewGameFilter(row, isTableName)) continue;
        const rawName = String(row['Game Name'] || '').trim();
        const prov = normalizeProvider(row['Parent Supplier']);
        const nk = `${rawName.toLowerCase()}\0${prov}`;
        const prev = byNameProv.get(nk);
        const theo = parseTheoWin(row['Theo Win Index']);
        if (!prev || theo > parseTheoWin(prev['Theo Win Index'])) byNameProv.set(nk, row);
    }

    const nameGroups = new Map();
    for (const row of byNameProv.values()) {
        const nl = row['Game Name'].trim().toLowerCase();
        if (!nameGroups.has(nl)) nameGroups.set(nl, []);
        nameGroups.get(nl).push(row);
    }

    const toAdd = [];
    const phase2Manual = [];

    for (const group of nameGroups.values()) {
        if (group.length === 1) {
            toAdd.push(group[0]);
            continue;
        }
        const provs = new Set(group.map(r => normalizeProvider(r['Parent Supplier'])));
        if (provs.size === 1) {
            const best = group.reduce((a, b) =>
                parseTheoWin(a['Theo Win Index']) >= parseTheoWin(b['Theo Win Index']) ? a : b
            );
            toAdd.push(best);
        } else {
            for (const r of group) {
                const prov = normalizeProvider(r['Parent Supplier']);
                const base = r['Game Name'].trim();
                const dis = `${base} (${prov})`;
                toAdd.push({ ...r, 'Game Name': dis, __disambiguated: true });
                phase2Manual.push({
                    name: dis,
                    provider: prov,
                    reason: 'same_name_diff_provider',
                    csv_values: r,
                    master_values: null,
                });
            }
        }
    }

    const master = baseMasters.map(cloneGame);
    const usedIds = new Set(master.map(g => g.id));
    const usedSlugs = new Set();
    for (const g of master) {
        const m = /^game-\d+-(.+)$/.exec(g.id);
        if (m) usedSlugs.add(m[1]);
    }

    let num = maxMasterNumericId(master);
    const report = [];

    for (const row of toAdd) {
        const displayName = row['Game Name'].trim();
        const parsedDate = parseReleaseDate(row['Month, Year of OGPD Release Date']);
        num += 1;
        const baseSlug = makeSlug(displayName);
        const slug = allocateSlug(baseSlug, usedSlugs);
        const idStr = String(num);
        const padded = idStr.length < 4 ? idStr.padStart(4, '0') : idStr;
        let id = `game-${padded}-${slug}`;
        while (usedIds.has(id)) {
            num += 1;
            const idStr2 = String(num);
            const pad2 = idStr2.length < 4 ? idStr2.padStart(4, '0') : idStr2;
            id = `game-${pad2}-${slug}`;
        }
        usedIds.add(id);

        const newGame = {
            id,
            name: displayName,
            provider: normalizeProvider(row['Parent Supplier']),
            game_category: row['Game Category'] || 'Slot',
            release_year: parsedDate.release_year,
            release_month: parsedDate.release_month,
            sites: parseSites(row['Casinos (Sites)']),
            avg_bet: parseAvgBet(row['Avg. Average Bet']),
            median_bet: parseAvgBet(row['Median Avg Bet']),
            games_played_index: parseGamesPlayed(row['Avg. Games Played Index']),
            coin_in_index: parseGamesPlayed(row['Avg. Coin In Index']),
            theo_win: parseTheoWin(row['Theo Win Index']),
            market_share_pct: parseMarketShare(row['% of Total GGR']),
            description: null,
            theme_primary: null,
            themes_all: [],
            features: [],
            symbols: [],
            html_rules_available: false,
            game_sub_category: null,
            jackpot_structure: null,
            last_modified_date: null,
            win_evaluation: null,
            extraction_date: null,
            art_theme: null,
            art_theme_secondary: null,
            art_characters: null,
            art_elements: null,
            art_narrative: null,
            art_color_tone: null,
            art_confidence: null,
            art_character_categories: null,
            background_description: null,
            is_branded: false,
            screenshot_quality: null,
        };
        master.push(newGame);
        const rep = { id, name: displayName, provider: newGame.provider, theo_win: newGame.theo_win };
        if (row.__disambiguated) rep.disambiguated = true;
        report.push(rep);
    }

    atomicWriteJson(join(DATA_DIR, 'csv_new_games_report.json'), report);
    if (phase2Manual.length) {
        const manualPath = join(DATA_DIR, 'csv_manual_review.json');
        const prior = existsSync(manualPath) ? JSON.parse(readFileSync(manualPath, 'utf8')) : [];
        atomicWriteJson(manualPath, prior.concat(phase2Manual));
    }
    atomicWriteJson(MASTER_JSON, master);

    const firstId = report[0]?.id;
    const lastId = report[report.length - 1]?.id;
    console.log(
        `Added ${report.length} new games (IDs ${firstId || 'n/a'} to ${lastId || 'n/a'}). Skipped: ${skipped} (non-slot/no-theo/invalid).`
    );
}

function main() {
    const args = parseArgs(process.argv);
    if (!args.csv) {
        console.error(
            'Usage: node scripts/data/update-from-csv.mjs --csv <path> [--dry-run] [--apply] [--apply --reviewed] [--add-new] [--limit N] [--only <name>]'
        );
        process.exit(1);
    }

    if (args.addNew && !args.apply) {
        const masterPath = MASTER_JSON;
        const baseMasters = JSON.parse(readFileSync(masterPath, 'utf8'));
        runPhase2(args, baseMasters);
        return;
    }

    const { nextMaster } = runPhase1(args);

    if (args.addNew && args.apply) {
        runPhase2(args, nextMaster);
    }
}

main();
