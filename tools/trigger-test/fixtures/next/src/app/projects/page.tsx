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
