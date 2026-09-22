# Social preview cards

The source of the two images in `public/og/`, which are what WhatsApp, Telegram,
Slack, Discord, X and Facebook render when a link to this app is pasted
somewhere. The `.jpg` files are checked in; these `.html` files are how they were
made, kept so the cards can be edited instead of being opaque binaries.

| Source                | Output                 | Used for                                                |
| --------------------- | ---------------------- | ------------------------------------------------------- |
| `card-default.html`   | `public/og/default.jpg` | The home page, and any item whose record has no photo.  |
| `card-item.html`      | `public/og/item.jpg`    | An item that was found but has no `photoUrl`.           |
| `card.css`            | —                      | Shared styling, palette copied from `src/styles/tokens.css`. |

An item **with** a photo does not use either file — `frontend/api/_preview.ts`
points `og:image` at the photo itself, cropped to the same 1200×630 by
Cloudinary. See `docs/social-previews.md`.

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

Then convert to JPEG at 4:4:4 — `cargo`/`cjpeg`/ImageMagick will all do, and so
will Python:

```bash
python3 - <<'PY'
from PIL import Image
for name in ("default", "item"):
    Image.open(f"/tmp/og-{name}.png").convert("RGB").save(
        f"../../public/og/{name}.jpg", "JPEG",
        quality=92, subsampling=0, optimize=True, progressive=True,
    )
PY
```

### Why JPEG and why 4:4:4

Both are about size, and size is not cosmetic here. The first revision of these
cards was a 490 KB PNG, and WhatsApp silently discards an `og:image` that heavy —
it falls back to a bare text link, which is the exact failure this feature
exists to prevent. The two changes that fixed it:

- **The fine diagonal hairline weave was removed** from `card.css`. It was the
  single largest contributor to the file size, because high-frequency texture is
  what PNG and JPEG both compress worst. It was replaced with one wide,
  low-contrast diagonal sheen that reads the same at thumbnail size.
- **JPEG at `subsampling=0`.** Smooth gradients are what PNG is bad at, and these
  cards are almost entirely gradients. 4:4:4 rather than the default 4:2:0 keeps
  chroma undownsampled, which is what stops white type on navy from getting
  muddy edges.

Result: 113 KB and 109 KB. If you edit a card, re-check the output size before
committing — anything approaching 300 KB should be reworked, not shipped.

### Why the crest is cropped

`public/aau/aau-logo-white.svg` is the university's *stacked* lockup: the seal
with its own Amharic and Latin wordmark baked in underneath. Placed beside the
live wordmark text it would say "Addis Ababa University" twice, once illegibly
small. `.seal` in `card.css` therefore oversizes it inside a 96×96 window and
offsets it so only the circular r=104.49 seal shows; the arithmetic is spelled
out in the comment there, derived from the SVG's own `viewBox`.
