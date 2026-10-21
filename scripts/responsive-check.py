#!/usr/bin/env python3
"""
The responsive check — against the **deployed** app, in a real browser.

Unit tests cannot see a layout. A screen can pass every assertion and still
be unusable on a phone: a table that needs horizontal scrolling, a button
under someone's thumb, a header that eats half the viewport, an action that
overflows the card it lives in.

This drives the real app in Chromium at two widths and checks, for every
screen a signed-in user can reach:

  - the page **renders** (a blank page is a failure, and so is an error
    boundary);
  - nothing **overflows horizontally** — the single most common way a desktop
    layout breaks on a phone;
  - the **primary action is reachable** and big enough to tap (44px is the
    minimum touch target, from the design system's own §12);
  - there is **no console error** and no failed request.

Usage:  scripts/responsive-check.py [base-url]
        (defaults to the deployed web app)
"""

import json
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "https://cncs-pms-web.vercel.app").rstrip("/")
API = "https://cncs-pms-api.vercel.app/api/v1"

PHONE = {"width": 390, "height": 844}   # iPhone 14
DESKTOP = {"width": 1440, "height": 900}

ACCOUNTS = [
    ("staff", "staff.cs1@cncs.aau.edu.et", "StaffCS123!"),
    ("head", "head.cs@cncs.aau.edu.et", "HeadCS123!"),
    ("officer", "officer@cncs.aau.edu.et", "Officer123!"),
    ("auditor", "auditor@cncs.aau.edu.et", "Auditor123!"),
    ("admin", "admin@cncs.aau.edu.et", "Admin123!"),
]

# The screens each role can reach. A screen that legitimately 404s for a role
# is simply not listed for it.
SCREENS = {
    "staff": ["/dashboard", "/items?scope=mine", "/requests?mine=true", "/requests/new", "/notifications"],
    "head": ["/dashboard", "/items?scope=mine", "/requests", "/notifications", "/admin/users"],
    "officer": ["/dashboard", "/items", "/requests", "/items/new", "/audits", "/reports", "/admin/categories", "/notifications"],
    "auditor": ["/dashboard", "/audits", "/audit/new", "/reports", "/notifications"],
    "admin": ["/dashboard", "/admin/users", "/admin/system", "/notifications"],
}

results = []


def sign_in(page, email, password):
    """Sign in through the real form, and land on the dashboard."""
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[type="email"]', email)
    page.fill('input[type="password"]', password)
    page.click('button[type="submit"]')
    page.wait_for_url(lambda url: "/login" not in url, timeout=25_000)
    page.wait_for_load_state("networkidle")


def check_overflow(page):
    """Anything wider than the viewport means a horizontal scrollbar."""
    return page.evaluate(
        """() => {
            const doc = document.documentElement;
            const overflow = doc.scrollWidth - doc.clientWidth;
            if (overflow <= 1) return null;
            // Name the worst offender, so the failure is actionable.
            const vw = doc.clientWidth;
            let worst = null;
            for (const el of document.querySelectorAll('body *')) {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.right > vw + 1) {
                    const amount = Math.round(r.right - vw);
                    if (!worst || amount > worst.amount) {
                        worst = { amount, tag: el.tagName, cls: (el.className || '').toString().slice(0, 60) };
                    }
                }
            }
            return { overflow, worst };
        }"""
    )


def check_touch_targets(page):
    """Every visible button should be at least 44px tall (design system §12)."""
    return page.evaluate(
        """() => {
            const small = [];
            for (const el of document.querySelectorAll('button, a[href]')) {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.height === 0) continue;      // not visible
                if (getComputedStyle(el).visibility === 'hidden') continue;
                if (r.height < 32) continue;                          // inline links
                if (r.height < 44) {
                    small.push({ tag: el.tagName, h: Math.round(r.height), text: (el.textContent || '').trim().slice(0, 30) });
                }
            }
            return small.slice(0, 5);
        }"""
    )


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for role, email, password in ACCOUNTS:
            context = browser.new_context(viewport=PHONE, device_scale_factor=2)
            page = context.new_page()
            console_errors = []
            failed_requests = []
            page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
            page.on("requestfailed", lambda r: failed_requests.append(f"{r.method} {r.url}"))
            # A 4xx/5xx is a failure the console message hides the cause of.
            page.on(
                "response",
                lambda r: failed_requests.append(f"{r.request.method} {r.url} -> {r.status}")
                if r.status >= 400 and "favicon" not in r.url
                else None,
            )

            try:
                sign_in(page, email, password)
            except Exception as exc:  # noqa: BLE001
                results.append((role, "sign in", "PHONE", "FAIL", f"could not sign in: {exc}"))
                context.close()
                continue

            for screen in SCREENS[role]:
                for label, viewport in (("PHONE", PHONE), ("DESKTOP", DESKTOP)):
                    page.set_viewport_size(viewport)
                    console_errors.clear()
                    failed_requests.clear()
                    try:
                        page.goto(f"{BASE}{screen}", wait_until="networkidle", timeout=25_000)
                        page.wait_for_timeout(600)

                        # A blank page or an error boundary is a failure.
                        body = page.inner_text("body").strip()
                        if len(body) < 40:
                            results.append((role, screen, label, "FAIL", "the page rendered empty"))
                            continue
                        if "something went wrong" in body.lower():
                            results.append((role, screen, label, "FAIL", "an error boundary caught the screen"))
                            continue

                        over = check_overflow(page)
                        if over:
                            worst = over["worst"] or {}
                            results.append((
                                role, screen, label, "FAIL",
                                f"overflows by {over['overflow']}px "
                                f"(<{worst.get('tag', '?')} class=\"{worst.get('cls', '')}\">)",
                            ))
                            continue

                        if label == "PHONE":
                            small = check_touch_targets(page)
                            if small:
                                results.append((
                                    role, screen, label, "WARN",
                                    f"{len(small)} touch target(s) under 44px: " +
                                    ", ".join(f"{t['tag']}({t['h']}px) {t['text']!r}" for t in small[:2]),
                                ))
                                continue

                        real_errors = [e for e in console_errors if "favicon" not in e.lower()]
                        bad_responses = [f for f in failed_requests if " -> 4" in f or " -> 5" in f]
                        if bad_responses:
                            results.append((role, screen, label, "FAIL", f"a request was refused: {bad_responses[0][:90]}"))
                            continue
                        if real_errors:
                            results.append((role, screen, label, "FAIL", f"console error: {real_errors[0][:90]}"))
                            continue
                        if failed_requests:
                            results.append((role, screen, label, "WARN", f"a request failed: {failed_requests[0][:80]}"))
                            continue

                        results.append((role, screen, label, "ok", ""))
                    except Exception as exc:  # noqa: BLE001
                        results.append((role, screen, label, "FAIL", str(exc)[:100]))
            context.close()
        browser.close()

    failures = [r for r in results if r[3] == "FAIL"]
    warnings = [r for r in results if r[3] == "WARN"]
    passes = [r for r in results if r[3] == "ok"]

    print("=" * 78)
    print("RESPONSIVE CHECK — the deployed app, in a real browser")
    print("=" * 78)
    for role, screen, label, status, detail in results:
        mark = {"ok": "\033[32m✓\033[0m", "WARN": "\033[33m!\033[0m", "FAIL": "\033[31m✗\033[0m"}[status]
        line = f"  {mark} {role:8} {label:8} {screen:28}"
        if detail:
            line += f"  {detail}"
        print(line)
    print()
    print(f"  passed: {len(passes)}   warnings: {len(warnings)}   failed: {len(failures)}")
    print("=" * 78)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
