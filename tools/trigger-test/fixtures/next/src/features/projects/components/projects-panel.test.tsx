import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectsPanel } from './projects-panel';

function renderWithClient() {
  // Fresh client per test, no retries, so error states show immediately.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProjectsPanel />
    </QueryClientProvider>,
  );
}

function mockFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProjectsPanel', () => {
  it('shows loading, then the list', async () => {
    mockFetch(Response.json({ data: [{ id: '1', name: 'Alpha', description: '', createdAt: '' }] }));
    renderWithClient();

    expect(screen.getByRole('status')).toHaveTextContent('Loading projects...');
    expect(await screen.findByRole('listitem')).toHaveTextContent('Alpha');
  });

  it('shows the empty state', async () => {
    mockFetch(Response.json({ data: [] }));
    renderWithClient();

    expect(await screen.findByText('No projects yet.')).toBeInTheDocument();
  });

  it('shows a safe error message and recovers on retry', async () => {
    mockFetch(
      Response.json({ error: { code: 'INTERNAL_ERROR', message: 'db timeout at 10.0.0.3' } }, { status: 500 }),
      Response.json({ data: [{ id: '1', name: 'Alpha', description: '', createdAt: '' }] }),
    );
    renderWithClient();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong on our side');
    expect(alert).not.toHaveTextContent('10.0.0.3'); // never show raw server text

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('listitem')).toHaveTextContent('Alpha');
  });
});
