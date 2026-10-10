import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";
import { IconButton } from "./IconButton";

/** Tag IDs are compared by eye against a printed sticker — copy is a small, cheap convenience. */
export function CopyableTagId({ tagId, className }: { tagId: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(tagId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (permissions, insecure context) —
      // silently doing nothing is safer than surfacing an error for a
      // convenience action that isn't essential to the task.
    }
  }

  return (
    <span className={cn("tag-id inline-flex items-center gap-1 text-slate-600", className)}>
      {tagId}
      <IconButton
        icon={
          copied ? (
            <Check className="h-3.5 w-3.5 text-success-600" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )
        }
        label={copied ? "Copied" : `Copy tag ${tagId}`}
        size="sm"
        variant="ghost"
        onClick={handleCopy}
        className="h-6 w-6"
      />
    </span>
  );
}
