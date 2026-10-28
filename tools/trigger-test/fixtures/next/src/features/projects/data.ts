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
