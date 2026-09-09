import { test, expect as baseExpect, type Page } from '@playwright/test';
const expect = baseExpect.configure({ timeout: 10_000 });

async function advanceWalkthrough(page: Page) {
  await page
    .getByRole('button', { name: '2. Submit production.json', exact: true })
    .click();
  await page
    .getByRole('button', { name: '3. Show production response', exact: true })
    .click();
  await page
    .getByRole('button', { name: '4. Show staging response', exact: true })
    .click();
}

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

test('each walkthrough step waits for the visitor, including before the older response replaces production; the fix preserves the choice', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: '1. Submit staging.json', exact: true })
    .click();
  // The real five-second staging download can finish without advancing the UI.
  await expect(page.getByLabel('Downloads', { exact: true })).toContainText(
    'Downloaded · held for your next click',
  );
  await expect(page.getByTestId('last-submitted')).toHaveText('staging.json');
  await expect(page.getByTestId('displayed-file')).toHaveText(
    'Waiting for a file',
  );
  await page
    .getByRole('button', { name: '2. Submit production.json', exact: true })
    .click();
  await expect(page.getByTestId('displayed-file')).toHaveText(
    'Waiting for a file',
  );
  await page
    .getByRole('button', { name: '3. Show production response', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'This is the right result',
  );
  await expect(page.getByLabel('YAML output')).toContainText('"production"');
  await expect(page.getByTestId('last-submitted')).toHaveText(
    'production.json',
  );
  await expect(page.getByTestId('displayed-file')).toHaveText(
    'production.json',
  );
  // Longer than the old entire autoplay. A ready staging response must stay held.
  await page.waitForTimeout(5500);
  await expect(page.getByTestId('displayed-file')).toHaveText(
    'production.json',
  );
  await page
    .getByRole('button', { name: '4. Show staging response', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'The editor is showing staging.json',
  );
  await expect(page.getByLabel('JSON input')).toContainText('staging.json');
  await expect(page.getByLabel('YAML output')).toContainText('"staging"');
  await expect(page.getByTestId('last-submitted')).toHaveText(
    'production.json',
  );
  await expect(page.getByTestId('displayed-file')).toHaveText('staging.json');
  const downloads = page.getByLabel('Downloads', { exact: true });
  await expect(downloads).toContainText('Submission 1: staging.json');
  await expect(downloads.locator('.tf-download').nth(0)).toContainText(
    'Applied second',
  );
  await expect(downloads.locator('.tf-download').nth(1)).toContainText(
    'Applied first',
  );
  const original = await readEvidence(page);
  // Network arrivals are not relabeled as editor updates by the walkthrough.
  expect(original.inspect_state.state.FileLoader.appliedFiles).toEqual([
    'production.json',
    'staging.json',
  ]);
  expect(original.inspect_state.state.FileLoader.responseDelivery).toBe(
    'Paused between walkthrough steps',
  );
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
    ['200 /api/transform-file/staging.json', 200],
    ['200 /api/transform-file/production.json', 200],
  ]);
  await page
    .getByRole('button', { name: 'Run with the fix', exact: true })
    .click();
  await advanceWalkthrough(page);
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

test('editing the URL without submitting it starts no request and leaves the last submission unchanged', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/transform-file/'))
      requests.push(request.url());
  });
  await page.route('**/api/transform-file/staging.json', async (route) => {
    await gate;
    await route.fulfill({
      json: { file: 'staging.json', environment: 'staging' },
    });
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Load File', exact: true }).click();
    await page.getByRole('button', { name: 'Fetch URL', exact: true }).click();
    await expect(page.getByTestId('last-submitted')).toHaveText('staging.json');
    await page
      .getByLabel('File URL', { exact: true })
      .fill('/api/transform-file/production.json');
    await expect(page.locator('.tf-submission-note')).toHaveText(
      'URL entered. Click Fetch URL to submit it.',
    );
    await expect(page.getByTestId('last-submitted')).toHaveText('staging.json');
    release();
    await expect(page.getByTestId('displayed-file')).toHaveText('staging.json');
    const evidence = await readEvidence(page);
    expect(requests).toHaveLength(1);
    expect(evidence.inspect_state.state.FileLoader.selectedFile).toBe(
      'staging.json',
    );
    expect(
      evidence.inspect_requests.events.filter(
        (event: { kind: string }) => event.kind === 'request',
      ),
    ).toHaveLength(1);
  } finally {
    release();
  }
});

test('a fast first request leaves the correct result, so the bug outcome is not scripted', async ({
  page,
}) => {
  await page.route('**/api/transform-file/staging.json', (route) =>
    route.fulfill({ json: { file: 'staging.json', environment: 'staging' } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Load File', exact: true }).click();
  await page.getByRole('button', { name: 'Fetch URL', exact: true }).click();
  await expect(page.getByTestId('displayed-file')).toHaveText('staging.json');
  await page.getByRole('button', { name: 'Load File', exact: true }).click();
  await page
    .getByRole('button', { name: 'production.json fast', exact: true })
    .click();
  await page.getByRole('button', { name: 'Fetch URL', exact: true }).click();
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
    .getByRole('button', { name: '1. Submit staging.json', exact: true })
    .click();
  await advanceWalkthrough(page);
  await expect(
    page.getByRole('button', { name: 'Start again', exact: true }),
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
  await advanceWalkthrough(page);
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
    .getByRole('button', { name: '1. Submit staging.json', exact: true })
    .click();
  await advanceWalkthrough(page);
  await expect(page.getByRole('status')).toContainText(
    'The editor is showing staging.json',
  );
  await readEvidence(page);
  await page.getByRole('button', { name: 'Load File', exact: true }).click();
  await expect(page.getByLabel('File URL', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fetch URL', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'production.json is in the editor.',
  );
  const manual = await readEvidence(page);
  expect(manual.inspect_state.state.FileLoader.responseDelivery).toBe('Live');

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
