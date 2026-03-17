const playwright = require('playwright');

(async () => {
  const browser = await playwright.chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('http://localhost:8000/game_analytics_export/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Themes
  await page.evaluate(() => window.showPage('themes'));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `FINAL-themes.png` });
  console.log('✓ Themes');

  // Games  
  await page.evaluate(() => window.showPage('games'));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `FINAL-games.png` });
  console.log('✓ Games');

  // Providers
  await page.evaluate(() => window.showPage('providers'));
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `FINAL-providers.png` });
  console.log('✓ Providers');

  await browser.close();
  console.log('\n✅ All done!');
})();
