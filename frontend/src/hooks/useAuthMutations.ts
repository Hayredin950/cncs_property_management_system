import { useMutation, useQueryClient } from "@tanstack/react-query";
import { registerUser, type RegisterPayload } from "../api/auth";
import { createCategory, deleteCategory, updateCategory } from "../api/categories";
import {
  deleteUser,
  promoteUser,
  resetUserPassword,
  updateUser,
  type UpdateUserPayload,
} from "../api/users";
import { toast } from "../lib/toast";

/** `POST /auth/register` — the created account now also shows in the accounts list (`GET /users`). */
export function useRegisterUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: RegisterPayload) => registerUser(payload),
    onSuccess: (result) => {
      toast.success(`Account created for ${result.user.fullName} (${result.user.email}).`);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
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

export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateCategory(id, name),
    onSuccess: (category) => {
      toast.success(`Category renamed to "${category.name}".`);
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      // Items carry the category name in their nested `category`, so the lists
      // have to refetch or they would keep showing the old label.
      void queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't rename the category"),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      toast.success("Category deleted.");
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't delete the category"),
  });
}

/** `PATCH /users/:id` — correct a name or email on an existing account. */
export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserPayload }) => updateUser(id, payload),
    onSuccess: (user) => {
      toast.success(`Account updated for ${user.fullName}.`);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't update the account"),
  });
}

/** `POST /users/:id/promote` — the one-directional role change. */
export function usePromoteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => promoteUser(id),
    onSuccess: (user) => {
      toast.success(`${user.fullName} is now an administrator.`);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't promote the account"),
  });
}

/** `POST /users/:id/password` — the admin sets a new password for the account. */
export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => resetUserPassword(id, password),
    onSuccess: () => toast.success("Password changed."),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't change the password"),
  });
}

/** `DELETE /users/:id` — refused for any account that is part of the record. */
export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      toast.success("Account deleted.");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't delete the account"),
  });
}
