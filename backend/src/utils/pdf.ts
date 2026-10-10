/**
 * Report PDF writer (Phase 3, SRS F10.2). Produces the branded, paginated
 * report documents the Reports screen offers as `format=pdf`.
 *
 * Hand-rolled, for the same reason `utils/csv.ts` is: no PDF library is
 * installed, and three call sites do not justify adding one (which would also
 * mean a regenerated lockfile and CI's `--frozen-lockfile`). What it therefore
 * has to buy back in code is presentation, and it does that with vector
 * primitives only — no embedded fonts, no images, no external assets:
 *
 *   * A **brand band** across the top of every page, in the product's own navy
 *     (`brand800` in the app's theme), carrying a badge, the report title and
 *     the university line.
 *   * **Helvetica / Helvetica-Bold** — the standard 14 Type1 fonts, so nothing
 *     is embedded — measured through the Adobe glyph-width tables below. Real
 *     metrics are what let a column be right-aligned, a cell be truncated at the
 *     right place, and a table be laid out to the page margin instead of stopping
 *     wherever the text happened to end.
 *   * A filled **table header row**, **zebra-striped** rows, hairline rules, and
 *     **numeric columns right-aligned** so a money column reads as a column.
 *   * A **metadata block** (generated-at, scope, record count) between the band
 *     and the table, and a **footer** on every page with the product line and
 *     `Page n of m`.
 *   * **Column-group pagination.** The inventory report has 20 columns; squeezing
 *     them onto one A4 landscape width truncates every one into `Categ...`. So
 *     when a table is wider than the page it is split into parts that each fit,
 *     the identifier column repeats in every part, and each part is paginated
 *     normally — every field is printed in full, which is the whole point of an
 *     export.
 *   * A **document information dictionary** (`/Info`), so a viewer's title bar,
 *     the browser's PDF tab and `pdfinfo` all show a real title rather than a
 *     temp filename.
 *
 * Two deliberate constraints, both load-bearing:
 *
 *   * It writes **uncompressed** content streams. The text stays inspectable,
 *     `pdftotext` reads it back exactly, and the tests can assert on structure
 *     without a PDF parser in the dependency list.
 *   * It **folds out of ASCII** and escapes the three characters that matter in
 *     a PDF string literal. A standard Type1 font has no glyph for Amharic, and a
 *     raw high byte would corrupt the file rather than fail loudly; folding
 *     typographic punctuation to ASCII first means an em dash in a title renders
 *     as a hyphen instead of a `?`.
 */

import type { CsvValue } from "./csv.js";

export interface PdfTableOptions {
  /** The report's name, shown in the band. */
  title: string;
  /** A line of context under the band, conventionally the generated-at stamp. */
  subtitle?: string;
  /** Column keys, in order. Also the row lookup keys. */
  headers: string[];
  rows: Array<Record<string, CsvValue>>;
  /**
   * Human labels, keyed by column key. A report passes these so the table says
   * `Purchase cost` where the CSV says `purchaseCost`; without one a key is
   * upper-cased, which is what the CSV's machine-readable spelling needs.
   */
  columnLabels?: Record<string, string>;
  /** The university/organisation line in the band. */
  organisation?: string;
  /** Additional metadata lines under the band — scope, filters, record count. */
  meta?: string[];
}

/** A4 landscape, in PDF points (72 per inch). Reports are wide, not tall. */
const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;

/** The theme's palette, mirrored so a printed report matches the app. */
type Rgb = readonly [number, number, number];
const BRAND: Rgb = [0x01, 0x41, 0x66]; // brand800 #014166
const BRAND_DEEP: Rgb = [0x01, 0x32, 0x4e]; // brand900 #01324e
const ACCENT: Rgb = [0xd9, 0x45, 0x4c]; // accent600 #d9454c
const INK: Rgb = [0x1d, 0x29, 0x39]; // aauGray800
const MUTED: Rgb = [0x66, 0x70, 0x85]; // aauGray500
const RULE: Rgb = [0xe0, 0xe0, 0xe0]; // aauGrayLine
const ZEBRA: Rgb = [0xf8, 0xf9, 0xfc]; // aauGray100
const WHITE: Rgb = [0xff, 0xff, 0xff];
const ON_BAND: Rgb = [0xc9, 0xdd, 0xea]; // a pale blue for the band's second line

const MARGIN_X = 36;
const BAND_HEIGHT = 68;
const BAND_BADGE_WIDTH = 46;
const BAND_BADGE_HEIGHT = 26;
const TITLE_FONT_SIZE = 15;
const ORG_FONT_SIZE = 8.5;
const META_FONT_SIZE = 8;
const META_LINE = 11.5;
const PART_LINE = 12.5;
const PART_FONT_SIZE = 7.5;
const TABLE_HEADER_HEIGHT = 17;
const ROW_HEIGHT = 14.5;
const FONT_SIZE = 7.2;
const FOOTER_RULE_Y = 34;
const FOOTER_FONT_SIZE = 7;
const CELL_PAD_X = 4;
/** Narrower than this and two adjacent columns read as one. */
const MIN_COLUMN_WIDTH = 38;
/** A single long free-text cell should not eat the whole page. */
const MAX_COLUMN_WIDTH = 220;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const DEFAULT_ORGANISATION = "Addis Ababa University";

/**
 * Adobe's advance widths for the standard 14 Type1 fonts, at 1000 units per em,
 * for the printable ASCII range (code 32 upward). These are the published AFM
 * values; Helvetica's are also what a monospaced grid cannot give — real
 * proportional metrics.
 */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778,
  722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
  278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778,
  722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
  278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Codepoints Helvetica/WinAnsi has no glyph for, folded to something it does. */
const ASCII_FOLD: Array<[RegExp, string]> = [
  [/[\u2013\u2014]/g, "-"],
  [/[\u2018\u2019\u201B]/g, "'"],
  [/[\u201C\u201D]/g, '"'],
  [/[\u2026]/g, "..."],
  [/[\u00A0\u2007\u202F]/g, " "],
  [/[\u2022]/g, "*"],
];

function rgb([r, g, b]: Rgb): string {
  return [r, g, b].map((value) => short((value / 255).toFixed(3))).join(" ");
}

/** Drops the redundant trailing zeroes so the content stream stays readable. */
function short(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

function pt(value: number): string {
  return short(value.toFixed(3));
}

function widthOf(text: string, size: number, bold: boolean): number {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let units = 0;
  for (const character of text) {
    const code = character.charCodeAt(0);
    units += code >= 32 && code <= 126 ? table[code - 32]! : 556;
  }
  return (units / 1000) * size;
}

function cellText(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Newlines/tabs become spaces, typographic punctuation folds to ASCII, and
 * anything the font still cannot draw becomes `?`. A `disposalReason` is free
 * text and may contain a line break, which would otherwise split one row across
 * two output lines and misalign the table.
 */
function printable(value: string): string {
  let folded = value.replace(/[\r\n\t]+/g, " ");
  for (const [pattern, replacement] of ASCII_FOLD) {
    folded = folded.replace(pattern, replacement);
  }
  return folded.replace(/[^\x20-\x7E]/g, "?");
}

/** Escapes the three characters that end a PDF string literal early. */
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Truncates to [maxWidth] points of Helvetica, ending in an ellipsis. */
function fitText(text: string, maxWidth: number, size: number, bold: boolean): string {
  if (widthOf(text, size, bold) <= maxWidth) return text;
  const ellipsis = "...";
  const budget = maxWidth - widthOf(ellipsis, size, bold);
  if (budget <= 0) return ellipsis;

  let kept = "";
  let keptWidth = 0;
  for (const character of text) {
    const characterWidth = widthOf(character, size, bold);
    if (keptWidth + characterWidth > budget) break;
    kept += character;
    keptWidth += characterWidth;
  }
  return kept.trimEnd() + ellipsis;
}

interface Column {
  label: string;
  /**
   * What the content actually needs, already clamped to
   * [MIN_COLUMN_WIDTH]/[MAX_COLUMN_WIDTH]. Packing and fitting must agree on
   * this number: when packing used the raw content width while fitting raised
   * narrow columns to the minimum, a group could pack to the page width and then
   * overflow once fitted — which shows up as every column in it truncating.
   */
  natural: number;
  /** Assigned once the column is packed into a group. */
  width: number;
  right: boolean;
  values: string[];
}

/** A column is a number column only if every non-empty cell in it is one. */
const NUMERIC = /^-?[\d,]+(\.\d+)?$/;

function buildColumns(options: PdfTableOptions): Column[] {
  const { headers, rows, columnLabels } = options;

  return headers.map((header) => {
    const label = printable(columnLabels?.[header] ?? header.toUpperCase());
    const values = rows.map((row) => printable(cellText(row[header])));

    let natural = widthOf(label, FONT_SIZE, true);
    for (const value of values) {
      natural = Math.max(natural, widthOf(value, FONT_SIZE, false));
    }

    return {
      label,
      natural: Math.min(Math.max(natural + CELL_PAD_X * 2, MIN_COLUMN_WIDTH), MAX_COLUMN_WIDTH),
      width: 0,
      right:
        values.some((value) => value.trim() !== "") &&
        values.every((value) => value.trim() === "" || NUMERIC.test(value.trim())),
      values,
    };
  });
}

/**
 * Distributes the available width across a group's columns: columns that need
 * less than an even share give their slack to the wide ones, and columns that
 * need more than their share are scaled back toward [MIN_COLUMN_WIDTH]. It always
 * returns widths summing to exactly [CONTENT_WIDTH], so the table's right edge
 * lands on the page margin.
 */
function fitToPage(natural: number[]): number[] {
  const count = natural.length;
  if (count === 0) return [];

  const total = natural.reduce((sum, width) => sum + width, 0);

  if (total > CONTENT_WIDTH) {
    // Proportionally shrink whatever sits above the minimum until it fits.
    const minTotal = MIN_COLUMN_WIDTH * count;
    const excess = natural.map((width) => width - MIN_COLUMN_WIDTH);
    const excessTotal = excess.reduce((sum, width) => sum + width, 0);
    const factor = excessTotal > 0 ? (CONTENT_WIDTH - minTotal) / excessTotal : 0;
    return excess.map((width) => MIN_COLUMN_WIDTH + width * Math.max(0, factor));
  }

  if (total < CONTENT_WIDTH) {
    // Hand the leftover out in proportion, so wide columns stay widest.
    const slack = CONTENT_WIDTH - total;
    const basis = total || count;
    return natural.map((width) => width + (width / basis) * slack);
  }

  return natural;
}

/**
 * Packs columns into parts that each fit the page width.
 *
 * A single part when everything fits — the common case, and the one every small
 * report takes. Otherwise the first column becomes the part key and repeats at
 * the start of every part after the first, so a reader can still tie a row in
 * part 3 back to its row in part 1.
 */
function groupColumns(columns: Column[]): Column[][] {
  if (columns.length === 0) return [columns];
  const total = columns.reduce((sum, column) => sum + column.natural, 0);
  if (total <= CONTENT_WIDTH) return [columns];

  const key = columns[0]!;
  const groups: Column[][] = [];

  let index = 0;
  while (index < columns.length) {
    const members: Column[] = [];
    let used = 0;

    if (groups.length > 0) {
      members.push(key);
      used += key.natural;
    }

    // Always take at least one new column, even if it alone overflows — a part
    // that repeats only the key would page forever without printing anything new.
    while (index < columns.length) {
      const candidate = columns[index]!;
      if (members.length > (groups.length > 0 ? 1 : 0) && used + candidate.natural > CONTENT_WIDTH) {
        break;
      }
      members.push(candidate);
      used += candidate.natural;
      index++;
    }

    groups.push(members);
  }

  return groups;
}

/** Gives every column in a group its fitted width. */
function fitGroup(group: Column[]): Column[] {
  const widths = fitToPage(group.map((column) => column.natural));
  return group.map((column, index) => ({ ...column, width: widths[index]! }));
}

interface Placement {
  x: number;
  maxWidth: number;
}

function placeColumns(columns: Column[]): Placement[] {
  let x = MARGIN_X;
  return columns.map((column) => {
    const placement = { x, maxWidth: column.width - CELL_PAD_X * 2 };
    x += column.width;
    return placement;
  });
}

/** The y coordinate of baseline-centered text inside a row of [height]. */
function baseline(rowTop: number, height: number, size: number): number {
  return rowTop - (height + size * 0.7) / 2;
}

function text(
  color: Rgb,
  font: "F1" | "F2",
  size: number,
  x: number,
  y: number,
  content: string,
  alignRightAt?: number,
): string {
  const anchor = alignRightAt === undefined ? x : alignRightAt - widthOf(content, size, font === "F2");
  return (
    `BT /${font} ${pt(size)} Tf ${rgb(color)} rg 1 0 0 1 ${pt(anchor)} ${pt(y)} Tm ` +
    `(${escapeText(content)}) Tj ET`
  );
}

function rule(ops: string[], y: number, color: Rgb, width: number): void {
  ops.push(
    `q ${rgb(color)} RG ${pt(width)} w ${pt(MARGIN_X)} ${pt(y)} m ` +
      `${pt(MARGIN_X + CONTENT_WIDTH)} ${pt(y)} l S Q`,
  );
}

function drawBand(ops: string[], title: string, organisation: string): void {
  ops.push(
    `q ${rgb(BRAND)} rg 0 ${pt(PAGE_HEIGHT - BAND_HEIGHT)} ${pt(PAGE_WIDTH)} ${pt(BAND_HEIGHT)} re f Q`,
  );

  const badgeX = MARGIN_X;
  const badgeY = PAGE_HEIGHT - BAND_HEIGHT / 2 - BAND_BADGE_HEIGHT / 2;
  ops.push(
    `q ${rgb(ACCENT)} rg ${pt(badgeX)} ${pt(badgeY)} ${pt(BAND_BADGE_WIDTH)} ${pt(BAND_BADGE_HEIGHT)} re f Q`,
  );
  // A white keyline inset in the badge, which is what makes an unbacked vector
  // rectangle read as a deliberate mark rather than a stray swatch.
  ops.push(
    `q ${rgb(WHITE)} RG 0.7 w ${pt(badgeX + 3)} ${pt(badgeY + 3)} ` +
      `${pt(BAND_BADGE_WIDTH - 6)} ${pt(BAND_BADGE_HEIGHT - 6)} re S Q`,
  );

  const textX = badgeX + BAND_BADGE_WIDTH + 12;
  ops.push(text(WHITE, "F2", 9.5, textX, PAGE_HEIGHT - BAND_HEIGHT / 2 - 3.4, "CNCS"));
  ops.push(
    text(
      WHITE,
      "F2",
      TITLE_FONT_SIZE,
      textX,
      PAGE_HEIGHT - 27,
      fitText(title, 560, TITLE_FONT_SIZE, true),
    ),
  );
  ops.push(
    text(
      ON_BAND,
      "F1",
      ORG_FONT_SIZE,
      textX,
      PAGE_HEIGHT - 43,
      fitText(organisation, 600, ORG_FONT_SIZE, false),
    ),
  );

  // A 3pt accent rule under the band — the one saturated line on the page, so it
  // reads as the brand edge rather than as a table border.
  ops.push(`q ${rgb(ACCENT)} rg 0 ${pt(PAGE_HEIGHT - BAND_HEIGHT - 3)} ${pt(PAGE_WIDTH)} 3 re f Q`);
}

function drawMeta(ops: string[], lines: string[], top: number): number {
  let cursor = top;
  for (const line of lines) {
    ops.push(
      text(MUTED, "F1", META_FONT_SIZE, MARGIN_X, cursor, fitText(line, CONTENT_WIDTH, META_FONT_SIZE, false)),
    );
    cursor -= META_LINE;
  }
  return cursor;
}

function drawTableHeader(ops: string[], columns: Column[], placements: Placement[], top: number): void {
  ops.push(
    `q ${rgb(BRAND_DEEP)} rg ${pt(MARGIN_X)} ${pt(top - TABLE_HEADER_HEIGHT)} ${pt(CONTENT_WIDTH)} ` +
      `${pt(TABLE_HEADER_HEIGHT)} re f Q`,
  );
  const y = baseline(top, TABLE_HEADER_HEIGHT, FONT_SIZE);
  columns.forEach((column, index) => {
    const placement = placements[index]!;
    const label = fitText(column.label, placement.maxWidth, FONT_SIZE, true);
    ops.push(
      column.right
        ? text(WHITE, "F2", FONT_SIZE, placement.x, y, label, placement.x + placement.maxWidth)
        : text(WHITE, "F2", FONT_SIZE, placement.x + CELL_PAD_X, y, label),
    );
  });
}

function drawRow(
  ops: string[],
  columns: Column[],
  placements: Placement[],
  rowIndex: number,
  top: number,
  banded: boolean,
): void {
  if (banded) {
    ops.push(
      `q ${rgb(ZEBRA)} rg ${pt(MARGIN_X)} ${pt(top - ROW_HEIGHT)} ${pt(CONTENT_WIDTH)} ${pt(ROW_HEIGHT)} re f Q`,
    );
  }
  const y = baseline(top, ROW_HEIGHT, FONT_SIZE);
  columns.forEach((column, index) => {
    const placement = placements[index]!;
    const value = fitText(column.values[rowIndex]!, placement.maxWidth, FONT_SIZE, false);
    if (value === "") return;
    ops.push(
      column.right
        ? text(INK, "F1", FONT_SIZE, placement.x, y, value, placement.x + placement.maxWidth)
        : text(INK, "F1", FONT_SIZE, placement.x + CELL_PAD_X, y, value),
    );
  });
}

function drawFooter(ops: string[], pageNumber: number, pageCount: number): void {
  rule(ops, FOOTER_RULE_Y, RULE, 0.6);
  const y = FOOTER_RULE_Y - 14;
  ops.push(
    text(
      MUTED,
      "F1",
      FOOTER_FONT_SIZE,
      MARGIN_X,
      y,
      "CNCS Property Management System  -  Addis Ababa University",
    ),
  );
  ops.push(
    text(MUTED, "F1", FOOTER_FONT_SIZE, MARGIN_X, y, `Page ${pageNumber} of ${pageCount}`, MARGIN_X + CONTENT_WIDTH),
  );
}

interface PageLayout {
  /** Reserved height for the band, metadata block and part caption. */
  tableTop: number;
  firstRowTop: number;
  rowsPerPage: number;
}

/** The page furniture is identical on every page, so this is computed once. */
function layoutPages(metaCount: number, partCount: number): PageLayout {
  const bandBottom = PAGE_HEIGHT - BAND_HEIGHT - 3;
  const partHeight = partCount > 1 ? PART_LINE : 0;
  const tableTop = bandBottom - 16 - metaCount * META_LINE - partHeight - 6;
  const firstRowTop = tableTop - 4 - TABLE_HEADER_HEIGHT;
  const lastRowBottom = FOOTER_RULE_Y + 14;

  return {
    tableTop,
    firstRowTop,
    rowsPerPage: Math.max(1, Math.floor((firstRowTop - lastRowBottom) / ROW_HEIGHT)),
  };
}

interface PagePlan {
  columns: Column[];
  placements: Placement[];
  part: number;
  partCount: number;
  start: number;
  end: number;
}

function planPages(groups: Column[][], rowCount: number, layout: PageLayout): PagePlan[] {
  const pages: PagePlan[] = [];

  groups.forEach((group, partIndex) => {
    const fitted = fitGroup(group);
    const placements = placeColumns(fitted);

    if (rowCount === 0) {
      pages.push({ columns: fitted, placements, part: partIndex + 1, partCount: groups.length, start: 0, end: 0 });
      return;
    }

    for (let start = 0; start < rowCount; start += layout.rowsPerPage) {
      pages.push({
        columns: fitted,
        placements,
        part: partIndex + 1,
        partCount: groups.length,
        start,
        end: Math.min(start + layout.rowsPerPage, rowCount),
      });
    }
  });

  // An empty report is still a page: the header row and the filters that produced
  // it are the answer to "why is this blank?".
  if (pages.length === 0) {
    const fitted = fitGroup([]);
    pages.push({ columns: fitted, placements: [], part: 1, partCount: 1, start: 0, end: 0 });
  }

  return pages;
}

function buildPageStream(
  options: PdfTableOptions,
  plan: PagePlan,
  organisation: string,
  metaLines: string[],
  layout: PageLayout,
  pageNumber: number,
  pageCount: number,
): string {
  const ops: string[] = [];

  drawBand(ops, options.title, organisation);

  const bandBottom = PAGE_HEIGHT - BAND_HEIGHT - 3;
  const cursor = drawMeta(ops, metaLines, bandBottom - 16);

  let tableTop = cursor - 6;
  if (plan.partCount > 1) {
    ops.push(
      text(
        MUTED,
        "F1",
        PART_FONT_SIZE,
        MARGIN_X,
        tableTop + 2,
        `Part ${plan.part} of ${plan.partCount}: ${plan.columns.map((column) => column.label).join(", ")}`,
        MARGIN_X + CONTENT_WIDTH,
      ),
    );
    tableTop -= PART_LINE;
  }

  rule(ops, tableTop, ACCENT, 1);
  drawTableHeader(ops, plan.columns, plan.placements, tableTop - 4);

  let rowTop = tableTop - 4 - TABLE_HEADER_HEIGHT;
  for (let index = plan.start; index < plan.end; index++) {
    drawRow(ops, plan.columns, plan.placements, index, rowTop, (index - plan.start) % 2 === 1);
    rowTop -= ROW_HEIGHT;
  }
  rule(ops, rowTop, RULE, 0.6);

  drawFooter(ops, pageNumber, pageCount);
  return ops.join("\n");
}

/**
 * Serializes a table as a branded, paginated PDF report. Returns a Buffer so
 * Express can `send()` it directly, exactly as the CSV path sends a string.
 */
export function toPdfTable(options: PdfTableOptions): Buffer {
  const { title, subtitle, rows, meta = [] } = options;
  const organisation = options.organisation ?? DEFAULT_ORGANISATION;

  const columns = buildColumns(options);
  const groups = groupColumns(columns);
  const metaLines = [subtitle ?? `Generated ${new Date().toISOString()}`, ...meta];

  const layout = layoutPages(metaLines.length, groups.length);
  const pages = planPages(groups, rows.length, layout);
  const pageCount = pages.length;

  const objects: string[] = [];
  const addObject = (body: string): number => {
    objects.push(body);
    return objects.length;
  };

  const catalogNumber = addObject("");
  const pagesNumber = addObject("");
  const regularFontNumber = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const boldFontNumber = addObject(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );

  const now = new Date();
  const pdfDate = `D:${now.toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z`;
  const infoNumber = addObject(
    `<< /Title (${escapeText(printable(title))}) /Author (CNCS Property Management System) ` +
      `/Subject (${escapeText(printable(organisation))}) ` +
      `/Creator (CNCS Property Management System) /Producer (CNCS Property Management System) ` +
      `/CreationDate (${escapeText(pdfDate)}) >>`,
  );

  const pageNumbers: number[] = [];
  pages.forEach((plan, index) => {
    const content = buildPageStream(options, plan, organisation, metaLines, layout, index + 1, pageCount);
    const contentNumber = addObject(
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    );
    const pageNumber = addObject(
      `<< /Type /Page /Parent ${pagesNumber} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${regularFontNumber} 0 R /F2 ${boldFontNumber} 0 R >> >> ` +
        `/Contents ${contentNumber} 0 R >>`,
    );
    pageNumbers.push(pageNumber);
  });

  objects[catalogNumber - 1] = `<< /Type /Catalog /Pages ${pagesNumber} 0 R >>`;
  objects[pagesNumber - 1] =
    `<< /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageCount} >>`;

  // Everything written here is printable ASCII, so string length equals byte
  // length and the xref offsets below stay correct.
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  const objectCount = objects.length + 1;
  pdf += `xref\n0 ${objectCount}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objectCount} /Root ${catalogNumber} 0 R /Info ${infoNumber} 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}
