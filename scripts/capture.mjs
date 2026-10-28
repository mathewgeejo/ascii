import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
try {
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error(e));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.error(m.text()); });
  await page.goto(`${base}/?scene=stingray&t=0`);
  await page.waitForFunction(() => !!window.artworkStudio);
  for (const [name,t] of [['ray-down',0],['ray-up',1.7],['ray-glide',3.4]]) {
    await page.evaluate(t => window.artworkStudio.seek(t),t);
    await page.screenshot({ path: `test-results/${name}.png` });
  }
  await page.keyboard.press('d'); await page.locator('#source').check(); await page.locator('#close-dev').click();
  await page.screenshot({ path: 'test-results/ray-source.png' });
  await page.keyboard.press('d'); await page.locator('#source').uncheck(); await page.locator('#close-dev').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/ray-mobile.png' });
  await page.selectOption('#scene','lilies'); await page.evaluate(() => window.artworkStudio.seek(4.2));
  await page.screenshot({ path: 'test-results/lilies-mobile.png' });
  console.log('Captured fin phases, source geometry, mobile and lilies.');
} finally { await browser.close(); }
