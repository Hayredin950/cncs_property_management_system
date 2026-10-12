import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Pencil, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAuth } from "../../app/AuthContext";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ErrorState } from "../../components/ErrorState";
import { IconButton } from "../../components/IconButton";
import { Input } from "../../components/Input";
import { Modal } from "../../components/Modal";
import { Select } from "../../components/Select";
import { Skeleton } from "../../components/Skeleton";
import { RoleBadge } from "../../components/StatusBadges";
import { ROLE_LABELS, ROLES, type Role } from "../../types/enums";
import {
  useDeleteUser,
  usePromoteUser,
  useRegisterUser,
  useResetUserPassword,
  useUpdateUser,
} from "../../hooks/useAuthMutations";
import { useUsers } from "../../hooks/useUsers";
import { formatDateUTC } from "../../lib/formatters";
import { ApiError } from "../../types/api";
import type { UserSummary } from "../../types/user";

const createSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
  role: z.enum(ROLES),
});

type CreateFormValues = z.infer<typeof createSchema>;

/** The five spec roles (2.1), in the order `types/enums.ts` declares them. */
const ROLE_OPTIONS = ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

/**
 * `/admin/users` — **Admin only** (RequireAuth gates the route; every endpoint it
 * calls re-checks the role server-side).
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
  const usersQuery = useUsers();
  const registerMutation = useRegisterUser();
  const updateMutation = useUpdateUser();
  const promoteMutation = usePromoteUser();
  const passwordMutation = useResetUserPassword();
  const deleteMutation = useDeleteUser();

  const [createError, setCreateError] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserSummary | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [passwordFor, setPasswordFor] = useState<UserSummary | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<UserSummary | null>(null);
  const [nextRole, setNextRole] = useState<Role>("STAFF");
  const [confirmingRole, setConfirmingRole] = useState<UserSummary | null>(null);
  const [deleting, setDeleting] = useState<UserSummary | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: "STAFF" },
  });

  async function onCreate(values: CreateFormValues) {
    setCreateError(null);
    try {
      await registerMutation.mutateAsync(values);
      reset({ fullName: "", email: "", password: "", role: "STAFF" });
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Couldn't reach the server.");
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

  async function onChangePassword() {
    if (!passwordFor) return;
    if (newPassword.length < 8) {
      setPasswordError("At least 8 characters");
      return;
    }
    setPasswordError(null);
    try {
      await passwordMutation.mutateAsync({ id: passwordFor.id, password: newPassword });
      setPasswordFor(null);
      setNewPassword("");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Couldn't reach the server.");
    }
  }

  const accounts = usersQuery.data ?? [];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Accounts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every account in the system, and what it owns. Only administrators can see this page.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onCreate)} noValidate className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Create an account</h2>
          <Input label="Full name" error={errors.fullName?.message} {...register("fullName")} required />
          <Input
            label="Email"
            type="email"
            autoComplete="off"
            error={errors.email?.message}
            {...register("email")}
            required
          />
          <Input
            label="Temporary password"
            type="password"
            autoComplete="new-password"
            hint="Share it securely — they will be asked to choose their own the first time they sign in."
            error={errors.password?.message}
            {...register("password")}
            required
          />
          <Select
            label="Role"
            options={ROLE_OPTIONS}
            hint="It decides what they can do, not just what they see — the matrix is in spec 2.2."
            error={errors.role?.message}
            {...register("role")}
            required
          />

          {createError && (
            <p role="alert" className="rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-700">
              {createError}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="submit" leftIcon={<UserPlus className="h-4 w-4" />} loading={isSubmitting}>
              Create account
            </Button>
          </div>
        </form>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Existing accounts{accounts.length > 0 ? ` (${accounts.length})` : ""}
        </h2>

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
        ) : accounts.length === 0 ? (
          <Card className="text-sm text-slate-500">No accounts yet.</Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {accounts.map((account) => {
              const isSelf = account.id === currentUser?.id;
              const ownsItems = account.itemCount > 0;
              return (
                <li key={account.id}>
                  <Card className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{account.fullName}</span>
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
                        icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
                        label={`Change password for ${account.fullName}`}
                        onClick={() => {
                          setPasswordFor(account);
                          setNewPassword("");
                          setPasswordError(null);
                        }}
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
        title={passwordFor ? `Change password for ${passwordFor.fullName}` : "Change password"}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onChangePassword();
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            hint="At least 8 characters. Share it with the account holder securely."
            error={passwordError ?? undefined}
            required
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPasswordFor(null)}
              disabled={passwordMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={passwordMutation.isPending}>
              Change password
            </Button>
          </div>
        </form>
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
    </div>
  );
}
