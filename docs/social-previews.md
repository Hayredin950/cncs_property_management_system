# Social previews

What this app looks like when a link to it is pasted into WhatsApp, Telegram,
Slack, Discord, Facebook, X, LinkedIn or iMessage — and why most of the work
happens on a server rather than in the React app.

## The constraint that shapes everything here

Every one of those platforms fetches a shared URL with a plain HTTP client and
**reads only the `<head>`. They do not run JavaScript.** This app is a Vite
single-page bundle, so `dist/index.html` is one static document and the `<head>`
is identical no matter which URL was pasted.

That means a client-side fix is impossible in principle: no amount of React can
change what a crawler sees, because the crawler never gets that far. Any
"dynamic preview" has to be rendered before the response leaves the server.

## What the preview looks like now

Three states, decided per URL:

| Shared URL                 | Title                             | Image                                        |
| -------------------------- | --------------------------------- | -------------------------------------------- |
| `/` (or anything non-item) | AAU CNCS campus property register | `og/default.jpg` — the branded card          |
| `/item/:tagId`, photographed | The item's own name             | the item's photo, cropped to 1200×630        |
| `/item/:tagId`, no photo   | The item's own name               | `og/item.jpg` — the branded item card        |
| `/item/:tagId`, unknown tag | `Tag not found`                  | `og/default.jpg`                             |
| `/item/:tagId`, disposed   | `This item is no longer registered` | `og/default.jpg`                           |
| backend unreachable        | the item's name, or the site card | `og/default.jpg`                             |

A photographed item's description reads, for example:

> Laptops · CNCS Building, Room 312 · Good condition. AAU CNCS property register, tag CNCS-AB12CD34.

Note what the disposed case does **not** do: it does not name the item. The API
answers `410` for a disposed item with a single sentence and deliberately omits
the name (`routes/items.ts`, implementing SRS F7.3), and a preview card is a
channel the original page-level implementation never had to consider — so the
card mirrors the API exactly rather than going to look the item up itself.

## How it works

```
crawler ──► GET /item/CNCS-AB12CD34
              │
              │  frontend/vercel.json — rewrite, matched on User-Agent only
              ▼
           /api/preview?tagId=CNCS-AB12CD34
              │
              │  api/preview.ts — fetches GET /api/v1/items/:tagId (public)
              ▼
           src/lib/socialPreview.ts — builds the <meta> document
              │
              ▼
           200 text/html, cached 1h at the edge

real visitor ──► same URL ──► no rewrite matches ──► dist/index.html ──► the SPA
```

Three files carry it:

- **`frontend/vercel.json`** — one rewrite, gated on the `User-Agent` header. It
  is listed **before** the SPA catch-all, which matters: the catch-all serves
  `index.html` for everything, so a rule placed after it would never match. A
  normal browser's User-Agent matches none of the pattern, so a real visitor
  never reaches the function and pays nothing.
- **`frontend/api/preview.ts`** — the Vercel Function. Reads the tag from the
  query string, calls the public item endpoint, maps HTTP status to copy, returns
  the HTML. Reads `API_BASE_URL` (falling back to `VITE_API_BASE_URL`) and
  optionally `SITE_ORIGIN`.
- **`frontend/src/lib/socialPreview.ts`** — every rule worth testing: escaping,
  URL absolutising, the Cloudinary crop, the copy, the document. Pure, so it is
  unit-tested without a network.

Two details worth knowing before editing any of it:

- **`og:image` must be absolute.** WhatsApp, Telegram, Facebook and X all discard
  a relative image URL rather than resolving it against the page, so
  `/og/default.jpg` produces no card at all. That is the entire reason
  `vite.config.ts` grows a `cncs:site-origin` plugin: `index.html` is static, so
  its origin has to be substituted at build time.
- **There is no redirect in the preview document.** Not a `<meta
  http-equiv="refresh">`, not an inline `location.replace`. Googlebot executes
  JavaScript and matches the crawler pattern, so it would be sent straight back
  to the URL that routed it here, forever. The document has a plain link instead.

## The card images

`frontend/public/og/default.jpg` and `item.jpg`, both exactly **1200×630** — the
1.91:1 ratio every one of these platforms crops a large preview to. Their source
HTML and the render command live in `frontend/scripts/og/`; see the README there,
including why they are JPEG rather than PNG and why they must stay well under
300 KB (WhatsApp silently drops an `og:image` that is too heavy and falls back to
a bare text link).

An item **with** a photograph does not use either file. Its `og:image` is the
photo itself, with a Cloudinary transformation inserted into the delivery URL
(`w_1200,h_630,c_fill,g_auto,q_auto,f_jpg`) so the CDN does the crop, the smart
subject framing and the JPEG encode at the edge. `f_jpg` is forced rather than
`f_auto` because `f_auto` returns WebP when the caller's `Accept` header allows
it — and these crawlers are exactly the clients that do not.

## Verifying it

The `User-Agent` pattern includes `curl` deliberately, so the exact bytes a
crawler receives can be printed from a terminal:

```bash
# What a crawler sees for a real tag.
curl -s -H 'User-Agent: WhatsApp/2.23' https://<your-domain>/item/<tagId>

# The home page's static tags (no function involved).
curl -s https://<your-domain>/ | grep -E 'og:|twitter:'

# A real visitor still gets the SPA.
curl -s -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140' \
  https://<your-domain>/item/<tagId> | head -5
```

The pattern and its test cases are pinned in
`frontend/src/test/socialPreview.test.ts`, including real User-Agent strings for
each crawler and four real browsers that must **not** match.

**Caching.** Every platform caches a preview, and WhatsApp and Telegram cache
aggressively — often for days, sometimes longer. If a card changes and the old
one is still showing, that is the platform's cache, not this code:

| Platform | How to force a refresh                                   |
| -------- | -------------------------------------------------------- |
| Telegram | send the link to [@WebpageBot](https://t.me/WebpageBot)   |
| Facebook | [Sharing Debugger](https://developers.facebook.com/tools/debug/) → "Scrape Again" |
| X        | [Card Validator](https://cards-dev.twitter.com/validator) |
| WhatsApp | no tool — append a query string (`?v=2`) so the URL differs |
| Slack/Discord | re-post the link                              |

The function's own response is cached at the edge for an hour
(`s-maxage=3600`), with `stale-while-revalidate=86400`.

## Configuration

| Variable                 | Where              | Needed for                                                     |
| ------------------------ | ------------------ | -------------------------------------------------------------- |
| `VITE_SITE_ORIGIN`       | build time, frontend | Absolute URLs in `index.html`'s tags, **when a custom domain is attached**. Optional on Vercel, which infers it from `VERCEL_PROJECT_PRODUCTION_URL`. |
| `API_BASE_URL`           | runtime, frontend function | The backend's origin. Falls back to `VITE_API_BASE_URL`, which is already set for the client. |
| `SITE_ORIGIN`            | runtime, frontend function | Override for the origin a shared link should point at. Optional — it defaults to the origin the request arrived on. |

The `/item/:tagId` endpoint needs **no** configuration at all: it derives the
origin from the request and the backend URL from the environment the client
already uses. Only the static home-page tags depend on `VITE_SITE_ORIGIN`.

## Known limits

- **Portrait images help no one here.** `og:image` has one shape that every
  platform renders as a large card, and it is landscape. A portrait image gets
  shown as a small square thumbnail or cropped unpredictably. See below.
- **Instagram has no link previews at all** — it does not read `og:*` for shared
  links. A portrait variant would only matter for manual posting.
- **Slack and Discord show a smaller card** than WhatsApp and Telegram even at
  the correct ratio. That is their layout, not a defect here.
- **The item's title is capped at 68 characters and the description at 155**,
  cut on a word boundary. Longer values are ellipsised by the platforms
  mid-word otherwise.
- **A photo hosted anywhere other than Cloudinary gets no declared
  dimensions**, because the file is whatever size it is. The platforms measure it
  themselves; declaring a size we have not verified would make them crop against
  a rectangle that is not there.

## What would make the cards better

Nothing is blocked — the cards shipped and render correctly today. These are the
inputs that would upgrade them from *consistent with the brand* to *designed*,
in rough order of value:

1. **One rights-cleared AAU or CNCS campus photograph**, landscape, at least
   2400×1260, ideally 3000+ wide. Used as a duotone panel across the right
   two-thirds of the default card, behind the crest and headline. This is the
   single change that would stop the card reading as a template. Must be a photo
   the university is happy to have redistributed by third parties — it will be
   re-hosted by every platform that renders the preview.
2. **A high-resolution crest with transparency**, at least 1024×1024, SVG
   preferred. The current asset is the 427×427 PNG from `aau.edu.et`. It is
   sufficient as used (the card renders the seal at 96px, so it is downscaled,
   not upscaled) but an SVG would remove the ceiling for larger formats.
3. **The `Noto Sans Ethiopic` font file (regular + medium).** The cards
   currently carry Amharic only where it is burnt into the crest artwork,
   because the card is rendered without that font installed and Ethiopic text
   would render as tofu boxes. With the font, `አዲስ አበባ ዩኒቨርሲቲ` can sit above the
   Latin wordmark exactly as the real site's header does.
4. **Full-bleed production photos of real items**, uploaded through the item
   form rather than seeded from `public/photos/`. Item previews use the photo
   directly, so this is the highest-leverage change for tag shares: a good photo
   of the actual asset is a better card than any branded template.

**Do not** provide a portrait (9:16 or 4:5) card. It will be cropped or shrunk
by every platform this feature targets.
