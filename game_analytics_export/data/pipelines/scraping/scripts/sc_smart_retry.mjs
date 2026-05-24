#!/usr/bin/env node
/**
 * Smart SC retry: re-download screenshots for games with non-gameplay images.
 * Uses matched SC slugs (correct URLs), tries ALL images on page,
 * classifies each with Claude Vision until gameplay is found.
 *
 * Usage:
 *   node sc_smart_retry.mjs --limit 50         # retry 50 games
 *   node sc_smart_retry.mjs --limit 50 --dry   # dry run (show URLs only)
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { chromium } from 'playwright';
import { execSync } from 'child_process';

const require = createRequire(import.meta.url);
const { SCREENSHOTS_DIR } = require('../../../../src/lib/data-paths.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.resolve(__dirname, '../state');
const RETRY_LIST_PATH = path.join(STATE_DIR, 'sc_retry_gameplay.json');
const LOG_PATH = path.join(STATE_DIR, 'sc_retry_log.json');
const CLASSIFY_SCRIPT = path.join(__dirname, 'classify_single.py');
const BASE_URL = 'https://slotcatalog.com';
const DELAY_MS = 2000;
const MAX_IMAGES_PER_PAGE = 6;

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

function rankImages(urls) {
    const fullSize = urls.filter(u => !/_s\.\w+$/i.test(u) && !/_sq\.\w+$/i.test(u));
    const thumbs = urls.filter(u => /_s\.\w+$/i.test(u));
    const ranked = [];

    const tradGallery = fullSize.filter(u => /-[2-9]\.\w+$/i.test(u));
    tradGallery.forEach(u => ranked.push({ url: u, type: 'gallery' }));

    const numbered = fullSize.filter(u => /-\d{5,}\.\w+$/i.test(u));
    numbered.forEach(u => { if (!ranked.find(r => r.url === u)) ranked.push({ url: u, type: 'numbered' }); });

    const cover = fullSize.filter(u => /[-_]1\.\w+$/i.test(u));
    cover.forEach(u => { if (!ranked.find(r => r.url === u)) ranked.push({ url: u, type: 'cover' }); });

    fullSize.forEach(u => { if (!ranked.find(r => r.url === u)) ranked.push({ url: u, type: 'other' }); });

    thumbs.forEach(u => {
        const upgraded = u.replace(/_s(\.\w+)$/i, '$1');
        if (!ranked.find(r => r.url === upgraded)) ranked.push({ url: upgraded, type: 'thumb_up' });
    });

    return ranked;
}

function getExtension(url) {
    const m = url.match(/\.(\w+)$/);
    if (!m) return '.jpg';
    const ext = m[1].toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? '.' + ext : '.jpg';
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
            if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                if (buf.length < 2000) { reject(new Error(`Too small (${buf.length}b)`)); return; }
                fs.writeFileSync(dest, buf);
                resolve(buf.length);
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function classifyImage(imagePath) {
    try {
        return execSync(`python3 "${CLASSIFY_SCRIPT}" "${imagePath}"`, {
            timeout: 60000, encoding: 'utf-8',
        }).trim();
    } catch (e) {
        return 'error';
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    const args = process.argv.slice(2);
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 10;
    const dryRun = args.includes('--dry');

    const retryList = JSON.parse(fs.readFileSync(RETRY_LIST_PATH, 'utf8'));
    const log = loadLog();
    const alreadyDone = new Set(Object.keys(log).filter(k => log[k].status === 'ok'));

    const pending = retryList.filter(g => !alreadyDone.has(g.slug));
    const batch = pending.slice(0, limit);

    console.log(`Smart SC Retry (gameplay acquisition)`);
    console.log(`  Total in retry list: ${retryList.length}`);
    console.log(`  Already done: ${alreadyDone.size}`);
    console.log(`  Pending: ${pending.length}`);
    console.log(`  This batch: ${batch.length}`);
    console.log(`  Classify: ${CLASSIFY_SCRIPT}`);
    console.log('');

    if (batch.length === 0) { console.log('Nothing to do.'); return; }

    if (dryRun) {
        for (const g of batch) {
            console.log(`  ${g.slug} → ${BASE_URL}/en/slots/${g.scSlug}`);
        }
        return;
    }

    const browser = await chromium.launch({
        headless: true, channel: 'chrome',
        args: ['--disable-blink-features=AutomationControlled'],
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
    });

    let ok = 0, noGameplay = 0, notFound = 0, errors = 0;
    const tmpPath = path.join(SCREENSHOTS_DIR, '_tmp_retry.jpg');

    for (let i = 0; i < batch.length; i++) {
        const { slug, scSlug, name } = batch[i];
        const scUrl = `${BASE_URL}/en/slots/${scSlug}`;
        const progress = `[${i + 1}/${batch.length}]`;

        try {
            const page = await context.newPage();
            const resp = await page.goto(scUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            let cfPassed = false;
            for (let w = 0; w < 15; w++) {
                const title = await page.title();
                if (!title.includes('Just a moment') && !title.includes('Checking your browser')) {
                    cfPassed = true; break;
                }
                await sleep(1000);
            }

            if (!cfPassed) {
                console.log(`  ${progress} CF_BLOCKED ${slug}`);
                log[slug] = { name, status: 'cf_blocked', url: scUrl };
                saveLog(log); errors++; await page.close(); await sleep(DELAY_MS); continue;
            }

            const pageUrl = page.url();
            const httpStatus = resp ? resp.status() : 0;
            if (httpStatus === 404 || pageUrl === BASE_URL + '/' || pageUrl === BASE_URL + '/en/') {
                console.log(`  ${progress} NOT_FOUND ${slug}`);
                log[slug] = { name, status: 'not_found', url: scUrl };
                saveLog(log); notFound++; await page.close(); await sleep(DELAY_MS); continue;
            }

            const html = await page.content();
            await page.close();

            const imgUrls = extractImageUrls(html);
            const candidates = rankImages(imgUrls);

            if (candidates.length === 0) {
                console.log(`  ${progress} NO_IMAGES ${slug}`);
                log[slug] = { name, status: 'no_images', url: scUrl };
                saveLog(log); noGameplay++; await sleep(DELAY_MS); continue;
            }

            let found = false;
            const maxTry = Math.min(candidates.length, MAX_IMAGES_PER_PAGE);

            for (let ci = 0; ci < maxTry && !found; ci++) {
                const cand = candidates[ci];
                const fullImgUrl = cand.url.startsWith('http') ? cand.url : BASE_URL + '/' + cand.url;

                try {
                    await downloadImage(fullImgUrl, tmpPath);
                } catch (_) { continue; }

                const cls = classifyImage(tmpPath);
                if (cls === 'gameplay') {
                    const ext = getExtension(cand.url);
                    const finalDest = path.join(SCREENSHOTS_DIR, slug + ext);
                    fs.copyFileSync(tmpPath, finalDest);
                    found = true;
                    ok++;
                    const size = fs.statSync(finalDest).size;
                    log[slug] = { name, status: 'ok', url: fullImgUrl, file: slug + ext, size, type: cand.type, tried: ci + 1, total_candidates: maxTry };
                    saveLog(log);
                    console.log(`  ${progress} OK ${slug} — ${(size / 1024).toFixed(0)}KB (${cand.type}) [${ci + 1}/${maxTry}]`);
                } else {
                    if (ci < 3) console.log(`  ${progress}   img ${ci + 1}/${maxTry}: ${cls}`);
                }
            }

            try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}

            if (!found) {
                console.log(`  ${progress} NO_GAMEPLAY ${slug} (tried ${maxTry} images)`);
                log[slug] = { name, status: 'no_gameplay', url: scUrl, images_tried: maxTry };
                saveLog(log);
                noGameplay++;
            }
        } catch (e) {
            console.log(`  ${progress} ERROR ${slug}: ${e.message}`);
            log[slug] = { name, status: 'error', url: scUrl, error: e.message };
            saveLog(log); errors++;
        }

        await sleep(DELAY_MS);

        if ((i + 1) % 20 === 0) {
            console.log(`  --- ${i + 1}/${batch.length}: ${ok} ok, ${noGameplay} no_gameplay, ${notFound} not_found, ${errors} err ---`);
        }
    }

    await browser.close();
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}

    console.log(`\nDone: ${ok} ok, ${noGameplay} no_gameplay, ${notFound} not_found, ${errors} errors`);
    console.log(`Success rate: ${batch.length > 0 ? (ok / batch.length * 100).toFixed(1) : 0}%`);
    saveLog(log);
}

main().catch(err => { console.error(err); process.exit(1); });
