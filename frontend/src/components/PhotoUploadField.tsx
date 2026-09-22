import { useQueryClient } from "@tanstack/react-query";
import { ImageUp, Loader2 } from "lucide-react";
import { useId, useState, type ChangeEvent } from "react";
import { uploadItemPhoto } from "../api/items";
import { PhotoFrame } from "./PhotoFrame";
import { cn } from "../lib/cn";

export interface PhotoUploadFieldProps {
  /** The item being edited. A photo can only be uploaded against an existing row. */
  itemId: string;
  /** Current `photoUrl`, from the loaded item — used for the preview. */
  photoUrl: string | null | undefined;
  /** True for a disposed item: the row is read-only, so nothing may be attached. */
  disabled?: boolean;
  className?: string | undefined;
}

/**
 * File picker for an item's photograph (SRS F3.4).
 *
 * The upload is immediate and self-contained: choosing a file POSTs it to
 * `POST /items/:id/photo`, which stores the CDN URL on the row and returns the
 * updated item. That is deliberately *not* deferred to the form's Save button —
 * a multipart body cannot ride along in the JSON payload the rest of the form
 * submits, and a user who picks a photo and navigates away should not silently
 * lose it.
 *
 * Because the server has already persisted it, the only client-side work left
 * is refetching so every surface agrees. It invalidates all queries rather than
 * a specific key: this happens at most once per item, and naming keys here would
 * be a second, drifting copy of the cache layout owned by the hooks.
 */
export function PhotoUploadField({ itemId, photoUrl, disabled, className }: PhotoUploadFieldProps) {
  const inputId = useId();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clearing the input first means re-picking the *same* file after a failure
    // still fires a change event.
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      await uploadItemPhoto(itemId, file);
      await queryClient.invalidateQueries();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The photo could not be uploaded");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={cn("flex flex-wrap items-start gap-4", className)}>
      <div className="w-40">
        <PhotoFrame src={photoUrl} alt="Photo preview" />
      </div>

      <div className="min-w-48 flex-1">
        <label
          htmlFor={inputId}
          className={cn(
            "inline-flex cursor-pointer items-center gap-2 rounded-md border border-aau-gray-line bg-white px-3 py-2 text-sm font-medium text-aau-gray-800 transition-colors",
            disabled || uploading
              ? "cursor-not-allowed opacity-60"
              : "hover:bg-aau-gray-100",
          )}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ImageUp className="h-4 w-4" aria-hidden="true" />
          )}
          {uploading ? "Uploading…" : "Upload photo"}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={handleFile}
          disabled={disabled || uploading}
        />
        <p className="mt-2 text-xs text-aau-gray-500">
          JPEG, PNG, WebP or GIF, up to 5 MB. Replacing a photo overwrites the previous one.
        </p>
        {error && (
          <p role="alert" className="mt-2 text-xs font-medium text-danger-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
