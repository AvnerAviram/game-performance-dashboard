#!/usr/bin/env node
/**
 * Prints a single coverage % line from coverage-summary.json
 * Run after: npm run test
 */
const fs = require('fs');
const path = require('path');

const summaryPath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
if (!fs.existsSync(summaryPath)) {
  process.exit(0);
}
try {
  const data = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const total = data.total;
  if (total && total.lines) {
    const pct = total.lines.pct ?? total.statements?.pct ?? 0;
    console.log('\n\x1b[1mCoverage: %s\x1b[0m\n', pct + '%');
  }
} catch (_) {
  process.exit(0);
}
