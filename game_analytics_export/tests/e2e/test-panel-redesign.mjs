import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    try {
        console.log('📸 Testing panel redesign...\n');
        
        // Navigate to the app
        await page.goto('http://localhost:8000', { waitUntil: 'networkidle2' });
        await page.waitForTimeout(1000);
        
        // Click on Games page
        await page.evaluate(() => {
            window.showPage('games');
        });
        await page.waitForTimeout(500);
        
        // Take screenshot of main page
        await page.screenshot({ 
            path: join(__dirname, 'screenshots', 'panel-01-games-page.png'),
            fullPage: false
        });
        console.log('✅ 1. Games page screenshot');
        
        // Click on first game to open panel
        const firstGameLink = await page.$('#games-table tbody tr:first-child td:first-child a');
        if (firstGameLink) {
            await firstGameLink.click();
            await page.waitForTimeout(500);
            
            // Take screenshot with panel open
            await page.screenshot({ 
                path: join(__dirname, 'screenshots', 'panel-02-game-panel-open.png'),
                fullPage: false
            });
            console.log('✅ 2. Game panel open (full view)');
            
            // Scroll panel down to see more sections
            await page.evaluate(() => {
                const panel = document.querySelector('#game-panel');
                if (panel) {
                    panel.scrollTop = 300;
                }
            });
            await page.waitForTimeout(300);
            
            await page.screenshot({ 
                path: join(__dirname, 'screenshots', 'panel-03-game-panel-scrolled.png'),
                fullPage: false
            });
            console.log('✅ 3. Game panel scrolled (section headers visible)');
            
            // Close panel
            await page.evaluate(() => {
                window.closeGamePanel();
            });
            await page.waitForTimeout(300);
        }
        
        // Test Provider panel
        await page.evaluate(() => {
            window.showPage('providers');
        });
        await page.waitForTimeout(500);
        
        const firstProvider = await page.$('#providers-table tbody tr:first-child td:first-child a');
        if (firstProvider) {
            await firstProvider.click();
            await page.waitForTimeout(500);
            
            await page.screenshot({ 
                path: join(__dirname, 'screenshots', 'panel-04-provider-panel.png'),
                fullPage: false
            });
            console.log('✅ 4. Provider panel open');
        }
        
        console.log('\n📸 All screenshots saved to tests/e2e/screenshots/');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await browser.close();
    }
})();
