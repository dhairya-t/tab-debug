import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

test('published archive is the exact package consumed by the setup example', async ({
  request,
  page,
}) => {
  const name = 'dhairya-t-tab-debug-0.3.0.tgz';
  const response = await request.get(`/downloads/${name}`);
  expect(response.ok()).toBeTruthy();
  const hash = (bytes: Buffer) =>
    createHash('sha256').update(bytes).digest('hex');
  expect(hash(await response.body())).toBe(
    hash(readFileSync(`public/downloads/${name}`)),
  );
  await page.goto('/setup');
  await page.getByRole('button', { name: 'Get shipping quote' }).click();
  await expect(page.locator('output')).toHaveText('France: $16.00');
  await page.getByRole('button', { name: 'Read state', exact: true }).click();
  let data = JSON.parse(await page.getByTestId('setup-output').innerText());
  expect(data.route).toBe('/setup');
  expect(data.state.Shipping.quote.cents).toBe(1600);
  expect(data.state.Shipping.loading).toBe(false);
  await page
    .getByRole('button', { name: 'Read requests', exact: true })
    .click();
  data = JSON.parse(await page.getByTestId('setup-output').innerText());
  const requests = data.events.filter(
    (e: { kind: string }) => e.kind === 'request',
  );
  expect(requests).toHaveLength(1);
  expect(requests[0].data.path).toBe('/api/shipping');
  expect(JSON.stringify(data)).not.toContain('country=');
  expect(
    data.events.some(
      (e: { data: { status?: number } }) => e.data.status === 200,
    ),
  ).toBeTruthy();
});

test('disabling and remounting tools preserves the app and avoids duplicate request capture', async ({
  page,
}) => {
  await page.goto('/setup');
  await page.getByLabel('Enable tools').uncheck();
  await expect(
    page.getByRole('button', { name: 'Read state', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Example country').selectOption('Japan');
  await page.getByRole('button', { name: 'Get shipping quote' }).click();
  await expect(page.locator('output')).toHaveText('Japan: $24.00');
  await page.getByLabel('Enable tools').check();
  await expect(page.locator('output')).toHaveText('Japan: $24.00');
  await page.getByRole('button', { name: 'Get shipping quote' }).click();
  await page
    .getByRole('button', { name: 'Read requests', exact: true })
    .click();
  const data = JSON.parse(await page.getByTestId('setup-output').innerText());
  expect(
    data.events.filter((e: { kind: string }) => e.kind === 'request'),
  ).toHaveLength(1);
});

test('setup is readable on mobile and copy buttons copy the documented code', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/setup');
  await page.getByRole('button', { name: 'Copy app/layout.tsx' }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain(
    "import { TabDebug } from '@dhairya-t/tab-debug/next'",
  );
  expect(text).toContain('<TabDebug>{children}</TabDebug>');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: 'test-results/setup-mobile.png',
    fullPage: true,
  });
});
