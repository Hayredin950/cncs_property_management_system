import { AlertTriangle, ArrowRight, CheckCircle2, ListChecks } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchItemByTagId } from "../../api/items";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Input } from "../../components/Input";
import { QrScanner } from "../../components/QrScanner";
import { useCompleteAuditSession, useScanAuditItem } from "../../hooks/useAudits";
import { appendScan, clearWalkthrough, loadWalkthrough, saveCompletionSummary, saveWalkthrough } from "../../lib/auditWalkthrough";
import { parseScannedTagId } from "../../lib/formatters";
import { toast } from "../../lib/toast";
import { formatDateTimeUTC } from "../../lib/formatters";
import { ApiError, NetworkError } from "../../types/api";

/**
 * `/audit/:id/scan` (F9.2) — the live walkthrough.
 *
 * Two things a reader should know before changing this file:
 *
 * 1. **The server keeps no scan listing.** `POST /audits/:id/scan` writes rows
 *    and nothing reads them back until the report export (gap G1), so the running
 *    list below *is* the walkthrough's state. It's persisted per session id so a
 *    phone reload doesn't lose the count (`lib/auditWalkthrough.ts`).
 * 2. **A scanned QR resolves to an item, then to an item id.** The sticker
 *    encodes the public `/item/:tagId` URL, so this page reuses
 *    `parseScannedTagId` + `GET /items/:tagId` to turn a camera hit into the
 *    `itemId` the scan endpoint requires. A tag that matches no item, or a
 *    disposed one, must read as a failed scan — never as a silent success.
 *
 * Camera and manual entry are always both visible, for the same reason as
 * `/scan` (F4.1): one-handed use with a phone in the other hand.
 */
export function AuditScanPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const initial = loadWalkthrough(id);
  const [walkthrough, setWalkthrough] = useState(initial);
  const [manualValue, setManualValue] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const scanMutation = useScanAuditItem(id);
  const completeMutation = useCompleteAuditSession(id);

  const handleTag = useCallback(
    async (raw: string) => {
      const tagId = parseScannedTagId(raw);
      setManualValue("");
      if (!tagId) {
        setScanError("That doesn't look like a tag ID — scan the sticker or type it in.");
        return;
      }

      if (walkthrough.scanned.some((entry) => entry.tagId === tagId)) {
        toast.info(`${tagId} is already scanned in this session.`);
        return;
      }

      setScanError(null);
      try {
        const item = await fetchItemByTagId(tagId);
        const row = await scanMutation.mutateAsync(item.id);
        const next = appendScan(walkthrough, {
          itemId: row.item.id,
          tagId: row.item.tagId,
          name: row.item.name,
          room: row.item.room,
          scannedAt: row.scannedAt ?? new Date().toISOString(),
        });
        setWalkthrough(next);
        saveWalkthrough(id, next);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          setScanError(`No item matches tag ${tagId}.`);
        } else {
          setScanError(err instanceof Error ? err.message : "Couldn't record that scan.");
        }
      }
    },
    [id, scanMutation, walkthrough],
  );

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void handleTag(manualValue);
  }

  async function handleComplete() {
    try {
      const summary = await completeMutation.mutateAsync();
      saveCompletionSummary(summary);
      clearWalkthrough(id);
      navigate(`/audit/${id}/report`, { state: { summary } });
    } catch {
      // Toast already shown; the dialog stays open so the failure isn't hidden.
    }
  }

  const busy = scanMutation.isPending;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Audit in progress</h1>
        <p className="mt-1 text-sm text-slate-500">
          {walkthrough.scopeValue
            ? `Scanning items in ${walkthrough.scopeValue}.`
            : "Scan each item as you reach it."}
        </p>
      </div>

      <QrScanner elementId="audit-qr-reader" onDecode={(text) => void handleTag(text)} />

      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
        or type it
        <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
      </div>

      <form onSubmit={handleManualSubmit} className="flex items-end gap-2">
        <Input
          label="Tag ID"
          placeholder="CNCS-XXXXXXXX"
          value={manualValue}
          onChange={(event) => setManualValue(event.target.value)}
          className="tag-id"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" leftIcon={<ArrowRight className="h-4 w-4" />} loading={busy} disabled={!manualValue.trim()}>
          Scan
        </Button>
      </form>

      {scanError && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {scanError}
        </p>
      )}

      <Card className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <ListChecks className="h-4 w-4" aria-hidden="true" />
            Scanned this session
          </h2>
          <span className="tabular-nums text-sm font-semibold text-slate-900">{walkthrough.scanned.length}</span>
        </div>

        {walkthrough.scanned.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-8 w-8" />}
            heading="Nothing scanned yet"
            body="Every scan is recorded as found. Missing and wrong-location items are worked out when you complete the audit."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {walkthrough.scanned.map((entry) => (
              <li
                key={entry.itemId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success-600" aria-hidden="true" />
                  <span className="font-medium text-slate-900">{entry.name}</span>
                  <span className="tag-id text-xs text-slate-500">{entry.tagId}</span>
                </span>
                <span className="text-xs text-slate-500" title={formatDateTimeUTC(entry.scannedAt) ?? undefined}>
                  Room {entry.room}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {completeMutation.isError && (
        <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {completeMutation.error instanceof NetworkError
            ? "You're offline — reconnect and try again."
            : completeMutation.error instanceof Error
              ? completeMutation.error.message
              : "Couldn't complete the audit."}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <Link to={`/audit/${id}/report`}>
          <Button variant="outline" type="button">
            View report so far
          </Button>
        </Link>
        <Button
          type="button"
          disabled={walkthrough.scanned.length === 0}
          onClick={() => setConfirmOpen(true)}
        >
          Complete audit
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleComplete()}
        title="Complete this audit?"
        body={
          <>
            Every active item in the audited department that wasn&apos;t scanned will be recorded as{" "}
            <strong className="font-semibold text-slate-900">missing</strong>, and items scanned from outside it as{" "}
            <strong className="font-semibold text-slate-900">wrong location</strong>. Completing also stamps{" "}
            <em>last audited</em> on the items that were found, and it can&apos;t be undone.
          </>
        }
        confirmLabel="Complete audit"
        loading={completeMutation.isPending}
      />
    </div>
  );
}
