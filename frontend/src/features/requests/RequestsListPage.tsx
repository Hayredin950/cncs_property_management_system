import { ClipboardList } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { canDecideRequests } from "../../lib/permissions";
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
import { useDepartments } from "../../hooks/useDepartments";
import type { Department } from "../../api/departments";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  ...REQUEST_STATUSES.map((status) => ({
    value: status,
    label: REQUEST_STATUS_LABELS[status],
  })),
];

/**
 * `/requests` — Shell B/C (SRS F6/F7, frontend-design-system.md
 * §10.7). Staff see their own filings, the reviewing roles see the queue — the
 * split comes from the API, not from a client-side branch.
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
  const canDecide = canDecideRequests(user?.role);
  const [searchParams, setSearchParams] = useSearchParams();

  const rawStatus = searchParams.get("status") ?? "ALL";
  const status =
    rawStatus === "ALL"
      ? undefined
      : REQUEST_STATUSES.includes(rawStatus as RequestStatus)
        ? (rawStatus as RequestStatus)
        : undefined;

  const rawDepartmentId = searchParams.get("departmentId");
  const departmentId = rawDepartmentId || undefined;

  const { data: departments } = useDepartments();
  const departmentOptions = [
    { value: "", label: "All departments" },
    ...(departments || []).map((d: Department) => ({
      value: d.id,
      label: d.name,
    })),
  ];

  const requestsQuery = useRequests({
    ...(status ? { status } : {}),
    ...(departmentId ? { departmentId } : {}),
    limit: 20,
  });

  function updateStatus(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value && value !== "ALL") next.set("status", value);
      else next.delete("status");
      return next;
    });
  }

  function updateDepartment(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("departmentId", value);
      else next.delete("departmentId");
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Requests</h1>
          <p className="mt-1 text-sm text-slate-500">
            {canDecide
              ? "All transfer, disposal and loan requests."
              : "Transfers, disposals and loans you've filed."}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          {canDecide && (
            <button
              onClick={() => updateStatus("PENDING")}
              className={`text-sm font-medium transition-colors ${
                status === "PENDING"
                  ? "text-brand-600"
                  : "text-slate-600 hover:text-brand-600"
              }`}
            >
              Pending review
            </button>
          )}
          <Select
            label="Status"
            options={STATUS_OPTIONS}
            value={rawStatus ?? "ALL"}
            onChange={(event) => updateStatus(event.target.value)}
            className="sm:w-48"
          />
          <Select
            label="Department"
            options={departmentOptions}
            placeholder="All departments"
            value={rawDepartmentId ?? ""}
            onChange={(event) => updateDepartment(event.target.value)}
            className="sm:w-48"
          />
        </div>
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
          heading={status || canDecide ? "No requests match this filter" : "You haven't filed any requests yet"}
          body={
            status
              ? "Try a different status."
              : "Requests filed from an item's page will show up here."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {requestsQuery.data.requests.map((request) => (
            <li key={request.id}>
              <Link
                to={`/requests/${request.id}`}
                className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
