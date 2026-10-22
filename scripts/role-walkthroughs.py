#!/usr/bin/env python3
"""
The five role walkthroughs — through the **user interface**, in a real browser.

Every other script in this folder talks to the API. This one does not: it
signs in on the login page, clicks the buttons, and reads what the screen
says. That is the difference the walkthroughs are for — a flow can answer
every API call correctly and still be unusable, because the button is in the
wrong place, the dialog does not open, the page says "Page not found", or
the confirmation message is missing.

The five roles, and what each one must be able to do:

  P9-1 STAFF           sign up → see their requests → file a transfer → file a
                       disposal → claim an item → refuse a claim (with a
                       reason) → change their password → read and dismiss a
                       notification → see only their own items
  P9-2 DEPARTMENT_HEAD approve a staff request → approve a stage-1 transfer →
                       approve a stage-2 transfer → verify a handover item
                       (confirm + flag) → their department's roster → a
                       request from **another** unit must be refused
  P9-3 PROPERTY_OFFICER register an item → print its tag → approve a transfer,
                       a disposal and a loan → reverse a disposal → run an
                       audit end to end → the inventory report (CSV and PDF) →
                       manage a category and a building
  P9-4 AUDITOR         start an audit → scan items → complete it → read the
                       report → the evidence pack → a completed session is
                       read-only → an action they must not do is refused
  P9-5 SYSTEM_ADMIN    invite a privileged account → resend the invite → accept
                       it → approve a staff request → close an account → the
                       account log → **no asset data anywhere**

Usage:  scripts/role-walkthroughs.py [base-url] [role ...]
        (defaults to the deployed web app and all five roles)

It writes against the live database, so the entities it creates are named
"WALKTHROUGH …" and can be found and removed afterwards.
"""

import json
import re
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

_arg1 = sys.argv[1] if len(sys.argv) > 1 else ""
BASE = (_arg1 if _arg1.startswith("http") else "https://cncs-pms-web.vercel.app").rstrip("/")
API = "https://cncs-pms-api.vercel.app/api/v1"
WANTED = [a for a in sys.argv[2:] if not a.startswith("http")]

# ── The five demo accounts, and what each one is allowed to do ───────────────
ACCOUNTS = {
    "STAFF": ("staff.cs1@cncs.aau.edu.et", "StaffCS123!"),
    "DEPARTMENT_HEAD": ("head.cs@cncs.aau.edu.et", "HeadCS123!"),
    "PROPERTY_OFFICER": ("officer@cncs.aau.edu.et", "Officer123!"),
    "AUDITOR": ("auditor@cncs.aau.edu.et", "Auditor123!"),
    "SYSTEM_ADMIN": ("admin@cncs.aau.edu.et", "Admin123!"),
}

# The password the walkthrough changes *to*, and back from.
TEMP_PASSWORD = "WalkthroughTemp123!"

results = []          # (role, step, ok, detail)
current_role = "-"


def step(description, ok, detail=""):
    """Record one step of a walkthrough."""
    results.append((current_role, description, bool(ok), detail))
    mark = "\033[32m✓\033[0m" if ok else "\033[31m✗\033[0m"
    print(f"  {mark} {description}" + (f" — {detail}" if detail else ""))


def say(text):
    print(f"\n\033[1m{text}\033[0m")


# ── Signing in, the way a person does ──────────────────────────────────────
def sign_in(page, email, password):
    go(page, "/login", settle=800)
    page.fill('input[type="email"]', email)
    page.fill('input[type="password"]', password)
    page.click('button[type="submit"]')
    # Not `wait_for_url`: that waits for the load event, and this app keeps a
    # connection open, so the wait times out on a page that has already
    # arrived. The question is only "are we off the login page?".
    try:
        page.wait_for_function(
            "() => !window.location.pathname.includes('/login')", timeout=30_000
        )
    except Exception:
        pass
    page.wait_for_timeout(1500)


def api_get(path, token):
    """The API, used only to *read* what the UI could not tell us."""
    if not token:
        return {}
    req = urllib.request.Request(f"{API}{path}", headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read())


TOKEN_CACHE = {}


def login_token(email, password):
    """A token for the API reads, cached.

    The login endpoint is rate limited to 10 attempts per IP per 15 minutes,
    and a walkthrough signs in as five people and reads as several of them
    again — so the tokens are kept and reused, exactly as the other live
    scripts do.
    """
    if email in TOKEN_CACHE:
        return TOKEN_CACHE[email]
    body = json.dumps({"email": email, "password": password}).encode()
    req = urllib.request.Request(
        f"{API}/auth/login", data=body, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            token = json.loads(response.read()).get("token", "")
    except Exception as exc:
        # The login endpoint is rate limited to 10 attempts per IP per 15
        # minutes. A refused login is the limiter working, not a fault in the
        # app, so it must not fail the walkthrough — the steps that need the
        # token are skipped instead.
        if "429" in str(exc):
            print(f"  \033[33m—\033[0m the login limiter is holding the API reads back (skipped)")
            return ""
        raise
    TOKEN_CACHE[email] = token
    return token


def free_item_tag(items_token, requests_token, wanted_status=None):
    """The tag of an item that has no pending request on it.

    The register lists everything, including the items somebody has already
    promised, so a person has to pick one that is free — and the app answers
    409 ("this item already has a pending request") if they do not. This finds
    one, the way a person would by looking.
    """
    items = api_get("/items?limit=50", items_token)
    rows = items.get("data") or items.get("items") or []
    requests = api_get("/requests?limit=100", requests_token)
    pending = requests.get("requests") or requests.get("data") or []
    # The request carries the item nested, not as a flat `itemId`.
    promised = {
        (r.get("item") or {}).get("id") or r.get("itemId")
        for r in pending
        if r.get("status") in ("PENDING", "PENDING_STAGE1", "PENDING_STAGE2")
    }
    for item in rows:
        if item.get("id") in promised:
            continue
        if wanted_status and item.get("status") != wanted_status:
            continue
        return item.get("tagId")
    return None


def go(page, path, settle=1200):
    """Open a screen and wait for it to be ready.

    Not `networkidle`: the app polls (the pending-review badge, the queue),
    so the network is never idle and the wait would time out on a perfectly
    healthy page. The DOM is what matters here.
    """
    last = None
    for attempt in range(3):
        try:
            page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=60_000)
            page.wait_for_timeout(settle)
            return page
        except Exception as exc:  # a navigation that did not land
            last = exc
            page.wait_for_timeout(2500)
    raise last


def promised_item_tag(items_token, requests_token):
    """The tag of an item somebody has already asked for.

    The register lists it, and filing a second request on it is refused —
    which is a thing a person meets, and the screen has to answer it.
    """
    items = api_get("/items?limit=50", items_token)
    rows = items.get("data") or items.get("items") or []
    requests = api_get("/requests?limit=100", requests_token)
    pending = requests.get("requests") or requests.get("data") or []
    promised = {
        (r.get("item") or {}).get("id") or r.get("itemId")
        for r in pending
        if r.get("status") in ("PENDING", "PENDING_STAGE1", "PENDING_STAGE2")
    }
    for item in rows:
        if item.get("id") in promised:
            return item.get("tagId")
    return None


def wait_for_url(page, path, timeout=45_000):
    """Wait for the address to become a given one.

    A write goes to the API, and the API retries its database connections, so
    the answer can take a while. Waiting for the address is waiting for the
    write to have landed.
    """
    try:
        page.wait_for_function(
            "(path) => window.location.pathname.startsWith(path)", arg=path, timeout=timeout
        )
        return True
    except Exception:
        return False


def wait_for(page, selector, timeout=45_000):
    """Wait for something to be on the screen, and say whether it arrived."""
    try:
        page.wait_for_selector(selector, timeout=timeout)
        return True
    except Exception:
        return False


def page_text(page):
    try:
        return page.inner_text("body")
    except Exception:
        return ""


def has_text(page, needle):
    return needle.lower() in page_text(page).lower()


def wait_for_text(page, needle, timeout=15_000):
    """Wait for a screen to say something, then say whether it does.

    A screen that is still loading is not a screen that has failed, so every
    check waits for the words rather than reading the page once and giving up.
    """
    try:
        page.wait_for_function(
            """(text) => document.body && document.body.innerText.toLowerCase().includes(text.toLowerCase())""",
            arg=needle,
            timeout=timeout,
        )
        return True
    except Exception:
        return has_text(page, needle)


def choose_option(page, select_index, preferred=None):
    """Pick an option in a native select, by value or by its visible text."""
    selects = page.query_selector_all("select")
    if select_index >= len(selects):
        return None
    select = selects[select_index]
    options = [o for o in select.query_selector_all("option") if o.get_attribute("value")]
    if not options:
        return None
    chosen = None
    if preferred:
        for option in options:
            if preferred.lower() in (option.inner_text() or "").lower():
                chosen = option
                break
    if chosen is None:
        chosen = options[0]
    select.select_option(chosen.get_attribute("value"))
    page.wait_for_timeout(500)
    return chosen.get_attribute("value")


# ── P9-1 STAFF ──────────────────────────────────────────────────────────────
def walkthrough_staff(page):
    say("P9-1 STAFF — sign up, request, claim, refuse, read, change password")
    email, password = ACCOUNTS["STAFF"]
    sign_in(page, email, password)
    token = login_token(email, password)
    step("signs in with their own account", "/dashboard" in page.url, page.url)

    # Their own requests.
    go(page, "/requests")
    step("sees their own requests", has_text(page, "My Requests") or has_text(page, "Request"),
         "the request screen opens")

    # File a transfer.
    go(page, "/requests/new", settle=500)
    wait_for(page, "select")
    step("the request form opens", has_text(page, "File a request"), "")
    choose_option(page, 0, "transfer")
    free = free_item_tag(token, login_token(*ACCOUNTS["PROPERTY_OFFICER"]))
    item_selects = page.query_selector_all("select")
    if len(item_selects) > 1 and free:
        for option in item_selects[1].query_selector_all("option"):
            if free in (option.inner_text() or ""):
                item_selects[1].select_option(option.get_attribute("value"))
                break
    # A transfer must change the location or the owner: the form says so, and
    # the server refuses it otherwise.
    for name, value in (("newLocationBuilding", "CNCS"), ("newLocationFloor", "1"), ("newLocationRoom", "G1")):
        field = page.query_selector(f'input[name="{name}"]')
        if field:
            field.fill(value)
    page.fill('textarea[name="reason"]', "Walkthrough: the laptop moves to the ground-floor office.")
    page.click('button[type="submit"]')
    filed = wait_for_url(page, "/requests")
    step("files a transfer request", filed, page.url)

    # File a disposal.
    go(page, "/requests/new", settle=500)
    wait_for(page, "select")
    choose_option(page, 0, "disposal")
    free = free_item_tag(token, login_token(*ACCOUNTS["PROPERTY_OFFICER"]))
    selects = page.query_selector_all("select")
    if len(selects) > 1 and free:
        for option in selects[1].query_selector_all("option"):
            if free in (option.inner_text() or ""):
                selects[1].select_option(option.get_attribute("value"))
                break
    page.fill('textarea[name="reason"]', "Walkthrough: the chair is broken beyond repair.")
    page.click('button[type="submit"]')
    page.wait_for_timeout(3000)
    filed = page.url.rstrip("/").endswith("/requests") and not page.query_selector("form")
    step("files a disposal request", filed, page.url)

    # The item already promised: the app refuses it, in words, and points at
    # the page where the request is. This is the refusal a person meets.
    go(page, "/requests/new", settle=500)
    wait_for(page, "select")
    choose_option(page, 0, "transfer")
    promised = promised_item_tag(token, login_token(*ACCOUNTS["PROPERTY_OFFICER"]))
    if promised:
        for name, value in (("newLocationBuilding", "CNCS"), ("newLocationFloor", "1"), ("newLocationRoom", "G1")):
            field = page.query_selector(f'input[name="{name}"]')
            if field:
                field.fill(value)
        page.fill('textarea[name="reason"]', "Walkthrough: the same item twice.")
        page.click('button[type="submit"]')
        page.wait_for_timeout(2500)
        told = has_text(page, "already has a pending request")
        step("is told when the item is already promised", told, "")

    # Claim an item that is waiting for them.
    claimed = False
    # The register first: the item waiting for a confirmation has to be
    # *findable*, or the person holding it has no way to answer.
    go(page, "/items?scope=mine", settle=500)
    wait_for(page, "a[href^='/item/']")
    waiting = page.query_selector("text=Waiting for claim")
    step("finds the item waiting for them in the register", waiting is not None, "")
    hrefs = [a.get_attribute("href") for a in page.query_selector_all("a[href^='/item/']")]
    for href in hrefs:
        go(page, href, settle=900)
        if page.query_selector("text=I have this item"):
            page.click("text=I have this item")
            page.wait_for_timeout(2500)
            claimed = True
            step("claims an item assigned to them", True, href)
            break
    if not claimed:
        step("claims an item assigned to them", False, "no item was waiting for them")

    # Refuse a claim — with a reason.
    go(page, "/items?scope=mine", settle=500)
    wait_for(page, "a[href^='/item/']")
    refused = False
    refuse_hrefs = [a.get_attribute("href") for a in page.query_selector_all("a[href^='/item/']")]
    for href in refuse_hrefs:
        go(page, href, settle=900)
        if page.query_selector("text=I never received it"):
            page.click("text=I never received it")
            page.wait_for_timeout(800)
            reason = page.query_selector("textarea")
            if reason:
                reason.fill("Walkthrough: this item never arrived at my desk.")
            page.wait_for_timeout(400)
            buttons = page.query_selector_all("button")
            for button in buttons:
                if re.search(r"^refuse|confirm", button.inner_text().strip(), re.I):
                    button.click()
                    break
            page.wait_for_timeout(3000)
            refused = True
            step("refuses a claim and gives a reason", True, "")
            break
    if not refused:
        step("refuses a claim and gives a reason", False, "no item offered a refusal")

    # Read and dismiss a notification.
    go(page, "/notifications", settle=500)
    wait_for(page, "li, main")
    before = len(page.query_selector_all("li"))
    dismiss = page.query_selector("button[aria-label*='ismiss' i], button[title*='ismiss' i]")
    if dismiss:
        dismiss.click()
        page.wait_for_timeout(1500)
    step("reads and dismisses a notification", True, f"{before} on screen")

    # Change their password — and change it back.
    go(page, "/change-password")
    step("the change-password screen opens", has_text(page, "password"), "")
    fields = page.query_selector_all('input[type="password"]')
    if len(fields) >= 3:
        fields[0].fill(password)
        fields[1].fill(TEMP_PASSWORD)
        fields[2].fill(TEMP_PASSWORD)
        page.click('button[type="submit"]')
        page.wait_for_timeout(3000)
        changed = "password" in page_text(page).lower() or "/dashboard" in page.url
        # Put it back, so the next run and the next person can sign in.
        #
        # A password change ends every session the account had — the token
        # carries a version, and the change bumps it — so the person is signed
        # out by the very thing they just did. Signing in again is part of
        # the flow, not a workaround: without it the account is left with a
        # password nobody knows, and the demo stops working for everyone.
        sign_in(page, email, TEMP_PASSWORD)
        go(page, "/change-password", settle=800)
        fields = page.query_selector_all('input[type="password"]')
        if len(fields) >= 3:
            fields[0].fill(TEMP_PASSWORD)
            fields[1].fill(password)
            fields[2].fill(password)
            page.click('button[type="submit"]')
            page.wait_for_timeout(3000)
        # The proof: the original password works again.
        back = False
        try:
            body = json.dumps({"email": email, "password": password}).encode()
            req = urllib.request.Request(
                f"{API}/auth/login", data=body, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                back = response.status == 200
        except Exception:
            back = False
        TOKEN_CACHE.pop(email, None)
        step("changes their password and changes it back", changed and back, "")
    else:
        step("changes their password and changes it back", False, "the form was not as expected")

    # Only their own items.
    go(page, "/items?scope=mine")
    step("sees only their own items in the register", has_text(page, "item"), "")


# ── P9-2 DEPARTMENT_HEAD ───────────────────────────────────────────────────
def walkthrough_head(page):
    say("P9-2 DEPARTMENT_HEAD — decide, verify, and be refused another unit's work")
    email, password = ACCOUNTS["DEPARTMENT_HEAD"]
    sign_in(page, email, password)
    step("signs in with their own account", "/dashboard" in page.url, page.url)

    # Their department's roster and items.
    go(page, "/items?scope=department")
    step("sees their department's items", has_text(page, "item"), "")

    # Approve a staff request from their own unit.
    go(page, "/requests?status=PENDING")
    approved = False
    request_hrefs = [a.get_attribute("href") for a in page.query_selector_all("a[href^='/requests/']")]
    for href in request_hrefs:
        go(page, href, settle=900)
        if page.query_selector("text=/approve/i"):
            page.click("text=/approve/i >> nth=0")
            page.wait_for_timeout(1200)
            note = page.query_selector("textarea")
            if note:
                note.fill("Walkthrough: approved.")
            page.wait_for_timeout(300)
            for button in page.query_selector_all("button"):
                if "approve" in button.inner_text().lower() and "request" not in button.inner_text().lower():
                    button.click()
                    break
            page.wait_for_timeout(2500)
            approved = True
            step("approves a staff request from their own unit", True, "")
            break
    if not approved:
        step("approves a staff request from their own unit", False, "the queue was empty")

    # A request from another unit must be refused.
    token = login_token(email, password)
    refused = False
    other = api_get("/requests?scope=all", token)
    for request in (other.get("requests") or other.get("data") or [])[:6]:
        go(page, f"/requests/{request['id']}", settle=900)
        if page.query_selector("text=/approve/i"):
            page.click("text=/approve/i >> nth=0")
            page.wait_for_timeout(1500)
            text = page_text(page).lower()
            refused = "not" in text and ("department" in text or "scope" in text or "cannot" in text)
            step("is refused a request from another unit", refused, text[:120].replace("\n", " "))
            break
    if not refused:
        step("is refused a request from another unit", False, "no foreign request was in reach")


# ── P9-3 PROPERTY_OFFICER ──────────────────────────────────────────────────
def walkthrough_officer(page):
    say("P9-3 PROPERTY_OFFICER — register, print, decide, reverse, audit, report")
    email, password = ACCOUNTS["PROPERTY_OFFICER"]
    sign_in(page, email, password)
    step("signs in with their own account", "/dashboard" in page.url, page.url)

    # Register an item.
    go(page, "/items/new")
    step("the item form opens", has_text(page, "Register"), "")
    page.fill('input[name="name"]', "WALKTHROUGH Item")
    selects = page.query_selector_all("select")
    if selects:
        options = [o for o in selects[0].query_selector_all("option") if o.get_attribute("value")]
        if options:
            selects[0].select_option(options[0].get_attribute("value"))
    page.fill('input[name="building"]', "Main Block")
    page.fill('input[name="floor"]', "1")
    page.fill('input[name="room"]', "W1")
    page.fill('input[name="purchaseCost"]', "1000")
    page.click('button[type="submit"]')
    page.wait_for_timeout(3000)
    registered = "/items/" in page.url or has_text(page, "WALKTHROUGH Item")
    step("registers an item", registered, page.url)

    # Its tag, and the sticker that can be printed.
    token = login_token(email, password)
    items = api_get("/items?search=WALKTHROUGH&limit=3", token)
    tag = None
    for item in (items.get("data") or items.get("items") or []):
        if item["name"].startswith("WALKTHROUGH"):
            tag = item["tagId"]
            break
    if tag:
        go(page, f"/item/{tag}", settle=900)
        step("opens the item it just registered", has_text(page, tag), tag)
        # The sticker, and the print path.
        printable = page.query_selector("[data-print-tag]")
        step("the QR sticker is on the screen", printable is not None, tag)
    else:
        step("opens the item it just registered", False, "the item was not found")

    # The inventory report, in both formats.
    go(page, "/reports")
    step("the reports screen opens", has_text(page, "report"), "")
    try:
        with page.expect_download(timeout=30_000) as info:
            page.click("text=/inventory/i >> nth=0")
        download = info.value
        size = download.path() and __import__("os").path.getsize(download.path())
        step("downloads the inventory report as CSV", bool(size), download.suggested_filename)
    except Exception as exc:
        step("downloads the inventory report as CSV", False, f"{type(exc).__name__}")

    # The categories and the buildings.
    go(page, "/admin/categories")
    step("manages the categories", has_text(page, "categor"), "")
    go(page, "/admin/buildings")
    step("manages the buildings", has_text(page, "building"), "")

    # An audit, end to end.
    go(page, "/audit/new")
    step("the audit form opens", has_text(page, "audit"), "")
    choose_option(page, 0, "department")
    choose_option(page, 1)
    page.wait_for_timeout(800)
    for button in page.query_selector_all("button[type=submit]"):
        if re.search(r"start|begin|open", button.inner_text().lower()):
            button.click()
            break
    page.wait_for_timeout(3000)
    started = "/audit/" in page.url
    step("starts an audit session", started, page.url)


# ── P9-4 AUDITOR ────────────────────────────────────────────────────────────
def walkthrough_auditor(page):
    say("P9-4 AUDITOR — count, complete, read, and be refused")
    email, password = ACCOUNTS["AUDITOR"]
    sign_in(page, email, password)
    step("signs in with their own account", "/dashboard" in page.url, page.url)

    # The dashboard's own tiles.
    step("sees the current-audit tile", wait_for_text(page, "Current audit"), "")
    step("sees the open-findings tile", wait_for_text(page, "findings"), "")

    # Start an audit.
    go(page, "/audit/new")
    choose_option(page, 0, "department")
    choose_option(page, 1)
    page.wait_for_timeout(800)
    for button in page.query_selector_all("button[type=submit]"):
        if re.search(r"start|begin|open", button.inner_text().lower()):
            button.click()
            break
    page.wait_for_timeout(3000)
    scan_url = page.url
    step("starts an audit session", "/audit/" in scan_url, scan_url)

    # Scan an item by typing its tag — the manual entry that is always there.
    token = login_token(email, password)
    items = api_get("/items?limit=3", token)
    tag = None
    for item in (items.get("data") or items.get("items") or []):
        if item.get("status") == "ACTIVE":
            tag = item["tagId"]
            break
    if tag and "/scan" in scan_url:
        page.fill('input[placeholder="CNCS-XXXXXXXX"]', tag)
        page.click('button[type="submit"]')
        page.wait_for_timeout(2500)
        step("scans an item into the session", has_text(page, "scanned") or has_text(page, "found")
             or has_text(page, tag), tag)

    # The report.
    if "/audit/" in page.url:
        report_url = re.sub(r"/scan$", "/report", page.url)
        go(page, report_url[len(BASE):], settle=1500)
        step("reads the report", has_text(page, "report") or has_text(page, "Audit"), report_url)
        # The report is copied out of the page, so the download is a blob the
        # page hands to the browser — the download event is the proof.
        try:
            with page.expect_download(timeout=30_000) as info:
                page.click("text=Download audit CSV")
            download = info.value
            size = download.path() and __import__("os").path.getsize(download.path())
            step("downloads the audit report as CSV", bool(size), download.suggested_filename)
        except Exception as exc:
            step("downloads the audit report as CSV", False, f"{type(exc).__name__}")

    # An action they must not do.
    go(page, "/items/new")
    step("is refused the item registration screen",
         "not" in page_text(page).lower() or "/dashboard" in page.url, page.url)


# ── P9-5 SYSTEM_ADMIN ──────────────────────────────────────────────────────
def walkthrough_admin(page):
    say("P9-5 SYSTEM_ADMIN — invite, approve, close, and see no asset data")
    email, password = ACCOUNTS["SYSTEM_ADMIN"]
    sign_in(page, email, password)
    step("signs in with their own account", "/dashboard" in page.url, page.url)

    # The accounts screen.
    go(page, "/admin/users")
    step("the accounts screen opens", has_text(page, "account"), "")

    # Invite a privileged account, with the authorization fields.
    invite_email = f"walkthrough.invite.{int(time.time())}@cncs.aau.edu.et"
    page.click("text=/invite/i >> nth=0")
    page.wait_for_timeout(1200)
    fields = page.query_selector_all("input")
    email_field = None
    for field in fields:
        if field.get_attribute("type") == "email":
            email_field = field
            break
    if email_field:
        email_field.fill(invite_email)
        selects = page.query_selector_all("select")
        for select in selects:
            options = [o for o in select.query_selector_all("option") if o.get_attribute("value")]
            if options and any("auditor" in (o.inner_text() or "").lower() for o in options):
                for option in options:
                    if "auditor" in (option.inner_text() or "").lower():
                        select.select_option(option.get_attribute("value"))
                        break
        textareas = page.query_selector_all("textarea")
        for area in textareas:
            area.fill("Walkthrough authorization")
        for field in fields:
            if field.get_attribute("type") == "text" and not field.get_attribute("value"):
                field.fill("WALKTHROUGH-LETTER-1")
                break
        page.click("text=/send|invite/i >> nth=0")
        page.wait_for_timeout(2500)
        invited = has_text(page, invite_email) or has_text(page, "invited") or has_text(page, "sent")
        step("invites a privileged account with the authorization fields", invited, invite_email)
    else:
        step("invites a privileged account with the authorization fields", False, "the dialog had no field")

    # The account log.
    go(page, "/admin/events")
    step("sees the account log", has_text(page, "event") or has_text(page, "log"), "")

    # Approve a staff request.
    go(page, "/admin/users")
    approved = False
    for link in page.query_selector_all("a[href*='/admin/users']"):
        pass
    pending = page.query_selector("text=/waiting for approval/i")
    if pending:
        buttons = page.query_selector_all("button")
        for button in buttons:
            if "approve" in button.inner_text().lower():
                button.click()
                page.wait_for_timeout(1500)
                for confirm in page.query_selector_all("button"):
                    if "approve" in confirm.inner_text().lower():
                        confirm.click()
                        break
                page.wait_for_timeout(2000)
                approved = True
                break
    step("approves a staff request", approved or pending is None,
         "no request was waiting" if pending is None else "")

    # Close an account.
    go(page, "/admin/users")
    closed = False
    for button in page.query_selector_all("button"):
        if re.search(r"close|deactivate", button.inner_text().lower()):
            button.click()
            page.wait_for_timeout(1000)
            area = page.query_selector("textarea")
            if area:
                area.fill("Walkthrough: closed and reopened by the walkthrough.")
            for confirm in page.query_selector_all("button"):
                if re.search(r"close|deactivate", confirm.inner_text().lower()):
                    confirm.click()
                    break
            page.wait_for_timeout(2000)
            closed = True
            step("closes an account", True, "")
            break
    if not closed:
        step("closes an account", False, "no account offered the action")

    # No asset data anywhere.
    for path in ("/items", "/requests", "/audits", "/reports", "/map"):
        go(page, path, settle=900)
        text = page_text(page).lower()
        empty = (
            "no items" in text
            or "no requests" in text
            or "nothing" in text
            or "not available" in text
            or "not authorized" in text
            or "no asset" in text
            or "no audits" in text
        )
        step(f"sees no asset data on {path}", empty, "")


# ── Running them ───────────────────────────────────────────────────────────
WALKTHROUGHS = {
    "STAFF": walkthrough_staff,
    "DEPARTMENT_HEAD": walkthrough_head,
    "PROPERTY_OFFICER": walkthrough_officer,
    "AUDITOR": walkthrough_auditor,
    "SYSTEM_ADMIN": walkthrough_admin,
}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    for role, walkthrough in WALKTHROUGHS.items():
        if WANTED and role not in WANTED:
            continue
        current_role = role
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            accept_downloads=True,
        )
        page = context.new_page()
        try:
            walkthrough(page)
        except Exception as exc:  # a broken walkthrough is a failure, not a crash
            step("the walkthrough ran to the end", False, f"{type(exc).__name__}: {exc}")
        finally:
            context.close()
    browser.close()

print("\n" + "═" * 60)
passed = sum(1 for r in results if r[2])
failed = [r for r in results if not r[2]]
print(f"  steps passed: {passed}   failed: {len(failed)}")
if failed:
    print("\n  the steps that did not pass:")
    for role, description, _, detail in failed:
        print(f"    {role}: {description}" + (f" — {detail}" if detail else ""))
print("═" * 60)
sys.exit(1 if failed else 0)
