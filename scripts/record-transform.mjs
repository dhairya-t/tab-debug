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
    dir: 'test-results/transform-demo',
    size: { width: 1280, height: 900 },
  },
});
try {
  const page = await context.newPage();
  await page.goto(base);
  await page
    .getByRole('button', { name: 'Reproduce bug', exact: true })
    .waitFor();
  await page.waitForTimeout(1500);
  await page
    .getByRole('button', { name: 'Reproduce bug', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText(
    'The older file replaced your selection.',
  );
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: 'docs/media/transform-demo.png',
    fullPage: true,
  });
  if (process.env.RECORD_PREVIEW === '1')
    await page.screenshot({ path: 'public/images/tab-debug-preview.png' });
  await page.getByRole('button', { name: 'Read state', exact: true }).click();
  await expect(page.getByTestId('tool-result')).toContainText(
    '"displayedFile": "first.json"',
  );
  await page.getByTestId('tool-result').scrollIntoViewIfNeeded();
  await page.waitForTimeout(3500);
  await page
    .getByRole('button', { name: 'Read requests', exact: true })
    .click();
  await expect(page.getByTestId('tool-result')).toContainText('"events"');
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Run with fix', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'The older response was ignored. Your selection stays.',
  );
  await page
    .getByRole('region', { name: 'Transform file loading demo' })
    .scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);
  const video = page.video();
  await context.close();
  await video.saveAs('../tab-debug-demo.webm');
} finally {
  await context.close();
  await browser.close();
}
