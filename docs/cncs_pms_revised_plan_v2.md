# CNCS Property Management System: Revised Change Plan (v2)

Supersedes `cncs_pms_change_specification.md` (v1). It folds in the team's spec review, Lalu's comments on both documents, and Lalu's answers to the follow-up questions. It contains no code. Each item is written so it can become a directional agent prompt.

## Legend

- DECIDED: stated or accepted by Lalu.
- RECOMMENDED: my proposal, not yet confirmed. Treat as the default and change freely.
- OPEN: needs an answer from the supervisor, the team or IT. Not specified here. My recommendation is given, clearly unconfirmed.
- OUT OF SCOPE: excluded for now.

"College" means CNCS. College and campus are the same level. One campus only.

---

## 0. What changed since v1

1. Account Admin is kept as a separate role (the proposal to merge it into System Admin is dropped).
2. Department heads can hold property and claim it like any other user.
3. Scan visibility is restricted by role. Staff see only their own items.
4. Tracking rule defined: every durable (non-consumable) unit is tracked, with no value threshold. Consumables and expiring goods are out of scope.
5. Loans (issue and return) added as a new feature.
6. Email provider chosen (Resend). Registration email verification is kept.
7. Public side gets both a buildings list and a static "about" page.
8. Handover verification added when a department head is replaced (department-held items only).
9. Audit workflow written out, plus audit and requests page behaviours, dashboards and a report catalogue.
10. Integrity, security and operations items accepted from the team review.
11. Maintenance, calibration, incidents, auction and proceeds, consumables and SSE are out for now.
12. Finance and statutory items are recorded as OPEN, with plain-language questions for the supervisor.

---

## 1. Scope and principles

1. Track every non-consumable asset: anything that does not run out or get used up. Pens, paper and ink are out. Durable small items are in. No minimum value (no capitalisation threshold). (DECIDED)
2. Each physical unit gets its own tag and record. Forty chairs means forty records. (DECIDED)
3. Only the Property Officer creates items, straight after purchase, once the item is physically present. (DECIDED)
4. Higher levels get visibility and notifications. They never get decision rights over a department's matters. (DECIDED earlier)
5. Nothing is hard-deleted. Corrections use VOIDED. Retirement uses DISPOSED. (DECIDED)
6. Logs are append-only and enforced at the database level, not only by policy. (RECOMMENDED, accepted from review)

---

## 2. Roles and organisation

### 2.1 Role set (DECIDED)

1. SYSTEM_ADMIN: technical + account administration. Seeds the first Account Admin (now merged), manages system configuration, invites privileged accounts (Department Heads, Property Officer, Auditors, other System Admins), approves/rejects staff registrations, deactivates Department Heads and Auditors, resolves account issues. Sees no asset data.
2. PROPERTY_OFFICER: the single college-level role. Registers and imports assets, finalises disposals, records cross-department transfers, manages buildings and the about page content, investigates losses.
3. DEPARTMENT_HEAD: scoped to one department. Approves staff registrations, approves transfers and loans, recommends disposals, deactivates staff in their own department. Can also hold property personally and claim it like staff. (DECIDED)
4. STAFF: scoped to one department. Claims and holds assets, initiates transfer, disposal and loan requests, edits condition and notes of items they hold.
5. AUDITOR: belongs to the Office of Auditors (a unit with no head for now). Conducts audits.

Rules:
- One person cannot hold both PROPERTY_OFFICER and AUDITOR. Enforced in the data model.
- The role model is a single role enum plus department scope. Earlier chat ideas about separate admin and staff enums are dropped. (DECIDED)
- Self-deactivation is blocked for every role.
- Every account-admin and system-admin action is logged.

### 2.2 Permission matrix (summary)

| Capability | SYS_ADMIN | ACCT_ADMIN | PROP_OFFICER | DEPT_HEAD | STAFF | AUDITOR |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Create or import assets | no | no | yes | no | no | no |
| Edit identity and financial fields | no | no | yes | no | no | no |
| Edit condition and notes | no | no | no | held items | held items | no |
| Add or replace photo | no | no | yes | held items | held items | no |
| Claim assigned items | no | no | college items | department items and own | own | no |
| Approve transfer | no | no | cross-dept record, head-held items | own department | no | no |
| Approve loan | no | no | college items | own department | no | no |
| Recommend disposal | no | no | no | yes | no | no |
| Finalise disposal | no | no | yes | no | no | no |
| Void an item | no | no | yes (limited) | no | no | no |
| Approve staff registration | no | no | no | own department | no | no |
| Invite privileged accounts | no | yes | no | no | no | no |
| Deactivate staff | no | no | no | own department | no | no |
| Deactivate heads and auditors | no | yes | no | no | no | no |
| Deactivate account admins | yes | no | no | no | no | no |
| Run audits | no | no | no | no | no | yes |
| Request an audit | no | no | yes | yes | no | n/a |
| Manage buildings and about page | no | no | yes | no | no | no |

### 2.3 Organisational data

1. Add a Department entity (name, code, active flag). Remove the free-text `department` on Item and in forms.
2. Add the Office of Auditors as a unit with no head.
3. An item's department is derived from its holder, never typed in. This closes the hole where any staff member can change an item's department.

### 2.4 Scan visibility (DECIDED)

| Who scans | What they see |
| :--- | :--- |
| Unauthenticated | The login page, identical for every tag including nonexistent or disposed ones. No tag information is ever revealed. |
| STAFF | Full details of items they hold. For any other item: "Not assigned to you, contact Property Office", and nothing else (no custodian, no location). |
| DEPARTMENT_HEAD | Items held by their department, by its staff and by themselves. Others as STAFF. |
| PROPERTY_OFFICER | Every item's details. |
| AUDITOR | Items inside an active audit scope, for verification only. Others as STAFF. |
| SYS_ADMIN, ACCT_ADMIN | No asset data. Same message as STAFF. |

1. The QR scanner is available on mobile only. (DECIDED, from supervisor review)
2. Desktop gets a manual tag-ID lookup that follows the same visibility rules. (DECIDED)
3. Which fields a staff member sees on their own items (for example hiding purchase cost and current value): OPEN. Recommendation: identity, location, condition and custody history visible, financial fields hidden from staff.

---

## 3. Authentication and onboarding

### 3.1 Staff self-registration (DECIDED)

1. A person registers with full name, email, staff ID, department (from the list) and their own password. The role is always STAFF. The department head confirms the department at approval.
2. Account states: PENDING_EMAIL_VERIFICATION, PENDING_APPROVAL, ACTIVE, REJECTED, DEACTIVATED.
3. Email verification (single-use link) must complete before the request appears in the head's queue. It prevents queue spam and use of another staff member's email. This is kept even when delivery is imperfect (see 3.5).
4. The department head approves or rejects. How the head verifies identity is outside the system.
5. Approval records the approver, timestamp, confirmed department and optional note. Rejection requires a reason.
6. The decision is emailed. The email contains status and a sign-in link only, never a password.
7. The system is the source of truth. A pending or rejected user who signs in with correct credentials sees their status and the rejection reason.
8. A rejected applicant can reapply. The rejection record is kept.
9. Pending and rejected accounts cannot sign in or use password reset to become active.

### 3.2 Privileged accounts (DECIDED)

1. Heads, Property Officer, Auditors, Account Admins and System Admins are never self-registered.
2. The Account Admin invites Heads, Property Officer, Auditors and other Account Admins. The first System Admin is seeded, and the System Admin seeds the first Account Admin.
3. The invite email carries a single-use, expiring link. The invitee sets their own password. No admin ever sees or sets a password.

### 3.3 Forgot password and recovery (DECIDED, details RECOMMENDED)

1. Request by email. The response is identical whether or not the address exists.
2. Single-use token, stored hashed, short expiry (about 30 minutes). A new token invalidates earlier ones.
3. Rate limits per email and per IP on reset requests and on login.
4. A successful reset increments `tokenVersion`, so existing sessions die.
5. Works for ACTIVE accounts only.
6. For staff without a working inbox, the Account Admin can trigger a reset link. Admins never set passwords.
7. Remove `mustChangePassword` and the admin-registers-with-password route.

### 3.4 Deactivation (DECIDED)

1. The department head deactivates staff in their department. The Account Admin deactivates heads and auditors. The System Admin deactivates Account Admins.
2. Deactivation is immediate and invalidates tokens.
3. Custody handling is in 4.6.
4. A change of role bumps `tokenVersion`. (RECOMMENDED, from review)

### 3.5 Email delivery with Resend (provider DECIDED, setup OPEN)

1. Provider: Resend, free tier. (DECIDED)
2. Constraints to design around (verify against the current Resend pricing and docs page before relying on them):
   - Free tier: 3,000 emails per month, but only 100 per day, and one verified domain.
   - Sending to arbitrary recipients requires a verified sending domain with DNS records (SPF and DKIM). Without it, mail either cannot be sent to real staff or lands in spam.
   - Each recipient counts separately toward the quota.
3. Blocker: the team must control a domain, or a subdomain, with DNS access for the Resend records. (OPEN, see Section 19)
4. Which email domains registration accepts (AAU only, or any): OPEN. Recommendation: AAU addresses only, if all staff have one.
5. Planning note (RECOMMENDED): a registration costs at least two emails (verification and decision). At 100 per day that is about 50 registrations a day, so stagger rollout by department over several days, and queue and retry sends rather than failing when the daily cap is hit.
6. Mitigations for spam-folder delivery (RECOMMENDED): the verification page says "check your spam folder", resend is available with a cooldown, and in-app status always shows the true state.
7. Email templates: verify email, registration decision, invite, password reset, reset-completed notice.
8. Emails are used only for onboarding, invites and password reset. Everything else is in-app.

---

## 4. Assets, holders and custody

### 4.1 Holder model (DECIDED)

1. Replace the single `ownerId` with a holder that is exactly one of: a staff member (including a department head personally), a department, or the college.
2. Department-held items belong to the department. The head is responsible but not the holder personally. The head claims on the department's behalf.
3. College-held items are held by the Property Office. The Property Officer is accountable.
4. Staff-held items roll up into their department on audits and reports.

### 4.2 Item states

PENDING_CLAIM, ACTIVE, REVERTED_UNVERIFIED, LOST, DISPOSED, VOIDED.

1. There is no registered-but-not-received state. Items are entered once purchased and physically present. (DECIDED)
2. Transfers and loans are tracked through their own records, not item states.
3. DISPOSED items stay in the database permanently and leave the active scope.

### 4.3 Creation (DECIDED)

1. Only PROPERTY_OFFICER creates items. `POST /items` is removed for STAFF.
2. Creating an item assigns a holder and puts it in PENDING_CLAIM. The tag is generated at creation.
3. Acquisition (purchase) date is a required field at creation. (RECOMMENDED. It is needed for any later value reporting.)
4. A voided tag is never reused. (RECOMMENDED, from review)

### 4.4 Claim handshake (DECIDED, one detail OPEN)

1. The holder must claim. Staff holders claim their own items. Department-held items are claimed by the head for the department. Head-held items are claimed by the head.
2. Refusing a claim returns the item to the college pool with a mandatory reason.
3. An unclaimed item reverts to the college pool after 14 days. Imported batches are exempt from expiry. (exemption OPEN, recommendation: yes)
4. Every claim, refusal, expiry and reversion is logged.

### 4.5 Photos (DECIDED)

1. No photo column in CSV imports.
2. The holder scans the QR code and uploads a photo at claim time, through the existing camera upload.
3. Photos are encouraged, not required. The holder and the Property Officer may add or replace a photo. (RECOMMENDED, an exception to the edit rules in 4.7)
4. Storage limits and retention for item images: OPEN.

### 4.6 Custody history (RECOMMENDED structure)

1. An append-only custody event log: item, event type, from holder, to holder, acting user, timestamp, reason, and a snapshot of the responsible department head at that moment (or "vacant").
2. Rows are never updated or deleted. This is the evidence base for loss and liability.

### 4.7 Deactivation and head replacement (DECIDED)

1. When a staff member is deactivated, their items move to their department in REVERTED_UNVERIFIED and the account is deactivated at once. The department head verifies and claims them. The department can then transfer them to the Property Office or another user.
2. Items not found on verification become LOST, with the departed staff member recorded as last verified custodian.
3. Items held personally by a deactivated head revert to the department the same way.
4. When a new head is activated for a department that had a head, all department-held items move to REVERTED_UNVERIFIED for the new head to verify. Staff-held items are not touched. (DECIDED)

### 4.8 Edits (DECIDED)

1. Property Officer edits identity and financial fields.
2. Custodians edit only condition and notes of items they hold, plus photo (4.5).
3. Location and holder change only through the transfer process.
4. Every edit is logged.
5. Allowed values for `condition`: OPEN. Recommendation: a fixed list (for example NEW, GOOD, FAIR, POOR, DAMAGED), not free text.

### 4.9 Void instead of delete (DECIDED)

1. Remove `DELETE /items/:id` and its cascade deletes.
2. VOIDED means the record should never have existed. It needs a mandatory reason, records who voided it, is hidden from normal lists and excluded from totals, and is never deleted.
3. Allowed only while the item is unclaimed with no transfer history. After that the only exit is disposal. Property Officer only.

### 4.10 Lost items and liability (DECIDED)

1. An item becomes LOST through an audit MISSING result, a failed verification after deactivation or head replacement, or a Property Officer report.
2. The Property Officer investigates. The system shows the custody timeline and last verified custodian. It does not decide fault.
3. Liability is an explicit Property Officer determination with a reason, recorded only after the custodian has had a chance to respond.
4. For department-held items the record is associated with the department and stores who the head was at the time of loss.
5. Payment is outside the system.
6. Recovery is a logged state change, never a deletion.

---

## 5. Transfers and disposal

### 5.1 Transfers

1. Initiated by the current custodian. (DECIDED)
2. Within a department: the head approves, then the receiving custodian claims. (DECIDED)
3. Across departments: the releasing head and the receiving head approve, then the Property Officer records it, then the receiving custodian claims. (DECIDED)
4. Head-held items: the Property Officer approves, since a head cannot approve their own request. (DECIDED)
5. Department-held items: the head initiates, so a second approver is needed. Recommendation: the Property Officer. (OPEN)
6. Auditor-held items have no head. Recommendation: the Property Officer approves transfers and verification. (OPEN)
7. The approver for each stage is resolved server-side from the item's holder and department. Never trust the client. No role approves outside its scope, including any admin. (DECIDED)
8. Only one open transfer or disposal request per item. A second request is blocked until the first is closed. (RECOMMENDED, from review)

### 5.2 Disposal (DECIDED)

1. The custodian (or head for department-held items) initiates, the department head recommends, and the Property Officer finalises.
2. The item becomes DISPOSED and returns to the college as disposed. It is then out of scope.
3. What happens after disposal (garage, auction, sale, proceeds) is second priority. (OUT OF SCOPE for now)
4. A second signature or committee above a value threshold: OPEN. It needs the threshold and a legal answer from the supervisor. Do not cite any directive until confirmed.

### 5.3 Request model changes

1. Per-stage approver and decision records, stage status and department scoping.
2. Rejection reasons are mandatory.
3. Aging of pending requests is shown on dashboards (Section 10).

---

## 6. Loans (new, DECIDED as a first version, to improve in review)

1. A loan is a temporary possession record. Custody, holder and accountability do not change.
2. The borrower is a registered, ACTIVE staff member. Students and outsiders come later.
3. Only ACTIVE items can be loaned. Items in a pending transfer or disposal request, or in PENDING_CLAIM, REVERTED_UNVERIFIED, LOST, DISPOSED or VOIDED, cannot.
4. The holder approves. For department-held items the head approves. For college-held items the Property Officer approves.
5. A due date is mandatory.
6. Overdue status is derived from the due date. Overdue loans notify the holder and the head.
7. The return records the condition and notes. A change in condition is logged.
8. While on loan an item cannot be transferred, disposed or voided. (RECOMMENDED)
9. An audit shows a loaned item as "on loan to X". (RECOMMENDED)
10. Loss during a loan follows the lost-item workflow in 4.10. The holder remains accountable by default, and the loan record appears in the timeline.
11. The borrower acknowledges receipt in the app. (RECOMMENDED)
12. Gate pass for off-campus movement: OUT OF SCOPE for the first version.
13. The loan history is append-only.

---

## 7. Bulk CSV import (DECIDED)

1. Property Officer only. Supports all holder types: individual staff, department, college.
2. Columns: name, category, brand, model, serial, purchase cost, acquisition date, condition, building, floor, room, holder type, holder identifier (staff ID or email, department code, or the college marker). No photo column.
3. Flow: upload, dry-run preview showing every row error, then commit. The commit is all-or-nothing per batch.
4. Validation: unknown staff or department rows are rejected. Staff holders must have ACTIVE accounts, otherwise assign to the department and let the head distribute. Duplicate serials are detected within the file and against existing items.
5. Each import gets one batch ID, shown in the audit and custody logs. Tags are generated and a printable QR sheet is produced.
6. Each holder gets one notification and one claim per upload, covering only their items from that upload.
7. The holder reviews the claim and can accept everything, accept with per-item exceptions (each with a reason), or reject the whole claim with a reason. Exceptions and rejections return to the college pool.
8. Photos are added later through the claim review (4.5).
9. Size and row limits must respect serverless request limits.
10. CSV injection is guarded on both import and export. (RECOMMENDED, from review)

---

## 8. Public access (DECIDED)

1. Remove every unauthenticated item route: browse, search, by-tag lookup and public map grouping. Remove the public-field filter path and the 410 Gone behaviour.
2. There is no guest role. An anonymous request gets a login page or one of the public pages below.
3. Public page one: a static "about this system" page with no asset data: what it is, who may use it, how to request an account, the Property Office contact and the sign-in link.
4. Public page two: a buildings list (name, type, description). The Property Officer maintains it. It shows no rooms, asset counts or coordinates.
5. The review points out that a bare list does not do wayfinding. It becomes useful as a directory once the map exists.
6. QR sticker URLs open the app. Unauthenticated visitors see the same login page for any tag.
7. Adapt `optionalAuthenticate` to serve the public pages only.
8. Map (not an immediate priority): if built, a pin for the user's position on a map of the college, with free libraries if more is needed. This is wayfinding between buildings, not live tracking, and the word "tracking" should not be used for it. (DECIDED)

---

## 9. Audit

### 9.1 How audits work (short summary for the team)

1. Request (optional): a department head or the Property Officer requests an audit with a scope and reason. Only auditors run audits. (DECIDED)
2. Start: an auditor chooses the scope: department, college-wide, or building (the existing building scope stays). The system freezes the list of in-scope items at that moment, so moves during the audit do not change the outcome. (freeze RECOMMENDED)
3. Exclusions: items held by auditors are excluded, and the report states "excluded: N items held by auditors". (DECIDED as a limitation)
4. Verify: the auditor walks the area and scans each item on a mobile device. Each item gets a result: found, found at a different location, condition mismatch, or missing. Photo and note are optional. Scans of items outside the frozen list are recorded as "unexpected".
5. Loaned items show as "on loan to X". (RECOMMENDED)
6. Close: the system compares results against the frozen list and produces the variance summary.
7. Follow-up: every MISSING item enters the lost-item workflow (4.10). Location and condition mismatches become findings for the holder to resolve through the normal process. They never silently edit the item. (RECOMMENDED)
8. Report: the closed audit report is immutable and is never recomputed from live data. The Property Officer acknowledges it.
9. How often audits happen and who initiates them in practice: OPEN (supervisor).

### 9.2 Audit page (DECIDED, from supervisor review)

1. Filtering, grouping by department, sorting, and a date-range selector.

### 9.3 Requests page (DECIDED, from supervisor review)

1. A time window selector. Totals are shown separately from history.

### 9.4 Reports and audits as a contract (RECOMMENDED)

1. Audit result feeds the audit report (immutable), the loss workflow and its loss report, and dashboard variance counts.
2. Closed audit reports are never recomputed. Live reports always read current data and say so.

---

## 10. Reports, dashboards and the request flow

A report is a summary of data that a person can view on screen and export. The catalogue below is my proposal. Your interviews did not name specific reports, so strike what you do not need. (RECOMMENDED)

### 10.1 Report catalogue by role

| Role | Reports |
| :--- | :--- |
| STAFF | My items; my pending claims, loans and requests |
| DEPT_HEAD | Department asset register (including staff-held roll-up); department requests by status and age; department custody changes; department loans and overdue; department audit results; department lost items |
| PROPERTY_OFFICER | College asset register by status, holder and building; transfers and disposals; loans and overdue; loss and liability; import batches; voided items; audit summary across departments |
| AUDITOR | Audit reports; variances; exclusion list |
| ACCOUNT_ADMIN, SYSTEM_ADMIN | Account status counts (pending, rejected, deactivated); admin action log. No asset reports. |

### 10.2 Report flow

1. Choose a report, set filters (date range, department, status), preview, then export as CSV or PDF.
2. Scope is enforced server-side by role. Staff see only their own data and heads only their department.
3. CSV and PDF share the same columns.
4. Exports are logged, and exports are guarded against CSV injection.

### 10.3 Dashboards and KPIs (DECIDED, from supervisor review)

1. Counts by status, overdue loans and claims, audit variances, and pending approvals by age.
2. Each role sees only the numbers within its scope.
3. Escalation of aging approvals: higher levels get a notification, not decision rights. The number of days is OPEN.

---

## 11. Notifications

1. Real-time updates use polling. A lightweight unread-count endpoint is polled every 30 seconds, with a refetch when the tab regains focus. SSE is not used. (DECIDED)
2. Email is only for onboarding, invites and password reset.
3. A batch claim from an import sends one notification per holder per upload.
4. Preferences (instant or digest), delivery failure handling and notification language: OPEN. Recommendation: instant in-app notifications, English first, Amharic later.

---

## 12. Integrity, security and operations (accepted from the team review)

| Item | Status | Note |
| :--- | :--- | :--- |
| Optimistic locking on items and requests | RECOMMENDED | A version counter so two officers cannot silently overwrite each other |
| DB-level uniqueness on serial, tag and audit result rows | RECOMMENDED | Not only application checks |
| Append-only logs enforced in the database | RECOMMENDED | Restrict UPDATE and DELETE on log tables |
| Log retention period | OPEN | Needs a supervisor or IT answer |
| One open request per item | RECOMMENDED | See 5.1 |
| Authorization (IDOR) tests on every read | RECOMMENDED | Per role, per scope |
| `tokenVersion` bump on role change | RECOMMENDED | See 3.4 |
| Rate limits beyond login and reset | RECOMMENDED | Import, export and scan endpoints |
| Security headers, CSRF and XSS review | RECOMMENDED | |
| Secrets management and dependency scanning | RECOMMENDED | |
| Pagination and search under load | RECOMMENDED | |
| QR tag lifecycle | RECOMMENDED | Never reuse a voided tag |
| Demo data policy | RECOMMENDED | One seed script, one reset command, and a hard rule that real staff or student data never enters a demo |
| Privacy and data-protection section | RECOMMENDED | A short statement of what personal data is held and why |
| MFA | OPEN | Recommendation: for admin roles and the Property Officer |
| Sessions (1-day token, no refresh) | OPEN | Recommendation: a short access token with a rotating refresh token, or record the 1-day decision as an accepted risk |
| Backups and disaster recovery, monitoring, staging versus production, uptime target | OPEN | IT or supervisor |
| Named owner for production | OPEN | |
| Printable official forms | OPEN | Supervisor |
| Attachments, vendor and warranty information | OPEN | Second priority |
| Offline mobile scanning, Amharic, accessibility | OPEN | Second priority |

---

## 13. Finance and statutory (OPEN, nothing specified yet)

Plain-language meaning:
1. **Depreciation**: the recorded value of an item falls as it ages. Today "current value" is typed by hand and nobody keeps it up to date, so value reports are unreliable.
2. **Fiscal year**: the accounting year (Hamle 1 to Sene 30). Reports are normally "as at year end".
3. **IFMIS and Ministry of Finance format**: the government accounting system and the report format it may require.

Questions for the supervisor:
1. Does the college report asset values upward (to the university or the Ministry of Finance), and in what format?
2. Should item values age automatically, and by what rule?
3. Are heritage or antique items in the register?

Interim rule until answered (RECOMMENDED): store purchase cost and acquisition date, and label "current value" as a manual estimate or leave it out of reports.

Also OPEN: fiscal year and period handling, IFMIS reconciliation export, revaluation and impairment, held-for-sale, book or carrying amount.

---

## 14. Data model delta (descriptive)

1. `Role` replaced by the six-role set. Department scope on users. Account status.
2. New Department.
3. Item: remove `ownerId` and the free-text department. Add holder type and reference, extended status enum, acquisition date, version counter, void and lost metadata.
4. New CustodyEvent (append-only).
5. Request: stage approvals, department scoping, single-open-request rule.
6. New Loan (append-only history).
7. New ImportBatch, linking items created by an upload.
8. New Building (name, type, description; coordinates added with the map).
9. New tokens for email verification, invites and password reset, stored hashed with expiry.
10. User: remove `mustChangePassword`. Keep `tokenVersion`.
11. New LossRecord (liability determination, custodian response, department head snapshot).
12. Audit sessions store the frozen item list and immutable results.
13. New admin action log.

---

## 15. Removed or changed existing behaviour (checklist)

1. `DELETE /items/:id`: removed.
2. `POST /items` by STAFF: removed.
3. `PUT /items/:id`: department no longer editable. Field permissions per 4.8.
4. Admin register route with admin-chosen password: replaced by Section 3.
5. `mustChangePassword`: removed.
6. Any admin approving any request: removed.
7. Public item routes, 410 behaviour, public map grouping: removed.
8. Free-text department strings: replaced by Department entities.
9. SSE: not built. Polling instead.

Migration: the system appears pre-production with demo tags. Recommendation: reset and re-seed rather than migrate. If real records exist, existing ADMIN users, string departments and `ownerId` values need an explicit mapping first. (OPEN)

---

## 16. Out of scope for now

1. Consumables and expiring goods.
2. Maintenance, calibration, incidents, warranty and insurance expiry alerts.
3. Auction, sale and proceeds after disposal.
4. Gate pass for off-campus movement.
5. Students and outsiders as loan borrowers.
6. Cross-college transfers.
7. SSE or any push channel.
8. Handling of an absent or acting department head.

---

## 17. Known limitations (documented, deferred)

1. No handling for an absent or acting department head. Pending approvals wait.
2. Items held by auditors are not audited. Reports list them as an exclusion.
3. One campus only.
4. Disposal has a single Property Officer sign-off until the supervisor answers the threshold question. The Property Officer registers assets and also finalises their disposal, a segregation-of-duties weakness mitigated by auditor independence and append-only logs.
5. Email delivery to institutional addresses may be unreliable. In-app status is the fallback.
6. The free email tier caps sending at 100 per day, so onboarding must be staggered.
7. The interactive map is not built yet.
8. The original brief cites NIST SP 800-88 (media sanitisation, not asset custody) and MOFED directives (unverified). Do not cite either in the final report without confirming.

---

## 18. Response to the team review

### 18.1 The team's seven questions

| # | Question | Response |
| :--- | :--- | :--- |
| 1 | Reports per role and flow | Added: Section 10, catalogue by role, flow and dashboards |
| 2 | Reports and audit | Added: Section 9.4, a contract between audit results, reports and the loss workflow |
| 3 | Email | Resend chosen. Verification kept. Domain and DNS access is the open blocker. Free-tier limits recorded (Section 3.5) |
| 4 | Guest role | No guest role. Public side is the about page plus the buildings list (Section 8) |
| 5 | Bulk import images | No CSV photo column. Photo upload at claim through the QR scan (4.5) |
| 6 | Neither person nor department; consumables | The college holder covers college-owned assets. Consumables, expiry and multi-unit stock are out of scope. Each unit is its own record |
| 7 | Map and location | Deferred. If built, a pin on a college map. It is not called tracking (8.8) |

### 18.2 Items to confirm from the chat

1. Who creates Account Admins: kept as in v1. The System Admin seeds the first, the Account Admin invites others, the System Admin can deactivate them. Earlier chat remarks are ignored. (DECIDED)
2. Two enums versus one role enum: one role enum plus department scope. (DECIDED)
3. Department record keeper: not needed. The Property Officer creates items and tags, and the holder claims. (DECIDED)

### 18.3 Supervisor's items

1. Audit page filters, grouping, sorting, date range: accepted (9.2).
2. Requests page time window with totals separate: accepted (9.3).
3. Mobile-only QR scanner: accepted (2.4).
4. Role dashboards and KPIs: accepted (10.3).

### 18.4 Lifecycle features

1. Loans: accepted as a first version (Section 6).
2. Maintenance, calibration, incidents: out of scope for the first phase.
3. Inventory regimes: consumables out of scope. Fixed assets only. Annual or cycle counting for fixed assets depends on the audit frequency answer.
4. Disposal destinations and proceeds: out of scope for now. Second priority.
5. Capitalisation threshold: none. Every durable item is tracked.

### 18.5 Finance and statutory

All OPEN (Section 13).

### 18.6 Integrity, control and operations

Accepted. See Section 12. The handover verification when a department head changes is built (4.7). The vacant or acting head fix is not built (limitation 17.1). The second signature above a value threshold is OPEN (5.2).

### 18.7 Decisions for the team

| Decision | Answer |
| :--- | :--- |
| Subdomain and DNS access | OPEN. This blocks email (Section 19) |
| Public side | About page plus buildings list. Map directory comes with the map |
| SSE or polling | Polling. One decision |
| Disposal authority and value threshold | OPEN. Supervisor |

---

## 19. Open items register

| # | Item | Owner | My recommendation |
| :--- | :--- | :--- | :--- |
| 1 | A domain or subdomain with DNS access for Resend | Team or IT | Required before real registration email can work |
| 2 | Accepted email domains at registration | Team | AAU addresses only |
| 3 | How often audits happen and who initiates them | Supervisor | Auditor-run, with requests from heads and the Property Officer |
| 4 | Disposal second signature or committee, value threshold, legal basis | Supervisor | Do not build until confirmed |
| 5 | Finance and statutory questions (Section 13) | Supervisor | Interim rule in Section 13 |
| 6 | Second approver for department-held transfers | Team | Property Officer |
| 7 | Approver for auditor-held items | Team | Property Officer |
| 8 | Imports exempt from the 14-day claim expiry | Team | Yes |
| 9 | Reset and re-seed versus migrate data | Lalu | Reset if only demo data exists |
| 10 | Fields staff see on their own items | Team | Hide financial fields |
| 11 | Photo rules (required or not, who may edit) and photo storage and retention | Team | Encouraged, holder and Property Officer edit, plan around the image host's limits |
| 12 | Allowed values for condition | Team | A fixed list |
| 13 | MFA scope | Team | Admin roles and Property Officer |
| 14 | Session design | Team | Short access token with refresh, or record the 1-day risk |
| 15 | Log retention period | Supervisor or IT | Decide before launch |
| 16 | Backups, monitoring, environments, uptime, production owner | IT or supervisor | Decide before launch |
| 17 | Notification preferences, failure handling, language | Team | Instant in-app, English first |
| 18 | Aging approvals: number of days before notifying higher levels | Supervisor | Decide with the supervisor |
| 19 | Privacy and data-protection requirements | Supervisor or university | A short statement in the report |
| 20 | Printable official forms | Supervisor | Ask which forms are required |
| 21 | Attachments and vendor information; offline scanning, Amharic, accessibility | Team | Second priority |
| 22 | Daily 100-email cap handling in onboarding | Team | Stagger rollout and queue sends |

---

## 20. Recommended build order

Tier 1, integrity core (everything else depends on it):
1. Role set, departments, account states, permission layer with scoped approver resolution, optimistic locking, DB-level uniqueness and append-only log enforcement.
2. Authentication rewrite: self-registration, verification via Resend, approval, invites, reset and deactivation.
3. Remove hard delete and public item routes. Add the about page and buildings list.
4. Holder model (including head-held items), Property Officer-only creation, claim handshake with photo upload, custody event log.
5. Scan visibility rules, mobile scanner, desktop manual lookup.

Tier 2, workflows:
6. Transfer and disposal chains with scoped approvals and the single-open-request rule.
7. Edit permissions, VOIDED, deactivation reversion and head-replacement verification.
8. LOST workflow and liability records.
9. Loans.

Tier 3, scale and reporting:
10. Bulk CSV import with batch claims.
11. Audit changes: frozen scope, results, report, audit page.
12. Reports, dashboards and the requests page.
13. Polling notifications.

Tier 4, deferred:
14. Interactive map (pin and college map), attachments and vendor information, offline scanning, Amharic and accessibility, finance and statutory items, post-disposal handling.

Cross-cutting, every tier: authorization tests for every read, rate limits, security headers, tests written in the same tier, and README or SRS updates when the tier lands.

---

## 21. Contradiction register — built vs. spec

This section records where code already shipped diverges from this v2 specification, so future agents and reviewers don't re-litigate decisions that are already in the repo.

### 21.1 Role set: 5 roles shipped, 6 roles in v2

**What v2 says (§2.1):** 6 roles — `SYSTEM_ADMIN`, `ACCOUNT_ADMIN`, `PROPERTY_OFFICER`, `DEPARTMENT_HEAD`, `STAFF`, `AUDITOR`. `ACCOUNT_ADMIN` is a distinct role from `SYSTEM_ADMIN`, responsible for inviting privileged accounts and approving account registrations. `SYSTEM_ADMIN` is technical only.

**What's built (migration `20261012010000_role_five_role_enum`, commit `d00324a`):** 5 roles — `SYSTEM_ADMIN`, `PROPERTY_OFFICER`, `DEPARTMENT_HEAD`, `STAFF`, `AUDITOR`. `ACCOUNT_ADMIN` does not exist. `SYSTEM_ADMIN` holds `ACCOUNT_MANAGE` capability and is the sole approver in the account-approval queue.

**Impact:** The account-approval queue endpoints (`GET /users/approvals`, `POST /:id/approve`, `POST /:id/reject`) all require `ACCOUNT_MANAGE`, which is granted only to `SYSTEM_ADMIN`. If the team adopts v2's 6-role model, this requires:
1. A new migration to add `ACCOUNT_ADMIN` back to the `Role` enum
2. Move `ACCOUNT_MANAGE` capability from `SYSTEM_ADMIN` → `ACCOUNT_ADMIN`
3. Add `DEPARTMENT_HEAD` as approver for staff registrations (scope-checked to their department)
4. Update seed data, test fixtures, and permission matrices across backend, frontend, and mobile

**Status:** OPEN — awaiting team decision before Phase B starts. This is a real migration cost either way.

### 21.2 Staff registration approver: SYSTEM_ADMIN in code, DEPARTMENT_HEAD in v2

**What v2 says (§3.1 item 4, §2.2 row 75):** "The department head approves or rejects" staff self-registrations. "Approve staff registration" capability = `DEPARTMENT_HEAD` (own department).

**What's built:** The account-approval queue is wired for `SYSTEM_ADMIN` as sole approver (`ACCOUNT_MANAGE` capability). No department-scoped approval exists.

**Impact:** If v2 is adopted, the queue needs department-scoped approval logic — a `DEPARTMENT_HEAD` should only see/decide requests for their own department, not college-wide.

### 21.3 Privileged account invites: SYSTEM_ADMIN in code, ACCOUNT_ADMIN in v2

**What v2 says (§3.2 item 2):** "The Account Admin invites Heads, Property Officer, Auditors and other Account Admins. The first System Admin is seeded, and the System Admin seeds the first Account Admin."

**What's built:** The `POST /auth/register` (admin invite) endpoint requires `ACCOUNT_MANAGE` → only `SYSTEM_ADMIN` can invite. No `ACCOUNT_ADMIN` role exists to separate this duty.

**Impact:** Same migration as 21.1 — if v2 is adopted, `ACCOUNT_ADMIN` must be added and `ACCOUNT_MANAGE` (invite/approval split) redistributed.

### 21.4 Recommendation for the team

Do not start the account-approval queue (Phase A item 4) or Phase B workflows until this is resolved. The contradiction is not a documentation discrepancy — it is a live schema difference with an applied migration and 430+ passing tests built against the 5-role model. Reverting it is a real cost; keeping it means explicitly diverging from Yanet's v2.

**Decision needed:** Adopt v2 (6 roles, ACCOUNT_ADMIN separate, DEPARTMENT_HEAD approves staff) → run a new migration + rework queue; OR keep 5 roles and update v2 to match the built system (SYSTEM_ADMIN approves everything, no ACCOUNT_ADMIN role).

---

## 22. Decision log
