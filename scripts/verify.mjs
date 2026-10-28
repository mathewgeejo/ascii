import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.argv[2] || process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [], checks = [], externalRequests = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (new URL(r.url()).origin !== new URL(base).origin) externalRequests.push(r.url()); });
  const state = () => page.evaluate(() => window.artworkStudio.getState());
  const seek = t => page.evaluate(t => window.artworkStudio.seek(t), t);
  const shot = name => page.screenshot({ path: `test-results/check-${name}.png` });
  const record = message => { checks.push(message); console.log('PASS ' + message); };
  async function pixels(buffer) {
    return page.evaluate(async data => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      const p = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0, bone = 0, red = 0, sum = 0;
      for (let i = 0; i < p.length; i += 4) {
        const r = p[i], g = p[i + 1], b = p[i + 2];
        if (Math.max(r, g, b) > 35) lit++;
        if (r > 45 && g > 35 && r > b * 1.05 && r < g * 1.5) bone++;
        if (r > 65 && r > g * 2 && r > b * 2) red++;
        sum += (r + g + b) / 3;
      }
      return { lit, bone, red, mean: sum / (p.length / 4) };
    }, buffer.toString('base64'));
  }

  await page.goto(`${base}/?scene=skull&t=0`);
  await page.waitForFunction(() => !!window.artworkStudio);
  assert.equal((await state()).scene, 'skull');
  const front = await shot('skull-front'), skullStats = await pixels(front);
  assert(skullStats.bone > 6500, 'Actual shaded bone pixels appear on the first frame');
  const frontCenter = await page.screenshot({ clip: { x: 460, y: 180, width: 520, height: 650 } });
  await seek(4.7);
  const profile = await page.screenshot({ clip: { x: 460, y: 180, width: 520, height: 650 } });
  assert(!frontCenter.equals(profile), '3D skull changes silhouette in profile');
  await seek(0);
  assert(front.equals(await page.screenshot()), 'Seeking restores the exact skull frame');
  await seek(20);
  assert.equal((await pixels(await page.screenshot())).red, 0, 'No red emission between shots');
  await seek(20.25);
  const laserStats = await pixels(await shot('red-lasers'));
  assert(laserStats.red > 150, 'Rare red laser fire renders from the sockets');
  await seek(20.6);
  assert.equal((await pixels(await page.screenshot())).red, 0, 'Red lasers stop after the brief burst');
  record('3D skull first frame, profile rotation, deterministic seeking and brief red lasers');

  assert.deepEqual(await page.locator('#scene option').evaluateAll(options => options.map(option => option.value)),
    ['stingray', 'lilies', 'skull'], 'Only the retained artwork appears in the selector');
  await seek(0);

  await page.click('#playback'); await page.waitForTimeout(400);
  assert((await state()).time > 0 && (await state()).running);
  await page.click('#playback');
  const paused = await state(); await page.waitForTimeout(180);
  assert.equal((await state()).renderedFrames, paused.renderedFrames);
  await page.click('#replay');
  assert((await state()).time < 1 && (await state()).running);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await state(); await page.waitForTimeout(120);
  assert.equal((await state()).renderedFrames, hidden.renderedFrames);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  record('pause/resume, restart and hidden-tab suspension');

  for (const scene of ['skull', 'stingray']) {
    await page.selectOption('#scene', scene); await seek(0);
    await page.selectOption('#quick-quality', 'light');
    assert.equal((await state()).quality, 'light');
    assert((await pixels(await shot(scene + '-light'))).lit > 1500);
    await page.selectOption('#quick-quality', 'fine');
    await page.keyboard.press('d');
    await page.locator('#source').check(); await page.locator('#close-dev').click();
    const source = await page.locator('#stage').screenshot();
    await page.keyboard.press('d'); await page.locator('#source').uncheck(); await page.locator('#close-dev').click();
    assert(!source.equals(await page.locator('#stage').screenshot()), scene + ' has a working smooth-source view');
  }
  record('both qualities, scene texture switching and smooth-source comparison');

  for (const [width, height, label] of [[390, 844, 'mobile'], [844, 390, 'landscape']]) {
    await page.setViewportSize({ width, height });
    for (const scene of ['skull', 'stingray']) {
      await page.selectOption('#scene', scene); await seek(0);
      assert.equal((await state()).width, width);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      assert((await pixels(await shot(scene + '-' + label))).lit > 1500);
    }
  }
  record('phone and landscape resizing, visible artwork and no horizontal scrolling');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.selectOption('#scene', 'lilies');
  const glyphs = [];
  for (const t of [.45, 2.7, 4.2]) { await seek(t); glyphs.push((await state()).visibleGlyphs); }
  assert(glyphs[0] < glyphs[1] && glyphs[1] < glyphs[2]);
  const complete = await state(); await page.waitForTimeout(100);
  assert.equal((await state()).renderedFrames, complete.renderedFrames);
  await page.selectOption('#scene', 'stingray'); await seek(0);
  const ray = await page.locator('#stage').screenshot(); await seek(1.7);
  assert(!ray.equals(await page.locator('#stage').screenshot()));
  record('original lily bloom/hold and animated stingray retained');

  await page.selectOption('#scene', 'skull');
  await page.goto(base); await page.waitForFunction(() => !!window.artworkStudio);
  assert.equal((await state()).scene, 'skull');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const scene of ['skull', 'stingray', 'lilies']) {
    await page.selectOption('#scene', scene);
    assert.equal((await state()).running, false);
    const stable = await state(); await page.waitForTimeout(80);
    assert.equal((await state()).renderedFrames, stable.renderedFrames);
    await page.click('#replay'); assert.equal((await state()).running, false);
    if (scene === 'lilies') assert.equal((await state()).time, 4.2);
  }
  record('remembered selection and reduced motion for all three scenes');
  assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
  const report = { result: 'All browser checks passed', skullStats, laserStats, checks, errors, externalRequests };
  await writeFile('test-results/report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
