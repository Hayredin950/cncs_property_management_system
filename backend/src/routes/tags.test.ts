import jwt from "jsonwebtoken";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "../app.js";

process.env.JWT_SECRET = "test_jwt_secret";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    item: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../utils/qrGenerator.js", () => ({
  generateTagQR: vi.fn(),
  regenerateTagQR: vi.fn(),
  readTagFile: vi.fn(),
}));

import { prisma } from "../lib/prisma.js";
import { generateTagQR, regenerateTagQR, readTagFile } from "../utils/qrGenerator.js";

/**
 * The two tag routes (F3.4 read, F3.5 re-render).
 *
 * The interesting assertion is not the happy path but the one that looks like a
 * bug otherwise: **regeneration must not touch the Item row.** The tag ID is the
 * item's identity for its whole life — the QR payload is built from it, photo
 * storage keys on it, and history is filed against it. If this route ever wrote
 * a new ID, every previously printed sticker would point at nothing and the
 * record would be split in two. So the mock client has an `update` spy, and the
 * test asserts it is never called.
 *
 * The PNG is also a deterministic function of (tag ID, PUBLIC_BASE_URL), so
 * regeneration legitimately produces the same image — what it actually buys is a
 * re-write of the on-disk cache, which is what the "generates on demand" case
 * below covers. See docs/phase-1.md.
 */

const STORED_BYTES = Buffer.from("<stored-png>");
const RE_RENDERED_BYTES = Buffer.from("<re-rendered-png>");

function createToken(payload: { id: string; role: "ADMIN" | "STAFF" }) {
  return jwt.sign(payload, process.env.JWT_SECRET!);
}

/**
 * superagent leaves an `image/png` body as an unparsed stream, so `res.body` is
 * `{}`. Buffering it explicitly is the only way to assert the exact bytes.
 */
function bufferPng(res: request.Response, callback: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (chunk: Buffer) => chunks.push(chunk));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

describe("Tag Endpoints", () => {
  const adminToken = createToken({ id: "admin-1", role: "ADMIN" });
  const staffToken = createToken({ id: "staff-1", role: "STAFF" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /items/:id/tag", () => {
    it("returns 401 when the Authorization header is missing", async () => {
      const res = await request(app).get("/items/item-1/tag");

      expect(res.status).toBe(401);
      expect(prisma.item.findUnique).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown item", async () => {
      vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .get("/items/missing/tag")
        .set("Authorization", `Bearer ${staffToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Item not found");
    });

    it("streams the cached PNG without regenerating it", async () => {
      vi.mocked(prisma.item.findUnique).mockResolvedValueOnce({ tagId: "CNCS-AB12CD34" } as never);
      vi.mocked(readTagFile).mockResolvedValueOnce(STORED_BYTES);

      const res = await request(app)
        .get("/items/item-1/tag")
        .set("Authorization", `Bearer ${staffToken}`)
        .buffer(true)
        .parse(bufferPng);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("image/png");
      expect(readTagFile).toHaveBeenCalledWith("CNCS-AB12CD34");
      expect(res.body.equals(STORED_BYTES)).toBe(true);
      // The cache hit is the whole point: no needless re-render.
      expect(generateTagQR).not.toHaveBeenCalled();
    });

    it("generates on demand when the cache is empty", async () => {
      vi.mocked(prisma.item.findUnique).mockResolvedValueOnce({ tagId: "CNCS-AB12CD34" } as never);
      vi.mocked(readTagFile).mockResolvedValueOnce(null);
      vi.mocked(generateTagQR).mockResolvedValueOnce({
        tagId: "CNCS-AB12CD34",
        url: "http://localhost:5173/item/CNCS-AB12CD34",
        buffer: RE_RENDERED_BYTES,
        dataUrl: "data:image/png;base64,PHJlLXJlbmRlcmVkPg==",
        filePath: "/tmp/tags/CNCS-AB12CD34.png",
      });

      const res = await request(app)
        .get("/items/item-1/tag")
        .set("Authorization", `Bearer ${staffToken}`)
        .buffer(true)
        .parse(bufferPng);

      expect(res.status).toBe(200);
      expect(generateTagQR).toHaveBeenCalledWith("CNCS-AB12CD34");
      expect(res.body.equals(RE_RENDERED_BYTES)).toBe(true);
    });
  });

  describe("POST /items/:id/tag/regenerate", () => {
    it("returns 401 when the Authorization header is missing", async () => {
      const res = await request(app).post("/items/item-1/tag/regenerate");

      expect(res.status).toBe(401);
      expect(regenerateTagQR).not.toHaveBeenCalled();
    });

    it("returns 404 for an unknown item", async () => {
      vi.mocked(prisma.item.findUnique).mockResolvedValueOnce(null);

      const res = await request(app)
        .post("/items/missing/tag/regenerate")
        .set("Authorization", `Bearer ${staffToken}`);

      expect(res.status).toBe(404);
      expect(regenerateTagQR).not.toHaveBeenCalled();
    });

    it("re-renders the image for the same Tag ID and never rewrites the item", async () => {
      vi.mocked(prisma.item.findUnique).mockResolvedValueOnce({ tagId: "CNCS-AB12CD34" } as never);
      vi.mocked(regenerateTagQR).mockResolvedValueOnce({
        tagId: "CNCS-AB12CD34",
        url: "http://localhost:5173/item/CNCS-AB12CD34",
        buffer: RE_RENDERED_BYTES,
        dataUrl: "data:image/png;base64,PHJlLXJlbmRlcmVkPg==",
        filePath: "/tmp/tags/CNCS-AB12CD34.png",
      });

      const res = await request(app)
        .post("/items/item-1/tag/regenerate")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(regenerateTagQR).toHaveBeenCalledWith("CNCS-AB12CD34");
      expect(res.body.tagId).toBe("CNCS-AB12CD34");
      expect(res.body.url).toBe("http://localhost:5173/item/CNCS-AB12CD34");
      expect(res.body.dataUrl).toMatch(/^data:image\/png;base64,/);

      // The load-bearing assertion: the Item row is untouched, so every sticker
      // already in circulation still resolves to this item.
      expect(prisma.item.update).not.toHaveBeenCalled();
    });
  });
});
