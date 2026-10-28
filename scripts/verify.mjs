import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const state = () => page.evaluate(() => window.artworkStudio.getState());
  const seek = t => page.evaluate(t => window.artworkStudio.seek(t), t);
  await page.goto(`${base}/?scene=knight&t=0`);
  await page.waitForFunction(() => !!window.artworkStudio);
  assert.equal((await state()).scene, 'knight');

  // Verify actual rendered pixels, including the previous first-frame regression.
  async function stats(buffer) {
    return page.evaluate(async data => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
      const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
      const p = ctx.getImageData(0, 0, c.width, c.height).data;
      let metal = 0, red = 0, colored = 0;
      for (let y = 60; y < c.height - 70; y++) for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4, r = p[i], g = p[i + 1], b = p[i + 2];
        if (r > 55 && Math.abs(r - g) < 22 && Math.abs(g - b) < 30) metal++;
        if (r > 55 && r > g * 2 && r > b * 1.4) red++;
        if (Math.max(r,g,b) - Math.min(r,g,b) > 35) colored++;
      }
      return { metal, red, colored };
    }, buffer.toString('base64'));
  }

  const knightShot = await page.screenshot({ path: 'test-results/knight-desktop.png' });
  const knightStats = await stats(knightShot);
  assert(knightStats.metal > 15000 && knightStats.red > 1500, 'Pale knight and crimson scarf render on first frame');
  const staticClip = { x: 770, y: 440, width: 65, height: 65 };
  const staticFrame = await page.screenshot({ clip: staticClip });
  const windClip = { x: 900, y: 125, width: 220, height: 245 };
  const windFrame = await page.screenshot({ clip: windClip });
  await seek(1.6);
  assert(staticFrame.equals(await page.screenshot({ clip: staticClip })), 'Armour is stable while wind moves');
  assert(!windFrame.equals(await page.screenshot({ clip: windClip })), 'Scarf visibly moves');
  await page.screenshot({ path: 'test-results/knight-wind.png' });
  await seek(0);
  assert(knightShot.equals(await page.screenshot()), 'Knight seeking is deterministic');
  checks.push('knight first frame, stable armour, animated scarf, deterministic seeking');

  await page.click('#playback'); await page.waitForTimeout(350);
  assert((await state()).time > 0 && (await state()).running);
  await page.click('#playback');
  const paused = await state(); await page.waitForTimeout(200);
  assert.equal((await state()).time, paused.time);
  assert.equal((await state()).renderedFrames, paused.renderedFrames);
  await page.click('#replay');
  assert((await state()).time < 1 && (await state()).running);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await state(); await page.waitForTimeout(180);
  assert.equal((await state()).renderedFrames, hidden.renderedFrames);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  checks.push('pause/resume, restart, hidden-tab suspension');

  await page.selectOption('#scene', 'garden'); await seek(0);
  const gardenShot = await page.screenshot({ path: 'test-results/garden-desktop.png' });
  const gardenStats = await stats(gardenShot);
  assert(gardenStats.metal > knightStats.metal * .65, 'Knight remains visible in the flower bed');
  assert(gardenStats.colored > knightStats.colored * 2, 'Colourful lilies cover the ground');
  await page.selectOption('#quick-quality', 'light');
  assert.equal((await state()).quality, 'light');
  await page.screenshot({ path: 'test-results/garden-light.png' });
  await page.selectOption('#quick-quality', 'fine');
  await page.keyboard.press('d'); assert(await page.locator('#dev').isVisible());
  await page.locator('#source').check(); await page.locator('#close-dev').click();
  await page.screenshot({ path: 'test-results/garden-source.png' });
  await page.keyboard.press('d'); await page.locator('#source').uncheck();
  for (const [id, value] of [['glyph-size','1.1'],['spacing','1.1'],['contrast','1.2'],['gamma','0.8'],['scarf-speed','1.3'],['scarf-amplitude','1.8'],['grass','0.8'],['particles','1.2'],['density','0.9']]) {
    await page.locator('#' + id).fill(value);
  }
  await page.locator('#close-dev').click();
  await page.reload(); await page.waitForFunction(() => !!window.artworkStudio);
  assert.equal((await state()).scene, 'garden');
  checks.push('scene selector, complete flower bed, both qualities, advanced tuning, source comparison, remembered selection');

  for (const [width,height,name] of [[390,844,'mobile'],[844,390,'landscape']]) {
    await page.setViewportSize({ width,height }); await seek(1.2);
    await page.screenshot({ path: `test-results/garden-${name}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
    assert(await page.locator('#scene').isVisible());
    await page.selectOption('#scene', 'knight'); await seek(1.2);
    await page.screenshot({ path: `test-results/knight-${name}.png` });
    await page.selectOption('#scene', 'garden');
  }
  checks.push('mobile and landscape framing, no scrolling');

  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.selectOption('#scene', 'lilies');
  const lilyStages = [];
  for (const [name,t] of [['early',.45],['partial',2.7],['full',4.2]]) {
    await seek(t); lilyStages.push((await state()).visibleGlyphs);
    await page.screenshot({ path: `test-results/lilies-${name}.png` });
  }
  assert(lilyStages[0] < lilyStages[1] && lilyStages[1] < lilyStages[2]);
  const held = await state(); await page.waitForTimeout(180);
  assert.equal((await state()).renderedFrames, held.renderedFrames);
  await page.click('#replay'); await page.waitForFunction(() => window.artworkStudio.getState().time === 4.2);
  assert.equal((await state()).running, false);
  checks.push('original lily bloom, replay, completed hold');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const scene of ['knight','garden','lilies']) {
    await page.selectOption('#scene', scene);
    assert.equal((await state()).running, false);
    const reduced = await state(); await page.waitForTimeout(100);
    assert.equal((await state()).renderedFrames, reduced.renderedFrames);
    await page.click('#replay'); assert.equal((await state()).running, false);
    if (scene === 'lilies') assert.equal((await state()).time, 4.2);
  }
  checks.push('reduced motion for all three scenes');
  assert.deepEqual(errors, []);
  const report = { result: 'All browser checks passed', knightStats, gardenStats, checks, errors };
  await writeFile('test-results/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
