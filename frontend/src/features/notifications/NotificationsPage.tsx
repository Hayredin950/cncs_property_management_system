import { Bell, BellRing, CheckCheck, ClipboardCheck, ClipboardX, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState, OfflineState } from "../../components/ErrorState";
import { SkeletonText } from "../../components/Skeleton";
import {
  useMarkNotificationRead,
  useNotifications,
} from "../../hooks/useNotifications";
import { formatDateTimeUTC, formatRelativeTime } from "../../lib/formatters";
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
 */
export function NotificationsPage() {
  const inboxQuery = useNotifications({ limit: 50 });
  const markRead = useMarkNotificationRead();

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="mt-1 text-sm text-slate-500">
            {unreadCount > 0 ? `${unreadCount} unread.` : "You're all caught up."}
          </p>
        </div>
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
              onOpen={() => {
                if (!notification.isRead) markRead.mutate(notification.id);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationRow({ notification, onOpen }: { notification: AppNotification; onOpen: () => void }) {
  const { icon, toneClass } = codeStyle(notification.code);
  const inner = (
    <Card
      className={[
        "flex items-start gap-3 transition-colors",
        notification.isRead ? "opacity-70" : "",
        notification.relatedRequestId ? "cursor-pointer hover:shadow-md" : "",
      ].join(" ")}
    >
      <span className={`mt-0.5 shrink-0 ${toneClass}`} aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {!notification.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
          <span className={notification.isRead ? "text-sm text-slate-600" : "text-sm font-medium text-slate-900"}>
            {notification.message}
          </span>
        </span>
        <span className="mt-1 block text-xs text-slate-400" title={formatDateTimeUTC(notification.createdAt) ?? undefined}>
          {formatRelativeTime(notification.createdAt)}
        </span>
      </span>
    </Card>
  );

  if (notification.relatedRequestId) {
    return (
      <li>
        <Link to={`/requests/${notification.relatedRequestId}`} onClick={onOpen} className="block rounded-md">
          {inner}
        </Link>
      </li>
    );
  }

  // No related request: the whole card is a real button so keyboard users can
  // reach the mark-as-read action (jsx-a11y: no static click handlers).
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="block w-full cursor-default rounded-md text-left"
        aria-label={notification.isRead ? undefined : "Mark notification as read"}
      >
        {inner}
      </button>
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
