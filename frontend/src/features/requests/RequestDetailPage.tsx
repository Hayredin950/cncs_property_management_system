import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { Modal } from "../../components/Modal";
import { Skeleton, SkeletonText } from "../../components/Skeleton";
import { RequestStatusBadge, RequestTypeBadge } from "../../components/StatusBadges";
import { Textarea } from "../../components/Textarea";
import { Clock, CheckCircle2 } from "lucide-react";
import { fetchRequestById } from "../../api/requests";
import { useDecideRequest, useWithdrawRequest } from "../../hooks/useRequestMutations";
import { useClaimItem, useRefuseClaim } from "../../hooks/useAuthMutations";
import { canDecideRequests } from "../../lib/permissions";
import { formatDateTimeUTC, formatRelativeTime } from "../../lib/formatters";
import { ApiError, NetworkError } from "../../types/api";
import { REQUEST_STATUS_LABELS } from "../../types/enums";
import type { DecideRequestResponse } from "../../types/request";

/**
 * `/requests/:id` — the decision screen (F6.2/F7.2). Staff see their own
 * request read-only; admins get approve/reject behind ConfirmDialogs that
 * state the specific consequence (§11 copy bank), never a bare "Are you
 * sure?". Rejection requires a 3–500 char reason — the dialog cannot submit
 * empty, client-side as well as server-side.
 */
export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canDecide = canDecideRequests(user?.role);

  // After a decision, show what changed (if the decision mutation completed successfully)
  const [decisionResult, setDecisionResult] = useState<DecideRequestResponse | null>(null);
  const [refuseDialogOpen, setRefuseDialogOpen] = useState(false);
  const claimMutation = useClaimItem();
  const refuseMutation = useRefuseClaim();

  const requestQuery = useQuery({
    queryKey: ["requests", "detail", id],
    queryFn: ({ signal }) => fetchRequestById(id ?? "", signal),
    enabled: Boolean(id),
    retry: false,
  });

  if (requestQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4" role="status" aria-label="Loading request">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
        <SkeletonText lines={4} />
      </div>
    );
  }

  if (requestQuery.isError) {
    const error = requestQuery.error;
    if (error instanceof NetworkError) return <OfflineState />;
    return (
      <ErrorState
        icon={<SearchXIfNeeded />}
        heading={error instanceof ApiError && error.status === 404 ? "Request not found" : "Couldn't load this request"}
        body={
          error instanceof ApiError && error.status === 404
            ? "It may not exist, or your account may not have access to it."
            : error instanceof Error
              ? error.message
              : undefined
        }
        action={
          <Link to="/requests">
            <Button size="sm" variant="outline">
              Back to requests
            </Button>
          </Link>
        }
      />
    );
  }

  const request = requestQuery.data.request;
  const isPending = ["PENDING", "PENDING_STAGE1", "PENDING_STAGE2", "WAITLISTED"].includes(request.status);
  const isUnclaimedApproved = request.status === "APPROVED" && request.item.status === "PENDING_CLAIM";
  const decided = !isPending;
  const isOwnRequest = user?.id === request.requestedBy.id;
  const canWithdraw = isOwnRequest && (isPending || isUnclaimedApproved);
  const proposedRecipient = request.newOwner;

  // Determine if logged in user is the recipient who can claim
  const canClaimItem =
    isUnclaimedApproved &&
    Boolean(user?.id) &&
    (user?.id === request.newOwnerId || user?.id === request.item.holderId);

  const handleClaimItem = () => {
    claimMutation.mutate(request.item.id, {
      onSuccess: () => {
        void requestQuery.refetch();
      },
    });
  };

  const handleRefuseItem = (reason: string) => {
    refuseMutation.mutate(
      { id: request.item.id, reason },
      {
        onSuccess: () => {
          setRefuseDialogOpen(false);
          void requestQuery.refetch();
        },
      },
    );
  };

  const isOfficer = user?.role === "PROPERTY_OFFICER";
  const isDeptHead = user?.role === "DEPARTMENT_HEAD";
  const userDeptName = user?.department?.trim().toLowerCase();
  const itemDeptName = request.item.department?.trim().toLowerCase();
  const destDeptName = request.newLocationDepartment?.trim().toLowerCase();

  // Has this user already approved Stage 1?
  const isStage1Approver = Boolean(
    request.stage1ApprovedById && user?.id && request.stage1ApprovedById === user.id,
  );

  let canDecideCurrentStage = false;
  if (!isOwnRequest && canDecide && isPending) {
    if (request.type === "TRANSFER") {
      if (request.status === "PENDING" || request.status === "PENDING_STAGE1") {
        // Stage 1: Releasing department head or Property Officer
        if (isOfficer) {
          canDecideCurrentStage = true;
        } else if (isDeptHead) {
          canDecideCurrentStage = !itemDeptName || !userDeptName || userDeptName === itemDeptName;
        }
      } else if (request.status === "PENDING_STAGE2") {
        // Stage 2: Receiving department head or Property Officer
        // Two-approver rule: the person who approved Stage 1 can NEVER approve Stage 2
        if (!isStage1Approver) {
          if (isOfficer) {
            canDecideCurrentStage = true;
          } else if (isDeptHead) {
            // Must be the receiving department head
            canDecideCurrentStage = !destDeptName || !userDeptName || userDeptName === destDeptName;
          }
        }
      }
    } else {
      // Non-transfer requests (e.g. DISPOSAL)
      if (isOfficer) {
        canDecideCurrentStage = true;
      }
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900">
          {request.type === "TRANSFER" ? "Transfer request" : "Disposal request"}
        </h1>
        <div className="flex items-center gap-2">
          <RequestTypeBadge type={request.type} />
          <RequestStatusBadge status={request.status} />
        </div>
      </div>

      <Card>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Item">
            <Link to={`/items/${request.item.id}?tag=${encodeURIComponent(request.item.tagId)}`} className="text-brand-700 underline-offset-4 hover:underline">
              {request.item.name}
            </Link>
            <span className="tag-id ml-2 text-xs text-slate-500">{request.item.tagId}</span>
          </Detail>
          <Detail label="Requested by">
            {request.requestedBy.fullName} ({request.requestedBy.email})
          </Detail>
          <Detail label="Filed">
            <span title={formatDateTimeUTC(request.createdAt) ?? undefined}>{formatRelativeTime(request.createdAt)}</span>
          </Detail>
          {request.decidedAt && (
            <Detail label="Decided">
              <span title={formatDateTimeUTC(request.decidedAt) ?? undefined}>{formatRelativeTime(request.decidedAt)}</span>
            </Detail>
          )}
          {request.reviewedBy && <Detail label="Reviewed by">{request.reviewedBy.fullName}</Detail>}
          {request.stage1ApprovedBy && (
            <Detail label="Stage 1 approved by">
              {request.stage1ApprovedBy.fullName}
              {request.stage1ApprovedAt && (
                <span className="ml-1 text-xs text-slate-500">
                  ({formatRelativeTime(request.stage1ApprovedAt)})
                </span>
              )}
            </Detail>
          )}
          {request.stage2ApprovedBy && (
            <Detail label="Stage 2 approved by">
              {request.stage2ApprovedBy.fullName}
              {request.stage2ApprovedAt && (
                <span className="ml-1 text-xs text-slate-500">
                  ({formatRelativeTime(request.stage2ApprovedAt)})
                </span>
              )}
            </Detail>
          )}
          {request.newLocationDepartment && (
            <Detail label="Proposed department">{request.newLocationDepartment}</Detail>
          )}
          {(request.newLocationBuilding || request.newLocationFloor || request.newLocationRoom) && (
            <Detail label="Proposed location">
              {[request.newLocationBuilding, request.newLocationFloor, request.newLocationRoom].filter(Boolean).join(" · ")}
            </Detail>
          )}
          {request.newOwnerId && (
            <Detail label="Proposed custodian">
              {proposedRecipient
                ? `${proposedRecipient.fullName} (${proposedRecipient.email})`
                : request.newOwnerId}
            </Detail>
          )}
        </dl>

        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Reason</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{request.reason}</p>
        </div>

        {request.rejectionReason && (
          <div className="mt-4 rounded-md bg-danger-50 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-danger-500">Rejection reason</p>
            <p className="mt-1 text-sm text-danger-700">{request.rejectionReason}</p>
          </div>
        )}
      </Card>

      {request.status === "PENDING_STAGE2" && (
        <Card className="border-blue-200 bg-blue-50/70">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold text-blue-900">
                {isStage1Approver
                  ? "Stage 1 Approved by You (Releasing Department)"
                  : "Stage 1 Approved (Releasing Department)"}
              </h3>
              <p className="mt-1 text-sm text-blue-700">
                {isStage1Approver
                  ? `You have approved the release of this item. This request is now waiting for Stage 2 approval from the ${request.newLocationDepartment ?? "receiving"} department head.`
                  : request.stage1ApprovedBy
                    ? `Releasing approval granted by ${request.stage1ApprovedBy.fullName}. Awaiting Stage 2 approval from the ${request.newLocationDepartment ?? "receiving"} department head.`
                    : `Releasing approval granted. Awaiting Stage 2 approval from the ${request.newLocationDepartment ?? "receiving"} department head.`}
              </p>
            </div>
          </div>
        </Card>
      )}

      {(request.status === "PENDING" || request.status === "PENDING_STAGE1") &&
        request.type === "TRANSFER" &&
        !canDecideCurrentStage &&
        !isOwnRequest && (
          <Card className="border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-600">
              Awaiting Stage 1 approval from the {request.item.department ?? "releasing"} department head.
            </p>
          </Card>
        )}

      {canDecideCurrentStage && (
        <DecisionPanel
          requestId={request.id}
          itemLabel={`${request.item.name} (${request.item.tagId})`}
          onDecisionComplete={setDecisionResult}
        />
      )}

      {canWithdraw && (
        <WithdrawPanel
          requestId={request.id}
          itemLabel={`${request.item.name} (${request.item.tagId})`}
        />
      )}

      {decisionResult && (
        <Card className="border-brand-200 bg-brand-50">
          <h3 className="text-sm font-semibold text-brand-900">What changed</h3>
          <p className="mt-2 text-sm text-brand-700">
            {decisionResult.editLogRowCount} change{decisionResult.editLogRowCount === 1 ? "" : "s"} written to item history.
            {decisionResult.cascadedItemIds.length > 0 && (
              <> {decisionResult.cascadedItemIds.length} accessorie{decisionResult.cascadedItemIds.length === 1 ? "y" : "s"} updated.</>
            )}
          </p>
        </Card>
      )}

      {isUnclaimedApproved && (
        <Card className={canClaimItem ? "border-emerald-300 bg-emerald-50/80 shadow-sm" : "border-blue-200 bg-blue-50/70"}>
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2
                className={`mt-0.5 h-5 w-5 shrink-0 ${canClaimItem ? "text-emerald-600" : "text-blue-600"}`}
                aria-hidden="true"
              />
              <div>
                <h3 className={`text-base font-semibold ${canClaimItem ? "text-emerald-950" : "text-blue-900"}`}>
                  {canClaimItem
                    ? "Transfer Approved — Ready for Your Acceptance"
                    : "Transfer Approved — Awaiting Custody Acceptance"}
                </h3>
                <p className={`mt-1 text-sm leading-relaxed ${canClaimItem ? "text-emerald-800" : "text-blue-700"}`}>
                  {canClaimItem
                    ? `The transfer of "${request.item.name}" (${request.item.tagId}) to you has been approved by the department head. Please verify and claim custody to activate this item in your inventory.`
                    : `This transfer was approved by ${request.stage2ApprovedBy?.fullName ?? request.reviewedBy?.fullName ?? "the receiving department head"}. The item is waiting for ${proposedRecipient?.fullName ?? "the recipient"} to accept custody.`}
                </p>
              </div>
            </div>

            {canClaimItem && (
              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-emerald-200/60 pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRefuseDialogOpen(true)}
                  disabled={claimMutation.isPending || refuseMutation.isPending}
                >
                  Refuse item
                </Button>
                <Button
                  size="sm"
                  onClick={handleClaimItem}
                  loading={claimMutation.isPending}
                  leftIcon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                >
                  Accept custody / Claim item
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}

      {request.status === "APPROVED" && request.item.status === "ACTIVE" && request.newOwnerId === user?.id && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
              <span className="text-sm font-medium">You have accepted custody of this item. It is active in your inventory.</span>
            </div>
            <Link to={`/items/${request.item.id}?tag=${encodeURIComponent(request.item.tagId)}`}>
              <Button size="sm" variant="outline">
                View item
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {isPending && !canDecideCurrentStage && (
        <p className="text-sm text-slate-500">
          Waiting for review. You'll get an in-app notification when it's decided.
        </p>
      )}
      {decided && !isUnclaimedApproved && (
        <p className="text-sm text-slate-500">
          This request was {REQUEST_STATUS_LABELS[request.status]?.toLowerCase() ?? request.status.toLowerCase()} — decided requests can't be re-decided.
        </p>
      )}

      <RefuseClaimDialog
        open={refuseDialogOpen}
        onClose={() => setRefuseDialogOpen(false)}
        onSubmit={handleRefuseItem}
        loading={refuseMutation.isPending}
        itemLabel={`${request.item.name} (${request.item.tagId})`}
      />
    </div>
  );
}

function DecisionPanel({ requestId, itemLabel, onDecisionComplete }: { requestId: string; itemLabel: string; onDecisionComplete: (result: DecideRequestResponse) => void }) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const decide = useDecideRequest(requestId);

  const handleApprove = () => {
    decide.mutate({ decision: "APPROVED" }, {
      onSuccess: (data) => {
        setApproveOpen(false);
        onDecisionComplete(data);
      },
    });
  };

  const handleReject = (reason: string) => {
    decide.mutate({ decision: "REJECTED", rejectionReason: reason }, {
      onSuccess: (data) => {
        setRejectOpen(false);
        onDecisionComplete(data);
      },
    });
  };

  return (
    <>
      <Card className="flex flex-wrap justify-end gap-3">
        <Button variant="destructive" onClick={() => setRejectOpen(true)} loading={decide.isPending}>
          Reject
        </Button>
        <Button onClick={() => setApproveOpen(true)} loading={decide.isPending}>
          Approve
        </Button>
      </Card>

      <ConfirmDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        onConfirm={handleApprove}
        title="Approve this request?"
        loading={decide.isPending}
        confirmLabel="Approve"
        body={
          <>
            This will apply the requested change to <strong>{itemLabel}</strong> immediately, write the change to
            the item's history, and notify the requester. Transfer approvals move the item (and any linked
            accessories) to the proposed location/owner; disposal approvals permanently retire it. This can't be
            undone.
          </>
        }
      />

      <RejectDialog
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onSubmit={handleReject}
        loading={decide.isPending}
        itemLabel={itemLabel}
      />
    </>
  );
}

function WithdrawPanel({ requestId, itemLabel }: { requestId: string; itemLabel: string }) {
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [reason, setReason] = useState("");
  const withdraw = useWithdrawRequest(requestId);

  const handleWithdraw = () => {
    const trimmedReason = reason.trim();
    withdraw.mutate(trimmedReason ? { reason: trimmedReason } : {}, {
      onSuccess: () => {
        setWithdrawOpen(false);
        setReason("");
      },
    });
  };

  return (
    <>
      <Card className="flex justify-end">
        <Button variant="outline" onClick={() => setWithdrawOpen(true)} loading={withdraw.isPending}>
          Withdraw Request
        </Button>
      </Card>

      <Modal open={withdrawOpen} onClose={() => setWithdrawOpen(false)} title="Withdraw this request?">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            This will cancel your request for <strong>{itemLabel}</strong>. The reviewers will be notified that you've withdrawn it.
          </p>
          <Textarea
            label="Reason (optional)"
            hint="Explain why you're withdrawing this request."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setWithdrawOpen(false)} disabled={withdraw.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              loading={withdraw.isPending}
              onClick={handleWithdraw}
            >
              Withdraw
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Rejection requires a 3–500 char reason — the dialog cannot submit empty. */
function RejectDialog({
  open,
  onClose,
  onSubmit,
  loading,
  itemLabel,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  loading: boolean;
  itemLabel: string;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 500;

  return (
    <Modal open={open} onClose={onClose} title="Reject this request?">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          <strong>{itemLabel}</strong> will stay exactly as it is. The requester is notified in-app with your
          reason.
        </p>
        <Textarea
          label="Rejection reason (required)"
          hint="3–500 characters — shown to the requester verbatim."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={trimmed.length > 0 && trimmed.length < 3 ? "At least 3 characters." : undefined}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!valid}
            loading={loading}
            onClick={() => onSubmit(trimmed)}
          >
            Reject request
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RefuseClaimDialog({
  open,
  onClose,
  onSubmit,
  loading,
  itemLabel,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  loading: boolean;
  itemLabel: string;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 500;

  return (
    <Modal open={open} onClose={onClose} title="Refuse custody of this item?">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          If you cannot accept <strong>{itemLabel}</strong>, it will revert to the college pool. The property officer and reviewers will see your reason.
        </p>
        <Textarea
          label="Refusal reason (required)"
          hint="3–500 characters."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={trimmed.length > 0 && trimmed.length < 3 ? "At least 3 characters." : undefined}
          required
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!valid}
            loading={loading}
            onClick={() => onSubmit(trimmed)}
          >
            Refuse custody
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

/** Imported lazily below to keep the icon import list tidy. */
function SearchXIfNeeded() {
  return null;
}
