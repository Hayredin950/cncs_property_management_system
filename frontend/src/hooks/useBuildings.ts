import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBuilding, deleteBuilding, fetchBuildings, updateBuilding } from "../api/buildings";
import { toast } from "../lib/toast";

/**
 * `GET /buildings` — the Property Officer's list of the college's buildings.
 *
 * Buildings change rarely, so a long `staleTime` keeps the screen from
 * refetching on every render.
 */
export function useBuildings() {
  return useQuery({
    queryKey: ["buildings"],
    queryFn: ({ signal }) => fetchBuildings(signal),
    staleTime: 5 * 60_000,
  });
}

export function useCreateBuilding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; code: string; description?: string | undefined; address?: string | undefined }) =>
      createBuilding(input),
    onSuccess: (building) => {
      toast.success(`Building "${building.name}" created.`);
      void queryClient.invalidateQueries({ queryKey: ["buildings"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't create the building"),
  });
}

export function useUpdateBuilding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string | undefined;
      code?: string | undefined;
      description?: string | undefined;
      address?: string | undefined;
    }) =>
      updateBuilding(id, input),
    onSuccess: (building) => {
      toast.success(`Building "${building.name}" updated.`);
      void queryClient.invalidateQueries({ queryKey: ["buildings"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't update the building"),
  });
}

export function useDeleteBuilding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBuilding(id),
    onSuccess: () => {
      toast.success("Building deleted.");
      void queryClient.invalidateQueries({ queryKey: ["buildings"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't delete the building"),
  });
}
