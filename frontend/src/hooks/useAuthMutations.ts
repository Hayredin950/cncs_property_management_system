import { useMutation, useQueryClient } from "@tanstack/react-query";
import { claimItem, refuseClaim } from "../api/items";
import { createCategory, deleteCategory, updateCategory } from "../api/categories";
import {
  approveUser,
  deleteUser,
  inviteUser,
  promoteUser,
  rejectUser,
  resetUserPassword,
  updateUser,
  type InviteUserPayload,
  type UpdateUserPayload,
} from "../api/users";
import { toast } from "../lib/toast";
import { ROLE_LABELS, type Role } from "../types/enums";

/**
 * `POST /users/invite` — the privileged invite (T6).
 *
 * The success toast says **invited**, not "created": the account exists but
 * cannot be signed into until the invitee sets their own password, and an
 * administrator who reads "created" will hand over the link expecting the person
 * to already be able to sign in with something.
 *
 * The invited account joins the accounts list, so that query is invalidated. The
 * invite queue is not: the account is `PENDING_EMAIL_VERIFICATION`, which the
 * approval queue does not show — it is waiting on the *invitee*, not on a decision
 * — so invalidating it would be a refetch that cannot change.
 */
export function useInviteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InviteUserPayload) => inviteUser(payload),
    onSuccess: (result) => {
      toast.success(
        result.invite.renewed
          ? `New invite link sent to ${result.invite.email}.`
          : `Invited ${result.invite.email} as ${ROLE_LABELS[result.invite.role]}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't send the invite"),
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

/**
 * `POST /users/:id/approve` — let a requested account sign in, optionally as the
 * role the approver assigns. Both lists the queue lives on are invalidated: the
 * account leaves the pending queue and its row changes in the accounts list.
 */
export function useApproveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role?: Role }) =>
      role ? approveUser(id, role) : approveUser(id),
    onSuccess: (user) => {
      toast.success(`${user.fullName} can now sign in.`);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "approvals"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't approve the account"),
  });
}

/** `POST /users/:id/reject` — decline the request. The row stays, as `REJECTED`. */
export function useRejectUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectUser(id, reason),
    onSuccess: (user) => {
      toast.success(`${user.fullName}'s request was declined.`);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "approvals"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't decline the account"),
  });
}

/**
 * `POST /users/:id/promote` — set an account's role.
 *
 * The success toast names the new role rather than saying "promoted": the same
 * endpoint now grants any of the five roles, and "Sara Staff is now a System
 * Admin" is the sentence an administrator can check at a glance.
 */
export function usePromoteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => promoteUser(id, role),
    onSuccess: (user) => {
      toast.success(`${user.fullName} is now ${ROLE_LABELS[user.role]}.`);
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't change the role"),
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

/** `POST /items/:id/claim` — claim a PENDING_CLAIM item. */
export function useClaimItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => claimItem(id),
    onSuccess: (item) => {
      toast.success(`${item.name} claimed and now active.`);
      void queryClient.invalidateQueries({ queryKey: ["item"] });
      void queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't claim the item"),
  });
}

/** `POST /items/:id/refuse-claim` — refuse a PENDING_CLAIM item, reverting to college pool. */
export function useRefuseClaim() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => refuseClaim(id, reason),
    onSuccess: (item) => {
      toast.success(`${item.name} refused and returned to the college pool.`);
      void queryClient.invalidateQueries({ queryKey: ["item"] });
      void queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't refuse the claim"),
  });
}
