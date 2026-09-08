import { test, expect, type Page } from '@playwright/test';
async function choose(page: Page, label: string) {
  await page.getByRole('combobox', { name: 'Failure scenario' }).click();
  await page.getByRole('option', { name: label }).click();
}
async function reproduce(page: Page) {
  await page
    .getByRole('button', { name: 'Reproduce bug', exact: true })
    .click();
  await expect(
    page.getByText('The bug is reproduced.', { exact: true }),
  ).toBeVisible();
}
async function fix(page: Page) {
  await page
    .getByRole('button', { name: 'Apply fix & verify', exact: true })
    .click();
  await expect(
    page.getByText('Patched run complete.', { exact: true }),
  ).toBeVisible();
}
async function inspect(page: Page, name: string) {
  await page.getByRole('tab', { name: 'Tools', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
  return JSON.parse(await page.getByTestId('tool-result').innerText());
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.context-id')).toHaveText(/[a-f0-9]{8}/);
  await expect(
    page.getByRole('button', { name: 'Reproduce bug' }),
  ).toBeEnabled();
});
test('real HTTP failure is observable, retry restores the catalog', async ({
  page,
}) => {
  await reproduce(page);
  await expect(
    page.getByText('No observations found.', { exact: true }),
  ).toBeVisible();
  const broken = await inspect(page, 'inspect_requests');
  expect(broken.events.some((e: any) => e.data.status === 503)).toBeTruthy();
  await fix(page);
  await expect(page.locator('.photo-grid .photo')).toHaveCount(3);
  const fixed = await inspect(page, 'inspect_requests');
  expect(fixed.events.some((e: any) => e.data.status === 200)).toBeTruthy();
  const state = await inspect(page, 'inspect_state');
  expect(state.state.Archive).toMatchObject({
    phase: 'verified',
    resultCount: 3,
    failedAttempts: 1,
  });
});
test('out-of-order responses corrupt original state; generation guard rejects stale response', async ({
  page,
}) => {
  await choose(page, 'Out-of-order search');
  await reproduce(page);
  const before = await inspect(page, 'inspect_state');
  expect(before.state.Archive).toMatchObject({
    query: 'lena',
    appliedQuery: 'namibia',
    resultCount: 2,
  });
  await fix(page);
  const after = await inspect(page, 'inspect_state');
  expect(after.state.Archive).toMatchObject({
    query: 'lena',
    appliedQuery: 'lena',
    resultCount: 1,
    discarded: 1,
  });
  const trace = await inspect(page, 'inspect_timeline');
  expect(trace.events.some((e: any) => e.kind === 'discard')).toBeTruthy();
});
test('real React exception is contained and nullable title patch renders safely', async ({
  page,
}) => {
  await choose(page, 'Nullable metadata crash');
  await reproduce(page);
  await expect(
    page.getByText('The archive couldn’t render.', { exact: true }),
  ).toBeVisible();
  const error = await inspect(page, 'inspect_errors');
  expect(
    error.events.some((e: any) => e.data.source === 'React ErrorBoundary'),
  ).toBeTruthy();
  await fix(page);
  await expect(page.locator('.photo-grid .photo')).toHaveCount(3);
  await expect(
    page.getByText('0' + '1 / UNTITLED OBSERVATION', { exact: false }),
  ).toBeVisible();
});
test('view transitions reset page identity and clear previous diagnostics', async ({
  page,
}) => {
  await reproduce(page);
  const before = await inspect(page, 'get_page_context');
  await page.getByRole('button', { name: 'About the archive' }).click();
  const after = await inspect(page, 'get_page_context');
  expect(after.pageId).not.toBe(before.pageId);
  expect(after.latestError).toBeNull();
  expect(after.stateSources).toEqual(['View']);
  const trace = await inspect(page, 'inspect_requests');
  expect(trace.total).toBe(0);
});
test('export contains real evidence and valid trace schema', async ({
  page,
}) => {
  await reproduce(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export trace', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const report = JSON.parse(Buffer.concat(chunks).toString());
  expect(report.format).toBe('pagescope.trace.v1');
  expect(report.experiment).toMatchObject({
    scenario: 'network',
    fixed: false,
  });
  expect(report.events.some((e: any) => e.kind === 'error')).toBeTruthy();
});
test('mobile controls, imagery, and layout remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  for (const image of await page.locator('.photo img').all())
    expect(
      await image.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    ).toBeTruthy();
  await reproduce(page);
  await fix(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
test('desktop visual evidence and modal keyboard dismissal', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'How it works' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
});
