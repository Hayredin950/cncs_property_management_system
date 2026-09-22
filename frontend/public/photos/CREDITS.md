# Demo item photos — sources and licences

These four images exist so the seeded demo items render with a real photograph
instead of `PhotoFrame`'s "No photo" placeholder. They are **demo fixtures, not
part of the product**: the app has no upload endpoint (frontend-plan.md §12 gap
G3), so `Item.photoUrl` is just a string an operator supplies.

Each was downloaded from Wikimedia Commons at 960px wide (`?width=960` on the
`Special:FilePath` / thumb URL) and is stored unmodified.

| File | Item (`tagId`) | Source | Author | Licence |
| --- | --- | --- | --- | --- |
| `laptop.jpg` | Dell Latitude Laptop (`CNCS-DEMO-0001`) | [Schenker VIA14 Laptop asv2021-01.jpg](https://commons.wikimedia.org/wiki/File:Schenker_VIA14_Laptop_asv2021-01.jpg) | A.Savin | FAL (Free Art License) |
| `desk.jpg` | Office Desk (`CNCS-DEMO-0002`) | [An office table and computers (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:An_office_table_and_computers_(Unsplash).jpg) | Patryk Sobczak | CC0 |
| `microscope.jpg` | Microscope (`CNCS-DEMO-0003`) | [Light Optical Microscope.jpg](https://commons.wikimedia.org/wiki/File:Light_Optical_Microscope.jpg) | Jeremyida002 | CC BY-SA 4.0 |
| `charger.jpg` | Dell 65W Charger (`CNCS-DEMO-0004`) | [Lenovo 65W 20V AC adapter (FRU 42T5283) for ThinkPad laptops.jpg](https://commons.wikimedia.org/wiki/File:Lenovo_65W_20V_AC_adapter_(FRU_42T5283)_for_ThinkPad_laptops.jpg) | Siarhei Besarab | CC BY-SA 4.0 |

## Why the URLs in the seed are relative

`backend/prisma/seed.ts` stores `photoUrl: "/photos/laptop.jpg"`, not an absolute
URL. The file is served by the *frontend* (`public/` is copied to the site root
at build time), so a site-relative path keeps working when the app moves to its
production origin, while `http://localhost:5173/photos/laptop.jpg` would 404 the
moment the host changed — the same trap `PUBLIC_BASE_URL` sets for printed QR
stickers. `ItemFormPage`'s validation accepts both a full URL and a path
beginning with `/` for that reason.

## Attribution

CC BY-SA 4.0 (the microscope and the charger) requires attribution when the
image is redistributed. This file is that attribution: it ships inside
`public/`, so it is served alongside the images at `/photos/CREDITS.md`. If you
replace a photo, update its row here — and if you remove this file while keeping
the CC BY-SA images, you are redistributing them without their licence terms.
