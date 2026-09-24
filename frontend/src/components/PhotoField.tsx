import { Camera, ImageUp, Trash2 } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";
import { deletePhoto, uploadPhoto } from "../api/uploads";
import { Button } from "./Button";
import { Input } from "./Input";
import { PhotoFrame } from "./PhotoFrame";
import { Select } from "./Select";

/**
 * The item form's photo control (SRS F3.4).
 *
 * Three ways in, because there are three real situations in a Cairo-side
 * property office: the item is in front of you (**camera**), a photo was taken
 * earlier and is on the device (**gallery/file**), or someone already put the
 * image on the web (**URL**). The old single "Photo URL" box only served the
 * third, which is why it read as a placeholder rather than a feature.
 *
 * Camera and gallery are two `<input type="file">` elements rather than one with
 * a switched `capture` attribute. That is deliberate: `capture="environment"`
 * tells a phone to open the camera *instead of* the gallery, so a single input
 * can do one or the other, never both — and leaving both mounted means the
 * browser keeps hold of the permission it already has.
 *
 * Both modes of the form use this component, which is why it writes a URL rather
 * than uploading against an item id: `create` has no id yet. The chosen file is
 * uploaded immediately (so the preview shows the real, stored image) and the
 * returned URL becomes the form's `photoUrl`; Save is what commits it, so a
 * cancelled edit changes nothing.
 */
const MAX_BYTES = 5 * 1024 * 1024;
/** Mirrors `middleware/photoUpload.ts` — the server re-checks all of this. */
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPT_ATTR = ACCEPTED_TYPES.join(",");

type PhotoSource = "camera" | "gallery" | "url";

const SOURCE_OPTIONS = [
  { value: "camera", label: "Take a photo (camera)" },
  { value: "gallery", label: "Choose from gallery" },
  { value: "url", label: "Paste a photo URL" },
];

export interface PhotoFieldProps {
  /** Current `photoUrl` from the form. Empty string means "no photo". */
  value: string;
  onChange: (value: string) => void;
  /** The form's validation error for `photoUrl`, shown on the URL input. */
  error?: string | undefined;
  disabled?: boolean;
}

export function PhotoField({ value, onChange, error, disabled }: PhotoFieldProps) {
  const [source, setSource] = useState<PhotoSource>("camera");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  /**
   * The URL this component uploaded during this session, if any.
   *
   * The file is uploaded the moment it is chosen (so the preview is the real
   * stored image), which means clearing or replacing it before Save would leave
   * the image unreferenced in the Cloudinary account forever. Tracking the URL
   * here — and only this one, never an item's already-stored photo — lets the
   * remove/replace paths delete exactly the upload they are discarding.
   */
  const uploadedUrlRef = useRef<string | null>(null);

  const busy = Boolean(disabled) || uploading;

  /** Best-effort delete; a failure must never block the form. */
  function discardUploaded() {
    const url = uploadedUrlRef.current;
    uploadedUrlRef.current = null;
    if (url) void deletePhoto(url).catch(() => undefined);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared first so re-picking the *same* file after a failure still fires.
    event.target.value = "";
    if (!file) return;

    // Checked here as well as on the server so an obviously-wrong file costs no
    // round trip and gets an immediate answer.
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setUploadError("Choose a JPEG, PNG, WebP or GIF image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setUploadError("That image is larger than 5 MB.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    // A new pick replaces whatever this session uploaded before it.
    discardUploaded();
    try {
      const { url } = await uploadPhoto(file);
      uploadedUrlRef.current = url;
      onChange(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "The photo could not be uploaded");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Photo source"
          options={SOURCE_OPTIONS}
          value={source}
          onChange={(event) => setSource(event.target.value as PhotoSource)}
          disabled={busy}
          hint="On a phone, the camera opens directly; gallery picks an image already on the device."
        />

        {source === "url" ? (
          <Input
            label="Photo URL"
            value={value}
            onChange={(event) => {
              // Typing over a photo this session uploaded drops that upload too.
              if (uploadedUrlRef.current && event.target.value !== uploadedUrlRef.current) {
                discardUploaded();
              }
              onChange(event.target.value);
            }}
            error={error}
            disabled={busy}
            placeholder="https://…"
            hint="A full https:// link, or a path on this site such as /photos/desk.jpg."
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-slate-700">
              {source === "camera" ? "Take a photo" : "Choose an image"}
            </span>
            <Button
              type="button"
              variant="outline"
              loading={uploading}
              disabled={busy}
              leftIcon={
                source === "camera" ? (
                  <Camera className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ImageUp className="h-4 w-4" aria-hidden="true" />
                )
              }
              onClick={() =>
                (source === "camera" ? cameraRef.current : galleryRef.current)?.click()
              }
            >
              {uploading ? "Uploading…" : source === "camera" ? "Open camera" : "Choose file"}
            </Button>
            <p className="text-xs text-slate-500">JPEG, PNG, WebP or GIF, up to 5 MB.</p>
          </div>
        )}
      </div>

      {/*
        Kept out of the tab order and off-screen: the buttons above are the
        accessible control, and these are what they click. `capture` is the
        environment-facing camera, which is the one a person photographing a
        desk wants.
      */}
      <input
        ref={cameraRef}
        type="file"
        accept={ACCEPT_ATTR}
        capture="environment"
        className="sr-only"
        onChange={handleFile}
        disabled={busy}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={galleryRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        onChange={handleFile}
        disabled={busy}
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="flex items-start gap-4">
        <div className="w-40">
          <PhotoFrame src={value || null} alt="Photo preview" />
        </div>
        <div className="flex flex-col gap-2">
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              leftIcon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
              onClick={() => {
                discardUploaded();
                onChange("");
                setUploadError(null);
              }}
            >
              Remove photo
            </Button>
          ) : (
            <p className="text-xs text-slate-500">No photo attached yet.</p>
          )}
          {uploadError && (
            <p role="alert" className="text-xs font-medium text-danger-700">
              {uploadError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
