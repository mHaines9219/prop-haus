import { expect, test } from '@playwright/test';

test.describe('catalog browsing', () => {
  test('a category page lists only items with photos and counts them', async ({ page }) => {
    await page.goto('/category/seating');
    await expect(page.getByRole('heading', { name: 'Seating' })).toBeVisible();
    // Three seated items are seeded; one has no photo and must not count.
    await expect(page.getByText('2 items')).toBeVisible();
    await expect(page.getByText('E2E Leather Club Chair')).toBeVisible();
    await expect(page.getByText('E2E Bentwood Cafe Chair')).toBeVisible();
    await expect(page.getByText('E2E Unphotographed Stool')).toHaveCount(0);
  });

  test('an unknown category is a 404', async ({ page }) => {
    const res = await page.goto('/category/not-a-category');
    expect(res?.status()).toBe(404);
  });

  test('the item page shows the camera report and vendor attribution', async ({ page }) => {
    await page.goto('/item/omega/e2e-1');
    await expect(page.getByRole('heading', { name: 'E2E Walnut Credenza' })).toBeVisible();
    await expect(page.getByText('Courtesy of Omega Cinema Props')).toBeVisible();
    await expect(page.getByText('$120.00')).toBeVisible();
    await expect(page.getByText('/ WK')).toBeVisible();
    await expect(page.getByText('W 72')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to cart' })).toBeVisible();
    await expect(page.getByRole('link', { name: /View on Omega Cinema Props/ })).toHaveAttribute(
      'href',
      'https://omegacinemaprops.com/item/e2e-1',
    );
  });

  test('a quote-only item says so instead of showing a price', async ({ page }) => {
    await page.goto('/item/hpr/e2e-1');
    await expect(page.getByText('Quote on request')).toBeVisible();
    await expect(page.getByText('More in Seating')).toBeVisible();
    await expect(page.getByText('E2E Bentwood Cafe Chair')).toBeVisible();
  });

  test('an unknown item is a 404', async ({ page }) => {
    const res = await page.goto('/item/omega/does-not-exist');
    expect(res?.status()).toBe(404);
  });

  test('the browse API pages, filters and is CDN-cacheable', async ({ request }) => {
    const all = await request.get('/api/browse?limit=2');
    expect(all.status()).toBe(200);
    expect(all.headers()['cache-control']).toContain('s-maxage');
    const body = (await all.json()) as { items: Array<{ id: string }>; total: number };
    expect(body.items).toHaveLength(2);
    expect(body.total).toBeGreaterThanOrEqual(4);

    const seating = await request.get('/api/browse?category=seating&vendor=hpr');
    const s = (await seating.json()) as { items: Array<{ name: string }>; total: number };
    expect(s.total).toBe(2);
    expect(s.items.map((i) => i.name).sort()).toEqual(['E2E Bentwood Cafe Chair', 'E2E Leather Club Chair']);

    const past = await request.get('/api/browse?category=lighting&offset=500');
    expect(past.status()).toBe(200);
    expect(((await past.json()) as { items: unknown[] }).items).toEqual([]);
  });
});
