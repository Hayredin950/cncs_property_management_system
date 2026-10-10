/**
 * `VITE_API_BASE_URL` per frontend-plan.md §9/§4 — always joined with the
 * `/api/v1` prefix here, once, so no call site has to remember it.
 */
const RAW_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:4000";

export const API_ORIGIN = RAW_BASE_URL.replace(/\/+$/, "");
export const API_BASE_URL = `${API_ORIGIN}/api/v1`;
