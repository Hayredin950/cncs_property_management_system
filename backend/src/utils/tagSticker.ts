/**
 * Printable tag sticker renderer (SRS F3.5 / §10.6's `TagStickerCard`).
 *
 * A tag that only carries a QR code is only half a tag. The QR needs a scanner
 * *and* a network round trip, while the thing stuck to the outside of a
 * microscope gets read by a person walking past it with a clipboard — so the
 * sticker has to say its Tag ID in print, in the downloaded file itself. The
 * clients showed the ID beside the image, which meant the caption vanished the
 * moment someone sent the PNG on or printed it, i.e. exactly when the sticker
 * starts doing its job.
 *
 * Hand-rolled PNG writer, for the same reason `utils/pdf.ts` is hand-rolled: no
 * image library is installed, and one caption does not justify adding one (a
 * native `canvas`/`sharp` dependency would also mean a regenerated lockfile and
 * CI's `--frozen-lockfile`). Writing the bytes directly is affordable here
 * because the picture is trivial — flat black and white, no alpha, no
 * compression tricks — and because the QR module matrix is available from the
 * `qrcode` package rather than having to be decoded back out of a PNG.
 *
 *   * **8-bit greyscale** (`colour type 0`), which is one byte per pixel and no
 *     palette for a two-colour image.
 *   * **Filter 0 (None) on every scanline.** The alternative is a real
 *     filtering heuristic to save bytes on an image that is mostly flat white
 *     and compresses well regardless; unfiltered also means the tests can read
 *     the pixels back with `zlib` alone instead of a PNG parser.
 *   * **A 5x7 bitmap font** for the caption, scaled by whole pixels so a glyph
 *     edge never lands mid-pixel. It covers A-Z, 0-9, the hyphen and slash a
 *     generated Tag ID uses, and a fallback box for anything else — a caption
 *     that silently drops a character would be worse than an ugly one.
 */

import { deflateSync } from "node:zlib";
import QRCode from "qrcode";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The code sits in the top square; the caption band is added underneath it. */
const WIDTH = 512;
const QR_AREA = 512;

/**
 * Four modules of quiet zone, which is what a scanner needs to find the code.
 * The spec's minimum is 4; more is harmless and this renders *into* a fixed
 * 512px square, so a low-density code simply gets a wider margin.
 */
const QUIET_MODULES = 4;
const QR_PADDING = 8;

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
/** One blank module between characters — without it, `NN` reads as one wide box. */
const GLYPH_GAP = 1;
const CAPTION_TOP_GAP = 10;
const CAPTION_BOTTOM_GAP = 26;
/** The first choice; shrunk only if a long tag ID would overrun the sticker. */
const PREFERRED_TEXT_SCALE = 4;
const CAPTION_MARGIN_X = 24;

const BLACK = 0;
const WHITE = 255;

const HEIGHT = QR_AREA + CAPTION_TOP_GAP + GLYPH_HEIGHT * PREFERRED_TEXT_SCALE + CAPTION_BOTTOM_GAP;

/**
 * A 5x7 bitmap font, rows top to bottom, `#` for ink. Deliberately lowercase-free:
 * a Tag ID is `CNCS-AB12CD34`, and the caption upper-cases before rendering, so
 * the extra glyphs would be pages of dead weight.
 */
const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  C: [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  G: [".###.", "#...#", "#....", "#.###", "#...#", "#...#", ".###."],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  J: ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  Q: [".###.", "#...#", "#...#", "#...#", "#.#.#", "#..#.", ".##.#"],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  W: ["#...#", "#...#", "#...#", "#...#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  Z: ["#####", "....#", "...#.", "..#..", ".#...", "#....", "#####"],
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
  "/": ["....#", "....#", "...#.", "..#..", ".#...", "#....", "#...."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

/** What an unmapped character prints as, so a caption never loses a character silently. */
const FALLBACK_GLYPH = ["#####", "#...#", "#...#", "#...#", "#...#", "#...#", "#####"];

function glyphFor(character: string): string[] {
  return GLYPHS[character] ?? FALLBACK_GLYPH;
}

/* ---------------------------------------------------------------- PNG bytes */

/** The standard CRC-32 table (IEEE 802.3), built once. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let bit = 0; bit < 8; bit++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: length, type, data, CRC over type+data. */
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typed = Buffer.concat([Buffer.from(type, "latin1"), data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);

  return Buffer.concat([length, typed, crc]);
}

/** Wraps 8-bit greyscale samples as a complete PNG. */
function encodeGreyscalePng(pixels: Uint8Array, width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type 0: greyscale, no alpha
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method: adaptive
  ihdr[12] = 0; // interlace: none

  const stride = width + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter 0 (None)
    raw.set(pixels.subarray(y * width, (y + 1) * width), y * stride + 1);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ drawing */

/** A single-channel bitmap with the two operations the sticker needs. */
class Canvas {
  readonly pixels: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Uint8Array(width * height).fill(WHITE);
  }

  fillRect(x: number, y: number, width: number, height: number, value = BLACK): void {
    for (let row = y; row < y + height; row++) {
      if (row < 0 || row >= this.height) continue;
      const start = row * this.width;
      for (let column = x; column < x + width; column++) {
        if (column < 0 || column >= this.width) continue;
        this.pixels[start + column] = value;
      }
    }
  }
}

/** How wide the caption is at [scale], in whole pixels. */
function captionWidth(characterCount: number, scale: number): number {
  if (characterCount === 0) return 0;
  return characterCount * (GLYPH_WIDTH + GLYPH_GAP) * scale - GLYPH_GAP * scale;
}

/**
 * The largest whole-pixel scale that keeps the caption inside the sticker's
 * margins. Whole pixels matter: a fractional scale is what turns a 5x7 font
 * into a smeared one.
 */
function captionScale(characterCount: number): number {
  const usable = WIDTH - CAPTION_MARGIN_X * 2;
  for (let scale = PREFERRED_TEXT_SCALE; scale > 1; scale--) {
    if (captionWidth(characterCount, scale) <= usable) return scale;
  }
  return 1;
}

function drawQrCode(canvas: Canvas, url: string): void {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
  const count = modules.size;

  const scale = Math.max(
    1,
    Math.floor((QR_AREA - QR_PADDING * 2) / (count + QUIET_MODULES * 2)),
  );
  const drawn = (count + QUIET_MODULES * 2) * scale;

  // Centred on both axes: the leftover from integer division is split rather
  // than left as a lopsided margin, which is what "the sticker looks off" is.
  const originX = Math.floor((WIDTH - drawn) / 2);
  const originY = Math.floor((QR_AREA - drawn) / 2);

  for (let row = 0; row < count; row++) {
    for (let column = 0; column < count; column++) {
      if (modules.data[row * count + column] === 0) continue;
      canvas.fillRect(
        originX + (column + QUIET_MODULES) * scale,
        originY + (row + QUIET_MODULES) * scale,
        scale,
        scale,
      );
    }
  }
}

function drawCaption(canvas: Canvas, caption: string): void {
  const characters = [...caption.toUpperCase()];
  const scale = captionScale(characters.length);
  const width = captionWidth(characters.length, scale);
  const originX = Math.floor((WIDTH - width) / 2);
  const originY = QR_AREA + CAPTION_TOP_GAP;

  characters.forEach((character, index) => {
    const glyph = glyphFor(character);
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      for (let column = 0; column < GLYPH_WIDTH; column++) {
        if (glyph[row]?.[column] !== "#") continue;
        canvas.fillRect(
          originX + (index * (GLYPH_WIDTH + GLYPH_GAP) + column) * scale,
          originY + row * scale,
          scale,
          scale,
        );
      }
    }
  });
}

/**
 * The printable sticker: a QR code for [url] with [caption] — the Tag ID —
 * printed under it. Returns PNG bytes ready to stream or cache.
 */
export function renderStickerPng(url: string, caption: string): Buffer {
  const canvas = new Canvas(WIDTH, HEIGHT);
  drawQrCode(canvas, url);
  drawCaption(canvas, caption);
  return encodeGreyscalePng(canvas.pixels, WIDTH, HEIGHT);
}

/** Exported for the tests, which check the caption geometry without decoding a PNG. */
export const stickerMetrics = { WIDTH, HEIGHT, QR_AREA, GLYPH_WIDTH, GLYPH_HEIGHT, GLYPH_GAP, captionScale, captionWidth };
