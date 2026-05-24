#!/usr/bin/env node
/**
 * Bing Image Search screenshot acquisition.
 * 
 * Searches Bing Images for gameplay screenshots, downloads top candidates,
 * picks the largest (most likely gameplay) image.
 *
 * Usage:
 *   node bing_screenshot_batch.mjs                    # run all missing
 *   node bing_screenshot_batch.mjs --limit 200        # first 200 only
 *   node bing_screenshot_batch.mjs --offset 200       # skip first 200
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { MASTER_JSON, SCREENSHOTS_DIR } = require('../../../../src/lib/data-paths.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.join(__dirname, '..', 'state');
const LOG_FILE = path.join(STATE_DIR, 'bing_batch_log.json');

if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const offsetIdx = args.indexOf('--offset');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : Infinity;
const OFFSET = offsetIdx !== -1 ? parseInt(args[offsetIdx + 1]) : 0;

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function download(url, dest, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const fullUrl = url.startsWith('http') ? url : 'https:' + url;
    const mod = fullUrl.startsWith('https') ? https : http;
    const req = mod.get(fullUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      timeout
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, dest, timeout).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(dest, buf);
        resolve(buf.length);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// Load master, find missing
const games = JSON.parse(fs.readFileSync(MASTER_JSON, 'utf8'));
const existing = new Set(
  fs.readdirSync(SCREENSHOTS_DIR)
    .filter(f => !f.startsWith('.') && !f.startsWith('_'))
    .map(f => normalize(f.replace(/\.(jpg|jpeg|png|webp)$/i, '')))
);

const missing = games
  .filter(g => !existing.has(normalize(g.name)))
  .slice(OFFSET, OFFSET + LIMIT);

console.log(`Bing Screenshot Batch`);
console.log(`Total missing: ${missing.length} (offset=${OFFSET}, limit=${LIMIT})`);
console.log(`Saving to: ${SCREENSHOTS_DIR}`);
console.log(`Log: ${LOG_FILE}`);
console.log('');

// Load or create log
let log = [];
if (fs.existsSync(LOG_FILE)) {
  log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
}
const alreadyProcessed = new Set(log.map(l => normalize(l.name)));

const toProcess = missing.filter(g => !alreadyProcessed.has(normalize(g.name)));
console.log(`Already processed: ${missing.length - toProcess.length}, remaining: ${toProcess.length}`);
console.log('');

const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: ['--disable-blink-features=AutomationControlled']
});
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  viewport: { width: 1280, height: 900 }
});

let ok = 0, failed = 0;
const startTime = Date.now();

for (let i = 0; i < toProcess.length; i++) {
  const game = toProcess[i];
  const query = encodeURIComponent(game.name + ' ' + (game.provider || '') + ' slot gameplay');
  const url = 'https://www.bing.com/images/search?q=' + query;

  const page = await ctx.newPage();
  let status = 'failed';
  let savedFile = null;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
    await page.waitForTimeout(2500 + Math.random() * 1500);

    // Extract top 8 full-size image URLs from Bing
    const results = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.iusc, a[m]'));
      const items = [];
      for (const link of links.slice(0, 8)) {
        try {
          const m = link.getAttribute('m');
          if (m) {
            const data = JSON.parse(m);
            if (data.murl) items.push(data.murl);
          }
        } catch (e) {}
      }
      return items;
    });

    if (results.length === 0) {
      status = 'no_results';
    } else {
      // Download candidates, pick largest > 20KB
      let bestSize = 0;
      const tmpFile = '/tmp/_bing_candidate.tmp';

      for (let j = 0; j < Math.min(results.length, 6); j++) {
        try {
          const size = await download(results[j], tmpFile);
          if (size > 20000 && size > bestSize) {
            bestSize = size;
            const filename = game.name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '') + '.jpg';
            const dest = path.join(SCREENSHOTS_DIR, filename);
            fs.copyFileSync(tmpFile, dest);
            savedFile = filename;
          }
        } catch (e) { /* skip candidate */ }
      }

      try { fs.unlinkSync(tmpFile); } catch (e) {}

      if (savedFile) {
        status = 'ok';
        ok++;
      } else {
        status = 'no_good_image';
      }
    }
  } catch (e) {
    status = 'error';
  }

  await page.close();

  if (status !== 'ok') failed++;

  // Log result
  log.push({ name: game.name, provider: game.provider, status, file: savedFile });

  // Progress report every 10 games
  if ((i + 1) % 10 === 0 || i === toProcess.length - 1) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const rate = ((ok + failed) / elapsed * 60).toFixed(1);
    console.log(`[${elapsed}s] ${i + 1}/${toProcess.length} | OK: ${ok} | Failed: ${failed} | Rate: ${rate}/min`);
    // Save log periodically
    fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
  }

  // Random delay between searches (2-4s)
  await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
}

await browser.close();

// Final save
fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));

console.log('');
console.log(`=== DONE ===`);
console.log(`OK: ${ok} | Failed: ${failed} | Total: ${ok + failed}`);
console.log(`Success rate: ${(ok / (ok + failed) * 100).toFixed(1)}%`);
console.log(`Log saved: ${LOG_FILE}`);
