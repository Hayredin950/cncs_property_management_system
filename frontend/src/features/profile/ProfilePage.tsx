import { CalendarDays, KeyRound, LogOut, Mail, User as UserIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../app/AuthContext";
import { PortalPageHeader } from "../../components/aau/PortalPageHeader";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { RoleBadge } from "../../components/StatusBadges";
import { formatDateUTC } from "../../lib/formatters";

/**
 * `/profile` — the account screen the phone has had all along.
 *
 * The web sidebar named the account (name, role) and offered Sign out, but
 * there was no page that answered "what is this account, and how do I change
 * its password?" — a question the phone's Profile answers in two taps. The
 * fields are read-only on purpose: a name and an email are set by the office
 * that owns the account, and the only self-service action is the password.
 */
export function ProfilePage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PortalPageHeader
        title="Profile"
        description="Your account, and the two things you can do with it."
      />

      <Card className="flex flex-col gap-0 p-0">
        <dl className="flex flex-col divide-y divide-slate-200">
          <div className="flex items-center gap-3 px-4 py-3">
            <UserIcon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">
              Name
            </dt>
            <dd className="min-w-0 truncate text-sm text-slate-900">{user?.fullName ?? "—"}</dd>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">
              Email
            </dt>
            <dd className="min-w-0 truncate text-sm text-slate-900">{user?.email ?? "—"}</dd>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <KeyRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">
              Role
            </dt>
            <dd className="min-w-0">{user?.role ? <RoleBadge role={user.role} /> : "—"}</dd>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">
              Joined
            </dt>
            <dd className="min-w-0 truncate text-sm text-slate-900">
              {formatDateUTC(user?.createdAt) ?? "—"}
            </dd>
          </div>
        </dl>
      </Card>

      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          fullWidth
          leftIcon={<KeyRound className="h-4 w-4" />}
          onClick={() => navigate("/change-password")}
        >
          Change password
        </Button>
        {/* Same convention as the sidebar: signing out is one subdued-danger
            action, never a red slab that reads like a deletion. */}
        <Button
          variant="ghost"
          fullWidth
          leftIcon={<LogOut className="h-4 w-4" />}
          className="text-danger-700 hover:bg-danger-50"
          onClick={signOut}
        >
          Sign out
        </Button>
      </div>

      <p className="px-1 text-xs text-slate-500">
        Your name and email are set by the property office. Every other account can be edited
        under Accounts.
      </p>
    </div>
  );
}
