import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProjectDTO } from '../schema';

// Query keys live next to the hook so invalidation uses the same key.
export const projectKeys = {
  all: ['projects'] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: () => apiFetch<{ data: ProjectDTO[] }>('/api/projects').then((r) => r.data),
  });
}
