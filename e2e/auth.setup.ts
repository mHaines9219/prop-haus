import { expect, test as setup } from '@playwright/test';
import { magicLinkFor } from './helpers/mailpit';

/**
 * Signs in once through the real login page and magic-link email, then saves
 * the browser state for every authenticated spec. First sign-in is sign-up:
 * the database trigger creates the organization the rest of the run uses.
 */

export const STORAGE_STATE = 'e2e/.auth/user.json';

setup('sign in with a magic link', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto('/login?next=/projects');
  await expect(page.getByRole('heading', { name: 'Prop Haus' })).toBeVisible();

  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await expect(page.getByText(`Check ${email}`)).toBeVisible();

  const link = await magicLinkFor(email);
  await page.goto(link);

  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();

  await page.context().storageState({ path: STORAGE_STATE });
});
