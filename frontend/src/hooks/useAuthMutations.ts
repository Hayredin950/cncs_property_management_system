import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  claimItem,
  refuseClaim,
  claimItemWithCorrection,
  verifyConfirmItem,
  verifyFlagItem,
  reverseDisposal,
} from "../api/items";
import { createCategory, deleteCategory, updateCategory } from "../api/categories";
import { resendInvite } from "../api/users";
import {approveUser,
  deleteUser,
  inviteUser,
  promoteUser,
  rejectUser,
  resetUserPassword,
  updateUser,
  type InviteUserPayload,
  type UpdateUserPayload, deactivateUser, activateDepartmentHead } from "../api/users";
import { initiateLoanReturn, confirmLoanReturn, disputeLoanReturn } from "../api/requests";
import { checkExpiries } from "../api/expiry";
import { toast } from "../lib/toast";
import { ROLE_LABELS, type Role } from "../types/enums";
import type { Item } from "../types/item";

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

/** `POST /items/:id/claim-with-correction` — claim with condition correction. */
export function useClaimItemWithCorrection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, actualCondition, note }: { id: string; actualCondition: string; note: string }) =>
      claimItemWithCorrection(id, actualCondition, note),
    onSuccess: (item) => {
      toast.success(`${item.name} claimed with condition correction.`);
      void queryClient.invalidateQueries({ queryKey: ["item"] });
      void queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't claim the item with correction"),
  });
}

/** `POST /items/:id/verify-confirm` — confirm a REVERTED_UNVERIFIED item (handover). */
export function useVerifyConfirmItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => verifyConfirmItem(id),
    onSuccess: (item) => {
      toast.success(`${item.name} verified and confirmed.`);
      void queryClient.invalidateQueries({ queryKey: ["item"] });
      void queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't confirm verification"),
  });
}

/** `POST /items/:id/verify-flag` — flag a REVERTED_UNVERIFIED item (handover). */
export function useVerifyFlagItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => verifyFlagItem(id, reason),
    onSuccess: () => {
      toast.success("Item flagged for review — Property Officer notified.");
      void queryClient.invalidateQueries({ queryKey: ["item"] });
      void queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't flag the item"),
  });
}

/** `POST /items/:id/reverse-disposal` — reverse a disposal (Property Officer only). */
export function useReverseDisposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => reverseDisposal(id, reason),
    onSuccess: () => {
      toast.success("Disposal reversed — item returned to college pool.");
      void queryClient.invalidateQueries({ queryKey: ["item"] });
      void queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't reverse disposal"),
  });
}

/** `POST /requests/:id/return-initiate` — Borrower initiates loan return. */
export function useInitiateLoanReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => initiateLoanReturn(id),
    onSuccess: () => {
      toast.success("Return initiated — waiting for lender confirmation.");
      void queryClient.invalidateQueries({ queryKey: ["requests"] });
      void queryClient.invalidateQueries({ queryKey: ["request"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't initiate return"),
  });
}

/** `POST /requests/:id/return-confirm` — Lender/Property Officer confirms loan return. */
export function useConfirmLoanReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, condition, notes }: { id: string; condition: string; notes?: string | null }) =>
      confirmLoanReturn(id, condition, notes),
    onSuccess: () => {
      toast.success("Loan return confirmed — item returned to college pool.");
      void queryClient.invalidateQueries({ queryKey: ["requests"] });
      void queryClient.invalidateQueries({ queryKey: ["request"] });
      void queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't confirm return"),
  });
}

/** `POST /requests/:id/return-dispute` — Lender/Property Officer disputes loan return. */
export function useDisputeLoanReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => disputeLoanReturn(id, reason),
    onSuccess: () => {
      toast.success("Return disputed — loan remains active, Property Officer notified.");
      void queryClient.invalidateQueries({ queryKey: ["requests"] });
      void queryClient.invalidateQueries({ queryKey: ["request"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't dispute return"),
  });
}

/** `POST /api/v1/expiry/check` — Run all expiry checks (SYSTEM_ADMIN only). */
export function useCheckExpiries() {
  return useMutation({
    mutationFn: () => checkExpiries(),
    onSuccess: (result) => {
      toast.success(
        `Expiry check complete: ${result.expiredClaims} claims, ${result.expiredApprovals} approvals, ` +
          `${result.expiredReturnConfirmations} returns, ${result.expiredHandoverVerifications} handovers escalated.`,
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't run expiry check"),
  });
}

export type { Item };

/**
 * `POST /users/:id/deactivate` — close an account.
 *
 * The account is not deleted: it stops being able to sign in, and the items it
 * held move to `REVERTED_UNVERIFIED` for the department head to verify one by
 * one. The reason is required, and it is written to the account's record.
 */
export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => deactivateUser(id, reason),
    onSuccess: (_data, variables) => {
      toast.success("The account has been closed.");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      void variables;
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't close the account"),
  });
}

/**
 * `POST /users/invites/:id/resend` — a fresh invitation link for an account
 * that has not accepted its invitation yet.
 */
export function useResendInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resendInvite(id),
    onSuccess: () => {
      toast.success("A new invitation link has been issued.");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't resend the invitation"),
  });
}

/**
 * `POST /users/org-units/:id/activate-head` — appoint a department's head.
 */
export function useActivateDepartmentHead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgUnitId, newHeadId }: { orgUnitId: string; newHeadId: string }) =>
      activateDepartmentHead(orgUnitId, newHeadId),
    onSuccess: () => {
      toast.success("The new head is appointed. Their department's items need verifying.");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["departments"] });
      void queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't appoint the head"),
  });
}
