import { expect, test } from '@playwright/test';

/**
 * The product's one promise, end to end: fill the order profile once, add
 * pieces from two vendors, click once, and the order exists. Serial because
 * each step builds on the last within the signed-in organization.
 */

test.describe.configure({ mode: 'serial' });

test('the cart names what the profile is missing', async ({ page }) => {
  await page.goto('/item/omega/e2e-1');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/cart');

  await expect(page.getByText(/things? missing before one-click/)).toBeVisible();
  await expect(page.getByText('· Company legal name')).toBeVisible();
  await expect(page.getByText('· Authorization to complete forms')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Place order' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Complete your order profile/ })).toHaveAttribute(
    'href',
    '/account/profile',
  );
});

test('the order profile saves and reports itself ready', async ({ page }) => {
  await page.goto('/account/profile');
  await expect(page.getByRole('heading', { name: 'Order profile' })).toBeVisible();

  await page.getByPlaceholder('As it appears on your contracts').fill('Nocturne Pictures LLC');

  // Ordering contact is the first Name/Email pair on the page.
  await page.getByPlaceholder('Name').first().fill('Sam Reyes');
  await page.getByPlaceholder('Email').first().fill('sam@nocturne.example');

  // Address blocks appear in order: company, billing, delivery.
  await page.getByPlaceholder('Street').nth(2).fill('4100 W Alameda Ave');
  await page.getByPlaceholder('City').nth(2).fill('Burbank');
  await page.getByPlaceholder('ST').nth(2).fill('CA');
  await page.getByPlaceholder('ZIP').nth(2).fill('91505');

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

test('one click places a multi-vendor order and the order pages agree', async ({ page }) => {
  await page.goto('/item/omega/e2e-1');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/item/hpr/e2e-1');
  await page.getByRole('button', { name: 'Add to cart' }).click();

  await page.goto('/cart');
  await expect(page.getByText('2 items · 2 vendors')).toBeVisible();
  await expect(page.getByText('Deliver to')).toBeVisible();
  await expect(page.getByText('4100 W Alameda Ave, Burbank, CA 91505')).toBeVisible();

  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);

  await expect(page.getByText('Job detail')).toBeVisible();
  await expect(page.getByText('PLACED')).toBeVisible();
  await expect(page.getByText('2 items from 2 vendors')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Omega Cinema Props' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hand Prop Room' })).toBeVisible();
  await expect(page.getByText('E2E Walnut Credenza')).toBeVisible();
  await expect(page.getByText('E2E Leather Club Chair')).toBeVisible();
  await expect(page.getByText('4100 W Alameda Ave, Burbank, CA 91505')).toBeVisible();

  const orderUrl = page.url();

  await page.goto('/cart');
  await expect(page.getByText('Your cart is empty')).toBeVisible();

  await page.goto('/orders');
  const row = page.getByRole('link', { name: /Order #/ }).first();
  await expect(row).toContainText('2 items · 2 vendors');
  await row.click();
  await expect(page).toHaveURL(orderUrl);

  await page.goto('/jobs');
  await expect(page.getByRole('heading', { name: 'Jobs in progress' })).toBeVisible();
  await expect(page.getByText('In flight')).toBeVisible();
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
