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
