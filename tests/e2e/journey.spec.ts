import { test, expect, type Page } from '@playwright/test';

const token = process.env.PLAYWRIGHT_API_TOKEN ?? 'flightpilot-e2e-only-token-0000000000000000';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Workspace access token').fill(token);
  await page.getByRole('button', { name: 'Open my workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Where to next?' })).toBeVisible();
}
async function searchAndOpen(page: Page) {
  await page.getByRole('button', { name: 'Find flights', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Flight results' })).toBeVisible();
  await page
    .getByRole('button', { name: 'Review flight', exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Review your journey.' })).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  const response = await request.get('/api/health');
  const health = (await response.json()) as { mode: string; productionBooking: boolean };
  // Browser purchase tests must never run against a real provider or production environment.
  expect(health.mode).toBe('simulation');
  expect(health.productionBooking).toBe(false);
});

test('requires authentication and never exposes card collection', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Workspace access token').fill('incorrect-token');
  await page.getByRole('button', { name: 'Open my workspace' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome aboard.' })).toBeVisible();
  await page.getByLabel('Workspace access token').fill(token);
  await page.getByRole('button', { name: 'Open my workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Where to next?' })).toBeVisible();
  await expect(page.getByText('Fictional fares and bookings.', { exact: false })).toBeVisible();
  await expect(page.locator('input[autocomplete="cc-number"]')).toHaveCount(0);
});

test('family round trip reaches verified simulation ticketing with explicit approval', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Round trip', exact: true }).click();
  await page.getByLabel('Adults', { exact: true }).fill('2');
  await page.getByLabel('Child ages', { exact: true }).fill('3');
  await searchAndOpen(page);
  await expect(page.getByRole('group', { name: 'Traveller 3 child' })).toBeVisible();
  const approve = page.getByRole('button', { name: 'Approve simulated booking' });
  await expect(approve).toBeDisabled();
  await page.getByRole('checkbox').check();
  await expect(approve).toBeEnabled();
  await page.getByLabel('Given name', { exact: true }).first().fill('Fictional Updated');
  await expect(approve).toBeDisabled();
  await page.getByRole('checkbox').check();
  await approve.click();
  await expect(page.getByRole('heading', { name: 'Ticketing verified in this environment' })).toBeVisible();
  await expect(page.getByText(/SIMULATED-NOT-A-TICKET-1/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve simulated booking' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to workspace' }).click();
  await page.getByRole('button', { name: 'My bookings' }).click();
  await expect(page.getByRole('heading', { name: 'My bookings' })).toBeVisible();
  await expect(page.getByText('ticketed', { exact: true }).first()).toBeVisible();
});

test('a declined simulation is terminal and provides recovery instructions', async ({ page }) => {
  await signIn(page);
  await searchAndOpen(page);
  await page.getByText('Simulation scenario', { exact: true }).click();
  await page.getByLabel('Test outcome').selectOption('decline');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Approve simulated booking' }).click();
  await expect(page.getByRole('heading', { name: 'This attempt did not complete' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'no booking was created' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve simulated booking' })).toHaveCount(0);
});

test('an uncertain timeout blocks another approval', async ({ page }) => {
  await signIn(page);
  await searchAndOpen(page);
  await page.getByText('Simulation scenario', { exact: true }).click();
  await page.getByLabel('Test outcome').selectOption('timeout');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Approve simulated booking' }).click();
  await expect(page.getByRole('heading', { name: 'The booking result is uncertain' })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Do not submit another purchase' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve simulated booking' })).toHaveCount(0);
});

test('pending ticketing can be reconciled without submitting a new booking', async ({ page }) => {
  await signIn(page);
  await searchAndOpen(page);
  await page.getByText('Simulation scenario', { exact: true }).click();
  await page.getByLabel('Test outcome').selectOption('pending');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Approve simulated booking' }).click();
  await expect(page.getByRole('heading', { name: 'Waiting for ticketing' })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh booking status', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ticketing verified in this environment' })).toBeVisible();
});

test('mobile search and checkout fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await searchAndOpen(page);
  await expect(page.getByRole('button', { name: 'Approve simulated booking' })).toBeVisible();
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport);
});
