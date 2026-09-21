import {
  Archive,
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  Circle,
  Clock,
  CheckCircle2,
  IdCard,
  ShieldCheck,
  Sparkles,
  ThumbsUp,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  CONDITION_LABELS,
  ITEM_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  REQUEST_TYPE_LABELS,
  ROLE_LABELS,
  type Condition,
  type ItemStatus,
  type RequestStatus,
  type RequestType,
  type Role,
} from "../types/enums";
import { Badge, type BadgeTone } from "./Badge";

/** frontend-design-system.md §3.2 — one colour/icon pair per enum value, everywhere. */
const CONDITION_TONE: Record<Condition, BadgeTone> = {
  NEW: "accent",
  GOOD: "success",
  FAIR: "warning",
  DAMAGED: "orange",
  BEYOND_REPAIR: "danger",
};

const CONDITION_ICON: Record<Condition, ReactNode> = {
  NEW: <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />,
  GOOD: <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />,
  FAIR: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
  DAMAGED: <Wrench className="h-3.5 w-3.5" aria-hidden="true" />,
  BEYOND_REPAIR: <Ban className="h-3.5 w-3.5" aria-hidden="true" />,
};

export function ConditionBadge({ condition, className }: { condition: Condition; className?: string }) {
  return (
    <Badge tone={CONDITION_TONE[condition]} icon={CONDITION_ICON[condition]} className={className}>
      {CONDITION_LABELS[condition]}
    </Badge>
  );
}

/**
 * `ACTIVE` renders as a plain dot, not a full chip — disposal is a normal
 * lifecycle end, not an error, and constantly badging "in service" would just be
 * noise (§3.2). `DISPOSED` gets the full calm-slate chip.
 */
export function ItemStatusBadge({ status, className }: { status: ItemStatus; className?: string }) {
  if (status === "ACTIVE") {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-success-700 ${className ?? ""}`}>
        <Circle className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
        {ITEM_STATUS_LABELS.ACTIVE}
      </span>
    );
  }
  return (
    <Badge tone="neutral" icon={<Archive className="h-3.5 w-3.5" aria-hidden="true" />} className={className}>
      {ITEM_STATUS_LABELS.DISPOSED}
    </Badge>
  );
}

const ROLE_TONE: Record<Role, BadgeTone> = {
  ADMIN: "violet",
  STAFF: "brand",
};

const ROLE_ICON: Record<Role, ReactNode> = {
  ADMIN: <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />,
  STAFF: <IdCard className="h-3.5 w-3.5" aria-hidden="true" />,
};

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <Badge tone={ROLE_TONE[role]} icon={ROLE_ICON[role]} className={className}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}

/** §3.2 request maps — the same vocabulary the Phase 2 queue screens reuse. */
const REQUEST_STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};

const REQUEST_STATUS_ICON: Record<RequestStatus, ReactNode> = {
  PENDING: <Clock className="h-3.5 w-3.5" aria-hidden="true" />,
  APPROVED: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
  REJECTED: <XCircle className="h-3.5 w-3.5" aria-hidden="true" />,
};

export function RequestStatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <Badge tone={REQUEST_STATUS_TONE[status]} icon={REQUEST_STATUS_ICON[status]} className={className}>
      {REQUEST_STATUS_LABELS[status]}
    </Badge>
  );
}

const REQUEST_TYPE_TONE: Record<RequestType, BadgeTone> = {
  TRANSFER: "info",
  DISPOSAL: "orange",
};

const REQUEST_TYPE_ICON: Record<RequestType, ReactNode> = {
  TRANSFER: <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />,
  DISPOSAL: <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />,
};

export function RequestTypeBadge({ type, className }: { type: RequestType; className?: string }) {
  return (
    <Badge tone={REQUEST_TYPE_TONE[type]} icon={REQUEST_TYPE_ICON[type]} className={className}>
      {REQUEST_TYPE_LABELS[type]}
    </Badge>
  );
}
