import {
  buildItemPreview,
  buildPreviewHtml,
  buildSitePreview,
  buildUnavailablePreview,
  normalizeTagId,
  type SocialPreview,
} from "../src/lib/socialPreview";

/**
 * The social-preview endpoint.
 *
 * Every link-preview crawler — WhatsApp, Telegram, Slack, Discord, Facebook, X,
 * LinkedIn — fetches a shared URL with no JavaScript engine and reads only the
 * `<head>`. The SPA cannot answer that: `index.html` is one static document, so
 * before this route every shared tag showed the same generic card and an item's
 * own photograph was never seen.
 *
 * `frontend/vercel.json` therefore rewrites requests for `/item/:tagId` to here
 * **when the `User-Agent` is a known crawler**, and only then. Real visitors are
 * untouched and still get the SPA, so this costs nothing on the normal path.
 *
 * ## Why the Web handler signature
 *
 * `export default (request: Request) => Response` rather than the older
 * `(req, res)` pair. Vercel's Node.js runtime supports both, and this one keeps
 * the file free of `@vercel/node` types — which matters because `tsconfig.app.json`
 * only includes `src`, so this file is deliberately outside the project's
 * typecheck and the fewer types it depends on, the less can drift unnoticed.
 *
 * The logic is all in `src/lib/socialPreview.ts`, which *is* typechecked and
 * unit-tested; what remains here is the request, the fetch and the response.
 */

/**
 * `process.env`, declared locally rather than pulled in from `@types/node`.
 *
 * This file is outside `tsconfig.app.json`'s `include` — it is a Vercel Function,
 * not app code — but `src/test/socialPreview.test.ts` imports it, and TypeScript
 * follows imports, so it is typechecked by the browser project after all. That
 * project deliberately sets `"types": ["vite/client"]` and nothing else, so that
 * browser code cannot reach for `process` and quietly get `undefined`. Adding
 * `node` there to satisfy one file would remove exactly that guard from every
 * other file. A module-scoped declaration is the narrow fix: it types the three
 * reads below and is invisible to the rest of the program.
 */
declare const process: { env: Record<string, string | undefined> };

/** Long enough for a cold backend and a Neon wake-up; short enough not to stall a crawler. */
const REQUEST_TIMEOUT_MS = 4_000;

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // The rewrite passes the route parameter through as a query string:
  // `/item/:tagId` -> `/api/preview?tagId=:tagId`.
  const tagId = normalizeTagId(url.searchParams.get("tagId"));
  const siteOrigin = readSiteOrigin(url.origin);

  const preview = tagId
    ? await buildPreviewForTag(tagId, siteOrigin)
    : buildSitePreview(siteOrigin);

  return new Response(buildPreviewHtml(preview), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Cached at the edge for an hour. Not `max-age`: the browser should never
      // hold this — it is not a page a person is meant to navigate to. The long
      // `stale-while-revalidate` lets a stale card be served instantly while a
      // fresh one is fetched, which matters because the crawlers themselves
      // retry a URL that took too long.
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      // The same signal `index.html` sends: an internal register, not a
      // marketing site. It does not stop a preview from being generated —
      // `noindex` governs search indexing, nothing else.
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

async function buildPreviewForTag(tagId: string, siteOrigin: string): Promise<SocialPreview> {
  const apiOrigin = readApiOrigin();
  if (!apiOrigin) return buildUnavailablePreview(siteOrigin, tagId, "unreachable");

  try {
    const response = await fetch(`${apiOrigin}/api/v1/items/${encodeURIComponent(tagId)}`, {
      // `GET /items/:tagId` is public — anonymous visitors are the whole point of
      // a QR tag — so this needs no credentials, and it must not send any: the
      // response is field-filtered per viewer (SDS 3.2) and a token here would
      // silently widen what a shared link can reveal.
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.ok) {
      // Parsed defensively rather than awaited directly: a body that is not JSON
      // should degrade to the generic card, not be conflated with a network
      // failure below.
      const body = await response.json().catch(() => null);
      return buildItemPreview(body, siteOrigin, tagId);
    }

    // 410 is the API's `F7.3` answer for a disposed item: one sentence, and
    // deliberately no name. The preview mirrors that exactly — see
    // `buildUnavailablePreview`.
    if (response.status === 410) return buildUnavailablePreview(siteOrigin, tagId, "gone");
    if (response.status === 404) return buildUnavailablePreview(siteOrigin, tagId, "notFound");
  } catch {
    // A backend that is cold, asleep, or briefly unreachable must still produce a
    // card. A preview that says less about the tag is a far smaller failure than
    // a shared link that previews as nothing at all.
  }

  return buildUnavailablePreview(siteOrigin, tagId, "unreachable");
}

/**
 * The origin a shared link should point at.
 *
 * Defaults to the origin the request arrived on, which is correct and needs no
 * configuration — Vercel preserves the public host through a rewrite, so the
 * links in the card match whatever domain the crawler actually asked for.
 * `SITE_ORIGIN` overrides it for the one case that cannot see itself: a custom
 * domain in front of a proxy, where the forwarded host is not what the user
 * typed.
 */
function readSiteOrigin(fallbackOrigin: string): string {
  const configured = process.env.SITE_ORIGIN?.trim();
  return stripTrailingSlash(configured && configured.length > 0 ? configured : fallbackOrigin);
}

/**
 * The backend's origin.
 *
 * `API_BASE_URL` first because it is this function's own variable and cannot be
 * confused with anything the browser bundle inlines; `VITE_API_BASE_URL` second
 * because that is the name the same value already has in every other
 * environment, and requiring a second copy of it just to render a preview is a
 * deployment trap. Neither carries `/api/v1` — it is appended below, once.
 */
function readApiOrigin(): string {
  const configured = process.env.API_BASE_URL ?? process.env.VITE_API_BASE_URL ?? "";
  return stripTrailingSlash(configured.trim());
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
