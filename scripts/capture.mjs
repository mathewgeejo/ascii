import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
const output = '/tmp/verify';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  for (const target of [page, mobilePage]) {
    target.on('pageerror', error => errors.push(error.message));
    target.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
    });
  }
  for (const scene of ['knight', 'lilies', 'garden']) {
    const time = scene === 'lilies' ? 4.2 : 2;
    await page.goto(`${base}/?scene=${scene}&t=${time}`);
    await page.waitForFunction(() => !!window.artworkStudio);
    await page.screenshot({ path: `${output}/${scene}-desktop.png` });
  }
  await mobilePage.goto(`${base}/?scene=lilies&t=4.2`);
  await mobilePage.waitForFunction(() => !!window.artworkStudio);
  await mobilePage.screenshot({ path: `${output}/lilies-mobile.png` });
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log(`Captured three scenes and mobile layout in ${output}.`);
} finally { await browser.close(); }
