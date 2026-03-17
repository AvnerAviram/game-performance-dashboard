// Simple screenshot test using Puppeteer (works with Node 14)
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  console.log('🚀 Starting sticky header visual test...\n');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const page = await browser.newPage();
  
  // Create screenshots directory
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  
  // Go to the app
  await page.goto('http://localhost:8000/game_analytics_export/index.html');
  await page.waitForTimeout(2000);
  
  // Click Games
  await page.click('.nav-item[data-page="games"]');
  await page.waitForTimeout(2000);
  
  console.log('📸 Taking screenshots at different scroll positions...\n');
  
  // Get the page container and sticky header
  const measurements = [];
  
  // Test 1: Initial state (scroll = 0)
  console.log('1️⃣  Initial state (scroll = 0)');
  const initial = await page.evaluate(() => {
    const pageEl = document.querySelector('#games.page.active');
    const headerEl = document.querySelector('#games .sticky');
    const rect = headerEl.getBoundingClientRect();
    return {
      scrollTop: pageEl.scrollTop,
      headerY: rect.y,
      headerHeight: rect.height,
      position: window.getComputedStyle(headerEl).position,
      top: window.getComputedStyle(headerEl).top
    };
  });
  console.log('   Scroll:', initial.scrollTop, 'px');
  console.log('   Header Y:', initial.headerY, 'px');
  console.log('   CSS position:', initial.position);
  console.log('   CSS top:', initial.top);
  measurements.push(initial);
  
  await page.screenshot({ 
    path: path.join(screenshotsDir, 'sticky-01-initial.png'),
    fullPage: false 
  });
  console.log('   ✅ Screenshot saved: sticky-01-initial.png\n');
  
  // Test 2: Scroll 50px
  console.log('2️⃣  Scrolling down 50px');
  await page.evaluate(() => {
    document.querySelector('#games.page.active').scrollTop = 50;
  });
  await page.waitForTimeout(500);
  
  const scroll50 = await page.evaluate(() => {
    const pageEl = document.querySelector('#games.page.active');
    const headerEl = document.querySelector('#games .sticky');
    const rect = headerEl.getBoundingClientRect();
    return {
      scrollTop: pageEl.scrollTop,
      headerY: rect.y,
      headerHeight: rect.height
    };
  });
  console.log('   Scroll:', scroll50.scrollTop, 'px');
  console.log('   Header Y:', scroll50.headerY, 'px');
  measurements.push(scroll50);
  
  await page.screenshot({ 
    path: path.join(screenshotsDir, 'sticky-02-scroll-50.png'),
    fullPage: false 
  });
  console.log('   ✅ Screenshot saved: sticky-02-scroll-50.png\n');
  
  // Test 3: Scroll 100px
  console.log('3️⃣  Scrolling down 100px');
  await page.evaluate(() => {
    document.querySelector('#games.page.active').scrollTop = 100;
  });
  await page.waitForTimeout(500);
  
  const scroll100 = await page.evaluate(() => {
    const pageEl = document.querySelector('#games.page.active');
    const headerEl = document.querySelector('#games .sticky');
    const rect = headerEl.getBoundingClientRect();
    return {
      scrollTop: pageEl.scrollTop,
      headerY: rect.y,
      headerHeight: rect.height
    };
  });
  console.log('   Scroll:', scroll100.scrollTop, 'px');
  console.log('   Header Y:', scroll100.headerY, 'px');
  measurements.push(scroll100);
  
  await page.screenshot({ 
    path: path.join(screenshotsDir, 'sticky-03-scroll-100.png'),
    fullPage: false 
  });
  console.log('   ✅ Screenshot saved: sticky-03-scroll-100.png\n');
  
  // Test 4: Scroll 200px (should be stuck)
  console.log('4️⃣  Scrolling down 200px (should be stuck)');
  await page.evaluate(() => {
    document.querySelector('#games.page.active').scrollTop = 200;
  });
  await page.waitForTimeout(500);
  
  const scroll200 = await page.evaluate(() => {
    const pageEl = document.querySelector('#games.page.active');
    const headerEl = document.querySelector('#games .sticky');
    const rect = headerEl.getBoundingClientRect();
    return {
      scrollTop: pageEl.scrollTop,
      headerY: rect.y,
      headerHeight: rect.height
    };
  });
  console.log('   Scroll:', scroll200.scrollTop, 'px');
  console.log('   Header Y:', scroll200.headerY, 'px');
  measurements.push(scroll200);
  
  await page.screenshot({ 
    path: path.join(screenshotsDir, 'sticky-04-scroll-200.png'),
    fullPage: false 
  });
  console.log('   ✅ Screenshot saved: sticky-04-scroll-200.png\n');
  
  // Test 5: Scroll 500px (should still be stuck)
  console.log('5️⃣  Scrolling down 500px (should still be stuck)');
  await page.evaluate(() => {
    document.querySelector('#games.page.active').scrollTop = 500;
  });
  await page.waitForTimeout(500);
  
  const scroll500 = await page.evaluate(() => {
    const pageEl = document.querySelector('#games.page.active');
    const headerEl = document.querySelector('#games .sticky');
    const rect = headerEl.getBoundingClientRect();
    return {
      scrollTop: pageEl.scrollTop,
      headerY: rect.y,
      headerHeight: rect.height
    };
  });
  console.log('   Scroll:', scroll500.scrollTop, 'px');
  console.log('   Header Y:', scroll500.headerY, 'px');
  measurements.push(scroll500);
  
  await page.screenshot({ 
    path: path.join(screenshotsDir, 'sticky-05-scroll-500.png'),
    fullPage: false 
  });
  console.log('   ✅ Screenshot saved: sticky-05-scroll-500.png\n');
  
  // Analysis
  console.log('📊 ANALYSIS:\n');
  console.log('Expected behavior:');
  console.log('  - Initial: Header Y should be ~32px (has space above)');
  console.log('  - As we scroll: Header Y should decrease');
  console.log('  - When stuck: Header Y should be at 0px\n');
  
  console.log('Actual measurements:');
  measurements.forEach((m, i) => {
    console.log(`  ${i+1}. Scroll ${m.scrollTop}px → Header Y: ${m.headerY}px`);
  });
  
  console.log('\n📝 Conclusions:');
  if (measurements[0].headerY > 20) {
    console.log('  ✅ Initial state has space above header');
  } else {
    console.log('  ❌ Initial state missing space above header');
  }
  
  if (measurements[1].headerY < measurements[0].headerY) {
    console.log('  ✅ Header moves up when scrolling');
  } else {
    console.log('  ❌ Header not moving up when scrolling');
  }
  
  if (measurements[3].headerY <= 5) {
    console.log('  ✅ Header sticks at top (Y ≈ 0)');
  } else {
    console.log('  ❌ Header not sticking at top (Y =', measurements[3].headerY, ')');
  }
  
  if (Math.abs(measurements[3].headerY - measurements[4].headerY) < 2) {
    console.log('  ✅ Header stays stuck at same position');
  } else {
    console.log('  ❌ Header position changing when it should be stuck');
  }
  
  console.log('\n📁 All screenshots saved to:', screenshotsDir);
  
  // Keep browser open for 5 seconds so you can see it
  await page.waitForTimeout(5000);
  
  await browser.close();
  console.log('\n✅ Test complete!');
})();
