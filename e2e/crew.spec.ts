import { expect, test } from '@playwright/test';

test.describe('crew', () => {
  test('the directory filters by role and a request reaches the project’s Crew section', async ({ page, request }) => {
    // "Need a crew?" on a project sends the user here with the project preselected.
    const projectName = `E2E Crew ${Date.now()}`;
    const created = await request.post('/api/projects', { data: { name: projectName } });
    expect(created.status()).toBe(200);
    const { id: projectId } = (await created.json()) as { id: string };

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole('heading', { name: 'Crew' })).toBeVisible();
    await page.getByRole('link', { name: 'Need a crew?' }).click();
    await expect(page).toHaveURL(new RegExp(`/crew\\?project=${projectId}$`));
    await expect(page.getByText(`Hiring for ${projectName}`)).toBeVisible();
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
    await expect(card.getByLabel('Project')).toHaveValue(projectId);
    await card.getByPlaceholder('e.g. Sep 12, Sep 15–17').fill('Sep 12, Sep 15');
    await card.getByPlaceholder('Studio, address, or area').fill('Stage 4, Burbank');
    await card.getByRole('button', { name: 'Send request' }).click();
    await expect(card.getByText(/Request sent/)).toBeVisible();

    // Back on the project: a one-line row that expands into the contractor's profile.
    await page.goto(`/projects/${projectId}`);
    const row = page.getByRole('button', { name: /Dana Kim/ });
    await expect(row).toBeVisible();
    await expect(row).toContainText('REQUESTED');
    await expect(row).toContainText('Stage 4, Burbank');
    await expect(page.getByText(/Cargo van owner-operator/)).toHaveCount(0);
    await row.click();
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/Cargo van owner-operator/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request more crew' })).toHaveAttribute('href', `/crew?project=${projectId}`);
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
