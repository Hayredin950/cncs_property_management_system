import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import previewHandler from "../../api/preview";
// `?raw` rather than `node:fs`, and the JSON imported directly, because this
// test asserts on two files that live outside `src` — and reading them with Node
// APIs would force `@types/node` into the browser project's `types` array, which
// exists precisely to stop app code reaching for `process`.
import indexHtmlSource from "../../index.html?raw";
import vercelConfig from "../../vercel.json";
import {
  DEFAULT_CARD_PATH,
  ITEM_CARD_PATH,
  absoluteUrl,
  buildItemPreview,
  buildPreviewHtml,
  buildSitePreview,
  buildUnavailablePreview,
  cloudinaryCardUrl,
  escapeHtml,
  normalizeTagId,
  truncate,
} from "../lib/socialPreview";
import { server } from "./msw/server";

const API = "http://localhost:4000/api/v1";
const SITE = "https://property.aau.edu.et";

/**
 * Social previews (`api/preview.ts` + `src/lib/socialPreview.ts`).
 *
 * Two of the things under test here are the ones nothing else can reach. The
 * `User-Agent` regex lives in `vercel.json`, which no unit test, typecheck or
 * local build ever evaluates; and the `<head>` of `index.html` is the only place
 * the home page's preview is defined, and a mistake there shows up as a bare
 * link on somebody else's phone rather than as a failing test. Both are read off
 * disk and asserted directly for that reason.
 */

/** A realistic Cloudinary delivery URL, in the shape `photoStorage.ts` returns. */
const CLOUDINARY_PHOTO =
  "https://res.cloudinary.com/r3rzw77s/image/upload/cncs-pms/items/CNCS-AB12CD34";

describe("escapeHtml", () => {
  it("escapes both quote styles so one value is safe in an attribute or a text node", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("truncate", () => {
  it("leaves a value inside the budget untouched", () => {
    expect(truncate("Dell Latitude 5440", 68)).toBe("Dell Latitude 5440");
  });

  it("collapses whitespace so a multi-line name cannot break the layout", () => {
    expect(truncate("Dell\n  Latitude\t5440", 68)).toBe("Dell Latitude 5440");
  });

  it("cuts on a word boundary rather than mid-word", () => {
    expect(truncate("hello world foo", 10)).toBe("hello…");
  });

  it("hard-cuts a single unbroken token instead of collapsing it to one word", () => {
    expect(truncate("X".repeat(40), 10)).toBe("XXXXXXXXX…");
  });

  it("drops trailing punctuation before adding the ellipsis", () => {
    expect(truncate("CNCS Building, Science Complex", 16)).toBe("CNCS Building…");
  });
});

describe("normalizeTagId", () => {
  it("trims, collapses whitespace and caps the length", () => {
    expect(normalizeTagId("  CNCS-AB12CD34 ")).toBe("CNCS-AB12CD34");
    expect(normalizeTagId("Z".repeat(200))).toHaveLength(64);
    expect(normalizeTagId(null)).toBe("");
  });
});

describe("absoluteUrl", () => {
  it("resolves a public/ path against the site origin", () => {
    expect(absoluteUrl("/photos/laptop.jpg", SITE)).toBe(`${SITE}/photos/laptop.jpg`);
  });

  it("passes an already-absolute URL through", () => {
    expect(absoluteUrl(CLOUDINARY_PHOTO, SITE)).toBe(CLOUDINARY_PHOTO);
  });

  it("refuses schemes that must never reach an attribute", () => {
    // `photoUrl` is operator-typed free text, so this is the difference between
    // a preview card and stored XSS served from the app's own origin.
    expect(absoluteUrl("javascript:alert(1)", SITE)).toBeNull();
    expect(absoluteUrl("data:text/html,<script>alert(1)</script>", SITE)).toBeNull();
  });

  it("returns null for a value it cannot parse", () => {
    expect(absoluteUrl("http://[", SITE)).toBeNull();
  });
});

describe("cloudinaryCardUrl", () => {
  it("inserts a 1200x630 crop and forces JPEG", () => {
    expect(cloudinaryCardUrl(CLOUDINARY_PHOTO)).toBe(
      `https://res.cloudinary.com/r3rzw77s/image/upload/w_1200,h_630,c_fill,g_auto,q_auto,f_jpg/${"cncs-pms/items/CNCS-AB12CD34"}`,
    );
  });

  it("keeps the version segment after the transformation", () => {
    expect(
      cloudinaryCardUrl("https://res.cloudinary.com/c/image/upload/v1712345678/folder/pic.jpg"),
    ).toBe(
      "https://res.cloudinary.com/c/image/upload/w_1200,h_630,c_fill,g_auto,q_auto,f_jpg/v1712345678/folder/pic.jpg",
    );
  });

  it("replaces an existing transformation rather than chaining a second crop", () => {
    // Two `c_fill`s in a row crop the already-cropped result — the failure mode
    // is a photo rendered as a magnified band of somebody's desk.
    expect(cloudinaryCardUrl("https://res.cloudinary.com/c/image/upload/w_800,c_fill/x/y.jpg")).toBe(
      "https://res.cloudinary.com/c/image/upload/w_1200,h_630,c_fill,g_auto,q_auto,f_jpg/x/y.jpg",
    );
  });

  it("returns null for anything that is not Cloudinary-delivered", () => {
    expect(cloudinaryCardUrl(`${SITE}/photos/laptop.jpg`)).toBeNull();
    // A lookalike host must not be treated as Cloudinary.
    expect(cloudinaryCardUrl("https://res.cloudinary.com.evil.test/image/upload/a.jpg")).toBeNull();
  });
});

describe("buildItemPreview", () => {
  const item = {
    name: "Dell Latitude 5440",
    tagId: "CNCS-AB12CD34",
    category: { id: "cat-1", name: "Laptops" },
    building: "CNCS Building",
    floor: "3",
    room: "312",
    department: "Computer Science",
    condition: "GOOD",
    photoUrl: null,
  };

  it("reads the item's real facts into the title and description", () => {
    const preview = buildItemPreview(item, SITE, "CNCS-AB12CD34");

    expect(preview.title).toBe("Dell Latitude 5440");
    expect(preview.description).toBe(
      "Laptops · CNCS Building, Room 312 · Good condition. AAU CNCS property register, tag CNCS-AB12CD34.",
    );
    expect(preview.pageUrl).toBe(`${SITE}/item/CNCS-AB12CD34`);
  });

  it("does not double the label when the column already carries it", () => {
    // `prisma/seed.ts` stores `room: "312"`; the frontend fixtures store
    // `room: "Room 204"`. Both are real, so neither may produce "Room Room 204".
    const preview = buildItemPreview({ ...item, room: "Room 204" }, SITE, "CNCS-AB12CD34");
    expect(preview.description).toContain("Room 204");
    expect(preview.description).not.toContain("Room Room");
  });

  it("uses the branded item card when the record has no photograph", () => {
    const preview = buildItemPreview(item, SITE, "CNCS-AB12CD34");
    expect(preview.image.url).toBe(`${SITE}${ITEM_CARD_PATH}`);
    expect(preview.image.width).toBe(1200);
    expect(preview.image.height).toBe(630);
  });

  it("uses the item's own photograph, cropped to the card ratio", () => {
    const preview = buildItemPreview({ ...item, photoUrl: CLOUDINARY_PHOTO }, SITE, "CNCS-AB12CD34");
    expect(preview.image.url).toContain("/w_1200,h_630,c_fill,g_auto,q_auto,f_jpg/");
    expect(preview.image.width).toBe(1200);
  });

  it("declares no dimensions for a photo it did not crop itself", () => {
    // Claiming 1200x630 for a file of unknown size makes the platforms crop
    // against a rectangle that is not there.
    const preview = buildItemPreview({ ...item, photoUrl: "/photos/laptop.jpg" }, SITE, "CNCS-AB12CD34");
    expect(preview.image.url).toBe(`${SITE}/photos/laptop.jpg`);
    expect(preview.image.width).toBeUndefined();
    expect(preview.image.height).toBeUndefined();
    expect(preview.image.type).toBeUndefined();
  });

  it("falls back to the site card for a body of the wrong shape", () => {
    expect(buildItemPreview({ nonsense: true }, SITE, "CNCS-AB12CD34").image.url).toBe(
      `${SITE}${DEFAULT_CARD_PATH}`,
    );
    expect(buildItemPreview(null, SITE, "CNCS-AB12CD34").image.url).toBe(
      `${SITE}${DEFAULT_CARD_PATH}`,
    );
  });

  it("never interpolates an unknown tag id into the prose", () => {
    // The tag id arrives from the query string, so it is stripped to the
    // character set `generateTagId()` actually emits.
    const preview = buildItemPreview(item, SITE, '<img src=x onerror=alert(1)>');
    expect(preview.description).not.toContain("<");
    expect(preview.description).not.toContain(">");
  });
});

describe("buildUnavailablePreview", () => {
  it("tells the public nothing more than the API's 410 does", () => {
    // `routes/items.ts` answers 410 for a disposed item with one sentence and
    // deliberately omits the name. A preview card is a channel the page-level
    // implementation of F7.3 never had to consider.
    const preview = buildUnavailablePreview(SITE, "CNCS-DEAD0000", "gone");
    expect(preview.title).toBe("This item is no longer registered");
    expect(preview.description).toContain("CNCS-DEAD0000");
    expect(preview.description).toContain("disposed of");
    expect(preview.image.url).toBe(`${SITE}${DEFAULT_CARD_PATH}`);
  });

  it("still links to the tag's real page so the card is not a dead end", () => {
    expect(buildUnavailablePreview(SITE, "CNCS-NOPE", "notFound").pageUrl).toBe(
      `${SITE}/item/CNCS-NOPE`,
    );
  });
});

describe("buildPreviewHtml", () => {
  it("emits the tags WhatsApp, Telegram and the rest actually read", () => {
    const html = buildPreviewHtml(buildSitePreview(SITE));

    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta property="og:image"');
    expect(html).toContain('<meta property="og:image:secure_url"'); // WhatsApp prefers this
    expect(html).toContain('<meta property="og:image:width" content="1200"');
    expect(html).toContain('<meta property="og:image:height" content="630"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image"');
    expect(html).toContain(`<link rel="canonical" href="${SITE}/"`);
  });

  it("cannot be escaped out of by an item name", () => {
    const preview = buildItemPreview(
      { name: '</title><script>alert(document.cookie)</script>', building: "B" },
      SITE,
      "CNCS-AB12CD34",
    );
    const html = buildPreviewHtml(preview);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("contains no redirect, which would loop a crawler that runs JavaScript", () => {
    // The rewrite sends `/item/:tagId` here based on User-Agent. A
    // `<meta http-equiv="refresh">` or a `location.replace` pointing back at the
    // page would send Googlebot (which executes JS) straight back to the URL
    // that routed it here, forever.
    const html = buildPreviewHtml(buildSitePreview(SITE));

    expect(html).not.toMatch(/http-equiv=["']?refresh/i);
    expect(html).not.toContain("location.replace");
    expect(html).not.toContain("<script");
  });
});

describe("the preview endpoint", () => {
  const request = (query = "") =>
    new Request(`https://property.aau.edu.et/api/preview${query}`, { method: "GET" });

  beforeEach(() => {
    // The handler reads the backend origin from the environment, like every
    // other server-side value in this project.
    vi.stubEnv("API_BASE_URL", "http://localhost:4000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders the home page's card when no tag is asked for", async () => {
    const response = await previewHandler(request());
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(html).toContain(`${SITE}/og/default.jpg`);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("renders a real item's name, location and card", async () => {
    // `PUBLIC_ITEM` in the fixtures is what an anonymous viewer gets — the same
    // field filtering a QR scan goes through.
    const html = await (await previewHandler(request("?tagId=CNCS-AB12CD34"))).text();

    expect(html).toContain("Dell Latitude 5440");
    expect(html).toContain("CNCS-AB12CD34");
    expect(html).toContain(`${SITE}/og/item.jpg`);
    expect(html).toContain(`<link rel="canonical" href="${SITE}/item/CNCS-AB12CD34"`);
  });

  it("prefers the item's photograph over the branded card", async () => {
    server.use(
      http.get(`${API}/items/CNCS-PHOTO01`, () =>
        HttpResponse.json({
          id: "item-photo",
          tagId: "CNCS-PHOTO01",
          name: "Zeiss Microscope",
          categoryId: "cat-2",
          category: { id: "cat-2", name: "Lab equipment" },
          department: "Biology",
          building: "Science Complex",
          floor: "2",
          room: "204",
          photoUrl: CLOUDINARY_PHOTO,
          condition: "GOOD",
          status: "ACTIVE",
          registeredAt: "2026-09-10T09:00:00.000Z",
        }),
      ),
    );

    const html = await (await previewHandler(request("?tagId=CNCS-PHOTO01"))).text();

    expect(html).toContain("/w_1200,h_630,c_fill,g_auto,q_auto,f_jpg/");
    expect(html).not.toContain("/og/item.jpg");
  });

  it("mirrors the API's 410 for a disposed item without leaking its name", async () => {
    // `DISPOSED_ITEM` is named "Old projector" in the fixtures; an anonymous
    // viewer must never be told that.
    const html = await (await previewHandler(request("?tagId=CNCS-DEAD0000"))).text();

    expect(html).toContain("This item is no longer registered");
    expect(html).not.toContain("Old projector");
  });

  it("answers an unknown tag with the not-found copy", async () => {
    const html = await (await previewHandler(request("?tagId=CNCS-NOPE"))).text();
    expect(html).toContain("Tag not found");
  });

  it("still produces a card when the backend cannot be reached", async () => {
    // A cold or sleeping backend must not turn a shared link into a bare URL.
    server.use(http.get(`${API}/items/CNCS-AB12CD34`, () => HttpResponse.error()));

    const response = await previewHandler(request("?tagId=CNCS-AB12CD34"));
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(`${SITE}/og/default.jpg`);
  });

  it("falls back to the site card when no backend origin is configured", async () => {
    vi.stubEnv("API_BASE_URL", "");
    vi.stubEnv("VITE_API_BASE_URL", "");

    const html = await (await previewHandler(request("?tagId=CNCS-AB12CD34"))).text();
    expect(html).toContain(`${SITE}/og/default.jpg`);
  });
});

describe("frontend/vercel.json", () => {
  interface Rewrite {
    source: string;
    destination: string;
    has?: { type: string; key: string; value: string }[];
  }

  const config = vercelConfig as { rewrites: Rewrite[] };
  const crawlerRule = config.rewrites[0];
  const pattern = crawlerRule?.has?.[0]?.value ?? "";
  const looksLikeCrawler = (userAgent: string) => new RegExp(pattern).test(userAgent);

  it("routes item URLs to the preview function before the SPA fallback", () => {
    // Order is load-bearing: the catch-all below it serves `index.html` for
    // everything, so a rule placed after it would never match.
    expect(crawlerRule?.source).toBe("/item/:tagId");
    expect(crawlerRule?.has?.[0]?.key).toBe("user-agent");
    expect(crawlerRule?.destination).toBe("/api/preview?tagId=:tagId");
    expect(config.rewrites.at(-1)?.destination).toBe("/index.html");
  });

  // `bot` and `Bot` are both listed because the pattern is matched case-
  // sensitively, and the crawler spellings are genuinely inconsistent:
  // `Googlebot`, `Slackbot` and `Discordbot` use a lowercase `b`, while
  // `LinkedInBot` and `DuckDuckBot` capitalise it. No inline `(?i)` flag — its
  // support in `vercel.json`'s PCRE dialect is not documented, and a pattern
  // that silently fails to match is exactly the bug this list exists to catch.
  it.each([
    ["WhatsApp", "WhatsApp/2.23.20.0 A"],
    ["Telegram", "TelegramBot (like TwitterBot)"],
    ["Facebook", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"],
    ["iMessage", "facebookexternalhit/1.1"],
    ["Slack", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"],
    ["Discord", "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"],
    ["LinkedIn", "LinkedInBot/1.0 (compatible; Mozilla/5.0)"],
    ["DuckDuckBot", "DuckDuckBot/1.0; (+http://duckduckgo.com/duckduckbot.html)"],
    ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"],
    ["Bingbot", "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)"],
    ["Iframely", "Iframely/1.3.1 (+https://iframely.com/docs/about)"],
    ["X", "Twitterbot/1.0"],
    ["Pinterest", "Pinterest/0.2 (+https://www.pinterest.com/bot.html)"],
    ["Skype", "SkypeUriPreview Preview/0.5"],
    ["curl", "curl/8.5.0"],
  ])("matches the %s crawler", (_name, userAgent) => {
    expect(looksLikeCrawler(userAgent)).toBe(true);
  });

  it.each([
    [
      "desktop Chrome",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    ],
    [
      "iOS Safari",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
    ],
    [
      "Android Chrome",
      "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
    ],
    [
      "Firefox",
      "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    ],
  ])("leaves a real %s visitor on the SPA", (_name, userAgent) => {
    // The whole point of matching on User-Agent is that a normal browser never
    // pays for a function invocation, so a false positive here is a regression.
    expect(looksLikeCrawler(userAgent)).toBe(false);
  });
});

describe("frontend/index.html", () => {
  const html = indexHtmlSource;

  it("points every preview image at an absolute URL", () => {
    // WhatsApp, Telegram, Facebook and X all discard a relative `og:image`
    // rather than resolving it against the page, so a bare `/og/default.jpg`
    // here would silently produce no card at all.
    const images = [...html.matchAll(/content="(__SITE_ORIGIN__[^"]*)"/g)].map(
      (match) => match[1] ?? "",
    );

    expect(images).toContain("__SITE_ORIGIN__/og/default.jpg");
    expect(images.length).toBeGreaterThanOrEqual(3); // og:image, secure_url, twitter:image
    expect(images.every((value) => value.startsWith("__SITE_ORIGIN__/"))).toBe(true);
  });

  it("declares the card's real dimensions", () => {
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
  });

  it("ships both the Open Graph and the Twitter tag sets", () => {
    // Telegram and Slack fall back to `twitter:*` when a page omits `og:*`.
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  });
});
