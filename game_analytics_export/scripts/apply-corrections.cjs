#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TICKETS_FILE = path.join(__dirname, '..', 'server', 'tickets.json');
const MASTER_FILE = path.join(DATA_DIR, 'game_data_master.json');

const dryRun = process.argv.includes('--dry-run');

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
    if (!fs.existsSync(TICKETS_FILE)) {
        console.log('No tickets.json found — nothing to apply.');
        return;
    }
    if (!fs.existsSync(MASTER_FILE)) {
        console.error('game_data_master.json not found');
        process.exit(1);
    }

    const tickets = loadJson(TICKETS_FILE);
    const corrections = tickets.filter(t => t.issueType === 'data-correction' && t.status === 'approved');

    if (corrections.length === 0) {
        console.log('No approved data-correction tickets to apply.');
        return;
    }

    console.log(`Found ${corrections.length} approved correction(s)${dryRun ? ' (DRY RUN)' : ''}\n`);

    const games = loadJson(MASTER_FILE);
    const gameIndex = new Map(games.map(g => [g.name, g]));
    let applied = 0;
    let skipped = 0;

    for (const ticket of corrections) {
        const game = gameIndex.get(ticket.gameName);
        if (!game) {
            console.log(`  SKIP ${ticket.id}: game "${ticket.gameName}" not found in master`);
            skipped++;
            continue;
        }

        const field = ticket.fieldPath;
        const proposed = ticket.proposedValue;

        if (!field || proposed == null || proposed === '') {
            console.log(`  SKIP ${ticket.id}: no field/value to apply`);
            skipped++;
            continue;
        }

        const oldVal = game[field];
        let newVal = proposed;
        if (typeof oldVal === 'number' && !isNaN(Number(proposed))) {
            newVal = Number(proposed);
        }

        console.log(
            `  ${ticket.id}: ${ticket.gameName}.${field}: ${JSON.stringify(oldVal)} → ${JSON.stringify(newVal)}`
        );

        if (!dryRun) {
            game[field] = newVal;
            ticket.status = 'resolved';
            ticket.resolvedAt = new Date().toISOString();
            ticket.resolvedBy = 'apply-corrections';
        }
        applied++;
    }

    console.log(`\n${applied} applied, ${skipped} skipped${dryRun ? ' (DRY RUN — no files written)' : ''}`);

    if (!dryRun && applied > 0) {
        fs.writeFileSync(MASTER_FILE, JSON.stringify(games, null, 2));
        fs.writeFileSync(TICKETS_FILE, JSON.stringify(tickets, null, 2));
        console.log('\nFiles updated. Run "npm run build:data" to rebuild parquet.');
    }
}

main();
