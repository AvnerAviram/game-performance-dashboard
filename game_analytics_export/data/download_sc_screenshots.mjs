#!/usr/bin/env node

/**
 * Download game screenshots from SlotCatalog CDN.
 *
 * Parses og:image and gallery image URLs from cached SC HTML pages,
 * picks the best gameplay screenshot per game, and downloads to screenshots/.
 *
 * Usage:
 *   node download_sc_screenshots.mjs                # dry-run (report only)
 *   node download_sc_screenshots.mjs --download      # actually download
 *   node download_sc_screenshots.mjs --download --limit 100  # first 100 only
 *   node download_sc_screenshots.mjs --stats          # just show stats
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SC_DIR = path.join(__dirname, '_legacy', 'sc_cache');
const SS_DIR = path.join(__dirname, 'screenshots');
const BASE_URL = 'https://slotcatalog.com/';
const DELAY_MS = 80;

function extractImageUrls(html) {
    const urls = [];
    const regex = /userfiles\/image\/games\/[^"'\s>]+/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
        urls.push(match[0]);
    }
    return [...new Set(urls)];
}

function pickBestImage(urls) {
    const fullSize = urls.filter(u => !/_s\.\w+$/.test(u) && !/_sq\.\w+$/.test(u));
    const thumbs = urls.filter(u => /_s\.\w+$/.test(u));

    // Traditional gallery images (-2.jpg through -9.jpg) — consistently ~800-1200px
    const tradGallery = fullSize.filter(u => /-[2-9]\.\w+$/.test(u));
    if (tradGallery.length > 0) return { url: tradGallery[0], type: 'trad_gallery' };

    // 7-digit numbered screenshots — variable size (490-1400px)
    const numbered = fullSize.filter(u => /-\d{5,}\.\w+$/.test(u));
    if (numbered.length > 0) return { url: numbered[0], type: 'numbered' };

    // Cover image (-1.jpg or _1.png) — usually decent
    const cover = fullSize.filter(u => /-1\.\w+$/.test(u) || /_1\.\w+$/.test(u));
    if (cover.length > 0) return { url: cover[0], type: 'cover' };

    if (fullSize.length > 0) return { url: fullSize[0], type: 'other_full' };

    // Upgrade thumbnail by stripping _s suffix
    if (thumbs.length > 0) {
        const thumbUrl = thumbs[0].replace(/_s(\.\w+)$/, '$1');
        return { url: thumbUrl, type: 'thumb_upgraded' };
    }

    return null;
}

function getExtension(url) {
    const m = url.match(/\.(\w+)$/);
    return m ? '.' + m[1] : '.jpg';
}

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const fullUrl = url.startsWith('http') ? url : BASE_URL + url;
        const file = fs.createWriteStream(dest);
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://slotcatalog.com/',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        };
        https.get(fullUrl, { headers }, res => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                file.close();
                fs.unlinkSync(dest);
                download(res.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                file.close();
                fs.unlinkSync(dest);
                reject(new Error(`HTTP ${res.statusCode} for ${fullUrl}`));
                return;
            }
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                const stats = fs.statSync(dest);
                if (stats.size < 2000) {
                    fs.unlinkSync(dest);
                    reject(new Error(`Too small (${stats.size}b) — likely error page`));
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

async function main() {
    const args = process.argv.slice(2);
    const doDownload = args.includes('--download');
    const statsOnly = args.includes('--stats');
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

    const scFiles = fs.readdirSync(SC_DIR).filter(f => f.endsWith('.html')).sort();
    console.log(`SC cache files: ${scFiles.length}`);

    const existingSS = new Set();
    if (fs.existsSync(SS_DIR)) {
        for (const f of fs.readdirSync(SS_DIR)) {
            if (/\.(jpg|png|webp|jpeg)$/i.test(f)) {
                const slug = f.replace(/\.(jpg|png|webp|jpeg)$/i, '');
                existingSS.add(slug);
            }
        }
    }
    console.log(`Existing screenshots: ${existingSS.size}`);

    const plan = [];
    let noImage = 0;
    const types = {};

    for (const fname of scFiles) {
        const slug = fname.replace('.html', '');
        if (existingSS.has(slug)) continue;

        const html = fs.readFileSync(path.join(SC_DIR, fname), 'utf8');
        const urls = extractImageUrls(html);
        const best = pickBestImage(urls);

        if (!best) {
            noImage++;
            continue;
        }

        types[best.type] = (types[best.type] || 0) + 1;
        plan.push({ slug, fname, url: best.url, type: best.type });
    }

    console.log(`\nAlready have screenshots: ${existingSS.size}`);
    console.log(`New downloads planned: ${plan.length}`);
    console.log(`No image found: ${noImage}`);
    console.log(`Image sources: ${JSON.stringify(types)}`);
    console.log(`Total coverage after download: ${existingSS.size + plan.length} / ${scFiles.length} (${((existingSS.size + plan.length) / scFiles.length * 100).toFixed(1)}%)`);

    if (statsOnly) return;

    if (!doDownload) {
        console.log('\nDry run — use --download to actually fetch images.');
        console.log('Sample URLs:');
        plan.slice(0, 10).forEach(p => console.log(`  ${p.slug}: ${BASE_URL}${p.url} (${p.type})`));
        return;
    }

    const toDownload = plan.slice(0, limit);
    console.log(`\nDownloading ${toDownload.length} screenshots...`);

    let ok = 0, fail = 0;
    for (let i = 0; i < toDownload.length; i++) {
        const { slug, url, type } = toDownload[i];
        const ext = getExtension(url);
        const dest = path.join(SS_DIR, slug + ext);
        const fullUrl = url.startsWith('http') ? url : BASE_URL + url;

        try {
            const size = await download(fullUrl, dest);
            ok++;
            if (i % 50 === 0 || i === toDownload.length - 1) {
                console.log(`  [${i + 1}/${toDownload.length}] ${slug} — ${(size / 1024).toFixed(0)}KB (${type})`);
            }
        } catch (err) {
            fail++;
            console.log(`  [${i + 1}/${toDownload.length}] FAIL ${slug}: ${err.message}`);
        }

        await sleep(DELAY_MS);
    }

    console.log(`\nDone: ${ok} downloaded, ${fail} failed.`);
    console.log(`Total screenshots now: ${existingSS.size + ok}`);
}

main().catch(err => { console.error(err); process.exit(1); });
