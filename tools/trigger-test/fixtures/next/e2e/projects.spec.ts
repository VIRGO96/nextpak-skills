import { expect, test } from '@playwright/test';

// The user journey of the changed feature, end to end, in a real browser.
test.beforeEach(async ({ context, baseURL }) => {
  // Use the project's real login helper / storageState instead of this demo cookie.
  await context.addCookies([
    { name: 'demo-user', value: `e2e-${crypto.randomUUID()}`, url: baseURL },
  ]);
});

test('user creates a project and sees it in the list', async ({ page }) => {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  await expect(page.getByText('No projects yet')).toBeVisible();

  await page.getByLabel('Name').fill('Website redesign');
  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page.getByRole('status')).toHaveText('Project created.');
  await expect(page.getByRole('heading', { name: 'Website redesign', level: 3 })).toBeVisible();
});

test('empty name shows a field error and creates nothing', async ({ page }) => {
  await page.goto('/projects');
  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Name is required')).toBeVisible();
  await expect(page.getByText('No projects yet')).toBeVisible();
});

test('signed-out user is sent to login', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login$/);
});
