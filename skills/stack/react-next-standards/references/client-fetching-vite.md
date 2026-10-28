# Reference: TanStack Query and Vite

Read when fetching from the browser (Vite app or Next client island) or setting up a Vite SPA. Uses `apiFetch` from [shared-lib.md](shared-lib.md).

Verified (tsc strict, eslint, `next build` with `cacheComponents: true`, Vitest + RTL, Playwright) with next 16.4.3,
react 19.3, zod 4.6, @tanstack/react-query 5.105, vitest 5.0, @testing-library/react 16.3,
@testing-library/user-event 14.6, @playwright/test 1.64. Demo feature: a signed-in user lists, creates and
deletes their own projects. Replace the demo `lib/auth.ts` / `lib/db.ts` with the project's real ones.

## Contents

- Client-side fetching with TanStack Query (Vite apps, or Next client islands)
- Vite-only pieces

## Client-side fetching with TanStack Query (Vite apps, or Next client islands)

### src/features/projects/hooks/use-projects.ts

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProjectDTO } from '../schema';

// Query keys live next to the hook so invalidation uses the same key.
export const projectKeys = {
  all: ['projects'] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => apiFetch<{ data: ProjectDTO[] }>('/api/projects').then((r) => r.data),
  });
}
```

### src/features/projects/components/projects-panel.tsx

```tsx
'use client';

import { userMessage } from '@/lib/api-client';
import { useProjects } from '../hooks/use-projects';

// Client-side fetching (Vite app, or a Next client island): handle all 4 states.
export function ProjectsPanel() {
  const { data, isPending, isError, error, refetch } = useProjects();

  if (isPending) return <p role="status">Loading projects...</p>;

  if (isError) {
    return (
      <div role="alert">
        <p>{userMessage(error)}</p>
        <button type="button" onClick={() => refetch()}>
          Try again
        </button>
      </div>
    );
  }

  if (data.length === 0) return <p>No projects yet.</p>;

  return (
    <ul aria-label="Projects">
      {data.map((p) => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  );
}
```

## Vite-only pieces

### src/vite-env.d.ts

```ts
/// <reference types="vite/client" />

// Type every VITE_ variable. No imports in this file, or the augmentation stops working.
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### src/main.tsx

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app';

// One QueryClient for the app. Server state lives here, not in a global store.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

### src/app.tsx (code splitting + public env)

```tsx
import { lazy, Suspense } from 'react';

// Heavy, rarely used UI is code-split (Vite equivalent of next/dynamic).
const ReportsChart = lazy(() => import('./reports-chart'));

export function App() {
  // Public, build-time value. Never put secrets in VITE_ variables.
  const apiUrl = import.meta.env.VITE_API_URL;
  return (
    <main>
      <h1>Dashboard</h1>
      <p>API: {apiUrl}</p>
      <Suspense fallback={<p role="status">Loading chart...</p>}>
        <ReportsChart />
      </Suspense>
    </main>
  );
}
```
