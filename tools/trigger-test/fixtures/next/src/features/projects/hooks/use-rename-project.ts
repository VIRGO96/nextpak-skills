import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { ProjectDTO } from '../schema';
import { projectKeys } from './use-projects';

type Rename = { id: string; name: string };

// Optimistic update with rollback: show the change at once, undo it if the server says no,
// and always re-sync with the server at the end.
export function useRenameProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: Rename) =>
      apiFetch<{ data: ProjectDTO }>(`/api/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onMutate: async ({ id, name }) => {
      // Stop in-flight refetches from overwriting the optimistic value.
      await queryClient.cancelQueries({ queryKey: projectKeys.all });
      const previous = queryClient.getQueryData<ProjectDTO[]>(projectKeys.all);
      queryClient.setQueryData<ProjectDTO[]>(projectKeys.all, (old) =>
        old?.map((p) => (p.id === id ? { ...p, name } : p)),
      );
      return { previous };
    },
    onError: (_err, _vars, onMutateResult) => {
      // Roll back. Show the error with userMessage(mutation.error) in the component.
      queryClient.setQueryData(projectKeys.all, onMutateResult?.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: projectKeys.all }),
  });
}
