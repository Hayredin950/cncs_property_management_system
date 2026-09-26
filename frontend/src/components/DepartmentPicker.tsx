import { useMemo } from "react";
import { useItems } from "../hooks/useItems";
import { cn } from "../lib/cn";
import { CNCS_DEPARTMENTS } from "../lib/departments";
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
  hint?: string | undefined;
  className?: string | undefined;
}

/**
 * §8's DepartmentPicker.
 *
 * A `Select`, not free text. The college's department vocabulary is known
 * (`lib/departments.ts`), so registration picks from it rather than inventing a
 * spelling — the old `datalist`-backed input *suggested* values but accepted
 * anything, which is how "Computer Science" and "computer science" become two
 * departments and why the audit scope (which matches exactly and
 * case-sensitively) could silently count zero.
 *
 * The options are the canonical CNCS list, unioned with the departments already
 * used on items *and* the current value. Two reasons for the union:
 *
 *   - existing rows may carry a department outside the list (the column is
 *     free text), and editing such an item must not blank the field;
 *   - the current value is included even if it is not in the first page of
 *     `GET /items`, so no edit can silently change a value the user never saw.
 */
export function DepartmentPicker({
  label = "Department",
  value,
  onChange,
  error,
  disabled,
  required,
  hint,
  className,
}: DepartmentPickerProps) {
  const knownDepartments = useKnownDepartments();
  const options = useDepartmentOptions(knownDepartments, value);

  return (
    <Select
      label={label}
      className={cn(className)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error}
      disabled={disabled}
      required={required}
      hint={hint}
      options={options}
      placeholder="Select a department"
    />
  );
}

/**
 * The known values are still derived from `GET /items` (best-effort, high limit)
 * so a legacy value stays selectable; the canonical list is the floor beneath
 * them.
 */
function useKnownDepartments(): string[] {
  const itemsQuery = useItems({ page: 1, limit: 100 });
  return useMemo(() => {
    const names = new Set<string>((itemsQuery.data?.data ?? []).map((item) => item.department));
    return Array.from(names).filter(Boolean);
  }, [itemsQuery.data]);
}

function useDepartmentOptions(known: string[], current: string) {
  return useMemo(() => {
    const names = new Set<string>(CNCS_DEPARTMENTS);
    for (const name of known) names.add(name);
    if (current) names.add(current);
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [known, current]);
}

/**
 * The locked variant, exported separately so the audit form cannot pick the
 * wrong mode by accident. Same option source as `DepartmentPicker`, but without
 * the free-entry escape hatch the old component had and without being tied to
 * an editable row's current value.
 */
export function LockedDepartmentPicker({
  label = "Department",
  value,
  onChange,
  error,
  disabled,
  className,
}: Omit<DepartmentPickerProps, "required" | "label"> & { label?: string | undefined }) {
  const knownDepartments = useKnownDepartments();
  const options = useDepartmentOptions(knownDepartments, value);

  return (
    <Select
      label={label}
      className={cn(className)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error}
      disabled={disabled}
      options={options}
      placeholder="Select a department"
    />
  );
}
