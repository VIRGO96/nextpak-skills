# Reference: test setup and tests (Vitest + RTL, Server Actions, TanStack Query, Playwright)

Read when setting up tests or writing tests for the code in the other references. What to test and the tests-first process live in the `testing-qa` skill.

Verified (tsc strict, eslint, `next build` with `cacheComponents: true`, Vitest + RTL, Playwright) with next 16.4.3,
react 19.3, zod 4.6, @tanstack/react-query 5.105, vitest 5.0, @testing-library/react 16.3,
@testing-library/user-event 14.6, @playwright/test 1.64. Demo feature: a signed-in user lists, creates and
deletes their own projects. Replace the demo `lib/auth.ts` / `lib/db.ts` with the project's real ones.

## Contents

- Test setup
- Tests (written before the code)

## Test setup

```bash
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom @playwright/test
npx playwright install chromium
```

package.json scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`, `"e2e": "playwright test"`.
Vitest 5 needs `@types/node` 22+.

### vitest.config.mts

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Vite 8+: native tsconfig "paths" (@/*). On older Vite use the vite-tsconfig-paths plugin.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
```

### vitest.setup.ts

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// `server-only` throws outside the React Server environment; in unit tests it's a no-op.
vi.mock('server-only', () => ({}));

afterEach(() => {
  cleanup();
});
```

### playwright.config.ts

```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3107); // not 3000: avoid reusing some other local app
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

## Tests (written before the code)

### src/features/projects/components/project-form.test.tsx

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActionState } from '@/lib/action-state';
import { ProjectForm } from './project-form';

function setup(result: ActionState = { status: 'success', message: 'Project created.' }) {
  const action = vi.fn<(prev: ActionState, formData: FormData) => Promise<ActionState>>(
    async () => result,
  );
  const user = userEvent.setup();
  render(<ProjectForm action={action} />);
  return { action, user };
}

describe('ProjectForm', () => {
  it('submits valid input and announces success', async () => {
    const { action, user } = setup();

    await user.type(screen.getByLabelText('Name'), 'Website redesign');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Project created.');
    expect(action).toHaveBeenCalledOnce();
    const formData = action.mock.calls[0][1];
    expect(formData.get('name')).toBe('Website redesign');
  });

  it('shows a field error and does not call the server when name is empty', async () => {
    const { action, user } = setup();

    await user.click(screen.getByRole('button', { name: 'Create project' }));

    const name = screen.getByLabelText('Name');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Name is required');
    expect(action).not.toHaveBeenCalled();
  });

  it('shows errors returned by the server', async () => {
    const { user } = setup({
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: { name: ['Name is already taken'] },
    });

    await user.type(screen.getByLabelText('Name'), 'Duplicate');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByText('Name is already taken')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Please fix the highlighted fields.');
  });

  it('can be completed with the keyboard only', async () => {
    const { action, user } = setup();

    await user.tab();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await user.keyboard('Roadmap{Enter}');

    expect(await screen.findByRole('status')).toHaveTextContent('Project created.');
    expect(action).toHaveBeenCalledOnce();
  });
});
```

### src/features/projects/actions.test.ts

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { idleState } from '@/lib/action-state';
import { createProjectAction, deleteProjectAction } from './actions';

// Mock only framework/request boundaries. The DAL and schema run for real.
let currentUserId: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'demo-user' && currentUserId ? { name, value: currentUserId } : undefined,
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(async () => {
  await db.project._reset();
  currentUserId = undefined;
});

describe('createProjectAction', () => {
  it('creates a project owned by the signed-in user', async () => {
    currentUserId = 'user-a';
    const result = await createProjectAction(idleState, form({ name: '  Launch  ' }));

    expect(result).toEqual({ status: 'success', message: 'Project created.' });
    const [row] = await db.project.findManyByOwner('user-a');
    expect(row.name).toBe('Launch'); // trimmed by the schema
  });

  it('re-validates on the server (client checks can be bypassed)', async () => {
    currentUserId = 'user-a';
    const result = await createProjectAction(idleState, form({ name: '' }));

    expect(result.status).toBe('error');
    expect(result.status === 'error' && result.fieldErrors?.name).toEqual(['Name is required']);
    expect(await db.project.findManyByOwner('user-a')).toHaveLength(0);
  });

  it('ignores an ownerId sent in the form (no mass assignment)', async () => {
    currentUserId = 'user-a';
    await createProjectAction(idleState, form({ name: 'Mine', ownerId: 'user-b' }));

    expect(await db.project.findManyByOwner('user-b')).toHaveLength(0);
    expect(await db.project.findManyByOwner('user-a')).toHaveLength(1);
  });

  it('rejects a signed-out caller', async () => {
    const result = await createProjectAction(idleState, form({ name: 'x' }));
    expect(result).toEqual({ status: 'error', message: 'Please sign in to continue.' });
  });
});

describe('deleteProjectAction', () => {
  it("does not let user B delete user A's project", async () => {
    const project = await db.project.create({ ownerId: 'user-a', name: 'A', description: '' });
    currentUserId = 'user-b';

    const result = await deleteProjectAction(project.id);

    expect(result).toEqual({ status: 'error', message: 'You do not have access to this item.' });
    expect(await db.project.findById(project.id)).not.toBeNull();
  });

  it('rejects a malformed id', async () => {
    currentUserId = 'user-a';
    expect(await deleteProjectAction('not-a-uuid')).toEqual({ status: 'error', message: 'Invalid project id.' });
  });

  it('deletes own project', async () => {
    const project = await db.project.create({ ownerId: 'user-a', name: 'A', description: '' });
    currentUserId = 'user-a';

    expect(await deleteProjectAction(project.id)).toEqual(idleState);
    expect(await db.project.findById(project.id)).toBeNull();
  });
});
```

### src/features/projects/components/projects-panel.test.tsx

Stubs global `fetch` to stay dependency-free. If the project has MSW, use typed MSW handlers instead
(see `testing-qa` references/mocking-and-flaky-tests.md); never `vi.mock` the hook or `apiFetch` itself.

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectsPanel } from './projects-panel';

function renderWithClient() {
  // Fresh client per test, no retries, so error states show immediately.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProjectsPanel />
    </QueryClientProvider>,
  );
}

function mockFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProjectsPanel', () => {
  it('shows loading, then the list', async () => {
    mockFetch(Response.json({ data: [{ id: '1', name: 'Alpha', description: '', createdAt: '' }] }));
    renderWithClient();

    expect(screen.getByRole('status')).toHaveTextContent('Loading projects...');
    expect(await screen.findByRole('listitem')).toHaveTextContent('Alpha');
  });

  it('shows the empty state', async () => {
    mockFetch(Response.json({ data: [] }));
    renderWithClient();

    expect(await screen.findByText('No projects yet.')).toBeInTheDocument();
  });

  it('shows a safe error message and recovers on retry', async () => {
    mockFetch(
      Response.json({ error: { code: 'INTERNAL_ERROR', message: 'db timeout at 10.0.0.3' } }, { status: 500 }),
      Response.json({ data: [{ id: '1', name: 'Alpha', description: '', createdAt: '' }] }),
    );
    renderWithClient();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong on our side');
    expect(alert).not.toHaveTextContent('10.0.0.3'); // never show raw server text

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('listitem')).toHaveTextContent('Alpha');
  });
});
```

### e2e/projects.spec.ts

```ts
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
```
