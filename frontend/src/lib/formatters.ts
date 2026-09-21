/**
 * Money, dates, and tag-ID parsing — frontend-design-system.md §8/§4 and
 * frontend-plan.md §4/§8. Centralized here so no screen invents its own
 * formatting rule.
 */

/**
 * Purchase cost / current value are `Prisma.Decimal` serialized as strings
 * (e.g. `"45000"`) — never parsed with `Intl.NumberFormat`'s `currency: "ETB"`,
 * because `en-ET` ICU data for Birr is not guaranteed to resolve the same way in
 * every browser (frontend-plan.md §4, §13).
 */
export function formatCurrencyETB(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return null;

  const sign = num < 0 ? "-" : "";
  const parts = Math.abs(num).toFixed(2).split(".");
  const wholePart = parts[0] ?? "0";
  const fractionPart = parts[1] ?? "00";
  const grouped = wholePart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${sign}ETB ${grouped}.${fractionPart}`;
}

/** Report dates are UTC and a bare `dateTo` includes the whole UTC day (frontend-plan.md §7). */
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

function parseIso(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** e.g. "21 Sep 2026" — always UTC, no local-timezone drift. */
export function formatDateUTC(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = parseIso(iso);
  return date ? dateFormatter.format(date) : null;
}

/** e.g. "21 Sep 2026, 14:32 UTC" — the label makes the timezone explicit, per §8. */
export function formatDateTimeUTC(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = parseIso(iso);
  return date ? `${dateTimeFormatter.format(date)} UTC` : null;
}

const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
];
const MINUTE_MS = 60_000;

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "always", style: "short" });

/** e.g. "2h ago" — pair with `formatDateTimeUTC` as a title/tooltip for the absolute time. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = parseIso(iso);
  if (!date) return "";

  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  if (absMs < 45_000) return "Just now";

  for (const entry of RELATIVE_UNITS) {
    if (absMs >= entry.ms) {
      return relativeFormatter.format(Math.round(diffMs / entry.ms), entry.unit);
    }
  }
  return relativeFormatter.format(Math.round(diffMs / MINUTE_MS), "minute");
}

/**
 * A scanned QR encodes `${PUBLIC_BASE_URL}/item/:tagId` (frontend-plan.md §6), but
 * manual entry (F4.1) is always available too — this accepts either a full scanned
 * URL or a bare tag typed/scanned directly, and normalizes casing either way.
 */
export function parseScannedTagId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const match = /\/item\/([^/?#]+)/.exec(url.pathname);
    if (match?.[1]) {
      return decodeURIComponent(match[1]).toUpperCase();
    }
  } catch {
    // Not a URL — treat it as a raw tag id below.
  }

  return trimmed.toUpperCase();
}
