# Frontend — AAU visual rebrand

The brief: the app must be indistinguishable from the official Addis Ababa University web
properties — header and footer above all — so that it reads as though the same team built it.

This document records **where every value came from**, because "it looks right" is not
reviewable and a palette nobody can re-derive is a palette that rots. It supersedes the
invented brand in `frontend-design-system.md` §2/§3.5 wherever the two disagree; those sections
carry a pointer back here.

---

## 1. Sources

Nothing in this rebrand was eyeballed from a screenshot except one value, which is labelled as
such below. Everything else was read out of the live sites:

| What | Where it came from |
| --- | --- |
| Colour scale, `gray-line`, `customBlue-main` | `https://aau.edu.et/_next/static/css/a50e6886638c154e.css` |
| Typeface (`__GeistSans_fb8f2c`) | `https://aau.edu.et/_next/static/css/6e09fc4a51e39a40.css` |
| Header composition | `_next/static/chunks/app/(landing)/layout-061ef2fad5731223.js` |
| Footer + newsletter composition | the server-rendered `__next_f` payload from `GET https://aau.edu.et/` |
| Crest, white footer lockup, gate-lions art | `https://aau.edu.et/images/{aauLogo.png,logoWhite.svg,gateLions.svg}` |
| Header home / search marks | `https://aau.edu.et/images/{home,carbon-search}.svg` |
| Footer radio + 7 social marks | the Iconify glyphs their footer renders (`carbon:radio`, `prime:twitter`, `mingcute:youtube-fill`, `bi:facebook`, `mingcute:linkedin-fill`, `mingcute:telegram-fill`, `ic:baseline-tiktok`, `ri:instagram-fill`) |
| Student-portal sidebar + page banner | screenshots of `portal.aau.edu.et/NewStudents/Welcome` |
| Admission-portal footer wording | `admission.aau.edu.et/login` |

aau.edu.et is a two-app site: `www`/apex is a Next.js 15 Tailwind site, `portal` and
`admission` are separate Laravel+Inertia apps that ship their own shells. The three surfaces
below are therefore taken from **three different upstream properties**, each because that is
where the university itself uses that pattern.

---

## 2. Palette

`frontend/src/styles/tokens.css` is the single source of truth. AAU's Tailwind theme overrides
Tailwind's own `blue`, `gray` and `red` scales, so the values are **not** stock Tailwind:

| Token | Hex | Upstream name |
| --- | --- | --- |
| `brand-50` … `brand-900` | `#e6f1f8` … `#01324e` | their `blue-50` … `blue-900` |
| `accent-50` … `accent-700` | `#ffeceb` … `#aa363c` | their `red-50` … `red-700` |
| `danger-*` | same as `accent-*` | their `red-*` (they have one red) |
| `aau-gray-50` … `aau-gray-900` | `#f9fafb` … `#101828` | their `gray-*` |
| `aau-navy` | `#01324e` | their `blue-900` — the footer background |
| `aau-custom-blue` | `#005f9f` | their `customBlue-main` — dropdown group labels |
| `aau-gray-line` | `#e0e0e0` | their `gray-line` — header border and dividers |
| `aau-yellow` | `#ffcc00` | their `yellow`, used as the portal card heading |
| `aau-portal-active` | `#eaf4ea` | **eyeballed** from the portal screenshot — the only value here not copied from CSS |

### The repoint, and why it is the whole trick

`brand-*` was Tailwind `blue` (`#2563eb`) and is now AAU `blue-600` (`#026ca9`). `accent-*` was
Tailwind `teal` and is now AAU red. Nothing in the ~40 existing components changed: they already
reached for `bg-brand-600` and `text-brand-700`, so repointing the ramp repainted the app in the
official palette in one edit.

Because `accent` and `danger` now resolve to the same red, `accent` no longer signals "the scan
flow" by hue. It keeps two jobs: the header's pending-request badge, and the red "ADDIS ABABA
UNIVERSITY" line in the logo lockup — both places AAU itself uses red.

---

## 3. Typography

AAU ships **Geist Sans** as a variable local font. The app now loads
`@fontsource-variable/geist`, the same face, self-hosted (no third-party font origin, matching
the previous Inter setup's reasoning). Inter is **removed** rather than kept as a fallback —
the two faces have different metrics and a silent per-glyph mix is worse than a clean chain.

Geist has no Ethiopic subset, so the Amharic wordmark falls back — exactly as it does on
aau.edu.et, which also ships Geist. `"Noto Sans Ethiopic"` is inserted mid-chain so the
wordmark renders as Amharic rather than tofu where that font is installed; it only matches
Ethiopic codepoints, so it cannot change how Latin text looks.

The lockup's two lines need *positive* tracking and negative margins to sit correctly
(`.aau-wordmark-*` in `tokens.css`) — `tracking-[3px]` on the Amharic line is not something a
reader can infer from a utility name, so it is named.

---

## 4. Assets

Committed under `frontend/public/aau/`:

| File | Size | Origin |
| --- | --- | --- |
| `aau-logo.png` | 84 KB | the crest, verbatim from aau.edu.et |
| `aau-logo-white.svg` | 51 KB | the footer's white lockup, verbatim |
| `gate-lions.svg` | 279 KB | the newsletter illustration, verbatim |

The crest is the university's real artwork, not a redraw — a redrawn seal is the single most
recognisable sign of a clone. `public/favicon.svg` (the old invented CNCS mark) is **deleted**;
the favicon, `apple-touch-icon` and manifest icon all point at the crest now, so no trace of the
previous branding survives.

The icon set lives in `components/aau/aauIcons.tsx` as inline SVG rather than `lucide-react`,
because lucide deprecated its brand marks and the footer's seven social links must not depend on
a deprecated set. One deliberate change from upstream: their `home.svg`/`carbon-search.svg`
hardcode a fill, so the glyphs are `currentColor` here — that is what makes the header's own
`hover:bg-gray-100` and the footer's `hover:text-white` work without shipping two assets each.
Path data is untouched.

---

## 5. What was built

```
components/aau/
  aauIcons.tsx          verbatim AAU/Iconify glyphs, currentColor
  AauLogo.tsx           header lockup: crest + divider + Amharic/Latin wordmark + SINCE 1950
  AauHeader.tsx         sticky white bar, dropdown menus, sliding search, mobile drawer
  AauFooter.tsx         navy footer: white lockup, radio line, 4 columns, socials, copyright
  AauNewsletter.tsx     "Subscribe to our Newsletter." band
  PortalPageHeader.tsx  portal banner + PortalTile action card
app/aauNav.ts           header navigation model (public + role-filtered staff)
```

Three shells now:

- **`PublicLayout`** — AAU header → page → newsletter band → navy footer, the same three bands in
  the same order as the university's own pages. Header, newsletter and footer are full-bleed;
  only the page content sits in the `max-w-7xl` container, because on aau.edu.et those bands are
  full-bleed too.
- **`AppLayout`** — same header and footer, plus the student portal's "Navigation" sidebar
  (blue-gradient title strip, hairline-separated rows, pale-green active row) and the portal's
  page banner + blue action tiles on the dashboard.
- **The footer's four columns** are AAU's own links, not this app's.

### Why the footer still links to AAU's pages

The footer is the largest block of AAU's information architecture on every page. Replacing all
twenty links with this app's four screens would make the difference obvious at a glance and would
throw away real navigation. Every path below was verified to return **HTTP 200** from
`aau.edu.et` before being written down:

```
/contactus /gallery /emergencyservices /archives
/history /AAU-leadership /presidents /aau-at-a-glance
/events /documents /publications /services /A-to-Z_listing
/campus_life /staffs
```

Two app entries are appended under **Quick links** — *Property register* (`/items`) and
*Staff portal* (`/dashboard`) — because a footer whose every link leaves the application is a
dead end for the person using it. The sign-in entry is authentic rather than a compromise: the
`admission.aau.edu.et` footer carries exactly a "Student / Staff Sign In" under
"ADMISSIONS & SERVICES".

That link is labelled **"Staff portal", not "Staff sign in"**, and the distinction is load
bearing: `"Staff sign in"` is the login page's own `<h1>`, and a footer link repeating it makes
"am I on the sign-in page?" ambiguous for users and for the flow tests that ask that question.

---

## 6. Deviations from upstream, and why

Deliberate differences, each with the reason it is not a fidelity bug:

1. **The search panel is rendered only while open.** Upstream keeps it mounted at
   `w-0 opacity-0`, which leaves a width-less input in the accessibility tree and in the tab
   order on every page. Fixed by conditional rendering; the slide-in animation is not worth a
   phantom search field.
2. **Route changes close the menus by derivation, not by effect.** Upstream resets menu state
   from `useEffect(..., [pathname])`. This header tags its panel state with the route it was
   recorded on and treats a path mismatch as closed — same behaviour, no setState-in-effect
   cascade, and no `key={pathname}` remount that would drop keyboard focus out of the header on
   every navigation.
3. **`space-x-*` became `gap-x-*`.** See §7 — under Tailwind 4 they are not interchangeable.
4. **Faded-to-zero panels are not rendered at all** rather than left at `opacity-0`.
5. **The newsletter's Subscribe is client-side.** See §8.

Everything else — band order, bar height (67px), the 40/48/4px gaps in the newsletter, the
168px footer columns with 17px headings and `leading-4` links, the `border-gray-600` rule, the
192px footer lockup — is upstream's, class for class.

---

## 7. A Tailwind v3 → v4 trap this surfaced

Found by measuring the rendered DOM, not by reading the diff.

**`space-x-*` silently loses to `mx-*`.** aau.edu.et is on Tailwind v3, where
`.space-x-10 > :not([hidden]) ~ :not([hidden])` is specific enough to beat a sibling `mx-0`.
v4 wraps the same utility in `:where()`, which has **zero specificity**, so
`lg:mx-0` on the newsletter's illustration wrapper cancelled the 40px gap and the illustration
sat flush against the heading at x=419. Fixed by using flex `gap-x-*`, which has no such
interaction. This is why `AauFooter.tsx` carries a note: the difference is invisible in a diff
and invisible in review, and only shows up on screen.

---

## 8. The one mocked surface

The newsletter band has no backend. There is no `/newsletter` route in `backend/src/routes`,
and inventing one means a Prisma migration, an admin screen to read the list, and an
unsubscribe story — none of which are in scope for a UI-parity change.

So the honest version ships: `subscribeSchema` validates the address, it is persisted to
`localStorage` under `cncs.newsletter.subscribers`, and the user gets the same
subscribe → success cycle the real site runs. `saveNewsletterSubscriber` is the single
drop-in point for a real `POST`. **This is the only place in the rebrand where the UI promises
something the system does not yet do**, and it is called out here so it is not mistaken for
working email capture.

---

## 9. Verifying it

```bash
cd frontend
pnpm run lint    # 0 errors (8 pre-existing warnings elsewhere)
pnpm run build   # tsc -b + vite build
pnpm test        # 57 passing
```

To check the pixels, the project's own container gives a warm server:

```bash
docker compose up --build          # http://localhost:5173
```

Headers, footers and gap widths were confirmed by reading `getBoundingClientRect()` out of a
headless browser rather than from screenshots, because a downscaled screenshot cannot tell a
4px gap from a 40px one — which is precisely how the `space-x` bug above survived first review.

### A jsdom caveat when writing tests against this chrome

Under Vitest, jsdom does **not** apply `lg:` breakpoint rules, and the header's desktop nav is
`hidden lg:flex`. Anything inside it is still reachable by role queries, so a custom Tailwind
breakpoint-dependent assertion will not behave the way it does in a browser. Prefer scoping
queries to `main` (`within(screen.getByRole("main"))`) over relying on a landmark being the only
match on the page — the header and footer now legitimately carry overlapping vocabulary
("All items", "Services", "Documents"), and the footer is present on every route.

---

## 10. Follow-ups

- Newsletter capture → a real endpoint (§8).
- `RequireAuth` renders `null` while `/auth/me` is in flight, so a cold database shows a blank
  page with no chrome for as long as the query takes. Pre-existing, and the design doc's "a
  stale token must not render a shell" rule is the reason — but a centred spinner inside the
  AAU footer/header would be strictly better and is a two-line change.
- A real PNG icon set for the PWA manifest: the manifest points at the 427×427 crest, which is
  fine for "Add to Home Screen" but is not the multi-size set a store submission expects.
