import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("qrGenerator", () => {
  let tmpDir: string;
  let generateTagQR: typeof import("./qrGenerator.js").generateTagQR;
  let regenerateTagQR: typeof import("./qrGenerator.js").regenerateTagQR;
  let readTagFile: typeof import("./qrGenerator.js").readTagFile;

  beforeAll(async () => {
    // Point the module at a throwaway directory before importing it, since
    // UPLOADS_ROOT is read from process.env at module-load time.
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "qr-test-"));
    process.env.UPLOADS_DIR = tmpDir;
    process.env.PUBLIC_BASE_URL = "http://test.local";

    const mod = await import("./qrGenerator.js");
    generateTagQR = mod.generateTagQR;
    regenerateTagQR = mod.regenerateTagQR;
    readTagFile = mod.readTagFile;
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("rejects an empty tagId", async () => {
    await expect(generateTagQR("")).rejects.toThrow();
  });

  it("generates a PNG, encodes the item URL, and writes it to disk", async () => {
    const result = await generateTagQR("CNCS-TEST01");

    expect(result.tagId).toBe("CNCS-TEST01");
    expect(result.url).toBe("http://test.local/item/CNCS-TEST01");
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.dataUrl.startsWith("data:image/png;base64,")).toBe(true);

    const onDisk = await fs.readFile(result.filePath);
    expect(onDisk.equals(result.buffer)).toBe(true);
  });

  it("URL-encodes a tagId with special characters", async () => {
    const result = await generateTagQR("CNCS 001/A");
    expect(result.url).toBe("http://test.local/item/CNCS%20001%2FA");
  });

  it("regenerateTagQR overwrites the file for the same tagId", async () => {
    const first = await generateTagQR("CNCS-TEST02");
    const second = await regenerateTagQR("CNCS-TEST02");

    expect(second.filePath).toBe(first.filePath);
    expect(second.url).toBe(first.url);
  });

  it("readTagFile returns null for a tagId that was never generated", async () => {
    const missing = await readTagFile("CNCS-DOES-NOT-EXIST");
    expect(missing).toBeNull();
  });

  it("readTagFile returns the exact bytes written by generateTagQR", async () => {
    const generated = await generateTagQR("CNCS-TEST03");
    const read = await readTagFile("CNCS-TEST03");
    expect(read?.equals(generated.buffer)).toBe(true);
  });
});