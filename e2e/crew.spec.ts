import { expect, test } from '@playwright/test';

test.describe('crew', () => {
  test('the directory filters by role and a request reaches the jobs board', async ({ page }) => {
    await page.goto('/crew');
    await expect(page.getByRole('heading', { name: 'Extra hands, on call.' })).toBeVisible();

    // Seeded by migration: Marcus Rivera (set hands) and Dana Kim (delivery).
    await expect(page.getByText('Marcus Rivera')).toBeVisible();
    await expect(page.getByText('Dana Kim')).toBeVisible();

    const rail = page.getByRole('group', { name: 'Filter crew by role' });
    await rail.getByRole('button', { name: /delivery/i }).click();
    await expect(page).toHaveURL(/role=/);
    await expect(page.getByText('Dana Kim')).toBeVisible();
    await expect(page.getByText('Marcus Rivera')).toHaveCount(0);

    await rail.getByRole('button', { name: 'All crew' }).click();
    await expect(page.getByText('Marcus Rivera')).toBeVisible();

    const card = page.locator('div', { has: page.getByText('Dana Kim', { exact: true }) }).last();
    await card.getByRole('button', { name: 'Request crew' }).click();
    await card.getByPlaceholder('e.g. Sep 12, Sep 15–17').fill('Sep 12, Sep 15');
    await card.getByPlaceholder('Studio, address, or area').fill('Stage 4, Burbank');
    await card.getByRole('button', { name: 'Send request' }).click();
    await expect(card.getByText(/Request sent/)).toBeVisible();

    await page.goto('/jobs');
    await expect(page.getByRole('heading', { name: 'Crew' })).toBeVisible();
    await expect(page.getByText('Dana Kim')).toBeVisible();
    await expect(page.getByText('REQUESTED').first()).toBeVisible();
  });

  test('the crew request API validates its body', async ({ request }) => {
    const missing = await request.post('/api/crew/requests', { data: {} });
    expect(missing.status()).toBe(400);
    expect(await missing.json()).toEqual({ error: 'contractor_id is required' });

    const list = await request.get('/api/crew/requests');
    expect(list.status()).toBe(200);
    const { requests } = (await list.json()) as { requests: Array<{ status: string }> };
    expect(Array.isArray(requests)).toBe(true);
  });
});
