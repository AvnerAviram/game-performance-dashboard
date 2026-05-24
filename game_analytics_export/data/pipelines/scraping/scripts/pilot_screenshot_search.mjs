#!/usr/bin/env node
/**
 * Pilot: Search-based screenshot acquisition.
 * Uses DuckDuckGo site-restricted search to find game pages,
 * then visits with Playwright to extract gameplay screenshots.
 *
 * Usage:
 *   node data/pilot_screenshot_search.mjs
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const { SCREENSHOTS_DIR } = require('../../../../src/lib/data-paths.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS_DIR = SCREENSHOTS_DIR;
const PILOT_DIR = path.join(SS_DIR, '_pilot_search');
const RESULTS_PATH = path.join(__dirname, '_pilot_search_results.json');

const PILOT_GAMES = [
  { name: "Gobble Gobble Gobble", provider: "Evolution" },
  { name: "Banana Rush", provider: "Play'n GO" },
  { name: "Toymaker Magic", provider: "Light & Wonder" },
  { name: "Megajackpots Cash Eruption", provider: "IGT" },
  { name: "Fire And Roses Joker 2 All In", provider: "Games Global" },
  { name: "3 Lucky Maneki Hold And Spin", provider: "Aristocrat" },
  { name: "Triple Double Da Vinci Diamonds", provider: "High 5 Games" },
  { name: "Heads Up Hold Em", provider: "Playtech" },
  { name: "Snow Slingers", provider: "Hacksaw Gaming" },
  { name: "12 Coins Grand Platinum Edition Santas Jackpot", provider: "Wazdan" },
];

const SOURCES = [
  { id: 'vso', site: 'vegasslotsonline.com', label: 'VegasSlotsOnline' },
  { id: 'bwb', site: 'bigwinboard.com', label: 'BigWinBoard' },
];

const DDG_URL = 'https://html.duckduckgo.com/html/';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildSlug(name) { return name.replace(/\s+/g, '-'); }

async function searchDDG(query) {
  const url = new URL(DDG_URL);
  url.searchParams.set('q', query);

  const resp = await fetch(url.toString(), {
    headers: HEADERS,
    redirect: 'follow',
  });
  if (!resp.ok) return [];

  const html = await resp.text();
  const links = [];
  const linkRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"/g;
  let m;
  while ((m = linkRegex.exec(html)) !== null) {
    const raw = m[1];
    const uddg = raw.match(/uddg=([^&]+)/);
    if (uddg) {
      links.push(decodeURIComponent(uddg[1]));
    }
  }
  return links.slice(0, 5);
}

async function extractVSOImage(page) {
  return await page.evaluate(() => {
    const imgs = document.querySelectorAll('img');
    for (const img of imgs) {
      const src = img.src || '';
      if (src.includes('game-hub-admin-media-library-production.s3') &&
          !src.includes('logo') && !src.includes('icon') &&
          (img.naturalWidth > 300 || img.width > 300)) {
        return src;
      }
    }
    const bgEl = document.querySelector('[style*="game-hub-admin-media-library-production"]');
    if (bgEl) {
      const style = bgEl.getAttribute('style') || '';
      const urlMatch = style.match(/url\(["']?([^"')]+)/);
      if (urlMatch) return urlMatch[1];
    }
    const nextImg = document.querySelector('img[src*="_next/image"]');
    if (nextImg) {
      const src = nextImg.src;
      if (src.includes('game-hub-admin-media-library') && !src.includes('logo')) {
        return src;
      }
    }
    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg && ogImg.content && !ogImg.content.includes('logo')) return ogImg.content;
    return null;
  });
}

async function extractBWBImage(page) {
  return await page.evaluate(() => {
    const ogImg = document.querySelector('meta[property="og:image"]');
    if (ogImg && ogImg.content) return ogImg.content;
    const imgs = document.querySelectorAll('.entry-content img, article img, .review-content img');
    for (const img of imgs) {
      const src = img.src || '';
      const alt = (img.alt || '').toLowerCase();
      if ((src.includes('/uploads/') || src.includes('wp-content')) &&
          !src.includes('logo') && !src.includes('icon') && !src.includes('avatar') &&
          (img.naturalWidth > 300 || img.width > 300)) {
        return src;
      }
    }
    return null;
  });
}

function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const fullUrl = url.startsWith('http') ? url : 'https:' + url;
    const mod = fullUrl.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    mod.get(fullUrl, { headers: { 'User-Agent': HEADERS['User-Agent'] } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        downloadImage(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(dest);
        if (stats.size < 3000) {
          fs.unlinkSync(dest);
          reject(new Error(`Too small (${stats.size}b)`));
          return;
        }
        resolve(stats.size);
      });
    }).on('error', err => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  if (!fs.existsSync(PILOT_DIR)) fs.mkdirSync(PILOT_DIR, { recursive: true });

  const results = [];
  const browser = await chromium.launch({
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    userAgent: HEADERS['User-Agent'],
    viewport: { width: 1280, height: 720 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  console.log(`\n=== Screenshot Search Pilot (${PILOT_GAMES.length} games × ${SOURCES.length} sources) ===\n`);

  for (let gi = 0; gi < PILOT_GAMES.length; gi++) {
    const game = PILOT_GAMES[gi];
    const slug = buildSlug(game.name);
    const gameResult = { name: game.name, provider: game.provider, slug, attempts: [] };
    console.log(`\n[${gi+1}/${PILOT_GAMES.length}] ${game.name} (${game.provider})`);

    for (const source of SOURCES) {
      const query = `"${game.name}" ${game.provider} slot site:${source.site}`;
      console.log(`  Searching ${source.label}: ${query}`);

      const attempt = { source: source.id, query, status: 'searching', timestamp: new Date().toISOString() };

      try {
        const links = await searchDDG(query);
        await sleep(3000);

        if (links.length === 0) {
          attempt.status = 'no_results';
          console.log(`    -> No results`);
          gameResult.attempts.push(attempt);
          continue;
        }

        attempt.pageUrl = links[0];
        console.log(`    -> Found: ${links[0]}`);

        const page = await context.newPage();
        try {
          await page.goto(links[0], { waitUntil: 'networkidle', timeout: 25000 });
          await sleep(2000);

          let imgUrl;
          if (source.id === 'vso') {
            imgUrl = await extractVSOImage(page);
          } else {
            imgUrl = await extractBWBImage(page);
          }

          await page.close();

          if (!imgUrl) {
            attempt.status = 'no_image';
            console.log(`    -> Page loaded but no image found`);
            gameResult.attempts.push(attempt);
            continue;
          }

          attempt.imgUrl = imgUrl;
          const ext = imgUrl.match(/\.(jpg|jpeg|png|webp)/i)?.[0] || '.jpg';
          const filename = `${slug}__${source.id}${ext}`;
          const dest = path.join(PILOT_DIR, filename);

          try {
            const size = await downloadImage(imgUrl, dest);
            attempt.status = 'ok';
            attempt.file = filename;
            attempt.size = size;
            console.log(`    -> OK! ${filename} (${(size/1024).toFixed(0)}KB)`);
          } catch (dlErr) {
            attempt.status = 'download_failed';
            attempt.error = dlErr.message;
            console.log(`    -> Download failed: ${dlErr.message}`);
          }
        } catch (navErr) {
          await page.close().catch(() => {});
          attempt.status = 'page_error';
          attempt.error = navErr.message;
          console.log(`    -> Page error: ${navErr.message}`);
        }
      } catch (searchErr) {
        attempt.status = 'search_error';
        attempt.error = searchErr.message;
        console.log(`    -> Search error: ${searchErr.message}`);
      }

      gameResult.attempts.push(attempt);
      await sleep(3000);
    }

    results.push(gameResult);
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  }

  await browser.close();

  // Summary
  console.log('\n\n=== PILOT SUMMARY ===');
  for (const source of SOURCES) {
    const ok = results.filter(r => r.attempts.some(a => a.source === source.id && a.status === 'ok')).length;
    console.log(`  ${source.label}: ${ok}/${results.length} found (${Math.round(ok/results.length*100)}%)`);
  }
  const anyOk = results.filter(r => r.attempts.some(a => a.status === 'ok')).length;
  console.log(`  Combined (any source): ${anyOk}/${results.length} (${Math.round(anyOk/results.length*100)}%)`);

  console.log('\nResults saved to:', RESULTS_PATH);
  console.log('Images saved to:', PILOT_DIR);
}

main().catch(err => { console.error(err); process.exit(1); });
