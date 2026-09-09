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
    .getByRole('button', { name: 'Watch the bug', exact: true })
    .waitFor();
  await page.waitForTimeout(1600);
  await page
    .locator('.tf-demo-controls')
    .evaluate((element) =>
      element.scrollIntoView({ block: 'start', behavior: 'smooth' }),
    );
  await page.waitForTimeout(500);
  await page
    .getByRole('button', { name: 'Watch the bug', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'The editor is showing staging.json',
    { timeout: 10000 },
  );
  await page.waitForTimeout(1500);
  await page
    .getByRole('button', { name: 'Read debugging data', exact: true })
    .click();
  await expect(page.getByTestId('debug-evidence')).toContainText(
    'production.json',
  );
  await page.screenshot({ path: 'docs/media/transform-demo.png' });
  await page.waitForTimeout(3000);
  await page
    .getByRole('button', { name: 'Run with the fix', exact: true })
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
  await page.waitForTimeout(3000);
  const video = page.video();
  await context.close();
  await video.saveAs('../tab-debug-demo.webm');
  console.log(
    'Recorded the URL correction, native tool readout, and fixed rerun.',
  );
} finally {
  await context.close();
  await browser.close();
}
