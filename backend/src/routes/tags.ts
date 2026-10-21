import { Router, type Response, type Router as ExpressRouter } from "express";
import { prisma } from "../lib/prisma.js";
import { itemInScope } from "../services/itemScope.js";
import { authenticate, requireCapability, type AuthenticatedRequest } from "../middleware/auth.js";
import { generateTagQR, regenerateTagQR, readTagFile } from "../utils/qrGenerator.js";


export const tagsRouter: ExpressRouter = Router();

async function getItemTagIdOr404(id: string, res: Response): Promise<string | null> {
  const item = await prisma.item.findUnique({
    where: { id },
    select: { tagId: true },
  });
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return null;
  }
  return item.tagId;
}

/**
 * GET /api/v1/items/:id/tag
 * Staff/Admin — returns the printable QR tag PNG for an item.
 * Generates it on the fly if it isn't already on disk (covers items
 * created before this router existed, or a lost/deleted file).
 */
tagsRouter.get(
  "/:id/tag",
  authenticate,
  // **Reading** a tag is not tag *management*. The printable QR label of an item
  // belongs to whoever may see the item — the holder needs it to reprint their
  // own sticker. It used to require TAG_MANAGE (a Property Officer's
  // capability), so every other role saw "Couldn't load the tag image" at the
  // bottom of their own item's page. *Regenerating* a tag still does require
  // it: that writes a file.
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const itemId = req.params.id;

      if (typeof itemId !== "string") {
        return res.status(400).json({
          error: "Invalid item ID",
        });
      }

      const item = await prisma.item.findUnique({
        where: { id: itemId },
        select: {
          tagId: true,
          orgUnitId: true,
          holderType: true,
          holderId: true,
          ownerId: true,
        },
      });
      if (!item) {
        res.status(404).json({ error: "Item not found" });
        return;
      }
      if (!itemInScope(req.user, item)) {
        // The same answer as "it does not exist".
        res.status(404).json({ error: "Item not found" });
        return;
      }
      const tagId = item.tagId;

      let file = await readTagFile(tagId);
      if (!file) {
        const generated = await generateTagQR(tagId);
        file = generated.buffer;
      }

      res.setHeader("Content-Type", "image/png");
      res.send(file);
    } catch (err) {
      console.error("GET /items/:id/tag failed:", err);
      res.status(500).json({ error: "Failed to load tag image" });
    }
  },
);

/**
 * POST /api/v1/items/:id/tag/regenerate
 * Staff/Admin — reissues a physical tag for the SAME Tag ID (SRS F3.5).
 * Only touches the QR image on disk; the Item row and its tagId are
 * untouched, so no ItemEditLog entry is written here.
 */
tagsRouter.post(
  "/:id/tag/regenerate",
  authenticate,
  requireCapability("TAG_MANAGE"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const itemId = req.params.id;

      if (typeof itemId !== "string") {
        return res.status(400).json({
          error: "Invalid item ID",
        });
      }

      const tagId = await getItemTagIdOr404(itemId, res);
      if (!tagId) return;

      const regenerated = await regenerateTagQR(tagId);
      res.status(200).json({
        tagId: regenerated.tagId,
        url: regenerated.url,
        dataUrl: regenerated.dataUrl,
      });
    } catch (err) {
      console.error("POST /items/:id/tag/regenerate failed:", err);
      res.status(500).json({ error: "Failed to regenerate tag" });
    }
  },
);
