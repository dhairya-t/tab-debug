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
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Add to your app',
  );
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
