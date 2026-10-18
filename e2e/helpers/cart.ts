import { expect, type Page } from '@playwright/test';

/**
 * Add the item on the current item page to the cart and wait until the button
 * says so. Two things make a bare click flaky: item pages are static (ISR), so
 * a click that lands before React hydrates does nothing, and the "More in"
 * strip below has its own "Add to cart" button per card. So: the first button
 * on the page, clicked until the state flips.
 */
export async function addToCart(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: 'Add to cart', exact: true }).first();
  await expect(button).toBeVisible();
  await expect(async () => {
    await button.click();
    await expect(page.getByRole('button', { name: 'In your cart' }).first()).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
}
