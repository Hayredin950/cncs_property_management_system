import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { Pagination } from "../../components/Pagination";
import { Select } from "../../components/Select";
import { SkeletonText } from "../../components/Skeleton";
import { useSystemEvents } from "../../hooks/useSystem";
import { formatDateTimeUTC, formatRelativeTime } from "../../lib/formatters";
import type { SystemEvent } from "../../api/system";

const PAGE_SIZE = 20;

/**
 * The account log, in full.
 *
 * Every decision the system made about an account, with the record behind it:
 * who did it, who it was about, what changed, and the authority it was done
 * under. The log is append-only and it is the reason anybody can answer "who
 * approved this?" — so it has to be readable, not just present.
 */
export function SystemEventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [expanded, setExpanded] = useState<string | null>(null);

  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const search = searchParams.get("search") ?? "";
  const action = searchParams.get("action") ?? "";

  const eventsQuery = useSystemEvents({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    ...(search ? { search } : {}),
    ...(action ? { action } : {}),
  });

  const events = eventsQuery.data?.events ?? [];
  const total = eventsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function setParam(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">System events</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every decision the system made about an account, newest first. The log is
          append-only: a row here is never edited, only added to.
        </p>
      </div>

      {/* Wraps rather than overflows: the filters are fixed-width, and a row
          that overflows is a horizontal scrollbar on the whole page. */}
      <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end">
        <div className="flex-1">
          <Input
            label="Search"
            placeholder="An action, or a person's name"
            defaultValue={search}
            onChange={(event) => setParam("search", event.target.value)}
          />
        </div>
        <Select
          label="Action"
          value={action}
          onChange={(event) => setParam("action", event.target.value)}
          options={[
            { value: "", label: "All actions" },
            { value: "ACCOUNT_APPROVED", label: "Account approved" },
            { value: "ACCOUNT_REJECTED", label: "Account declined" },
            { value: "ACCOUNT_INVITE_SENT", label: "Invite sent" },
            { value: "ACCOUNT_INVITE_RESENT", label: "Invite resent" },
            { value: "ACCOUNT_INVITE_ACCEPTED", label: "Invite accepted" },
            { value: "ACCOUNT_ESCALATED", label: "Escalated" },
            { value: "ACCOUNT_DEACTIVATED", label: "Account deactivated" },
          ]}
        />
      </div>

      {eventsQuery.isPending ? (
        <Card>
          <div role="status" aria-label="Loading system events">
            <SkeletonText lines={4} />
          </div>
        </Card>
      ) : eventsQuery.isError ? (
        <ErrorState
          heading="Couldn't load the system events"
          body={
            eventsQuery.error instanceof Error
              ? eventsQuery.error.message
              : "There was a problem reading the account log."
          }
          action={
            <Button size="sm" onClick={() => eventsQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8" />}
          heading="No events match"
          body="Nothing in the log matches what you asked for."
        />
      ) : (
        <Card className="flex flex-col gap-0 p-0">
          <ul className="flex flex-col divide-y divide-slate-200">
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                open={expanded === event.id}
                onToggle={() => setExpanded(expanded === event.id ? null : event.id)}
              />
            ))}
          </ul>
        </Card>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={(next) => setParam("page", String(next))}
      />
    </div>
  );
}

/** One log row, and the record behind it. */
function EventRow({
  event,
  open,
  onToggle,
}: {
  event: SystemEvent;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <span className="flex min-w-0 items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-900">{event.type}</span>
            <span className="block truncate text-xs text-slate-500">{event.message}</span>
          </span>
        </span>
        <span className="shrink-0 text-xs text-slate-400" title={formatDateTimeUTC(event.timestamp) ?? undefined}>
          {formatRelativeTime(event.timestamp)}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <Field label="Done by">{event.actor?.fullName ?? "Unknown"}</Field>
            <Field label="About">{event.target?.fullName ?? "—"}</Field>
            {event.unit && <Field label="Unit">{event.unit}</Field>}
            <Field label="When">{formatDateTimeUTC(event.timestamp) ?? "—"}</Field>
            {event.authorizedBy && (
              <Field label="Authorized by">
                {event.authorizedBy}
                {event.authorizationRef ? ` (${event.authorizationRef})` : ""}
              </Field>
            )}
          </dl>
          {(event.before !== null || event.after !== null) && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-slate-500">Before</p>
                <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-xs text-slate-700">
                  {event.before === null ? "—" : JSON.stringify(event.before, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">After</p>
                <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-xs text-slate-700">
                  {event.after === null ? "—" : JSON.stringify(event.after, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  );
}
