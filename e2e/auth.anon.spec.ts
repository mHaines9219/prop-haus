import { expect, test } from '@playwright/test';

/** What a signed-out visitor can and cannot reach. */

test.describe('signed-out guards', () => {
  test('owned pages bounce to the root or the login page', async ({ page }) => {
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/jobs');
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login\?next=%2Forders$/);

    await page.goto('/account/profile');
    await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Fprofile$/);
  });

  test('session-scoped APIs answer 401, public ones answer', async ({ request }) => {
    for (const path of ['/api/checkout/readiness', '/api/projects', '/api/usage', '/api/account/profile']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(401);
    }
    const checkout = await request.post('/api/checkout', {
      data: { lines: [{ itemId: 'x' }], idempotencyKey: 'anon' },
    });
    expect(checkout.status()).toBe(401);

    const browse = await request.get('/api/browse?limit=1');
    expect(browse.status()).toBe(200);
  });

  test('the login page asks for an email and explains a bad link', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Email me a link' })).toBeDisabled();
    await page.getByLabel('Email').fill('someone@example.com');
    await expect(page.getByRole('button', { name: 'Email me a link' })).toBeEnabled();

    await page.goto('/auth/callback');
    await expect(page).toHaveURL(/\/login\?error=missing_code$/);
    await expect(page.getByText('That link did not work')).toBeVisible();
  });

  test('signing out is a POST that lands on the login page', async ({ request }) => {
    const res = await request.post('/auth/signout', { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers()['location']).toMatch(/\/login$/);
  });

  test('the cart asks a signed-out visitor to sign in before ordering', async ({ page }) => {
    await page.goto('/item/omega/e2e-2');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByRole('button', { name: 'In your cart' })).toBeVisible();

    await page.goto('/cart');
    await expect(page.getByText('E2E Brass Floor Lamp')).toBeVisible();
    await expect(page.getByText('1 item · 1 vendor')).toBeVisible();
    const signIn = page.getByRole('link', { name: 'Sign in' });
    await expect(signIn).toHaveAttribute('href', '/login?next=/cart');
    await expect(page.getByRole('button', { name: 'Place order' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Your cart is empty')).toBeVisible();
  });
});
