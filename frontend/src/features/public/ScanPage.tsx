import { ArrowRight } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { QrScanner } from "../../components/QrScanner";
import { parseScannedTagId } from "../../lib/formatters";

/**
 * `/scan` (F4.1). Camera scanning plus manual entry, always both visible — they
 * resolve to the same destination, `/item/:tagId` (frontend-plan.md §7).
 */
export function ScanPage() {
  const navigate = useNavigate();
  const [manualValue, setManualValue] = useState("");

  const handleDecode = useCallback(
    (raw: string) => {
      const tagId = parseScannedTagId(raw);
      if (tagId) navigate(`/item/${tagId}`);
    },
    [navigate],
  );

  function handleManualSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tagId = parseScannedTagId(manualValue);
    if (tagId) navigate(`/item/${tagId}`);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-slate-900">Scan a tag</h1>
        <p className="mt-1 text-sm text-slate-500">Point your camera at the QR sticker on the item.</p>
      </div>

      <QrScanner elementId="qr-reader" onDecode={handleDecode} />

      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-400">
        <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
        or type it
        <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
      </div>

      <form onSubmit={handleManualSubmit} className="flex items-end gap-2">
        <Input
          label="Tag ID"
          placeholder="CNCS-XXXXXXXX"
          value={manualValue}
          onChange={(event) => setManualValue(event.target.value)}
          className="tag-id"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" leftIcon={<ArrowRight className="h-4 w-4" />} disabled={!manualValue.trim()}>
          Go
        </Button>
      </form>
    </div>
  );
}
