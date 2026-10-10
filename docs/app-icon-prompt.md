# App icon & logo — generation prompt

The mobile app still ships Flutter's default launcher icon (the blue Flutter mark), and
`mobile/android/app/src/main/res/mipmap-*/ic_launcher.png` plus the four
`mobile/web/icons/Icon-*.png` files are all still the template's. Nothing has been
replaced yet.

This file is the **prompt to hand to an image generator**, the constraints that make the
result usable as an app icon, and what to do with the file once it exists.

---

## 1. What the icon has to be

| Requirement | Why |
|---|---|
| **1024 × 1024 PNG master**, square, no transparency in the master | The size every platform resizes down from |
| **Reads at 48 px** | The launcher draws it at ~48 px; detail that survives only at 1024 is decoration |
| **No words, no tag IDs, no letters** | Launcher labels already print the app name under the icon |
| **Flat shapes, at most two tones of shading** | Matches the app's own design language (see `mobile/lib/theme/tokens.dart`) |
| **The mark inside the middle ~66 % of the canvas** | Android adaptive icons crop the outside ~25 % on every edge |
| **Navy background, light mark** | The product's own band colour; also keeps the icon legible on both light and dark homescreens |

Brand colours to stay inside:

- `brand800` **#014166** — deep navy, the background
- `brand600` **#026CA9** — mid blue, the mark's body
- `accent600` **#D9454C** — the single accent, used once
- white **#FFFFFF** — the mark's highlights

---

## 2. The prompt (copy this whole block)

> App icon for **CNCS Property Management System**, the asset-register app of the College
> of Natural and Computational Sciences at Addis Ababa University. A single flat vector
> icon on a **deep navy #014166** square background: a **property asset tag** — a rounded
> rectangle with a punched hole at the top-left corner, like a luggage label — tilted
> very slightly, in **mid blue #026CA9 with white** edges. Printed on the tag is a
> **simplified QR code motif**: three rounded square corner markers and a few bold square
> modules, drawn large and clean so it still reads at 48 px. One **thin accent-red #D9454C
> stripe** runs along the tag's bottom edge. Bold geometric shapes, crisp edges, generous
> negative space, centred composition, no gradients, no outlines, no texture, no
> photographic elements, no shadows except one soft flat offset. **No text, no letters,
> no numbers, no logo wordmark.** Flat design, corporate, calm, official — the visual
> grammar of a university facilities department, not a startup.

### Variant B — if a more institutional mark is wanted

> Same brief, but the mark is a **minimal geometric gate** — two square pillars joined by
> a flat lintel, echoing the AAU lions-gate silhouette, reduced to straight lines and
> right angles — in white and mid blue #026CA9 on deep navy #014166, with one
> accent-red #D9454C bar beneath it. Flat, centred, no text, no ornament.

## 3. Negative list (add to the prompt if the generator supports it)

`text, letters, numbers, watermark, mockup, 3D render, glossy plastic, gradient mesh,
lens flare, drop shadows, busy detail, tiny QR speckle, photographic texture, thin
hairlines, off-centre composition, cropped shapes at the edge, more than three colours`

## 4. Variants to export as well

1. **Master** — 1024 × 1024, PNG, opaque.
2. **Adaptive foreground** — 1024 × 1024 PNG, **transparent**, the mark scaled to occupy
   only the middle ~66 % (Android overlays it on the background layer and masks it).
3. **Adaptive background** — a flat 1024 × 1024 #014166 PNG (or the same navy as a colour
   resource).
4. **Monochrome / themed** — *not generated, and the app ships no themed-icon layer.*
   Android tints that layer with one flat colour, and what it silhouettes is the
   mark's **alpha** — which for this mark is a solid shape (74% of its bounding box,
   with no enclosed transparent area), because its design lives in its colour rather
   than in cut-outs. The result on a phone with themed icons enabled was one flat dark
   blob where the mark had been: the colour gone, only the edges left to see. Without
   the layer, launchers keep the real icon.

   If a themed icon is wanted later it has to be **drawn** as a glyph first — a
   single-colour design of its own, not a silhouette derived from the colour art. That
   is a new generation, and it goes in this file as variant 1.
5. **Wordmark (optional)** — a horizontal lockup of the mark plus
   “CNCS Property Management”, dark-on-light, for the About screen and the store listing.
6. **Splash mark (optional)** — the mark alone on transparent, ≥ 512 px.

## 5. Once you have the files

Drop the master (and the variants you generated) anywhere in the repo — for example
`mobile/assets/brand/` — and say so. Then:

- the Android launcher icons (`mipmap-*`) and the web icons (`web/icons/`) get generated
  from the master at every density, and the adaptive-icon foreground/background pair gets
  wired into `android/app/src/main/res/`, and the splash keeps using
  `assets/aau/aau-logo.png` unless the new mark replaces it deliberately;
- the icon is verified by installing on a device and looking at the launcher and the
  task switcher, not just by checking the file exists.

A generator that cannot produce transparent PNGs is fine for step 1 — the adaptive
foreground can be cut out of a flat background afterwards.

`mobile/tool/generate_app_icons.py` reads the two masters and writes every Android
layer, the adaptive XML and the web icons; re-run it after replacing either master
(`python3 mobile/tool/generate_app_icons.py`).
