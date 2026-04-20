#!/usr/bin/env node

/**
 * Download game screenshots from SlotCatalog via Playwright (Cloudflare bypass).
 *
 * For games NOT in the SC cache, visits slotcatalog.com/en/slots/{slug} using
 * headless Chromium, waits for Cloudflare to pass, extracts image URLs from
 * page HTML, then downloads the best screenshot.
 *
 * Usage:
 *   node download_sc_screenshots_playwright.mjs                   # dry-run, limit 10
 *   node download_sc_screenshots_playwright.mjs --download         # download all
 *   node download_sc_screenshots_playwright.mjs --download --limit 50
 *   node download_sc_screenshots_playwright.mjs --start-from 100 --download
 *   node download_sc_screenshots_playwright.mjs --stats            # show coverage stats
 *   node download_sc_screenshots_playwright.mjs --retry-failed     # retry previous failures
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS_DIR = path.join(__dirname, 'screenshots');
const MASTER_PATH = path.join(__dirname, 'game_data_master.json');
const LOG_PATH = path.join(SS_DIR, 'playwright_download_log.json');
const SC_CACHE_DIR = path.join(__dirname, '_legacy', 'sc_cache');
const BASE_URL = 'https://slotcatalog.com';
const DELAY_MS = 4000;

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
    while ((m = regex.exec(html)) !== null) {
        urls.push(m[0]);
    }
    return [...new Set(urls)];
}

function pickBestImage(urls) {
    const fullSize = urls.filter(u => !/_s\.\w+$/i.test(u) && !/_sq\.\w+$/i.test(u));
    const thumbs = urls.filter(u => /_s\.\w+$/i.test(u));

    const tradGallery = fullSize.filter(u => /-[2-9]\.\w+$/i.test(u));
    if (tradGallery.length > 0) return { url: tradGallery[0], type: 'trad_gallery' };

    const numbered = fullSize.filter(u => /-\d{5,}\.\w+$/i.test(u));
    if (numbered.length > 0) return { url: numbered[0], type: 'numbered' };

    const cover = fullSize.filter(u => /[-_]1\.\w+$/i.test(u));
    if (cover.length > 0) return { url: cover[0], type: 'cover' };

    if (fullSize.length > 0) return { url: fullSize[0], type: 'other_full' };

    if (thumbs.length > 0) {
        const thumbUrl = thumbs[0].replace(/_s(\.\w+)$/i, '$1');
        return { url: thumbUrl, type: 'thumb_upgraded' };
    }

    return null;
}

function getExtension(url) {
    const m = url.match(/\.(\w+)$/);
    if (!m) return '.jpg';
    const ext = m[1].toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return '.' + ext;
    return '.jpg';
}

function downloadImage(url, dest) {
    return new Promise((resolve, reject) => {
        const fullUrl = url.startsWith('http') ? url : BASE_URL + '/' + url;
        const mod = fullUrl.startsWith('https') ? https : http;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': BASE_URL + '/',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        };
        const file = fs.createWriteStream(dest);
        mod.get(fullUrl, { headers }, res => {
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
                if (stats.size < 2000) {
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

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function buildSlug(name) {
    return name.replace(/\s+/g, '-');
}

function getExistingScreenshots() {
    const existing = new Set();
    if (fs.existsSync(SS_DIR)) {
        for (const f of fs.readdirSync(SS_DIR)) {
            if (/\.(jpg|jpeg|png|webp)$/i.test(f)) {
                existing.add(f.replace(/\.(jpg|jpeg|png|webp)$/i, ''));
            }
        }
    }
    return existing;
}

function getMissingSlots() {
    const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
    const slots = master.filter(g => g.game_category === 'Slot');
    const existing = getExistingScreenshots();
    const scCache = new Set(
        fs.readdirSync(SC_CACHE_DIR).filter(f => f.endsWith('.html')).map(f => f.replace('.html', ''))
    );

    const missing = [];
    for (const game of slots) {
        const slug = buildSlug(game.name || '');
        if (!slug) continue;
        const slugLower = slug.toLowerCase();
        const hasScreenshot = [...existing].some(s => s.toLowerCase() === slugLower);
        if (hasScreenshot) continue;
        const inScCache = [...scCache].some(s => s.toLowerCase() === slugLower);
        missing.push({ name: game.name, slug, inScCache });
    }
    return missing;
}

async function main() {
    const args = process.argv.slice(2);
    const doDownload = args.includes('--download');
    const statsOnly = args.includes('--stats');
    const retryFailed = args.includes('--retry-failed');
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : (doDownload ? Infinity : 10);
    const startIdx = args.indexOf('--start-from');
    const startFrom = startIdx >= 0 ? parseInt(args[startIdx + 1], 10) : 0;

    const existing = getExistingScreenshots();
    const missing = getMissingSlots();
    const log = loadLog();

    console.log(`Existing screenshots: ${existing.size}`);
    console.log(`Missing slot screenshots: ${missing.length}`);
    console.log(`  In SC cache (use existing script): ${missing.filter(m => m.inScCache).length}`);
    console.log(`  NOT in SC cache (need Playwright): ${missing.filter(m => !m.inScCache).length}`);
    console.log(`Already in download log: ${Object.keys(log).length}`);

    if (statsOnly) return;

    const needPlaywright = missing.filter(m => !m.inScCache);

    let candidates;
    if (retryFailed) {
        candidates = needPlaywright.filter(m => {
            const entry = log[m.slug];
            return entry && entry.status !== 'ok';
        });
        console.log(`\nRetrying ${candidates.length} previously failed games`);
    } else {
        candidates = needPlaywright.filter(m => !log[m.slug]);
        console.log(`\nNew candidates (not in log): ${candidates.length}`);
    }

    const batch = candidates.slice(startFrom, startFrom + limit);
    console.log(`Processing ${batch.length} games (start=${startFrom}, limit=${limit})`);

    if (batch.length === 0) {
        console.log('Nothing to do.');
        return;
    }

    if (!doDownload) {
        console.log('\nDry run — sample games:');
        for (const m of batch.slice(0, 10)) {
            const scUrl = `${BASE_URL}/en/slots/${m.slug}`;
            console.log(`  ${m.slug} → ${scUrl}`);
        }
        console.log(`\nUse --download to actually fetch images.`);
        return;
    }

    const browser = await chromium.launch({
        headless: false,
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

    let ok = 0, notFound = 0, noImage = 0, cfBlocked = 0, errors = 0;

    for (let i = 0; i < batch.length; i++) {
        const { slug, name } = batch[i];
        const scUrl = `${BASE_URL}/en/slots/${slug}`;
        const progress = `[${i + 1}/${batch.length}]`;

        try {
            const page = await context.newPage();

            const resp = await page.goto(scUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait for Cloudflare to resolve (up to 20s)
            let cfPassed = false;
            for (let w = 0; w < 20; w++) {
                const title = await page.title();
                if (!title.includes('Just a moment') && !title.includes('Attention Required') &&
                    !title.includes('Checking your browser')) {
                    cfPassed = true;
                    break;
                }
                await sleep(1000);
            }

            if (!cfPassed) {
                console.log(`  ${progress} CF_BLOCKED ${slug}`);
                log[slug] = { game: name, status: 'cf_blocked', url: scUrl };
                saveLog(log);
                cfBlocked++;
                await page.close();
                await sleep(DELAY_MS);
                continue;
            }

            // Check for 404 / not found / redirect to home
            const pageUrl = page.url();
            const httpStatus = resp ? resp.status() : 0;
            const bodyText = await page.textContent('body').catch(() => '');
            const title = await page.title();
            if (httpStatus === 404 || pageUrl.includes('/404') ||
                pageUrl === BASE_URL + '/' || pageUrl === BASE_URL + '/en/' ||
                title.includes('404') ||
                (bodyText.length < 500 && bodyText.includes('not found'))) {
                console.log(`  ${progress} NOT_FOUND ${slug}`);
                log[slug] = { game: name, status: 'not_found', url: scUrl };
                saveLog(log);
                notFound++;
                await page.close();
                await sleep(DELAY_MS);
                continue;
            }

            const html = await page.content();
            await page.close();

            const imgUrls = extractImageUrls(html);
            const best = pickBestImage(imgUrls);

            if (!best) {
                console.log(`  ${progress} NO_IMAGE ${slug} (${imgUrls.length} urls, all thumbs/logos)`);
                log[slug] = { game: name, status: 'no_image', url: scUrl };
                saveLog(log);
                noImage++;
                await sleep(DELAY_MS);
                continue;
            }

            const ext = getExtension(best.url);
            const dest = path.join(SS_DIR, slug + ext);
            const fullImgUrl = best.url.startsWith('http') ? best.url : BASE_URL + '/' + best.url;

            try {
                const size = await downloadImage(fullImgUrl, dest);
                ok++;
                log[slug] = { game: name, status: 'ok', url: fullImgUrl, file: slug + ext, size, type: best.type };
                saveLog(log);
                if (i % 20 === 0 || i < 5) {
                    console.log(`  ${progress} OK ${slug} — ${(size / 1024).toFixed(0)}KB (${best.type})`);
                }
            } catch (dlErr) {
                // Image download failed — try through Playwright page context instead
                try {
                    const imgPage = await context.newPage();
                    const imgResp = await imgPage.goto(fullImgUrl, { timeout: 15000 });
                    if (imgResp && imgResp.ok()) {
                        const body = await imgResp.body();
                        if (body.length > 2000) {
                            fs.writeFileSync(dest, body);
                            ok++;
                            log[slug] = { game: name, status: 'ok', url: fullImgUrl, file: slug + ext, size: body.length, type: best.type + '_pw' };
                            saveLog(log);
                            if (i % 20 === 0 || i < 5) {
                                console.log(`  ${progress} OK ${slug} — ${(body.length / 1024).toFixed(0)}KB (${best.type}_pw)`);
                            }
                        } else {
                            throw new Error(`Too small via PW: ${body.length}b`);
                        }
                    } else {
                        throw new Error(`PW HTTP ${imgResp?.status()}`);
                    }
                    await imgPage.close();
                } catch (pwErr) {
                    errors++;
                    console.log(`  ${progress} FAIL ${slug}: ${dlErr.message} / PW: ${pwErr.message}`);
                    log[slug] = { game: name, status: 'error', url: fullImgUrl, error: dlErr.message };
                    saveLog(log);
                }
            }
        } catch (navErr) {
            errors++;
            console.log(`  ${progress} ERROR ${slug}: ${navErr.message}`);
            log[slug] = { game: name, status: 'error', url: scUrl, error: navErr.message };
            saveLog(log);
        }

        await sleep(DELAY_MS);
    }

    await browser.close();

    const finalCount = getExistingScreenshots().size;
    console.log(`\nDone: ${ok} ok, ${notFound} not_found, ${noImage} no_image, ${cfBlocked} cf_blocked, ${errors} errors`);
    console.log(`Total screenshots now: ${finalCount}`);
    saveLog(log);
}

main().catch(err => { console.error(err); process.exit(1); });
