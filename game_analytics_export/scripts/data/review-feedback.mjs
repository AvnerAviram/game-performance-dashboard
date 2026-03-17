#!/usr/bin/env node
/**
 * Review user-submitted feedback from feedback.jsonl
 * Usage: node scripts/data/review-feedback.mjs [--status new|reviewed|all]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEEDBACK_PATH = join(__dirname, '..', '..', 'data', 'feedback.jsonl');

const statusFilter = process.argv.includes('--status')
  ? process.argv[process.argv.indexOf('--status') + 1]
  : 'new';

if (!existsSync(FEEDBACK_PATH)) {
  console.log('No feedback file found at:', FEEDBACK_PATH);
  process.exit(0);
}

const lines = readFileSync(FEEDBACK_PATH, 'utf-8').trim().split('\n').filter(Boolean);
const entries = lines.map((line, i) => ({ ...JSON.parse(line), _line: i }));

const filtered = statusFilter === 'all'
  ? entries
  : entries.filter(e => e.status === statusFilter);

if (filtered.length === 0) {
  console.log(`No feedback with status="${statusFilter}".`);
  process.exit(0);
}

console.log(`\n=== ${filtered.length} feedback entries (status: ${statusFilter}) ===\n`);

for (const entry of filtered) {
  console.log(`[${entry._line}] ${entry.submitted_at}`);
  console.log(`  Game: ${entry.game_name} (${entry.game_id || 'no id'})`);
  console.log(`  Type: ${entry.issue_type}`);
  console.log(`  Desc: ${entry.description}`);
  console.log(`  Status: ${entry.status}`);
  console.log('');
}

console.log(`Total: ${filtered.length} entries`);
