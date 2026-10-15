> **ARCHIVED 2026-10-14 — not the current truth. Read [`../monolithic-system-design.md`](../monolithic-system-design.md) instead.**
>
> Plain-language build plan for the earlier scope.
>
> Kept as a record of what was decided at the time, nothing more. It is not maintained,
> and anything in it that disagrees with the source of truth is the old decision losing.

# Our Build Plan — From Demo to a Real University System

*Read this once. Everything in it is written in plain language — no technical background needed.
Where a word is technical, it is explained on the spot.*

---

## The goal, in one sentence

Turn our property app into something **Addis Ababa University could actually adopt**: every person
with the right job has the right access, every item is properly registered and protected, every
action is approved and recorded, and every report speaks the language of the university and the
Ministry of Finance.

---

## Part 1 — The simple picture: who does what

Think of the university as **five floors of a building**. Our app mirrors those floors:

| Floor | Who lives there | What they do in our app |
|---|---|---|
| **Floor 5 — The whole university** | Central property office | Manage everything: register, transfer, dispose, report to the ministry |
| **Floor 4 — Campus** (4 Kilo, 6 Kilo, Amist Kilo…) | Campus property office | Look after everything on their campus |
| **Floor 3 — College** (Business, Health, Law…) | College property officer | Look after everything in their college |
| **Floor 2 — Department** | Department head + record keeper | Count their items, request items, approve local requests |
| **Floor 1 — The individual** | Instructor, teacher, researcher | **Request only** — they can never register or change items |

And watching over all of it, **without touching anything**:

- **The system administrator** — keeps the app running. Does not decide about items.
- **The account administrator** — approves who gets an account. That is *all* they do.
- **The auditor** — can see everything, change nothing.

> **The golden rule:** the person who *wants* something, the person who *records* it, and the
> person who *approves* it are always **three different people**. No exceptions. This one rule
> fixes almost every complaint our supervisor had.

---

## Part 2 — What to FIX (things that exist today but are wrong)

1. **Two roles is not enough.** Today everyone is either "admin" or "staff". Replace with the
   roles in Part 1. Instructors and property staff are both "staff" today — they must not be.
2. **Admins can add items today. Remove it.** Registering items belongs to property professionals.
   The admin's only people-job is **approving new accounts**.
3. **Accounts appear instantly today.** Instead: someone requests an account → the account admin
   approves or rejects → then the account is created and the person picks their own password at
   first sign-in. (The forced password change we built stays — it becomes step 4 of this flow.)
4. **The owner field is optional and vague.** Make it **required** everywhere, and make it say
   clearly whether it means the **owner today** or the **owner after a transfer**.
5. **Transfers don't say from whom or to whom.** Every transfer must record: department→department,
   or department→person, **from whom, to whom, who approved**. Without this, the record is worthless.
6. **Public visitors can see everything today.** From now on, outsiders can see only a **general
   category** ("there are 500 lab instruments in this college") — never details, cost, owner, or
   exact location. This is enforced on the server, not just hidden on the screen.
7. **Everything gets deleted permanently today.** Deleting an item should instead **mark it as
   retired/disposed** so its history is never lost. History is the audit trail.
8. **The audit log can save duplicate entries.** Make each entry unique and unchangeable.
9. **Item numbers (PINs) can collide.** Each asset gets **one unique number for its lifetime**,
   like a national ID card for an item.
10. **Request list shows everything, forever.** Show a **chosen period** (this week / this month /
    pick a range), with totals shown in a report, not dumped on the page.
11. **Desktop shows the QR scanner. It must not.** You can't scan with a laptop. Scanner = mobile only.

---

## Part 3 — What to ADD (missing things a real system must have)

### About items
- **A proper identity card for every item:** unique number, a photo, copy of the invoice, price,
  purchase date, warranty, who owns it, which room, and its **condition** (new / good / worn /
  broken).
- **A "status" the item can never skip:** *Registered → Assigned → In use / In store → Loaned /
  Under repair → Disposed or Lost.* An item that is "on loan" cannot be transferred or disposed
  until it comes back. An item that is "disposed" cannot come back to life without a special,
  recorded correction.
- **A category tag** on every item: **consumable** (paper, tonners — used up), **fixed asset**
  (chairs, computers, projectors — lasts years), or **heritage** (rare manuscripts, museum pieces —
  special care, never depreciated).

### About moving items around
- **Loans:** borrow something for a fixed time, with a return date and automatic reminders when
  overdue.
- **Transfers:** department→department or department→person, **always with approval** — and the
  person who sends it can never be the person who approves it.
- **Disposal as a proper decision:** reason (old/broken/lost/stolen) → destination (give to another
  department first; then another public body; then sell at auction; then write off) → approval by
  **two people** for valuable items → record what money came from the sale.

### About keeping count
- **Store ledger** for consumables: what came in, what went out, what remains. Consumables leave
  the store only with an approved request.
- **Counting days:** periodically, people physically count what exists, and compare with what the
  app says. Any gap is recorded with a **reason and an approver** — nobody just "fixes" the number
  quietly. This is how we find lost or stolen items.

### About money (this is why reports were "totally not working")
- Every fixed asset records its **cost, useful life, and how much value it has lost** over time
  (depreciation). Land, heritage items, and things still under construction **never** depreciate.
- With that data, the app can finally produce the reports the ministry expects: what we own, what
  it was worth, what we bought, what we threw away, and what it's all worth now — for the year just
  ended.
- **Reports follow the Ethiopian year (Hamle 1 → Sene 30), not the European year.** This one detail
  decides whether a ministry report is accepted or rejected.

### About safety and trust
- Nobody sees data outside their own scope: a campus officer sees their campus, a department sees
  their department.
- If someone's role changes, their old sessions **die immediately**.
- Everything logged, nothing deletable, everything exportable for the auditor.

### About people and usability
- **Amharic**, alongside English.
- Dates shown in the **Ethiopian calendar**, stored internally in the international calendar.
- Buildings shown **with their photos** when browsing by building.
- **Printable official-looking forms** (GOFAMM-style registration, transfer and disposal forms).
- The optional **campus map**, if time allows — otherwise a simple drawn map of buildings.

---

## Part 4 — What to UPDATE / MODIFY (existing screens, next version)

| Screen | Change |
|---|---|
| **Sign-up** | Becomes "sign-up **request**"; admin approves → account created |
| **Dashboard** | Shows your own work per floor: pending approvals, overdue loans, count dates |
| **Items page** | Add category, condition, status, owner, room, financial fields; registration only for property staff |
| **Requests** | Different request types per role; time-window view; totals in a separate report |
| **Transfer / disposal** | All the fixes in Part 2, plus approvals and reasons |
| **Inventory** | Store ledger for consumables; count-and-reconcile flow for assets |
| **Audit page** | Filters by department, action, person and time range; sort; export to CSV/PDF |
| **Reports** | Rebuilt, one page per audience: department → college → campus → university → ministry → auditor |
| **Public landing** | Categories only — no details, no photos of locations, no staff names |
| **QR scanner** | Mobile app only |
| **Buildings** | Show building photos |
| **Map** | Real map if feasible, else a simple campus sketch |

---

## Part 5 — What NOT to include (and why — so nobody asks for it)

- ❌ **Salaries / HR** — not our problem. Another system does that.
- ❌ **Buying (procurement bidding)** — that's IFMIS/procurement's job. We only track what arrives;
  we can cheerfully import data from it later.
- ❌ **A public chatter/social layer** — a property register is not a social network.
- ❌ **Real-time map for every item** — nice-to-have, keep optional.
- ❌ **Anything with real student data.** We handle staff names and photos only. Personal rules say
  we keep the **minimum** personal data needed to run the system — and nothing else.
- ❌ **Fancy AI features.** Nobody audits a spreadsheet better than a good report. Keep faith with
  the core job.

---

## Part 6 — The roadmap (in order; each step opens the door to the next)

### Step 1 — Laying the foundation (do first, everything else depends on it)
Build the hierarchy in the database (University → Campus → College → Department — the five floors
above). Define all roles in the system. Create the permission rules, once, in one place, on the
server. Fix the audit log and the owner field while we're there.
*A domain where "who can do what" is decided once and used everywhere.*

### Step 2 — Right people, right access
Turn sign-up into a request-and-approve flow. Lock every screen and every server call so each role
sees only what it should. Test it by acting as the instructor, the officer, the admin, and the
outsider — and make sure every "no" is a clean, polite no.

### Step 3 — The life of an item
Each asset gets its full identity card, its unique number, its photo, its location, its condition
and category. Registration becomes the job of the property staff only. Outsiders cannot see
details — category only.

### Step 4 — Movement, money, counting
Loans, transfers, disposal — with approvals. Depreciation ticking quietly in the background. Store
ledger for consumables. Count days, with reasons for any gap.

### Step 5 — Eyes everywhere
Fix the request list (time window, totals). Rebuild the reports by audience, using the Ethiopian
fiscal year. Give the audit page real filters, sorting, and export.

### Step 6 — Polish and prove it works
Desktop scanner gone; scanner in the mobile app. Building photos. Amharic option. Ethiopian dates.
Printable forms. Then **prove it**: backups that actually restore, an app that stays up under real
load, logs every action, and passes a reviewer poking at it.

### Step 7 — The second presentation
Demo it walking the *rules*, not just the happy paths: show the instructor being refused to
register, show a transfer needing two approvals, show a disposal with evidence, show a ministry
report on the Ethiopian year — and show the backup restore and the audit trail. Leave nothing for
someone to spot that we haven't shown first.

---

## Part 7 — How will we know it's done? (the "no surprises" checklist)

A feature is **done** when all of these are true:

1. ☐ The right role can do it. **☐** The wrong role is refused — and the refusal is remembered.
2. ☐ It works for the three smallest cases **and** the three biggest ones (thousands of items).
3. ☐ It is recorded in the audit trail without touching anything else.
4. ☐ A non-technical person can use it without being taught every time.
5. ☐ It works in Amharic as well as English.
6. ☐ It speaks the Ethiopian fiscal year, not the European one.
7. ☐ It survives a crash, a wrong click, and a reviewer's "what if I try this?" — without losing data.

---

## Part 8 — The honest risks, plainly stated

| Risk | How we handle it |
|---|---|
| We model the university **wrong** (wrong floors, wrong names) | Ask the supervisor and a property officer to confirm the org structure *before* we build anything permanent |
| We build too much, ship nothing | Ship the foundation and the money/report work first — those were the loudest complaints |
| We get the money rules (depreciation) wrong | Have someone from finance review the depreciation and the Ethiopian-year logic |
| We pretend it's "production ready" before backups/monitoring exist | Step 6 is not optional; no "production ready" claim without it |
| Scope grows with every new idea | Part 5 is the fence. New ideas go on a "later" list, not into the build |

---

## The one-line summary

**Five floors. Ten roles. One golden rule (the requester never approves). One identity card per
item. One counting method. One reporting year — Hamle to Sene. And every single action leaves a
trace that nobody, not even us, can erase or change quietly.**

That is the whole plan.
