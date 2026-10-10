import { apiClient, downloadBlob } from "../lib/apiClient";

/** `GET /items/:id/tag` — Staff/Admin. Returns the printable QR tag PNG as a Blob. */
export function fetchItemTagBlob(itemId: string): Promise<Blob> {
  return apiClient.blob(`/items/${encodeURIComponent(itemId)}/tag`);
}

/** Fetches the tag PNG and immediately triggers a browser download for it. */
export async function downloadItemTag(itemId: string, tagId: string): Promise<void> {
  const blob = await fetchItemTagBlob(itemId);
  downloadBlob(blob, `${tagId}.png`);
}
