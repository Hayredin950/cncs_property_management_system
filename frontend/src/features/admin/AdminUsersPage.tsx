import { zodResolver } from "@hookform/resolvers/zod";
import {Check, ClipboardCopy, Mail, Pencil, Send, ShieldCheck, Trash2, UserPlus, X, KeyRound, ClipboardCheck, UserX } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "../../app/AuthContext";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { IconButton } from "../../components/IconButton";
import { Input } from "../../components/Input";
import { Modal } from "../../components/Modal";
import { Select } from "../../components/Select";
import { Skeleton } from "../../components/Skeleton";
import { Textarea } from "../../components/Textarea";
import { Badge } from "../../components/Badge";
import { RoleBadge } from "../../components/StatusBadges";
import { INVITABLE_ROLES, ROLE_LABELS, ROLES, type InvitableRole, type Role } from "../../types/enums";
import {
  useApproveUser,
  useDeactivateUser,
  useResendInvite,
  useDeleteUser,
  useInviteUser,
  usePromoteUser,
  useRejectUser,
  useUpdateUser,
} from "../../hooks/useAuthMutations";
import { useApprovals, useDecidedAccounts, useInvitableUnits, useUsers } from "../../hooks/useUsers";
import { requestPasswordReset } from "../../api/auth";
import { formatDateUTC, formatRelativeTime } from "../../lib/formatters";
import { ApiError } from "../../types/api";
import type { InviteAccountResponse, UserSummary } from "../../types/user";

/**
 * The invite form (T6).
 *
 * `authorizedBy` and `authorizationRef` are **required**, and the labels say what
 * they are for rather than what they are called: no role inside the app sits above
 * a Head, an Officer or an Auditor (D3), so the appointment was decided outside
 * the system and the system's job is to record who decided it and under which
 * letter. The server enforces the same two fields, so this is a form that asks for
 * what the API demands rather than the API refusing what the form allowed.
 *
 * There is no password field, and that is the requirement rather than an omission:
 * the account is created unable to sign in, and the invitee chooses their own
 * password through the single-use link.
 */
const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(INVITABLE_ROLES),
  unitId: z.string().trim().optional(),
  authorizedBy: z.string().trim().min(1, "Who authorized this appointment?"),
  authorizationRef: z.string().trim().min(1, "The letter number or equivalent is required"),
  authorizationNote: z.string().trim().optional(),
});

type InviteFormValues = z.infer<typeof inviteSchema>;

/** The five spec roles (2.1), in the order `types/enums.ts` declares them. */
const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

/** Only the four roles D2 says are never self-registered. */
const INVITE_ROLE_OPTIONS = INVITABLE_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

/**
 * `/admin/users` — Account administration (RequireAuth gates the route; every endpoint it
 * calls re-checks the role server-side).
 *
 * - SYSTEM_ADMIN: full access (approvals, invites, accounts management)
 * - DEPARTMENT_HEAD: approvals tab only (for their department's staff requests)
 *
 * F1.3 used to be create-only, because the backend had no list, update or delete
 * endpoint (gap G2). It now has all of them, so this screen is what an
 * administrator actually needs: every account, what it owns, and the operations
 * on it.
 *
 * ### A role change is its own action, behind a confirmation that names it
 *
 * The five roles (spec 2.1) differ in what they may do, so a role change is a
 * permission change, not a profile edit: it is never part of the name/email form
 * and it never happens on a bare click. The dialog states which role the account
 * is becoming, and the server ends every session that account holds, so a
 * permission the change removed cannot outlive it (gap-analysis E10).
 *
 * An administrator cannot change **their own** role from here, for the same
 * reason they cannot delete themselves: a single mis-click would lock them out of
 * this page with no way back in.
 *
 * ### Delete is fenced by the record
 *
 * An account that owns items, filed or reviewed a request, ran an audit or made
 * an edit is part of the record (F7.2), and the server refuses to delete it. The
 * list shows each account's item count so that is visible before the attempt.
 */
export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const isSystemAdmin = currentUser?.role === "SYSTEM_ADMIN";
  const isDeptHead = currentUser?.role === "DEPARTMENT_HEAD";
  const showInviteTab = isSystemAdmin;
  const showAccountsTab = isSystemAdmin;

  // The full account list is `GET /users`, which needs USER_READ — a System
  // Admin and a Property Officer have it, a Department Head does not. The
  // head's screen shows the approvals queue (which they may act on), so asking
  // for the list they may not read only earned a 403 on every visit.
  const usersQuery = useUsers(isSystemAdmin);
  const approvalsQuery = useApprovals(isSystemAdmin || isDeptHead);
  const decidedQuery = useDecidedAccounts(isSystemAdmin || isDeptHead);
  const decidedAccounts = decidedQuery.data ?? [];
  const unitsQuery = useInvitableUnits(isSystemAdmin);
  const inviteMutation = useInviteUser();
  const updateMutation = useUpdateUser();

  // Tab state. A Department Head's job on this screen is the approval queue,
  // so that is where they land; a System Admin's is the account list, and
  // landing them on a queue they also own was leaving them one click away
  // from the work they do most. (Both branches used to be "approvals" — a
  // leftover from when the screen had no tabs at all.)
  const [activeTab, setActiveTab] = useState<"approvals" | "decided" | "invite" | "accounts">(
    isDeptHead ? "approvals" : "accounts",
  );

  // Search and filter state for Existing Accounts tab
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [dateSort, setDateSort] = useState<"newest" | "oldest">("newest");
  const promoteMutation = usePromoteUser();
  const [resetSent, setResetSent] = useState<string | null>(null);
  const deleteMutation = useDeleteUser();
  const closeMutation = useDeactivateUser();
  const resendMutation = useResendInvite();
  const approveMutation = useApproveUser();
  const rejectMutation = useRejectUser();

  const [inviteError, setInviteError] = useState<string | null>(null);
  /**
   * The invitation just issued. Shown as a panel rather than only toasted, because
   * the link is the one thing the administrator has to be able to copy: with no
   * mail transport configured the response reports `email: "skipped"`, and a
   * toast that scrolls away would leave an invitation nobody can deliver.
   */
  const [issued, setIssued] = useState<InviteAccountResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [passwordFor, setPasswordFor] = useState<UserSummary | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<UserSummary | null>(null);
  const [nextRole, setNextRole] = useState<Role>("STAFF");
  const [confirmingRole, setConfirmingRole] = useState<UserSummary | null>(null);
  const [deleting, setDeleting] = useState<UserSummary | null>(null);
  const [closing, setClosing] = useState<UserSummary | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [approving, setApproving] = useState<UserSummary | null>(null);
  const [approveRole, setApproveRole] = useState<Role>("STAFF");
  const [rejecting, setRejecting] = useState<UserSummary | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: "DEPARTMENT_HEAD", unitId: "" },
  });

  /** A unit is part of the appointment only for a head: the other roles are college-wide. */
  const invitedRole = watch("role") as InvitableRole;
  const needsUnit = invitedRole === "DEPARTMENT_HEAD";
  const units = unitsQuery.data ?? [];

  async function onInvite(values: InviteFormValues) {
    setInviteError(null);
    if (values.role === "DEPARTMENT_HEAD" && !values.unitId) {
      setInviteError("Choose the department this head is being appointed to.");
      return;
    }
    try {
      const result = await inviteMutation.mutateAsync({
        email: values.email,
        role: values.role,
        unitId: values.role === "DEPARTMENT_HEAD" ? values.unitId : null,
        authorizedBy: values.authorizedBy,
        authorizationRef: values.authorizationRef,
        // An untouched textarea is `""`, which is not a note — the server would
        // store nothing either way, and sending `null` says so at the boundary.
        authorizationNote: values.authorizationNote?.trim() || null,
      });
      setIssued(result);
      setCopied(false);
      reset({ email: "", role: values.role, unitId: "", authorizedBy: "", authorizationRef: "", authorizationNote: "" });
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Couldn't reach the server.");
    }
  }

  async function copyInviteLink() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.inviteUrl);
      setCopied(true);
    } catch {
      // Clipboard access can be refused (insecure origin, permission). The link is
      // on screen and selectable either way, so this is not worth an error state.
      setCopied(false);
    }
  }

  function openRoleChange(account: UserSummary) {
    setChangingRole(account);
    setNextRole(account.role);
  }

  function openEdit(account: UserSummary) {
    setEditing(account);
    setEditFullName(account.fullName);
    setEditEmail(account.email);
    setEditError(null);
  }

  async function onSaveEdit() {
    if (!editing) return;
    const fullName = editFullName.trim();
    const email = editEmail.trim();
    if (!fullName || !email) {
      setEditError("Name and email are both required");
      return;
    }
    setEditError(null);
    try {
      await updateMutation.mutateAsync({ id: editing.id, payload: { fullName, email } });
      setEditing(null);
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : "Couldn't reach the server.");
    }
  }

  /**
   * Send the account holder a password-reset link.
   *
   * There is deliberately **no place in this screen where an administrator can
   * set another person's password**. The rule is absolute (workflow spec
   * §10.2): nobody — of any role — ever sees or sets a password they do not
   * own, because a password that an administrator reads is a password that can
   * be read again, and it also puts the administrator in a position to act as
   * the account. The recovery path is a single-use link to the account's own
   * address; the account holder chooses the new password themselves.
   *
   * (The old screen had a "Change password" dialog for the administrator that
   * no button ever opened — dead UI that documented the wrong rule. It is gone.)
   */
  async function onSendResetLink() {
    if (!passwordFor) return;
    setPasswordError(null);
    try {
      await requestPasswordReset(passwordFor.email);
      setResetSent(passwordFor.email);
      setPasswordFor(null);
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Couldn't reach the server.");
    }
  }

  const accounts = usersQuery.data ?? [];
  const pending = approvalsQuery.data ?? [];

  // Filter and sort accounts for Existing Accounts tab
  const filteredAccounts = accounts
    .filter((account) => {
      const matchesSearch =
        searchQuery === "" ||
        account.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        account.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === "all" || account.role === roleFilter;
      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateSort === "newest" ? dateB - dateA : dateA - dateB;
    });
  const rejectTrimmed = rejectReason.trim();
  const rejectValid = rejectTrimmed.length >= 3 && rejectTrimmed.length <= 500;

  async function onApprove() {
    if (!approving) return;
    try {
      await approveMutation.mutateAsync({ id: approving.id, role: approveRole });
      setApproving(null);
    } catch {
      // Toast is already raised by the mutation.
    }
  }

  async function onReject() {
    if (!rejecting || !rejectValid) {
      setRejectError(
        rejectTrimmed.length === 0
          ? "A reason is required"
          : rejectTrimmed.length < 3
            ? "At least 3 characters"
            : "At most 500 characters",
      );
      return;
    }
    setRejectError(null);
    try {
      await rejectMutation.mutateAsync({ id: rejecting.id, reason: rejectTrimmed });
      setRejecting(null);
      setRejectReason("");
    } catch {
      // Toast is already raised by the mutation.
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Accounts</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isSystemAdmin
            ? "Every account in the system, and what it owns. Only administrators can see this page."
            : "Approve staff account requests for your department."}
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("approvals")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "approvals"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Waiting for Approval {pending.length > 0 && `(${pending.length})`}
        </button>
        {/* The decisions half of the job. The queue empties itself as the work
            gets done, so without this the only trace of a decision is the
            notification that went out with it. */}
        <button
          onClick={() => setActiveTab("decided")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "decided"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Decided {decidedAccounts.length > 0 && `(${decidedAccounts.length})`}
        </button>
        {showInviteTab && (
          <button
            onClick={() => setActiveTab("invite")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "invite"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Invite an Account
          </button>
        )}
        {showAccountsTab && (
          <button
            onClick={() => setActiveTab("accounts")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "accounts"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Existing Accounts {accounts.length > 0 && `(${accounts.length})`}
          </button>
        )}
      </div>

      {/* The accounts this viewer has already decided. */}
      {activeTab === "decided" && (
        <section>
          {decidedQuery.isPending ? (
            <p className="text-sm text-slate-500">Loading the accounts you decided…</p>
          ) : decidedQuery.isError ? (
            <ErrorState
              heading="Couldn't load your decisions"
              body={decidedQuery.error instanceof Error ? decidedQuery.error.message : undefined}
            />
          ) : decidedAccounts.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="h-8 w-8" />}
              heading="You haven't decided any accounts yet"
              body="The accounts you approve or decline will be listed here, with the decision you made."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {decidedAccounts.map((account) => (
                <li
                  key={account.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{account.fullName}</p>
                    <p className="truncate text-sm text-slate-500">{account.email}</p>
                    {account.reviewNote && (
                      <p className="mt-1 text-xs text-slate-500">{account.reviewNote}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={account.accountStatus === "ACTIVE" ? "success" : "neutral"}>
                      {account.accountStatus === "ACTIVE" ? "Approved" : account.accountStatus}
                    </Badge>
                    {account.reviewedAt && (
                      <span className="text-xs text-slate-400">
                        {formatRelativeTime(account.reviewedAt)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Tab 1: Waiting for Approval */}
      {activeTab === "approvals" && (
        <section>
          {approvalsQuery.isPending ? (
            <div className="flex flex-col gap-2" role="status" aria-label="Loading approval queue">
              {Array.from({ length: 2 }).map((_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : approvalsQuery.isError ? (
            <ErrorState
              heading="Couldn't load the approval queue"
              body={approvalsQuery.error instanceof Error ? approvalsQuery.error.message : undefined}
              action={
                <Button size="sm" onClick={() => approvalsQuery.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : pending.length === 0 ? (
            <Card className="text-sm text-slate-500">No account requests waiting.</Card>
          ) : (
          <ul className="flex flex-col gap-2">
            {pending.map((account) => {
              const isSelf = account.id === currentUser?.id;
              return (
                <li key={account.id}>
                  <Card className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words font-semibold text-slate-900">{account.fullName}</span>
                        {isSelf && <span className="text-xs text-slate-500">(you)</span>}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-slate-600">{account.email}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Requested {formatDateUTC(account.createdAt) ?? "—"}
                      </p>
                    </div>

                    {isSelf ? (
                      <p className="text-xs text-slate-500">You cannot approve your own account</p>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          leftIcon={<Check className="h-4 w-4" />}
                          onClick={() => {
                            setApproving(account);
                            setApproveRole("STAFF");
                          }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<X className="h-4 w-4" />}
                          onClick={() => {
                            setRejecting(account);
                            setRejectReason("");
                            setRejectError(null);
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        </section>
      )}

      {/* Tab 2: Invite an Account */}
      {showInviteTab && activeTab === "invite" && (
        <section>
          <Card>
            <form onSubmit={handleSubmit(onInvite)} noValidate className="flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Invite an account
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  For heads, property officers, auditors and system admins — the accounts nobody can
                  register for themselves. They choose their own password from the link, so no
                  administrator ever sets or knows it. Staff ask for an account on the public request
                  page and a head approves them.
                </p>
              </div>

          <Input
            label="Email"
            type="email"
            autoComplete="off"
            error={errors.email?.message}
            {...register("email")}
            required
          />
          <Select
            label="Role"
            options={INVITE_ROLE_OPTIONS}
            hint="It decides what they can do, not just what they see — the matrix is in spec 2.2."
            error={errors.role?.message}
            {...register("role")}
            required
          />

          {needsUnit && (
            <Select
              label="Department"
              options={units.map((unit) => ({
                value: unit.id,
                label: unit.hasActiveHead ? `${unit.name} — already has a head` : unit.name,
              }))}
              error={errors.unitId?.message}
              hint="One head per department. A department already headed cannot take a second."
              {...register("unitId")}
              required
            />
          )}

          {/**
            The two fields that make this an appointment rather than a creation. Both
            required, both recorded on the invite and on the append-only log — see D3
            in `docs/cncs-pms-account-approval-authority.md`.
          */}
          <Input
            label="Authorized by"
            hint="The office or person who authorized this appointment outside the system."
            error={errors.authorizedBy?.message}
            {...register("authorizedBy")}
            required
          />
          <Input
            label="Authorization reference"
            hint="The letter number, minute or equivalent — so the authority can be checked later."
            error={errors.authorizationRef?.message}
            {...register("authorizationRef")}
            required
          />
          <Textarea
            label="Note (optional)"
            rows={2}
            hint="Anything about the appointment worth keeping with it."
            error={errors.authorizationNote?.message}
            {...register("authorizationNote")}
          />

          {inviteError && (
            <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {inviteError}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" leftIcon={<UserPlus className="h-4 w-4" />} loading={isSubmitting}>
              Send invite
            </Button>
          </div>
        </form>
      </Card>

      {issued && (
        <Card className="flex flex-col gap-3 border-brand-200 bg-brand-50/40">
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">
                {issued.invite.renewed ? "New link issued for" : "Invitation ready for"}{" "}
                {issued.invite.email}
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                {issued.email === "sent"
                  ? "The link has been emailed to them."
                  : "No mail transport is configured, so nothing was emailed — pass this link on yourself."}{" "}
                It works once, and expires {formatDateUTC(issued.invite.expiresAt) ?? "in 72 hours"}. They
                will set their own password when they open it.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
              {issued.inviteUrl}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              leftIcon={<ClipboardCopy className="h-4 w-4" />}
              onClick={() => void copyInviteLink()}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setIssued(null)}>
              Done
            </Button>
          </div>
        </Card>
        )}
      </section>
      )}

      {/* Tab 3: Existing Accounts */}
      {showAccountsTab && activeTab === "accounts" && (
        <section>
          {resetSent && (
            <p
              role="status"
              className="mb-4 rounded-md border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-800"
            >
              A password reset link has been sent to {resetSent}. The account holder chooses
              the new password from that link.
            </p>
          )}
          {/* Search and Filter Controls */}
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <Input
                label="Search"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select
              label="Role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
              options={[
                { value: "all", label: "All Roles" },
                ...ROLE_OPTIONS,
              ]}
            />
            <Select
              label="Sort by"
              value={dateSort}
              onChange={(e) => setDateSort(e.target.value as "newest" | "oldest")}
              options={[
                { value: "newest", label: "Newest First" },
                { value: "oldest", label: "Oldest First" },
              ]}
            />
          </div>

          {usersQuery.isPending ? (
            <div className="flex flex-col gap-2" role="status" aria-label="Loading accounts">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            </div>
          ) : usersQuery.isError ? (
            <ErrorState
              heading="Couldn't load accounts"
              body={usersQuery.error instanceof Error ? usersQuery.error.message : undefined}
              action={
                <Button size="sm" onClick={() => usersQuery.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : filteredAccounts.length === 0 ? (
            <Card className="text-sm text-slate-500">
              {searchQuery || roleFilter !== "all" ? "No accounts match your filters." : "No accounts yet."}
            </Card>
          ) : (
          <ul className="flex flex-col gap-2">
            {filteredAccounts.map((account) => {
              const isSelf = account.id === currentUser?.id;
              const ownsItems = account.itemCount > 0;
              return (
                <li key={account.id}>
                  <Card className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words font-semibold text-slate-900">{account.fullName}</span>
                        <RoleBadge role={account.role} />
                        {isSelf && <span className="text-xs text-slate-500">(you)</span>}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-slate-600">{account.email}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {ownsItems
                          ? `${account.itemCount} item${account.itemCount === 1 ? "" : "s"} · `
                          : "No items · "}
                        joined {formatDateUTC(account.createdAt) ?? "—"}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <IconButton
                        size="sm"
                        variant="outline"
                        icon={<Pencil className="h-4 w-4" aria-hidden="true" />}
                        label={`Edit ${account.fullName}`}
                        onClick={() => openEdit(account)}
                      />
                      <IconButton
                        size="sm"
                        variant="outline"
                        icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                        label={
                          isSelf
                            ? "You cannot change your own role"
                            : `Change role for ${account.fullName}`
                        }
                        disabled={isSelf}
                        onClick={() => openRoleChange(account)}
                      />
                      <IconButton
                        size="sm"
                        variant="outline"
                        icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
                        label={`Send a password reset link to ${account.email}`}
                        onClick={() => {
                          setPasswordError(null);
                          setPasswordFor(account);
                        }}
                      />
                      {/*
                        An invitation that has not been accepted can be sent
                        again. The endpoint reissues the single-use token, so a
                        link that leaked cannot be used after a resend — which is
                        exactly what somebody needs when the mail never arrived.
                        Only for an account still waiting to accept: an active
                        account has no invitation to resend.
                      */}
                      {account.accountStatus === "PENDING_EMAIL_VERIFICATION" && (
                        <IconButton
                          size="sm"
                          variant="outline"
                          icon={<Send className="h-4 w-4" aria-hidden="true" />}
                          label={`Resend the invitation to ${account.email}`}
                          onClick={() => resendMutation.mutate(account.id)}
                        />
                      )}
                      {/* Closing an account, not deleting it. The account
                          stays, it cannot sign in again, and the items it
                          held move to REVERTED_UNVERIFIED for the department
                          head to verify one by one. The reason is required and
                          is written to the account's record. */}
                      <IconButton
                        size="sm"
                        variant="outline"
                        icon={<UserX className="h-4 w-4" aria-hidden="true" />}
                        label={
                          isSelf
                            ? "You cannot close your own account"
                            : `Close the account of ${account.fullName}`
                        }
                        disabled={isSelf || account.accountStatus === "DEACTIVATED"}
                        onClick={() => {
                          setClosing(account);
                          setCloseReason("");
                        }}
                      />
                      <IconButton
                        size="sm"
                        variant="outline"
                        icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                        label={isSelf ? "You cannot delete your own account" : `Delete ${account.fullName}`}
                        disabled={isSelf}
                        onClick={() => setDeleting(account)}
                      />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
        </section>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.fullName}` : "Edit account"}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSaveEdit();
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label="Full name"
            value={editFullName}
            onChange={(event) => setEditFullName(event.target.value)}
            required
          />
          <Input
            label="Email"
            type="email"
            value={editEmail}
            onChange={(event) => setEditEmail(event.target.value)}
            error={editError ?? undefined}
            required
          />
          <p className="text-xs text-slate-500">
            The role is not editable here — promoting is its own action, and there is no demote.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(null)} disabled={updateMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={updateMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={passwordFor !== null}
        onClose={() => setPasswordFor(null)}
        title={passwordFor ? `Reset access for ${passwordFor.fullName}` : "Reset access"}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-neutral-600">
            Send a single-use reset link to{" "}
            <span className="font-medium text-neutral-900">{passwordFor?.email}</span>. The
            account holder chooses the new password themselves — no administrator ever sees
            or sets another person&apos;s password.
          </p>
          {passwordError && (
            <p role="alert" className="text-sm text-danger-700">
              {passwordError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPasswordFor(null)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => void onSendResetLink()}>
              Send reset link
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={changingRole !== null}
        onClose={() => setChangingRole(null)}
        title={changingRole ? `Change role for ${changingRole.fullName}` : "Change role"}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            // The confirm step below is what actually sends the change; this
            // modal only picks the role, so that the confirmation can name it.
            if (!changingRole || nextRole === changingRole.role) return;
            setConfirmingRole(changingRole);
            setChangingRole(null);
          }}
          className="flex flex-col gap-4"
        >
          <Select
            label="New role"
            options={ROLE_OPTIONS}
            value={nextRole}
            onChange={(event) => setNextRole(event.target.value as Role)}
            hint={changingRole ? `Currently ${ROLE_LABELS[changingRole.role]}.` : undefined}
            required
          />
          <p className="text-xs text-slate-500">
            A role decides what an account may do (spec 2.2). Changing it ends every session that account is
            signed into, so the new role is the only one it can act under.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setChangingRole(null)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!changingRole || nextRole === changingRole.role}>
              Continue
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmingRole !== null}
        onClose={() => setConfirmingRole(null)}
        onConfirm={() => {
          if (confirmingRole) {
            promoteMutation.mutate(
              { id: confirmingRole.id, role: nextRole },
              { onSuccess: () => setConfirmingRole(null) },
            );
          }
        }}
        title={confirmingRole ? `Make ${confirmingRole.fullName} a ${ROLE_LABELS[nextRole]}?` : "Change role"}
        loading={promoteMutation.isPending}
        confirmLabel={`Set role to ${ROLE_LABELS[nextRole]}`}
        body={
          <>
            <strong>{confirmingRole?.fullName}</strong> becomes <strong>{ROLE_LABELS[nextRole]}</strong>.{" "}
            {nextRole === "SYSTEM_ADMIN" && (
              <>
                That is full administrator access — every account, the approval queue, and this page.
              </>
            )}
            <br />
            <br />
            The change takes effect immediately: every session this account is signed into ends, so nothing
            it could do a moment ago is left running under the old role.
            <br />
            <br />
            Only set a role this person should actually have.
          </>
        }
      />

      <Modal
        open={closing !== null}
        onClose={() => setClosing(null)}
        title={closing ? `Close the account of ${closing.fullName}` : "Close the account"}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600">
            The account cannot sign in again, and the items it held move to
            &quot;returned unverified&quot; so the department head can check them one by one.
            The account itself is kept, with its record.
          </p>
          <Textarea
            label="Why is the account being closed"
            hint="Required. It is written to the account's record."
            value={closeReason}
            onChange={(event) => setCloseReason(event.target.value)}
            required
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setClosing(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              loading={closeMutation.isPending}
              disabled={!closeReason.trim()}
              onClick={() => {
                if (!closing) return;
                closeMutation.mutate(
                  { id: closing.id, reason: closeReason.trim() },
                  { onSuccess: () => setClosing(null) },
                );
              }}
            >
              Close the account
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
        title={deleting ? `Delete ${deleting.fullName}?` : "Delete account"}
        tone="destructive"
        loading={deleteMutation.isPending}
        confirmLabel="Delete account"
        body={
          <>
            <strong>{deleting?.fullName}</strong> ({deleting?.email}) will be removed and can no longer sign in.
            <br />
            <br />
            This only works for an account with no items, requests, audits or edits — an account that is part of the
            record is preserved rather than destroyed (F7.2).
          </>
        }
      />

      <Modal
        open={approving !== null}
        onClose={() => setApproving(null)}
        title={approving ? `Approve ${approving.fullName}?` : "Approve account"}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onApprove();
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-slate-600">
            <strong>{approving?.fullName}</strong> ({approving?.email}) will be able to sign in. Assign the role
            they should hold — the request itself always asks as Staff.
          </p>
          <Select
            label="Role"
            options={ROLE_OPTIONS}
            value={approveRole}
            onChange={(event) => setApproveRole(event.target.value as Role)}
            hint="It decides what they can do, not just what they see — the matrix is in spec 2.2."
            required
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApproving(null)}
              disabled={approveMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={approveMutation.isPending}>
              Approve
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={rejecting ? `Reject ${rejecting.fullName}?` : "Reject account"}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onReject();
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-slate-600">
            <strong>{rejecting?.fullName}</strong> will not be able to sign in. Give a reason — they need to know
            why, and the same address cannot ask again into a void.
          </p>
          <Textarea
            label="Rejection reason (required)"
            hint="3–500 characters."
            value={rejectReason}
            onChange={(event) => {
              setRejectReason(event.target.value);
              setRejectError(null);
            }}
            error={
              rejectError ??
              (rejectTrimmed.length > 0 && rejectTrimmed.length < 3
                ? "At least 3 characters."
                : undefined)
            }
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejecting(null)}
              disabled={rejectMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={!rejectValid}
              loading={rejectMutation.isPending}
            >
              Reject
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
