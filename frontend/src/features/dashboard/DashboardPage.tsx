import { ClipboardList, Package, ScanLine } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { SkeletonText } from "../../components/Skeleton";
import { RequestStatusBadge, RequestTypeBadge } from "../../components/StatusBadges";
import { StatCard } from "../../components/StatCard";
import { usePendingCount, useRequests } from "../../hooks/useRequests";
import { formatRelativeTime } from "../../lib/formatters";
import { NetworkError } from "../../types/api";

/**
 * `/dashboard` — Shell B/C, Staff/Admin (F1.3), frontend-design-system.md §10.4.
 *
 * Two viewer variants, one component: admins see the review queue and "Pending
 * review"; staff see their own filings and "Pending requests". The distinction
 * is server-side too (the backend scopes `GET /requests` by role), so this only
 * changes wording, never which rows are fetched.
 *
 * Deliberately **one** StatCard. The design doc's "Items tracked" / "Audits run"
 * cards need an aggregate the Phase 2 backend doesn't expose yet (there is no
 * audits endpoint until Phase 3, and `GET /items`'s total counts only active
 * items — a number a user would misread as "all items"). Rather than ship a
 * stat with fuzzy meaning, this shows the one number the backend answers
 * precisely. Phase 3 adds the rest.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const pendingQuery = usePendingCount();
  const requestsQuery = useRequests({ limit: 5 });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Welcome back{user ? `, ${user.fullName.split(" ")[0]}` : ""} — here&rsquo;s where things
          stand.
        </p>
      </div>

      <div className="grid gap-4 sm:max-w-xs">
        <StatCard
          label={isAdmin ? "Pending review" : "Pending requests"}
          value={pendingQuery.data?.pendingCount ?? "—"}
          icon={<ClipboardList className="h-5 w-5" />}
          tone="warning"
          to="/requests"
        />
      </div>

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Link to="/scan" className="sm:w-auto">
          <Button
            fullWidth
            className="bg-accent-600 hover:bg-accent-700 focus-visible:ring-accent-600"
            leftIcon={<ScanLine className="h-4 w-4" />}
          >
            Scan a tag
          </Button>
        </Link>
        <Link to="/items" className="sm:w-auto">
          <Button variant="outline" fullWidth leftIcon={<Package className="h-4 w-4" />}>
            Browse items
          </Button>
        </Link>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            {isAdmin ? "Needs your review" : "Your recent requests"}
          </h2>
          <Link
            to="/requests"
            className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            View all →
          </Link>
        </div>

        {requestsQuery.isPending ? (
          <div role="status" aria-label="Loading requests">
            <SkeletonText lines={3} />
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
            heading={isAdmin ? "No requests yet" : "You haven't filed any requests yet"}
            body={
              isAdmin
                ? "Transfer and disposal requests will appear here for review."
                : "Requests you file will appear here with their review status."
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-slate-200">
            {requestsQuery.data.requests.map((request) => (
              <li
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{request.item.name}</p>
                  <p className="tag-id text-xs text-slate-500">{request.item.tagId}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RequestTypeBadge type={request.type} />
                  <RequestStatusBadge status={request.status} />
                  <span className="text-xs text-slate-400">
                    {formatRelativeTime(request.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
