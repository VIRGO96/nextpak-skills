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
