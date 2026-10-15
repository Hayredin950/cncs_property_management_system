> **ARCHIVED 2026-10-14 — not the current truth. Read [`../monolithic-system-design.md`](../monolithic-system-design.md) instead.**
>
> Supervisor's review input, folded into the five-role model.
>
> Kept as a record of what was decided at the time, nothing more. It is not maintained,
> and anything in it that disagrees with the source of truth is the old decision losing.

# Supervisor Feedback (Rewritten for the Team)

Our supervisor reviewed the demo and raised the points below, grouped by theme.
**(optional)** marks the "nice to have" items; everything else is required.

---

## 1. Roles & permissions (biggest issue — needs real design work)

Our current **"Staff"** role is too broad. In reality there are at least **two different staff types**:

- **(a) Department staff / Instructor** — **cannot register items at all**; they can only
  **request items for their department**.
- **(b) Property-management staff** — the people who actually work in property management; these
  **can register items**.

These two need **different permissions** — right now we treat them as one role.

- **Admins should not be adding/registering items.** That is not an admin's job in a real property
  system.
- **The admin's job should be narrower: approve/reject account creation only.** Staff register their
  own accounts and wait for approval, instead of the admin manually creating every account with full
  details. This makes the admin's job lighter and more correct.
- **Before we fix any of this, map the real hierarchy first.** We need to work out the actual
  property-management hierarchy at university/campus level (who reports to whom, who approves what),
  then assign roles and permissions based on that **real structure** — not guesses.

---

## 2. Visibility / public access

He doesn't like that item details are publicly visible. Not everyone should see the full property
inventory — public-facing views should be limited to something like **item classification (general
category)**, not full details.

---

## 3. Nice-to-haves (optional, lower priority)

- **Real map functionality**, if feasible, scoped to our specific use case.
- **Building grouping** currently just lists buildings by name — he wants an **actual building image**
  shown alongside each group, not just text.

---

## 4. Transfer / disposal logic (must be meaningful, not just a form field)

- **`ownerId` is currently optional in transfer/disposal — it should be required.** It must be clear
  whether it records the **current owner** or the **future owner**. This has to reflect real-world
  logic, not just be a field we fill in.
- **Transfers should support different types** — e.g. transfer to a **department** vs. transfer to a
  **specific individual** — and it must be explicit **who it's from** and **who it's to**, so the audit
  trail is meaningful.
- We need to figure out **how to handle multiple pending requests on the same item**.

---

## 5. Requests

- **Request types should be explicit and role-based** — e.g. a department head requests on behalf of
  the department, an individual requests for themselves, and so on. **Different roles → different
  allowed request types.**
- **The requests page currently shows everything with no filtering.** He wants it scoped to a **time
  window** (week / month / recent), with a way to see **totals/history separately** as a report or log
  instead of dumping everything on one page.

---

## 6. UI/UX cleanup

- **Remove the QR scanner from desktop view entirely** — no one can scan with a desktop, so it should
  be **mobile-only**.
- **Define the inventory logic properly** (what counts as stock, how items are added/removed).

---

## 7. Audit page

Needs real usability features: **filtering, grouping by department, sorting, and date-range
selection** (to view only a specific period), among other improvements. Right now it's too
plain/limited.

---

## 8. Reports (currently "totally not working" — in his words)

Needs to be **rebuilt**, and reports should **differ by role and by audience**. A report isn't
one-size-fits-all:
- a report meant for the **university campus** is different from one meant for **MoFAD / Ministry of
  Finance**;
- even different **staff types** may need different report formats (college-level vs. others).

The **reporting hierarchy needs to match the real organizational hierarchy**.

---

## Where to start (biggest impact)

**Section 1** (roles + hierarchy + admin-approval of accounts) changes the data model and permissions,
so it should come first — everything else builds on it.
