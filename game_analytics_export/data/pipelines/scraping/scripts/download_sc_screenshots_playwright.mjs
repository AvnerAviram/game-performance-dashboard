#!/usr/bin/env node

/**
 * Download game screenshots from SlotCatalog via Playwright (Cloudflare bypass).
 *
 * For games NOT in the SC cache, visits slotcatalog.com/en/slots/{slug} using
 * headless Chromium, waits for Cloudflare to pass, extracts image URLs from
 * page HTML, then downloads the best screenshot.
 *
 * Usage:
 *   node download_sc_screenshots_playwright.mjs                            # dry-run, limit 10
 *   node download_sc_screenshots_playwright.mjs --download                  # download all
 *   node download_sc_screenshots_playwright.mjs --download --limit 50
 *   node download_sc_screenshots_playwright.mjs --download --smart          # smart mode: classify each image, try multiple until gameplay found
 *   node download_sc_screenshots_playwright.mjs --download --smart --limit 50
 *   node download_sc_screenshots_playwright.mjs --start-from 100 --download
 *   node download_sc_screenshots_playwright.mjs --stats                     # show coverage stats
 *   node download_sc_screenshots_playwright.mjs --retry-failed              # retry previous failures
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
const { DATA_DIR, MASTER_JSON, SCREENSHOTS_DIR } = require('../../../../src/lib/data-paths.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SS_DIR = SCREENSHOTS_DIR;
const MASTER_PATH = MASTER_JSON;
const LOG_PATH = path.join(SS_DIR, 'playwright_download_log.json');
const SC_CACHE_DIR = path.join(DATA_DIR, '_legacy', 'sc_cache');
const BASE_URL = 'https://slotcatalog.com';
const DELAY_MS = 2000;

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

function rankImages(urls) {
    const fullSize = urls.filter(u => !/_s\.\w+$/i.test(u) && !/_sq\.\w+$/i.test(u));
    const thumbs = urls.filter(u => /_s\.\w+$/i.test(u));

    const ranked = [];
    const tradGallery = fullSize.filter(u => /-[2-9]\.\w+$/i.test(u));
    tradGallery.forEach(u => ranked.push({ url: u, type: 'trad_gallery' }));

    const numbered = fullSize.filter(u => /-\d{5,}\.\w+$/i.test(u));
    numbered.forEach(u => { if (!ranked.find(r => r.url === u)) ranked.push({ url: u, type: 'numbered' }); });

    const cover = fullSize.filter(u => /[-_]1\.\w+$/i.test(u));
    cover.forEach(u => { if (!ranked.find(r => r.url === u)) ranked.push({ url: u, type: 'cover' }); });

    fullSize.forEach(u => { if (!ranked.find(r => r.url === u)) ranked.push({ url: u, type: 'other_full' }); });

    thumbs.forEach(u => {
        const upgraded = u.replace(/_s(\.\w+)$/i, '$1');
        if (!ranked.find(r => r.url === upgraded)) ranked.push({ url: upgraded, type: 'thumb_upgraded' });
    });

    return ranked;
}

function pickBestImage(urls) {
    const ranked = rankImages(urls);
    return ranked.length > 0 ? ranked[0] : null;
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

const CLASSIFY_SCRIPT = path.join(__dirname, 'classify_single.py');

function classifyImage(imagePath) {
    try {
        const result = execSync(`python3 "${CLASSIFY_SCRIPT}" "${imagePath}"`, {
            timeout: 60000,
            encoding: 'utf-8',
        }).trim();
        return result;
    } catch (e) {
        return 'error';
    }
}

function buildSlug(name) {
    return name.replace(/\s+/g, '-');
}

const BWB_BASE = 'https://www.bigwinboard.com';
const BWB_DELAY_MS = 5000;

const PROVIDER_BWB_SLUGS = {
    'IGT': 'igt', 'Light & Wonder': 'light-and-wonder', 'Evolution': 'evolution',
    'Pragmatic Play': 'pragmatic-play', "Play'n GO": 'playn-go', 'NetEnt': 'netent',
    'Microgaming': 'microgaming', 'Red Tiger': 'red-tiger', 'Blueprint Gaming': 'blueprint-gaming',
    'Big Time Gaming': 'big-time-gaming', 'Nolimit City': 'nolimit-city',
    'Hacksaw Gaming': 'hacksaw-gaming', 'Push Gaming': 'push-gaming',
    'Yggdrasil': 'yggdrasil', 'ELK Studios': 'elk-studios', 'Relax Gaming': 'relax-gaming',
    'Thunderkick': 'thunderkick', 'Quickspin': 'quickspin', 'Iron Dog Studio': 'iron-dog-studio',
    'Spinomenal': 'spinomenal', 'Wazdan': 'wazdan', 'Playtech': 'playtech',
    'Games Global': 'games-global', 'Aristocrat': 'aristocrat', 'Greentube': 'greentube',
    'Ainsworth': 'ainsworth', 'High 5 Games': 'high-5-games', 'Everi': 'everi',
    'AGS': 'ags', 'Konami': 'konami', 'Bally': 'bally',
    'Bragg Gaming Group': 'bragg-gaming', 'Ruby Play': 'ruby-play',
};

function buildBwbSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function tokenMatch(pageTitle, gameName) {
    const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim().split(/\s+/);
    const gameTokens = new Set(normalize(gameName));
    const pageTokens = normalize(pageTitle);
    const extra = pageTokens.filter(t => !gameTokens.has(t) && t.length > 2 && 
        !['slot', 'review', 'demo', 'online', 'play', 'free', 'game'].includes(t));
    if (extra.length > 2) return false;
    const overlap = pageTokens.filter(t => gameTokens.has(t));
    return overlap.length >= Math.min(2, gameTokens.size);
}

async function tryBigWinBoard(context, slug, name, provider, log) {
    const bwbGameSlug = buildBwbSlug(name);
    const bwbProvider = PROVIDER_BWB_SLUGS[provider] || buildBwbSlug(provider);
    const bwbUrl = `${BWB_BASE}/${bwbGameSlug}-${bwbProvider}-slot-review/`;

    const page = await context.newPage();
    try {
        const resp = await page.goto(bwbUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        if (!resp || resp.status() === 404) {
            await page.close();
            return { status: 'not_found', source: 'bigwinboard', url: bwbUrl };
        }

        const pageTitle = await page.title();
        if (!tokenMatch(pageTitle, name)) {
            await page.close();
            return { status: 'title_mismatch', source: 'bigwinboard', url: bwbUrl, pageTitle };
        }

        const imgUrl = await page.evaluate(() => {
            const imgs = document.querySelectorAll('img');
            for (const img of imgs) {
                const src = img.src || '';
                const alt = (img.alt || '').toLowerCase();
                if ((src.includes('/uploads/') || src.includes('/games/') || src.includes('wp-content')) &&
                    (alt.includes('base game') || alt.includes('gameplay') || alt.includes('main') ||
                     img.width > 400 || img.naturalWidth > 400) &&
                    !src.includes('logo') && !src.includes('icon') && !src.includes('avatar')) {
                    return src;
                }
            }
            const ogImg = document.querySelector('meta[property="og:image"]');
            if (ogImg) return ogImg.content;
            return null;
        });

        const description = await page.evaluate(() => {
            const paras = document.querySelectorAll('.entry-content p, .review-content p, article p');
            const texts = [];
            for (const p of paras) {
                if (p.textContent.trim().length > 30) texts.push(p.textContent.trim());
                if (texts.length >= 3) break;
            }
            return texts.join(' ').substring(0, 500);
        });

        await page.close();

        if (!imgUrl) {
            return { status: 'no_image', source: 'bigwinboard', url: bwbUrl };
        }

        return { status: 'found', source: 'bigwinboard', url: bwbUrl, imgUrl, description };
    } catch (err) {
        await page.close().catch(() => {});
        return { status: 'error', source: 'bigwinboard', url: bwbUrl, error: err.message };
    }
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
        missing.push({ name: game.name, slug, inScCache, release_year: game.release_year || 9999 });
    }
    missing.sort((a, b) => a.release_year - b.release_year);
    return missing;
}

async function main() {
    const args = process.argv.slice(2);
    const doDownload = args.includes('--download');
    const statsOnly = args.includes('--stats');
    const retryFailed = args.includes('--retry-failed');
    const useBwb = args.includes('--source-bwb');
    const smartMode = args.includes('--smart');
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

    let ok = 0, notFound = 0, noImage = 0, cfBlocked = 0, errors = 0;

    if (useBwb) {
        // ─── BigWinBoard download mode ───
        const master = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));
        const masterLookup = {};
        master.forEach(g => { masterLookup[g.name] = g; });

        console.log(`\n--- BigWinBoard mode (${batch.length} games) ---`);
        for (let i = 0; i < batch.length; i++) {
            const { slug, name } = batch[i];
            const game = masterLookup[name] || {};
            const provider = game.provider || '';
            const progress = `[${i + 1}/${batch.length}]`;

            const result = await tryBigWinBoard(context, slug, name, provider, log);

            if (result.status === 'found') {
                const ext = getExtension(result.imgUrl);
                const dest = path.join(SS_DIR, slug + ext);
                try {
                    const size = await downloadImage(result.imgUrl, dest);
                    ok++;
                    log[slug] = { game: name, status: 'ok', url: result.imgUrl, file: slug + ext, size, source: 'bigwinboard', source_url: result.url };
                    saveLog(log);
                    console.log(`  ${progress} OK ${slug} — ${(size / 1024).toFixed(0)}KB (bwb)`);

                    if (result.description) {
                        const syntheticHtml = `<h1>${name}</h1>\n<h2>${name} Review</h2>\n<p>${result.description}</p>`;
                        const scCacheDest = path.join(SC_CACHE_DIR, slug + '.html');
                        if (!fs.existsSync(scCacheDest) || fs.statSync(scCacheDest).size < 500) {
                            fs.writeFileSync(scCacheDest, syntheticHtml);
                        }
                    }
                } catch (dlErr) {
                    errors++;
                    console.log(`  ${progress} DL_FAIL ${slug}: ${dlErr.message}`);
                    log[slug] = { game: name, status: 'error', source: 'bigwinboard', error: dlErr.message };
                    saveLog(log);
                }
            } else if (result.status === 'title_mismatch') {
                console.log(`  ${progress} TITLE_MISMATCH ${slug} (page: "${result.pageTitle}")`);
                log[slug] = { game: name, status: 'bwb_mismatch', source: 'bigwinboard', pageTitle: result.pageTitle };
                saveLog(log);
                notFound++;
            } else if (result.status === 'not_found') {
                console.log(`  ${progress} BWB_NOT_FOUND ${slug}`);
                log[slug] = { game: name, status: 'bwb_not_found', source: 'bigwinboard', url: result.url };
                saveLog(log);
                notFound++;
            } else if (result.status === 'no_image') {
                console.log(`  ${progress} BWB_NO_IMAGE ${slug}`);
                log[slug] = { game: name, status: 'bwb_no_image', source: 'bigwinboard' };
                saveLog(log);
                noImage++;
            } else {
                console.log(`  ${progress} BWB_ERROR ${slug}: ${result.error || result.status}`);
                log[slug] = { game: name, status: 'error', source: 'bigwinboard', error: result.error };
                saveLog(log);
                errors++;
            }

            await sleep(BWB_DELAY_MS);
        }

        await browser.close();
        const finalCount = getExistingScreenshots().size;
        console.log(`\nBWB Done: ${ok} ok, ${notFound} not_found, ${noImage} no_image, ${errors} errors`);
        console.log(`Total screenshots now: ${finalCount}`);
        saveLog(log);
        return;
    }

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

            const scCacheDest = path.join(SC_CACHE_DIR, slug + '.html');
            if (!fs.existsSync(scCacheDest) || fs.statSync(scCacheDest).size < 5000) {
                fs.writeFileSync(scCacheDest, html);
            }

            const imgUrls = extractImageUrls(html);
            const candidates = smartMode ? rankImages(imgUrls) : [pickBestImage(imgUrls)].filter(Boolean);

            if (candidates.length === 0) {
                console.log(`  ${progress} NO_IMAGE ${slug} (${imgUrls.length} urls, all thumbs/logos)`);
                log[slug] = { game: name, status: 'no_image', url: scUrl };
                saveLog(log);
                noImage++;
                await sleep(DELAY_MS);
                continue;
            }

            let saved = false;
            const maxTries = smartMode ? Math.min(candidates.length, 5) : 1;
            const tmpPath = path.join(SS_DIR, '_tmp_classify' + '.jpg');

            for (let ci = 0; ci < maxTries && !saved; ci++) {
                const candidate = candidates[ci];
                const ext = getExtension(candidate.url);
                const fullImgUrl = candidate.url.startsWith('http') ? candidate.url : BASE_URL + '/' + candidate.url;
                const downloadDest = smartMode ? tmpPath : path.join(SS_DIR, slug + ext);

                let dlSize = 0;
                try {
                    dlSize = await downloadImage(fullImgUrl, downloadDest);
                } catch (dlErr) {
                    try {
                        const imgPage = await context.newPage();
                        const imgResp = await imgPage.goto(fullImgUrl, { timeout: 15000 });
                        if (imgResp && imgResp.ok()) {
                            const body = await imgResp.body();
                            if (body.length > 2000) {
                                fs.writeFileSync(downloadDest, body);
                                dlSize = body.length;
                            }
                        }
                        await imgPage.close();
                    } catch (_) {}
                }

                if (dlSize < 2000) continue;

                if (smartMode) {
                    const classification = classifyImage(downloadDest);
                    if (classification === 'gameplay') {
                        const finalDest = path.join(SS_DIR, slug + ext);
                        fs.copyFileSync(downloadDest, finalDest);
                        saved = true;
                        ok++;
                        log[slug] = { game: name, status: 'ok', url: fullImgUrl, file: slug + ext, size: dlSize, type: candidate.type, classification, tried: ci + 1 };
                        saveLog(log);
                        console.log(`  ${progress} OK ${slug} — ${(dlSize / 1024).toFixed(0)}KB (${candidate.type}) [${ci + 1}/${maxTries} tried]`);
                    } else {
                        if (ci < 3 || ci === maxTries - 1) {
                            console.log(`  ${progress}   image ${ci + 1}/${maxTries}: ${classification} — skipping`);
                        }
                    }
                } else {
                    saved = true;
                    ok++;
                    log[slug] = { game: name, status: 'ok', url: fullImgUrl, file: slug + ext, size: dlSize, type: candidate.type };
                    saveLog(log);
                    if (i % 20 === 0 || i < 5) {
                        console.log(`  ${progress} OK ${slug} — ${(dlSize / 1024).toFixed(0)}KB (${candidate.type})`);
                    }
                }
            }

            if (smartMode) {
                try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
            }

            if (!saved) {
                const reason = smartMode ? 'no_gameplay_image' : 'error';
                console.log(`  ${progress} ${reason.toUpperCase()} ${slug} (tried ${maxTries} images)`);
                log[slug] = { game: name, status: reason, url: scUrl, images_tried: maxTries };
                saveLog(log);
                if (smartMode) noImage++; else errors++;
            }
        } catch (navErr) {
            errors++;
            console.log(`  ${progress} ERROR ${slug}: ${navErr.message}`);
            log[slug] = { game: name, status: 'error', url: scUrl, error: navErr.message };
            saveLog(log);
        }

        await sleep(DELAY_MS);

        if ((i + 1) % 50 === 0) {
            console.log(`  --- checkpoint ${i + 1}/${batch.length}: ${ok} ok, ${notFound} not_found, ${noImage} no_img, ${cfBlocked} cf, ${errors} err ---`);
        }
    }

    await browser.close();

    const finalCount = getExistingScreenshots().size;
    console.log(`\nDone: ${ok} ok, ${notFound} not_found, ${noImage} no_image, ${cfBlocked} cf_blocked, ${errors} errors`);
    console.log(`Total screenshots now: ${finalCount}`);
    saveLog(log);
}

main().catch(err => { console.error(err); process.exit(1); });
