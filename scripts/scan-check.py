#!/usr/bin/env python3
"""
The scan path — what happens when the camera is refused.

P6-3 is not "the camera works": a phone can refuse the permission, warn that
the page is not secure, or simply have no camera. The requirement is that a
person who is refused is *told* so and can still finish the job by typing the
tag on the sticker. So this check deliberately denies the camera and then
uses the fallback:

  - `/scan` opens and asks for the tag;
  - the camera view says the permission was denied (or that no camera is
    available) — it does not sit on "Starting camera…" forever, and it does
    not silently show a blank rectangle;
  - the manual tag field is on the same screen, always visible, not hidden
    behind a "having trouble?" disclosure;
  - typing a real tag lands on that item's page;
  - typing a tag that does not exist fails in words rather than in a blank
    screen;
  - and the same three things hold in a phone-sized viewport, because that is
    where the camera lives.

Usage:  scripts/scan-check.py [base-url]
"""

import re
import sys

from playwright.sync_api import sync_playwright

_arg1 = sys.argv[1] if len(sys.argv) > 1 else ""
BASE = (_arg1 if _arg1.startswith("http") else "https://cncs-pms-web.vercel.app").rstrip("/")

# A seeded item every walkthrough run leaves alone.
KNOWN_TAG = "CNCS-STAFF-0001"
MISSING_TAG = "CNCS-NOT-A-REAL-TAG"

DENIED_WORDS = re.compile(r"permission|denied|no camera|camera.*(not|un)available", re.I)

results = []


def step(description, ok, detail=""):
    results.append((description, bool(ok), detail))
    mark = "\033[32m✓\033[0m" if ok else "\033[31m✗\033[0m"
    print(f"  {mark} {description}" + (f" — {detail}" if detail else ""))


def deny_camera(context, page):
    """Refuse `videoCapture` for this origin, the way a person taps "Block"."""
    session = context.new_cdp_session(page)
    # The CDP descriptor is spelled "camera" (the Permissions API name), not
    # "videoCapture"; older protocol revisions reject the latter. Headless
    # Chromium refuses the prompt on its own too, so this is best-effort.
    for name in ("camera", "videoCapture"):
        try:
            session.send(
                "Browser.setPermission",
                {
                    "permission": {"name": name},
                    "setting": "denied",
                    "origin": BASE,
                },
            )
            return
        except Exception:
            continue


def body_text(page):
    try:
        return page.inner_text("body")
    except Exception:
        return ""


def open_scan(page):
    page.goto(f"{BASE}/scan", wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(2000)


def check_denial_and_fallback(page, label):
    step(f"{label}: the scan screen opens", "Scan a tag" in body_text(page), page.url)

    told = False
    try:
        page.wait_for_function(
            "(source) => new RegExp(source, 'i').test(document.body.innerText)",
            arg=DENIED_WORDS.pattern,
            timeout=25_000,
        )
        told = True
    except Exception:
        told = bool(DENIED_WORDS.search(body_text(page)))
    said = body_text(page)
    line = next(
        (ln.strip() for ln in said.splitlines() if DENIED_WORDS.search(ln)), ""
    )
    step(f"{label}: the refusal is explained on the screen", told, line[:120])

    field = page.get_by_label("Tag ID", exact=True)
    visible = field.count() > 0 and field.first.is_visible()
    step(f"{label}: the manual tag field is offered beside the camera", visible, "")


def type_tag(page, tag):
    field = page.get_by_label("Tag ID", exact=True)
    if not field.count():
        return False
    field.first.fill(tag)
    page.get_by_role("button", name="Go", exact=True).first.click()
    page.wait_for_timeout(3000)
    return True


def sign_in(page, email, password):
    page.fill('input[type="email"]', email)
    page.fill('input[type="password"]', password)
    page.click('button[type="submit"]')
    try:
        page.wait_for_function(
            "() => !window.location.pathname.includes('/login')", timeout=45_000
        )
    except Exception:
        pass
    page.wait_for_timeout(1500)


def main():
    print("\033[1mThe scan path — the camera refused, the tag typed\033[0m")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()

        # A phone, because that is the device with the camera.
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent=(
                "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"
            ),
            is_mobile=True,
            has_touch=True,
        )
        page = context.new_page()
        deny_camera(context, page)
        open_scan(page)
        check_denial_and_fallback(page, "on a phone")

        # A visitor with no account: the item route needs a sign-in, so the
        # fallback must carry the tag through the login page rather than losing
        # it. That is the contract the QR code relies on.
        if type_tag(page, KNOWN_TAG):
            served = "/login" in page.url and KNOWN_TAG in page.url
            step("on a phone: a typed tag survives the sign-in gate", served, page.url)
            if served:
                sign_in(page, "officer@cncs.aau.edu.et", "Officer123!")
                landed = f"/item/{KNOWN_TAG}" in page.url
                shown = KNOWN_TAG.lower() in body_text(page).lower()
                step("on a phone: signing in lands on the item that was typed",
                     landed and shown, page.url)
        else:
            step("on a phone: a typed tag survives the sign-in gate", False, "no field")
            step("on a phone: signing in lands on the item that was typed", False, "no field")
        context.close()

        # And the desktop, where the same fallback must hold.
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        deny_camera(context, page)
        page.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=60_000)
        page.wait_for_timeout(1200)
        sign_in(page, "officer@cncs.aau.edu.et", "Officer123!")
        step("on a desktop: a staff member is signed in", "/login" not in page.url, page.url)
        open_scan(page)
        check_denial_and_fallback(page, "on a desktop")

        if type_tag(page, KNOWN_TAG):
            landed = f"/item/{KNOWN_TAG}" in page.url
            shown = KNOWN_TAG.lower() in body_text(page).lower()
            step("on a desktop: a typed tag opens that item", landed and shown, page.url)
        else:
            step("on a desktop: a typed tag opens that item", False, "no field")

        open_scan(page)
        if type_tag(page, MISSING_TAG):
            said = body_text(page).lower()
            explained = (
                "not found" in said
                or "doesn't exist" in said
                or "does not exist" in said
                or "no item" in said
                or "couldn't find" in said
            )
            step("on a desktop: an unknown tag says so", explained, page.url)
        else:
            step("on a desktop: an unknown tag says so", False, "no field")
        context.close()

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
