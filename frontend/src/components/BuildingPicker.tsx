import { useId, useMemo } from "react";
import { useBuildings } from "../hooks/useBuildings";
import { cn } from "../lib/cn";
import { Input } from "./Input";

export interface BuildingPickerProps {
  label?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  disabled?: boolean | undefined;
  required?: boolean | undefined;
  hint?: string | undefined;
  className?: string | undefined;
  placeholder?: string | undefined;
}

export const DEFAULT_CNCS_BUILDINGS = [
  { name: "CNCS Building", code: "CNCS-BLD" },
  { name: "Science Complex", code: "SCI-CMPLX" },
  { name: "Chemistry Building", code: "CHEM-BLD" },
  { name: "Physics Building", code: "PHYS-BLD" },
];

/**
 * BuildingPicker dropdown.
 * Provides building suggestions from backend and CNCS defaults via datalist,
 * while allowing direct entry and full typing support.
 */
export function BuildingPicker({
  label = "Building",
  value,
  onChange,
  error,
  disabled,
  required,
  hint,
  className,
  placeholder = "Select or type a building",
}: BuildingPickerProps) {
  const datalistId = useId();
  const buildingsQuery = useBuildings();

  const options = useMemo(() => {
    const list: Array<{ value: string; label: string }> = [];
    const seen = new Set<string>();

    const apiBuildings = buildingsQuery.data ?? [];
    for (const b of apiBuildings) {
      if (!seen.has(b.name)) {
        seen.add(b.name);
        list.push({ value: b.name, label: `${b.name} (${b.code})` });
      }
    }

    for (const b of DEFAULT_CNCS_BUILDINGS) {
      if (!seen.has(b.name)) {
        seen.add(b.name);
        list.push({ value: b.name, label: `${b.name} (${b.code})` });
      }
    }

    return list;
  }, [buildingsQuery.data]);

  return (
    <div className={cn("relative", className)}>
      <Input
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={datalistId}
        error={error}
        disabled={disabled}
        required={required}
        hint={hint}
        placeholder={placeholder}
      />
      <datalist id={datalistId}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </datalist>
    </div>
  );
}
