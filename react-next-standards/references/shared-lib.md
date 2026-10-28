# Reference: shared lib (env, errors, action state, auth, db, api-client)

Read when adding env validation, error classes, the action result type, auth helpers or `apiFetch`.

Verified (tsc strict, eslint, `next build` with `cacheComponents: true`, Vitest + RTL, Playwright) with next 16.4.3,
react 19.3, zod 4.6, @tanstack/react-query 5.105, vitest 5.0, @testing-library/react 16.3,
@testing-library/user-event 14.6, @playwright/test 1.64. Demo feature: a signed-in user lists, creates and
deletes their own projects. Replace the demo `lib/auth.ts` / `lib/db.ts` with the project's real ones.

## Shared lib

### src/lib/env.ts

```ts
import 'server-only'; // build error if a Client Component imports this file
import { z } from 'zod';

const ServerEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
});

const parsed = ServerEnv.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a clear message; never print the values themselves.
  throw new Error(
    'Invalid server environment variables:\n' +
      parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'),
  );
}

export const env = parsed.data;
```

### src/lib/public-env.ts

```ts
import { z } from 'zod';

// Only NEXT_PUBLIC_ values. They are inlined into the browser bundle at build time,
// so they must never hold secrets. Reference each one by its full literal name -
// Next.js only inlines `process.env.NEXT_PUBLIC_X`, not dynamic lookups.
export const publicEnv = z
  .object({ NEXT_PUBLIC_APP_URL: z.url() })
  .parse({ NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL });
```

### .env.example

```bash
# Server-only (never sent to the browser)
DATABASE_URL=memory://local
SESSION_SECRET=change-me-at-least-32-characters-long
# Public (inlined into the client bundle at build time - no secrets!)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### src/lib/errors.ts

```ts
export class AppError extends Error {
  constructor(
    public readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super('UNAUTHORIZED', 'Please sign in to continue.');
  }
}
export class ForbiddenError extends AppError {
  constructor() {
    super('FORBIDDEN', 'You do not have access to this item.');
  }
}
export class NotFoundError extends AppError {
  constructor(resource = 'Item') {
    super('NOT_FOUND', `${resource} not found.`);
  }
}
```

### src/lib/action-state.ts

```ts
import { AppError } from './errors';

// One return shape for every Server Action used with useActionState.
export type ActionState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[] | undefined> };

export const idleState: ActionState = { status: 'idle' };

// Expected errors become return values; unexpected ones are re-thrown so the
// nearest error.tsx shows them (and the server logs them).
export function toActionError(err: unknown): ActionState {
  if (err instanceof AppError) return { status: 'error', message: err.message };
  throw err;
}
```

### src/lib/auth.ts

```ts
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { UnauthorizedError } from './errors';

export type SessionUser = { id: string; role: 'member' | 'admin' };

// Demo only: replace with the project's real auth (Auth.js, Clerk, custom JWT...).
// cache() dedupes the lookup within one request.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const userId = (await cookies()).get('demo-user')?.value;
  return userId ? { id: userId, role: 'member' } : null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
```

### src/lib/db.ts

```ts
import 'server-only';

// Demo in-memory store. In a real project this is Prisma/Drizzle/etc.
export type ProjectRow = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  internalNotes: string; // never sent to the client
  createdAt: Date;
};

const projects = new Map<string, ProjectRow>();

export const db = {
  project: {
    async findManyByOwner(ownerId: string) {
      return [...projects.values()].filter((p) => p.ownerId === ownerId);
    },
    async findById(id: string) {
      return projects.get(id) ?? null;
    },
    async create(data: Omit<ProjectRow, 'id' | 'createdAt' | 'internalNotes'>) {
      const row: ProjectRow = { ...data, id: crypto.randomUUID(), internalNotes: '', createdAt: new Date() };
      projects.set(row.id, row);
      return row;
    },
    async delete(id: string) {
      projects.delete(id);
    },
    async _reset() {
      projects.clear();
    },
  },
};
```

### src/lib/api-client.ts

```ts
// One way to call HTTP APIs from the browser (Vite apps, or client fetches in Next).
// Matches the backend error shape: { error: { code, message, requestId } }.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ErrorBody = { error?: { code?: string; message?: string; requestId?: string } };

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error. Check your connection and try again.');
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(
      res.status,
      body.error?.code ?? 'HTTP_ERROR',
      body.error?.message ?? 'Something went wrong. Please try again.',
      body.error?.requestId ?? res.headers.get('x-request-id') ?? undefined,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// What to show the user. Never render raw server text for 5xx errors.
export function userMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.';
    if (err.status === 403) return 'You do not have access to this.';
    if (err.status >= 500) return 'Something went wrong on our side. Please try again.';
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}
```
