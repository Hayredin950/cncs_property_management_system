import { AlertCircle, Pencil } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../app/AuthContext";
import { useClaimItem, useRefuseClaim } from "../hooks/useAuthMutations";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { IconButton } from "./IconButton";
import { Select } from "./Select";
import { Textarea } from "./Textarea";
import { useState } from "react";
import type { ClaimRefusalReason, Item } from "../types/item";

export interface ItemActionsProps {
  item: Item;
  /** `icons` is the compact corner control on a card; `buttons` is the labelled control on the item page. */
  variant?: "icons" | "buttons";
  className?: string | undefined;
}

/**
 * The Edit/Claim/Refuse affordances for one item, gated by role in one place.
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
  const claimMutation = useClaimItem();
  const refuseMutation = useRefuseClaim();
  const [refusing, setRefusing] = useState<{ itemId: string; reason: string } | null>(null);
  const [refusalCode, setRefusalCode] = useState<ClaimRefusalReason | "">("");
  const [refuseReason, setRefuseReason] = useState("");

  // Anonymous visitors get no staff chrome on the public page.
  if (!user) return null;

  // The edit form loads by tag, not id — same link `ItemStaffPage` uses.
  const editTo = `/items/${item.id}/edit?tag=${encodeURIComponent(item.tagId)}`;

  // Determine if the current user can claim/refuse this item
  const isCustodian = item.holderType === "STAFF" && item.holderId === user.id;
  const isDeptHead = user.role === "DEPARTMENT_HEAD" && item.holderType === "DEPARTMENT" && item.holderId === user.departmentId;
  const canClaimOrRefuse = item.status === "PENDING_CLAIM" && (isCustodian || isDeptHead);

  const handleClaim = async () => {
    await claimMutation.mutateAsync(item.id);
    navigate(`/item/${item.tagId}`);
  };

  const handleRefuseStart = () => {
    setRefusing({ itemId: item.id, reason: "" });
    setRefusalCode("");
    setRefuseReason("");
  };

  const refusalNote = refuseReason.trim();
  const refusalReady =
    refusalCode !== "" && (refusalCode !== "OTHER" || refusalNote.length >= 3);

  const handleRefuseConfirm = async () => {
    if (!refusalReady) return;
    await refuseMutation.mutateAsync({
      id: item.id,
      reason: refusalCode,
      ...(refusalNote ? { otherReason: refusalNote } : {}),
    });
    setRefusing(null);
    setRefusalCode("");
    setRefuseReason("");
    navigate(`/item/${item.tagId}`);
  };

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
        <>
          <Link to={editTo}>
            <Button variant="outline" size="sm" leftIcon={<Pencil className="h-4 w-4" aria-hidden="true" />}>
              Edit item
            </Button>
          </Link>

          {canClaimOrRefuse && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}
                onClick={handleRefuseStart}
                loading={refuseMutation.isPending}
              >
                Refuse
              </Button>
              <Button
                size="sm"
                leftIcon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}
                onClick={handleClaim}
                loading={claimMutation.isPending}
              >
                Claim
              </Button>
            </div>
          )}
        </>
      )}

      {refusing && refusing.itemId === item.id && (
        <ConfirmDialog
          open
          onClose={() => setRefusing(null)}
          onConfirm={handleRefuseConfirm}
          title={`Refuse ${item.name}?`}
          confirmLabel="Refuse"
          disabled={!refusalReady || refuseMutation.isPending}
          loading={refuseMutation.isPending}
          body={
            <>
              <p className="text-sm text-slate-600">
                The item will be returned to the college pool. Give a reason — the
                property officer will see it, and the same address cannot ask again
                into a void.
              </p>
              {/* The server takes a code from a fixed set (spec §6); the note is
                  the free text beside it, required only for "something else". */}
              <Select
                label="Why not?"
                value={refusalCode}
                onChange={(event) => setRefusalCode(event.target.value as ClaimRefusalReason | "")}
                placeholder="Choose a reason…"
                options={[
                  { value: "NEVER_RECEIVED", label: "I never received it" },
                  { value: "WRONG_ITEM", label: "It was the wrong item" },
                  { value: "CONDITION_MISMATCH", label: "The recorded condition is wrong" },
                  { value: "OTHER", label: "Something else" },
                ]}
                required
              />
              <Textarea
                label={refusalCode === "OTHER" ? "What happened" : "Anything to add? (optional)"}
                hint={refusalCode === "OTHER" ? "3–500 characters." : "Optional."}
                value={refuseReason}
                onChange={(e) => setRefuseReason(e.target.value)}
                required={refusalCode === "OTHER"}
              />
            </>
          }
        />
      )}
    </div>
  );
}
