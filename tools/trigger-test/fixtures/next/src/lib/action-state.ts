import { AppError } from './errors';

// One return shape for every Server Action used with useActionState.
export type ActionState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string[] | undefined> };

export const idleState: ActionState = { status: 'idle' };

// Expected errors become return values; unexpected ones are re-thrown so the
// nearest error.tsx shows them (and the server logs them).
export function toActionError(err: unknown): ActionState {
  if (err instanceof AppError) return { status: 'error', message: err.message };
  throw err;
}
