import { useQuery } from "@tanstack/react-query";
import { fetchBuildings, type Building } from "../api/buildings";

export function useBuildings() {
  return useQuery<Building[]>({
    queryKey: ["buildings"],
    queryFn: ({ signal }) => fetchBuildings(signal),
    staleTime: 5 * 60 * 1000,
  });
}
