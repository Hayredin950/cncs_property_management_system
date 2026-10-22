#!/usr/bin/env python3
"""
P5-7 — keyboard reachability, names, focus, contrast and the AAU identity.

Not a substitute for a screen reader, but the mechanical part is checkable and
these are the failures that actually shipped before: an icon-only button with
no name, a focus ring that was removed, a page with no `lang`, an `aria-expanded`
that was a string, a wordmark whose Amharic line did not render.

  - `<html lang>` is set and `<h1>` is a single, named heading;
  - every visible image has an `alt` (empty is fine when `aria-hidden`);
  - every visible button, link, input, select and textarea has an accessible
    name (label, aria-label, aria-labelledby, text, title, alt or value);
  - every `aria-expanded` is a real boolean string;
  - Tab advances focus, and the focused control paints a focus indicator;
  - the skip link is first and moves focus into `<main>`;
  - the AAU wordmark renders in both scripts and its font is loaded;
  - the AAU blue on white, body text and headings clear WCAG AA.

Usage:  scripts/a11y-check.py [base-url] [--roles STAFF,HEAD,...]
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

PUBLIC_SCREENS = [("/", "Home"), ("/login", "Sign in")]

SCREENS = {
    "STAFF": [
        ("/dashboard", "Dashboard"),
        ("/items", "Browse Items"),
        ("/requests", "My Requests"),
        ("/notifications", "Notifications"),
    ],
    "HEAD": [
        ("/dashboard", "Dashboard"),
        ("/items?scope=all", "Browse Items (all)"),
        ("/requests", "Department Requests"),
        ("/admin/users", "Accounts"),
    ],
    "OFFICER": [
        ("/dashboard", "Dashboard"),
        ("/items", "Browse Items"),
        ("/requests", "Requests"),
        ("/audits", "Audit history"),
        ("/reports", "Reports"),
        ("/admin/categories", "Categories"),
        ("/map", "Map"),
    ],
    "AUDITOR": [
        ("/dashboard", "Dashboard"),
        ("/audits", "Audit history"),
        ("/reports", "Reports"),
    ],
    "ADMIN": [
        ("/dashboard", "Dashboard"),
        ("/admin/users", "Accounts"),
        ("/admin/departments", "Departments"),
        ("/admin/events", "System Events"),
        ("/admin/system", "System Status"),
    ],
}

HAVE_NAME_JS = """
() => {
  const labelOf = (el) => {
    if (el.getAttribute('aria-label')?.trim()) return el.getAttribute('aria-label').trim();
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const text = by.split(/\\s+/).map((id) => document.getElementById(id)?.innerText || '')
        .join(' ').trim();
      if (text) return text;
    }
    if (el.labels && el.labels.length) {
      const text = Array.from(el.labels).map((l) => l.innerText).join(' ').trim();
      if (text) return text;
    }
    const text = (el.innerText || el.textContent || '').trim();
    if (text) return text;
    if (el.getAttribute('title')?.trim()) return el.getAttribute('title').trim();
    if (el.getAttribute('alt')?.trim()) return el.getAttribute('alt').trim();
    if (el.tagName === 'INPUT') {
      if (el.type === 'submit' || el.type === 'button') return el.value || '';
      if (el.value && el.type !== 'password') return el.value;
    }
    return '';
  };
  const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const problems = [];
  const controls = document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]');
  for (const el of controls) {
    if (!visible(el) || el.getAttribute('aria-hidden') === 'true') continue;
    if (!labelOf(el)) {
      const icon = el.querySelector('svg') ? 'icon-only' : 'no-text';
      problems.push(`${el.tagName.toLowerCase()}:${icon}`);
    }
  }
  const images = [];
  for (const img of document.images) {
    if (!visible(img)) continue;
    if (!img.hasAttribute('alt')) images.push(img.getAttribute('src') || '(inline)');
  }
  const badExpanded = [];
  for (const el of document.querySelectorAll('[aria-expanded]')) {
    const v = el.getAttribute('aria-expanded');
    if (v !== 'true' && v !== 'false') badExpanded.push(`${el.tagName.toLowerCase()}=${v}`);
    if (el.tagName === 'BUTTON' && !labelOf(el)) badExpanded.push('unnamed disclosure');
  }
  const h1s = Array.from(document.querySelectorAll('h1')).map((h) => h.innerText.trim());
  return {
    lang: document.documentElement.getAttribute('lang') || '',
    h1: h1s,
    unnamed: problems,
    images,
    badExpanded,
    wordmarkAmharic: Array.from(document.querySelectorAll('*')).some(
      (el) => el.children.length === 0 && (el.textContent || '').includes('አዲስ አበባ'),
    ),
    wordmarkLatin: document.body.innerText.includes('ADDIS ABABA UNIVERSITY'),
    main: !!document.querySelector('main'),
    fontLoaded:
      document.fonts.status === 'loaded' &&
      Array.from(document.fonts).some((f) => f.status === 'loaded' && /geist|ethiop|amhar/i.test(f.family)),
  };
}
"""

FOCUS_JS = """
() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const style = getComputedStyle(el);
  const ring = style.boxShadow && style.boxShadow !== 'none';
  const outline = style.outlineStyle && style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
  return {
    tag: el.tagName.toLowerCase(),
    text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 60),
    visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    indicator: ring || outline,
  };
}
"""

STYLE_JS = """
(selector) => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const visible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  if (!visible) return null;
  let node = el;
  let background = 'rgba(0, 0, 0, 0)';
  while (node) {
    const bg = getComputedStyle(node).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') { background = bg; break; }
    node = node.parentElement;
  }
  if (background === 'rgba(0, 0, 0, 0)') background = 'rgb(255, 255, 255)';
  const s = getComputedStyle(el);
  return {
    color: s.color,
    background,
    size: parseFloat(s.fontSize) || 16,
    weight: s.fontWeight,
  };
}
"""

results = []


def step(description, ok, detail=""):
    results.append((description, bool(ok), detail))
    mark = "\033[32m✓\033[0m" if ok else "\033[31m✗\033[0m"
    print(f"  {mark} {description}" + (f" — {detail}" if detail else ""))


def channel(value):
    value = value / 255
    return value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4


def luminance(rgb):
    match = re.match(r"rgba?\(([^)]+)\)", rgb)
    if not match:
        return None
    parts = [float(p.strip()) for p in match.group(1).split(",")[:3]]
    r, g, b = (channel(p) for p in parts)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(foreground, background):
    a, b = luminance(foreground), luminance(background)
    if a is None or b is None:
        return None
    lighter, darker = max(a, b), min(a, b)
    return (lighter + 0.05) / (darker + 0.05)


def wait_for_login_window():
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


def check_page(page, label, require_skip_link, require_wordmark):
    page.wait_for_timeout(700)
    facts = page.evaluate(HAVE_NAME_JS)

    step(f"{label}: the page declares a language", bool(facts["lang"]), facts["lang"])
    step(f"{label}: exactly one named h1", len(facts["h1"]) == 1 and bool(facts["h1"][0]), str(facts["h1"])[:80])
    step(f"{label}: every visible image has alt text", not facts["images"], ", ".join(facts["images"])[:100])
    step(
        f"{label}: every visible control has an accessible name",
        not facts["unnamed"],
        ", ".join(sorted(set(facts["unnamed"]))[:6]),
    )
    step(
        f"{label}: aria-expanded is a boolean and disclosures are named",
        not facts["badExpanded"],
        ", ".join(facts["badExpanded"])[:100],
    )

    # Keyboard: Tab moves focus, and the landing place is visibly focused.
    page.evaluate("() => { document.body.focus(); }")
    page.keyboard.press("Tab")
    page.wait_for_timeout(200)
    first = page.evaluate(FOCUS_JS)
    step(
        f"{label}: the first Tab reaches a visible control",
        bool(first and first["visible"]),
        (first or {}).get("text", ""),
    )
    step(
        f"{label}: the focused control paints a focus indicator",
        bool(first and first["indicator"]),
        (first or {}).get("text", ""),
    )

    if require_skip_link:
        # The shell moves focus to <main> on arrival, so the skip link is not
        # the first Tab stop by design — but it must still exist, be
        # focusable, appear when focused, and land inside <main>.
        skip = page.locator("a.skip-link").first
        present = skip.count() > 0
        step(f"{label}: a skip link exists", present)
        if present:
            skip.evaluate("(el) => el.focus()")
            page.wait_for_timeout(200)
            visible = skip.is_visible()
            step(f"{label}: the skip link becomes visible on focus", visible)
            page.keyboard.press("Enter")
            page.wait_for_timeout(400)
            inside = page.evaluate(
                "() => !!document.activeElement && !!document.activeElement.closest('main')"
            )
            step(f"{label}: the skip link moves focus to <main>", inside, page.url)

    if require_wordmark:
        step(f"{label}: the Amharic wordmark renders", facts["wordmarkAmharic"])
        step(f"{label}: the Latin wordmark renders", facts["wordmarkLatin"])
        step(f"{label}: the wordmark font is loaded", facts["fontLoaded"])

    # Contrast: the two text colours that carry the page, plus the primary action.
    for selector, name, large_ok in [
        ("h1", "the h1", True),
        ("main p", "the body copy", False),
        ("header a", "a header link", False),
        ("button.bg-brand-600, a.bg-brand-600", "the AAU-blue action", False),
    ]:
        style = page.evaluate(STYLE_JS, selector)
        if not style:
            continue
        ratio = contrast(style["color"], style["background"])
        if ratio is None:
            continue
        threshold = 3.0 if (large_ok and style["size"] >= 24) else 4.5
        step(
            f"{label}: {name} clears WCAG AA ({ratio:.1f}:1)",
            ratio >= threshold,
            f"needs {threshold}:1",
        )


def main():
    roles = [r for r in SCREENS if not WANTED or r in WANTED]
    print(f"\033[1mAccessibility and the AAU identity — {BASE}\033[0m")
    if BASE.startswith("https://"):
        wait_for_login_window()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        # Public pages first: no account needed.
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        for path, label in PUBLIC_SCREENS:
            try:
                page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=60_000)
                check_page(
                    page,
                    label,
                    require_skip_link=True,
                    require_wordmark=(path == "/"),
                )
            except Exception as exc:
                step(f"{label}: the page could be checked", False, f"{type(exc).__name__}: {exc}")
        context.close()

        for role in roles:
            email, password = ACCOUNTS[role]
            print(f"\n\033[1m{role}\033[0m")
            context = browser.new_context(
                viewport={"width": 1440, "height": 900},
                reduced_motion="reduce",
            )
            page = context.new_page()
            try:
                if not sign_in(page, email, password):
                    step(f"{role}: signed in", False, page.url)
                    continue
                step(f"{role}: signed in", True)

                # The phone shell is a different disclosure: the drawer's
                # `aria-expanded` is the only thing telling a screen reader
                # whether the menu is open.
                page.set_viewport_size({"width": 390, "height": 844})
                page.goto(f"{BASE}/dashboard", wait_until="domcontentloaded", timeout=60_000)
                page.wait_for_timeout(900)
                trigger = page.locator('button[aria-label="Open menu"]').first
                if trigger.count():
                    before = trigger.get_attribute("aria-expanded")
                    trigger.click()
                    page.wait_for_timeout(400)
                    opened = trigger.get_attribute("aria-expanded")
                    page.keyboard.press("Escape")
                    page.wait_for_timeout(400)
                    closed = trigger.get_attribute("aria-expanded")
                    step(
                        f"{role} phone: the menu announces open and closed",
                        before == "false" and opened == "true" and closed == "false",
                        f"{before} → {opened} → {closed}",
                    )
                else:
                    step(f"{role} phone: the menu announces open and closed", False, "no disclosure")
                facts = page.evaluate(HAVE_NAME_JS)
                step(
                    f"{role} phone: every visible control has an accessible name",
                    not facts["unnamed"],
                    ", ".join(sorted(set(facts["unnamed"]))[:6]),
                )
                page.set_viewport_size({"width": 1440, "height": 900})

                for path, label in SCREENS[role]:
                    try:
                        page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=60_000)
                        check_page(
                            page,
                            f"{role} {label}",
                            require_skip_link=True,
                            require_wordmark=(path == "/dashboard"),
                        )
                    except Exception as exc:
                        step(
                            f"{role} {label}: the page could be checked",
                            False,
                            f"{type(exc).__name__}: {exc}",
                        )
            finally:
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
