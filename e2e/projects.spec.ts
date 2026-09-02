import { expect, test } from '@playwright/test';

test.describe('projects', () => {
  test('creating a project seeds its folders, then archiving hides it', async ({ page }) => {
    const name = `E2E Nocturne ${Date.now()}`;

    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();

    await page.getByRole('button', { name: /new project/i }).click();
    await page.getByPlaceholder(/Production name/).fill(name);
    await page.getByRole('button', { name: 'Create project' }).click();

    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scenes' })).toBeVisible();
    await expect(page.getByText('Paperwork').first()).toBeVisible();

    await page.goto('/projects');
    const row = page.locator('a', { hasText: name });
    await expect(row).toBeVisible();

    await row.locator('xpath=..').getByRole('button', { name: 'Archive' }).click();
    await expect(page.locator('a', { hasText: name })).toHaveCount(0);

    await page.goto('/projects?archived=1');
    await expect(page.locator('a', { hasText: name })).toBeVisible();
    await expect(page.getByText('Archived').first()).toBeVisible();
  });

  test('the projects API scopes reads to the session org', async ({ request }) => {
    const created = await request.post('/api/projects', { data: { name: 'E2E api project' } });
    expect(created.status()).toBe(200);
    const { id, folders } = (await created.json()) as {
      id: string;
      folders: Array<{ name: string; kind: string }>;
    };
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(folders.map((f) => f.kind).sort()).toEqual(['paperwork', 'scene']);

    const list = await request.get('/api/projects');
    expect(list.status()).toBe(200);
    const { projects } = (await list.json()) as { projects: Array<{ id: string; itemCount: number }> };
    expect(projects.find((p) => p.id === id)).toMatchObject({ itemCount: 0 });

    const blank = await request.post('/api/projects', { data: { name: '   ' } });
    expect(blank.status()).toBe(400);
    expect(await blank.json()).toEqual({ error: 'name is required' });
  });
});
