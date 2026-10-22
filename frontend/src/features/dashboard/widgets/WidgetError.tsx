import { AlertTriangle } from "lucide-react";
import { Button } from "../../../components/Button";

/**
 * A dashboard tile that failed to load, with the one action worth offering.
 *
 * The tiles reported the failure in words but left the reader with nowhere to
 * go: the only way to retry a five-second poll was to reload the whole app.
 */
export function WidgetError({
  heading,
  body,
  onRetry,
}: {
  heading: string;
  body?: string | undefined;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2">
      <div className="flex items-start gap-2 text-sm text-slate-600">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" aria-hidden="true" />
        <div>
          <p>{heading}</p>
          {body && <p className="mt-1 text-slate-500">{body}</p>}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
