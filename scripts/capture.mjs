import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.argv[2] || process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error(e));
  page.on('console', m => { if (m.type() === 'error') console.error(m.text()); });
  await page.goto(`${base}/?scene=skull&t=0`);
  await page.waitForFunction(() => !!window.artworkStudio);
  for (const [scene, time, name] of [
    ['skull', 0, 'skull-front'], ['skull', 2, 'skull-three-quarter'], ['skull', 4.7, 'skull-profile'],
    ['skull', 10.2, 'skull-back'], ['skull', 20.25, 'skull-lasers'],
    ['stingray', 1.7, 'ray-up'], ['lilies', 4.2, 'lilies-full'],
  ]) {
    await page.selectOption('#scene', scene);
    await page.evaluate(t => window.artworkStudio.seek(t), time);
    await page.screenshot({ path: `test-results/${name}.png` });
    console.log('Captured ' + name);
  }
  for (const scene of ['skull']) {
    await page.selectOption('#scene', scene);
    await page.evaluate(() => window.artworkStudio.seek(0));
    await page.keyboard.press('d'); await page.locator('#source').check(); await page.locator('#close-dev').click();
    await page.screenshot({ path: `test-results/${scene}-source.png` });
    await page.keyboard.press('d'); await page.locator('#source').uncheck(); await page.locator('#close-dev').click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const scene of ['skull']) {
    await page.selectOption('#scene', scene);
    await page.evaluate(() => window.artworkStudio.seek(0));
    await page.screenshot({ path: `test-results/${scene}-mobile.png` });
    console.log('Captured ' + scene + ' mobile');
  }
} finally { await browser.close(); }
