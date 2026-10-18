import { expect, test } from '@playwright/test';
import { addToCart } from './helpers/cart';

/**
 * The product's one promise, end to end: fill the order profile once, add
 * pieces from two vendors, click once, and the order exists. Serial because
 * each step builds on the last within the signed-in organization.
 */

test.describe.configure({ mode: 'serial' });

test('the cart asks for what the profile is missing, inline', async ({ page }) => {
  await page.goto('/item/omega/e2e-1');
  await addToCart(page);
  await page.goto('/cart');

  // An empty profile never bounces the user to the profile page: the request
  // form grows a "Your production" group and the click saves it.
  const production = page.getByRole('group', { name: 'Your production' });
  await expect(production).toBeVisible();
  await expect(production.getByLabel('Company legal name')).toBeVisible();
  await expect(production.getByLabel('Ordering contact')).toBeVisible();
  await expect(production.getByRole('checkbox')).toBeVisible();
  await expect(page.getByRole('link', { name: /Complete your order profile/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Place order and send to 1 vendor' })).toBeVisible();
});

test('the order profile saves and reports itself ready', async ({ page }) => {
  await page.goto('/account/profile');
  await expect(page.getByRole('heading', { name: 'Order profile' })).toBeVisible();

  await page.getByPlaceholder('As it appears on your contracts').fill('Nocturne Pictures LLC');

  // Ordering contact is the first Name/Email pair on the page. Exact matches:
  // getByPlaceholder is a case-insensitive substring match by default, so
  // 'Name' would also hit "Production or trade name" and 'ST' hits "Street".
  const exact = { exact: true } as const;
  await page.getByPlaceholder('Name', exact).first().fill('Sam Reyes');
  await page.getByPlaceholder('Email', exact).first().fill('sam@nocturne.example');

  // Address blocks appear in order: company, billing, delivery.
  await page.getByPlaceholder('Street', exact).nth(2).fill('4100 W Alameda Ave');
  await page.getByPlaceholder('City', exact).nth(2).fill('Burbank');
  await page.getByPlaceholder('ST', exact).nth(2).fill('CA');
  await page.getByPlaceholder('ZIP', exact).nth(2).fill('91505');

  await page.getByLabel(/Prop Haus may complete vendor forms/).check();

  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
  await expect(page.getByText('Ready to order')).toBeVisible();
  await expect(page.getByText(/^Accepted /)).toBeVisible();

  // The saved copy is what the server has, not just local state.
  await page.reload();
  await expect(page.getByPlaceholder('As it appears on your contracts')).toHaveValue('Nocturne Pictures LLC');
  await expect(page.getByText('Ready to order')).toBeVisible();
});

test('one click places a multi-vendor order and the order pages agree', async ({ page, request }) => {
  // The order lands on a project: its Jobs section is where the work tracks.
  const projectName = `E2E Checkout ${Date.now()}`;
  const created = await request.post('/api/projects', { data: { name: projectName } });
  expect(created.status()).toBe(200);
  const { id: projectId } = (await created.json()) as { id: string };

  await page.goto('/item/omega/e2e-1');
  await addToCart(page);
  await page.goto('/item/hpr/e2e-1');
  await addToCart(page);

  await page.goto('/cart');
  await expect(page.getByText('2 items · 2 vendors')).toBeVisible();
  // The profile is complete now, so the production group is gone and the
  // location is prefilled from the profile's delivery default.
  await expect(page.getByRole('group', { name: 'Your production' })).toHaveCount(0);
  await expect(page.getByLabel('Street')).toHaveValue('4100 W Alameda Ave');
  await expect(page.getByLabel('City')).toHaveValue('Burbank');

  await page.getByLabel('Start').fill('2026-11-02');
  await page.getByLabel('End').fill('2026-11-06');
  await page.getByLabel('Project').selectOption(projectId);
  await page.getByRole('button', { name: 'Place order and send to 2 vendors' }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);

  await expect(page.getByText('Job detail')).toBeVisible();
  await expect(page.getByText('PLACED')).toBeVisible();
  await expect(page.getByText('2 items from 2 vendors')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Omega Cinema Props' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hand Prop Room' })).toBeVisible();
  await expect(page.getByText('E2E Walnut Credenza').first()).toBeVisible();
  await expect(page.getByText('E2E Leather Club Chair').first()).toBeVisible();
  await expect(page.getByText('Deliver to')).toBeVisible();
  await expect(page.getByText('4100 W Alameda Ave, Burbank, CA 91505')).toBeVisible();

  const orderUrl = page.url();

  await page.goto('/cart');
  await expect(page.getByText('Your cart is empty')).toBeVisible();

  await page.goto('/orders');
  const row = page.getByRole('link', { name: /Order #/ }).first();
  await expect(row).toContainText('2 items · 2 vendors');
  await row.click();
  await expect(page).toHaveURL(orderUrl);

  // The order detail leads back to its project, whose Jobs section lists it.
  await page.getByRole('link', { name: 'Back to project' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
  await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();
  await expect(page.getByText('Orders in flight')).toBeVisible();
  await expect(page.getByRole('link', { name: /Order #/ })).toHaveAttribute('href', new RegExp(orderUrl.replace(/^.*\/orders/, '/orders')));

  // Old bookmarks land on the dashboard.
  await page.goto('/jobs');
  await expect(page).toHaveURL(/\/projects$/);
});

test('the checkout API refuses an empty cart and a missing idempotency key', async ({ request }) => {
  const noKey = await request.post('/api/checkout', { data: { lines: [{ itemId: 'x' }] } });
  expect(noKey.status()).toBe(400);
  expect(await noKey.json()).toEqual({ error: 'idempotencyKey is required' });

  const empty = await request.post('/api/checkout', { data: { lines: [], idempotencyKey: 'e2e-empty' } });
  expect(empty.status()).toBe(400);
  expect(await empty.json()).toEqual({ error: 'cart is empty' });

  const readiness = await request.get('/api/checkout/readiness');
  expect(readiness.status()).toBe(200);
  expect(await readiness.json()).toMatchObject({ ready: true, missing: [] });
});
