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
import { fetchRequestById } from "../../api/requests";
import { useDecideRequest } from "../../hooks/useRequestMutations";
import { formatDateTimeUTC, formatRelativeTime } from "../../lib/formatters";
import { ApiError, NetworkError } from "../../types/api";
import { REQUEST_STATUS_LABELS } from "../../types/enums";

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
  const isAdmin = user?.role === "ADMIN";

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
  const decided = request.status !== "PENDING";

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

      {isAdmin && !decided && <DecisionPanel requestId={request.id} itemLabel={`${request.item.name} (${request.item.tagId})`} />}

      {!isAdmin && !decided && (
        <p className="text-sm text-slate-500">
          Waiting for an admin's review. You'll get an in-app notification when it's decided.
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

function DecisionPanel({ requestId, itemLabel }: { requestId: string; itemLabel: string }) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const decide = useDecideRequest(requestId);

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
        onConfirm={() => decide.mutate({ decision: "APPROVED" }, { onSettled: () => setApproveOpen(false) })}
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
        onSubmit={(reason) => decide.mutate({ decision: "REJECTED", rejectionReason: reason }, { onSettled: () => setRejectOpen(false) })}
        loading={decide.isPending}
        itemLabel={itemLabel}
      />
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
