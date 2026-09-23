import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthContext";
import { useDeleteItem } from "../hooks/useItemMutations";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconButton } from "./IconButton";

export interface ItemActionsProps {
  item: { id: string; tagId: string; name: string };
  /** `icons` is the compact corner control on a card; `buttons` is the labelled pair on the item page. */
  variant?: "icons" | "buttons";
  /** Runs after a successful delete — the item page has to navigate; the browse grid stays put. */
  onDeleted?: (() => void) | undefined;
  className?: string | undefined;
}

/**
 * Edit and Delete for one item, gated by role in one place.
 *
 * Both placements (the `/item/:tagId` page and each card in the browse grid) use
 * this, for the same reason `ItemDetailView` is shared: two copies of a *rule*
 * drift, and the rule here is a permission one. `STAFF` may edit; only `ADMIN`
 * may delete; an anonymous visitor sees nothing at all, so the public QR page
 * keeps its public chrome.
 *
 * ### Why delete is behind a confirmation that spells out the loss
 *
 * `DELETE /items/:id` is the only destructive endpoint in the API — it takes the
 * record *and* its edit history, its requests and its audit results, which is
 * precisely what the rest of the system exists to preserve. A plain "Are you
 * sure?" would undersell that, so the dialog names every casualty and points at
 * the non-destructive alternative (a disposal request), because the common
 * honest reason to want an item gone from a list is that it is retired — and for
 * that there is already a workflow that keeps the trail.
 */
export function ItemActions({ item, variant = "buttons", onDeleted, className }: ItemActionsProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMutation = useDeleteItem();

  // Anonymous visitors get no staff chrome on the public page.
  if (!user) return null;

  const isAdmin = user.role === "ADMIN";
  // The edit form loads by tag, not id — same link `ItemStaffPage` uses.
  const editTo = `/items/${item.id}/edit?tag=${encodeURIComponent(item.tagId)}`;

  function handleConfirm() {
    deleteMutation.mutate(item.id, { onSuccess: () => onDeleted?.() });
  }

  return (
    <div className={["flex items-center gap-1.5", className ?? ""].join(" ")}>
      {variant === "icons" ? (
        <>
          {/*
            A button, not a `Link`: the icon pair sits on top of the card, and the
            card is already an anchor — an `<a>` wrapping a `<button>` is invalid
            HTML and the browser decides which one the tap belongs to.
          */}
          <IconButton
            size="sm"
            variant="outline"
            icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
            label={`Edit ${item.name}`}
            onClick={() => navigate(editTo)}
          />
          {isAdmin && (
            <IconButton
              size="sm"
              variant="outline"
              icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              label={`Delete ${item.name}`}
              onClick={() => setConfirmOpen(true)}
              disabled={deleteMutation.isPending}
            />
          )}
        </>
      ) : (
        <>
          <Link to={editTo}>
            <Button variant="outline" size="sm" leftIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}>
              Edit item
            </Button>
          </Link>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              onClick={() => setConfirmOpen(true)}
              disabled={deleteMutation.isPending}
            >
              Delete item
            </Button>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        title={`Delete ${item.tagId}?`}
        tone="destructive"
        loading={deleteMutation.isPending}
        confirmLabel="Delete permanently"
        body={
          <>
            <strong>{item.name}</strong> will be removed from the register for good, along with its edit
            history, any transfer or disposal requests filed against it, and its audit results. Accessories
            that point at it are only unlinked, not deleted.
            <br />
            <br />
            This cannot be undone. To retire an asset while <em>keeping</em> its history, close this and file
            a disposal request instead.
          </>
        }
      />
    </div>
  );
}
