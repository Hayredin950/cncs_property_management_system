import { useMutation, useQueryClient } from "@tanstack/react-query";
import { registerUser, type RegisterPayload } from "../api/auth";
import { createCategory } from "../api/categories";
import { toast } from "../lib/toast";

/** `POST /auth/register` — the created account appears... nowhere, because there is no list endpoint (G2). The toast is the receipt. */
export function useRegisterUser() {
  return useMutation({
    mutationFn: (payload: RegisterPayload) => registerUser(payload),
    onSuccess: (result) => {
      toast.success(`Account created for ${result.user.fullName} (${result.user.email}).`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't create the account"),
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createCategory(name),
    onSuccess: (category) => {
      toast.success(`Category "${category.name}" created.`);
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't create the category"),
  });
}
