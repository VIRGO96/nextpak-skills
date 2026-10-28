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
