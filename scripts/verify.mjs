import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5173';
const output = '/tmp/verify';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
const programWarnings = [];
const monitor = target => {
  target.on('pageerror', error => errors.push(error.message));
  target.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warning' && /BindGroup|textureSource|textureSampler|program|shader/i.test(message.text())) {
      programWarnings.push(message.text());
    }
  });
};
monitor(page);
const checks = [];

async function load(url) {
  await page.goto(url);
  await page.waitForFunction(() => !!window.artworkStudio);
}

async function getState() {
  return page.evaluate(() => window.artworkStudio.getState());
}

async function assertNoNewShaderWarnings(label, previousCount) {
  assert.deepEqual(programWarnings.slice(previousCount), [], `${label} shader/program warnings`);
}

async function assertArtworkRendered(label) {
  const result = await page.evaluate(() => {
    const state = window.artworkStudio.getState();
    window.artworkStudio.seek(state.time);
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { context: false, litPixels: 0 };
    gl.finish();
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let litPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 12 || pixels[i + 1] > 12 || pixels[i + 2] > 12) litPixels++;
    }
    return { context: true, litPixels };
  });
  assert.equal(result.context, true, `${label} should have a WebGL context`);
  assert.ok(result.litPixels > 100, `${label} should render non-black artwork (got ${result.litPixels} lit pixels)`);
  return result;
}

try {
  await load(base);
  assert.equal((await getState()).scene, 'knight', 'Knight is the default scene');
  await assertArtworkRendered('Default knight scene');
  await page.screenshot({ path: `${output}/knight.png` });
  checks.push('default knight renders glyphs');

  await load(`${base}/?scene=lilies`);
  await page.waitForFunction(() => {
    const state = window.artworkStudio.getState();
    return state.scene === 'lilies' && state.visibleGlyphs > 100;
  });
  assert.equal((await getState()).scene, 'lilies');
  await assertArtworkRendered('Lilies scene');
  await page.screenshot({ path: `${output}/lilies.png` });
  await page.selectOption('#scene', 'garden');
  assert.equal((await getState()).scene, 'garden');
  await assertArtworkRendered('Knight in lilies scene');
  await page.screenshot({ path: `${output}/garden.png` });
  checks.push('switching renders lilies and knight-in-lilies');

  await page.selectOption('#scene', 'knight');
  await page.waitForFunction(() => window.artworkStudio.getState().running);
  await page.click('#playback');
  assert.equal((await getState()).paused, true, 'Playback control pauses');
  assert.equal((await getState()).running, false);
  await page.click('#playback');
  assert.equal((await getState()).paused, false, 'Playback control resumes');
  await page.waitForFunction(() => window.artworkStudio.getState().running);
  await page.waitForTimeout(250);
  await page.click('#replay');
  await page.waitForFunction(() => window.artworkStudio.getState().time < 0.5);
  assert.equal((await getState()).paused, false, 'Restart resumes playback');
  checks.push('playback pause/resume and restart');

  assert.equal(await page.locator('#dev').isVisible(), false, 'Studio panel starts hidden');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('d');
  assert.equal(await page.locator('#dev').isVisible(), true, 'D toggles the hidden studio panel');
  await page.selectOption('#quality', 'light');
  assert.equal((await getState()).quality, 'light', 'Quality selector updates renderer quality');
  await page.selectOption('#quality', 'fine');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('d');
  assert.equal(await page.locator('#dev').isVisible(), false);
  checks.push('D toggles developer panel and quality selector works');

  let warningCount = programWarnings.length;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForFunction(() => {
    const state = window.artworkStudio.getState();
    return state.width === 1280 && state.height === 800;
  });
  await page.waitForTimeout(100);
  await assertNoNewShaderWarnings('Renderer resize', warningCount);

  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('d');
  warningCount = programWarnings.length;
  await page.selectOption('#quality', 'light');
  assert.equal((await getState()).quality, 'light');
  await page.waitForTimeout(100);
  await assertNoNewShaderWarnings('Quality switch', warningCount);

  warningCount = programWarnings.length;
  const glyphSize = await page.locator('#glyph-size').evaluate(element => {
    const input = element;
    input.value = String(Number(input.value) + Number(input.step));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return Number(input.value);
  });
  assert.equal((await getState()).settings.glyphSize, glyphSize);
  await page.waitForTimeout(100);
  await assertNoNewShaderWarnings('Glyph-size change', warningCount);
  await page.click('#close-dev');
  checks.push('resize, quality switch, and glyph-size change reuse bound shader resources');

  await page.click('#replay');
  await page.waitForFunction(() => window.artworkStudio.getState().running);
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenTime = (await getState()).time;
  assert.equal((await getState()).running, false, 'Hidden document suspends scheduled animation');
  await page.waitForTimeout(250);
  assert.equal((await getState()).time, hiddenTime, 'Hidden timeline does not advance');
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => window.artworkStudio.getState().running);
  checks.push('document.hidden suspends and resumes animation');

  page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  monitor(page);
  await load(`${base}/?scene=knight&t=2`);
  await page.screenshot({ path: `${output}/mobile.png` });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390, 'Mobile layout has no horizontal overflow');
  checks.push('390x844 layout has no horizontal scrolling');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load(`${base}/?scene=lilies`);
  assert.equal((await getState()).reducedMotion, true, 'Reduced-motion preference is observed');
  assert.equal((await getState()).time, 4.2, 'Reduced motion holds the completed lily artwork');
  assert.equal((await getState()).running, false, 'Reduced motion does not schedule animation');
  await page.click('#replay');
  assert.equal((await getState()).time, 4.2, 'Replay preserves the completed reduced-motion artwork');
  await page.screenshot({ path: `${output}/reduced-motion.png` });
  checks.push('reduced-motion preference holds completed lilies');

  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  assert.deepEqual(programWarnings, [], `Shader/program warnings: ${programWarnings.join('\n')}`);
  const report = { checks, errors, programWarnings, screenshots: [
    'knight.png', 'lilies.png', 'garden.png', 'mobile.png', 'reduced-motion.png',
  ].map(name => `${output}/${name}`) };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, result: 'All browser checks passed' }, null, 2));
} finally {
  await browser.close();
}
