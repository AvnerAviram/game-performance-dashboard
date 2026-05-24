#!/usr/bin/env node
/**
 * Smart SC screenshot download pipeline:
 * 1. Uses sitemap-matched slugs (correct URLs)
 * 2. Downloads images
 * 3. Size gate: auto-reject < 60KB
 * 4. Claude Vision pre-screen on remaining (Haiku, 200x200px, ~$0.0001/image)
 * 5. Saves results with checkpoints after every game
 *
 * Usage:
 *   node sc_smart_download.mjs --download --limit 50
 *   node sc_smart_download.mjs --download                    # all matched games
 *   node sc_smart_download.mjs --stats                       # show progress
 *   node sc_smart_download.mjs --prescreen                   # run Claude on downloaded images
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
const STATE_DIR = path.resolve(__dirname, '../state');
const MATCHED_PATH = path.join(STATE_DIR, 'sc_matched_games.json');
const LOG_PATH = path.join(STATE_DIR, 'sc_smart_download_log.json');
const PRESCREEN_PATH = path.join(STATE_DIR, 'sc_prescreen_results.json');
const BASE_URL = 'https://slotcatalog.com';
const MIN_SIZE_BYTES = 60000;
const DELAY_MS = 1500;

function loadLog() {
    if (!fs.existsSync(LOG_PATH)) return {};
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
}

function saveLog(log) {
    fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

function extractImageUrls(html) {
    const urls = [];
    const regex = /userfiles\/image\/games\/[^"'\s>]+/g;
    let m;
    while ((m = regex.exec(html)) !== null) urls.push(m[0]);
    return [...new Set(urls)];
}

function pickBestImage(urls) {
    const fullSize = urls.filter(u => !/_s\.\w+$/i.test(u) && !/_sq\.\w+$/i.test(u));
    const tradGallery = fullSize.filter(u => /-[2-9]\.\w+$/i.test(u));
    if (tradGallery.length > 0) return tradGallery[0];
    const numbered = fullSize.filter(u => /-\d{5,}\.\w+$/i.test(u));
    if (numbered.length > 0) return numbered[0];
    const cover = fullSize.filter(u => /[-_]1\.\w+$/i.test(u));
    if (cover.length > 0) return cover[0];
    if (fullSize.length > 0) return fullSize[0];
    return null;
}

function downloadImage(url, dest) {
    return new Promise((resolve, reject) => {
        const fullUrl = url.startsWith('http') ? url : BASE_URL + '/' + url;
        const mod = fullUrl.startsWith('https') ? https : http;
        const req = mod.get(fullUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Referer': BASE_URL + '/',
                'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            },
            timeout: 10000,
        }, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                downloadImage(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getExtension(url) {
    const m = url.match(/\.(\w+)$/);
    if (!m) return '.jpg';
    const ext = m[1].toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return '.' + ext;
    return '.jpg';
}

async function runDownload(limit) {
    const matched = JSON.parse(fs.readFileSync(MATCHED_PATH, 'utf8'));
    const log = loadLog();

    // Skip already processed
    const pending = matched.filter(g => {
        const slug = g.name.replace(/\s+/g, '-');
        return !log[slug];
    });

    console.log(`Total matched games: ${matched.length}`);
    console.log(`Already processed: ${Object.keys(log).length}`);
    console.log(`Pending: ${pending.length}`);

    const batch = pending.slice(0, limit);
    console.log(`Processing: ${batch.length} games\n`);

    if (batch.length === 0) { console.log('Nothing to do.'); return; }

    const browser = await chromium.launch({
        headless: true,
        channel: 'chrome',
        args: ['--disable-blink-features=AutomationControlled'],
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
    });
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    let ok = 0, sizeRejected = 0, noImage = 0, errors = 0;

    for (let i = 0; i < batch.length; i++) {
        const { name, scSlug, method } = batch[i];
        const slug = name.replace(/\s+/g, '-');
        const url = `${BASE_URL}/en/slots/${scSlug}`;
        const progress = `[${i + 1}/${batch.length}]`;

        try {
            const page = await context.newPage();
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // Wait for CF
            let cfPassed = false;
            for (let w = 0; w < 8; w++) {
                const t = await page.title();
                if (!t.includes('Just a moment') && !t.includes('Checking')) { cfPassed = true; break; }
                await sleep(1000);
            }

            if (!cfPassed) {
                log[slug] = { game: name, status: 'cf_blocked', url };
                saveLog(log);
                errors++;
                await page.close();
                await sleep(DELAY_MS);
                continue;
            }

            const html = await page.content();
            await page.close();

            const imgs = extractImageUrls(html);
            const best = pickBestImage(imgs);

            if (!best) {
                log[slug] = { game: name, status: 'no_image', url };
                saveLog(log);
                noImage++;
                if (i < 5 || (i + 1) % 50 === 0) console.log(`  ${progress} NO_IMAGE ${name}`);
                await sleep(DELAY_MS);
                continue;
            }

            const ext = getExtension(best);
            const filename = slug + ext;
            const dest = path.join(SCREENSHOTS_DIR, filename);
            const fullImgUrl = best.startsWith('http') ? best : BASE_URL + '/' + best;
            const size = await downloadImage(fullImgUrl, dest);

            if (size < MIN_SIZE_BYTES) {
                // Size gate: too small = thumbnail
                fs.unlinkSync(dest);
                log[slug] = { game: name, status: 'size_rejected', url, size, reason: `${(size/1024).toFixed(0)}KB < 60KB` };
                saveLog(log);
                sizeRejected++;
                if (i < 5 || (i + 1) % 50 === 0) console.log(`  ${progress} SIZE_REJECT ${name} (${(size/1024).toFixed(0)}KB)`);
            } else {
                log[slug] = { game: name, status: 'ok', url: fullImgUrl, file: filename, size, method };
                saveLog(log);
                ok++;
                if (i < 5 || (i + 1) % 20 === 0) console.log(`  ${progress} OK ${name} — ${(size/1024).toFixed(0)}KB`);
            }
        } catch (err) {
            log[slug] = { game: name, status: 'error', url, error: err.message };
            saveLog(log);
            errors++;
            if (i < 5 || (i + 1) % 50 === 0) console.log(`  ${progress} ERROR ${name}: ${err.message}`);
        }

        await sleep(DELAY_MS);

        if ((i + 1) % 50 === 0) {
            const rate = (ok / (i + 1) * 100).toFixed(0);
            console.log(`  --- checkpoint ${i + 1}/${batch.length}: ${ok} ok (${rate}%), ${sizeRejected} size_reject, ${noImage} no_img, ${errors} err ---`);
        }
    }

    await browser.close();
    console.log(`\nDone: ${ok} ok, ${sizeRejected} size_rejected, ${noImage} no_image, ${errors} errors`);
    console.log(`Success rate: ${(ok / batch.length * 100).toFixed(0)}%`);
    saveLog(log);
}

async function runPrescreen() {
    const log = loadLog();
    const okEntries = Object.entries(log).filter(([k, v]) => v.status === 'ok' && v.file);

    let prescreen = {};
    if (fs.existsSync(PRESCREEN_PATH)) {
        prescreen = JSON.parse(fs.readFileSync(PRESCREEN_PATH, 'utf8'));
    }

    const pending = okEntries.filter(([slug]) => !prescreen[slug]);
    console.log(`OK screenshots: ${okEntries.length}`);
    console.log(`Already pre-screened: ${Object.keys(prescreen).length}`);
    console.log(`Pending pre-screen: ${pending.length}`);

    if (pending.length === 0) { console.log('Nothing to pre-screen.'); return; }

    const cost = pending.length * 0.0001;
    console.log(`Estimated cost: ~$${cost.toFixed(3)} (Haiku, 200x200px, ${pending.length} images)`);

    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const dotenv = await import('dotenv');
    dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
    dotenv.config({ path: path.resolve(__dirname, '../../.env') });

    const client = new Anthropic();
    let gameplay = 0, rejected = 0, errors = 0;

    for (let i = 0; i < pending.length; i++) {
        const [slug, entry] = pending[i];
        const filePath = path.join(SCREENSHOTS_DIR, entry.file);

        if (!fs.existsSync(filePath)) {
            prescreen[slug] = { quality: 'missing', game: entry.game };
            continue;
        }

        try {
            // Resize to 200x200 JPEG at quality 50 for minimal token cost
            const sharp = (await import('sharp')).default;
            const resized = await sharp(filePath)
                .resize(200, 200, { fit: 'cover' })
                .jpeg({ quality: 50 })
                .toBuffer();

            const imgData = resized.toString('base64');

            const response = await client.messages.create({
                model: 'claude-haiku-4-20250514',
                max_tokens: 10,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imgData } },
                        { type: 'text', text: 'Is this a slot game screenshot showing actual gameplay (reels with symbols visible)? Answer: yes or no' }
                    ]
                }]
            });

            const answer = response.content[0].text.trim().toLowerCase();
            const isGameplay = answer.startsWith('yes');
            prescreen[slug] = { quality: isGameplay ? 'gameplay' : 'not_gameplay', game: entry.game, answer };

            if (isGameplay) gameplay++;
            else rejected++;

            if (i < 3 || (i + 1) % 25 === 0) {
                console.log(`  [${i + 1}/${pending.length}] ${entry.game} → ${isGameplay ? 'GAMEPLAY' : 'NOT_GAMEPLAY'}`);
            }
        } catch (err) {
            prescreen[slug] = { quality: 'error', game: entry.game, error: err.message };
            errors++;
        }

        // Save checkpoint every 10
        if ((i + 1) % 10 === 0) {
            fs.writeFileSync(PRESCREEN_PATH, JSON.stringify(prescreen, null, 2));
        }
    }

    fs.writeFileSync(PRESCREEN_PATH, JSON.stringify(prescreen, null, 2));
    console.log(`\nPre-screen done: ${gameplay} gameplay, ${rejected} not_gameplay, ${errors} errors`);
    console.log(`Saved to: ${PRESCREEN_PATH}`);
}

function showStats() {
    const log = loadLog();
    const entries = Object.values(log);
    const stats = {};
    entries.forEach(e => { stats[e.status] = (stats[e.status] || 0) + 1; });
    console.log('Download log:');
    Object.entries(stats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    console.log(`  Total: ${entries.length}`);

    if (fs.existsSync(PRESCREEN_PATH)) {
        const ps = JSON.parse(fs.readFileSync(PRESCREEN_PATH, 'utf8'));
        const pStats = {};
        Object.values(ps).forEach(e => { pStats[e.quality] = (pStats[e.quality] || 0) + 1; });
        console.log('\nPre-screen results:');
        Object.entries(pStats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    }
}

// --- Main ---
const args = process.argv.slice(2);
if (args.includes('--stats')) {
    showStats();
} else if (args.includes('--prescreen')) {
    runPrescreen().catch(e => { console.error(e); process.exit(1); });
} else if (args.includes('--download')) {
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
    runDownload(limit).catch(e => { console.error(e); process.exit(1); });
} else {
    console.log('Usage:');
    console.log('  node sc_smart_download.mjs --download --limit 50');
    console.log('  node sc_smart_download.mjs --download');
    console.log('  node sc_smart_download.mjs --prescreen');
    console.log('  node sc_smart_download.mjs --stats');
}
