import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { UnauthorizedError } from './errors';

export type SessionUser = { id: string; role: 'member' | 'admin' };

// Demo only: replace with the project's real auth (Auth.js, Clerk, custom JWT...).
// cache() dedupes the lookup within one request.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const userId = (await cookies()).get('demo-user')?.value;
  return userId ? { id: userId, role: 'member' } : null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
