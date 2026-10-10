import { MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { formatCurrencyETB, formatDateUTC } from "../lib/formatters";
import { isPrivilegedItemView, type Item } from "../types/item";
import { CopyableTagId } from "./CopyableTagId";
import { ConditionBadge, ItemStatusBadge } from "./StatusBadges";
import { PhotoFrame } from "./PhotoFrame";

/**
 * The single item-rendering component (frontend-plan.md §7 "go further"):
 * derives every section **only** from keys actually present on `item`, so no
 * future screen invents its own "show this if admin" branch. A public viewer's
 * render is visibly shorter than a staff/admin one — that difference *is* the
 * access control (frontend-design-system.md §10.2), not a bug to patch over.
 *
 * Used by both the public `/item/:tagId` page and the staff `/items/:id` page —
 * the two never diverge in what they consider "the item's fields."
 */
export function ItemDetailView({ item }: { item: Item }) {
  const privileged = isPrivilegedItemView(item);

  return (
    <div className="grid gap-8 lg:grid-cols-[320px_1fr]">
      <div>
        <PhotoFrame src={item.photoUrl} alt={item.name} />
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{item.name}</h1>
            <ConditionBadge condition={item.condition} />
            {privileged && <ItemStatusBadge status={item.status} />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <CopyableTagId tagId={item.tagId} />
            <span aria-hidden="true">·</span>
            <span>{item.category.name}</span>
          </div>
        </div>

        <Section title="Location" icon={<MapPin className="h-4 w-4" />}>
          <FieldGrid>
            <Field label="Department" value={item.department} />
            <Field label="Building" value={item.building} />
            <Field label="Floor" value={item.floor} />
            <Field label="Room" value={item.room} />
          </FieldGrid>
        </Section>

        {privileged && (
          <Section title="Owner">
            <FieldGrid>
              <Field label="Custodian" value={item.owner.fullName} />
              <Field label="Email" value={item.owner.email} />
            </FieldGrid>
          </Section>
        )}

        {privileged && (
          <Section title="Value">
            <FieldGrid>
              <Field label="Purchase cost" value={formatCurrencyETB(item.purchaseCost)} />
              {item.currentValue != null && (
                <Field label="Current value" value={formatCurrencyETB(item.currentValue)} />
              )}
            </FieldGrid>
          </Section>
        )}

        {privileged && (item.brand || item.model || item.serialNumber) && (
          <Section title="Specs">
            <FieldGrid>
              {item.brand && <Field label="Brand" value={item.brand} />}
              {item.model && <Field label="Model" value={item.model} />}
              {item.serialNumber && <Field label="Serial number" value={item.serialNumber} mono />}
            </FieldGrid>
          </Section>
        )}

        {privileged && item.notes && (
          <Section title="Notes">
            <p className="whitespace-pre-wrap text-sm text-slate-700">{item.notes}</p>
          </Section>
        )}

        {privileged && item.accessories && item.accessories.length > 0 && (
          <Section title="Accessories">
            <ul className="flex flex-col gap-2">
              {item.accessories.map((accessory) => (
                <li
                  key={accessory.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-slate-900">{accessory.name}</span>
                  <span className="flex items-center gap-2">
                    <CopyableTagId tagId={accessory.tagId} />
                    <ConditionBadge condition={accessory.condition} />
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <p className="text-xs text-slate-400">Registered {formatDateUTC(item.registeredAt)}</p>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{children}</div>;
}

function Field({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-sm text-slate-900 ${mono ? "tag-id" : ""}`}>{value}</dd>
    </div>
  );
}
