import { chromium } from '@playwright/test';
import { mkdirSync, copyFileSync } from 'node:fs';
import { chromePath } from './browser.mjs';
const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--enable-features=WebMCP', '--enable-blink-features=WebMCP,WebMCPTesting'] });
mkdirSync('docs/media', { recursive: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, recordVideo: { dir: 'test-results/video', size: { width: 1440, height: 1040 } } });
const page = await context.newPage();
// Presentation pacing only. All verification waits for observable conditions.
const beat = ms => page.waitForTimeout(ms);
try {
  await page.goto(base); await page.waitForFunction(() => !!window.__PAGESCOPE_REPLAY__);
  await page.evaluate(() => document.fonts.ready); await beat(2200);
  await page.getByRole('button', { name: 'Capture & compare' }).click();
  await page.locator('.comparison-grid').scrollIntoViewIfNeeded();
  await page.getByTestId('preview-patched').locator('.result-badge').filter({ hasText: 'PASS' }).waitFor();
  await beat(3000);
  await page.getByRole('button', { name: 'Jump to it' }).click(); await beat(3200);
  await page.getByRole('button', { name: 'Inspect state after Q1' }).click(); await beat(1300);
  await page.getByRole('button', { name: 'Check all 6 orders' }).click(); await beat(4300);
  await page.screenshot({ path: 'docs/media/replay.png', fullPage: true });
  let download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save incident', exact: true }).click();
  await (await download).saveAs('../pagescope-atlas.incident.json'); await beat(2000);
  download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export regression test', exact: true }).click();
  await (await download).saveAs('../pagescope-atlas.spec.ts'); await beat(3200);
  await page.locator('.comparison-grid').scrollIntoViewIfNeeded(); await beat(3200);
  await context.close(); copyFileSync(await page.video().path(), '../pagescope-demo.webm');
  console.log('Recorded the actual replay workflow and exported its incident and regression test.');
} finally { await browser.close(); }
