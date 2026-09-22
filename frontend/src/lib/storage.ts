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

/**
 * Sidebar rail state (frontend-design-system.md §5.5, shell B/C).
 *
 * In `localStorage`, not `sessionStorage`: a reviewer who collapses the nav rail
 * to keep the table wide wants it that way tomorrow too. Re-collapsing it on
 * every reload would read as the preference not being honoured.
 */
const SIDEBAR_COLLAPSED_KEY = "cncs.ui.sidebar-collapsed";

export function getSidebarCollapsed(): boolean {
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

export function setSidebarCollapsed(collapsed: boolean): void {
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
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
