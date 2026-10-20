import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { Input } from "../../components/Input";
import { Modal } from "../../components/Modal";
import { Skeleton, SkeletonText } from "../../components/Skeleton";
import { RequestStatusBadge, RequestTypeBadge } from "../../components/StatusBadges";
import { Textarea } from "../../components/Textarea";
import { fetchRequestById } from "../../api/requests";
import {
  useConfirmLoanReturn,
  useDisputeLoanReturn,
  useInitiateLoanReturn,
} from "../../hooks/useAuthMutations";
import { useDecideRequest, useWithdrawRequest } from "../../hooks/useRequestMutations";
import { canDecideRequests } from "../../lib/permissions";
import { formatDateTimeUTC, formatRelativeTime } from "../../lib/formatters";
import { ApiError, NetworkError } from "../../types/api";
import { REQUEST_STATUS_LABELS } from "../../types/enums";
import type { DecideRequestResponse, RequestDetail } from "../../types/request";

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
  const decided = ["APPROVED", "REJECTED", "WITHDRAWN", "INVALIDATED"].includes(request.status);
  const isOwnRequest = user?.id === request.requestedBy.id;

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

          {/* Stage indicator for transfers */}
          {request.type === "TRANSFER" && (
            <>
              {request.status === "PENDING_STAGE1" && (
                <Detail label="Stage">
                  <span className="text-brand-600 font-medium">Stage 1 - Releasing head approval</span>
                </Detail>
              )}
              {request.status === "PENDING_STAGE2" && (
                <Detail label="Stage">
                  <span className="text-brand-600 font-medium">Stage 2 - Receiving head approval</span>
                </Detail>
              )}
            </>
          )}

          {/* From/To holder */}
          {(request.fromHolderType || request.toHolderType) && (
            <Detail label="Custody change">
              <div className="text-sm">
                {request.fromHolderType && (
                  <span className="text-slate-600">
                    From: {request.fromHolderType === "USER" ? "Individual" : request.fromHolderType}
                    {request.fromHolderId && ` (${request.fromHolderId.slice(0, 8)}...)`}
                  </span>
                )}
                {request.fromHolderType && request.toHolderType && <span className="mx-2">→</span>}
                {request.toHolderType && (
                  <span className="text-slate-600">
                    To: {request.toHolderType === "USER" ? "Individual" : request.toHolderType}
                    {request.toHolderId && ` (${request.toHolderId.slice(0, 8)}...)`}
                  </span>
                )}
              </div>
            </Detail>
          )}

          {/* Approval timeline */}
          {request.reviewedBy && (
            <Detail label="Reviewed by">
              {request.reviewedBy.fullName} ({request.reviewedBy.email})
            </Detail>
          )}
          {request.stage1ApprovedBy && (
            <Detail label="Stage 1 approved by">
              {request.stage1ApprovedBy.fullName}
              {request.stage1ApprovedAt && (
                <span className="ml-2 text-xs text-slate-500">
                  ({formatRelativeTime(request.stage1ApprovedAt)})
                </span>
              )}
            </Detail>
          )}
          {request.stage2ApprovedBy && (
            <Detail label="Stage 2 approved by">
              {request.stage2ApprovedBy.fullName}
              {request.stage2ApprovedAt && (
                <span className="ml-2 text-xs text-slate-500">
                  ({formatRelativeTime(request.stage2ApprovedAt)})
                </span>
              )}
            </Detail>
          )}
          {request.decidedAt && (
            <Detail label="Decided">
              <span title={formatDateTimeUTC(request.decidedAt) ?? undefined}>{formatRelativeTime(request.decidedAt)}</span>
            </Detail>
          )}

          {/* Withdrawal info */}
          {request.withdrawnBy && (
            <Detail label="Withdrawn by">
              {request.withdrawnBy.fullName}
              {request.withdrawnAt && (
                <span className="ml-2 text-xs text-slate-500">
                  ({formatRelativeTime(request.withdrawnAt)})
                </span>
              )}
            </Detail>
          )}

          {/* Invalidation info */}
          {request.invalidatedAt && (
            <Detail label="Invalidated">
              <span className="text-danger-600">
                {formatRelativeTime(request.invalidatedAt)}
                {request.invalidatedReason && ` - ${request.invalidatedReason}`}
              </span>
            </Detail>
          )}

          {(request.newLocationBuilding || request.newLocationFloor || request.newLocationRoom) && (
            <Detail label="Proposed location">
              {[request.newLocationBuilding, request.newLocationFloor, request.newLocationRoom].filter(Boolean).join(" · ")}
            </Detail>
          )}
          {request.newOwnerId && <Detail label="Proposed owner ID">{request.newOwnerId}</Detail>}
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

      {canDecide && !decided && (
        <DecisionPanel
          requestId={request.id}
          itemLabel={`${request.item.name} (${request.item.tagId})`}
          stage={request.status === "PENDING_STAGE2" ? 2 : request.status === "PENDING_STAGE1" ? 1 : null}
          onDecisionComplete={setDecisionResult}
        />
      )}

      {request.type === "LOAN" && <LoanReturnPanel request={request} />}

      {isOwnRequest && !decided && !canDecide && <WithdrawPanel requestId={request.id} itemLabel={`${request.item.name} (${request.item.tagId})`} />}

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

      {!canDecide && !decided && (
        <p className="text-sm text-slate-500">
          Waiting for review. You'll get an in-app notification when it's decided.
        </p>
      )}
      {decided && (
        <p className="text-sm text-slate-500">
          This request was {REQUEST_STATUS_LABELS[request.status].toLowerCase()} — decided requests can't be re-decided.
        </p>
      )}
    </div>
  );
}


/**
 * The loan return handshake.
 *
 * A loan is not over when it is approved — it is over when the item is
 * physically back and the lender says so. The three endpoints existed and had
 * no screen: the borrower could not say "I am handing this back", and the
 * lender could not confirm it or report that it had not come back. Without
 * them, a loan's clock simply ran on until the expiry job escalated it.
 *
 * The panel shows the three states of the handshake and offers exactly the
 * action that belongs to the person looking at it:
 *
 *   - the **borrower** initiates the return (the item is in their hands);
 *   - the **lender** confirms it came back, or disputes it — a dispute keeps
 *     the loan open and escalates to the Property Officer, because a lender
 *     who did not get the item back is not the same as a lender who is slow.
 */
function LoanReturnPanel({ request }: { request: RequestDetail }) {
  const { user } = useAuth();
  const [condition, setCondition] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const initiate = useInitiateLoanReturn();
  const confirm = useConfirmLoanReturn();
  const dispute = useDisputeLoanReturn();

  const isBorrower = user?.id === request.requestedById;
  const canDecideReturn = user?.role === "PROPERTY_OFFICER" || user?.role === "DEPARTMENT_HEAD";

  if (request.status === "RETURN_PENDING_CONFIRMATION") {
    return (
      <Card className="flex flex-col gap-3 border-warning-200 bg-warning-50">
        <h3 className="text-sm font-semibold text-slate-900">Waiting for the lender to confirm</h3>
        <p className="text-sm text-slate-600">
          The borrower handed the item back. It stays with the borrower until the lender confirms it
          arrived in the condition it was lent in.
        </p>
        {canDecideReturn && (
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => setConfirmOpen(true)}
              loading={confirm.isPending || dispute.isPending}
            >
              Confirm it came back
            </Button>
            <Button variant="destructive" onClick={() => setDisputeOpen(true)} loading={dispute.isPending}>
              It has not come back
            </Button>
          </div>
        )}
        {!canDecideReturn && (
          <p className="text-sm text-slate-500">
            The Property Officer or the lending department head confirms the return.
          </p>
        )}

        <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm the item came back">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              Confirm the item is back and in the condition it was lent in. The loan closes and the
              item returns to the college pool.
            </p>
            <Input
              label="Condition on return"
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              placeholder="e.g. Good, as lent"
              required
            />
            <Textarea
              label="Notes (optional)"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything worth recording about the return"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={confirm.isPending}
                disabled={!condition.trim()}
                onClick={() =>
                  confirm.mutate(
                    { id: request.id, condition: condition.trim(), notes: notes.trim() || null },
                    { onSuccess: () => setConfirmOpen(false) },
                  )
                }
              >
                Confirm the return
              </Button>
            </div>
          </div>
        </Modal>

        <Modal open={disputeOpen} onClose={() => setDisputeOpen(false)} title="Report that the item has not come back">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              The loan stays open and the Property Officer is notified. Say what is missing — this is
              a record, not a complaint.
            </p>
            <Textarea
              label="What happened"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. The borrower was away and nobody could hand it over"
              required
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDisputeOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                loading={dispute.isPending}
                disabled={!reason.trim()}
                onClick={() =>
                  dispute.mutate(
                    { id: request.id, reason: reason.trim() },
                    { onSuccess: () => setDisputeOpen(false) },
                  )
                }
              >
                Report it
              </Button>
            </div>
          </div>
        </Modal>
      </Card>
    );
  }

  if (request.status === "APPROVED" && request.type === "LOAN" && !request.loanReturnedAt) {
    return (
      <Card className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Hand it back</h3>
        <p className="text-sm text-slate-600">
          {request.loanDueDate
            ? `Due back on ${formatDateTimeUTC(request.loanDueDate) ?? "the due date"}.`
            : "Due back at a date set when the item was claimed."}{" "}
          When you hand the item back, say so here — the lender confirms it arrived.
        </p>
        {isBorrower ? (
          <div>
            <Button onClick={() => initiate.mutate(request.id)} loading={initiate.isPending}>
              I am handing it back
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            The borrower tells the college when the item is on its way back.
          </p>
        )}
      </Card>
    );
  }

  return null;
}

/**
 * The approve / reject panel.
 *
 * `stage` says which stage of a two-stage transfer this is, and it changes
 * what the approver is agreeing to. **Stage 1 does not move the item** — the
 * releasing head is only agreeing to release it; **stage 2 does**, because the
 * receiving head's approval is the handover. One generic "Approve" button with
 * one generic warning made both look identical, and an approver who did not
 * know that was agreeing to something different.
 */
function DecisionPanel({
  requestId,
  itemLabel,
  stage,
  onDecisionComplete,
}: {
  requestId: string;
  itemLabel: string;
  stage: 1 | 2 | null;
  onDecisionComplete: (result: DecideRequestResponse) => void;
}) {
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
          {stage === 1 ? "Approve stage 1 (release)" : stage === 2 ? "Approve stage 2 (handover)" : "Approve"}
        </Button>
      </Card>

      <ConfirmDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        onConfirm={handleApprove}
        title={
          stage === 1
            ? "Approve stage 1 — release this item?"
            : stage === 2
              ? "Approve stage 2 — hand this item over?"
              : "Approve this request?"
        }
        loading={decide.isPending}
        confirmLabel={stage === 1 ? "Approve stage 1" : stage === 2 ? "Approve stage 2" : "Approve"}
        body={
          stage === 1 ? (
            <>
              You are the <strong>releasing</strong> side. Approving stage 1 does <strong>not</strong> move
              the item — it records that you release it, and the request passes to the receiving head, who
              completes the handover. The change is written to the item&apos;s history and the requester is
              notified.
            </>
          ) : stage === 2 ? (
            <>
              You are the <strong>receiving</strong> side. Approving stage 2 <strong>moves</strong>{" "}
              <strong>{itemLabel}</strong> (and any linked accessories) to the proposed location and holder,
              writes the change to the item&apos;s history, and notifies the requester. The recipient then
              confirms they have the item in person.
            </>
          ) : (
            <>
              This will apply the requested change to <strong>{itemLabel}</strong> immediately, write the
              change to the item&apos;s history, and notify the requester. Transfer approvals move the item
              (and any linked accessories) to the proposed location/owner; disposal approvals permanently
              retire it. This can&apos;t be undone.
            </>
          )
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
