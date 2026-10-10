import { AlertTriangle, ArrowRight, CheckCircle2, ListChecks } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchItemByTagId } from "../../api/items";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Input } from "../../components/Input";
import { QrScanner } from "../../components/QrScanner";
import { useAuditSession, useCompleteAuditSession, useScanAuditItem } from "../../hooks/useAudits";
import {
  appendScan,
  clearWalkthrough,
  loadWalkthrough,
  mergeStoredScans,
  saveCompletionSummary,
  saveWalkthrough,
} from "../../lib/auditWalkthrough";
import { formatDateTimeUTC, parseScannedTagId } from "../../lib/formatters";
import { scanToastSlot, toast } from "../../lib/toast";
import { ApiError, NetworkError } from "../../types/api";

/**
 * How long the same tag is ignored after it has already been handled.
 *
 * The camera decodes at 10 fps and a sticker stays in frame for seconds, so
 * without this every scan re-fired ten times a second: ten lookups, ten "already
 * scanned" toasts, and — for a tag that matches nothing — ten failed requests,
 * all for one physical scan. Long enough to cover a real re-read of the same
 * sticker; short enough that a deliberate second scan or a retry after a bad read
 * still gets an answer.
 */
const REPEAT_TAG_COOLDOWN_MS = 10_000;

/**
 * `/audit/:id/scan` (F9.2) — the live walkthrough.
 *
 * Two things a reader should know before changing this file:
 *
 * 1. **The stored rows are the walkthrough's base, not its backup.** This used to
 *    say the server kept no scan listing, and it was true: `POST /audits/:id/scan`
 *    wrote rows that nothing could read back, so the running list was the only
 *    copy — per tab, lost on a phone reload, invisible from a second device. Gap
 *    G1 is closed, so `GET /audits/:id` is the source and `sessionStorage` is only
 *    a cache in front of it (`mergeStoredScans`). A count that comes back lower
 *    than the server's is now a bug in that merge, not a missing endpoint.
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
  /** The last tag handled, and when — see `REPEAT_TAG_COOLDOWN_MS`. */
  const lastHandled = useRef<{ tagId: string; at: number } | null>(null);

  /** This tab's copy: instant, and the only thing a scan writes to before the server confirms. */
  const [walkthrough, setWalkthrough] = useState(() => loadWalkthrough(id));
  const [manualValue, setManualValue] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const scanMutation = useScanAuditItem(id);
  const completeMutation = useCompleteAuditSession(id);

  /**
   * The stored session. This is what makes the count survive a *new tab*:
   * `sessionStorage` is per tab, so the list used to come back empty while the
   * server already held every scan — the audit looked unsaved when it was saved.
   *
   * Merged in render rather than copied into state by an effect: a copy would have
   * to be re-synced on every refetch, and the merge is a pure function of the two
   * lists (`mergeStoredScans`).
   */
  const sessionQuery = useAuditSession(id);
  const stored = sessionQuery.data;
  const scanned = useMemo(
    () => mergeStoredScans(walkthrough.scanned, stored),
    [walkthrough.scanned, stored],
  );
  // The scope comes from the session, so a fresh tab still says which department
  // is being walked instead of the generic "scan each item as you reach it".
  const scopeValue = stored?.scopeValue || walkthrough.scopeValue;
  const completed = stored?.completed ?? false;

  const handleTag = useCallback(
    async (raw: string) => {
      const tagId = parseScannedTagId(raw);
      setManualValue("");
      if (!tagId) {
        setScanError("That doesn't look like a tag ID — scan the sticker or type it in.");
        return;
      }

      const now = Date.now();
      const previous = lastHandled.current;
      if (previous?.tagId === tagId && now - previous.at < REPEAT_TAG_COOLDOWN_MS) return;
      lastHandled.current = { tagId, at: now };

      if (scanned.some((entry) => entry.tagId === tagId)) {
        // Same slot as the success toast: an item already counted is not a second
        // notification, it is the latest thing that happened at the camera.
        toast.info(`${tagId} is already scanned in this session.`, { id: scanToastSlot(id) });
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
    [id, scanMutation, walkthrough, scanned],
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
          {scopeValue ? `Scanning items in ${scopeValue}.` : "Scan each item as you reach it."}
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
          <span className="tabular-nums text-sm font-semibold text-slate-900">{scanned.length}</span>
        </div>

        {scanned.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-8 w-8" />}
            heading="Nothing scanned yet"
            body="Every scan is recorded as found. Missing and wrong-location items are worked out when you complete the audit."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {scanned.map((entry) => (
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
            {completed ? "View report" : "View report so far"}
          </Button>
        </Link>
        {/*
          A completed session is read-only here — the server answers 409 — so the
          button is replaced rather than left enabled to fail. Reachable now that
          this page reads stored rows: before, an old session id showed an empty
          list and the button was disabled for the wrong reason.
        */}
        <Button
          type="button"
          disabled={scanned.length === 0 || completed}
          onClick={() => setConfirmOpen(true)}
        >
          Complete audit
        </Button>
      </div>

      {completed && (
        <p className="flex items-start gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden="true" />
          This audit was completed and can't be scanned into any more. Its report and CSV are on the audit
          history page.
        </p>
      )}

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
