import { useMutation, useQueryClient } from "@tanstack/react-query";
import { approveRequest, createRequest, rejectRequest, withdrawRequest } from "../api/requests";
import { toast } from "../lib/toast";
import { REQUEST_TYPE_LABELS } from "../types/enums";
import type { CreateRequestPayload, CreateRequestResponse, DecideRequestResponse, RequestByIdResponse } from "../types/request";

export function useCreateRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateRequestPayload) => createRequest(payload),
    onSuccess: (result: CreateRequestResponse) => {
      toast.success(
        `${REQUEST_TYPE_LABELS[result.request.type]} request filed — ${result.notifiedReviewerCount} reviewer${
          result.notifiedReviewerCount === 1 ? "" : "s"
        } notified in-app.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["requests"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't file the request"),
  });
}

export function useDecideRequest(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation<DecideRequestResponse, Error, { decision: "APPROVED" | "REJECTED"; rejectionReason?: string }>({
    mutationFn: ({ decision, rejectionReason }: { decision: "APPROVED" | "REJECTED"; rejectionReason?: string }) =>
      decision === "APPROVED" ? approveRequest(requestId) : rejectRequest(requestId, rejectionReason ?? ""),
    onSuccess: (result) => {
      /*
        What the approver is told has to be what actually happened.
        It used to be one message for "APPROVED" and one for everything else,
        so approving a transfer at stage 1 — which moves the request to
        `PENDING_STAGE2` for the receiving head — and approving a loan —
        which leaves the item `PENDING_CLAIM` until the borrower confirms it
        — both said **"Request rejected"**. The approver had been told the
        opposite of the truth about their own decision.
      */
      const status = result.request.status;
      if (status === "APPROVED") {
        const cascaded = result.cascadedItemIds.length;
        toast.success(
          `Request approved — item updated${cascaded > 0 ? ` (plus ${cascaded} cascaded accessor${cascaded === 1 ? "y" : "ies"})` : ""}.`,
        );
      } else if (status === "PENDING_STAGE2") {
        toast.success("Approved — the request now waits for the receiving head.");
      } else {
        toast.success("Request rejected — the reviewer's reason was sent to the requester.");
      }
      // A decision moves the pending badge, the queue, the item, and its history.
      void queryClient.invalidateQueries({ queryKey: ["requests"] });
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      void queryClient.invalidateQueries({ queryKey: ["item"] });
      void queryClient.invalidateQueries({ queryKey: ["item-history"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't record the decision"),
  });
}

export function useWithdrawRequest(requestId: string) {
  const queryClient = useQueryClient();
  return useMutation<RequestByIdResponse, Error, { reason?: string }>({
    mutationFn: ({ reason }: { reason?: string }) => withdrawRequest(requestId, reason),
    onSuccess: () => {
      toast.success("Request withdrawn — it will not be reviewed.");
      void queryClient.invalidateQueries({ queryKey: ["requests"] });
      void queryClient.invalidateQueries({ queryKey: ["request", requestId] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't withdraw the request"),
  });
}
