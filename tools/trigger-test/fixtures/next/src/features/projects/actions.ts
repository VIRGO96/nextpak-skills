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
