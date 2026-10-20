import { useState } from "react";
import { useAuth } from "../../app/AuthContext";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Modal } from "../../components/Modal";
import { Select } from "../../components/Select";
import { Textarea } from "../../components/Textarea";
import {
  useClaimItem,
  useClaimItemWithCorrection,
  useRefuseClaim,
  useReverseDisposal,
  useVerifyConfirmItem,
  useVerifyFlagItem,
} from "../../hooks/useAuthMutations";
import { hasCapability } from "../../lib/permissions";
import type { Item } from "../../types/item";

/**
 * The custody actions for one item.
 *
 * Every one of these endpoints existed on the server and had **no screen**:
 * a claim could only be made by calling the API by hand, a handover could not
 * be verified, and a disposal could not be reversed. The item page showed a
 * status and a history and nothing else — so the workflows the knowledge base
 * documents could not be exercised by the people they are for.
 *
 * Which actions appear depends on what the item is waiting for:
 *
 *   - **PENDING_CLAIM** — somebody was given the item and has not confirmed
 *     they have it. They can confirm it, refuse it (with a reason), or accept
 *     it with a corrected condition (the record was wrong, which is a
 *     different thing from somebody quietly changing it later).
 *   - **REVERTED_UNVERIFIED** — the item changed hands without a handover
 *     check (a new department head, a deactivated holder). The new head
 *     confirms it is there and in the state it should be, or flags it.
 *   - **DISPOSED** — the item was retired. A Property Officer can reverse
 *     that, with a reason, and the item returns to the pool for proper
 *     re-registration.
 */
export function ItemCustodyActions({ item }: { item: Item }) {
  const { user } = useAuth();
  const [refuseOpen, setRefuseOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);

  const [refuseReason, setRefuseReason] = useState("");
  const [condition, setCondition] = useState("");
  const [note, setNote] = useState("");
  const [flagReason, setFlagReason] = useState("");
  const [reverseReason, setReverseReason] = useState("");

  const claim = useClaimItem();
  const refuse = useRefuseClaim();
  const claimWithCorrection = useClaimItemWithCorrection();
  const verifyConfirm = useVerifyConfirmItem();
  const verifyFlag = useVerifyFlagItem();
  const reverseDisposal = useReverseDisposal();

  const isHolder = user?.id === item.holderId;
  const canVerify =
    hasCapability(user?.role, "ITEM_EDIT_CUSTODY") &&
    (user?.role === "DEPARTMENT_HEAD" || user?.role === "PROPERTY_OFFICER");
  const canReverse = hasCapability(user?.role, "DISPOSAL_REVERSE");

  // ── The item is waiting for somebody to confirm they have it ────────────
  if (item.status === "PENDING_CLAIM") {
    return (
      <Card className="flex flex-col gap-4 border-brand-200 bg-brand-50">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-slate-900">Waiting for the holder to confirm</h2>
          <p className="text-sm text-slate-600">
            This item was registered to somebody and is waiting for them to confirm they have it.
            Until then it stays in the college pool.
          </p>
        </div>
        {isHolder ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => claim.mutate(item.id)} loading={claim.isPending}>
              I have this item
            </Button>
            <Button variant="outline" onClick={() => setCorrectionOpen(true)}>
              I have it, but the condition is wrong
            </Button>
            <Button variant="destructive" onClick={() => setRefuseOpen(true)}>
              I never received it
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            The person this item is registered to confirms receipt.
          </p>
        )}

        <Modal
          open={refuseOpen}
          onClose={() => setRefuseOpen(false)}
          title="Say you never received this item"
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              The item goes back to the college pool and both department heads are told. Say what
              happened — this is a record, not a complaint.
            </p>
            <Textarea
              label="What happened"
              value={refuseReason}
              onChange={(event) => setRefuseReason(event.target.value)}
              placeholder="e.g. The handover never happened — I was away."
              required
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setRefuseOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                loading={refuse.isPending}
                disabled={!refuseReason.trim()}
                onClick={() =>
                  refuse.mutate(
                    { id: item.id, reason: refuseReason.trim() },
                    { onSuccess: () => setRefuseOpen(false) },
                  )
                }
              >
                Refuse the item
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          open={correctionOpen}
          onClose={() => setCorrectionOpen(false)}
          title="Accept it with a corrected condition"
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              The register says the item is in one condition and it is in another. Correcting it
              keeps the difference on the record — which is what makes the correction
              auditable later.
            </p>
            <Select
              label="The condition it is actually in"
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              options={[
                { value: "", label: "Choose…" },
                { value: "NEW", label: "New" },
                { value: "GOOD", label: "Good" },
                { value: "FAIR", label: "Fair" },
                { value: "DAMAGED", label: "Damaged" },
                { value: "BEYOND_REPAIR", label: "Beyond repair" },
              ]}
              required
            />
            <Textarea
              label="What the register should say"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. The register said new; the screen has a scratch on the lid."
              required
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setCorrectionOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={claimWithCorrection.isPending}
                disabled={!condition.trim() || !note.trim()}
                onClick={() =>
                  claimWithCorrection.mutate(
                    { id: item.id, actualCondition: condition.trim(), note: note.trim() },
                    { onSuccess: () => setCorrectionOpen(false) },
                  )
                }
              >
                Accept with the correction
              </Button>
            </div>
          </div>
        </Modal>
      </Card>
    );
  }

  // ── The item changed hands without anyone checking it ───────────────────
  if (item.status === "REVERTED_UNVERIFIED" && canVerify) {
    return (
      <Card className="flex flex-col gap-4 border-warning-200 bg-warning-50">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-slate-900">This item needs your verification</h2>
          <p className="text-sm text-slate-600">
            It changed hands without a handover check — a new department head, or a holder who was
            deactivated. Confirm that it is here and in the state it should be, or flag it for
            review. An item that is still unverified cannot be transferred or disposed of.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => verifyConfirm.mutate(item.id)} loading={verifyConfirm.isPending}>
            I have verified this item
          </Button>
          <Button variant="destructive" onClick={() => setFlagOpen(true)} loading={verifyFlag.isPending}>
            Flag it for review
          </Button>
        </div>

        <Modal open={flagOpen} onClose={() => setFlagOpen(false)} title="Flag this item for review">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              The item goes to the Property Officer to be traced — the same path a missing item
              takes after an audit. Say what you found.
            </p>
            <Textarea
              label="What is wrong"
              value={flagReason}
              onChange={(event) => setFlagReason(event.target.value)}
              placeholder="e.g. The item is not in this office and nobody has signed for it."
              required
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setFlagOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                loading={verifyFlag.isPending}
                disabled={!flagReason.trim()}
                onClick={() =>
                  verifyFlag.mutate(
                    { id: item.id, reason: flagReason.trim() },
                    { onSuccess: () => setFlagOpen(false) },
                  )
                }
              >
                Flag it
              </Button>
            </div>
          </div>
        </Modal>
      </Card>
    );
  }

  // ── The item was retired, and that can be undone (by the right person) ──
  if (item.status === "DISPOSED" && canReverse) {
    return (
      <Card className="flex flex-col gap-4 border-slate-300 bg-slate-50">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-slate-900">This item was disposed of</h2>
          <p className="text-sm text-slate-600">
            Disposal is a decision, not a deletion — and a decision can be reversed, with a reason
            and a record. The item returns to the college pool to be registered again properly.
          </p>
        </div>
        <div>
          <Button variant="outline" onClick={() => setReverseOpen(true)}>
            Reverse this disposal
          </Button>
        </div>

        <Modal
          open={reverseOpen}
          onClose={() => setReverseOpen(false)}
          title="Reverse this disposal"
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              The disposal is undone, the item returns to the college pool, and the reversal is
              written to the item&apos;s history with your name on it. It does not go back to
              whoever disposed of it — it is re-registered.
            </p>
            <Textarea
              label="Why is the disposal being reversed"
              value={reverseReason}
              onChange={(event) => setReverseReason(event.target.value)}
              placeholder="e.g. Disposed in error — the item is in service and in use."
              required
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setReverseOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={reverseDisposal.isPending}
                disabled={!reverseReason.trim()}
                onClick={() =>
                  reverseDisposal.mutate(
                    { id: item.id, reason: reverseReason.trim() },
                    { onSuccess: () => setReverseOpen(false) },
                  )
                }
              >
                Reverse the disposal
              </Button>
            </div>
          </div>
        </Modal>
      </Card>
    );
  }

  return null;
}
