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
