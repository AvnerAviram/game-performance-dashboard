#!/usr/bin/env node
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { MASTER_JSON: MASTER_PATH } = require('../../../../src/lib/data-paths.cjs');

const __dirname = resolve(fileURLToPath(import.meta.url), '..');

function die(msg, code = 1) {
    console.error(msg);
    process.exit(code);
}

function printHelp() {
    console.log(`Usage:
  node scripts/data/rollback-fields.mjs --restore-fields --backup <path> --ids <id1,id2> --fields <f1,f2> [--dry-run]
  node scripts/data/rollback-fields.mjs --remove-ids --ids <id1,id2> [--dry-run]
  node scripts/data/rollback-fields.mjs --help`);
}

function parseArgs(argv) {
    const out = {
        mode: null,
        backup: null,
        idsRaw: null,
        fieldsRaw: null,
        dryRun: false,
        help: false,
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--help' || a === '-h') {
            out.help = true;
        } else if (a === '--dry-run') {
            out.dryRun = true;
        } else if (a === '--restore-fields') {
            if (out.mode) die('error: specify only one of --restore-fields or --remove-ids');
            out.mode = 'restore';
        } else if (a === '--remove-ids') {
            if (out.mode) die('error: specify only one of --restore-fields or --remove-ids');
            out.mode = 'remove';
        } else if (a === '--backup') {
            const v = argv[++i];
            if (v == null || v.startsWith('--')) die('error: --backup requires a path');
            out.backup = v;
        } else if (a === '--ids') {
            const v = argv[++i];
            if (v == null || v.startsWith('--')) die('error: --ids requires a comma-separated list');
            out.idsRaw = v;
        } else if (a === '--fields') {
            const v = argv[++i];
            if (v == null || v.startsWith('--')) die('error: --fields requires a comma-separated list');
            out.fieldsRaw = v;
        } else {
            die(`error: unknown argument: ${a}`);
        }
    }
    return out;
}

function parseCommaList(raw) {
    return raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

function loadJsonArray(path, label) {
    let raw;
    try {
        raw = readFileSync(path, 'utf8');
    } catch (e) {
        if (e && e.code === 'ENOENT') die(`error: file not found: ${path}`);
        die(`error: cannot read ${label}: ${path}\n${e.message}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        die(`error: invalid JSON (${label}): ${path}\n${e.message}`);
    }
    if (!Array.isArray(parsed)) die(`error: ${label} must be a JSON array: ${path}`);
    return parsed;
}

function assertUniqueIds(games, label) {
    const seen = new Set();
    for (const g of games) {
        const id = g && g.id;
        if (id == null || id === '') die(`error: game missing id in ${label}`);
        if (seen.has(id)) die(`error: duplicate id "${id}" in ${label}`);
        seen.add(id);
    }
}

function buildIdMap(games, label) {
    const map = new Map();
    for (const g of games) {
        if (!g || g.id == null) die(`error: invalid game entry in ${label}`);
        if (map.has(g.id)) die(`error: duplicate id "${g.id}" in ${label}`);
        map.set(g.id, g);
    }
    return map;
}

function copyFieldFromBackup(dst, src, field, gameId) {
    if (!Object.prototype.hasOwnProperty.call(src, field)) {
        die(`error: field "${field}" missing in backup for id "${gameId}"`);
    }
    const v = src[field];
    if (v !== null && typeof v === 'object') {
        dst[field] = structuredClone(v);
    } else {
        dst[field] = v;
    }
}

function writeMasterAtomic(masterPath, games, dryRun) {
    assertUniqueIds(games, 'game_data_master.json (output)');
    const json = `${JSON.stringify(games, null, 2)}\n`;
    if (dryRun) return;
    const tmp = `${masterPath}.tmp`;
    writeFileSync(tmp, json, 'utf8');
    renameSync(tmp, masterPath);
}

function runRestore(opts) {
    if (!opts.backup) die('error: --restore-fields requires --backup <path>');
    if (!opts.idsRaw) die('error: --restore-fields requires --ids <id1,id2,...>');
    if (!opts.fieldsRaw) die('error: --restore-fields requires --fields <field1,...>');

    const ids = parseCommaList(opts.idsRaw);
    const fields = parseCommaList(opts.fieldsRaw);
    if (ids.length === 0) die('error: --ids is empty');
    if (fields.length === 0) die('error: --fields is empty');

    if (!existsSync(opts.backup)) die(`error: backup file not found: ${opts.backup}`);
    const backupGames = loadJsonArray(opts.backup, 'backup');
    const backupMap = buildIdMap(backupGames, 'backup');

    const masterGames = loadJsonArray(MASTER_PATH, 'game_data_master.json');
    const beforeCount = masterGames.length;
    const masterMap = buildIdMap(masterGames, 'game_data_master.json');

    const idSet = new Set(ids);
    if (idSet.size !== ids.length) die('error: duplicate id in --ids list');

    for (const id of ids) {
        if (!backupMap.has(id)) die(`error: id not found in backup: ${id}`);
        if (!masterMap.has(id)) die(`error: id not found in game_data_master.json: ${id}`);
    }

    if (opts.dryRun) {
        console.log(
            `[dry-run] would restore fields [${fields.join(', ')}] for ${ids.length} game(s): ${ids.join(', ')}`
        );
        return;
    }

    for (const id of ids) {
        const current = masterMap.get(id);
        const backupGame = backupMap.get(id);
        for (const f of fields) {
            copyFieldFromBackup(current, backupGame, f, id);
        }
    }

    assertUniqueIds(masterGames, 'game_data_master.json (after restore)');
    if (masterGames.length !== beforeCount) die('error: internal error: master length changed during restore');

    writeMasterAtomic(MASTER_PATH, masterGames, false);
    console.log(`Restored ${fields.length} field(s) for ${ids.length} game(s): [${fields.join(', ')}]`);
}

function runRemove(opts) {
    if (!opts.idsRaw) die('error: --remove-ids requires --ids <id1,id2,...>');
    const ids = parseCommaList(opts.idsRaw);
    if (ids.length === 0) die('error: --ids is empty');

    const masterGames = loadJsonArray(MASTER_PATH, 'game_data_master.json');
    const beforeCount = masterGames.length;
    const idsSet = new Set(ids);
    const maxDrop = ids.length;

    const filtered = masterGames.filter(g => !idsSet.has(g.id));
    const removed = beforeCount - filtered.length;

    if (removed > maxDrop) {
        die(`error: would remove ${removed} games but only ${maxDrop} id(s) listed; aborting`);
    }

    assertUniqueIds(filtered, 'game_data_master.json (after filter)');

    if (opts.dryRun) {
        console.log(
            `[dry-run] would remove ${removed} game(s) (${filtered.length} remaining); ids requested: ${ids.join(', ')}`
        );
        return;
    }

    writeMasterAtomic(MASTER_PATH, filtered, false);
    console.log(`Removed ${removed} game(s) (${filtered.length} remaining)`);
}

mkdirSync(__dirname, { recursive: true });

const opts = parseArgs(process.argv);

if (opts.help) {
    printHelp();
    process.exit(0);
}

if (!opts.mode) {
    printHelp();
    die('error: specify --restore-fields or --remove-ids', 1);
}

if (opts.mode === 'restore') {
    runRestore(opts);
} else {
    runRemove(opts);
}
