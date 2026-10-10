import { Pencil } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthContext";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

export interface ItemActionsProps {
  item: { id: string; tagId: string; name: string };
  /** `icons` is the compact corner control on a card; `buttons` is the labelled control on the item page. */
  variant?: "icons" | "buttons";
  className?: string | undefined;
}

/**
 * The Edit affordance for one item, gated by role in one place.
 *
 * Both placements (the `/item/:tagId` page and each card in the browse grid) use
 * this, for the same reason `ItemDetailView` is shared: two copies of a *rule*
 * drift, and the rule here is a permission one. A signed-in Staff/Admin viewer
 * gets the control; an anonymous visitor sees nothing at all, so the public QR
 * page keeps its public chrome.
 *
 * ### There is deliberately no Delete
 *
 * Nothing in this app destroys an item. Retiring an asset is a `DISPOSAL`
 * request that keeps the record, and the edit log is append-only (F7.2:
 * records are never destroyed — disposal is a status change). A hard delete was
 * added and then removed on purpose: correction happens by *editing*, and the
 * disposal workflow is the only way an item leaves the active register.
 */
export function ItemActions({ item, variant = "buttons", className }: ItemActionsProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Anonymous visitors get no staff chrome on the public page.
  if (!user) return null;

  // The edit form loads by tag, not id — same link `ItemStaffPage` uses.
  const editTo = `/items/${item.id}/edit?tag=${encodeURIComponent(item.tagId)}`;

  return (
    <div className={["flex items-center gap-1.5", className ?? ""].join(" ")}>
      {variant === "icons" ? (
        /*
          A button, not a `Link`: the icon sits on top of the card, and the card
          is already an anchor — an `<a>` wrapping a `<button>` is invalid HTML
          and the browser decides which one the tap belongs to.
        */
        <IconButton
          size="sm"
          variant="outline"
          icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
          label={`Edit ${item.name}`}
          onClick={() => navigate(editTo)}
        />
      ) : (
        <Link to={editTo}>
          <Button variant="outline" size="sm" leftIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}>
            Edit item
          </Button>
        </Link>
      )}
    </div>
  );
}
