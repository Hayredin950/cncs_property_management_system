import { CONDITIONS, CONDITION_LABELS, type Condition } from "../types/enums";

/**
 * Social preview metadata — the `og:` / `twitter:` document that link-preview
 * crawlers read.
 *
 * ## Why this has to be built on a server
 *
 * WhatsApp, Telegram, Slack, Discord, Facebook, X and LinkedIn all fetch a
 * shared URL with a plain HTTP client and **read the `<head>` without running
 * any JavaScript**. This app is a Vite single-page bundle whose `index.html`
 * carries one static set of tags, so before this file every link ever pasted
 * anywhere — a QR tag, an item, the home page — previewed as the same generic
 * card, and the item's own photograph was never seen.
 *
 * No amount of client-side React can fix that, which is the whole reason
 * `frontend/api/preview.ts` exists: a rewrite matched on the crawler's
 * `User-Agent` (see `frontend/vercel.json`) hands those requests to a function
 * that renders the tags from real item data. Human visitors still get the SPA,
 * untouched.
 *
 * ## What lives here
 *
 * Every rule worth testing — escaping, absolutising, the Cloudinary crop, the
 * copy, the document itself — and nothing that knows about HTTP. The handler
 * does the request and the response; this module is pure, so `socialPreview.test.ts`
 * can pin down the behaviour that matters without a network or a browser.
 *
 * The card artwork these reference is rendered from `frontend/scripts/og`; their
 * README explains the sizes and why they are JPEG.
 */

export const SITE_NAME = "Addis Ababa University — CNCS Property Management System";

/** The home page / generic card. `frontend/scripts/og/card-default.html`. */
export const DEFAULT_CARD_PATH = "/og/default.jpg";

/** The found-but-unphotographed item card. `frontend/scripts/og/card-item.html`. */
export const ITEM_CARD_PATH = "/og/item.jpg";

/**
 * The card's real pixel size. Both checked-in cards are exactly this, and when
 * a Cloudinary photo is used the crop below forces the same dimensions, so it is
 * always safe to declare — which matters, because a platform that cannot learn
 * the dimensions will render a small thumbnail instead of a large card.
 */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/** Title/description budgets. Beyond these the big platforms ellipsise mid-word. */
const MAX_TITLE = 68;
const MAX_DESCRIPTION = 155;

/** Longest tag id worth echoing back into a page. Real ones are ~10 characters. */
const MAX_TAG_ID = 64;

export interface CardImage {
  url: string;
  /** Absent when the image is a photo we did not size ourselves. */
  width?: number;
  height?: number;
  type?: string;
}

export interface SocialPreview {
  title: string;
  description: string;
  /** Absolute URL of the record, so the canonical link is the SPA route. */
  pageUrl: string;
  image: CardImage;
  imageAlt: string;
}

/** `GET /items/:tagId` with no match, per `routes/items.ts`. */
export type UnavailableReason = "notFound" | "gone" | "unreachable";

/* -------------------------------------------------------------------------- */
/* Escaping                                                                    */
/* -------------------------------------------------------------------------- */

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escape a value for use inside an HTML attribute *or* text node.
 *
 * This is not optional hygiene here. `item.name` is free text an operator typed
 * into the item form, and the document below is served from the app's own
 * origin — so an unescaped name would be stored XSS whose payload is delivered
 * to anything that fetches the URL. Both quote styles are escaped so the same
 * function is safe in either context.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/* -------------------------------------------------------------------------- */
/* Text                                                                        */
/* -------------------------------------------------------------------------- */

/** Collapse whitespace, trim, and return `null` rather than an empty string. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 0 ? collapsed : null;
}

/** Read `{ name }` off an object we have not typed — e.g. `item.category`. */
function nestedName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  return text((value as { name?: unknown }).name);
}

/** A `Condition` enum member's human label, or `null` for anything unexpected. */
function conditionLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  // `CONDITIONS` mirrors the Prisma schema and is the single source of truth for
  // the members. A value outside it means this build does not know the enum —
  // inventing a label for it would be worse than saying nothing.
  if (!(CONDITIONS as readonly string[]).includes(value)) return null;
  return CONDITION_LABELS[value as Condition];
}

/**
 * Cut a string to `max` characters on a word boundary, with an ellipsis.
 *
 * Word-boundary rather than hard slice because these strings are the visible
 * headline of the preview card: "Dell Latitude 5420 La…" reads as broken, and
 * platforms add their own ellipsis on top of ours when we overshoot.
 */
export function truncate(value: string, max: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;

  const cut = collapsed.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  // Only back up to a space when it leaves most of the budget intact. Without
  // this, a value that is one long unbroken token — a serial number, a URL, a
  // filename used as an item name — would collapse to whatever short word the
  // name happened to begin with.
  const clipped = lastSpace > max * 0.4 ? cut.slice(0, lastSpace) : cut;
  return `${clipped.replace(/[.,;:!?\-–—]+$/, "")}…`;
}

/** Normalise a tag id arriving from a query string. */
export function normalizeTagId(value: unknown): string {
  return (text(value) ?? "").slice(0, MAX_TAG_ID);
}

/**
 * Prefix a value with its label unless the operator already typed it.
 *
 * The column is free text and both conventions exist in this codebase:
 * `prisma/seed.ts` stores `room: "312"`, while the frontend's own fixtures store
 * `room: "Room 204"`. Blindly prefixing produces "Room Room 204".
 */
function labelled(value: string | null, label: string): string | null {
  if (!value) return null;
  return value.toLowerCase().startsWith(label.toLowerCase()) ? value : `${label} ${value}`;
}

/* -------------------------------------------------------------------------- */
/* URLs                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a possibly-relative URL against the site origin.
 *
 * `photoUrl` is a plain string column, so it holds a path like
 * `/photos/laptop.jpg` for seeded items and a full `https://res.cloudinary.com/…`
 * for uploaded ones. Both have to become absolute, because every platform
 * requires an absolute `og:image` and silently drops a relative one.
 *
 * Returns `null` for anything that is not http(s) — the same column is operator
 * input, and a `javascript:` or `data:` URL must never be templated into an
 * attribute.
 */
export function absoluteUrl(value: string, siteOrigin: string): string | null {
  try {
    const url = new URL(value, siteOrigin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Cloudinary's own transformation that produces a card-shaped crop. */
const CLOUDINARY_CARD_TRANSFORM = "w_1200,h_630,c_fill,g_auto,q_auto,f_jpg";

const CLOUDINARY_UPLOAD_MARKER = "/image/upload/";

/** `true` for a segment like `w_800,c_fill` or `f_auto`, false for `v1234` or a folder. */
function isCloudinaryTransform(segment: string): boolean {
  return segment.includes(",") || /^[a-z]{1,3}_/.test(segment);
}

/**
 * Ask Cloudinary for a 1200×630 version of an uploaded photo.
 *
 * Uploaded photos are whatever the operator's phone produced — portrait,
 * landscape, 3000px wide — and a platform handed a portrait image renders a
 * small square thumbnail instead of the large card. Rather than fight that, the
 * transformation segment is inserted into the delivery URL and Cloudinary does
 * the crop, the smart framing (`g_auto` picks the subject) and the JPEG encode
 * at the edge. `f_jpg` is forced rather than `f_auto`: `f_auto` returns WebP when
 * the caller's `Accept` header allows it, and the crawlers here are exactly the
 * clients that do not.
 *
 * Returns `null` when the URL is not Cloudinary-delivered, so the caller can
 * fall back to declaring no dimensions instead of guessing at a lie.
 */
export function cloudinaryCardUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!/(^|\.)cloudinary\.com$/.test(parsed.hostname)) return null;

  const at = parsed.pathname.indexOf(CLOUDINARY_UPLOAD_MARKER);
  if (at === -1) return null;

  const prefix = parsed.pathname.slice(0, at + CLOUDINARY_UPLOAD_MARKER.length);
  const segments = parsed.pathname.slice(at + CLOUDINARY_UPLOAD_MARKER.length).split("/");

  // A delivery URL may already carry its own transformation before the public id
  // (`.../upload/w_800,c_fill/cncs-pms/items/ABC`). Ours has to *replace* it, not
  // chain onto it: two `c_fill`s in a row crop the already-cropped result, which
  // is how a photo ends up as a magnified band of somebody's desk. A version
  // segment (`v1712345678`) is not a transformation and stays where it is.
  if (segments.length > 1 && isCloudinaryTransform(segments[0] ?? "")) {
    segments.shift();
  }
  if (segments.length === 0) return null;

  parsed.pathname = `${prefix}${CLOUDINARY_CARD_TRANSFORM}/${segments.join("/")}`;
  return parsed.toString();
}

function cardImage(path: string, siteOrigin: string): CardImage {
  return {
    url: new URL(path, siteOrigin).toString(),
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    type: "image/jpeg",
  };
}

/* -------------------------------------------------------------------------- */
/* Building a preview                                                          */
/* -------------------------------------------------------------------------- */

/** The home page, and the shape every other failure mode degrades to. */
export function buildSitePreview(siteOrigin: string): SocialPreview {
  return {
    title: "AAU CNCS campus property register",
    description:
      "Scan the QR tag on any Addis Ababa University CNCS property item, or search by name, to see its registered record.",
    pageUrl: new URL("/", siteOrigin).toString(),
    image: cardImage(DEFAULT_CARD_PATH, siteOrigin),
    imageAlt:
      "Addis Ababa University crest above the words “Campus property, verified by QR” on a navy background.",
  };
}

/**
 * The three ways a tag can fail to produce a record.
 *
 * Each is written to say exactly what the API said and nothing more. `gone`
 * mirrors `routes/items.ts`, which answers 410 with a single sentence and
 * deliberately omits the item's name — a disposed item must not have its
 * details leaked by a preview card, which is a channel the page-level
 * implementation of F7.3 never had to think about.
 */
export function buildUnavailablePreview(
  siteOrigin: string,
  tagId: string,
  reason: UnavailableReason,
): SocialPreview {
  const safeTag = escapeForProse(tagId);
  const copy: Record<UnavailableReason, { title: string; description: string; alt: string }> = {
    notFound: {
      title: "Tag not found",
      description: `No item is registered against the CNCS tag ${safeTag}. Check the sticker, or search the register by name.`,
      alt: "Addis Ababa University CNCS property register.",
    },
    gone: {
      title: "This item is no longer registered",
      description: `The item on tag ${safeTag} has been disposed of and removed from the public register.`,
      alt: "Addis Ababa University CNCS property register.",
    },
    unreachable: {
      title: "AAU CNCS campus property register",
      description: `Open the register to look up CNCS tag ${safeTag}.`,
      alt: "Addis Ababa University CNCS property register.",
    },
  };

  const chosen = copy[reason];

  return {
    title: truncate(chosen.title, MAX_TITLE),
    description: truncate(chosen.description, MAX_DESCRIPTION),
    pageUrl: new URL(`/item/${encodeURIComponent(tagId)}`, siteOrigin).toString(),
    image: cardImage(DEFAULT_CARD_PATH, siteOrigin),
    imageAlt: chosen.alt,
  };
}

/**
 * `tagId` is echoed into prose rather than an attribute, so it is not
 * HTML-escaped here — it is stripped to a conservative character set instead.
 * A tag id is generated by `generateTagId()` and is always `[A-Z0-9-]`; anything
 * else arriving in the query string is not a tag id and has no business
 * appearing in a shared card's text.
 */
function escapeForProse(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase();
  return cleaned.length > 0 ? cleaned : "—";
}

/**
 * Turn a real `GET /items/:tagId` body into a preview.
 *
 * Every field is read defensively: this consumes a network response, so the
 * typed `Item` interface is a description of what *should* arrive, not a
 * guarantee. A body of the wrong shape degrades to the site card rather than
 * producing a half-empty heading.
 */
export function buildItemPreview(body: unknown, siteOrigin: string, tagId: string): SocialPreview {
  if (!body || typeof body !== "object") {
    return buildUnavailablePreview(siteOrigin, tagId, "unreachable");
  }

  const item = body as Record<string, unknown>;
  const name = text(item.name);
  if (!name) {
    return buildUnavailablePreview(siteOrigin, tagId, "unreachable");
  }

  const category = nestedName(item.category);
  const building = text(item.building);
  const room = text(item.room);
  const condition = conditionLabel(item.condition);
  const photo = text(item.photoUrl);

  // Location reads as one unit — "CNCS Building, Room 312" — rather than as
  // three separately-joined facts, because the platforms truncate the
  // description from the end and the room is the part a reader needs. The floor
  // is dropped on purpose: it is already encoded in the room number and the
  // budget is 155 characters.
  const roomLabel = labelled(room, "Room");
  const where = building && roomLabel ? `${building}, ${roomLabel}` : building || roomLabel;

  const facts = [category, where, condition ? `${condition} condition` : null].filter(
    (fact): fact is string => fact !== null,
  );

  const summary = facts.length > 0 ? `${facts.join(" · ")}. ` : "";

  return {
    title: truncate(name, MAX_TITLE),
    description: truncate(`${summary}AAU CNCS property register, tag ${escapeForProse(tagId)}.`, MAX_DESCRIPTION),
    pageUrl: new URL(`/item/${encodeURIComponent(tagId)}`, siteOrigin).toString(),
    image: resolveItemImage(photo, siteOrigin),
    imageAlt: `Addis Ababa University CNCS record for ${name}.`,
  };
}

/**
 * The item's own photograph when it has one, the branded item card when it does
 * not.
 *
 * A photo that Cloudinary will crop is declared as 1200×630 because the
 * transformation above guarantees it. Any other URL — a seeded `/photos/…`
 * path, a photo hosted somewhere else entirely — is passed through with **no**
 * dimensions: the file is whatever size it is, and claiming 1200×630 for an
 * image that is not would make the platforms crop against a rectangle that
 * isn't there.
 */
function resolveItemImage(photoUrl: string | null, siteOrigin: string): CardImage {
  if (!photoUrl) return cardImage(ITEM_CARD_PATH, siteOrigin);

  const absolute = absoluteUrl(photoUrl, siteOrigin);
  if (!absolute) return cardImage(ITEM_CARD_PATH, siteOrigin);

  const cropped = cloudinaryCardUrl(absolute);
  if (cropped) {
    return { url: cropped, width: CARD_WIDTH, height: CARD_HEIGHT, type: "image/jpeg" };
  }

  return { url: absolute };
}

/* -------------------------------------------------------------------------- */
/* The document                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Render the crawler-facing document.
 *
 * Both the Open Graph and the Twitter sets are emitted even though Twitter is
 * not a target: Telegram and several others fall back to `twitter:*` when a page
 * omits `og:*`, and the reverse is not true. `og:image:secure_url` is included
 * for the same reason — WhatsApp prefers it, and a crawler that finds only the
 * plain `og:image` still works.
 *
 * The `<body>` is a real, on-brand fallback rather than empty markup. It
 * deliberately contains **no redirect** — not a `<meta http-equiv="refresh">`,
 * not an inline `location.replace`. Both would be followed by the crawlers that
 * do execute JavaScript (Googlebot), which would send them straight back to the
 * URL that routing sent here, and loop forever. The rewrite only ever routes
 * link-preview clients here, so nobody should see this page; the link is there
 * for the case where somebody does.
 */
export function buildPreviewHtml(preview: SocialPreview): string {
  const meta = (property: string, content: string) =>
    `    <meta property="${escapeHtml(property)}" content="${escapeHtml(content)}" />`;

  const named = (name: string, content: string) =>
    `    <meta name="${escapeHtml(name)}" content="${escapeHtml(content)}" />`;

  // Ordered so that `width`/`height`/`type` are simply absent when the image is
  // a photo we did not crop ourselves.
  const imageTags = [
    meta("og:image", preview.image.url),
    meta("og:image:secure_url", preview.image.url),
    ...(preview.image.type ? [meta("og:image:type", preview.image.type)] : []),
    ...(preview.image.width ? [meta("og:image:width", String(preview.image.width))] : []),
    ...(preview.image.height ? [meta("og:image:height", String(preview.image.height))] : []),
    meta("og:image:alt", preview.imageAlt),
  ].join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(preview.title)}</title>
    <meta name="description" content="${escapeHtml(preview.description)}" />
    <link rel="canonical" href="${escapeHtml(preview.pageUrl)}" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="theme-color" content="#026ca9" />
    <link rel="icon" type="image/png" href="/aau/aau-logo.png" />

    <!-- Open Graph. WhatsApp, Telegram, Facebook, Slack, Discord and LinkedIn
         read this set and nothing else. -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:locale:alternate" content="am_ET" />
${meta("og:title", preview.title)}
${meta("og:description", preview.description)}
${meta("og:url", preview.pageUrl)}
${imageTags}

    <!-- Twitter/X card. Telegram, Slack and others also fall back to these when
         a page omits og:*, so emitting both is what makes the preview reliable
         across all of them. -->
    <meta name="twitter:card" content="summary_large_image" />
${named("twitter:title", preview.title)}
${named("twitter:description", preview.description)}
${named("twitter:image", preview.image.url)}
${named("twitter:image:alt", preview.imageAlt)}
  </head>
  <body
    style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#01324e;color:#fff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif"
  >
    <main style="max-width:34rem;padding:2rem;text-align:center">
      <img src="/aau/aau-logo.png" alt="" width="88" height="88" />
      <h1 style="font-size:1.25rem;margin:1rem 0 0.5rem">${escapeHtml(preview.title)}</h1>
      <p style="margin:0 0 1.5rem;line-height:1.6;color:#b1d5ea">${escapeHtml(preview.description)}</p>
      <a href="${escapeHtml(preview.pageUrl)}" style="color:#fff">Open the property record →</a>
    </main>
  </body>
</html>
`;
}
