import { Archive, SearchX } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { Button } from "../../components/Button";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { ItemActions } from "../../components/ItemActions";
import { ItemDetailView } from "../../components/ItemDetailView";
import { Skeleton, SkeletonText } from "../../components/Skeleton";
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
  const navigate = useNavigate();
  const query = useItemByTagId(tagId);

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
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-6">
          <Link to={`/items/${item.id}`} state={{ tagId: item.tagId }}>
            <Button variant="outline" size="sm">
              View staff detail &amp; tag
            </Button>
          </Link>
          {/*
            Edit and Delete sit here rather than only behind the staff page:
            this is where a QR scan and every post-save redirect lands, and the
            action was three taps away before. `ItemActions` renders nothing for
            a signed-out visitor, so the public page is unchanged for them; after
            a delete there is no item left to show, so it returns to the register.
          */}
          <ItemActions item={item} onDeleted={() => navigate("/items")} />
        </div>
      )}
    </div>
  );
}
