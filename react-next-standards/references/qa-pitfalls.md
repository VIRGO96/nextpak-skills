# Reference: bugs QA finds most often (and the fix)

Read when a change shows dates/times, renders HTML from data, updates the UI before the server
answers, guards a route, or adds a hero image. Code below was verified in the same Next 16.4 app
as the other references (tsc strict, eslint, `next build`, Vitest).

## Hydration mismatches

The server HTML and the first browser render must be identical. Common causes:
`Date.now()` / `new Date()` / `Math.random()` in render, `toLocaleString()` with no locale/zone,
`typeof window !== 'undefined'` branches, reading `localStorage` during render, invalid nesting
(`<p>` inside `<p>`, `<div>` inside `<p>`), browser extensions changing the DOM.

- Format dates with an explicit locale **and** time zone (below). Send dates as ISO UTC strings.
- Browser-only values (window size, `localStorage`, "now"): read them in `useEffect` and render a
  placeholder first, or put the component behind `next/dynamic(..., { ssr: false })` in a Client Component.
- `suppressHydrationWarning` only on one element whose text must differ (a live timestamp). Never as a blanket fix.
- Next.js guide: https://nextjs.org/docs/app/guides/preventing-flash-before-hydration

### src/lib/format-date.ts

```ts
// Format dates with an explicit locale AND time zone. `toLocaleString()` with no
// arguments uses the machine's settings, so the server (often UTC) and the browser
// render different text -> hydration mismatch, and users see the wrong day.
// Take the zone from the user's profile/cookie; store and send dates as ISO UTC strings.
export function formatDateTime(iso: string, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}
```

### src/lib/format-date.test.ts

```ts
import { describe, expect, it } from 'vitest';
import { formatDateTime } from './format-date';

describe('formatDateTime', () => {
  const iso = '2026-03-01T22:30:00.000Z';

  it('gives the same text on server and browser for the same zone (no hydration mismatch)', () => {
    expect(formatDateTime(iso, 'en-GB', 'Asia/Karachi')).toBe('2 Mar 2026, 03:30');
  });

  it("shows the user's zone, not the server's", () => {
    expect(formatDateTime(iso, 'en-GB', 'UTC')).toBe('1 Mar 2026, 22:30');
  });
});
```

## Optimistic updates must roll back

If the UI changes before the server confirms, a failed request must put the old value back
and tell the user. Also disable the control while pending (no double submit).

### Server Action + `useOptimistic`: src/features/projects/components/favorite-button.tsx

```tsx
'use client';

import { useOptimistic, useState, useTransition } from 'react';
import type { ActionState } from '@/lib/action-state';

type Props = {
  projectName: string;
  favorite: boolean; // the server's truth, from the Server Component
  action: (next: boolean) => Promise<ActionState>; // a Server Action, re-checks auth + ownership
};

// useOptimistic shows the new value while the action runs. When the transition ends
// it falls back to the `favorite` prop: if the server refused, the UI rolls back by itself.
export function FavoriteButton({ projectName, favorite, action }: Props) {
  const [optimistic, setOptimistic] = useOptimistic(favorite);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    startTransition(async () => {
      setOptimistic(!favorite);
      const result = await action(!favorite);
      setError(result.status === 'error' ? result.message : null);
    });
  }

  return (
    <>
      <button
        type="button"
        aria-pressed={optimistic}
        aria-label={`Favorite ${projectName}`}
        disabled={pending} // no double submit
        onClick={toggle}
      >
        {optimistic ? '★' : '☆'}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
```

### favorite-button.test.tsx

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ActionState } from '@/lib/action-state';
import { FavoriteButton } from './favorite-button';

describe('FavoriteButton', () => {
  it('flips at once, then rolls back and explains when the server refuses', async () => {
    let finish!: (r: ActionState) => void;
    const action = vi.fn(() => new Promise<ActionState>((r) => (finish = r)));
    const user = userEvent.setup();
    render(<FavoriteButton projectName="Alpha" favorite={false} action={action} />);

    const button = screen.getByRole('button', { name: 'Favorite Alpha' });
    await user.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true'); // optimistic

    finish({ status: 'error', message: 'You do not have access to this item.' });
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access');
    expect(button).toHaveAttribute('aria-pressed', 'false'); // rolled back
    expect(action).toHaveBeenCalledOnce();
  });
});
```

### TanStack Query: src/features/projects/hooks/use-rename-project.ts

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProjectDTO } from '../schema';
import { projectKeys } from './use-projects';

type Rename = { id: string; name: string };

// Optimistic update with rollback: show the change at once, undo it if the server says no,
// and always re-sync with the server at the end.
export function useRenameProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: Rename) =>
      apiFetch<{ data: ProjectDTO }>(`/api/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onMutate: async ({ id, name }) => {
      // Stop in-flight refetches from overwriting the optimistic value.
      await queryClient.cancelQueries({ queryKey: projectKeys.all });
      const previous = queryClient.getQueryData<ProjectDTO[]>(projectKeys.all);
      queryClient.setQueryData<ProjectDTO[]>(projectKeys.all, (old) =>
        old?.map((p) => (p.id === id ? { ...p, name } : p)),
      );
      return { previous };
    },
    onError: (_err, _vars, onMutateResult) => {
      // Roll back. Show the error with userMessage(mutation.error) in the component.
      queryClient.setQueryData(projectKeys.all, onMutateResult?.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}
```

### use-rename-project.test.tsx

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ProjectDTO } from '../schema';
import { projectKeys } from './use-projects';
import { useRenameProject } from './use-rename-project';

const alpha: ProjectDTO = { id: '1', name: 'Alpha', description: '', createdAt: '' };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(projectKeys.all, [alpha]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useRenameProject(), { wrapper });
  return { client, result };
}

afterEach(() => vi.unstubAllGlobals());

describe('useRenameProject', () => {
  it('shows the new name at once, then rolls back when the server fails', async () => {
    let fail!: () => void;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        () =>
          new Promise((resolve) => {
            fail = () => resolve(Response.json({ error: { code: 'INTERNAL_ERROR', message: 'x' } }, { status: 500 }));
          }),
      ),
    );
    const { client, result } = setup();

    act(() => result.current.mutate({ id: '1', name: 'Beta' }));
    await waitFor(() => expect(client.getQueryData<ProjectDTO[]>(projectKeys.all)?.[0].name).toBe('Beta'));

    act(() => fail());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData<ProjectDTO[]>(projectKeys.all)?.[0].name).toBe('Alpha');
  });
});
```

## XSS: `dangerouslySetInnerHTML` and URLs

- React escapes text in `{}`. It does **not** protect `dangerouslySetInnerHTML`, `href={userUrl}`
  (`javascript:` URLs) or HTML built with string concatenation.
- User or CMS HTML: sanitize with DOMPurify (`isomorphic-dompurify` on the server) right before
  rendering, or render Markdown with a library that escapes HTML by default.
- User-supplied links: allow only `http:`/`https:` (parse with `new URL()` and check `protocol`).
- JSON-LD in a `<script>`: `JSON.stringify(data).replace(/</g, '\u003c')` (Next.js JSON-LD guide).

## Auth checks: where they belong (Next.js 16)

- `middleware.ts` is now `proxy.ts` in Next 16 (same features). Use it only for **optimistic**
  checks: read the session cookie and redirect. No DB calls there, and it is not authorization.
- **Layouts don't re-run on client navigation** (partial rendering): never rely on a layout for an
  auth check. Check in the DAL (each data function) and in every Server Action / Route Handler.
- The page-level check decides which UI to show; the DAL check protects the data. Both are needed.
- Source: https://nextjs.org/docs/app/guides/authentication (Optimistic checks with Proxy, Layouts and auth checks)

## Images and LCP

- The above-the-fold hero / LCP image must not lazy-load. Next 16 deprecated `priority`; the docs
  recommend `fetchPriority="high"` (or `loading="eager"`) in most cases, and `preload` only when one
  known image is the LCP on every viewport. Next 15 and older: `priority`. Source:
  https://nextjs.org/docs/app/api-reference/components/image#preload
- Always give `width`/`height`, or `fill` + `sizes`, so the layout doesn't jump (CLS).
- Remote images need `images.remotePatterns` in `next.config`; never allow every host.

## Time zones and i18n

- Store and send UTC (ISO strings). Convert to the user's zone only when displaying.
- "Today" / date-range filters: compute the day boundaries in the user's zone, not the server's.
- Numbers and currency: `Intl.NumberFormat(locale, { style: 'currency', currency })`, never manual `toFixed` + symbol.
- Next.js i18n guide: https://nextjs.org/docs/app/guides/internationalization
