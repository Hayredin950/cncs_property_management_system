#!/usr/bin/env python3
"""
The print path — proved, not assumed.

A QR sticker is a physical object: once it is printed, the tag id on it is
permanent, and a sticker that prints blank or prints the wrong item is a
label on the wrong box in a store room. There is no way to check that by
looking at the screen, because the screen is not what comes out of the
printer.

So this opens a real item in a real browser, asks Chromium to produce the
**print** version of the page (the same thing the browser's "Print" does),
and checks the PDF that comes out:

  - the sticker is on the page, and it is the only thing on it (the print
    stylesheet hides everything else);
  - the QR image is really in the PDF, not a broken-image box;
  - the item's tag id is on the sticker.

Usage:  scripts/print-check.py [base-url]
"""

import os
import re
import sys
import tempfile
import zlib

from playwright.sync_api import sync_playwright

_arg1 = sys.argv[1] if len(sys.argv) > 1 else ""
BASE = (_arg1 if _arg1.startswith("http") else "https://cncs-pms-web.vercel.app").rstrip("/")
API = "https://cncs-pms-api.vercel.app/api/v1"

results = []


def step(description, ok, detail=""):
    results.append((description, bool(ok), detail))
    mark = "\033[32m✓\033[0m" if ok else "\033[31m✗\033[0m"
    print(f"  {mark} {description}" + (f" — {detail}" if detail else ""))


def pdf_image_count(path):
    """How many images the PDF carries.

    A PDF's image XObjects are the `/Subtype /Image` entries. A sticker with
    a broken image is a PDF with none — which is exactly the failure this
    check is for.
    """
    with open(path, "rb") as handle:
        data = handle.read()
    return len(re.findall(rb"/Subtype\s*/Image", data))


def pdf_page_count(path):
    with open(path, "rb") as handle:
        data = handle.read()
    counts = re.findall(rb"/Type\s*/Page[^s]", data)
    return len(counts)


def main():
    print("\033[1mThe print path — the sticker that comes out of the printer\033[0m")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        page.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(1200)
        page.fill('input[type="email"]', "officer@cncs.aau.edu.et")
        page.fill('input[type="password"]', "Officer123!")
        page.click('button[type="submit"]')
        page.wait_for_function(
            "() => !window.location.pathname.includes('/login')", timeout=45_000
        )
        page.wait_for_timeout(1500)
        step("the property officer signs in", "/dashboard" in page.url, page.url)

        # An item with a sticker.
        page.goto(f"{BASE}/items", wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(2000)
        hrefs = [a.get_attribute("href") for a in page.query_selector_all("a[href^='/item/']")]
        step("the register lists items", bool(hrefs), f"{len(hrefs)} items")

        if not hrefs:
            print("\n  no item to print — stopping")
            return 1

        tag_href = hrefs[0]
        tag_id = tag_href.rsplit("/", 1)[-1]
        page.goto(f"{BASE}{tag_href}", wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(2000)

        # The sticker lives behind the disclosure.
        toggle = page.query_selector("text=View staff detail & tag")
        if toggle:
            toggle.click()
            page.wait_for_timeout(2500)
        sticker = page.query_selector("[data-print-tag]")
        step("the printable sticker is on the page", sticker is not None, tag_id)

        if sticker is None:
            return 1

        image = sticker.query_selector("img")
        step("the sticker carries the QR image", image is not None, "")
        if image is not None:
            loaded = image.evaluate("img => img.complete && img.naturalWidth > 0")
            step("the QR image has actually loaded", loaded, "")

        with tempfile.TemporaryDirectory() as folder:
            pdf_path = os.path.join(folder, "sticker.pdf")
            page.pdf(path=pdf_path, format="A4", print_background=True)
            size = os.path.getsize(pdf_path)
            step("the printer produces a PDF", size > 0, f"{size} bytes")
            step("the PDF has one page", pdf_page_count(pdf_path) == 1, f"{pdf_page_count(pdf_path)}")
            images = pdf_image_count(pdf_path)
            step("the sticker is in the PDF as an image", images >= 1, f"{images} image(s)")

            # The text of the PDF carries the tag id, so the printed sticker
            # names the item it belongs to.
            with open(pdf_path, "rb") as handle:
                raw = handle.read()
            text = b" ".join(
                re.findall(rb"\(([^)]{1,120})\)", raw)
            ).decode("latin1", "ignore")
            text = re.sub(r"\\[0-9]{3}", "", text)
            step("the printed sticker names the item", tag_id in text, tag_id)

        browser.close()

    failed = [r for r in results if not r[1]]
    print("\n" + "═" * 60)
    print(f"  steps passed: {len(results) - len(failed)}   failed: {len(failed)}")
    for description, _, detail in failed:
        print(f"    {description}" + (f" — {detail}" if detail else ""))
    print("═" * 60)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
