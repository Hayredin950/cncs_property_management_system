import { Archive, QrCode, SearchX } from "lucide-react";
import { useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { Button } from "../../components/Button";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { ItemActions } from "../../components/ItemActions";
import { ItemDetailView } from "../../components/ItemDetailView";
import { Skeleton, SkeletonText } from "../../components/Skeleton";
import { TagPanel } from "../../components/TagPanel";
import { ItemHistorySection } from "../items/ItemHistorySection";
import { useItemByTagId } from "../../hooks/useItems";
import { ApiError, NetworkError } from "../../types/api";

/**
 * `/item/:tagId` — the QR destination (F4, F3.3), a contract per
 * `qrGenerator.ts` (frontend-plan.md §6). Three real outcomes, each a fully
 * designed state: the record (role-filtered by the server, rendered by
 * `ItemDetailView`), `404` for an unknown tag, and `410` for a disposed item
 * seen by the public — F7.3's exact sentence, nothing else.
 */
export function ItemDetailPage() {
  const { tagId } = useParams<{ tagId: string }>();
  const { user } = useAuth();
  const query = useItemByTagId(tagId);

  /*
    Declared before the early returns below, as hooks must be: the disclosure
    state has to survive a refetch that re-renders through the loading branch.
  */
  const [staffOpen, setStaffOpen] = useState(false);
  const staffPanelId = useId();

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

    if (error instanceof NetworkError) {
      return <OfflineState />;
    }

    if (error instanceof ApiError && error.status === 410) {
      return (
        <ErrorState
          tone="neutral"
          icon={<Archive className="h-8 w-8" />}
          heading={error.message}
          action={
            <Link to="/">
              <Button size="sm" variant="outline">
                Back to search
              </Button>
            </Link>
          }
        />
      );
    }

    if (error instanceof ApiError && error.status === 404) {
      return (
        <ErrorState
          icon={<SearchX className="h-8 w-8" />}
          heading="Tag not found"
          body={`We couldn't find an item for tag "${tagId}". Check the sticker and try again, or search by name.`}
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
        {...(error instanceof Error && error.message ? { body: error.message } : {})}
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
    <div>
      <ItemDetailView item={item} />
      {user && (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <div className="flex flex-wrap items-center gap-2">
            {/*
              A disclosure, not a link to `/items/:id`.

              That link replaced this page wholesale — a new route, a new fetch for
              the same item, and `ScrollToTop` dropping the reader back at the top
              — for content that belongs beside the record they were already
              reading. Opening in place keeps the header, the scroll position and
              the query cache untouched, which is what "it reloads the whole page"
              was describing. The full staff view is still one click away below, for
              the things this page has no business doing (bundling, tag
              regeneration, printing).
            */}
            <Button
              variant="outline"
              size="sm"
              aria-expanded={staffOpen}
              aria-controls={staffPanelId}
              leftIcon={<QrCode className="h-4 w-4" />}
              onClick={() => setStaffOpen((previous) => !previous)}
            >
              {staffOpen ? "Hide staff detail & tag" : "View staff detail & tag"}
            </Button>
            {/*
              Edit sits here rather than only behind the staff page: this is where
              a QR scan and every post-save redirect lands, and the action was
              three taps away before. `ItemActions` renders nothing for a
              signed-out visitor, so the public page is unchanged for them.
            */}
            <ItemActions item={item} />
          </div>

          {staffOpen && (
            <div id={staffPanelId} className="mt-4 flex flex-col gap-6">
              <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
                <TagPanel itemId={item.id} tagId={item.tagId} itemName={item.name} />
                <div className="flex flex-col gap-2 text-sm text-slate-600">
                  <p>
                    This is the printable tag for {item.tagId} — download it and print it at sticker
                    size. Every field above is the same record the staff view shows.
                  </p>
                  <Link to={`/items/${item.id}`} className="self-start">
                    <Button variant="ghost" size="sm">
                      Bundles, printing &amp; regeneration
                    </Button>
                  </Link>
                </div>
              </div>
              <ItemHistorySection itemId={item.id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
