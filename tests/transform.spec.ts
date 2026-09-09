import { test, expect as baseExpect, type Page } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 10_000 });

async function readEvidence(page: Page) {
  await page
    .getByRole('button', { name: 'Read debugging data', exact: true })
    .click();
  await expect(page.getByTestId('debug-evidence')).toBeVisible();
  await expect(
    page.getByText('Read through native WebMCP', { exact: true }),
  ).toBeVisible();
  return JSON.parse((await page.getByTestId('tool-result').textContent())!);
}

test('a corrected URL briefly renders the right JSON and YAML, then the older response replaces both; the fix preserves the choice', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Watch the bug', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'production.json is ready',
  );
  await expect(page.getByLabel('YAML output')).toContainText('"production"');
  await expect(page.getByRole('status')).toContainText(
    'The editor is showing staging.json',
  );
  await expect(page.getByLabel('JSON input')).toContainText('staging.json');
  await expect(page.getByLabel('YAML output')).toContainText('"staging"');
  const original = await readEvidence(page);
  expect(original.inspect_state.state.FileLoader.selectedFile).toBe(
    'production.json',
  );
  expect(original.inspect_state.state.FileLoader.displayedFile).toBe(
    'staging.json',
  );
  expect(
    original.inspect_requests.events
      .filter((e: { kind: string }) => e.kind === 'response')
      .map((e: { label: string; data: { status: number } }) => [
        e.label,
        e.data.status,
      ]),
  ).toEqual([
    ['200 /api/transform-file/production.json', 200],
    ['200 /api/transform-file/staging.json', 200],
  ]);
  await page
    .getByRole('button', { name: 'Run with the fix', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'The older download was ignored',
  );
  await expect(page.getByLabel('JSON input')).toContainText('production.json');
  await expect(page.getByLabel('YAML output')).toContainText('"production"');
  const fixed = await readEvidence(page);
  expect(fixed.inspect_state.state.FileLoader.discardedOlderResponse).toBe(
    true,
  );
  expect(fixed.inspect_state.state.FileLoader.displayedFile).toBe(
    'production.json',
  );
});

test('the actual Load File controls reproduce the race without the walkthrough', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load File', exact: true }).click();
  await page.getByRole('button', { name: 'Fetch URL', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'The staging URL is slow',
  );
  await page
    .getByRole('button', { name: 'production.json fast', exact: true })
    .click();
  await page.getByRole('button', { name: 'Fetch URL', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'production.json is ready',
  );
  await expect(page.getByRole('status')).toContainText(
    'The editor is showing staging.json',
  );
  const result = await readEvidence(page);
  expect(result.inspect_state.state.FileLoader.implementation).toBe('original');
  expect(result.inspect_state.state.FileLoader.selectedFile).toBe(
    'production.json',
  );
});

test('a fast first request leaves the correct result, so the bug outcome is not scripted', async ({
  page,
}) => {
  await page.route('**/api/transform-file/staging.json', (route) =>
    route.fulfill({ json: { file: 'staging.json', environment: 'staging' } }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Watch the bug', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText(
    'production.json is in the editor.',
  );
  await expect(page.getByLabel('YAML output')).toContainText('"production"');
  const result = await readEvidence(page);
  expect(result.inspect_state.state.FileLoader.selectedFile).toBe(
    result.inspect_state.state.FileLoader.displayedFile,
  );
});

test('a failed download stays visible, and retrying starts a clean run', async ({
  page,
}) => {
  await page.route('**/api/transform-file/staging.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Watch the bug', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Watch again', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('status')).toContainText(
    'File request failed (503)',
  );
  const result = await readEvidence(page);
  expect(
    result.inspect_requests.events.some(
      (e: { data: { status?: number } }) => e.data.status === 503,
    ),
  ).toBe(true);
  await expect(page.getByTestId('debug-evidence')).toContainText('503 failed');
  await page.unroute('**/api/transform-file/staging.json');
  await page
    .getByRole('button', { name: 'Run with the fix', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'The older download was ignored',
  );
});

test('file loading validates sample URLs and supports keyboard dismissal', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Read debugging data' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Load File', exact: true }).click();
  await expect(page.getByLabel('File URL', { exact: true })).toBeFocused();
  await page
    .getByLabel('File URL', { exact: true })
    .fill('https://example.com/private.json');
  await page.getByRole('button', { name: 'Fetch URL', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'only the two sample URLs',
  );
  await page.getByLabel('File URL', { exact: true }).fill('http://[');
  await page.getByRole('button', { name: 'Fetch URL', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'Choose one of the two sample URLs',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('File URL', { exact: true })).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Load File', exact: true }),
  ).toBeFocused();
});

test('the walkthrough, evidence, and file loader work on a phone without overflow', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Watch the bug', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'The editor is showing staging.json',
  );
  await readEvidence(page);
  await page.getByRole('button', { name: 'Load File', exact: true }).click();
  await expect(page.getByLabel('File URL', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await request.get('/favicon.svg')).headers()['content-type'],
  ).toContain('image/svg+xml');
  await page.screenshot({
    path: 'test-results/transform-mobile.png',
    fullPage: true,
  });
});
