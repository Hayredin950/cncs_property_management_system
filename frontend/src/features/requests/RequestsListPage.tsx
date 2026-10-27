import { ClipboardList, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { canDecideRequests, reviewQueueStatuses } from "../../lib/permissions";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { Input } from "../../components/Input";
import { Select } from "../../components/Select";
import { SkeletonText } from "../../components/Skeleton";
import { RequestStatusBadge, RequestTypeBadge } from "../../components/StatusBadges";
import { useRequests } from "../../hooks/useRequests";
import { formatRelativeTime } from "../../lib/formatters";
import { NetworkError } from "../../types/api";
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS, REQUEST_TYPES, REQUEST_TYPE_LABELS, type RequestStatus, type RequestType } from "../../types/enums";
import type { RequestStatusFilter } from "../../types/request";
import { useDepartments } from "../../hooks/useDepartments";
import type { Department } from "../../api/departments";

const SINGLE_STATUS_OPTIONS = REQUEST_STATUSES.map((status) => ({
  value: status,
  label: REQUEST_STATUS_LABELS[status],
}));

/**
 * A status filter may be one status or a comma-separated set. Anything else is
 * dropped rather than sent to the API to fail — the URL is user-editable.
 */
function parseStatusFilter(raw: string): RequestStatusFilter | undefined {
  if (!raw || raw === "ALL") return undefined;
  const parts = raw.split(",").filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts.every((part) => REQUEST_STATUSES.includes(part as RequestStatus))
    ? (raw as RequestStatusFilter)
    : undefined;
}

const TYPE_OPTIONS = [
  { value: "ALL", label: "All types" },
  ...REQUEST_TYPES.map((type) => ({
    value: type,
    label: REQUEST_TYPE_LABELS[type],
  })),
];

const WINDOW_OPTIONS = [
  { value: "none", label: "All time" },
  { value: "this-week", label: "This week" },
  { value: "this-month", label: "This month" },
  { value: "last-30-days", label: "Last 30 days" },
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
  const status = parseStatusFilter(rawStatus);
  // The same set the dashboard tile counts. `undefined` for a staff member, who
  // has no review queue.
  const reviewStatuses = reviewQueueStatuses(user?.role);
  // "Needs review" first, because it is the dashboard's hand-off; the single
  // statuses stay for narrowing after a reviewer has landed here.
  const statusOptions = [
    { value: "ALL", label: "All statuses" },
    ...(reviewStatuses ? [{ value: reviewStatuses, label: "Needs review" }] : []),
    ...SINGLE_STATUS_OPTIONS,
  ];

  const rawType = searchParams.get("type") ?? "ALL";
  const type =
    rawType === "ALL"
      ? undefined
      : REQUEST_TYPES.includes(rawType as RequestType)
        ? (rawType as RequestType)
        : undefined;

  const rawDepartmentId = searchParams.get("departmentId");
  const departmentId = rawDepartmentId || undefined;

  const rawWindow = searchParams.get("window") ?? "none";
  const window =
    rawWindow === "ALL" || rawWindow === "none"
      ? undefined
      : ["this-week", "this-month", "last-30-days", "custom"].includes(rawWindow)
        ? (rawWindow as "this-week" | "this-month" | "last-30-days" | "custom")
        : undefined;

  const searchQuery = searchParams.get("search") || "";
  const dateFrom = searchParams.get("dateFrom") || "";
  const dateTo = searchParams.get("dateTo") || "";

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
    ...(type ? { type } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(window ? { window } : {}),
    ...(searchQuery ? { search: searchQuery } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    limit: 20,
  });

  function updateStatus(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value && value !== "ALL") {
        next.set("status", value);
        // When a specific status is selected, show all time by default
        next.delete("window");
      } else {
        next.delete("status");
      }
      return next;
    });
  }

  function updateType(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value && value !== "ALL") next.set("type", value);
      else next.delete("type");
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

  function updateWindow(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value && value !== "none") next.set("window", value);
      else next.delete("window");
      return next;
    });
  }

  function updateSearch(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("search", value);
      else next.delete("search");
      return next;
    });
  }

  function updateDateFrom(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("dateFrom", value);
      else next.delete("dateFrom");
      return next;
    });
  }

  function updateDateTo(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set("dateTo", value);
      else next.delete("dateTo");
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Requests</h1>
          <p className="mt-1 text-sm text-slate-500">
            {canDecide
              ? "All transfer, disposal and loan requests."
              : "Transfers, disposals and loans you've filed."}
          </p>
        </div>
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end">
          {canDecide && reviewStatuses && (
            <button
              onClick={() => updateStatus(reviewStatuses)}
              className={`text-sm font-medium transition-colors ${
                status === reviewStatuses
                  ? "text-brand-600"
                  : "text-slate-600 hover:text-brand-600"
              }`}
            >
              Needs review
            </button>
          )}
          <Select
            label="Status"
            options={statusOptions}
            value={rawStatus ?? "ALL"}
            onChange={(event) => updateStatus(event.target.value)}
            className="sm:w-40"
          />
          <Select
            label="Type"
            options={TYPE_OPTIONS}
            value={rawType ?? "ALL"}
            onChange={(event) => updateType(event.target.value)}
            className="sm:w-40"
          />
          <Select
            label="Department"
            options={departmentOptions}
            value={rawDepartmentId ?? ""}
            onChange={(event) => updateDepartment(event.target.value)}
            className="sm:w-40"
          />
          <Select
            label="Time range"
            options={WINDOW_OPTIONS}
            value={rawWindow ?? "none"}
            onChange={(event) => updateWindow(event.target.value)}
            className="sm:w-40"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
        <div className="flex-1">
          <Input
            label="Search"
            value={searchQuery}
            onChange={(event) => updateSearch(event.target.value)}
            leadingIcon={<Search className="h-4 w-4" />}
          />
        </div>
        <Input
          label="From date"
          type="date"
          value={dateFrom}
          onChange={(event) => updateDateFrom(event.target.value)}
          className="sm:w-40"
        />
        <Input
          label="To date"
          type="date"
          value={dateTo}
          onChange={(event) => updateDateTo(event.target.value)}
          className="sm:w-40"
        />
      </div>

      {requestsQuery.isPending ? (
        <div role="status" aria-label="Loading requests">
          <SkeletonText lines={5} />
        </div>
      ) : requestsQuery.isError ? (
        requestsQuery.error instanceof NetworkError ? (
          <OfflineState onRetry={() => requestsQuery.refetch()} />
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
                className="flex flex-col items-stretch gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="truncate font-semibold text-slate-900">{request.item.name}</p>
                  <p className="tag-id text-xs text-slate-500">{request.item.tagId}</p>
                  {/* Which department the item belongs to. A request that
                      crossed departments is decided by two people in two
                      departments, and neither could see which. */}
                  {request.item.department && (
                    <p className="truncate text-xs text-slate-500">{request.item.department}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <RequestTypeBadge type={request.type} />
                  <RequestStatusBadge status={request.status} />
                </div>
                {/* A fixed 12rem column does not fit a phone: the row
                    overflowed by 94px at 390px wide and the page scrolled
                    sideways. The column now gives up its width on a small
                    screen and stacks under the row instead. */}
                <div className="text-right w-full shrink-0 sm:w-48">
                  <p className="line-clamp-1 text-sm text-slate-600 truncate">{request.reason}</p>
                  <p className="text-xs text-slate-400">
                    {request.requestedBy.fullName} · {formatRelativeTime(request.createdAt)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
