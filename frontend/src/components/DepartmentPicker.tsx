import { useId, useMemo } from "react";
import { useItems } from "../hooks/useItems";
import { cn } from "../lib/cn";
import { Input } from "./Input";
import { Select } from "./Select";

export interface DepartmentPickerProps {
  // `| undefined` explicitly on every optional prop: this project runs with
  // `exactOptionalPropertyTypes`, so `foo?: string` means "present ⇒ string"
  // and does *not* accept a passed-in `undefined`. The parent often forwards a
  // value typed `string | undefined`, so the explicit union is what makes that
  // forwarding legal rather than an error.
  label?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  disabled?: boolean | undefined;
  required?: boolean | undefined;
  className?: string | undefined;
}

/**
 * §8's DepartmentPicker, in one of two modes — the reason for the split is gap
 * G9 (frontend-plan.md §12): `department` is a free-text `String` on `Item`
 * with **no** `GET /departments` endpoint.
 *
 * - **free-entry** (item registration/edit): an `Input` that suggests known
 *   values via `datalist` but accepts a brand-new department — registration
 *   must be able to invent one.
 * - **locked** (audit scope): a plain `Select` restricted to known values —
 *   completion matches `scopeValue` against `Item.department` **exactly and
 *   case-sensitively**, so free text here silently zeroes an audit's scope.
 *
 * The known-values list is derived from `GET /items` (high limit, one fetch),
 * the only source that exists. It is best-effort by nature.
 */
export function DepartmentPicker({
  label = "Department",
  value,
  onChange,
  error,
  disabled,
  required,
  className,
}: DepartmentPickerProps) {
  const knownDepartments = useKnownDepartments();

  return (
    <div className={className}>
      <FreeEntryPicker
        label={label}
        value={value}
        onChange={onChange}
        error={error}
        disabled={disabled}
        required={required}
        knownDepartments={knownDepartments}
      />
    </div>
  );
}

/** One page of the inventory is enough to learn the department vocabulary (limit caps at 100). */
function useKnownDepartments(): string[] {
  const itemsQuery = useItems({ page: 1, limit: 100 });
  return useMemo(() => {
    const names = new Set<string>((itemsQuery.data?.data ?? []).map((item) => item.department));
    return Array.from(names)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [itemsQuery.data]);
}

function FreeEntryPicker({
  label,
  value,
  onChange,
  error,
  disabled,
  required,
  knownDepartments,
}: Omit<DepartmentPickerProps, "className" | "label"> & {
  label: string;
  knownDepartments: string[];
}) {
  const listId = useId();
  return (
    <>
      <Input
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
        disabled={disabled}
        required={required}
        list={listId}
        placeholder="e.g. Computer Science"
        autoComplete="off"
      />
      <datalist id={listId}>
        {knownDepartments.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}

/** The locked variant, exported separately so the audit form cannot pick the wrong mode by accident. */
export function LockedDepartmentPicker({
  label = "Department",
  value,
  onChange,
  error,
  disabled,
  className,
}: Omit<DepartmentPickerProps, "required" | "label"> & { label?: string | undefined }) {
  const itemsQuery = useItems({ page: 1, limit: 100 });
  const knownDepartments = useMemo(
    () =>
      Array.from(new Set((itemsQuery.data?.data ?? []).map((item) => item.department)))
        .filter(Boolean)
        .sort(),
    [itemsQuery.data],
  );

  return (
    <Select
      label={label}
      className={cn(className)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error}
      disabled={disabled}
      options={knownDepartments.map((name) => ({ value: name, label: name }))}
      placeholder={itemsQuery.isPending ? "Loading departments…" : "Select a department"}
      hint={
        itemsQuery.isError
          ? "Couldn't load the known departments — the list may be incomplete."
          : "Only departments already used on items are listed (audit scope must match exactly)."
      }
    />
  );
}
