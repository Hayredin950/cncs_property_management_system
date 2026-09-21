import { useMutation, useQueryClient } from "@tanstack/react-query";
import { approveRequest, createRequest, rejectRequest } from "../api/requests";
import { toast } from "../lib/toast";
import { REQUEST_TYPE_LABELS } from "../types/enums";
import type { CreateRequestPayload, CreateRequestResponse } from "../types/request";

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
  return useMutation({
    mutationFn: ({ decision, rejectionReason }: { decision: "APPROVED" | "REJECTED"; rejectionReason?: string }) =>
      decision === "APPROVED" ? approveRequest(requestId) : rejectRequest(requestId, rejectionReason ?? ""),
    onSuccess: (result) => {
      if (result.request.status === "APPROVED") {
        const cascaded = result.cascadedItemIds.length;
        toast.success(
          `Request approved — item updated${cascaded > 0 ? ` (plus ${cascaded} cascaded accessor${cascaded === 1 ? "y" : "ies"})` : ""}.`,
        );
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
