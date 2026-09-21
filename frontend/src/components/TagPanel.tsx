import { Download, QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchItemTagBlob } from "../api/tags";
import { downloadBlob } from "../lib/apiClient";
import { toast } from "../lib/toast";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";

export interface TagPanelProps {
  itemId: string;
  tagId: string;
  itemName: string;
}

/**
 * `GET /items/:id/tag` — Staff/Admin view + download (frontend-plan.md Phase 1
 * scope; print/regenerate are Phase 2). `data-print-tag` opts this panel into
 * the print stylesheet in styles/globals.css — everything else on the page is
 * hidden when a staff member prints the sticker.
 */
export function TagPanel({ itemId, tagId, itemName }: TagPanelProps) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Resets when the item changes, derived during render via the prev-state
  // pattern rather than setState inside the effect (react-hooks rule).
  const [prevItemId, setPrevItemId] = useState(itemId);
  if (prevItemId !== itemId) {
    setPrevItemId(itemId);
    setImgUrl(null);
    setFailed(false);
    setLoading(true);
  }

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    fetchItemTagBlob(itemId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setImgUrl(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [itemId]);

  async function handleDownload() {
    try {
      const blob = await fetchItemTagBlob(itemId);
      downloadBlob(blob, `${tagId}.png`);
    } catch {
      toast.error("Couldn't download the tag image. Try again.");
    }
  }

  return (
    <div
      data-print-tag
      className="flex flex-col items-center gap-3 rounded-md border border-slate-200 bg-white p-4 text-center"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 print:hidden">
        <QrCode className="h-4 w-4" aria-hidden="true" />
        Printable tag
      </h3>

      {loading ? (
        <Skeleton className="h-40 w-40" />
      ) : failed || !imgUrl ? (
        <p className="text-sm text-slate-500">Couldn't load the tag image.</p>
      ) : (
        <img src={imgUrl} alt={`QR tag for ${tagId}`} className="h-40 w-40" />
      )}

      <p className="tag-id text-sm text-slate-600">{tagId}</p>
      <p className="hidden text-sm text-slate-600 print:block">{itemName}</p>

      <Button
        variant="outline"
        size="sm"
        leftIcon={<Download className="h-4 w-4" />}
        onClick={handleDownload}
        disabled={loading}
        className="print:hidden"
      >
        Download PNG
      </Button>
    </div>
  );
}
