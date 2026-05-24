const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dataPaths = require('../../../../src/lib/data-paths.cjs');

const CONCURRENCY = parseInt(process.env.CONCURRENCY || '3', 10);
const batchFile = process.argv[2] || '/tmp/vso_batch_all.json';
const batch = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
const SCREENSHOT_DIR = dataPaths.SCREENSHOTS_DIR;
const MIN_SIZE = 80000;
const GAME_LOAD_WAIT = 18000;
const MAX_RETRIES = 1;
const STAGGER_DELAY = 3000;

let downloaded = 0, failed = 0, skipped = 0, processed = 0;
const startTime = Date.now();

function elapsed() {
  const s = Math.round((Date.now() - startTime) / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${s % 60}s` : `${s}s`;
}

async function dismissPopups(page) {
  try {
    await page.evaluate(() => {
      document.querySelectorAll('[data-testid="newsletter-modal"], [role="dialog"]').forEach(el => el.remove());
      document.querySelectorAll('[popover]').forEach(el => { try { el.hidePopover(); } catch(e) {} });
    });
  } catch(e) {}
}

async function processGame(browser, game, index) {
  const destName = game.name.replace(/\s+/g, '-') + '.jpg';
  const dest = path.join(SCREENSHOT_DIR, destName);

  if (fs.existsSync(dest)) { skipped++; processed++; return; }

  for (let retry = 0; retry <= MAX_RETRIES; retry++) {
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });

    try {
      await page.goto(game.vsoUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(2000);
      await dismissPopups(page);

      const clicked = await page.evaluate(() => {
        const btn = document.querySelector('button[data-testid="games-bonus-offer-play-game"]');
        if (btn) { btn.click(); return true; }
        return false;
      });

      if (!clicked) { await page.close(); continue; }

      await page.waitForTimeout(5000);

      const iframeSrc = await page.evaluate(() => {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        const gameIframe = iframes.find(f => f.clientWidth > 400 && f.clientHeight > 200 && !f.src.includes('google') && !f.src.includes('accounts'));
        return gameIframe?.src || null;
      });

      if (!iframeSrc) { await page.close(); continue; }

      await page.goto(iframeSrc, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(GAME_LOAD_WAIT);

      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, [role="button"], .start-button, .play-button'));
        const startBtn = btns.find(b => /start|play|continue|spin|ok/i.test(b.textContent || ''));
        if (startBtn) startBtn.click();
      });
      await page.waitForTimeout(2000);

      const canvas = await page.$('canvas');
      if (canvas) {
        const box = await canvas.boundingBox();
        if (box && box.width > 200 && box.height > 200) {
          await canvas.screenshot({ path: dest, type: 'jpeg', quality: 90 });
        } else {
          await page.screenshot({ path: dest, type: 'jpeg', quality: 90 });
        }
      } else {
        await page.screenshot({ path: dest, type: 'jpeg', quality: 90 });
      }

      const size = fs.statSync(dest).size;
      if (size < MIN_SIZE) {
        fs.unlinkSync(dest);
        await page.close();
        continue;
      }

      downloaded++;
      processed++;
      await page.close();
      return;
    } catch (e) {
      try { await page.close(); } catch (e2) {}
    }
  }

  failed++;
  processed++;
}

async function worker(browser, queue, workerId) {
  await new Promise(r => setTimeout(r, workerId * STAGGER_DELAY));
  while (queue.length > 0) {
    const { game, index } = queue.shift();
    await processGame(browser, game, index);

    if (processed % 20 === 0) {
      const rate = (downloaded / processed * 100).toFixed(0);
      console.log(`[${elapsed()}] Progress: ${processed}/${batch.length} | OK: ${downloaded} | Failed: ${failed} | Skip: ${skipped} | Rate: ${rate}%`);
    }
  }
}

async function main() {
  console.log(`Starting: ${batch.length} games, ${CONCURRENCY} parallel browsers`);

  const queue = batch.map((game, i) => ({ game, index: i + 1 }));

  const browsers = await Promise.all(
    Array.from({ length: CONCURRENCY }, () => chromium.launch({ headless: true }))
  );

  console.log(`[${elapsed()}] ${CONCURRENCY} browsers launched`);

  const workers = browsers.map((browser, i) => worker(browser, queue, i));
  await Promise.all(workers);

  await Promise.all(browsers.map(b => b.close()));

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nDone in ${Math.floor(totalTime/60)}m ${totalTime%60}s`);
  console.log(`Results: downloaded=${downloaded} failed=${failed} skipped=${skipped} total=${batch.length}`);
  console.log(`Effective rate: ${(totalTime / batch.length).toFixed(1)}s per game`);
}

main().catch(e => console.error(e));
