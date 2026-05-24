#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { SCREENSHOTS_DIR } = require('../../../../src/lib/data-paths.cjs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

const log = JSON.parse(fs.readFileSync(path.join(SCREENSHOTS_DIR, 'playwright_download_log.json'), 'utf8'));

const scOk = Object.entries(log)
    .filter(([k, v]) => v.status === 'ok' && v.file)
    .filter(([k, v]) => fs.existsSync(path.join(SCREENSHOTS_DIR, v.file)))
    .map(([slug, entry]) => ({ slug, file: entry.file, game: entry.game }));

console.log(`Found ${scOk.length} SC screenshots to review`);

const cards = scOk.map(({ slug, file, game }) => {
    const name = game || slug.replace(/-/g, ' ');
    return `<div class="card" data-game="${name}" onclick="this.classList.toggle('rejected')">
<img src="../../../game_analytics_export/data/screenshots/${file}" onerror="this.parentElement.style.display='none'"/>
<div class="name">${name}</div>
<div class="status">Click to reject</div>
</div>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html><head><title>SC Screenshot Review</title>
<style>
body { font-family: system-ui; background: #1a1a2e; color: #eee; padding: 20px; }
h1 { color: #fff; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.card { background: #16213e; border-radius: 8px; overflow: hidden; cursor: pointer; border: 3px solid transparent; transition: all 0.2s; }
.card.rejected { border-color: #e74c3c; opacity: 0.5; }
.card img { width: 100%; height: 220px; object-fit: cover; }
.card .name { padding: 8px 12px; font-size: 14px; font-weight: 600; }
.card .status { padding: 4px 12px 8px; font-size: 12px; color: #888; }
.actions { margin: 20px 0; }
button { padding: 10px 20px; margin-right: 10px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
.export-btn { background: #2ecc71; color: #fff; }
.info { color: #888; margin-bottom: 20px; }
</style></head>
<body>
<h1>SlotCatalog Screenshots - Review (${scOk.length} games)</h1>
<p class="info">Click to reject bad screenshots. Then export your decisions.</p>
<div class="actions">
<button class="export-btn" onclick="exportDecisions()">Export Decisions</button>
</div>
<div class="grid">
${cards}
</div>
<script>
function exportDecisions() {
    const cards = document.querySelectorAll('.card');
    const decisions = [];
    cards.forEach(c => {
        decisions.push({ game: c.dataset.game, decision: c.classList.contains('rejected') ? 'not_gameplay' : 'ok' });
    });
    const json = JSON.stringify(decisions, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'sc-review-decisions.json'; a.click();
    let ta = document.getElementById('output');
    if (!ta) { ta = document.createElement('textarea'); ta.id = 'output'; ta.rows = 10; ta.cols = 80; ta.style.cssText='display:block;margin-top:20px;background:#0a0a1a;color:#eee;border:1px solid #444;padding:10px;'; document.body.appendChild(ta); }
    ta.value = json;
}
</script>
</body></html>`;

const reviewDir = path.join(PROJECT_ROOT, 'docs/reviews/spot-checks');
fs.mkdirSync(reviewDir, { recursive: true });
const reviewPath = path.join(reviewDir, '2026-05-07-sc-batch-review.html');
fs.writeFileSync(reviewPath, html);
console.log(`Review HTML saved to: ${reviewPath}`);
