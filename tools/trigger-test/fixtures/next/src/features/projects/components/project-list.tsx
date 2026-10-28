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
