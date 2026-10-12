# Property Management — Hierarchy, Roles, Permissions & Governance Plan

**Project:** CNCS Campus Property Management System
**Status:** Design plan (pre-implementation)
**Audience:** Development team, supervisor, AAU stakeholder review
**Scope:** How the system should model roles, permissions, the property hierarchy, and the
audit/reporting obligations of a public university in Ethiopia.

---

## 0. Executive summary

The supervisor's 16 points are not 16 unrelated bugs — they are symptoms of one root cause:
**the system models a generic company, not a public university governed by Ethiopian public
property law.** Two roles (`ADMIN`, `STAFF`) cannot express a real university, and a flat item
model cannot satisfy the Federal Public Procurement and Property Administration Proclamation.

This plan:

1. Researches how university property management is structured (international practice).
2. Researches the Ethiopian legal framework that binds a public university.
3. Researches AAU's actual institutional structure.
4. Synthesizes a **target operating model**: a 6-tier hierarchy, a 10-role catalogue, and a
   permission matrix.
5. Redesigns the workflows the supervisor objected to (accounts, item registration, requests,
   transfer/disposal, inventory, visibility, reports, audit).
6. Maps everything onto our existing codebase so implementation is concrete.
7. Gives a phased roadmap and a compliance traceability matrix.

**Headline decisions:**

- **Split `STAFF` into a requester role and property-operator roles.** Instructors (and all
  academics) **request**; only property-management staff **register/own** items.
- **The admin does not own property work.** Property operations belong to the Property
  Administration directorate; the "admin" role becomes an *account approver*.
- **Introduce a hierarchy**: University → Campus → College/School/Institute → Department →
  Individual, with each level having a defined officer.
- **Adopt Ethiopian public-property rules** for owner, transfer, disposal, classification, and
  reporting — because AAU is a *public body* under Proclamation 1333/2024, not a private firm.

---

## 1. Method and sources

We moved from the general to the specific, following the supervisor's own instruction
("world situation → Ethiopia → AAU"):

| Layer | What we studied | Why it matters |
|---|---|---|
| International | US public-university property offices (GWU, Drexel, Sacramento State, Stanford, Morgan State) | Proven role separation: requester / purchaser / recorder / custodian / approver |
| Ethiopia (law) | Proclamations 649/2009 and **1333/2024**, property-administration directives, GOFAMM manual, Stock Management Manual (FPPA) | Defines what a public body legally must do: register, classify, transfer with approval, dispose with approval, report |
| Ethiopia (oversight) | MoF, Federal Public Procurement & Property Authority (FPPA/PPPA), Office of the Federal Auditor General (OFAG), Directive 47/2016 | Defines who receives reports and who audits us |
| Accounting | IPSAS 17 → **IPSAS 45**, GASB 34/104 | Defines asset classification, recognition, and disclosure (incl. heritage assets) |
| AAU | AAU structure: President, Vice-Presidents, ~13 campuses, 11+ colleges, institutes, schools; Procurement & Property directorate under the Administration VP; runs **IFMIS** with MoF | Defines the exact tiers and names our roles must mirror |

Full links are in §15 (References).

---

## 2. Findings A — International practice: how universities manage property

Across the universities studied, the same pattern repeats, and it is the pattern the supervisor
is asking us to copy:

**Separation of duties.** The person who *wants* an asset, the person who *buys* it, the person who
*records* it, the person who *holds* it, and the person who *approves its disposal* are **different
people**. GWU states it explicitly: the operating department requisitions, Procurement purchases,
and the Fixed Asset Department records, tags, and reports.

**A central Property Management Office (PMO).** It owns the asset register: tagging, records,
inventory cycles, transfers, disposal processing, and accounting/audit reports. It does not "own"
the asset's day-to-day use.

**Devolved custodianship.** Every department designates a **Department Record Keeper (DRK)** /
**Property Officer** (Sacramento State, Morgan State). The DRK keeps local records, reports
missing/lost items, coordinates inventories, and raises transfers/turn-ins.

**Accountable line managers.** Deans, Directors, Chairs, and Department Heads are accountable for
property in their jurisdiction and **approve** loans and disposal requests.

**A Property Survey Board.** Disposal and major transfers go to a **board**, not a single person,
and require *at least two approvals*.

**Role list we can reuse almost verbatim:**

| Generic role | University equivalent | Our role code |
|---|---|---|
| System/IT administrator | IT office | `SYS_ADMIN` |
| Central property office | Property Management Office / Directorate | `PROPERTY_ADMIN` |
| Campus property desk | Campus administration office | `CAMPUS_PROPERTY_OFFICER` |
| College property desk | Dean's office property officer | `COLLEGE_PROPERTY_OFFICER` |
| Department record keeper | DRK / store keeper | `DEPT_RECORD_KEEPER` |
| Accountable line manager | Dean / Director / Chair | `DEPT_HEAD` (and college-level heads) |
| Internal oversight | Internal audit | `AUDITOR` |
| End user / requester | Instructor, researcher, admin staff | `STAFF` |
| Approver of accounts | Registrar / HR / designated admin | `ACCOUNT_ADMIN` |

> **Key takeaway:** no university lets the "admin" register assets, and no university lets an
> instructor register assets. Both of the supervisor's first two complaints match standard practice.

---

## 3. Findings B — Ethiopian legal and governance framework

This is the part that turns our app from "a nice inventory tool" into "a compliant public
property system". AAU is a **public body**, so the following binds it.

### 3.1 The governing law

- **Proclamation No. 649/2009** — *Federal Government Procurement and Property Administration
  Proclamation* (the older law; still useful for its property-administration concepts).
- **Proclamation No. 1333/2024** — *The Federal Public Procurement and Property Administration
  Proclamation* — **repealed and replaced 649/2009** and is the current law. It applies to
  "procurement and property administration of any public body".
- **Property Administration directives** (e.g. *Property Management, Use and Disposal Directive
  No. 447/2013*) — operational rules.
- **Government-Owned Fixed Asset Management Manual (GOFAMM, MoFED)** and the **Stock Management
  Manual (FPPA)** — define the officer, the records, and the forms.
- **Federal Government Internal Auditors Directive No. 47/2016** and the **OFAG** (Proclamation
  68/1997) — define the audit side.

### 3.2 What the law obliges us to implement

| Legal requirement | What it means for our app |
|---|---|
| Every fixed asset must have a **unique identifier** (PIN / property identification number) | QR/barcode sticker per item; the sticker URL is already implemented (`PUBLIC_BASE_URL`) |
| **Classification** of property (fixed asset vs. stock/consumable vs. heritage, etc.) | Item classification field, driving visibility **and** reporting |
| A designated **Property Administration Officer** in the procurement & property unit | The `PROPERTY_ADMIN` role — a *civil servant*, not a generic admin |
| **Transfer to another public body requires approval** | Transfers must have an explicit approver and a from-owner/to-owner |
| **Disposal is regulated and approved** (board / authority), not a free action | Disposal workflow with an approval step and an audit trail |
| **Reporting upward** to MoF / FPPA (and IFMIS) | Report types targeting university vs. MoF/FPPA audiences |
| **Periodic inventory** (physical count, reconciliation) | Inventory cycles, discrepancy reports, sign-off |
| **Internal audit** independent of operations | `AUDITOR` role with read-only + evidence export |

### 3.3 Who oversees whom (the accountability chain)

```
Ministry of Finance (MoF)          ── policy + IFMIS + consolidated reporting
   └── Federal Public Procurement & Property Authority (FPPA) ── regulator, manual, PIN
Ministry of Education (MoE)        ── higher-education governance (Proclamation 1152/2019)
   └── University Board of Governors ── supreme governing body of the university
Office of the Federal Auditor General (OFAG) ── external audit of public bodies
```

AAU therefore has **two upward lines**: academic/governance (MoE) and finance/property
(MoF/FPPA) — plus audit (OFAG). Our reports must be able to speak to **both**.

---

## 4. Findings C — AAU's institutional structure

The structure our roles must mirror:

- **President** — chief executive.
- **Vice President for Academic Affairs & Research** — colleges, schools, institutes.
- **Vice President for Administration & Development / Student Services** — under whom sit
  **Finance**, **Procurement**, and **Property Administration**. (AAU's Procurement Management
  Directorate sits under the Administration VP.)
- **Colleges / Schools / Institutes** (~11 colleges + institutes + schools), each with a **Dean**
  or Director.
- **Departments** within colleges, each with a **Department Head**.
- **Campuses** (~13, e.g. 4 Kilo, 6 Kilo, Amist Kilo, AAiT, FBE) — campuses cut *across* colleges
  and are the physical place where buildings and assets live.
- **AAU runs IFMIS** with MoF for finance — so our system must not fight IFMIS; it must produce
  data that reconciles with it.

> **Implication:** because *campuses* and *colleges* are two different axes, our hierarchy must
> support **both**: a location axis (campus → building) and an organizational axis (college →
> department). This is why the supervisor's point #4 ("map the real hierarchy") is the keystone:
> everything else hangs off it.

---

## 5. Findings D — Audit, security, and reporting standards

- **Segregation of duties** is the core internal control the law expects: the requester, the
  recorder, the custodian, and the approver must be different people.
- **Append-only audit trail:** every state change (who, what, when, before → after) must be
  recorded and immutable. Our current `AuditItemResultRow` has **no unique constraint**, which
  makes duplicate/ambiguous audit rows possible — a defect to fix.
- **Approval is "maker–checker" (4-eyes):** the person who requests a transfer/disposal cannot be
  the person who approves it.
- **Reporting periods** are monthly/quarterly/annual and flow upward; reports differ by audience.
- **Accounting standards:** IPSAS 45 (replacing IPSAS 17) for property, plant and equipment —
  including **heritage assets** (relevant to AAU: the Institute of Ethiopian Studies museum,
  manuscripts, art), which is why classification must be richer than "on/off public".

---

## 6. The target operating model — hierarchy

Six tiers. Everything (roles, permissions, reports, visibility) is scoped to a node in this tree.

```
TIER 0  External oversight        MoF / FPPA / MoE / OFAG           (consumers of reports)
   ▲
TIER 1  University                AAU — President, VP Administration & Development
           └── Property Administration Directorate   ← central property authority
   ▲
TIER 2  Campus                    e.g. "4 Kilo", "6 Kilo", "Amist Kilo", "AAiT"
           └── Campus Property Office
   ▲
TIER 3  College / School / Institute   e.g. "College of Business & Economics"
           └── Dean's office property officer
   ▲
TIER 4  Department                e.g. "Department of Accounting & Finance"
           └── Department Head + Department Record Keeper / store
   ▲
TIER 5  Individual / Custodian    Instructor, researcher, staff member
```

**Two orthogonal axes** (both must exist):

- **Organizational axis:** University → College → Department (drives *permissions and reports*).
- **Location axis:** Campus → Building → Room/Floor (drives *physical inventory and browsing*).

An item is bound to `(ownerOrgUnit, location)` so a department's assets in a shared building on a
campus are still tracked correctly — and so "browse by building" (supervisor #7) works.

---

## 7. Role catalogue

Ten roles, grouped in tiers. Codes are suggestions to match our Prisma enum.

### Oversight tier

| Code | Name | Scope | One-line purpose |
|---|---|---|---|
| `SYS_ADMIN` | System Administrator | Whole system | Runs the platform, integrations, backups. **No property decisions.** |
| `ACCOUNT_ADMIN` | Account Administrator | Whole university | **Approves/rejects account requests** and assigns roles. This is the "admin" the supervisor described. |
| `AUDITOR` | Internal Auditor | Read-only, whole system | Independently reviews operations; exports evidence; no write access to items. |

### Property-operations tier (the "property management staff" — staff type b)

| Code | Name | Scope | Purpose |
|---|---|---|---|
| `PROPERTY_ADMIN` | Property Administration Officer | University (central directorate) | Owns the register: tagging/PIN, transfers, disposal processing, reconciliation, all reports. |
| `CAMPUS_PROPERTY_OFFICER` | Campus Property Officer | One campus | Campus-level register, inventory counts, local transfers. |
| `COLLEGE_PROPERTY_OFFICER` | College Property Officer | One college | College-level custody records, verifies department inventories. |
| `DEPT_RECORD_KEEPER` | Department Record Keeper / Store Officer | One department | Local custody: check-in/out, loss reports, count sheets, turns in items. |

### Department tier

| Code | Name | Scope | Purpose |
|---|---|---|---|
| `DEPT_HEAD` | Department Head | One department | Approves department requests, transfers, loans, counts. **Cannot register assets** unless also a property officer. |

### Requester tier (the "instructor" — staff type a)

| Code | Name | Scope | Purpose |
|---|---|---|---|
| `STAFF` | Staff / Instructor | Own requests | **Requests items for self or for their department. Cannot register or own assets.** |

### Public

| — | Public / unauthenticated | — | Sees only **category-level** public information (supervisor #5). |

> **This directly answers supervisor points #1, #2, #3:**
> - #1 two staff types → `STAFF` (request only) vs. the four property-operations roles.
> - #2 admins don't add items → no role named "admin" has a register capability; `PROPERTY_ADMIN`
>   is a distinct, professional role.
> - #3 admin only approves accounts → `ACCOUNT_ADMIN`, with a request/approval workflow.

---

## 8. Permission matrix

Legend: ✓ allowed · — denied · ⧉ allowed within own scope/unit only · ✔ = requires approval

| Capability | STAFF | DEPT_HEAD | DEPT_RECORD_KEEPER | COLLEGE_PROP_OFFICER | CAMPUS_PROP_OFFICER | PROPERTY_ADMIN | AUDITOR | ACCOUNT_ADMIN | SYS_ADMIN |
|---|---|---|---|---|---|---|---|---|---|
| Request an item (self) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Request an item (department) | — | ⧉ | — | — | — | — | — | — | — |
| Register / create item | — | — | ⧉ | ⧉ | ✓ | ✓ | — | — | — |
| Edit item details | — | — | ⧉ | ⧉ | ✓ | ✓ | — | — | — |
| Custody check-in / check-out | — | — | ⧉ | — | — | ✓ | — | — | — |
| Approve transfer (from-side) | — | ⧉ ✔ | — | ⧉ ✔ | ✓ | ✓ | — | — | — |
| Approve transfer (to-side) | — | ⧉ ✔ | — | — | — | ✓ | — | — | — |
| Initiate disposal | — | — | — | — | ✓ | ✓ | — | — | — |
| Approve disposal | — | — | — | — | — | ✔ (board) | — | — | — |
| Run physical inventory | — | — | ⧉ | ⧉ | ✓ | ✓ | — | — | — |
| Sign off inventory count | — | ⧉ | — | ✓ | ✓ | ✓ | — | — | — |
| View item details (internal) | ⧉ | ⧉ | ⧉ | ⧉ | ⧉ | ✓ | ✓ | — | ✓ |
| View public (category only) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Run reports (dept/college) | — | ⧉ | — | ⧉ | ✓ | ✓ | ✓ | — | — |
| Run reports (university/MoF) | — | — | — | — | — | ✓ | ✓ | — | — |
| Filter / sort / date-range audit | — | ⧉ | ⧉ | ⧉ | ⧉ | ✓ | ✓ | — | — |
| Approve account request | — | — | — | — | — | — | — | ✓ | — |
| Assign roles | — | — | — | — | — | — | — | ✓ | ⧉ |
| Revoke session / rotate keys | — | — | — | — | — | — | — | — | ✓ |

**Controls baked into the matrix:**

- **No self-approval:** every ✔ row is unreachable by the requester (maker–checker).
- **Least privilege:** instructors can only request; auditors can only read.
- **Separation of duties:** the recorder (`PROPERTY_ADMIN`/officers) is not the approver of
  disposal (board), and not the account approver (`ACCOUNT_ADMIN`).

---

## 9. Key workflow redesigns

### 9.1 Account creation → request & approval (supervisor #3)

```
STAFF submits account request (name, dept, college, campus, requested role)
        │
        ▼
ACCOUNT_ADMIN reviews ── reject ──▶ requester notified w/ reason (audited)
        │ approve
        ▼
Account created, role assigned, mustChangePassword = true
        │
        ▼
First sign-in forces password change (already implemented)
```

- The **initial account is created only after approval** — no admin "typing every detail".
- Keep the existing `mustChangePassword` first-sign-in flow (already working).
- The current `POST /auth/register` is **ADMIN-only**; it must become a *request* endpoint, and the
  admin approval becomes `POST /accounts/requests/:id/approve|reject`.

### 9.2 Item registration (supervisor #2)

- Register capability belongs **only** to property-operations roles (§7).
- `STAFF` and `ACCOUNT_ADMIN`/`SYS_ADMIN` cannot create items.
- Each item records: classification, PIN, owner org-unit, location (campus/building/room),
  custodian, acquisition data, condition.

### 9.3 Requests (supervisor #11, #12)

**Explicit request types** (each allowed to different roles):

| Request type | Who may raise it | Target |
|---|---|---|
| `SELF_USE` | any staff | themselves |
| `DEPARTMENT_USE` | Department Head | their department |
| `TRANSFER_TO_DEPARTMENT` | Dept Head / property officer | another department |
| `TRANSFER_TO_INDIVIDUAL` | Dept Head / property officer | a named person |
| `DISPOSAL` | College/Campus/Property officer | board |
| `LOAN` | Dept Head | individual, time-boxed |

**Timeline-scoped listing (supervisor #12):** the requests page defaults to a window
(*this week / this month / custom range*), never "everything", and totals/history are exported
to a report/log rather than dumped on the page.

### 9.4 Transfer (supervisor #9)

Model transfers with **explicit, required** endpoints:

```
Transfer {
  type: DEPARTMENT | INDIVIDUAL
  fromOrgUnit (required)   fromOwnerId (required)
  toOrgUnit   (required if type=DEPARTMENT)
  toOwnerId   (required if type=INDIVIDUAL)
  reason
  approvals[] (from-side + to-side; maker-checker)
}
```

This is what makes the audit trail meaningful: *who gave it, who received it, and who approved it*.

### 9.5 Disposal and `ownerId` (supervisor #8)

- `ownerId` becomes **required** everywhere it appears (currently optional in transfer/disposal).
- The system must label it unambiguously as **current owner** at initiation and record the
  **future owner** at completion — two fields, not one ambiguous one.
- Disposal requires approval and can never be self-approved.

### 9.6 Multiple requests for one item (supervisor #10)

Adopt a single, explicit policy and show it in the UI:

- Item has a **request queue**; all pending requests are visible to the item's custodian.
- Policy options ranked (pick one per request type):
  1. Priority (department > individual), then
  2. Earliest request wins, then
  3. Custodian/approver chooses among the queue.
- Whichever is chosen, the item state machine forbids double-allocation: an item can be granted to
  **one** requester at a time; competing requests become `WAITLISTED` or `REJECTED` with a reason.

### 9.7 Inventory logic (supervisor #14)

Adopt the GOFAMM/Stock Manual distinction:

- **Stock / consumable** — quantity-tracked, issued from store, min/max levels.
- **Fixed asset** — unit-tracked, individually identified by PIN, depreciated, never "consumed".
- **Heritage / cultural asset** — tracked but flagged (no depreciation, restricted disposal) —
  important for AAU.
- **Inventory cycle:** schedule → count → reconcile → discrepancies → sign-off
  (`DEPT_RECORD_KEEPER` counts, `COLLEGE/CAMPUS` verifies, `PROPERTY_ADMIN` reconciles).

---

## 10. Item classification and visibility (supervisor #5)

Two independent fields — this is what the supervisor meant by "at least have item classification".

**Classification (what it is):**
`STOCK` · `FIXED_ASSET` · `HERITAGE_CULTURAL` · `LAND_BUILDING` · `INTANGIBLE`

**Visibility (who may see it):**
`PUBLIC_SUMMARY` (category only) · `INTERNAL` (any authenticated staff) · `RESTRICTED` (own
unit + property roles) · `CONFIDENTIAL` (property roles + auditor only)

Rules:
- Public/unauthenticated users **only** ever see `PUBLIC_SUMMARY`, and only category-level
  information — never item details, cost, custodian, or location (supervisor #5).
- `HERITAGE_CULTURAL` defaults to `RESTRICTED` or higher.
- Visibility is enforced **server-side**, not merely hidden in the UI.

---

## 11. Audit, reporting and compliance design (supervisor #15, #16)

### 11.1 Audit page

- Filters: date range, department, college, campus, item classification, action type, actor, role.
- Group & sort: by department, by action, by actor, by item.
- **Time-scale selector** to view only a chosen period (day/week/month/quarter/year/custom).
- Export to CSV/PDF for auditors; every export is itself logged.

### 11.2 Reports by role *and* audience (supervisor #16 — the rebuild)

| Audience | Report examples | Who runs it |
|---|---|---|
| Public | Category-level summary only | anyone |
| Department | Department asset list, custody, transfers | Dept Head / officers |
| College / School / Institute | College register, discrepancies, disposal log | College officer / Dean |
| Campus | Campus register, building-level inventory | Campus officer |
| University (AAU central) | Consolidated register, annual inventory, revaluation | `PROPERTY_ADMIN` |
| **MoF / FPPA** | Property-administration returns, fixed-asset movement, disposal approvals | `PROPERTY_ADMIN` |
| **MoE** | Institutional asset summary for governance | `PROPERTY_ADMIN` |
| **OFAG / internal audit** | Evidence packs, control test extracts | `AUDITOR` |

All reports are **time-scoped** (matching the requests/audit UX) and generated from a single
report-renderer so formats stay consistent.

### 11.3 Security & controls

- **Append-only audit log** (who/what/when/before→after); fix `AuditItemResultRow` by adding a
  uniqueness key so audit rows cannot duplicate or collapse.
- **Maker–checker** on every approval (§8).
- **Session revocation** already exists (JWT `ver` vs `User.tokenVersion`) — keep and extend to
  role changes (changing a role bumps `tokenVersion`).
- **Server-side authorization** on every route: permissions checked against role × scope, never
  trusted from the client.
- **No sensitive data in public payloads** (cost, custodian, exact location).

---

## 12. Mapping to our current codebase

| Area | Current state | Required change |
|---|---|---|
| `backend/prisma/schema.prisma` | `Role` enum = `ADMIN \| STAFF` | Expand to the 10 roles (§7); add `OrgUnit` (self-referencing tree: University→Campus→College→Department); add role↔scope assignment |
| `backend/prisma/schema.prisma` | `Request.newOwnerId` is a bare string, no FK | Make `owner`/`newOwner` relations; require `ownerId`; add transfer endpoints (from/to) |
| `backend/prisma/schema.prisma` | `AuditItemResultRow` has no unique key | Add uniqueness; make audit rows append-only |
| `backend/src/routes/auth.ts` | `POST /auth/register` is ADMIN-only immediate create | Convert to account **request**; add approve/reject; keep `mustChangePassword` on creation |
| `backend/src/routes/users.ts` | promote only, no demote | Add approve/reject, role assignment, and demote; all audited |
| `frontend/src/features/admin/AdminUsersPage.tsx` | Admin creates users with temp password | Became "Account requests" inbox (approve/reject + role assignment) |
| `frontend/src/features/items/*` | Admin can add items | Remove register for admin; expose only to property roles |
| `frontend/src/features/requests/RequestFormPage.tsx` | No request types | Add typed requests (§9.3) + role gating |
| `frontend/src/features/requests/*` (list) | Shows everything | Add time-window filter + totals export |
| `frontend/src/features/audits/*` | Plain list | Add filters, grouping, sort, date-range |
| `frontend/src/features/reports/ReportsPage.tsx` | "Totally not working" | Rebuild by role × audience (§11.2) |
| `frontend/src/features/public/*`, `items/ItemsBrowsePage.tsx` | Full details public | Enforce classification/visibility; category-only for public |
| QR scanner (desktop) | Present on web | **Remove from desktop**; keep mobile-only |
| Buildings | Grouped by name only | Add building **image** to each group |
| Map | Placeholder | Optional: scoped real map (§13) |

> **Note:** the existing forced-password-on-first-sign-in behavior stays and is reused by the new
> approved-account flow.

---

## 13. The two optional items (supervisor #6, #7)

- **#7 Building images (low cost, high polish):** add `Building.imageUrl`; when browsing by
  building, render the image as the group header. Straightforward win.
- **#6 Real map:** scope it to *campus navigation* — plot buildings on a campus map and highlight
  where a grouped item lives. Keep it behind a flag so it never blocks core delivery; if we cannot
  source real campus coordinates, fall back to a schematic campus plan rather than a fake map.

---

## 14. Implementation roadmap

**Phase A — Foundations (must do first; unblocks everything)**
1. Design & migrate `OrgUnit` hierarchy (University→Campus→College→Department).
2. Expand `Role` enum to the 10 roles; add role↔scope.
3. Build the permission matrix as a single, server-enforced policy module.
4. Convert `POST /auth/register` into an **account-request + approval** flow.
5. Make `ownerId` required; fix `AuditItemResultRow` uniqueness; append-only audit.

**Phase B — Property workflows**
6. Item registration restricted to property roles; add classification + visibility.
7. Request types (§9.3) with role gating; time-windowed request list.
8. Transfer (dept/individual, from→to, approvals) and disposal (board approval).
9. Multiple-request queue policy.
10. Inventory logic (stock / fixed / heritage) with count & sign-off.

**Phase C — Oversight & UX**
11. Audit page: filters, grouping, sort, date-range, export.
12. Reports rebuilt by role × audience (dept → college → campus → university → MoF/FPPA → audit).
13. Remove desktop scanner; keep mobile-only.
14. Building images on browse; optional scoped map.

**Phase D — Compliance hardening**
15. Public visibility enforced server-side; penetration/authorization tests.
16. MoF/FPPA-ready report formats; OFAG evidence packs.
17. Documentation: policy manual mapping each control to the law.

**Suggested sequencing rationale:** Phase A changes the data model, so doing it first avoids
rework; Phases B–C deliver the visible fixes the supervisor asked for; Phase D makes it defensible
in an audit.

---

## 15. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Hierarchy mapping is wrong | Roles/permissions wrong everywhere | Validate the AAU org tree with the supervisor/AAU **before** Phase A migration |
| Role explosion confuses users | Slow adoption | Ship with a documented role→persona guide; keep the permission matrix visible in the UI |
| Overscoping the map (#6) | Delays core work | Flag-gate it; fall back to schematic plan |
| IFMIS integration assumptions | Reports may not reconcile | Confirm with AAU finance what MoF expects; design exports to be IFMIS-friendly |
| Migration of existing items/users | Data loss / wrong roles | Dry-run migration; keep the existing forced-change flow and back up first |
| Legal detail is complex | Compliance gaps | Cite the law in the policy manual; have the supervisor confirm interpretations |

---

## 16. Compliance traceability matrix (supervisor → design)

| # | Supervisor point | Addressed in |
|---|---|---|
| 1 | Split staff into ≥2 types | §7 (roles), §9.2 |
| 2 | Admin must not add items | §2, §7, §9.2 |
| 3 | Admin only approves accounts; staff request | §9.1 |
| 4 | Map the real university/campus hierarchy | §4, §6 |
| 5 | Limit public visibility; item classification | §10 |
| 6 | Real map (optional) | §13 |
| 7 | Building image on browse (optional) | §13 |
| 8 | `ownerId` required; current vs future owner | §9.5 |
| 9 | Transfer types (dept/individual), explicit from→to | §9.4 |
| 10 | Multiple requests for one item | §9.6 |
| 11 | Explicit, role-based request types | §9.3 |
| 12 | Requests by time window + totals report | §9.3, §11.2 |
| 13 | Remove desktop scanner (mobile-only) | §12 |
| 14 | Inventory logic | §9.7 |
| 15 | Audit page: filter, classify, sort, date-range | §11.1 |
| 16 | Reports rebuilt by role × audience (campus/MoF) | §11.2 |

---

## 17. Open questions for the supervisor / AAU

1. **Exact AAU org tree** — confirm campus list, college list, and how campuses map to colleges.
2. **Who is the "approver" of accounts?** Registrar, HR, or IT? Which single role?
3. **Disposal authority** — which body/board approves, and at what value threshold?
4. **MoF/FPPA report format** — do they require a specific fixed-asset movement format, or is an
   IFMIS-style export acceptable?
5. **Priority policy** for competing requests (§9.6) — which rule does AAU actually use?
6. **Heritage assets** — should the Institute of Ethiopian Studies holdings be in scope?

---

## 18. References

**International university practice**
- The George Washington University — Fixed Asset Management Roles:
  https://controller.gwu.edu/fixed-asset-management-roles
- Drexel University — Role of the Fixed Asset Custodian:
  https://drexel.edu/comptroller/general-accounting/fixed-assets/role-of-the-custodian
- Sacramento State — Roles & Responsibilities in Managing University Property:
  https://www.csus.edu/administration-business-affairs/internal/property-management/roles-responsibilities.html
- Morgan State University — Property & Accountable Officers:
  https://www.morgan.edu/procurement-and-property-control/property-control/property-and-accountable-officers
- Stanford — Property Management Office, Roles and Responsibilities:
  https://ora.stanford.edu/ora-units/property-management-office/property-management-manual/12-roles-and-responsibilities

**Ethiopian law and manuals**
- Proclamation No. 1333/2024 (Federal Public Procurement and Property Administration):
  https://www.ppa.gov.et/wp-content/uploads/2024/10/Procurement-and-property-proclamation-2024-.pdf
- Proclamation No. 649/2009 (repealed predecessor): https://policyvault.africa/policy/the-ethiopian-federal-government-procurement-and-property-administration-proclamation/
- FPPA — Stock Management Manual (English):
  https://www.ppa.gov.et/wp-content/uploads/2024/09/Stock_Management_Manual_English.pdf
- Government-Owned Fixed Asset Management Manual (GOFAMM):
  https://www.amharabofec.gov.et/media/documents/Manual_GOFAMM.pdf
- FPPA — Property documents: https://www.ppa.gov.et/document-category/property-docs/
- Federal Government Internal Auditors Directive No. 47/2016 (internal reporting/independence);
  OFAG established by Proclamation No. 68/1997.
- Ministry of Justice — Higher Education Proclamation No. 1152/2019:
  https://justice.gov.et/en/law/higher-education-proclamation-no-1152-2019/

**Accounting standards**
- IPSAS 45, Property, Plant, and Equipment (replaces IPSAS 17, incl. heritage assets):
  https://www.ipsasb.org/publications/ipsas-45-property-plant-and-equipment
- GASB 34/104 (capital asset reporting/disclosure):
  https://gasb.org/page/pronouncement?pageId=/standards-and-guidance/pronouncements/summary-statement-no-104.html

**AAU**
- Addis Ababa University — official site: https://www.aau.edu.et/
- AAU structure (colleges, institutes, campuses, leadership): AAU official pages and Wikipedia
  overview https://en.wikipedia.org/wiki/Addis_Ababa_University

---

*This is a design plan, not yet implemented. Phase A (§14) should not start until §17 questions
are answered, to avoid rework.*
