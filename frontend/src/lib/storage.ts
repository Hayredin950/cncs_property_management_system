/**
 * Token storage + in-progress-form drafts.
 *
 * Token lives in `localStorage` (frontend-plan.md §14 open question 5 — survives a
 * refresh, which matters more here than the XSS trade-off given there is no
 * refresh-token endpoint to fall back on).
 *
 * Draft persistence is the frontend-only mitigation for G4 (frontend-plan.md §7,
 * "Auth (F1)"): the backend issues a 1-day JWT with no refresh, so a mid-form 401
 * must not cost a half-written form. Scoped to `sessionStorage` (cleared when the
 * tab closes) rather than `localStorage` — a draft outliving the tab is surprising,
 * not helpful.
 */

const TOKEN_KEY = "cncs.auth.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

const DRAFT_PREFIX = "cncs.draft.";

export function saveDraft<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage can be full or disabled (private browsing) — a lost draft is a
    // minor inconvenience, never worth crashing the form over.
  }
}

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  sessionStorage.removeItem(DRAFT_PREFIX + key);
}
