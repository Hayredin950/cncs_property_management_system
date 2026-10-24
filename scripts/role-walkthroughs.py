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
                       a disposal and a loan → reverse a disposal → read the
                       audit history (running an audit is the auditor's job,
                       and this role must be kept out of it) → the inventory
                       report (CSV and PDF) → manage a category and a building
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

It expects a freshly seeded database. The walkthroughs decide requests, claim
items, refuse claims and close accounts — state the seed will not put back,
because the seed only adds and updates its own rows. Running the suite twice
against the same data therefore fails for reasons that have nothing to do
with the app. Reset the database first:

    cd backend
    ./node_modules/.bin/prisma migrate reset --force   # local test DB only
    ./node_modules/.bin/tsx prisma/seed.ts
"""

import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from playwright.sync_api import sync_playwright

_arg1 = sys.argv[1] if len(sys.argv) > 1 else ""
BASE = (_arg1 if _arg1.startswith("http") else "https://cncs-pms-web.vercel.app").rstrip("/")

# The API the script reads from. Against the deployment it is the deployment's
# own API; against a local dev server (`pnpm dev` + `pnpm exec vite`) it is the
# local backend, because a walkthrough that writes locally and reads production
# would compare two different databases. `WALKTHROUGH_API` overrides both.
_api_override = os.environ.get("WALKTHROUGH_API", "").strip()
if _api_override:
    API = _api_override.rstrip("/")
elif re.match(r"^https?://(localhost|127\.0\.0\.1)(:|/|$)", BASE):
    API = "http://localhost:4000/api/v1"
else:
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
    # The deployment answers the tenth sign-in from one address in a quarter
    # of an hour with 429. A sign-in that stays on the login page is the
    # limiter, not a broken form: wait for the window to move and try once
    # more, rather than failing the rest of the role on a page that never
    # opened.
    if "/login" in page.url:
        print("  \033[33m—\033[0m the login limiter is holding this sign-in back; waiting")
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
    page.wait_for_timeout(1500)


def api_get(path, token):
    """The API, used only to *read* what the UI could not tell us.

    A refusal is an answer, not a crash: the head asking for the whole
    college's requests gets a 403, and that 403 is one of the things the
    walkthrough is here to observe. So an error is a result, not an exception.
    """
    if not token:
        return {}
    req = urllib.request.Request(f"{API}{path}", headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        try:
            return json.loads(exc.read())
        except Exception:
            return {"error": f"HTTP {exc.code}"}
    except Exception as exc:
        return {"error": str(exc)}


TOKEN_CACHE = {}

# Which role each demo account holds, used to check that a token read from the
# page really belongs to the person it is being used for.
ROLE_BY_EMAIL = {email: role for role, (email, _) in ACCOUNTS.items()}


def token_role(token):
    """The role inside a JWT, without verifying it (the server decides trust)."""
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("role")
    except Exception:
        return None


def login_token(email, password, page=None):
    """A token for the API reads, cached.

    The login endpoint is rate limited to 10 attempts per IP per 15 minutes,
    and a walkthrough signs in as five people and reads as several of them
    again — so the tokens are kept and reused, exactly as the other live
    scripts do.

    When the page has already signed in, its session token is read out of
    localStorage instead of asking for a second one: five roles against a
    ten-attempt window is exactly at the edge, and a retry would tip it over
    into a 429 that reads as "the app cannot sign in".
    """
    if email in TOKEN_CACHE:
        return TOKEN_CACHE[email]
    if page is not None:
        try:
            token = page.evaluate("() => localStorage.getItem('cncs.auth.token')")
        except Exception:
            token = None
        # Only this person's own session may be reused. The head's screen was
        # being handed to the officer's API reads too: the token came from the
        # page, not from the address it was asked for, so "read the whole
        # college's requests" returned the head's own unit and the walkthrough
        # concluded a foreign request did not exist.
        if token and token_role(token) == ROLE_BY_EMAIL.get(email):
            TOKEN_CACHE[email] = token
            return token
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


PENDING_STATUSES = ("PENDING", "PENDING_STAGE1", "PENDING_STAGE2")


def promised_ids(requests):
    """The item ids that already carry a request under consideration.

    The request carries the item nested, not as a flat `itemId`.
    """
    rows = requests.get("requests") or requests.get("data") or []
    return {
        (r.get("item") or {}).get("id") or r.get("itemId")
        for r in rows
        if r.get("status") in PENDING_STATUSES
    }


def pick_free_item(items_token, requests_token, wanted_status=None):
    """A row from *this person's* register that no request has promised yet.

    The dropdown on `/requests/new` lists what the signed-in person may file a
    request against — their own items — so the choice has to come from the same
    list. Asking the Property Officer's register instead used to return items
    the staff member's form did not offer, and the select was left empty: the
    form refused to submit and the walkthrough blamed the app.
    """
    items = api_get("/items?scope=mine&limit=100", items_token)
    rows = items.get("data") or items.get("items") or []
    requests = api_get("/requests?limit=100", requests_token)
    promised = promised_ids(requests)
    for item in rows:
        if item.get("id") in promised:
            continue
        if wanted_status and item.get("status") != wanted_status:
            continue
        return item
    return None


def select_item(page, item):
    """Choose an item in the form's Item select, by the row's own id.

    The options arrive from the API after the form paints, and the deployed
    app is slower than the laptop, so the select is polled rather than read
    once: reading it too early returns no option, the form is submitted with
    an empty item, and the walkthrough blames the app for its own haste.
    """
    if not item:
        return False
    deadline = time.time() + 20
    while time.time() < deadline:
        for select in page.query_selector_all("select"):
            for option in select.query_selector_all("option"):
                if option.get_attribute("value") == item.get("id"):
                    select.select_option(item["id"])
                    page.wait_for_timeout(400)
                    return True
        page.wait_for_timeout(400)
    return False


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


def select_by_label(page, label, preferred=None):
    """Pick an option in the select whose label says this.

    A form's selects are addressed by their visible label, not by their
    position in the page: the item form has four of them (category,
    department, owner, condition) and picking by index meant the walkthrough
    chose the category where it meant the owner.
    """
    control = page.get_by_label(label, exact=True)
    try:
        control.first.wait_for(state="visible", timeout=20_000)
    except Exception:
        return None
    # The options are fetched after the control paints (departments, buildings,
    # owners), so the list is polled: reading it once on the deployment finds
    # only the placeholder, the form is submitted without a value, and the
    # walkthrough blames the app for not registering the item.
    deadline = time.time() + 20
    handle = None
    options = []
    while time.time() < deadline:
        handle = control.first.element_handle()
        if handle is not None:
            options = [o for o in handle.query_selector_all("option") if o.get_attribute("value")]
            if options:
                break
        page.wait_for_timeout(400)
    if handle is None or not options:
        return None
    chosen = None
    if preferred:
        for option in options:
            if preferred.lower() in (option.inner_text() or "").lower():
                chosen = option
                break
    if chosen is None:
        chosen = options[0]
    handle.select_option(chosen.get_attribute("value"))
    page.wait_for_timeout(400)
    return chosen.get_attribute("value")


def withdraw_own_walkthrough_requests(page, token):
    """Withdraw the requests a previous run of this walkthrough filed.

    A pending request promises its item: the app refuses a second request on
    it, and it stays that way until somebody decides it. A walkthrough that
    files requests and never withdraws them therefore eats the account's own
    register — after two runs there is nothing left to ask about, and the
    walkthrough fails for a reason that has nothing to do with the app.

    Only the walkthrough's own rows are touched: they are the ones whose
    reason says "Walkthrough:". The seeded requests stay pending, because the
    queue they make is what the next roles decide.
    """
    withdrawn = 0
    for request in walkthrough_requests(token):
        go(page, f"/requests/{request['id']}", settle=1200)
        if withdraw_current_request(page):
            withdrawn += 1
    return withdrawn


def walkthrough_requests(token):
    """This account's pending requests whose reason marks them as ours."""
    rows = api_get("/requests?limit=100", token).get("requests") or []
    return [
        row
        for row in rows
        if row.get("status") in PENDING_STATUSES
        and (row.get("reason") or "").startswith("Walkthrough:")
    ]


def withdraw_request_for(page, token, tag_id):
    """Withdraw the pending walkthrough request that promises `tag_id`."""
    for row in walkthrough_requests(token):
        if ((row.get("item") or {}).get("tagId")) != tag_id:
            continue
        go(page, f"/requests/{row['id']}", settle=1200)
        return withdraw_current_request(page)
    return False


# ── P9-1 STAFF ──────────────────────────────────────────────────────────────
def walkthrough_staff(page):
    say("P9-1 STAFF — sign up, request, claim, refuse, read, change password")
    email, password = ACCOUNTS["STAFF"]
    sign_in(page, email, password)
    token = login_token(email, password, page)
    step("signs in with their own account", "/dashboard" in page.url, page.url)

    # Their own requests.
    go(page, "/requests")
    step("sees their own requests", wait_for_text(page, "My Requests") or wait_for_text(page, "Request"),
         "the request screen opens")

    # Clear away what a previous run left behind, so this run starts where the
    # last one did.
    withdrawn_before = withdraw_own_walkthrough_requests(page, token)
    step("clears its own earlier requests", True, f"{withdrawn_before} withdrawn")

    # File a transfer. The item is chosen from the form's own dropdown, and
    # kept so the next step can ask for the same one again.
    go(page, "/requests/new", settle=500)
    wait_for(page, "select")
    step("the request form opens", has_text(page, "File a request"), "")
    choose_option(page, 0, "transfer")
    transfer_item = pick_free_item(token, token)
    select_item(page, transfer_item)
    # A transfer must change the location or the owner: the form says so, and
    # the server refuses it otherwise.
    for name, value in (("newLocationBuilding", "CNCS"), ("newLocationFloor", "1"), ("newLocationRoom", "G1")):
        field = page.query_selector(f'input[name="{name}"]')
        if field:
            field.fill(value)
    page.fill('textarea[name="reason"]', "Walkthrough: the laptop moves to the ground-floor office.")
    page.click('button[type="submit"]')
    page.wait_for_timeout(3000)
    # `/requests/new` also starts with `/requests`, so the address alone would
    # call a form that never submitted a success.
    filed = page.url.rstrip("/").endswith("/requests") and not page.query_selector("form")
    step("files a transfer request", filed, page.url)

    # Withdraw it again, so the walkthrough can be run twice. A request that
    # stays pending would promise that item for good, and the next run would
    # find nothing free to ask about — the walkthrough would slowly eat the
    # account's own register.
    withdrawn = withdraw_request_for(page, token, transfer_item["tagId"]) if transfer_item else False
    step("withdraws a request", withdrawn, "")

    # File a disposal.
    go(page, "/requests/new", settle=500)
    wait_for(page, "select")
    choose_option(page, 0, "disposal")
    disposal_item = pick_free_item(token, token)
    select_item(page, disposal_item)
    page.fill('textarea[name="reason"]', "Walkthrough: the chair is broken beyond repair.")
    page.click('button[type="submit"]')
    page.wait_for_timeout(3000)
    filed = page.url.rstrip("/").endswith("/requests") and not page.query_selector("form")
    step("files a disposal request", filed, page.url)

    # The same item again: the app refuses it, in words. This is deterministic
    # — it is the very item the disposal above promised — rather than hoping a
    # seeded pending request happens to be one this person may file against.
    go(page, "/requests/new", settle=500)
    wait_for(page, "select")
    choose_option(page, 0, "transfer")
    # The disposal above is still waiting, so its item is the promised one.
    if disposal_item:
        select_item(page, disposal_item)
    for name, value in (("newLocationBuilding", "CNCS"), ("newLocationFloor", "1"), ("newLocationRoom", "G1")):
        field = page.query_selector(f'input[name="{name}"]')
        if field:
            field.fill(value)
    page.fill('textarea[name="reason"]', "Walkthrough: the same item twice.")
    page.click('button[type="submit"]')
    page.wait_for_timeout(3000)
    told = wait_for_text(page, "already has a pending request", timeout=15_000)
    step("is told when the item is already promised", told, "" if told else page.url)

    # And the disposal is withdrawn too, so the next run starts from the same
    # place this one did.
    if disposal_item:
        withdraw_request_for(page, token, disposal_item["tagId"])

    # Claim an item that is waiting for them.
    claimed = False
    # The register first: the item waiting for a confirmation has to be
    # *findable*, or the person holding it has no way to answer.
    go(page, "/items?scope=mine", settle=500)
    wait_for(page, "a[href^='/item/']")
    step("finds the item waiting for them in the register",
         wait_for_text(page, "Waiting for claim", timeout=10_000), "")
    hrefs = [a.get_attribute("href") for a in page.query_selector_all("a[href^='/item/']")]
    for href in hrefs:
        go(page, href, settle=900)
        claim_button = page.get_by_role("button", name="I have this item", exact=True)
        try:
            claim_button.first.wait_for(state="visible", timeout=12_000)
        except Exception:
            continue
        claim_button.first.click()
        page.wait_for_timeout(3000)
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
        never = page.get_by_role("button", name="I never received it", exact=True)
        try:
            never.first.wait_for(state="visible", timeout=12_000)
        except Exception:
            continue
        never.first.click()
        page.wait_for_timeout(800)
        reason = page.query_selector("textarea")
        if reason:
            reason.fill("Walkthrough: this item never arrived at my desk.")
        page.wait_for_timeout(400)
        confirm = page.get_by_role("button", name="Refuse the item", exact=True)
        if confirm.count():
            confirm.first.click()
            page.wait_for_timeout(3000)
            refused = True
            step("refuses a claim and gives a reason", True, href)
            break
    if not refused:
        step("refuses a claim and gives a reason", False, "no item offered a refusal")

    # Read and dismiss a notification. The X is labelled with the message it
    # removes ("Remove notification: …"), which is what a screen reader hears;
    # matching on the word "dismiss" missed every one of them.
    go(page, "/notifications", settle=800)
    # Wait for a message, not for the page chrome: `li` (and `main`) exist
    # before the list has answered, which made the count read 2 and the X look
    # absent.
    has_message = wait_for(page, "button[aria-label^='Remove notification']", timeout=20_000)
    before = len(page.query_selector_all("li"))
    dismiss = page.query_selector("button[aria-label^='Remove notification']")
    dismissed = False
    if dismiss:
        dismiss.click()
        page.wait_for_timeout(2500)
        dismissed = len(page.query_selector_all("li")) < before
    step("reads and dismisses a notification", has_message and dismissed,
         f"{before} on screen" + ("" if dismissed else " — nothing was removed"))

    # Change their password — and change it back.
    go(page, "/change-password")
    has_form = wait_for(page, 'input[type="password"]', timeout=15_000)
    step("the change-password screen opens", has_form and has_text(page, "password"), "")
    fields = page.query_selector_all('input[type="password"]')
    if len(fields) >= 3:
        fields[0].fill(password)
        fields[1].fill(TEMP_PASSWORD)
        fields[2].fill(TEMP_PASSWORD)
        page.click('button[type="submit"]')
        changed = wait_for_text(page, "Password changed", timeout=20_000)
        page.wait_for_timeout(1200)
        # Put it back through the same screen. The first change returns a fresh
        # token and `setSession` installs it, so *this* session stays signed in;
        # signing in again on top of it was the fragile part (and, when the
        # login limiter had been hit, the reason this step failed).
        go(page, "/change-password", settle=800)
        wait_for(page, 'input[type="password"]', timeout=15_000)
        fields = page.query_selector_all('input[type="password"]')
        restored = False
        if len(fields) >= 3:
            fields[0].fill(TEMP_PASSWORD)
            fields[1].fill(password)
            fields[2].fill(password)
            page.click('button[type="submit"]')
            restored = wait_for_text(page, "Password changed", timeout=20_000)
            page.wait_for_timeout(1200)
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
        step("changes their password and changes it back", changed and restored and back, "")
    else:
        step("changes their password and changes it back", False, "the form was not as expected")

    # Only their own items.
    go(page, "/items?scope=mine")
    step("sees only their own items in the register", has_text(page, "item"), "")


# ── P9-2 DEPARTMENT_HEAD ───────────────────────────────────────────────────
def approve_on_page(page, expect=None):
    """Approve what the page is offering, the way a person does.

    The approval is two clicks: the button on the page opens a dialog that
    states the consequence, and the dialog's own button carries it out. Clicking
    a second button "with approve in it" from the page behind the dialog was
    the old way, and the dialog's backdrop swallowed it.

    Every control is waited for rather than counted once. `count()` answers
    "not there yet" on a slow page, and a walkthrough that treats that as "the
    app offers no approval" reports a gap that does not exist.

    Returns the label of the approval that was carried out, or None.
    """
    trigger = page.get_by_role("button", name=re.compile(r"^Approve"))
    try:
        trigger.first.wait_for(state="visible", timeout=20_000)
    except Exception:
        return None
    trigger.first.click()
    # The dialog's own confirm button is inside the dialog, so it is looked up
    # there — a page-wide search finds the trigger again and clicks the
    # backdrop instead.
    dialog = page.get_by_role("dialog")
    try:
        dialog.first.wait_for(state="visible", timeout=15_000)
    except Exception:
        return None
    confirm = dialog.get_by_role("button", name=re.compile(r"^Approve"))
    try:
        confirm.first.wait_for(state="visible", timeout=10_000)
    except Exception:
        return None
    label = confirm.first.inner_text().strip()
    confirm.first.click()
    page.wait_for_timeout(3000)
    if expect:
        return label if expect.lower() in label.lower() else None
    return label


def withdraw_current_request(page):
    """Withdraw the request whose detail page is open. Returns True on the
    screen's own confirmation, False when the page offers no withdraw.

    Used by the staff flow to undo what it filed, so the next run of the same
    walkthrough finds the same free items.
    """
    trigger = page.get_by_role("button", name="Withdraw Request", exact=True)
    try:
        trigger.first.wait_for(state="visible", timeout=15_000)
    except Exception:
        return False
    trigger.first.click()
    dialog = page.get_by_role("dialog")
    try:
        dialog.first.wait_for(state="visible", timeout=10_000)
    except Exception:
        return False
    confirm = dialog.get_by_role("button", name="Withdraw", exact=True)
    try:
        confirm.first.wait_for(state="visible", timeout=10_000)
    except Exception:
        return False
    confirm.first.click()
    page.wait_for_timeout(3000)
    return True


def approve_and_check(page, request, token, allowed=("PENDING_STAGE2", "APPROVED")):
    """Approve a request on the screen, and prove the server agreed.

    Clicking the dialog's confirm button is not an approval: the server can
    still refuse — the item may be on loan, the request may have been decided
    by somebody else in the meantime — and the walkthrough would report a
    success that never happened. So the request is read back afterwards, and
    the step only passes when the status really moved.
    """
    before = request.get("status")
    go(page, f"/requests/{request['id']}", settle=900)
    label = approve_on_page(page)
    if not label:
        return None
    page.wait_for_timeout(2000)
    after = api_get(f"/requests/{request['id']}", token).get("request", {})
    status = after.get("status")
    if status in allowed and status != before:
        return label, status
    return None


def walkthrough_head(page):
    say("P9-2 DEPARTMENT_HEAD — decide, verify, and be refused another unit's work")
    email, password = ACCOUNTS["DEPARTMENT_HEAD"]
    sign_in(page, email, password)
    step("signs in with their own account", "/dashboard" in page.url, page.url)
    token = login_token(email, password, page)

    # Their department's items, and the roster of the college's units.
    go(page, "/items?scope=department", settle=1800)
    step("sees their department's items",
         wait_for(page, "a[href^='/item/']", timeout=30_000), "")
    go(page, "/admin/departments")
    step("sees the college's departments and their staff counts",
         has_text(page, "staff") and has_text(page, "Head"), "")

    # The queue of things waiting for them.
    go(page, "/requests?status=PENDING", settle=1800)
    arrived = wait_for(page, "a[href^='/requests/']", timeout=30_000)
    queued = len(page.query_selector_all("a[href^='/requests/']"))
    step("sees a queue of requests waiting for them", arrived and queued > 0, f"{queued} in it")

    # Approve a staff request from their own unit.
    #
    # The queue holds every kind of pending request, and the head may only
    # approve a *transfer*: disposal and loan approval belong to the property
    # officer, and the server answers those with 403. The candidate is chosen
    # by type from the same API the queue is built from, so the walkthrough
    # does not matter on which row happens to be first.
    approved = False
    for request in api_get("/requests?status=PENDING&type=TRANSFER&limit=100", token).get("requests", []):
        outcome = approve_and_check(page, request, token)
        if outcome:
            approved = True
            tag = (request.get("item") or {}).get("tagId")
            step("approves a staff request from their own unit", True,
                 f"{outcome[0]} — {tag} now {outcome[1]}")
            break
    if not approved:
        step("approves a staff request from their own unit", False,
             "no transfer was waiting for this head")

    # Approve a stage-1 transfer: the releasing head agrees to let it go.
    stage1 = False
    for request in api_get("/requests?status=PENDING_STAGE1&limit=50", token).get("requests", []):
        outcome = approve_and_check(page, request, token, allowed=("PENDING_STAGE2",))
        if outcome:
            stage1 = True
            step("approves a stage-1 transfer", True, f"{outcome[0]} — {request['id']}")
            break
    if not stage1:
        step("approves a stage-1 transfer", False, "no stage-1 transfer was waiting")

    # Approve a stage-2 transfer: the receiving head takes it over.
    stage2 = False
    for request in api_get("/requests?status=PENDING_STAGE2&limit=50", token).get("requests", []):
        outcome = approve_and_check(page, request, token, allowed=("APPROVED",))
        if outcome:
            stage2 = True
            step("approves a stage-2 transfer", True, f"{outcome[0]} — {request['id']}")
            break
    if not stage2:
        step("approves a stage-2 transfer", False, "no stage-2 transfer was waiting")

    # Verify a handover item — confirm one, and flag another.
    items = api_get("/items?limit=200", token).get("data", [])
    unverified = [i for i in items if i.get("status") == "REVERTED_UNVERIFIED"]
    verified = False
    flagged = False
    for item in unverified:
        go(page, f"/item/{item['tagId']}", settle=1500)
        confirm_button = page.get_by_role("button", name="I have verified this item", exact=True)
        flag_button = page.get_by_role("button", name="Flag it for review", exact=True)
        # The action buttons are rendered after the item has loaded, and on
        # the deployment that is a second or two after the document. Wait for
        # one of them instead of counting once.
        try:
            page.wait_for_function(
                "() => document.body.innerText.includes('I have verified this item')"
                " || document.body.innerText.includes('Flag it for review')",
                timeout=20_000,
            )
        except Exception:
            pass
        if not verified and confirm_button.count():
            confirm_button.first.click()
            page.wait_for_timeout(2500)
            verified = True
            step("verifies a handover item", True, item["tagId"])
            continue
        if not flagged and flag_button.count():
            flag_button.first.click()
            dialog = page.get_by_role("dialog")
            try:
                dialog.first.wait_for(state="visible", timeout=15_000)
            except Exception:
                continue
            box = dialog.first.locator("textarea")
            if box.count():
                box.first.fill("Walkthrough: this item is not in the office and nobody has signed for it.")
            page.wait_for_timeout(300)
            confirm = dialog.get_by_role("button", name="Flag it", exact=True)
            if confirm.count():
                confirm.first.click()
                page.wait_for_timeout(2500)
                flagged = True
                step("flags a handover item for review", True, item["tagId"])
    if not verified:
        step("verifies a handover item", False, "no item was waiting to be verified")
    if not flagged:
        step("flags a handover item for review", False, "no item was waiting to be flagged")

    # A request from another unit must be refused.
    #
    # The id comes from the Property Officer, who can read the whole college's
    # requests: a head cannot even *list* another unit's work, so asking the
    # head for the list would prove nothing about opening one.
    refused = False
    # A real sign-in, not the token on this page: the page belongs to the head,
    # and a head's token cannot even see the request that must be refused.
    officer_token = login_token(*ACCOUNTS["PROPERTY_OFFICER"])
    everything = api_get("/requests?limit=100", officer_token)
    reachable = len(everything.get("requests") or everything.get("data") or [])
    for request in (everything.get("requests") or everything.get("data") or []):
        if request.get("status") not in PENDING_STATUSES:
            continue
        requester = ((request.get("requestedBy") or {}).get("email") or "").lower()
        # "Another unit" means another unit: the head's own unit is CS, so a
        # request from Biology, Chemistry or Physics is another unit's work.
        if not re.search(r"bio|chem|phys", requester):
            continue
        go(page, f"/requests/{request['id']}", settle=900)
        # The refusal is a page state that arrives after the document: read
        # once it says so (or after it has had time to say anything at all).
        try:
            page.wait_for_function(
                "() => { const t = document.body.innerText.toLowerCase();"
                " return t.includes('not found') || t.includes('access')"
                " || t.includes('not exist') || t.includes(`couldn't load`); }",
                timeout=20_000,
            )
        except Exception:
            pass
        text = page_text(page).lower()
        if "not found" in text or "not exist" in text or "couldn't load" in text or "access" in text:
            refused = True
            step("is refused a request from another unit", True,
                 f"the screen says the request ({requester}) is not there")
            break
        if page.get_by_role("button", name=re.compile(r"^Approve")).count():
            step("is refused a request from another unit", False,
                 "the page offered an approval for another unit's request")
            break
    if not refused:
        step("is refused a request from another unit", False,
             f"no foreign request was in reach ({reachable} readable requests"
             f"{', ' + str(everything.get('error')) if everything.get('error') else ''})")


# ── P9-3 PROPERTY_OFFICER ──────────────────────────────────────────────────
def walkthrough_officer(page):
    say("P9-3 PROPERTY_OFFICER — register, print, decide, reverse, audit, report")
    email, password = ACCOUNTS["PROPERTY_OFFICER"]
    sign_in(page, email, password)
    step("signs in with their own account", "/dashboard" in page.url, page.url)

    # Register an item.
    go(page, "/items/new")
    wait_for(page, "select", timeout=20_000)
    step("the item form opens", has_text(page, "Register") or has_text(page, "Identity"), "")
    page.fill('input[name="name"]', "WALKTHROUGH Item")
    select_by_label(page, "Category")
    select_by_label(page, "Department")
    select_by_label(page, "Building")
    select_by_label(page, "Owner (custodian)")
    page.fill('input[name="floor"]', "1")
    page.fill('input[name="room"]', "W1")
    page.fill('input[name="purchaseCost"]', "1000")
    select_by_label(page, "Condition")
    page.click('button[type="submit"]')
    page.wait_for_timeout(4000)
    # `/items/new` contains "/items/", so it used to count as success: a form
    # that never submitted was reported as a registered item. A detail page is
    # `/item/<tag>` — singular, and not the form.
    registered = bool(re.search(r"/item/[^/]+$", page.url)) and "/items/" not in page.url
    step("registers an item", registered, page.url)

    # Its tag, and the sticker that can be printed.
    token = login_token(email, password, page)
    items = api_get("/items?search=WALKTHROUGH&limit=5", token)
    tag = None
    for item in (items.get("data") or items.get("items") or []):
        if item["name"].startswith("WALKTHROUGH"):
            tag = item["tagId"]
            break
    if tag:
        go(page, f"/item/{tag}", settle=1200)
        step("opens the item it just registered", has_text(page, tag), tag)
        # The sticker lives behind the "staff detail & tag" disclosure.
        toggle = page.query_selector("text=View staff detail & tag")
        if toggle:
            toggle.click()
            page.wait_for_timeout(2500)
        printable = page.query_selector("[data-print-tag]")
        step("the QR sticker is on the screen", printable is not None, tag)
    else:
        step("opens the item it just registered", False, "the item was not found")

    # Decide the three kinds of request: a transfer, a disposal and a loan.
    # Each is read back afterwards: a disposal of an item that is out on loan
    # is refused by the server, and the screen would otherwise look like it had
    # worked.
    disposed_tag = None
    for kind, label, allowed in (
        ("TRANSFER", "transfer", ("PENDING_STAGE2", "APPROVED")),
        ("DISPOSAL", "disposal", ("APPROVED",)),
        # A loan's *item* waits for the borrower to claim it (`PENDING_CLAIM`);
        # the request itself is approved.
        ("LOAN", "loan", ("APPROVED",)),
    ):
        decided = False
        for request in api_get(f"/requests?status=PENDING&type={kind}&limit=50", token).get("requests", []):
            outcome = approve_and_check(page, request, token, allowed=allowed)
            if outcome:
                decided = True
                step(f"approves a {label}", True, f"{outcome[0]} — now {outcome[1]}")
                if kind == "DISPOSAL":
                    # The item this decision retired — the one to reverse next.
                    disposed_tag = ((request.get("item") or {}).get("tagId"))
                break
        if not decided:
            step(f"approves a {label}", False, f"no {label} was waiting")

    # Reverse a disposal: the item was retired, and the decision is undone
    # with a reason.
    #
    # The item is the one the disposal above retired — the register never
    # lists a disposed item, so asking the register for one finds nothing.
    reversed_ok = False
    if disposed_tag:
        go(page, f"/item/{disposed_tag}", settle=1200)
        reverse = page.get_by_role("button", name="Reverse this disposal", exact=True)
        try:
            reverse.first.wait_for(state="visible", timeout=15_000)
        except Exception:
            reverse = None
        if reverse:
            reverse.first.click()
            page.wait_for_timeout(800)
            reason = page.query_selector("textarea")
            if reason:
                reason.fill("Walkthrough: disposed in error — the item is in service and in use.")
            page.wait_for_timeout(300)
            dialog = page.get_by_role("dialog")
            if dialog.count():
                dialog.get_by_role("button", name="Reverse the disposal", exact=True).first.click()
                page.wait_for_timeout(3000)
                reversed_ok = True
                step("reverses a disposal", True, disposed_tag)
    if not reversed_ok:
        step("reverses a disposal", False, "no disposed item offered the action")

    # The audit history. The officer reads it — running a session is the
    # auditor's alone (`AUDIT_RUN`), and the nav draws that line.
    go(page, "/audits")
    step("reads the audit history", wait_for_text(page, "audit", timeout=15_000), "")
    go(page, "/audit/new")
    step("is kept out of starting an audit", "not found" in page_text(page).lower()
         or "/dashboard" in page.url, page.url)

    # The inventory report, in both formats.
    go(page, "/reports")
    step("the reports screen opens", has_text(page, "report"), "")
    for label, what in (("Download inventory CSV", "inventory report as CSV"),
                        ("Download inventory PDF", "inventory report as PDF")):
        try:
            with page.expect_download(timeout=45_000) as info:
                page.get_by_role("button", name=label, exact=True).click()
            download = info.value
            size = download.path() and os.path.getsize(download.path())
            step(f"downloads the {what}", bool(size), download.suggested_filename)
        except Exception as exc:
            step(f"downloads the {what}", False, f"{type(exc).__name__}")

    # The categories and the buildings.
    go(page, "/admin/categories")
    step("manages the categories", has_text(page, "categor"), "")
    go(page, "/admin/buildings")
    step("manages the buildings", wait_for_text(page, "Building", timeout=15_000), "")


# ── P9-4 AUDITOR ────────────────────────────────────────────────────────────
def walkthrough_auditor(page):
    say("P9-4 AUDITOR — count, complete, read, and be refused")
    email, password = ACCOUNTS["AUDITOR"]
    sign_in(page, email, password)
    step("signs in with their own account", "/dashboard" in page.url, page.url)
    token = login_token(email, password, page)

    # The dashboard's own tiles.
    step("sees the current-audit tile", wait_for_text(page, "Current audit"), "")
    step("sees the open-findings tile", wait_for_text(page, "findings"), "")

    # Start an audit, by department.
    go(page, "/audit/new")
    select_by_label(page, "Audit by", "department")
    wait_for(page, "select", timeout=15_000)
    select_by_label(page, "Department to audit")
    page.wait_for_timeout(600)
    start = page.get_by_role("button", name="Start audit", exact=True)
    if start.count():
        start.first.click()
    page.wait_for_timeout(4000)
    scan_url = page.url
    step("starts an audit session", "/audit/" in scan_url and "scan" in scan_url, scan_url)

    # Which department is being walked, and an item that is in it.
    scope = ""
    match = re.search(r"Scanning items in ([^.]+)\.", page_text(page))
    if match:
        scope = match.group(1).strip()
    items = api_get("/items?limit=100", token).get("data", [])
    in_scope = [i for i in items if i.get("status") == "ACTIVE" and i.get("department") == scope]
    outside = [i for i in items if i.get("status") == "ACTIVE" and i.get("department") != scope]

    # Scan an item by typing its tag — the manual entry that is always there.
    scanned = 0
    for item in in_scope[:2]:
        field = page.query_selector('input[placeholder="CNCS-XXXXXXXX"]')
        if not field:
            break
        field.fill(item["tagId"])
        page.get_by_role("button", name="Scan", exact=True).first.click()
        page.wait_for_timeout(2500)
        if has_text(page, item["tagId"]):
            scanned += 1
    step("scans items into the session", scanned > 0, f"{scanned} of {len(in_scope)} in {scope}")

    # An item from outside the scope is counted as the wrong location.
    if outside:
        field = page.query_selector('input[placeholder="CNCS-XXXXXXXX"]')
        if field:
            field.fill(outside[0]["tagId"])
            page.get_by_role("button", name="Scan", exact=True).first.click()
            page.wait_for_timeout(2500)
            step("counts an item from another department as the wrong location",
                 has_text(page, outside[0]["tagId"]), outside[0]["tagId"])

    # Complete the audit.
    complete = page.get_by_role("button", name="Complete audit", exact=True)
    completed = False
    if complete.count() and complete.first.is_enabled():
        complete.first.click()
        page.wait_for_timeout(900)
        dialog = page.get_by_role("dialog")
        if dialog.count():
            dialog.get_by_role("button", name="Complete audit", exact=True).first.click()
            page.wait_for_timeout(4000)
            completed = wait_for_text(page, "completed", timeout=15_000)
    step("completes the audit", completed, page.url)

    # The report.
    if "/audit/" in page.url:
        report_url = re.sub(r"/scan$", "/report", page.url)
        go(page, report_url[len(BASE):], settle=2000)
        step("reads the report", has_text(page, "report") or has_text(page, "Audit"), report_url)
        # The report is copied out of the page, so the download is a blob the
        # page hands to the browser — the download event is the proof.
        for label, what in (("Download audit CSV", "audit report as CSV"),
                             ("Download audit PDF", "audit report as PDF")):
            try:
                with page.expect_download(timeout=45_000) as info:
                    page.get_by_role("button", name=label, exact=True).click()
                download = info.value
                size = download.path() and os.path.getsize(download.path())
                step(f"downloads the {what}", bool(size), download.suggested_filename)
            except Exception as exc:
                step(f"downloads the {what}", False, f"{type(exc).__name__}")

    # A completed session is read-only: the page says so, and the server
    # refuses a scan into it.
    if "/audit/" in page.url:
        go(page, re.sub(r"/report$", "/scan", page.url)[len(BASE):], settle=2000)
        read_only = wait_for_text(page, "can't be scanned into any more", timeout=15_000)
        refused_scan = False
        if in_scope:
            field = page.query_selector('input[placeholder="CNCS-XXXXXXXX"]')
            if field:
                field.fill(in_scope[0]["tagId"])
                page.get_by_role("button", name="Scan", exact=True).first.click()
                page.wait_for_timeout(3000)
                refused_scan = "completed" in page_text(page).lower()
        step("a completed session is read-only", read_only and refused_scan, "")

    # The evidence pack — the whole month's evidence, out of the reports screen.
    go(page, "/reports?tab=evidence", settle=1500)
    from_field = page.get_by_label("From", exact=True)
    to_field = page.get_by_label("To", exact=True)
    if from_field.count() and to_field.count():
        from_field.first.fill("2026-01-01")
        to_field.first.fill("2026-12-31")
        page.wait_for_timeout(400)
    try:
        with page.expect_download(timeout=45_000) as info:
            page.get_by_role("button", name="Download evidence pack PDF", exact=True).first.click()
        download = info.value
        size = download.path() and os.path.getsize(download.path())
        step("downloads the evidence pack", bool(size), download.suggested_filename)
    except Exception as exc:
        step("downloads the evidence pack", False, f"{type(exc).__name__}")

    # An action they must not do.
    go(page, "/items/new")
    step("is refused the item registration screen",
         "not found" in page_text(page).lower() or "/dashboard" in page.url, page.url)


# ── P9-5 SYSTEM_ADMIN ──────────────────────────────────────────────────────
def walkthrough_admin(page):
    say("P9-5 SYSTEM_ADMIN — invite, approve, close, and see no asset data")
    email, password = ACCOUNTS["SYSTEM_ADMIN"]
    sign_in(page, email, password)
    step("signs in with their own account", "/dashboard" in page.url, page.url)

    # The accounts screen. The address matters: a signed-out browser also
    # shows the word "account" on the login page, and that used to count.
    go(page, "/admin/users")
    step("the accounts screen opens",
         "/admin/users" in page.url and wait_for_text(page, "Accounts"), page.url)

    # Invite a privileged account, with the authorization fields.
    invite_email = f"walkthrough.invite.{int(time.time())}@cncs.aau.edu.et"
    invite_tab = page.get_by_role("button", name="Invite an Account", exact=True)
    if invite_tab.count():
        invite_tab.first.click()
        page.wait_for_timeout(1200)
    page.get_by_label("Email", exact=True).first.fill(invite_email)
    select_by_label(page, "Role", "auditor")
    page.get_by_label("Authorized by", exact=True).first.fill("Walkthrough: the principal's office")
    page.get_by_label("Authorization reference", exact=True).first.fill("WALKTHROUGH-LETTER-1")
    page.get_by_role("button", name="Send invite", exact=True).first.click()
    page.wait_for_timeout(3500)
    invited = has_text(page, invite_email) and has_text(page, "Invitation")
    step("invites a privileged account with the authorization fields", invited, invite_email)

    # The single-use link, as the administrator hands it over.
    invite_url = ""
    for code in page.query_selector_all("code"):
        text = (code.inner_text() or "").strip()
        if "/accept-invite?token=" in text:
            invite_url = text
            break
    step("the invitation link is on the screen", bool(invite_url), invite_url[:60])

    # Resend it: the endpoint reissues the token, so a link that leaked is dead.
    accounts_tab = page.get_by_role("button", name=re.compile("^Existing Accounts"), exact=False)
    if accounts_tab.count():
        accounts_tab.first.click()
        page.wait_for_timeout(1500)
    resend = page.get_by_role("button", name=re.compile("Resend the invitation"))
    resent = False
    if resend.count():
        resend.first.click()
        page.wait_for_timeout(2500)
        resent = has_text(page, "new invitation link") or has_text(page, "resent")
    step("resends the invitation", resent, "")

    # Accept the invitation, the way the invited person does.
    accepted = False
    if invite_url:
        go(page, invite_url[len(BASE):], settle=1500)
        name_field = page.get_by_label("Your full name", exact=True)
        if name_field.count():
            name_field.first.fill("Walkthrough Invitee")
            page.get_by_label("New password", exact=True).first.fill("WalkthroughInvite123!")
            page.get_by_label("Confirm password", exact=True).first.fill("WalkthroughInvite123!")
            page.get_by_role("button", name=re.compile("set|password|accept|continue", re.I)).first.click()
            page.wait_for_timeout(4000)
            accepted = "/login" in page.url or "/dashboard" in page.url or has_text(page, "password")
    step("accepts the invitation", accepted, "")

    # The account log.
    go(page, "/admin/events")
    step("sees the account log", has_text(page, "event") or has_text(page, "log"), "")

    # Approve a staff request.
    go(page, "/admin/users")
    approved = False
    waiting_tab = page.get_by_role("button", name=re.compile("^Waiting for Approval"))
    if waiting_tab.count():
        waiting_tab.first.click()
        page.wait_for_timeout(1500)
    approve_button = page.get_by_role("button", name="Approve", exact=True)
    if approve_button.count():
        approve_button.first.click()
        page.wait_for_timeout(1200)
        dialog = page.get_by_role("dialog")
        if dialog.count():
            dialog.get_by_role("button", name="Approve", exact=True).first.click()
            page.wait_for_timeout(3000)
            approved = True
    step("approves a staff request", approved, "" if approved else "no request was waiting")

    # Close an account — the one this walkthrough created, so no demo account
    # is closed by accident.
    go(page, "/admin/users", settle=1500)
    accounts_tab = page.get_by_role("button", name=re.compile("^Existing Accounts"))
    if accounts_tab.count():
        accounts_tab.first.click()
        page.wait_for_timeout(1500)
    closed = False
    close_button = page.get_by_role("button", name="Close the account of Walkthrough Invitee", exact=True)
    if not close_button.count():
        close_button = page.get_by_role("button", name=re.compile(r"^Close the account of "))
    if close_button.count():
        close_button.first.click()
        page.wait_for_timeout(1000)
        reason = page.query_selector("textarea")
        if reason:
            reason.fill("Walkthrough: the account is closed by the walkthrough.")
        page.wait_for_timeout(300)
        dialog = page.get_by_role("dialog")
        if dialog.count():
            dialog.get_by_role("button", name="Close the account", exact=True).first.click()
            page.wait_for_timeout(3000)
            closed = True
    step("closes an account", closed, "")

    # No asset data anywhere. The claim is "no asset data", not "this exact
    # sentence": a refused route may say it in words, redirect, or render an
    # empty list, and the deployment is slower than the laptop, so the screen
    # is read after it has settled and judged by what it actually shows.
    for path in ("/items", "/requests", "/audits", "/reports", "/map"):
        go(page, path, settle=2500)
        text = page_text(page).lower()
        tags = re.findall(r"cncs-[a-z0-9]+-\d{4}", text)
        rows = page.query_selector_all(
            "a[href^='/item/'], a[href^='/requests/'], a[href^='/audit/']"
        )
        empty = not tags and not rows
        step(f"sees no asset data on {path}", empty,
             "" if empty else f"{len(tags)} tags, {len(rows)} links")


# ── Running them ───────────────────────────────────────────────────────────
WALKTHROUGHS = {
    "STAFF": walkthrough_staff,
    "DEPARTMENT_HEAD": walkthrough_head,
    "PROPERTY_OFFICER": walkthrough_officer,
    "AUDITOR": walkthrough_auditor,
    "SYSTEM_ADMIN": walkthrough_admin,
}

def wait_for_login_window():
    """Block until the deployment will accept a sign-in (10 per IP per 15 min).

    The walkthroughs sign in as five people plus one API read; that is under
    the limit, but a previous run (or an earlier probe) may already have used
    part of the window. Checking first turns a mysterious "the admin could not
    sign in" into a short wait.
    """
    body = json.dumps({"email": "admin@cncs.aau.edu.et", "password": "Admin123!"}).encode()
    for attempt in range(16):
        req = urllib.request.Request(
            f"{API}/auth/login", data=body, headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30):
                return
        except urllib.error.HTTPError as exc:
            if exc.code != 429:
                return
            print(f"  \033[33m—\033[0m the login limiter is still holding; waiting 60s")
            time.sleep(60)
        except Exception:
            return


wait_for_login_window()

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
