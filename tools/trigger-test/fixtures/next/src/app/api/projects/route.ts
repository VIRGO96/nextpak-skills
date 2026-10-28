import { unstable_rethrow } from 'next/navigation';
import { listMyProjects } from '@/features/projects/data';
import { AppError } from '@/lib/errors';

const STATUS: Record<AppError['code'], number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
};

// Same error shape as the team's Express APIs: { error: { code, message } }.
export async function GET() {
  try {
    return Response.json({ data: await listMyProjects() });
  } catch (err) {
    unstable_rethrow(err); // let Next.js internals (prerender bail-out, redirect, notFound) through
    if (err instanceof AppError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: STATUS[err.code] });
    }
    console.error(err); // replace with the project logger
    return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }, { status: 500 });
  }
}
