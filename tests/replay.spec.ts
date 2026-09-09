import { test, expect, type Page, type Download } from '@playwright/test';
import { parseIncident } from '../packages/tab-debug/src/replay';

test.use({ reducedMotion: 'reduce' });
async function ready(page: Page, route = '/replay') {
  await page.goto(route);
  await expect(page.getByTestId('replay-ready')).toHaveAttribute(
    'data-ready',
    'true',
  );
}
async function capture(page: Page) {
  await page
    .getByRole('button', { name: 'Capture & compare', exact: true })
    .click();
  await expect(
    page.getByTestId('preview-original').locator('.result-badge'),
  ).toHaveText('FAIL');
  await expect(
    page.getByTestId('preview-patched').locator('.result-badge'),
  ).toHaveText('PASS');
}
async function contents(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return Buffer.concat(chunks);
}
test('capture, causal state inspection, all schedules and offline replay use real application handlers', async ({
  page,
}) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) calls.push(request.url());
  });
  await ready(page);
  await capture(page);
  expect(calls).toHaveLength(3);
  await expect(
    page.getByTestId('preview-original').locator('.invariant-line'),
  ).toContainText('namibia ≠ lena');
  await expect(
    page.getByTestId('preview-patched').locator('.invariant-line'),
  ).toContainText('lena = lena');
  await page.getByRole('button', { name: 'Jump to it' }).click();
  await expect(
    page.getByTestId('preview-original').locator('.invariant-line'),
  ).toContainText('atlantic ≠ lena');
  await page.getByRole('button', { name: 'Check all 6 orders' }).click();
  await expect(page.locator('.schedule-summary')).toContainText(
    '4/6 original failures → 0/6 guarded failures',
  );
  expect(calls).toHaveLength(3);
  await page.route('**/api/**', (route) => route.abort('internetdisconnected'));
  await page
    .getByRole('button', { name: 'Replay recording', exact: true })
    .click();
  await expect(
    page.getByTestId('preview-original').locator('.result-badge'),
  ).toHaveText('FAIL');
  expect(calls).toHaveLength(3);
  await page.screenshot({
    path: 'test-results/replay-desktop.png',
    fullPage: true,
  });
});
test('an exported incident reopens in a fresh context with API access blocked', async ({
  page,
  browser,
}) => {
  await ready(page);
  await capture(page);
  const event = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Save incident', exact: true })
    .click();
  const buffer = await contents(await event);
  const incident = parseIncident(buffer.toString());
  expect(incident.order).toEqual(['Q3', 'Q2', 'Q1']);
  expect(incident.operations).toHaveLength(3);
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const other = await context.newPage();
  try {
    let apiCalls = 0;
    await other.route('**/api/**', (route) => {
      apiCalls++;
      return route.abort();
    });
    await other.goto(new URL('/replay', page.url()).href);
    await expect(other.getByTestId('replay-ready')).toHaveAttribute(
      'data-ready',
      'true',
    );
    await other
      .getByLabel('Open incident file', { exact: true })
      .setInputFiles({
        name: 'incident.json',
        mimeType: 'application/json',
        buffer,
      });
    await expect(
      other.getByTestId('preview-original').locator('.result-badge'),
    ).toHaveText('FAIL');
    await expect(
      other.getByTestId('preview-patched').locator('.result-badge'),
    ).toHaveText('PASS');
    expect(apiCalls).toBe(0);
  } finally {
    await context.close();
  }
});
test('a changed completion order can pass both versions, and results are not predetermined', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Move Q3 later' }).click();
  await page.getByRole('button', { name: 'Move Q3 later' }).click();
  await page.getByRole('button', { name: 'Capture & compare' }).click();
  await expect(
    page.getByTestId('preview-original').locator('.result-badge'),
  ).toHaveText('PASS');
  await expect(
    page.getByTestId('preview-patched').locator('.result-badge'),
  ).toHaveText('PASS');
});
test('malformed recordings and failed capture requests produce actionable errors', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('Open incident file', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{bad'),
  });
  await expect(
    page.getByTestId('replay-ready').getByRole('alert'),
  ).toContainText('malformed JSON');
  await page.route('**/api/archive?*', (route) =>
    route.fulfill({ status: 503, json: { error: 'offline' } }),
  );
  await page.getByRole('button', { name: 'Capture & compare' }).click();
  await expect(
    page.getByTestId('replay-ready').getByRole('alert'),
  ).toContainText('HTTP 503');
  await expect(
    page.getByRole('button', { name: 'Capture & compare' }),
  ).toBeEnabled();
});
test('mobile capture, state inspection and export controls remain usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await capture(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Check all 6 orders' }).click();
  await expect(page.locator('.schedule-summary')).toContainText(
    '4/6 original failures',
  );
  await expect(
    page.getByRole('button', { name: 'Save incident' }),
  ).toBeEnabled();
  await page.screenshot({
    path: 'test-results/replay-mobile.png',
    fullPage: true,
  });
});
