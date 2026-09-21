import { ClipboardList } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { Select } from "../../components/Select";
import { SkeletonText } from "../../components/Skeleton";
import { RequestStatusBadge, RequestTypeBadge } from "../../components/StatusBadges";
import { useRequests } from "../../hooks/useRequests";
import { formatRelativeTime } from "../../lib/formatters";
import { NetworkError } from "../../types/api";
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS, type RequestStatus } from "../../types/enums";

const STATUS_OPTIONS = REQUEST_STATUSES.map((status) => ({
  value: status,
  label: REQUEST_STATUS_LABELS[status],
}));

/**
 * `/requests` — Shell B/C, Staff/Admin (SRS F6/F7, frontend-design-system.md
 * §10.7). Staff see their own filings, admins see the review queue — the split
 * comes from the API, not from a client-side branch.
 *
 * **Phase 2, first slice.** This ships the list + `status` filter. The
 * `ResponsiveList` component and the `/requests/new`, `/requests/:id` routes
 * (file, approve/reject with ConfirmDialogs) are the next slice — so rows are
 * intentionally not links to a detail page that doesn't exist yet. Filter state
 * is URL-synced from the start so adding those routes doesn't mean reworking
 * this screen's state.
 */
export function RequestsListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [searchParams, setSearchParams] = useSearchParams();

  const rawStatus = searchParams.get("status") ?? "";
  const status = REQUEST_STATUSES.includes(rawStatus as RequestStatus)
    ? (rawStatus as RequestStatus)
    : undefined;

  const requestsQuery = useRequests({ ...(status ? { status } : {}), limit: 20 });

  function updateStatus(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("status", value);
      else next.delete("status");
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Requests</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isAdmin
              ? "Transfer and disposal requests awaiting review."
              : "Transfers and disposals you've filed."}
          </p>
        </div>
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          placeholder="All statuses"
          value={status ?? ""}
          onChange={(event) => updateStatus(event.target.value)}
          className="sm:w-48"
        />
      </div>

      {requestsQuery.isPending ? (
        <div role="status" aria-label="Loading requests">
          <SkeletonText lines={5} />
        </div>
      ) : requestsQuery.isError ? (
        requestsQuery.error instanceof NetworkError ? (
          <OfflineState />
        ) : (
          <ErrorState
            heading="Couldn't load requests"
            body={requestsQuery.error instanceof Error ? requestsQuery.error.message : undefined}
            action={
              <Button size="sm" onClick={() => requestsQuery.refetch()}>
                Try again
              </Button>
            }
          />
        )
      ) : requestsQuery.data.requests.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-8 w-8" />}
          heading={status || isAdmin ? "No requests match this filter" : "You haven't filed any requests yet"}
          body={
            status
              ? "Try a different status."
              : "Requests filed from an item's page will show up here."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {requestsQuery.data.requests.map((request) => (
            <li
              key={request.id}
              className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{request.item.name}</p>
                  <p className="tag-id text-xs text-slate-500">{request.item.tagId}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RequestTypeBadge type={request.type} />
                  <RequestStatusBadge status={request.status} />
                </div>
              </div>
              <p className="line-clamp-2 text-sm text-slate-600">{request.reason}</p>
              <p className="text-xs text-slate-400">
                {request.requestedBy.fullName} · {formatRelativeTime(request.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
