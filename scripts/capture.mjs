import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error(e));
  page.on('console', m => { if (m.type() === 'error') console.error(m.text()); });
  for (const scene of ['knight', 'garden', 'lilies']) {
    await page.goto(`http://127.0.0.1:5173/?scene=${scene}&t=4.2`);
    await page.waitForFunction(() => !!window.artworkStudio);
    await page.screenshot({ path: `test-results/${scene}-desktop.png` });
    if (scene === 'knight') {
      await page.keyboard.press('d'); await page.locator('#source').check();
      await page.locator('#close-dev').click();
      await page.screenshot({ path: 'test-results/knight-source.png' });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.selectOption('#scene', 'garden');
  await page.evaluate(() => window.artworkStudio.seek(4.2));
  await page.screenshot({ path: 'test-results/garden-mobile.png' });
  console.log('Captured three scenes, source illustration and mobile layout.');
} finally { await browser.close(); }
