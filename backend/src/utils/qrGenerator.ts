import QRCode from "qrcode";
import fs from "node:fs/promises";
import path from "node:path";

const UPLOADS_ROOT = process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");
const TAGS_DIR = path.join(UPLOADS_ROOT, "tags");
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "http://localhost:5173";

export interface GeneratedTag {
  tagId: string;
  /** Absolute URL encoded inside the QR code (the /item/:tagId page) */
  url: string;
  /** Raw PNG bytes — useful for streaming directly in an HTTP response */
  buffer: Buffer;
  /** data:image/png;base64,... string — useful for embedding in JSON */
  dataUrl: string;
  /** Where the PNG was persisted on disk */
  filePath: string;
}

function tagUrlFor(tagId: string): string {
  return `${PUBLIC_BASE_URL}/item/${encodeURIComponent(tagId)}`;
}

function tagFilePath(tagId: string): string {
  // tagId is system-generated per SDS 3.2, but sanitize defensively before
  // touching the filesystem in case that assumption ever changes.
  const safe = tagId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(TAGS_DIR, `${safe}.png`);
}

async function ensureTagsDir(): Promise<void> {
  await fs.mkdir(TAGS_DIR, { recursive: true });
}

/**
 * Generates a QR PNG for the given tagId, encoding a link to the public
 * item page, and persists it under uploads/tags/<tagId>.png.
 *
 * Called from:
 *  - POST /items                      (Teammate B, on item creation)
 *  - GET  /items/:id/tag              (routes/tags.ts, this workstream)
 *  - POST /items/:id/tag/regenerate   (routes/tags.ts, SRS F3.5)
 */
export async function generateTagQR(tagId: string): Promise<GeneratedTag> {
  if (typeof tagId !== "string" || !tagId.trim()) {
    throw new Error("generateTagQR requires a non-empty tagId string");
  }

  const url = tagUrlFor(tagId);
  const buffer = await QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
  });

  await ensureTagsDir();
  const filePath = tagFilePath(tagId);
  await fs.writeFile(filePath, buffer);

  const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;

  return { tagId, url, buffer, dataUrl, filePath };
}

/**
 * Re-generates the QR image for an existing tagId (SRS F3.5 — reissue a
 * physical tag without changing the underlying Tag ID). The tagId never
 * changes, so this is functionally identical to generateTagQR and simply
 * overwrites the existing PNG — kept as a distinct export so intent is
 * clear at the call site in routes/tags.ts.
 */
export async function regenerateTagQR(tagId: string): Promise<GeneratedTag> {
  return generateTagQR(tagId);
}

/** Reads a previously generated tag PNG from disk. Returns null if missing. */
export async function readTagFile(tagId: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(tagFilePath(tagId));
  } catch {
    return null;
  }
}