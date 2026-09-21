import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCurrentUser, login as loginRequest } from "../api/auth";
import { setUnauthorizedHandler } from "../lib/apiClient";
import { clearToken, getToken, setToken } from "../lib/storage";
import { toast } from "../lib/toast";
import type { AuthUser } from "../types/user";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Rehydrates a stored token via `GET /auth/me` on boot — "a stale token must not
 * render a shell" (frontend-plan.md §4), which is why every consumer sees
 * `status: "loading"` until this resolves, rather than guessing from the token's
 * mere presence.
 *
 * Also owns the app's single 401 handler (frontend-plan.md §4: "handled in one
 * place"): `lib/apiClient.ts` has no React/router dependency, so it calls back
 * into whatever this provider registers here.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // Lazy initializers, not an effect: "no token" is knowable synchronously at
  // first render, so it must not render a shell for even one paint (the same
  // rule that makes the async path wait for `/auth/me`).
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? "loading" : "anonymous"));
  const navigate = useNavigate();
  // The in-context client, not a module import: the test harness supplies its
  // own `QueryClient`, and sign-out must clear that one (`RootProviders.tsx`).
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    const token = getToken();
    if (!token) {
      return;
    }
    fetchCurrentUser()
      .then((res) => {
        if (!active) return;
        setUser(res.user);
        setStatus("authenticated");
      })
      .catch(() => {
        if (!active) return;
        clearToken();
        setUser(null);
        setStatus("anonymous");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler((next) => {
      setUser(null);
      setStatus("anonymous");
      queryClient.clear();
      if (next && !next.startsWith("/login")) {
        toast.info("Your session ended — please sign in again.");
        navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
      }
    });
  }, [navigate, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login: async (email: string, password: string) => {
        const res = await loginRequest({ email, password });
        setToken(res.token);
        setUser(res.user);
        setStatus("authenticated");
      },
      signOut: () => {
        // Client-side only — there is no logout endpoint (frontend-plan.md §7).
        clearToken();
        setUser(null);
        setStatus("anonymous");
        queryClient.clear();
      },
    }),
    [user, status, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
