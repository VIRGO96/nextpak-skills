# API mocking (MSW), test data isolation, flaky tests

Read when a component test needs API responses, when tests pass alone but fail together, or when
a test fails "sometimes". Code verified with msw 3.0.3, vitest 5.0, @testing-library/react 16.3,
@playwright/test 1.64 (tsc strict, all green).

## Mock the network, not your own code

- Component tests that fetch: mock at the **network edge with MSW** (Mock Service Worker). The
  component's real fetch/data-layer code runs, so the test breaks when that code breaks.
- Don't `vi.mock` your own api-client or hooks to return data: then you test the mock.
- Playwright: mock only **third parties** (payments, email, maps) with `page.route`. Your own API runs for real.
- **Contract safety:** type mock responses with the same types the app uses (shared package or
  generated from the backend's OpenAPI spec). A mock that drifts from the real API then stops compiling.
  At least one test per endpoint (backend side, or E2E) must hit the real API so the shape is proven.
- `onUnhandledFrame: 'error'` (MSW 3; `onUnhandledRequest` in MSW 2): a request with no handler fails
  the test instead of silently hitting a real server.

Setup: `npm i -D msw`. Docs: https://mswjs.io/docs/quick-start (MSW 3 imports `http` from `msw/http`;
MSW 2 imports it from `msw`).

### `src/api-types.ts`

```ts
// Shared with the backend (or generated from its OpenAPI spec). Mocks use the same type,
// so a mock that drifts from the real API stops compiling.
export type Invite = { id: string; email: string };
export type InvitesResponse = { data: Invite[] };
export type ApiErrorBody = { error: { code: string; message: string } };
```

### `tests/mocks/handlers.ts`

```ts
import { http, HttpResponse } from 'msw/http';
import type { ApiErrorBody, InvitesResponse } from '../../src/api-types';

// Default "happy" handlers. Tests override one with server.use(...) for error cases.
export const handlers = [
  http.get<never, never, InvitesResponse>('*/api/invites', () =>
    HttpResponse.json({ data: [{ id: '1', email: 'sara@example.com' }] }),
  ),
];

export const invitesFail = http.get<never, never, ApiErrorBody>('*/api/invites', () =>
  HttpResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'db down' } }, { status: 500 }),
);
```

### `tests/PendingInvites.test.tsx`

```tsx
// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { handlers, invitesFail } from './mocks/handlers';
import { PendingInvites } from '../src/PendingInvites';

// Mock the network, not your own modules: the real fetch code runs.
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' })); // MSW 3; MSW 2: onUnhandledRequest
afterEach(() => {
  server.resetHandlers(); // overrides from one test never leak into the next
  cleanup();
});
afterAll(() => server.close());

describe('PendingInvites', () => {
  it('lists pending invites', async () => {
    render(<PendingInvites />);
    expect(await screen.findByRole('listitem')).toHaveTextContent('sara@example.com');
  });

  it('shows a safe error and recovers on retry', async () => {
    server.use(invitesFail);
    const user = userEvent.setup();
    render(<PendingInvites />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not load invites/i);
    expect(alert).not.toHaveTextContent('db down');

    server.resetHandlers(); // API is back
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByRole('listitem')).toHaveTextContent('sara@example.com');
  });
});
```

RED against an empty component: `Unable to find role="listitem"`, `Unable to find role="alert"`
(2 failed). GREEN after implementing: `Tests 15 passed (15)` for the whole suite.

The component under test (plain `fetch` to keep it small; real apps use their data layer):

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { Invite, InvitesResponse } from './api-types';

type State = { status: 'loading' } | { status: 'error' } | { status: 'ok'; invites: Invite[] };

// Plain fetch to keep the example small; in a real app use the project's data layer (TanStack Query etc.).
export function PendingInvites() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/invites');
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as InvitesResponse;
      setState({ status: 'ok', invites: body.data });
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void load(); // eslint-disable-line react-hooks/set-state-in-effect -- demo only
  }, [load]);

  if (state.status === 'loading') return <p role="status">Loading invites...</p>;
  if (state.status === 'error')
    return (
      <div role="alert">
        <p>Could not load invites.</p>
        <button type="button" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  return (
    <ul aria-label="Pending invites">
      {state.invites.map((i) => (
        <li key={i.id}>{i.email}</li>
      ))}
    </ul>
  );
}
```

## Test data isolation

Tests run in parallel and in any order. Each test must work alone, and twice in a row.

- **Own data per test**: create what the test needs in the test (or a fixture). Never rely on data
  another test created, or on seed rows other tests also change.
- **Unique values**: `sara+${crypto.randomUUID()}@example.com`, not a fixed email that hits a
  "duplicate" error on the second run or in a parallel worker.
- **Reset between tests**: fresh app/in-memory store per test (`beforeEach`), a DB transaction rolled
  back per test, or truncate test tables. `vi.restoreAllMocks()` / `server.resetHandlers()` in `afterEach`.
- **Separate test database** (`.env.test`), never the dev or staging DB. Never production data.
- Playwright: one test user per worker (or created per test), logged in once with `storageState`
  (https://playwright.dev/docs/auth). Tests that change shared settings run serially or use their own account.

## Flaky tests: causes and fixes

A flaky test is a failing test. Don't add retries or sleeps to hide it; find the cause.

| Cause | Fix |
|---|---|
| Fixed waits (`waitForTimeout`, `sleep`, `setTimeout` in tests) | Web-first assertions (`await expect(...).toBeVisible()`), RTL `findBy...` |
| Asserting before async work finishes | `await` every user action; `findBy` / `waitFor` for things that appear later |
| Shared state between tests (DB rows, module-level variables, mocks, MSW overrides) | Reset in `beforeEach`/`afterEach`; own data per test (above) |
| Order dependence ("passes only after test X") | Run one test alone (`it.only` / `--grep`) and with `--repeat-each=5` (Playwright) to prove isolation |
| Real time, time zones, `Date.now()` | Unit: `vi.useFakeTimers(); vi.setSystemTime(new Date('2026-03-01T22:30:00Z'))`. Playwright: `page.clock.setFixedTime(...)` and `test.use({ timezoneId, locale })`. Run CI with a fixed `TZ` env var and also test one non-UTC zone |
| Randomness | Seed it, or assert on shape instead of exact random values |
| Real third-party calls (payments, email, AI APIs) | MSW in unit/component tests, `page.route` in Playwright |
| Animations / transitions | Assert the final state with web-first assertions; `reducedMotion: 'reduce'` in Playwright `use` |
| Brittle locators (CSS classes, `.nth()`, XPath) | `getByRole` / `getByLabel`; scope with `within()` or `locator.filter({ hasText })` |
| Port or server reuse (another app on :3000) | Dedicated test port in `webServer`; `reuseExistingServer: !process.env.CI` |

Debug a flaky Playwright test with `npx playwright test --repeat-each=10 --workers=4` and the trace
(`trace: 'on-first-retry'`, `npx playwright show-trace`). Sources: https://playwright.dev/docs/best-practices,
https://playwright.dev/docs/clock, https://testing-library.com/docs/dom-testing-library/api-async
