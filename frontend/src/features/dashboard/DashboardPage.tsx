import { ClipboardList, Package, ScanLine } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { PortalPageHeader, PortalTile } from "../../components/aau/PortalPageHeader";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { SkeletonText } from "../../components/Skeleton";
import { RequestStatusBadge, RequestTypeBadge } from "../../components/StatusBadges";
import { StatCard } from "../../components/StatCard";
import { usePendingCount, useRequests, usePendingRequests } from "../../hooks/useRequests";
import { formatRelativeTime } from "../../lib/formatters";
import {
  canDecideRequests,
  canViewOwnRequests,
  canManageAccounts,
  canRunAudits,
  seesAssetData,
} from "../../lib/permissions";
import { NetworkError } from "../../types/api";
import { OverdueLoans } from "./widgets/OverdueLoans";
import { RecentlyRegisteredItems } from "./widgets/RecentlyRegisteredItems";
import { HeldItems } from "./widgets/HeldItems";
import { DepartmentRoster } from "./widgets/DepartmentRoster";
import { CurrentAuditProgress } from "./widgets/CurrentAuditProgress";
import { OpenFindings } from "./widgets/OpenFindings";
import { AuditHistoryQuickList } from "./widgets/AuditHistoryQuickList";
import { SystemStatus } from "./widgets/SystemStatus";
import { RecentSystemEvents } from "./widgets/RecentSystemEvents";

/**
 * `/dashboard` \u2014 Shell B/C, Staff/Admin (F1.3), frontend-design-system.md \u00a710.4.
 *
 * Two viewer variants, one component: admins see the review queue and "Pending
 * review"; staff see their own filings and "Pending requests". The distinction
 * is server-side too (the backend scopes `GET /requests` by role), so this only
 * changes wording, never which rows are fetched.
 *
 * Deliberately **one** StatCard. The design doc's "Items tracked" / "Audits run"
 * cards need an aggregate the Phase 2 backend doesn't expose yet (there is no
 * audits endpoint until Phase 3, and `GET /items`'s total counts only active
 * items \u2014 a number a user would misread as "all items"). Rather than ship a
 * stat with fuzzy meaning, this shows the one number the backend answers
 * precisely. Phase 3 adds the rest.
 */

export function DashboardPage() {
  const { user } = useAuth();
  const canDecide = canDecideRequests(user?.role);
  const canViewOwn = canViewOwnRequests(user?.role);
  const isSystemAdmin = user?.role === "SYSTEM_ADMIN";
  const canManageAcc = canManageAccounts(user?.role);
  const isAuditor = canRunAudits(user?.role);

  const pendingQuery = usePendingCount();
  // For "Needs your review", use the same logic as pending-count: pendingForUser (no date window)
  const needsReviewQuery = usePendingRequests(5);
  const requestsQuery = useRequests({ limit: 5 });

  // Property Officers see pending requests they can decide; others see their own recent requests
  const activeQuery = canDecide ? needsReviewQuery : requestsQuery;

  return (
    <div className="flex flex-col gap-6">
      {/* The portal's own page banner. The heading text stays exactly "Dashboard"
          because that is the route-level landmark the flow tests assert on. */}
      <PortalPageHeader
        title="Dashboard"
        description={`Welcome back${user ? `, ${user.fullName.split(" ")[0]}` : ""} \u2014 here's where things stand.`}
        actions={
          canDecide ? (
            <StatCard
              label="Pending review"
              value={pendingQuery.data?.pendingCount ?? "\u2014"}
              icon={<ClipboardList className="h-5 w-5" />}
              tone="warning"
              to="/requests?status=PENDING"
              className="w-52"
            />
          ) : null
        }
      />

      {/*
        The portal's action tiles, doing the portal's job: the two things a staff
        member arrives on this screen to do.

        Gated by `seesAssetData`, not the `!isAuditor` this used to be. "Not an
        auditor" admits the SYSTEM_ADMIN, which is an account role and must render
        **no asset UI at all** (spec 2.1.1) — so its dashboard showed "Scan a tag"
        and "Browse items", both of which lead to asset screens it can only read
        as empty. Auditors stay excluded: their dashboard is the audit tiles below,
        and browsing items is not a step in an audit here. `seesAssetData` is the
        shared predicate every asset-UI call site now reaches for, so this is
        stated once instead of re-derived per tile. */}
      {seesAssetData(user?.role) && !isAuditor && (
        <div className="grid gap-4 sm:grid-cols-2">
          <PortalTile
            to="/scan"
            icon={<ScanLine className="h-7 w-7" />}
            title="Scan a tag"
            description="Point the camera at a QR tag to open its record or count it in an audit."
          />
          <PortalTile
            to="/items"
            icon={<Package className="h-7 w-7" />}
            title="Browse items"
            description="Search the register by name, tag ID, department or building."
          />
        </div>
      )}

      {/* DEPARTMENT_HEAD specific widgets */}
      {user?.role === "DEPARTMENT_HEAD" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <HeldItems />
          <DepartmentRoster />
        </div>
      )}

      {/* AUDITOR specific widgets */}
      {isAuditor && (
        <div className="grid gap-4 sm:grid-cols-2">
          <CurrentAuditProgress />
          <OpenFindings />
        </div>
      )}

      {/* AUDITOR: Audit history quick list (full width) */}
      {isAuditor && (
        <AuditHistoryQuickList />
      )}

      {/* SYSTEM_ADMIN specific widgets */}
      {isSystemAdmin && canManageAcc && (
        <div className="grid gap-4 sm:grid-cols-2">
          <SystemStatus />
          <RecentSystemEvents />
        </div>
      )}

      {canViewOwn && (
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">
                {canDecide ? "Needs your review" : "Your recent requests"}
              </h2>
              <Link
                to="/requests?status=PENDING"
                className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
              >
                View all →
              </Link>
            </div>

            {activeQuery.isPending ? (
              <div role="status" aria-label="Loading requests">
                <SkeletonText lines={3} />
              </div>
            ) : activeQuery.isError ? (
              activeQuery.error instanceof NetworkError ? (
                <OfflineState />
              ) : (
                <ErrorState
                  heading="Couldn't load requests"
                  body={activeQuery.error instanceof Error ? activeQuery.error.message : undefined}
                  action={
                    <Button size="sm" onClick={() => activeQuery.refetch()}>
                      Try again
                    </Button>
                  }
                />
              )
            ) : activeQuery.data.requests.length === 0 ? (
              <EmptyState
                icon={<ClipboardList className="h-8 w-8" />}
                heading={canDecide ? "No pending requests" : "You haven't filed any requests yet"}
                body={
                  canDecide
                    ? "Pending requests will appear here for review."
                    : "Requests you file will appear here with their review status."
                }
              />
            ) : (
              <ul className="flex flex-col divide-y divide-slate-200">
                {activeQuery.data.requests.map((request) => (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                  >
                    <Link
                      to={`/requests/${request.id}`}
                      className="min-w-0 flex-1 hover:text-brand-700 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <RequestTypeBadge type={request.type} />
                        <p className="font-medium text-slate-900">{request.item.name}</p>
                        <p className="tag-id text-xs text-slate-500">{request.item.tagId}</p>
                      </div>
                    </Link>
                    <div className="flex flex-wrap items-center gap-2">
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

          {/* The Property Officer's two operational tiles. `OverdueLoans`
              was written, wired to a hook and an API function, and then never
              rendered — the whole chain existed and nothing reached it. */}
          {user?.role === "PROPERTY_OFFICER" && (
            <>
              <OverdueLoans />
              <RecentlyRegisteredItems />
            </>
          )}
        </div>
      )}
    </div>
  );
}
