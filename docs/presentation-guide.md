# Presentation Guide — CNCS Property Management System

This is written so you can read it once and then talk about it in your own words.
No code words, no jargon. Part 3 is the demo: for every screen it tells you **where
to click**, **what will appear**, and **what to say**.

The live site: **https://cncs-pms-web.vercel.app/**

---

## 1. What this project is (say this at the start)

Addis Ababa University's CNCS campus keeps a register of its property — laptops,
desks, projectors, microscopes, lab equipment. The old system (built by MOFED about
8–9 years ago) can only register an item and count it. It cannot tell you where an
item is right now, cannot show who is responsible for it, and cannot record that
something was moved or thrown away.

**Our system does four things the old one can't:**

1. **Every item gets a QR sticker.** Stick it on the item. Anyone with a phone
   camera can open that item's page — no app to install, no account needed.
2. **Nothing moves silently.** Moving an item to another room or handing it to
   someone else becomes a *request* that an administrator must approve. You cannot
   just edit the room number and hope nobody notices.
3. **Every change is written down.** Who changed what, when, and from what to what.
   Nobody can quietly rewrite the past.
4. **Counting is done by scanning.** Someone walks the room with a phone, scans what
   they see, and the system tells them what's there, what's missing, and what was
   found in the wrong place — then prints a report.

**The one-sentence version:** *"Register an item, print its QR sticker, scan it in
the field, move it through an approval, audit the room, and export the report."*

**A simple everyday comparison, if you need one:** think of a library. The old
system is a card catalogue that only says "we own this book". Ours is a catalogue
with a barcode on every book that tells you which shelf it's on, who has it, and
refuses to let anyone move it without a signed slip.

---

## 2. Who can do what (plain words)

| Who | What they can do |
|---|---|
| **Anyone, no account** (a visitor, a cleaner, a student) | Search the register by name, scan a sticker, see the item's public page, browse by building |
| **Staff** (property office employee, signed in) | Register items, edit item details, bundle accessories together, file a "please move this" or "please scrap this" request, run audits, download reports, read their own messages |
| **Admin** (office manager, signed in) | Everything staff can do, plus approving or rejecting requests, managing user accounts and categories |

**Two logins to remember:**
- Staff: `staff@cncs.aau.edu.et` / `Staff123!`
- Admin: `admin@cncs.aau.edu.et` / `Admin123!`

---

## 3. THE LIVE DEMO — screen by screen

Do it in this order. The order itself tells a story: what the public sees → what
staff do → what only an admin can decide. Always finish with the approval and the
audit — those are the impressive parts.

There are three parts:
- **Part A — the public pages (no login).** Use a **private/incognito window**.
- **Part B — staff pages.** Sign in as the staff account.
- **Part C — admin pages.** Sign in as the admin account.

**How to read each block below**
- **Go there** → how you reach the screen (sidebar name or the address).
- **Do this** → the exact clicks, in order.
- **You'll see** → what appears on screen, so you know it worked.
- **Say this** → a sentence you can read out loud.
- **Example** → the everyday comparison if someone looks lost.
- **If asked** → the deeper answer, only if someone asks.

### Before you start (2 minutes)

1. Reset the demo data so the requests are waiting again:
   ```bash
   cd backend && pnpm prisma:seed
   ```
2. Open the site in a **normal window** (for the signed-in parts) and a **private
   window** (for the public parts). Keep both open side by side.
3. The QR camera only works on a secure page. Use the live **https** site, or
   `localhost`. It will not work on a plain `http://` office network address — for
   that, type the tag ID instead (the manual entry box is on the same page).

---

## PART A — What the public sees (no account at all)

Everything in Part A happens in the **private/incognito window**. Nobody is signed
in. This is the part that matters most, because it's what a stranger with a phone
sees.

### A1. The home page — "Find a campus asset"

**Go there:** the site address itself (`/`).

**Do this:**
1. Point out the big **Scan a tag** button at the top.
2. In the search box, type `laptop` and press Enter — the browser moves you to the
   list of results.
3. Go back to the home page, then type the tag ID `CNCS-DEMO-0001` in the same box
   and press Enter.

**You'll see:** a list of matching items, each as a small card with a photo, the
item name, its tag ID and its condition. On the home page itself there's also a
"Recently added" row of items.

**Say this:** *"This is the front door, and this is all a visitor gets: search, or
scan. There's no training needed — you already know how to search and how to point
a camera."*

**Example:** *"It's like the library catalogue on a screen — except ours also puts a
barcode on the shelf."*

**If asked:** the search box only ever returns items that are still in service. Items
that have been scrapped do not appear here at all — that's a rule kept on the server,
not a checkbox someone could flip.

### A2. Browse all items

**Go there:** from the home page, click the **Browse all items** button (or the
sidebar "Items" once you're signed in).

**Do this:**
1. Type `laptop` in the search box.
2. Open the **Department** dropdown and pick a department.
3. Notice the address bar changes with your choice.
4. Press the browser **Back** button — your previous filter comes back.
5. Click **Clear**.

**You'll see:** a grid of item cards, with a page number control at the bottom.

**Say this:** *"Filters are kept in the address, which means a filtered list is a
link you can send to a colleague — they open it and see exactly what you saw.
There is deliberately no 'show scrapped items' option: scrapped things never show up
in this list, whatever you type in the address."*

**Example:** *"It's the difference between a shopping website that remembers your
filter, and one that keeps resetting every time you glance away."*

### A3. The Scan page — the flagship feature

**Go there:** click the **Scan a tag** button on the home page (or the sidebar
"Scan").

**Do this:**
1. If you're on the live https site on a phone or laptop with a camera, hold a
   printed sticker up to it.
2. Otherwise — and this is fine to do on stage — scroll to the **Tag ID** box,
   type `CNCS-DEMO-0001` and click **Go** (next to the box).

**You'll see:** a live camera view at the top, and underneath it the manual box. The
moment the tag is read, you land on the item's page.

**Say this:** *"One sticker per item. Any phone camera opens the item's page. No app
to install, no account, no training — and if the camera won't focus, you can just
type the number, which is the same six seconds of work."*

**Example:** *"It's the same idea as a parcel tracking number: the sticker is the
address, and the item's page is what's behind the door."*

**If asked:** scanning and typing lead to exactly the same place. Two ways in, one
destination — so there's nothing to keep in step.

### A4. The item page — what the sticker opens ⭐ (the most important screen)

**Go there:** scanning or typing a tag lands you here (`/item/<tag ID>`).

**Do this:**
1. Scroll through the page slowly. Point at each section: photo, name, condition,
   Department, Building, Floor, Room, and the "Registered" date at the bottom.
2. Then say out loud what is **missing**: no price, no current value, no owner's
   name, no brand, no model, no serial number, no notes, no list of accessories.
3. Now open the *same* page in the signed-in window (from Part B, or sign in quickly)
   and refresh it — everything you just named is there.

**Say this:** *"This is the whole security story in one screen. Those missing fields
aren't greyed out or hidden behind a message — they are simply not sent to a
visitor's browser. So you cannot get them by editing the address bar, because they
were never on your computer in the first place."*

**Example:** *"It's the difference between a hotel locking a door and a hotel not
having built the room."*

**If asked:** the server decides which fields exist for each viewer, once, in one
place. The screens just draw whatever they were given. That's why no screen can
accidentally leak a price to the public.

**Important detail to mention if you can:** the sticker's address uses the singular
word `item`. That address is printed on every sticker in the building, so it must
never change — that's why it's kept separate from the staff's own item pages.

### A5. Browse by building

**Go there:** from the home page, click **Browse by building** (or `/map`).

**Do this:** scroll down; click any item listed under a building.

**You'll see:** items grouped by the building they're recorded in.

**Say this (honestly — this earns credit):** *"This is not a floor plan. We don't
store coordinates anywhere, so drawing a real map would be inventing information.
It answers the question people actually ask — 'what's in Building 3?' — using the
location we do store."*

**Example:** *"It's a list of what's in each building, like a school noticeboard,
not a map of the corridors."*

### A6. A wrong address

**Go there:** type any nonsense address, e.g. `/this-page-does-not-exist`.

**You'll see:** a designed "page not found" screen with the site's header and footer
— not a blank white page, not a computer error message.

**Say this:** *"Even when you get lost, it still looks like the university's
website. We'd rather show a proper page than let a raw error out."*

### A7. Staff sign-in

**Go there:** `/login` (or the "Sign in" link in the header).

**Do this:**
1. Point out there is **no "create account" button** anywhere.
2. Sign in as staff: `staff@cncs.aau.edu.et` / `Staff123!`.

**Say this:** *"Nobody can give themselves an account. Accounts are created by the
office administrator — the same way a new employee gets a door key from the office,
not from the door."*

**If asked:** email addresses are not case-sensitive, so `Staff@...` works too.

---

## PART B — Staff (signed in)

You are now in the **normal window**, signed in as staff. Notice the **left-hand
menu** — this is how you move around for the rest of the demo. It lists: Dashboard,
Scan, Items, Requests, Notifications, New item, Audit, Audit history, Reports.

### B1. The dashboard — the "what needs me now" screen

**Go there:** signing in lands you here (or click **Dashboard** in the menu).

**Do this:** point at the top-right tile that shows a number, then the two big tiles
(Scan a tag / Browse items), then the list underneath.

**You'll see:** a count of things waiting for you, two shortcuts, and a short list of
recent requests.

**Say this:** *"Staff see the requests they filed. If I sign in as an administrator
in a moment, the same screen says 'Needs your review' instead — because the list
behind it is different for each role. The system decides that, not the screen."*

### B2. Register a new item

**Go there:** click **New item** in the left menu (or the "New item" shortcut).

**Do this:**
1. Fill in: Name `Demo Projector`, Category (pick one), Department (pick one).
2. Fill in Building, Floor, Room.
3. Point at the **Owner (custodian)** dropdown. As staff, you only see yourself; say
   that an admin sees the whole staff list here.
4. Put a purchase cost, e.g. `45000`, pick a condition.
5. For the photo, click **Photo source** and show the three options: take a picture,
   choose a file, or paste a link.
6. Click the **Register item** button at the bottom.

**You'll see:** the new item's page, with a **tag ID that the system generated for
you** (CNCS- plus eight characters) and a QR picture ready for printing.

**Say this:** *"Nobody types a tag number, so nobody can duplicate one or invent a
collision. The number and the picture are made by the system the moment you save."*

**Say this about the owner field:** *"This is the one moment the responsible person
is decided. After this, you cannot just change it — you have to file a transfer,
which is the next part of the demo."*

**Example:** *"It's like writing a name on a library card. You get it right when you
create the card, because changing it later needs a signature."*

**If asked about the photo:** *"You can take the picture on the spot. It uploads as
soon as you choose it so you can see it, but nothing is kept unless you press
Register item — so if you change your mind and leave, nothing was registered."*
(This was one of the features the team asked for.)

### B3. An item's staff view — sticker, accessories, history

**Go there:** open any item from the Items list, or stay on the item you just
created.

**Do this:**
1. Click the button **View staff detail & tag**.
2. Point at the QR picture — that's the **Printable tag**. Show **Download PNG** and
   **Print sticker**.
3. Point at the **accessories** area and click **Link an accessory**; search for
   another item and link it.
4. Scroll to **Edit history** and show the rows.

**You'll see:** the printable sticker, a list of accessories, and a history list
where each changed field is its own line with a date.

**Say this about the sticker:** *"This is the sticker. Download it, print it, stick
it on the machine. If a sticker is lost or damaged we can re-print it — and the
number stays the same, because a new number would orphan the old sticker and split
the item's story in two."*

**Say this about accessories:** *"A laptop and its charger are separate records, but
we can tie them together. That matters in a minute, when the laptop moves — watch
what happens to the charger."*

**Say this about the history:** *"Every single change is a line here: what changed,
from what, to what, by whom, and when. It's not one line saying 'item edited' — it's
one line per field, so you can ask 'when was this room last changed?' and get a
straight answer."*

**Example:** *"It's a bank statement, not a receipt. You can see every movement, not
just the final balance."*

### B4. Edit an item — and the important refusal

**Go there:** on the item's page click **Edit item** (or `/items/<id>/edit`).

**Do this:**
1. Change the **Name** or **Notes**. Notice that's allowed. (The button at the
   bottom that saves it is **Save changes**.)
2. Now try to change **Building**, **Floor**, **Room** or **Owner**. They're greyed
   out and can't be typed into — there's a small note pointing you at the request
   flow.
3. Sign in as the admin later and come back here — same thing: even an administrator
   cannot type over them.

**Say this:** *"This is the rule that stops the mess the old system had. You can fix
a typo in the description, but you cannot quietly move an item to another room or
give it to yourself. Moving it goes through the request-and-approve flow — that's
the next screen."*

**Say this if someone pushes back:** *"We allow editing details of items you didn't
register, on purpose. Registering something and being responsible for it are two
different things. What is locked down is where the item is and whose it is."*

**Example:** *"Anyone in the office can correct a spelling mistake on a form. Nobody
can scribble over the address without the manager's signature."*

**If asked about an item that has been scrapped:** those open read-only, because
"scrapped" is a final decision.

### B5. File a transfer or a disposal request

**Go there:** on the item's page click **File transfer / disposal**.

**Do this:**
1. For **Request type**, choose Transfer.
2. The **Item** is already filled in — mention that the form arrived pre-filled
   because you started it from the item itself.
3. Set a new Building / Floor / Room, or a new owner.
4. Write a reason, e.g. *"Moving to the new lab on the first floor."*
5. Click **Submit request**.

**You'll see:** the request listed. Its status is **Pending**.

**Say this:** *"This is how anything moves now. I fill in a short form and explain
why. Nothing has changed yet — the item is still where it was. Someone has to say
yes."*

**Say this detail if you have time:** *"The moment I submit, every administrator is
told about it, in the same instant the request is saved. It is impossible for a
request to exist that nobody was told about."*

**Example:** *"It's a maintenance slip: you fill it in, the manager signs it, then
the work happens."*

### B6. The requests list — what you filed vs the queue

**Go there:** click **Requests** in the left menu.

**Do this:**
1. Point out the **Status** filter; pick Pending.
2. Say the seeded transfer is already waiting there, so the list is never empty.

**Say this:** *"As staff I see only my own filings here. When I sign in as the
administrator in a minute, this same screen becomes the office's queue — everyone's
requests. The system decides which rows I'm allowed to see; the screen doesn't
choose."*

### B7. The inbox

**Go there:** click **Notifications** in the left menu.

**Do this:**
1. Show the unread count next to the bell in the left menu.
2. Click a message — it marks as read and, if it's about a request, opens it.
3. Show the **X** on a card (removes that one message).
4. Show **Mark all as read** (clears the count, keeps the messages).
5. Show **Clear all** — and note it asks for confirmation first.

**Say this:** *"Three ways to tidy up, and only one of them asks permission — the
one that actually deletes. The others don't ask because they don't destroy anything."*

**Say this if you want the reasoning:** *"A message is just a copy of something that
already happened — the request, the change, the audit result are all still there.
That's why an inbox can be emptied while the rest of the record is never touched."*

**Example:** *"It's a noticeboard: taking a note off your own board doesn't delete
the event it was telling you about."*

### B8. Run a physical audit

**Go there:** click **Audit** in the left menu (starts a new one).

**Do this:**
1. Read the three short lines on screen: Found, Missing, Outside scope — the system
   explains its own rules before you start.
2. In the **Audit by** dropdown choose Department (then pick one from the locked
   list), or choose Building and type one — the building box suggests buildings that
   already exist in the register.
3. Click **Start audit**, then scan (or type) the tag numbers of the items you can see.
4. Deliberately scan one item that isn't in the chosen area — say "watch what happens
   to this one".
5. Click **Complete audit** (it asks you to confirm first — the confirmation says
   what finishing means).

**You'll see:** a running list of what you scanned, and a clear message when
something can't be read — an unknown sticker or a scrapped one reads as a **failed
scan**, with the number shown back to you. Then the report.

**Say this:** *"Found is something in this area that I scanned. Missing is something
that should be here and I didn't see. Outside scope is something I scanned that
doesn't belong here — maybe it was moved without telling anyone. That third one is
how you catch a problem."*

**Say this about honesty in the design:** *"The phone is not allowed to decide its
own result. It reports 'I scanned this item' and the system decides what that means
when the audit closes. Otherwise someone could mark their own homework."*

**Example:** *"It's taking attendance: the phone says who was present. It doesn't get
to say who passed."*

### B9. The audit report and history

**Go there:** the report appears when you finish; **Audit history** in the menu lists
past ones.

**Do this:**
1. Point at the three summary counts, colour-coded green / amber / red.
2. Scroll to the rows behind them — every item listed with tag, name, department,
   building, floor, room.
3. Show the two download buttons: **Download audit PDF** and **Download audit CSV**.
4. Go to **Audit history** and open a past audit to prove it was kept.

**Say this:** *"These rows are the answer to 'give me the detail'. Someone asked
exactly that in our review — the information was always there, it just wasn't being
shown. Green is found, amber is missing, red is found in the wrong place."*

**Say this about history:** *"Audits used to disappear when you closed the page.
Now every audit is kept, with a date and who ran it, and you can open any of them
again months later."*

### B10. Reports — the files you hand in

**Go there:** click **Reports** in the left menu.

**Do this:**
1. Show the three cards: **Inventory**, **Disposals**, and **Audit session**.
2. On the Inventory card, filter by department, then click **Download inventory
   CSV**, then **Download inventory PDF**.
3. Open one of the downloaded files to show it's real.
4. Point at the Disposals card and say it's still empty — you're about to create one
   in the next part. Come back after C2 to show a row in it if you have time.

**Say this:** *"Three reports, each as a spreadsheet or a printable PDF. Same
numbers in both files because both are made from the same table — so they can't
disagree with each other."*

**Say this about the least obvious one:** *"The scrapped-items report is built from
the approval records — who asked, who approved, and why — not from the item's current
state. That's why it still lists a disposal even after the item is long gone."*

**Say this if asked about dates:** *"The date filter is labelled UTC, and the end
date includes the whole day, so a report isn't missing the last day's work."*

### B11. Changing a password

**Go there:** `/change-password` — mention it rather than demoing it.

**Say this:** *"One page, two situations: an administrator has just reset your
password and you must replace it before you can reach any other screen, or you
decide to change it yourself. Either way, the system refuses to accept your old
password as the new one — that was a bug reported in our review and it's fixed."*

**Say this extra bit:** *"Changing your password also signs out your other devices,
which is what you want if you think someone else has it."*

---

## PART C — Admin (sign in as `admin@cncs.aau.edu.et` / `Admin123!`)

Sign out of staff (or use a second window) and sign in as the administrator. Same
menu, plus **Accounts** and **Categories** at the bottom.

### C1. Approve the transfer ⭐ (slow down here — this is the best moment)

**Do this:**
1. Open **Notifications** — show the message about the request that was filed
   earlier.
2. Click **Requests** in the left menu. Show that the same screen now lists
   *everyone's* requests, not just your own.
3. Open the waiting transfer. Read it out loud — the seeded one says the laptop is
   moving from Building CNCS, floor 3, room 312 to **floor 1, room 101**, because
   *"Laptop is moving with its user to the ground-floor office."*
4. Click **Approve**. A confirmation box appears saying what will change — read it.
5. Confirm.

**You'll see (point at each one, in this order):**
- the count next to **Requests** in the menu drops,
- open the item — its **Building / Floor / Room** have moved,
- scroll to **Edit history** — the change is written there with your name on it,
- the person who filed it now has a message saying it was approved,
- and if the item had accessories — **the charger moved with the laptop**.

**Say this:** *"Notice what didn't happen: nobody typed the new room anywhere. The
system applied the approved request, recorded it, told the person who asked, and
carried the charger along with the laptop — all from one click."*

**Say this about the charger:** *"The charger is a separate record and the request
never mentioned it. We chose to move it anyway and to write a line in the charger's
history saying why — because a charger whose record still says the old room is a lie
that will be discovered at the next audit."*

**Say this about safety (the line worth memorising):** *"If two administrators
clicked Approve at the exact same moment, only one of them would succeed. The second
gets a polite refusal, because the system checks the request is still waiting before
it changes anything — like two people signing the same form; whoever's pen lands
second finds it already stamped."*

### C2. Scrap an item, and what the public sees afterwards

**Do this:**
1. Sign back in as **staff** (or use the staff window) and file a **Disposal** on
   `CNCS-DEMO-0003` (the microscope). Say the reason: "lens broken, beyond repair."
2. Sign back in as admin and **Approve** it. Then look at the same request again —
   the Approve and Reject buttons are gone, because a decided request can never be
   changed or reopened.
3. Now open that item's public page (`/item/CNCS-DEMO-0003`) in the **private
   window**.

**You'll see in the private window:** one short line: *"This item is no longer in
service."* Nothing else — no details, no history.

**Say this:** *"Scrapping is final. Once approved, the public sees only this. Staff
and administrators can still open the record — the history has to stay available —
but a stranger with a sticker gets one sentence and nothing else."*

**Say this about approvals in general:** *"An administrator cannot approve their own
request, and staff cannot approve anything at all. Approval has to be someone else's
decision — that's the point of it."*

### C3. Accounts

**Go there:** click **Accounts** in the left menu (admin only).

**Do this:**
1. Create an account, e.g. name "Test Staff", email `test.staff@cncs.aau.edu.et`,
   password, role Staff.
2. Click the reset-password button on a row, set a temporary password.
3. Point at the **item count** next to each person — that's how many items they are
   responsible for.
4. Try to delete an account that owns items — the system refuses.

**Say this:** *"The office creates accounts; people can't sign themselves up. This
count next to each name is why deleting someone isn't a simple click — if they own
items, they're part of the record, and the record doesn't get erased because someone
left."*

**Say this about roles:** *"You can make a staff member an administrator. There's no
'demote' button, and that's deliberate — taking someone's access away shouldn't be
one mistaken click."*

### C4. Categories

**Go there:** click **Categories** in the left menu (admin only).

**Do this:**
1. Show the list — each category shows **how many items** are filed under it, and
   the count is a link into the register filtered to that category.
2. Add one, e.g. `Lab Glassware`.
3. Try to add one that already exists (e.g. `Electronics`) and show it's refused.
4. Try to delete a category that has items in it — the button is disabled with the
   reason on it.

**Say this:** *"Categories are the vocabulary of the register, and only an
administrator can change them. Two categories can't share a name or reports would
disagree with each other — and a category that's already in use can't be deleted,
because deleting it would mean destroying or orphaning the items filed under it."*

---

## 4. What I built — in plain words

You did the **entire front end** (every screen you just clicked through) and the
**second half of the back end** (the workflows behind it). Here's how to describe
that without a single technical word.

### My part 1 — the whole interface

*"I built every screen in the system and the rules that hold them together: the
public search and scan pages, the staff item pages, the request screens, the inbox,
the audit walkthrough and reports, and the administrator screens."*

Three things worth mentioning:

- **The screens are honest about what they don't show.** *"When a visitor looks at an
  item, the missing fields simply aren't in what their browser received. I made the
  page draw only what the server sends, so no screen can accidentally reveal a price
  or an owner."*
- **You don't get a 'you are not allowed' page.** *"If a staff member tries to open
  an administrator's page, they get the ordinary 'page not found' — because the real
  wall is on the server. A pretend wall is worse than none, because the next person
  would trust it."*
- **The look and feel is the university's, not a template.** *"The header, footer,
  colours and crest follow the real AAU and AAU portal sites, so it reads as a
  university system rather than a generic web template."*

### My part 2 — the workflow behind the scenes

*"I built the part that makes an item's life traceable: requests and approvals, the
change history, the accessory bundles, and the inbox."*

Say each of these as one sentence:

- **Requests and approvals.** *"Moving or scrapping an item is a request. Staff
  file it, an administrator decides it, and neither can skip the other."*
- **The change history.** *"Every change is recorded field by field — what changed,
  from what, to what, by whom, and when — so any item's past can be read back."*
- **Accessory bundles.** *"Items can be linked together, and when the main item
  moves, everything linked to it moves too, with its own record of why."*
- **The inbox.** *"Everyone who needs to know is told the moment a request is filed
  or decided, and the messages can be tidied without destroying the record behind
  them."*
- **The safety rules I chose to enforce.** *"Only one request can be waiting per
  item; a decided request can never be changed or reopened; no one can approve their
  own request; and a room change is refused for every role, administrators included,
  unless it came through an approval."*

**One honest line about a design choice:** *"There was a moment where a colleague's
earlier work had two different lists of 'which fields the public may see'. Two lists
that have to agree forever is a bug waiting to happen, so I merged them into one."*

**One line about the rule that stops double work:** *"If two administrators approve
at the same time, the second is refused. I tested that deliberately — there's a
check that fails if someone later reorders that code, because the safety depends on
the order it happens in."*

### The professional-sounding sentence to end on

*"None of these were guesses. Every rule has a written reason and a documented
decision behind it — they're all in our project documents."*

---

## 5. What my teammates built (one line each)

**Foundation (Yanet, with Maedot and Natnael)**

| Who | What they did | How to say it |
|---|---|---|
| Yanet | Set up the project, the sign-in system, and the rules everyone worked by | *"She set the rules before we all started working in parallel, and locked the data design first — which is why no later phase needed to change the database. That saved us weeks."* |
| Maedot | Registering, searching and categories | *"He built the register itself, including the rule that visitors never receive private fields."* |
| Natnael | The QR stickers, the demo data, the automated checks | *"He built the sticker generator. It encodes a web link, so a phone camera opens the item page with no app — and re-printing keeps the same number so an old sticker keeps working."* |

**Audit, reconciliation and reporting (Ammar, Latera, Naomi)**

| Who | What they did | How to say it |
|---|---|---|
| Ammar | Starting an audit and scanning during the walkthrough | *"He built the scanning walkthrough — and after review, the phone isn't allowed to declare its own result."* |
| Latera | Working out what was found, missing, or in the wrong place | *"She wrote the counting rules, and made sure a room's 'last checked' date only updates for items that were actually seen."* |
| Naomi | The CSV and PDF reports | *"She built the exports without adding any new software — and she made the scrapped-items report read from the approval record, not the item's status, so it can't be wiped out by resetting the demo data."* |

**If asked "who did what":** *"I built the entire front end and the workflow half of
the back end. Yanet led the foundation, Maedot did items and categories, Natnael did
the QR stickers and the pipeline. Ammar, Latera and Naomi did the audit and reporting
steps."*

---

## 6. What's not finished (say it before you're asked)

Being straight about this is what makes the rest believable.

- **There's no automatic test database.** *"Our automated checks use pretend data
  rather than a real test database, which is the biggest gap in the project. It means
  the double-approval rule is proven by a careful manual walkthrough and an automated
  check on the order of steps, not by a live database test."*
- **Audits by room/location are not built.** *"You can audit by department or by
  building. Auditing a single room is the one we didn't finish."*
- **Emails aren't really sent.** *"Messages appear in the inbox. The actual email is
  a placeholder that writes what it would have sent — we agreed real email was out of
  scope for this submission."*
- **Amharic language support is deferred.** *"Not because it's hard to translate
  labels, but because some words — like department names — are stored data that
  reports and audits match against. Translating properly is a display-layer job, not
  find-and-replace, so we noted it as the next piece of work rather than doing it
  badly."*
- **Privacy policy and analytics pages** aren't there — *"it's an internal university
  register reached by QR code, not a public shop."*

---

## 7. Questions you may be asked (and plain answers)

**"What's the single most important design decision?"**
*"The server decides what each person is allowed to see, and the screens only draw
what they're given. So a price can't be reached by fiddling with the address."*

**"How do you stop two people approving the same thing?"**
*"The system checks the request is still waiting at the moment it saves the change.
The second person is refused before anything is touched. I proved that with a test
that fails if someone reorders that code."*

**"Why record changes one field at a time?"**
*"So the history can answer a real question — 'when did this room last change?' —
instead of giving someone a paragraph to read."*

**"Why can't even an administrator move an item by editing it?"**
*"Because approval is the requirement, not a punishment for staff. If an
administrator could type over the room, there'd be no approval at all."*

**"Am I sure the sticker is safe if we re-print it?"**
*"Yes — the number and the link don't change, so an old sticker still works. It's
only a re-print for a damaged label."*

**"Can you export a PDF?"**
*"Yes. Every report has both a spreadsheet and a PDF button, made from the same rows,
so they can't disagree."*

**"What would you do next?"**
*"Set up a real test database, add the room-level audit, and do Amharic properly."*

---

## 8. Ten-minute pre-demo checklist

- [ ] Run the reset command (top of part 3) so the transfer is waiting again.
- [ ] Open the live **https** site — the camera needs it. (If you must demo on a
      plain-http office address, use the tag-entry box instead.)
- [ ] Have a **private window** open for the no-login checks. Signing out isn't
      enough — the sign-in is remembered in the browser.
- [ ] Know the two logins: `staff@cncs.aau.edu.et / Staff123!` and
      `admin@cncs.aau.edu.et / Admin123!`
- [ ] Remember: no demo item is scrapped until *you* approve a disposal. Use
      `CNCS-DEMO-0003` (the microscope) for that — the laptop already has a request
      waiting, so a second one on it would be refused.
- [ ] The laptop (`CNCS-DEMO-0001`) and its charger (`CNCS-DEMO-0004`) are linked,
      so the accessory moment in C1 works. The waiting transfer is on the laptop.
- [ ] If the login screen says it can't reach the server, that's a configuration
      mismatch, not an outage — the site address must be on the server's allowed
      list.
- [ ] Decide now that you'll name the unfinished items in section 6 yourself,
      before anyone asks.

You built the whole interface and the workflow at its centre. The story holds
together — just walk them through it in this order.
