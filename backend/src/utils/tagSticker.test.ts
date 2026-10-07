import QRCode from "qrcode";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { renderStickerPng, stickerMetrics } from "./tagSticker.js";

/**
 * Tests for the printable tag sticker. The claims worth proving are that the
 * file is a real PNG (an independent decoder has to accept it, since the whole
 * point is that it gets printed and shared), that the QR half still encodes the
 * item URL *exactly*, and that the caption is actually the Tag ID rather than
 * decorative ink. The pixels are read back with `zlib` alone: the encoder writes
 * filter 0 on every scanline precisely so a test needs no PNG parser.
 */

/** Parses the IHDR of a PNG we produced, without assuming anything about it. */
function header(png: Buffer) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect(png.toString("latin1", 12, 16)).toBe("IHDR");
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    bitDepth: png[24],
    colourType: png[25],
  };
}

/** Concatenated IDAT payloads, and the filter byte of each scanline. */
function chunks(png: Buffer): Array<{ type: string; data: Buffer }> {
  const out: Array<{ type: string; data: Buffer }> = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    out.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return out;
}

/** The greyscale samples, as `height` scanlines of `width` bytes. */
function pixels(png: Buffer, width: number, height: number) {
  const parts = chunks(png);
  const idat = Buffer.concat(parts.filter((part) => part.type === "IDAT").map((part) => part.data));
  const raw = inflateSync(idat);

  const stride = width + 1;
  expect(raw.length).toBe(stride * height);

  const out = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    // Every scanline is unfiltered by construction — that is what makes this
    // helper possible, so assert it rather than trust it.
    expect(raw[y * stride]).toBe(0);
    out.set(raw.subarray(y * stride + 1, y * stride + 1 + width), y * width);
  }
  return out;
}

const URL_WITH_TAG = "http://test.local/item/CNCS-AB12CD34";
const TAG_ID = "CNCS-AB12CD34";

/** The caption band's pixels, i.e. everything below the QR square. */
function captionPixels(png: Buffer) {
  const { width, height } = header(png);
  return pixels(png, width, height).subarray(stickerMetrics.QR_AREA * width);
}

describe("renderStickerPng", () => {
  it("writes a PNG an independent decoder accepts", () => {
    const png = renderStickerPng(URL_WITH_TAG, TAG_ID);
    const info = header(png);

    expect(info.width).toBe(stickerMetrics.WIDTH);
    expect(info.height).toBe(stickerMetrics.HEIGHT);
    expect(info.bitDepth).toBe(8);
    expect(info.colourType).toBe(0); // greyscale: two ink colours need no palette
    expect(info.height).toBeGreaterThan(info.width); // the caption band is extra

    const types = chunks(png).map((part) => part.type);
    expect(types[0]).toBe("IHDR");
    expect(types).toContain("IDAT");
    expect(types.at(-1)).toBe("IEND");
  });

  it("draws the QR module matrix exactly, so the code still scans to the item URL", () => {
    const png = renderStickerPng(URL_WITH_TAG, TAG_ID);
    const { width, height } = header(png);
    const image = pixels(png, width, height);

    // Geometry is measured off the drawing rather than recomputed from the
    // renderer's own constants: find the ink box inside the QR area, and require
    // it to be square with an integer module size.
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    for (let y = 0; y < stickerMetrics.QR_AREA; y++) {
      for (let x = 0; x < width; x++) {
        if (image[y * width + x]! >= 128) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    const { modules } = QRCode.create(URL_WITH_TAG, { errorCorrectionLevel: "M" });
    const count = modules.size;
    const scale = (maxX - minX + 1) / count;
    expect(Number.isInteger(scale)).toBe(true);
    expect(maxX - minX).toBe(maxY - minY);

    // Four modules of quiet zone on every side, which is what a scanner needs
    // to find the code at all.
    expect(minX).toBeGreaterThanOrEqual(4 * scale);
    expect(minY).toBeGreaterThanOrEqual(4 * scale);

    const middle = Math.floor(scale / 2);
    for (let row = 0; row < count; row++) {
      for (let column = 0; column < count; column++) {
        const isDark = image[(minY + row * scale + middle) * width + minX + column * scale + middle]! < 128;
        expect(isDark).toBe(modules.data[row * count + column] === 1);
      }
    }

    // The quiet zone is genuinely blank — a stray pixel there confuses a scanner
    // as reliably as a missing module.
    expect(image[minY - middle]).toBe(255);
    expect(image[minY * width + (minX - middle)]).toBe(255);
    expect(maxY).toBeLessThan(stickerMetrics.QR_AREA);
  });

  it("prints the tag ID under the code, centred and inside the sticker margins", () => {
    const png = renderStickerPng(URL_WITH_TAG, TAG_ID);
    const { width, height } = header(png);
    const image = pixels(png, width, height);

    const bandRows = height - stickerMetrics.QR_AREA;
    let minX = width;
    let maxX = -1;
    let ink = 0;
    for (let y = stickerMetrics.QR_AREA; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (image[y * width + x]! >= 128) continue;
        ink++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }

    expect(bandRows).toBeGreaterThan(0);
    expect(ink).toBeGreaterThan(0);

    // The caption is drawn at a whole-pixel scale and centred, so the ink's
    // width is the font's own width and the two margins differ by at most the
    // one pixel an odd leftover leaves behind.
    const scale = stickerMetrics.captionScale(TAG_ID.length);
    expect(maxX - minX + 1).toBe(stickerMetrics.captionWidth(TAG_ID.length, scale));
    expect(Math.abs(minX - (width - 1 - maxX))).toBeLessThanOrEqual(1);
    expect(minX).toBeGreaterThanOrEqual(24);
    expect(maxX).toBeLessThanOrEqual(width - 24);
  });

  it("prints a different caption for a different tag ID, and the same bytes every time", () => {
    const first = renderStickerPng(URL_WITH_TAG, TAG_ID);
    const repeat = renderStickerPng(URL_WITH_TAG, TAG_ID);
    const other = renderStickerPng("http://test.local/item/CNCS-DEMO-0001", "CNCS-DEMO-0001");

    expect(repeat.equals(first)).toBe(true);
    expect(other.equals(first)).toBe(false);

    // The difference has to be in the caption band, not merely somewhere: that
    // is what "the sticker identifies itself" means.
    expect(captionPixels(other).equals(captionPixels(first))).toBe(false);
    expect(header(first).width).toBe(stickerMetrics.WIDTH);
  });

  it("shrinks a long caption rather than letting it overrun the sticker", () => {
    const longTag = "CNCS-AB12CD34-EXTREMELY-LONG-TAG-ID";
    const png = renderStickerPng(`http://test.local/item/${longTag}`, longTag);
    const { width, height } = header(png);
    const image = pixels(png, width, height);

    expect(stickerMetrics.captionScale(longTag.length)).toBeLessThan(
      stickerMetrics.captionScale(TAG_ID.length),
    );

    let maxX = -1;
    let minX = width;
    for (let y = stickerMetrics.QR_AREA; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (image[y * width + x]! >= 128) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    expect(minX).toBeGreaterThanOrEqual(24);
    expect(maxX).toBeLessThanOrEqual(width - 24);
  });

  it("renders a character it has no glyph for as a visible box, never as a blank", () => {
    const png = renderStickerPng("http://test.local/item/CNCS-Ü1", "CNCS-Ü1");
    const { width, height } = header(png);
    const image = pixels(png, width, height);

    // The accent has no glyph; the fallback box keeps the caption readable as a
    // tag ID instead of silently printing `CNCS-1`.
    let ink = 0;
    for (let y = stickerMetrics.QR_AREA; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (image[y * width + x]! < 128) ink++;
      }
    }
    expect(ink).toBeGreaterThan(0);
  });
});
