#!/usr/bin/env python3
"""
Empty, loading and error states — checked in a browser, per screen and role.

P5-6 is not "the components exist"; it is that every list actually uses them.
So each screen is loaded three times while the network is interfered with:

  - slow:   the first data request is held for 2.5s; a skeleton (or a
            `role="status"` loading region) must be on screen, not a blank;
  - failed: every data request is refused; a written error (never a bare
            page, never the word "null") must appear, with a retry control;
  - empty:  the real responses are fetched and every array emptied; a written
            empty state must appear, and it must not be the error state.

`/auth/*` is never interfered with, so the shell stays signed in and it is the
screen — not the session — that is being observed.

Usage:  scripts/states-check.py [base-url] [--roles STAFF,HEAD,...]
"""

import json
import re
import sys
import time
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith("--")]
BASE = (args[0] if args and args[0].startswith("http") else "https://cncs-pms-web.vercel.app").rstrip("/")
API = f"{BASE}/api/v1"

WANTED = None
for index, arg in enumerate(sys.argv):
    if arg == "--roles" and index + 1 < len(sys.argv):
        WANTED = {r.strip().upper() for r in sys.argv[index + 1].split(",") if r.strip()}

ACCOUNTS = {
    "STAFF": ("staff.cs1@cncs.aau.edu.et", "StaffCS123!"),
    "HEAD": ("head.cs@cncs.aau.edu.et", "HeadCS123!"),
    "OFFICER": ("officer@cncs.aau.edu.et", "Officer123!"),
    "AUDITOR": ("auditor@cncs.aau.edu.et", "Auditor123!"),
    "ADMIN": ("admin@cncs.aau.edu.et", "Admin123!"),
}

# (path, label, check-empty)
SCREENS = {
    "STAFF": [
        ("/dashboard", "Dashboard", False),
        ("/items", "Browse Items", True),
        ("/requests", "My Requests", True),
        ("/notifications", "Notifications", True),
    ],
    "HEAD": [
        ("/dashboard", "Dashboard", False),
        ("/items?scope=all", "Browse Items (all)", True),
        ("/requests", "Department Requests", True),
        ("/admin/users", "Accounts", True),
    ],
    "OFFICER": [
        ("/dashboard", "Dashboard", False),
        ("/items", "Browse Items", True),
        ("/requests", "Requests", True),
        ("/audits", "Audit history", True),
        ("/reports", "Reports", True),
        ("/admin/categories", "Categories", True),
        ("/admin/buildings", "Buildings", True),
    ],
    "AUDITOR": [
        ("/dashboard", "Dashboard", False),
        ("/audits", "Audit history", True),
        ("/reports", "Reports", True),
    ],
    "ADMIN": [
        ("/dashboard", "Dashboard", False),
        ("/admin/users", "Accounts", True),
        ("/admin/departments", "Departments", True),
        ("/admin/events", "System Events", True),
        ("/admin/system", "System Status", False),
    ],
}

ERROR_WORDS = re.compile(r"couldn't load|could not load|failed|unavailable|offline|went wrong", re.I)
RETRY_WORDS = re.compile(r"try again|retry|reload|refresh", re.I)
EMPTY_WORDS = re.compile(
    r"no .{0,40}\b(yet|match|matches|found|registered|pending|scheduled|events|items|requests|results|accounts)\b"
    r"|\bnothing\b|\bhaven't\b|\bempty\b|\bnone\b|\bno results\b",
    re.I,
)

results = []


def step(description, ok, detail=""):
    results.append((description, bool(ok), detail))
    mark = "\033[32m✓\033[0m" if ok else "\033[31m✗\033[0m"
    print(f"  {mark} {description}" + (f" — {detail}" if detail else ""))


def body_text(page):
    try:
        return page.inner_text("body")
    except Exception:
        return ""


def wait_for_login_window():
    """Block until the deployment will accept a sign-in (10 per IP per 15 min)."""
    body = json.dumps({"email": "admin@cncs.aau.edu.et", "password": "Admin123!"}).encode()
    for _ in range(16):
        request = urllib.request.Request(
            f"{API}/auth/login", data=body, headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(request, timeout=30):
                return
        except urllib.error.HTTPError as exc:
            if exc.code != 429:
                return
            print("  \033[33m—\033[0m the login limiter is holding; waiting 60s")
            time.sleep(60)
        except Exception:
            return


def sign_in(page, email, password):
    page.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(800)
    page.fill('input[type="email"]', email)
    page.fill('input[type="password"]', password)
    page.click('button[type="submit"]')
    try:
        page.wait_for_function(
            "() => !window.location.pathname.includes('/login')", timeout=40_000
        )
    except Exception:
        pass
    if "/login" in page.url:
        print("  \033[33m—\033[0m the limiter held that sign-in; waiting 65s")
        time.sleep(65)
        page.fill('input[type="email"]', email)
        page.fill('input[type="password"]', password)
        page.click('button[type="submit"]')
        try:
            page.wait_for_function(
                "() => !window.location.pathname.includes('/login')", timeout=45_000
            )
        except Exception:
            pass
    page.wait_for_timeout(1200)
    return "/login" not in page.url


def is_data(url):
    """The app's own API, minus the session endpoints."""
    return "/api/v1/" in url and "/auth/" not in url


def keep_paging(value):
    """Empty a response without breaking pagination into `undefined`.

    Arrays become empty; the scalar fields that describe the page stay, except
    totals, which are zeroed so "page 1 of 0" does not look like a bug.
    """
    if isinstance(value, list):
        return []
    if isinstance(value, dict):
        emptied = {}
        for key, item in value.items():
            if isinstance(item, (list, dict)):
                emptied[key] = keep_paging(item)
            elif isinstance(item, int) and key in {
                "total",
                "totalPages",
                "totalCount",
                "count",
                "unread",
            }:
                emptied[key] = 0
            elif isinstance(item, int) and key in {"page", "limit"}:
                emptied[key] = item
            else:
                emptied[key] = item
        return emptied
    return value


class Net:
    """One route handler, three modes, switched between navigations."""

    def __init__(self):
        self.mode = "normal"
        self.delayed = False

    def handle(self, route):
        url = route.request.url
        if self.mode == "normal" or not is_data(url):
            route.continue_()
            return
        if self.mode == "fail":
            route.abort()
            return
        if self.mode == "slow":
            if not self.delayed:
                self.delayed = True
                try:
                    response = route.fetch()
                    time.sleep(2.5)
                    route.fulfill(response=response)
                except Exception:
                    try:
                        route.continue_()
                    except Exception:
                        pass
            else:
                route.continue_()
            return
        if self.mode == "empty":
            try:
                response = route.fetch()
                payload = keep_paging(response.json())
                route.fulfill(
                    response=response,
                    body=json.dumps(payload),
                    headers={**response.headers, "content-type": "application/json"},
                )
            except Exception:
                try:
                    route.continue_()
                except Exception:
                    pass


def goto(page, path):
    page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=60_000)
    page.wait_for_timeout(2000)


def check_screen(page, net, path, label, check_empty):
    # 1. loading ------------------------------------------------------------
    net.mode = "slow"
    net.delayed = False
    goto(page, path)
    skeleton = page.locator(".animate-pulse, [role='status']")
    seen = False
    for _ in range(12):
        if skeleton.count() and skeleton.first.is_visible():
            seen = True
            break
        page.wait_for_timeout(200)
    step(f"{label}: a skeleton/loading region while the data is slow", seen)

    # 2. error --------------------------------------------------------------
    net.mode = "fail"
    goto(page, path)
    try:
        page.wait_for_selector("[role='alert'] h3", timeout=8_000)
    except Exception:
        pass
    said = body_text(page)
    heading = ""
    try:
        heading = page.locator("[role='alert'] h3").first.inner_text(timeout=1_000)
    except Exception:
        heading = next((ln.strip() for ln in said.splitlines() if ERROR_WORDS.search(ln)), "")
    written = bool(heading.strip())
    step(f"{label}: the failure is written down, not blank", written, heading[:100])

    retry = page.locator("button, a").filter(has_text=RETRY_WORDS)
    step(f"{label}: a retry control is offered", retry.count() > 0 and retry.first.is_visible())

    if check_empty:
        # 3. empty ----------------------------------------------------------
        net.mode = "empty"
        goto(page, path)
        match = ""
        for _ in range(16):
            said = body_text(page)
            match = next((ln.strip() for ln in said.splitlines() if EMPTY_WORDS.search(ln)), "")
            if match:
                break
            page.wait_for_timeout(250)
        # An error that happens to say "no items" is not an empty state.
        error_heading = ""
        try:
            error_heading = page.locator("[role='alert'] h3").first.inner_text(timeout=500)
        except Exception:
            pass
        step(
            f"{label}: an empty result is explained in words",
            bool(match) and not ERROR_WORDS.search(error_heading),
            match[:100],
        )

    net.mode = "normal"


def main():
    if WANTED:
        roles = [r for r in SCREENS if r in WANTED]
    else:
        roles = list(SCREENS)
    print(f"\033[1mEmpty, loading and error states — {BASE}\033[0m")
    if BASE.startswith("https://"):
        wait_for_login_window()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for role in roles:
            email, password = ACCOUNTS[role]
            print(f"\n\033[1m{role}\033[0m")
            context = browser.new_context(viewport={"width": 1440, "height": 900})
            net = Net()
            context.route("**/api/v1/**", net.handle)
            page = context.new_page()
            try:
                if not sign_in(page, email, password):
                    step(f"{role}: signed in", False, page.url)
                    continue
                step(f"{role}: signed in", True)
                for path, label, check_empty in SCREENS[role]:
                    try:
                        check_screen(page, net, path, label, check_empty)
                    except Exception as exc:
                        step(f"{label}: the screen could be checked", False, f"{type(exc).__name__}: {exc}")
            finally:
                net.mode = "normal"
                context.close()
        browser.close()

    failures = [r for r in results if not r[1]]
    print(f"\n\033[1m{len(results) - len(failures)}/{len(results)} checks passed\033[0m")
    if failures:
        print("\nFailures:")
        for description, _, detail in failures:
            print(f"  - {description} ({detail})")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
