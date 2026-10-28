# Reference: Next.js feature (schema, DAL, Server Actions, page, loading/error, forms, Route Handler)

Read when adding a page, form, Server Action, DAL function or Route Handler. Uses the helpers in [shared-lib.md](shared-lib.md).

Verified (tsc strict, eslint, `next build` with `cacheComponents: true`, Vitest + RTL, Playwright) with next 16.4.3,
react 19.3, zod 4.6, @tanstack/react-query 5.105, vitest 5.0, @testing-library/react 16.3,
@testing-library/user-event 14.6, @playwright/test 1.64. Demo feature: a signed-in user lists, creates and
deletes their own projects. Replace the demo `lib/auth.ts` / `lib/db.ts` with the project's real ones.

## Contents

- src/features/projects/schema.ts
- src/features/projects/data.ts
- src/features/projects/actions.ts
- src/app/projects/page.tsx
- src/app/projects/loading.tsx
- src/app/projects/error.tsx
- src/features/projects/components/project-list.tsx
- src/features/projects/components/delete-project-button.tsx
- src/features/projects/components/project-form.tsx
- src/app/api/projects/route.ts

## Feature: projects (Next.js)

### src/features/projects/schema.ts

```ts
import { z } from 'zod';

// Shared by the form (instant feedback) and the Server Action (the real check).
export const ProjectInput = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(80, 'Name must be 80 characters or fewer'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be 500 characters or fewer')
    .default(''),
});
export type ProjectInput = z.infer<typeof ProjectInput>;

export const ProjectId = z.uuid();

// Pick known fields only: FormData also carries $ACTION_ keys from Next.js.
export function projectInputFromForm(formData: FormData) {
  return ProjectInput.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? undefined,
  });
}

// What the client is allowed to see. No ownerId, no internal fields.
export type ProjectDTO = { id: string; name: string; description: string; createdAt: string };
```

### src/features/projects/data.ts

```ts
import 'server-only';
import { requireUser } from '@/lib/auth';
import { db, type ProjectRow } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import type { ProjectDTO, ProjectInput } from './schema';

// Data Access Layer: the only place that touches the DB for projects.
// Every function checks auth itself - callers can't forget.

const toDTO = (p: ProjectRow): ProjectDTO => ({
  id: p.id,
  name: p.name,
  description: p.description,
  createdAt: p.createdAt.toISOString(),
});

export async function listMyProjects(): Promise<ProjectDTO[]> {
  const user = await requireUser();
  const rows = await db.project.findManyByOwner(user.id);
  return rows.map(toDTO);
}

export async function createProject(input: ProjectInput): Promise<ProjectDTO> {
  const user = await requireUser();
  // ownerId comes from the session, never from the form.
  const row = await db.project.create({ ...input, ownerId: user.id });
  return toDTO(row);
}

export async function deleteProject(id: string): Promise<void> {
  const user = await requireUser();
  const project = await db.project.findById(id);
  if (!project) throw new NotFoundError('Project');
  // Authorization, not just authentication: is it *theirs*?
  if (project.ownerId !== user.id && user.role !== 'admin') throw new ForbiddenError();
  await db.project.delete(id);
}
```

### src/features/projects/actions.ts

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { idleState, toActionError, type ActionState } from '@/lib/action-state';
import { createProject, deleteProject } from './data';
import { ProjectId, projectInputFromForm } from './schema';

// Server Actions are public POST endpoints. Re-validate everything here,
// even if the form already validated. Auth + ownership live in the DAL.

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = projectInputFromForm(formData);
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please fix the highlighted fields.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  try {
    await createProject(parsed.data);
  } catch (err) {
    return toActionError(err);
  }

  revalidatePath('/projects');
  return { status: 'success', message: 'Project created.' };
}

export async function deleteProjectAction(projectId: unknown): Promise<ActionState> {
  const id = ProjectId.safeParse(projectId);
  if (!id.success) return { status: 'error', message: 'Invalid project id.' };

  try {
    await deleteProject(id.data);
  } catch (err) {
    return toActionError(err);
  }

  revalidatePath('/projects');
  return idleState;
}
```

### src/app/projects/page.tsx

```tsx
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { listMyProjects } from '@/features/projects/data';
import { createProjectAction } from '@/features/projects/actions';
import { ProjectList } from '@/features/projects/components/project-list';
import { ProjectForm } from '@/features/projects/components/project-form';

export const metadata: Metadata = { title: 'Projects' };

// Server Component: fetches on the server, passes only DTOs down.
// loading.tsx (Suspense) and error.tsx cover the loading and error states.
export default async function ProjectsPage() {
  // Page check = which UI to render. The action and DAL still check again.
  if (!(await getSessionUser())) redirect('/login');

  const projects = await listMyProjects();

  return (
    <main>
      <h1>Projects</h1>
      <ProjectList projects={projects} />
      <ProjectForm action={createProjectAction} />
    </main>
  );
}
```

### src/app/projects/loading.tsx

```tsx
export default function Loading() {
  return (
    <main aria-busy="true">
      <h1>Projects</h1>
      <p role="status">Loading projects...</p>
    </main>
  );
}
```

### src/app/projects/error.tsx

```tsx
'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';

export default function ProjectsError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // Send to the project's error reporter (Sentry etc.). digest matches server logs.
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && 'digest' in error ? String(error.digest) : undefined;

  return (
    <main>
      <h1>Projects</h1>
      <div role="alert">
        <p>We could not load your projects. Please try again.</p>
        {digest && <p>Error reference: {digest}</p>}
      </div>
      <button type="button" onClick={() => retry()}>
        Try again
      </button>
    </main>
  );
}
```

### src/features/projects/components/project-list.tsx

```tsx
import type { ProjectDTO } from '../schema';
import { DeleteProjectButton } from './delete-project-button';

// Server Component: no 'use client', no JS shipped for the list itself.
export function ProjectList({ projects }: { projects: ProjectDTO[] }) {
  if (projects.length === 0) {
    return (
      <section aria-labelledby="projects-heading">
        <h2 id="projects-heading">Your projects</h2>
        <p>No projects yet. Create your first one below.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="projects-heading">
      <h2 id="projects-heading">Your projects</h2>
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <h3>{p.name}</h3>
            {p.description && <p>{p.description}</p>}
            {/* Only the interactive leaf is a Client Component */}
            <DeleteProjectButton projectId={p.id} projectName={p.name} />
          </li>
        ))}
      </ul>
    </section>
  );
}
```

### src/features/projects/components/delete-project-button.tsx

```tsx
'use client';

import { useState, useTransition } from 'react';
import { deleteProjectAction } from '../actions';

type Props = { projectId: string; projectName: string };

export function DeleteProjectButton({ projectId, projectName }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    startTransition(async () => {
      const result = await deleteProjectAction(projectId);
      setError(result.status === 'error' ? result.message : null);
    });
  }

  return (
    <>
      <button type="button" disabled={pending} aria-label={`Delete ${projectName}`} onClick={onDelete}>
        {pending ? 'Deleting...' : 'Delete'}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
```

### src/features/projects/components/project-form.tsx

```tsx
'use client';

import { useActionState, useState } from 'react';
import { idleState, type ActionState } from '@/lib/action-state';
import { projectInputFromForm } from '../schema';
import { z } from 'zod';

type Props = {
  // Passed in by the Server Component page: keeps this component testable.
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
};

type FieldErrors = Record<string, string[] | undefined>;

export function ProjectForm({ action }: Props) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const [clientErrors, setClientErrors] = useState<FieldErrors | null>(null);

  const serverErrors = state.status === 'error' ? state.fieldErrors : undefined;
  const errors = clientErrors ?? serverErrors ?? {};

  function submit(formData: FormData) {
    // Same schema as the server: instant feedback, no round trip.
    const parsed = projectInputFromForm(formData);
    if (!parsed.success) {
      setClientErrors(z.flattenError(parsed.error).fieldErrors);
      return;
    }
    setClientErrors(null);
    formAction(formData);
  }

  return (
    <form action={submit} noValidate aria-labelledby="new-project-heading">
      <h2 id="new-project-heading">New project</h2>

      <div>
        <label htmlFor="project-name">Name</label>
        <input
          id="project-name"
          name="name"
          required
          maxLength={80}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'project-name-error' : undefined}
        />
        {errors.name && <p id="project-name-error">{errors.name[0]}</p>}
      </div>

      <div>
        <label htmlFor="project-description">Description (optional)</label>
        <textarea
          id="project-description"
          name="description"
          maxLength={500}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? 'project-description-error' : undefined}
        />
        {errors.description && <p id="project-description-error">{errors.description[0]}</p>}
      </div>

      <button type="submit" disabled={pending}>
        {pending ? 'Creating...' : 'Create project'}
      </button>

      {/* Announced by screen readers when it changes */}
      <p role="status" aria-live="polite">
        {state.status !== 'idle' && !clientErrors ? state.message : ''}
      </p>
    </form>
  );
}
```

### src/app/api/projects/route.ts

```ts
import { unstable_rethrow } from 'next/navigation';
import { listMyProjects } from '@/features/projects/data';
import { AppError } from '@/lib/errors';

const STATUS: Record<AppError['code'], number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

// Same error shape as the team's Express APIs: { error: { code, message } }.
export async function GET() {
  try {
    return Response.json({ data: await listMyProjects() });
  } catch (err) {
    unstable_rethrow(err); // let Next.js internals (prerender bail-out, redirect, notFound) through
    if (err instanceof AppError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: STATUS[err.code] });
    }
    console.error(err); // replace with the project logger
    return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }, { status: 500 });
  }
}
```
