import { test, expect } from '@playwright/test';

test('real HTTP response order produces a stale editor; the fix preserves the selection', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Reproduce bug', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText(
    'The older file replaced your selection.',
  );
  await expect(page.getByTestId('selected-file')).toHaveText('second.json');
  await expect(page.getByTestId('displayed-file')).toHaveText('first.json');
  await expect(page.getByTestId('response-order')).toHaveText(
    'second.json → first.json',
  );
  await page.getByRole('button', { name: 'Read state', exact: true }).click();
  const state = JSON.parse(await page.getByTestId('tool-result').innerText())
    .state.FileLoader;
  expect(state.selectedFile).toBe('second.json');
  expect(state.displayedFile).toBe('first.json');
  await expect(
    page.getByText('Read through native WebMCP', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Read requests', exact: true })
    .click();
  await expect(page.getByTestId('tool-result')).toContainText('"events"');
  const requests = JSON.parse(
    await page.getByTestId('tool-result').innerText(),
  );
  expect(
    requests.events.filter(
      (event: { kind: string; data: { status?: number } }) =>
        event.kind === 'response' && event.data.status === 200,
    ),
  ).toHaveLength(2);
  await page.getByRole('button', { name: 'Run with fix', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'The older response was ignored. Your selection stays.',
  );
  await expect(page.getByTestId('displayed-file')).toHaveText('second.json');
  await page.getByRole('button', { name: 'Read state', exact: true }).click();
  expect(
    JSON.parse(await page.getByTestId('tool-result').innerText()).state
      .FileLoader.discardedOlderResponse,
  ).toBe(true);
});

test('a request failure is visible and the demo can be run again', async ({
  page,
}) => {
  await page.route('**/api/transform-file/first.json', (route) =>
    route.fulfill({ status: 503, body: 'Unavailable' }),
  );
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Reproduce bug', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText(
    'File request failed (503)',
  );
  await page.unroute('**/api/transform-file/first.json');
  await page.getByRole('button', { name: 'Run with fix', exact: true }).click();
  await expect(page.getByTestId('displayed-file')).toHaveText('second.json');
  await expect(page.getByRole('status')).toHaveText(
    'The older response was ignored. Your selection stays.',
  );
});

test('landing page and favicon work on a narrow screen', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Debug the page your agent is testing.',
  );
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute(
    'href',
    '/favicon.svg',
  );
  expect(
    (await request.get('/favicon.svg')).headers()['content-type'],
  ).toContain('image/svg+xml');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/transform-mobile.png',
    fullPage: true,
  });
});
