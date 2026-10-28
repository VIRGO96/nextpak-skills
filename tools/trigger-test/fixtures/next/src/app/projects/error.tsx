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
