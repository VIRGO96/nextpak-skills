import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ProjectDTO } from '../schema';
import { projectKeys } from './use-projects';
import { useRenameProject } from './use-rename-project';

const alpha: ProjectDTO = { id: '1', name: 'Alpha', description: '', createdAt: '' };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(projectKeys.all, [alpha]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useRenameProject(), { wrapper });
  return { client, result };
}

afterEach(() => vi.unstubAllGlobals());

describe('useRenameProject', () => {
  it('shows the new name at once, then rolls back when the server fails', async () => {
    let fail!: () => void;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        () =>
          new Promise((resolve) => {
            fail = () => resolve(Response.json({ error: { code: 'INTERNAL_ERROR', message: 'x' } }, { status: 500 }));
          }),
      ),
    );
    const { client, result } = setup();

    act(() => result.current.mutate({ id: '1', name: 'Beta' }));
    await waitFor(() => expect(client.getQueryData<ProjectDTO[]>(projectKeys.all)?.[0].name).toBe('Beta'));

    act(() => fail());
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData<ProjectDTO[]>(projectKeys.all)?.[0].name).toBe('Alpha');
  });
});
