import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { idleState } from '@/lib/action-state';
import { createProjectAction, deleteProjectAction } from './actions';

// Mock only framework/request boundaries. The DAL and schema run for real.
let currentUserId: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'demo-user' && currentUserId ? { name, value: currentUserId } : undefined,
  }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(async () => {
  await db.project._reset();
  currentUserId = undefined;
});

describe('createProjectAction', () => {
  it('creates a project owned by the signed-in user', async () => {
    currentUserId = 'user-a';
    const result = await createProjectAction(idleState, form({ name: '  Launch  ' }));

    expect(result).toEqual({ status: 'success', message: 'Project created.' });
    const [row] = await db.project.findManyByOwner('user-a');
    expect(row.name).toBe('Launch'); // trimmed by the schema
  });

  it('re-validates on the server (client checks can be bypassed)', async () => {
    currentUserId = 'user-a';
    const result = await createProjectAction(idleState, form({ name: '' }));

    expect(result.status).toBe('error');
    expect(result.status === 'error' && result.fieldErrors?.name).toEqual(['Name is required']);
    expect(await db.project.findManyByOwner('user-a')).toHaveLength(0);
  });

  it('ignores an ownerId sent in the form (no mass assignment)', async () => {
    currentUserId = 'user-a';
    await createProjectAction(idleState, form({ name: 'Mine', ownerId: 'user-b' }));

    expect(await db.project.findManyByOwner('user-b')).toHaveLength(0);
    expect(await db.project.findManyByOwner('user-a')).toHaveLength(1);
  });

  it('rejects a signed-out caller', async () => {
    const result = await createProjectAction(idleState, form({ name: 'x' }));
    expect(result).toEqual({ status: 'error', message: 'Please sign in to continue.' });
  });
});

describe('deleteProjectAction', () => {
  it("does not let user B delete user A's project", async () => {
    const project = await db.project.create({ ownerId: 'user-a', name: 'A', description: '' });
    currentUserId = 'user-b';

    const result = await deleteProjectAction(project.id);

    expect(result).toEqual({ status: 'error', message: 'You do not have access to this item.' });
    expect(await db.project.findById(project.id)).not.toBeNull();
  });

  it('rejects a malformed id', async () => {
    currentUserId = 'user-a';
    expect(await deleteProjectAction('not-a-uuid')).toEqual({ status: 'error', message: 'Invalid project id.' });
  });

  it('deletes own project', async () => {
    const project = await db.project.create({ ownerId: 'user-a', name: 'A', description: '' });
    currentUserId = 'user-a';

    expect(await deleteProjectAction(project.id)).toEqual(idleState);
    expect(await db.project.findById(project.id)).toBeNull();
  });
});
