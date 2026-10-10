import { useQuery } from "@tanstack/react-query";
import { fetchCategories } from "../api/categories";

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: ({ signal }) => fetchCategories(signal),
    // Categories change rarely (admin-only POST /categories) — a long staleTime
    // avoids refetching them on every list/filter render.
    staleTime: 5 * 60_000,
  });
}
