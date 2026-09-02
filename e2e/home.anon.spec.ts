import { expect, test } from '@playwright/test';

test.describe('home', () => {
  test('renders the hero and the category shelf from live facets', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Every prop house.');

    // Seeded: seating (2 with images), lighting (1), storage-credenzas (1).
    const furniture = page.locator('a[href="/category/seating"]');
    await expect(furniture).toBeVisible();
    await expect(furniture).toContainText('items');

    const lighting = page.locator('a[href="/category/lighting"]');
    await expect(lighting).toBeVisible();
  });

  test('suggestion chips route to search with the query encoded', async ({ page }) => {
    await page.goto('/');
    const chip = page.getByRole('link', { name: '70s apartment' });
    await expect(chip).toHaveAttribute('href', '/search?q=70s%20apartment');
  });

  test('nav links reach crew and the cart', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Crew' }).click();
    await expect(page).toHaveURL(/\/crew$/);
    await page.getByRole('link', { name: 'Cart' }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByText('Your cart is empty')).toBeVisible();
  });
});
