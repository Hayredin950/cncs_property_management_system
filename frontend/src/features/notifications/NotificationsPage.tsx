import { Bell, BellRing, CheckCheck, ClipboardCheck, ClipboardX, Inbox, Trash2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { IconButton } from "../../components/IconButton";
import { SkeletonText } from "../../components/Skeleton";
import {
  useClearNotifications,
  useDismissNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "../../hooks/useNotifications";
import { cn } from "../../lib/cn";
import { formatDateTimeUTC, formatRelativeTime } from "../../lib/formatters";
import { toast } from "../../lib/toast";
import { NetworkError } from "../../types/api";
import type { AppNotification } from "../../types/notification";

/**
 * `/notifications` (F8.1, F8.2) — the ➕ route the SDS page map lacked
 * (frontend-plan.md §6). Icon and tone branch on `code`
 * (REQUEST_SUBMITTED / REQUEST_APPROVED / REQUEST_REJECTED / null); an
 * unknown/absent code still renders its `message` — never dropped. Email is a
 * logged stub server-side, so no copy here may promise an email was sent.
 *
 * Clicking a row marks it read (optimistic) and navigates to the related
 * request when there is one.
 *
 * ### Housekeeping: one at a time, all at once, or gone
 *
 * The inbox grows on its own — every filing, approval and rejection writes a row
 * — so it needs a way to be emptied, and three shapes of that:
 *
 *   - **the X on a card** dismisses that one message, in place;
 *   - **Mark all as read** clears the unread count without touching the messages;
 *   - **Clear all** empties the inbox, behind a confirmation because it is the
 *     only one of the three that destroys anything.
 *
 * Both bulk controls sit in the header beside the count they change, and neither
 * appears over an empty inbox — there is nothing for them to act on. `Mark all as
 * read` disables itself at zero rather than disappearing, so the row doesn't
 * reflow the moment the last unread row is read.
 *
 * An X is not confirmed and the row simply leaves: it is one message in a
 * personal inbox, and the action is reversible in the only sense that matters —
 * the request, edit-log row or audit result it was reporting is untouched. Clear
 * all is the one that can't be reasoned about that way, so it asks first and
 * names the row count.
 */
export function NotificationsPage() {
  const inboxQuery = useNotifications({ limit: 50 });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const dismiss = useDismissNotification();
  const clearAll = useClearNotifications();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  if (inboxQuery.isPending) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-4" role="status" aria-label="Loading notifications">
        <SkeletonText lines={6} />
      </div>
    );
  }

  if (inboxQuery.isError) {
    return inboxQuery.error instanceof NetworkError ? (
      <OfflineState />
    ) : (
      <ErrorState
        heading="Couldn't load notifications"
        body={inboxQuery.error instanceof Error ? inboxQuery.error.message : undefined}
        action={
          <Button size="sm" onClick={() => inboxQuery.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const { notifications, unreadCount } = inboxQuery.data;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">
            {unreadCount > 0 ? `${unreadCount} unread.` : "You're all caught up."}
          </p>
        </div>

        {notifications.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<CheckCheck className="h-4 w-4" aria-hidden="true" />}
              disabled={unreadCount === 0}
              loading={markAllRead.isPending}
              onClick={() =>
                markAllRead.mutate(undefined, {
                  onError: () => toast.error("Couldn't mark everything as read. Try again."),
                })
              }
            >
              Mark all as read
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              loading={clearAll.isPending}
              onClick={() => setConfirmClearOpen(true)}
            >
              Clear all
            </Button>
          </div>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-8 w-8" />}
          heading="No notifications yet"
          body="Request activity — filings, approvals, rejections — shows up here."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              dismissing={dismiss.isPending && dismiss.variables === notification.id}
              onOpen={() => {
                if (!notification.isRead) markRead.mutate(notification.id);
              }}
              onDismiss={() =>
                dismiss.mutate(notification.id, {
                  onError: () => toast.error("Couldn't remove that notification. Try again."),
                })
              }
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmClearOpen}
        onClose={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          clearAll.mutate(undefined, {
            onSettled: () => setConfirmClearOpen(false),
            onError: () => toast.error("Couldn't clear your notifications. Try again."),
          });
        }}
        title="Clear all notifications?"
        tone="destructive"
        loading={clearAll.isPending}
        confirmLabel="Clear all"
        body={
          <>
            All {notifications.length} message{notifications.length === 1 ? "" : "s"} leave your inbox. This
            deletes the notifications themselves and nothing else — the requests, edit history and audit
            results they were reporting are untouched, and nobody else's inbox is affected.
          </>
        }
      />
    </div>
  );
}

function NotificationRow({
  notification,
  onOpen,
  onDismiss,
  dismissing,
}: {
  notification: AppNotification;
  onOpen: () => void;
  onDismiss: () => void;
  dismissing: boolean;
}) {
  const { icon, toneClass } = codeStyle(notification.code);

  const body = (
    <>
      <span className="flex items-center gap-2">
        {!notification.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
        <span className={notification.isRead ? "text-sm text-slate-600" : "text-sm font-medium text-slate-900"}>
          {notification.message}
        </span>
      </span>
      <span className="mt-1 block text-xs text-slate-400" title={formatDateTimeUTC(notification.createdAt) ?? undefined}>
        {formatRelativeTime(notification.createdAt)}
      </span>
    </>
  );

  return (
    <li>
      <Card
        className={cn(
          "flex items-start gap-3 transition-colors",
          notification.isRead && "opacity-70",
          notification.relatedRequestId && "hover:shadow-md",
        )}
      >
        <span className={cn("mt-0.5 shrink-0", toneClass)} aria-hidden="true">
          {icon}
        </span>

        {/*
          The open affordance is the message block, not the whole card, because
          the X is its **sibling**: an `<a>` wrapping a `<button>` is invalid HTML
          and the browser decides which control a tap belongs to (the same reason
          `ItemActions` uses a button on a card rather than a link inside one).
          The block carries all of the card's width but the icon and the X, so the
          row still reads as one target for a pointer.
        */}
        {notification.relatedRequestId ? (
          <Link to={`/requests/${notification.relatedRequestId}`} onClick={onOpen} className="min-w-0 flex-1 rounded-sm">
            {body}
          </Link>
        ) : (
          // No related request: the message block is a real button so keyboard
          // users can reach the mark-as-read action (jsx-a11y: no static click
          // handlers).
          <button
            type="button"
            onClick={onOpen}
            className="min-w-0 flex-1 cursor-default rounded-sm text-left"
            aria-label={notification.isRead ? undefined : "Mark notification as read"}
          >
            {body}
          </button>
        )}

        <IconButton
          // The message in the label, not just "Remove": a screen reader hears
          // which message a control would delete, and two X buttons on the page
          // are never ambiguous to a test or to a user.
          label={`Remove notification: ${notification.message}`}
          icon={<X className="h-4 w-4" aria-hidden="true" />}
          variant="ghost"
          size="sm"
          loading={dismissing}
          onClick={onDismiss}
          className="-mr-1.5 -mt-1.5 shrink-0"
        />
      </Card>
    </li>
  );
}

/** §3.2's code map — colour + icon + the message itself, never colour alone. */
function codeStyle(code: AppNotification["code"]): { icon: ReactNode; toneClass: string } {
  switch (code) {
    case "REQUEST_SUBMITTED":
      return { icon: <ClipboardCheck className="h-5 w-5" />, toneClass: "text-info-600" };
    case "REQUEST_APPROVED":
      return { icon: <CheckCheck className="h-5 w-5" />, toneClass: "text-success-600" };
    case "REQUEST_REJECTED":
      return { icon: <ClipboardX className="h-5 w-5" />, toneClass: "text-danger-600" };
    default:
      // Unknown/absent code — the message still renders (frontend-plan.md §7).
      return { icon: <BellRing className="h-5 w-5" />, toneClass: "text-slate-500" };
  }
}

export { Bell };
