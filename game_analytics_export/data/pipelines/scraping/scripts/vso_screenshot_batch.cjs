const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dataPaths = require('../../../../src/lib/data-paths.cjs');

const batchFile = process.argv[2] || '/tmp/vso_batch_1.json';
const batch = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
const SCREENSHOT_DIR = dataPaths.SCREENSHOTS_DIR;
const MIN_SIZE = 80000; // 80KB (lowered - some valid screenshots are 100-130KB)
const GAME_LOAD_WAIT = 18000; // 18 seconds
const MAX_RETRIES = 1;

let downloaded = 0, failed = 0, skipped = 0;

async function dismissPopups(page) {
  try {
    await page.evaluate(() => {
      document.querySelectorAll('[data-testid="newsletter-modal"], [role="dialog"]').forEach(el => el.remove());
      document.querySelectorAll('[popover]').forEach(el => { try { el.hidePopover(); } catch(e) {} });
    });
  } catch(e) {}
}

async function processGame(browser, game, index, retry = 0) {
  const destName = game.name.replace(/\s+/g, '-') + '.jpg';
  const dest = path.join(SCREENSHOT_DIR, destName);
  
  if (fs.existsSync(dest)) { skipped++; return `[${index}/${batch.length}] SKIP: ${game.name}`; }
  
  const page = await browser.newPage();
  await page.setViewportSize({width: 1280, height: 720});
  
  try {
    await page.goto(game.vsoUrl, {waitUntil: 'domcontentloaded', timeout: 15000});
    await page.waitForTimeout(2000);
    await dismissPopups(page);
    
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('button[data-testid="games-bonus-offer-play-game"]');
      if (btn) { btn.click(); return true; }
      return false;
    });
    
    if (!clicked) { await page.close(); failed++; return `[${index}/${batch.length}] NO BTN: ${game.name}`; }
    
    await page.waitForTimeout(5000);
    
    const iframeSrc = await page.evaluate(() => {
      const iframes = Array.from(document.querySelectorAll('iframe'));
      const gameIframe = iframes.find(f => f.clientWidth > 400 && f.clientHeight > 200 && !f.src.includes('google') && !f.src.includes('accounts'));
      return gameIframe?.src || null;
    });
    
    if (!iframeSrc) { await page.close(); failed++; return `[${index}/${batch.length}] NO IFRAME: ${game.name}`; }
    
    await page.goto(iframeSrc, {waitUntil: 'domcontentloaded', timeout: 20000});
    await page.waitForTimeout(GAME_LOAD_WAIT);
    
    // Try clicking any "start" or "continue" button that might be blocking
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
        await canvas.screenshot({path: dest, type: 'jpeg', quality: 90});
      } else {
        await page.screenshot({path: dest, type: 'jpeg', quality: 90});
      }
    } else {
      await page.screenshot({path: dest, type: 'jpeg', quality: 90});
    }
    
    const size = fs.statSync(dest).size;
    if (size < MIN_SIZE) {
      fs.unlinkSync(dest);
      await page.close();
      
      if (retry < MAX_RETRIES) {
        return processGame(browser, game, index, retry + 1);
      }
      failed++;
      return `[${index}/${batch.length}] SMALL (${Math.round(size/1024)}KB): ${game.name}`;
    }
    
    downloaded++;
    await page.close();
    return `[${index}/${batch.length}] OK (${Math.round(size/1024)}KB): ${game.name}`;
  } catch(e) {
    try { await page.close(); } catch(e2) {}
    if (retry < MAX_RETRIES) {
      return processGame(browser, game, index, retry + 1);
    }
    failed++;
    return `[${index}/${batch.length}] ERR: ${game.name} - ${e.message.slice(0, 50)}`;
  }
}

async function main() {
  console.log(`Starting batch: ${batch.length} games`);
  const browser = await chromium.launch({headless: true});
  
  for (let i = 0; i < batch.length; i++) {
    const result = await processGame(browser, batch[i], i + 1);
    console.log(result);
  }
  
  await browser.close();
  console.log(`\nDone: downloaded=${downloaded} failed=${failed} skipped=${skipped} total=${batch.length}`);
}

main().catch(e => console.error(e));
