import { test, expect } from '@playwright/test';

test('only the file-loading and search demos are offered; old demo URLs lead to the retained examples', async ({
  page,
}) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Examples', exact: true });
  await expect(nav.getByRole('link')).toHaveCount(2);
  await nav.getByRole('link', { name: 'Search example', exact: true }).click();
  await expect(page).toHaveURL(/\/replay$/);
  await expect(page.getByTestId('replay-ready')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await page
    .getByRole('link', { name: '← Back to the Transform demo', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '1. Submit staging.json', exact: true }),
  ).toBeVisible();
  await page.goto('/examples');
  await expect(page).toHaveURL(/\/replay$/);
  await page.goto('/shipping');
  await expect(page).toHaveURL(/\/$/);
});
