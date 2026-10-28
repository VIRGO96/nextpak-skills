// One way to call HTTP APIs from the browser (Vite apps, or client fetches in Next).
// Matches the backend error shape: { error: { code, message, requestId } }.
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ErrorBody = { error?: { code?: string; message?: string; requestId?: string } };

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error. Check your connection and try again.');
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(
      res.status,
      body.error?.code ?? 'HTTP_ERROR',
      body.error?.message ?? 'Something went wrong. Please try again.',
      body.error?.requestId ?? res.headers.get('x-request-id') ?? undefined,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// What to show the user. Never render raw server text for 5xx errors.
export function userMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your session has expired. Please sign in again.';
    if (err.status === 403) return 'You do not have access to this.';
    if (err.status >= 500) return 'Something went wrong on our side. Please try again.';
    return err.message;
  }
  return 'Something went wrong. Please try again.';
}
