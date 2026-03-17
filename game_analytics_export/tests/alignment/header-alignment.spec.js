import { test, expect } from '@playwright/test';

test.describe('Header Alignment Tests', () => {
  test('All page headers align at the same X position', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const measurements = [];
    const pages = ['overview', 'themes', 'mechanics', 'games', 'providers', 'anomalies', 'insights', 'trends'];
    
    for (const pageId of pages) {
      await page.evaluate((id) => window.showPage(id), pageId);
      await page.waitForTimeout(300);
      
      const h2Left = await page.evaluate((id) => {
        const div = document.getElementById(id);
        const h2 = div?.querySelector('h2');
        return h2?.getBoundingClientRect().left || 0;
      }, pageId);
      
      measurements.push({ pageId, h2Left });
    }
    
    // All headers should align at the same X position (within 1px tolerance)
    const reference = measurements[0].h2Left;
    for (const m of measurements) {
      expect(Math.abs(m.h2Left - reference)).toBeLessThanOrEqual(1);
    }
    
    console.log('Header alignment measurements:', measurements);
  });

  test('Sticky headers remain aligned when scrolling', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const stickyPages = ['themes', 'mechanics', 'games', 'providers'];
    
    for (const pageId of stickyPages) {
      await page.evaluate((id) => window.showPage(id), pageId);
      await page.waitForTimeout(300);
      
      // Get initial header position
      const initialLeft = await page.evaluate((id) => {
        const div = document.getElementById(id);
        const h2 = div?.querySelector('h2');
        return h2?.getBoundingClientRect().left || 0;
      }, pageId);
      
      // Scroll down
      await page.evaluate((id) => {
        const div = document.getElementById(id);
        div?.scrollTo(0, 500);
      }, pageId);
      
      await page.waitForTimeout(200);
      
      // Get header position after scroll
      const scrolledLeft = await page.evaluate((id) => {
        const div = document.getElementById(id);
        const h2 = div?.querySelector('h2');
        return h2?.getBoundingClientRect().left || 0;
      }, pageId);
      
      // Header should maintain the same X position
      expect(Math.abs(scrolledLeft - initialLeft)).toBeLessThanOrEqual(1);
    }
  });

  test('Page containers have consistent padding', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const allPages = ['overview', 'themes', 'mechanics', 'games', 'providers', 'anomalies', 'insights', 'trends'];
    
    const paddings = [];
    
    for (const pageId of allPages) {
      await page.evaluate((id) => window.showPage(id), pageId);
      await page.waitForTimeout(200);
      
      const padding = await page.evaluate((id) => {
        const div = document.getElementById(id);
        const styles = window.getComputedStyle(div);
        return {
          left: styles.paddingLeft,
          right: styles.paddingRight,
          bottom: styles.paddingBottom
        };
      }, pageId);
      
      paddings.push({ pageId, ...padding });
    }
    
    // All pages should have the same padding
    const reference = paddings[0];
    for (const p of paddings) {
      expect(p.left).toBe(reference.left);
      expect(p.right).toBe(reference.right);
      expect(p.bottom).toBe(reference.bottom);
    }
    
    console.log('Page padding measurements:', paddings);
  });
});
