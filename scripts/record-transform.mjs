import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { chromePath } from './browser.mjs';
const base = process.env.TEST_BASE_URL || 'http://localhost:3001';
const browser = await chromium.launch({
  executablePath: chromePath(),
  args: [
    '--enable-features=WebMCP',
    '--enable-blink-features=WebMCP,WebMCPTesting',
  ],
});
mkdirSync('docs/media', { recursive: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  recordVideo: {
    dir: 'work/transform-video',
    size: { width: 1280, height: 900 },
  },
});
try {
  const page = await context.newPage();
  await page.goto(base);
  await page
    .getByRole('button', { name: '1. Submit staging.json', exact: true })
    .waitFor();
  await page.waitForTimeout(1600);
  await page
    .locator('.tf-demo-controls')
    .evaluate((element) =>
      element.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
  await page.waitForTimeout(500);
  await page
    .getByRole('button', { name: '1. Submit staging.json', exact: true })
    .click();
  await page.waitForTimeout(4500);
  await page
    .getByRole('button', { name: '2. Submit production.json', exact: true })
    .click();
  await page.waitForTimeout(4500);
  await page
    .getByRole('button', { name: '3. Show production response', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'This is the right result',
  );
  await page.screenshot({ path: 'work/transform-paused-production.png' });
  await page.waitForTimeout(6500);
  await page
    .getByRole('button', { name: '4. Show staging response', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'The editor is showing staging.json',
    { timeout: 10000 },
  );
  await page.waitForTimeout(4000);
  await page
    .getByRole('button', { name: 'Read debugging data', exact: true })
    .click();
  await expect(page.getByTestId('debug-evidence')).toContainText(
    'production.json',
  );
  await page
    .locator('.tf-window')
    .evaluate((element) =>
      element.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/media/transform-demo.png' });
  await page.waitForTimeout(3000);
  await page
    .getByRole('button', { name: 'Run with the fix', exact: true })
    .click();
  await page
    .locator('.tf-demo-controls')
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(2500);
  await page
    .getByRole('button', { name: '2. Submit production.json', exact: true })
    .click();
  await page.waitForTimeout(2500);
  await page
    .getByRole('button', { name: '3. Show production response', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'This is the right result',
  );
  await page.waitForTimeout(3500);
  await page
    .getByRole('button', { name: '4. Show staging response', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'The older download was ignored',
    { timeout: 10000 },
  );
  await page
    .getByRole('button', { name: 'Read debugging data', exact: true })
    .click();
  await expect(page.getByTestId('debug-evidence')).toContainText(
    'The editor still matches your last choice',
  );
  await page
    .locator('.tf-window')
    .evaluate((element) =>
      element.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
  await page.waitForTimeout(3000);
  const video = page.video();
  await context.close();
  await video.saveAs('../tab-debug-demo.webm');
  console.log(
    'Recorded the four visitor-paced steps, native tool readout, and fixed rerun.',
  );
} finally {
  await context.close();
  await browser.close();
}
