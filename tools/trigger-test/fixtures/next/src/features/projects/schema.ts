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
