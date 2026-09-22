# Social preview cards

The source of the two images in `public/og/`, which are what WhatsApp, Telegram,
Slack, Discord, X and Facebook render when a link to this app is pasted
somewhere. The `.jpg` files are checked in; these `.html` files are how they were
made, kept so the cards can be edited instead of being opaque binaries.

| Source                | Output                  | Used for                                                |
| --------------------- | ----------------------- | ------------------------------------------------------- |
| `card-default.html`   | `public/og/default.jpg` | The home page, and any item whose record has no photo.  |
| `card-item.html`      | `public/og/item.jpg`    | An item that was found but has no `photoUrl`.           |
| `card.css`            | —                       | Shared styling, palette copied from `src/styles/tokens.css`. |
| `gen.png`             | —                       | The generated art layer both cards sit on.              |

An item **with** a photo does not use either file — `frontend/api/preview.ts`
points `og:image` at the photo itself, cropped to the same 1200×630 by
Cloudinary. See `docs/social-previews.md`.

## The art layer

`gen.png` is a generated art piece: dark navy across the left, a blue glow in the
upper right, low-frequency so it compresses. It is kept **here** rather than in
`public/` because it is a render source — only the finished `.jpg` is meant to be
downloaded by a crawler.

It carries **no text and no crest**, deliberately. Image models render small
lettering and university crests badly, and a garbled "CNCS" or an invented AAU
seal is worse than a plain card. Everything a reader needs — the real crest, the
real type — is drawn by Chromium on top of it.

Because the card is composited rather than generated, the art is only one layer.
Each card adds a flat navy fallback plus two scrims (a strong one from the left,
a light one from the top) so white type holds its contrast regardless of what the
art does behind it — see `.card--art` in `card.css`.

## Layout

Positions on the 1200×630 export, all measured from a 64px margin:

| Element                                        | Position                                              |
| ---------------------------------------------- | ----------------------------------------------------- |
| AAU crest (`public/aau/aau-logo-white.svg`)    | top-left, 150×150                                      |
| Eyebrow `ADDIS ABABA UNIVERSITY`               | left column, above the headline, 30px, light blue       |
| Headline (`Campus property, verified by QR`)   | left column, centred vertically, 78px, white, 2 lines   |
| Footer (`CNCS Property Management System`)     | bottom-left, 34px, 76% white                            |
| QR badge                                       | bottom-right, 90×90, hairline outline                   |

The whole right-hand third of the art is left clear on purpose: that is the art's
own composition, and the copy never crosses into it. The headline size is set so
the line break lands after the comma at this width; if the copy changes, re-check
the line count rather than trusting it.

## Re-rendering

Exactly 1200×630 — the 1.91:1 ratio every one of those platforms crops a large
preview to. Chrome, Chromium or Edge:

```bash
cd frontend/scripts/og
CHROME=/path/to/chrome   # or google-chrome / chromium / msedge

for card in default item; do
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --allow-file-access-from-files --force-device-scale-factor=1 \
    --window-size=1200,630 --screenshot="/tmp/og-$card.png" "card-$card.html"
done
```

In a container or an environment without a user namespace, Chrome refuses to
start its sandbox and exits with *"No usable sandbox!"*; add `--no-sandbox`. The
Playwright-managed build works too, at
`~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell`,
and it is already headless, so it takes `--no-sandbox` and no `--headless` flag.

Then convert to JPEG at 4:4:4 — `cargo`/`cjpeg`/ImageMagick will all do, and so
will Python:

```bash
python3 - <<'PY'
from PIL import Image
for name in ("default", "item"):
    Image.open(f"/tmp/og-{name}.png").convert("RGB").save(
        f"../../public/og/{name}.jpg", "JPEG",
        quality=88, subsampling=0, optimize=True, progressive=True,
    )
PY
```

### Why JPEG, why 4:4:4, and why quality 88

All three are about size, and size is not cosmetic here. WhatsApp silently
discards an `og:image` that is too heavy — it falls back to a bare text link,
which is the exact failure this feature exists to prevent. The checklist:

- **JPEG at `subsampling=0`.** The cards are gradients and type, and 4:4:4 rather
  than the default 4:2:0 keeps chroma undownsampled, which is what stops white
  type on navy from getting muddy edges.
- **Quality 88, not the default 92.** The previous gradient-only cards came in at
  113 KB and 109 KB at 92. The art layer roughly doubles the entropy, so 92 put
  them at ~196 KB. Dropping to 88 lands them at **168 KB and 160 KB** — still
  comfortably clear of the ~300 KB danger zone, and the difference is invisible
  at the size a preview is actually rendered.
- **Low-frequency art only.** An earlier revision of these cards used a fine
  diagonal hairline weave and the PNG came out at 490 KB. High-frequency texture
  is what both PNG and JPEG compress worst, which is why the art is smooth and
  the QR mark is thin strokes rather than a dense pattern.

Re-check the output size after any edit. Anything approaching 300 KB should be
reworked, not shipped.

### Why the crest is cropped

`public/aau/aau-logo-white.svg` is the university's *stacked* lockup: the seal
with its own Amharic and Latin wordmark baked in underneath. Placed beside the
live wordmark text it would say "Addis Ababa University" twice, once illegibly
small. `.crest` in `card.css` therefore oversizes it inside a 150×150 window and
offsets it so only the circular r=104.49 seal shows; the arithmetic is spelled
out in the comment there, derived from the SVG's own `viewBox`.
