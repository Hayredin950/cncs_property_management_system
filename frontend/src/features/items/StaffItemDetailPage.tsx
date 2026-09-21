import { ArrowLeft, PackageSearch } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { ItemDetailView } from "../../components/ItemDetailView";
import { Skeleton, SkeletonText } from "../../components/Skeleton";
import { TagPanel } from "../../components/TagPanel";
import { useItemByTagId } from "../../hooks/useItems";
import { ApiError, NetworkError } from "../../types/api";

/**
 * `/items/:id` — Staff/Admin item detail (F3.4 tag image in Phase 1;
 * accessories/history/regenerate are Phase 2, `frontend-design-system.md` §10.6).
 *
 * **Why this reads `tagId` from router state:** there is no `GET /items/:id` in
 * the built backend — items are addressed publicly only by tag ID
 * (`GET /items/:tagId`, see `backend/src/routes/items.ts`). The route param is
 * the UUID so future staff-only sub-routes (`/items/:id/edit`, `/items/:id/history`)
 * line up, but the *data* must be fetched by tag. The "View staff detail & tag"
 * link on `/item/:tagId` therefore passes the tag through `location.state`.
 *
 * A cold load or refresh (state is gone) has nothing to fetch from, so it lands
 * on a designed explanation rather than a spinner that never resolves. This is a
 * real spec-vs-backend gap, recorded as G10 in docs/frontend-phase-1.md.
 */
export function StaffItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const state = location.state as { tagId?: string } | null;
  const tagId = state?.tagId;

  const query = useItemByTagId(tagId);

  if (!tagId) {
    return (
      <ErrorState
        tone="neutral"
        icon={<PackageSearch className="h-8 w-8" />}
        heading="Open this item from the register"
        body="The staff detail view loads through an item's tag. Open it from the item's page so the tag is available."
        action={
          <Link to="/items">
            <Button size="sm" variant="outline">
              Browse items
            </Button>
          </Link>
        }
      />
    );
  }

  if (query.isPending) {
    return (
      <div className="grid gap-8 lg:grid-cols-[320px_1fr]" role="status" aria-label="Loading item">
        <Skeleton className="aspect-[4/3] w-full" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-2/3" />
          <SkeletonText lines={3} />
        </div>
      </div>
    );
  }

  if (query.isError) {
    const error = query.error;
    if (error instanceof NetworkError) return <OfflineState />;
    if (error instanceof ApiError && error.status === 404) {
      return (
        <ErrorState
          heading="Tag not found"
          body={`We couldn't find an item for tag "${tagId}".`}
          action={
            <Link to="/items">
              <Button size="sm" variant="outline">
                Browse items
              </Button>
            </Link>
          }
        />
      );
    }
    return (
      <ErrorState
        heading="Couldn't load this item"
        body={error instanceof Error ? error.message : undefined}
        action={
          <Button size="sm" onClick={() => query.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const item = query.data;

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={`/item/${item.tagId}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Public view
      </Link>

      <ItemDetailView item={item} />

      <div className="border-t border-slate-200 pt-6">
        <TagPanel itemId={item.id} tagId={item.tagId} itemName={item.name} />
      </div>

      {/* `id` is only used to key the route today; Phase 2's edit/history links
          will build on it. Referenced here so the unused-param lint rule and a
          future reader both see it was intentional. */}
      <p className="text-xs text-slate-400">Item ID {id}</p>
    </div>
  );
}
