import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link, useRouteError } from "react-router-dom";
import { Button } from "../components/Button";
import { ErrorState } from "../components/ErrorState";

/**
 * Last line of defence for render-time failures.
 *
 * React Router only reaches for an error boundary when a route element throws —
 * and without one it substitutes its own bare "Unexpected Application Error!"
 * screen, which drops the entire shell (no header, no way back). Real examples
 * this caught: a third-party library throwing from an effect *cleanup*, which
 * escapes the component's own try/catch and its promise chain alike.
 *
 * Wrapping each layout's `<Outlet />` rather than assigning `errorElement` to
 * every child route keeps the chrome — the visitor can still navigate out of the
 * broken screen, which is the whole point of having one. `errorElement` is still
 * set on the root route (`RootErrorElement`) for a failure in the layouts
 * themselves, where there is no chrome left to preserve.
 *
 * Deliberately a class component: `getDerivedStateFromError`/`componentDidCatch`
 * have no hook equivalent.
 */
interface AppErrorBoundaryProps {
  children: ReactNode;
  /** Shown as the heading; each shell names its own scope. */
  heading?: string;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry sink in this project; the console is where a developer (or the
    // demo operator with devtools open) can see the component stack.
    console.error("Unhandled render error", error, info.componentStack);
  }

  private readonly reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <ErrorState
        icon={<AlertTriangle className="h-8 w-8" />}
        heading={this.props.heading ?? "Something went wrong on this screen"}
        body="The rest of the app is still working — this screen failed to render. Try again, or go back to a known-good page."
        action={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={this.reset}>
                Try again
              </Button>
              <Link to="/">
                <Button leftIcon={<Home className="h-4 w-4" />}>Go home</Button>
              </Link>
            </div>
            {import.meta.env.DEV && <ErrorDetail error={error} />}
          </div>
        }
      />
    );
  }
}

/**
 * Route-level `errorElement` for the root of the tree: a throw from a layout, a
 * loader, or the boundary above means there is no chrome to render inside, so
 * this stands alone.
 */
export function RootErrorElement() {
  const error = useRouteError();

  // A 404 from a loader arrives as a response, not an Error — and it is not a
  // crash, so it gets the not-found copy rather than "something went wrong".
  const isNotFound =
    typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 404;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <ErrorState
        icon={isNotFound ? undefined : <AlertTriangle className="h-8 w-8" />}
        heading={isNotFound ? "Page not found" : "The app couldn't start this page"}
        body={
          isNotFound
            ? "That page doesn't exist. Check the address, or scan the item's QR sticker again."
            : "Reloading usually clears this. If it keeps happening, the backend may be unreachable."
        }
        action={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => window.location.reload()}>
                Reload
              </Button>
              <a href="/">
                <Button leftIcon={<Home className="h-4 w-4" />}>Go home</Button>
              </a>
            </div>
            {import.meta.env.DEV && error instanceof Error && <ErrorDetail error={error} />}
          </div>
        }
      />
    </div>
  );
}

/** Development-only: the message is the fastest path to the cause, and users never see it. */
function ErrorDetail({ error }: { error: Error }) {
  return (
    <details className="max-w-md text-left">
      <summary className="cursor-pointer text-xs font-medium text-slate-500">Error details (dev only)</summary>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-slate-900 p-3 text-xs text-slate-100">
        {error.message}
      </pre>
    </details>
  );
}
