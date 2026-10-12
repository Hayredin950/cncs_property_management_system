# Review of `cncs_pms_change_specification.md` + reply to send

**Internal note — delete everything above the line below before sending.**

*Snapshot taken before her reply. The next section is the current status; this table is kept so we can see what the gap looked like when it was raised.*

Coverage check of the 7 questions against the spec:

| # | Question | In the spec today | Verdict |
| :- | :-- | :-- | :-- |
| 1 | Reports per role + flow | Section 10, 5 bullets, columns only | **Not answered** |
| 2 | How reports and audit integrate | Only one indirect link (8.4 → LOST → 10.3) | **Not answered** |
| 3 | Email: verification, send, reset, provider, cost | Section 3.5, "choose a provider + SPF/DKIM" + 5 template names | **Not answered** |
| 4 | Guest role: remove or landing page | No GUEST in the 6 roles (correct); Section 7.2 still publishes bare building name/type/description to anonymous users | **Role: answered — no guest account exists.** Public **page: not justified** — a bare building list has no purpose; needs an info-only landing page, and the data list only makes sense with the Tier 4 map |
| 5 | Bulk import images | The words "image"/"photo" appear nowhere in the spec | **Not answered** |
| 6 | Items held by neither person nor department; consumables/expiring | Holder model covers staff/department/college (4.1); nothing on quantity, expiry, copies, non-department units | **Partly answered** |
| 7 | Location tracking & map | Deferred explicitly (7.6, 11.7, 13.8) | **Answered as deferred**; tracking semantics not defined |

---

## Yanet's reply, 11 Oct — decisions recorded

She went through the file in the group chat. Her standing rule: **anything in this doc she did not mention or challenge, we treat as agreed** — so the remaining items are accepted in principle and need writing into the spec, not re-asking. Agreed in principle is not implemented; the spec text still has to land.

| Item | Her answer (11 Oct) | Status |
| :-- | :-- | :-- |
| Email (Q3) | It's a good security feature and also protects against spam and against someone signing in with another staff member's email. Keep it and present with it **even if mail lands in spam**. | **Keep — decided.** The DNS/subdomain ask drops from blocker to nice-to-have; the in-app status fallback (3.1.7) carries it. Provider still to be chosen. |
| Consumables (Q6b) | Out of scope of this project. | **Out.** |
| Expiring items (Q6c) | Out of scope. | **Out.** |
| Library title vs copy (Q6c) | Not mentioned → agreed. | **Agreed in principle**, needs spec text. |
| Units with no head, fallback approver, acting head (6a) | Not mentioned → agreed. | **Agreed**; still needs the `Unit` change in the spec, which is what fixes 13.1. |
| Public building page (Q4) | Not addressed. Her only related comment is that the map is not an immediate priority. | **Still open — A or B now** (my vote B: a no-data landing page). C only exists together with the map, and then Property Office owns keeping hours, photos and coordinates current. |
| Map (Q7) | Not an immediate priority. If we do it: a pin showing where the user is, plus the college map. Free libraries cover anything more. | **Deferred, as written**; scope now defined, and still no GPS on assets. |
| Polling vs SSE (9.2) | Go with polling. SSE consumes more computing power; 30-second polling is not too bad. SSE only if we want millisecond response. | **DECIDED: polling.** |
| Loan | Implement it and improve it while reviewing. | **In for phase 1.** |
| Maintenance, calibration, incidents | Ignore them for the first phase — too many features to fix before them. | **Deferred past phase 1.** |
| Disposal destinations, proceeds, auction | Approval ends with the item going back to the college as disposed; from there it is out of scope (garage, auction, sale handled outside). Following it adds overhead. | **Out for phase 1, explicitly second priority.** The spec's DISPOSED final state (5.2) already matches. |
| What enters the register | Interviews track everything including pens and clippers; for us, track **every non-consumable asset and anything that does not run out**. | **Answered — non-consumables, no value threshold.** |
| Audit | She was partly overwhelmed during the meeting and asks for a short written summary of how the audit should work. | **To deliver** — plain-language summary in the reply block below. |
| Audit page, requests time window, mobile-only QR, inventory definition | Agrees with Nesredin's (supervisor's) points. | **In**; the inventory definition is answered by the non-consumable rule. |
| Scan visibility by role | Staff see the details of **their own** items on scan; property officers see **every** item's details; a department head can hold and claim items like any other user. | **New requirement** to write into 4.1, 4.3 and the 2.2 matrix. |
| Account Admin | "We can also completely remove the account admin and give their responsibilities to the system admin since it's not much responsibility." | **Open — needs the md owner.** It changes 2.1, 3.2, 14.1. |
| The three confirm-items (who creates Account Admins, two enums, record keeper) | "For the chat, ignore them. They were my first takes but the last claim is right. Only property officers create items… For the account related stuff, refer to the md file." | **Confirm items 2 and 3 are superseded by the md** (flat six-role enum stands; no record keeper; Property Officer creates, holder claims). Only the Account Admin question survives. |
| Finance and statutory (MoF/FPPA format, IFMIS reconciliation, depreciation, fiscal year) | Cannot answer — the corporate nature of the statements isn't clear to her. | **Needs another owner** (college finance office). |
| Everything else in this doc | "If questions on your file didn't get mentioned or challenged by this comment, assume I agree with them." | **Agreed in principle**; each item still has to be written into the spec. |

**Still open after her reply:** (1) Account Admin — remove it or keep it, and if removed the System Admin inherits the invite chain; (2) the finance/statutory block, which needs the college finance office; (3) the sending domain, now optional but still the difference between inbox and spam; (4) who writes the agreed items into the spec, and in what order; (5) the plan-vs-spec conflicts — three were decided on 12 Oct and the rest were corrected in the plan, see the next section.

---

## Plan vs spec — the conflicts, and how each one was closed (12 Oct decisions)

`docs/full-work-plan-and-roadmap.md` is a good plan and most of it follows the spec and her reply, but it disagreed with the spec it builds from in nine places — five of them hard enough to produce different software. **All nine are closed now:** three were decided by the team on 12 October, and the other six were slips against locked decisions, so the plan was corrected rather than re-argued. Both documents were patched the same day. Line references are kept as the record of what was wrong: **P** = plan, **S** = spec.

**The three decisions (12 Oct), and what they changed:**

1. **Role tiers — the spec wins, simplified.** College → department are the only live tiers; the campus and university tiers are cut for phase 1. Yanet's "one campus only" (S13.3) is the deployment reality, not a shortcut, and building unused tiers costs time this plan says the team does not have. `property-hierarchy-and-roles-plan.md` stays as the reference for a future AAU-wide rollout. → Plan §1 rewritten to the spec's six roles; the central/university report row removed.
2. **Account flow — the plan wins, no exceptions.** The admin-approval queue stays: staff request → `ACCOUNT_ADMIN` (or the merged `SYSTEM_ADMIN`) approves → account created. It is the supervisor's biggest flagged point on record, so an un-approved self-registration flow is out, and there is no good answer if it comes up at the demo. → Plan Phase A item 4 rewritten. **The spec now contradicts this decision:** 3.1 has the department head approving, and 3.3.7 / 12.5 keep `mustChangePassword`.
3. **Reports — frozen when official, live when internal.** Anything that leaves the system as a record is snapshotted at generation (the audit report locks at session close); dashboards stay live because they are working screens, not records. → Plan §8 and §15 updated.

| # | Topic | The plan says | The spec / her decision says | What it changes | My recommendation |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | Role set | P40: "9 roles" — adds `CAMPUS_PROPERTY_OFFICER` (P48), `PROPERTY_ADMIN` university-wide (P49) | S33–45 six roles; S44 "No campus-level role. Cross-college transfers do not exist"; S12 "college and campus are the same level here, scope is one campus"; S303 | The permission matrix, scope fields and transfer routing. These roles came from the roles plan (its L90, L239), which the spec deliberately collapsed | **DECIDED 12 Oct — spec wins.** One campus, six roles at the time; merged to five the same day (see §1 of the plan). The plan was patched. Re-adding a tier later is an additive change |
| 2 | Account flow in Phase A | P265: "request → `ACCOUNT_ADMIN`(or merged `SYS_ADMIN`) approves → account created → **forced password change**" | S79–84: staff **self-register**, the **department head** approves; S105, S277, S288: `mustChangePassword` **removed** because the person sets their own password | Phase A would rebuild the exact flow the spec deletes | **DECIDED 12 Oct — the plan wins, no exceptions.** The admin-approval queue is kept and Phase A was patched. The plan contradicted itself (P50 lists `ACCOUNT_ADMIN`, P59 merges it, P326 leaves it open), which the patch also fixes. The applicant still sets their own password, so the old "forced password change" step has nothing to trigger it — flagged, not silently built |
| 3 | Record keeper role | P46, P65: `DEPT_RECORD_KEEPER` kept as an "optional" layer | Her reply, confirm-item 3: refer to the md — the spec has **no record keeper** (Property Officer creates, holder claims) | Adds a role with its own scope and UI surface | **Closed as: keep it out.** The spec has no such role and she pointed back to the md. Recorded as an open item in the plan's §1/§17 in case a department asks for one — adding it later is a permission row, not a migration |
| 4 | Identity field | P92, P264: "`ownerId` required… `fromOwnerId`/`toOwnerId`" | S122–127: `ownerId` is **replaced** by a holder that is a staff member, **a department or the college**; S271 removes `ownerId` from Item | `ownerId` is a user id, so it cannot express a department or the college, and the holder model cannot be built from it | **Fixed in the plan.** Transfers now carry `fromHolderType`/`fromHolderId` and `toHolderType`/`toHolderId`; `ownerId` is gone |
| 5 | Item states | P75: `REGISTERED → ASSIGNED → IN_USE / IN_STORE → LOANED / UNDER_REPAIR → DISPOSED / LOST` | S131: `PENDING_CLAIM, ACTIVE, REVERTED_UNVERIFIED, LOST, DISPOSED, VOIDED`; 4.2–4.4, 4.8 | The plan has no claim handshake, so no 14-day reversion, no void-as-duplicate, and no custody event log (grep: `PENDING_CLAIM` 0, `custody` 0, `VOIDED` 0). `UNDER_REPAIR` is maintenance, which is out of scope | **Fixed in the plan.** §2 uses the spec's states plus `LOANED`, adds the claim handshake and the custody event log, and Phase A now carries both |
| 6 | Audit, "already agreed" | P146: "the exact plain-language flow already sent to Yanet… no further clarification needed" | The summary in this doc's reply block has **10 steps**; the plan keeps about two | This sentence is checked by the supervisor. The plan drops the frozen scope at open, damaged/wrong-location outcomes, the grace window, the numbered report, visibility before/after sign-off and "department responds, cannot edit", findings→tasks with owners, `last_verified`, the handover audit and the four session types; it adds `OUTSIDE_SCOPE` | **Fixed in the plan.** §6 is now built to the 10-step summary, the "already agreed" sentence is gone, and the only open detail is the grace-window length |
| 7 | Report freshness | P188: every report pulls **live** from shared tables | This doc, section 1: a report is a **dated, reproducible artifact** — draft (live) vs **official (frozen, serial-numbered)**; the audit report is frozen and compared against a live register, never merged | Whether a report can be reproduced later, and whether two runs of "the same" report can disagree | **DECIDED 12 Oct:** live internal views, frozen official reports — exactly what the plan's §8 now says |
| 8 | Public item routes | Plan's Phase A has nothing; only P253 "never return internal fields" | S328ff Tier 1 #3 removes hard delete **and the public item routes**; 7.1 removes them, 7.2/7.3 keeps a bare building list | gap-analysis E1 (public can see item details) is a legal exposure, not a UI preference | **Fixed in the plan.** Removing hard delete and the public item routes is now Phase A item 7 — a legal exposure does not wait for polish |
| 9 | Condition values | P83: fixed enum — NEW / GOOD / WORN / BROKEN | S164: custodians edit condition, values undefined | Closes a real hole | **Fixed in the plan.** It keeps the enum already in the database (`NEW / GOOD / FAIR / DAMAGED / BEYOND_REPAIR`) instead of the four-value draft, and a drop in condition now requires a note |

**Also absent from the plan, although its §14 calls the security list mandatory:** MFA for the privileged roles, data-protection/retention, DB-level enforcement of append-only logs, CSV injection, IDOR/authorization tests, secrets management, dependency scanning, backups / DR / staging / monitoring / health checks, performance targets and pagination under load, Amharic and accessibility, printable official forms, offline mobile scanning, QR tag reuse rule, demo-data policy, and role dashboards. Section 14 lists 6 items; this doc's list runs to 24.

**Agreed — do not re-litigate:** non-consumables only; disposal ends at `DISPOSED` with a reason and an approver who is not the initiator; loan MVP with an overdue flag; polling at 30s; minimal map, no GPS; the no-data public landing page (this doc's option B); audit-page filtering/sort/date-range/export; time-windowed requests; unique lifetime PIN; soft delete; no self-approval; optimistic locking; DB uniqueness on audit rows; session invalidation on role change; and the seven demo Q&As in the plan's §16.

**Left open, deliberately:** the audit grace window (default 7 days); whether imported items keep their claim-expiry exemption; finance/statutory reporting (needs the college finance office); and the email provider.

**Resolved later on 12 Oct — the two that were still carried as open:**

- `ACCOUNT_ADMIN` is **merged into `SYSTEM_ADMIN`** — one role, not two, so the role set is five. The System Admin inherits the invite chain, registration approval and privileged-account deactivation.
- `DEPT_RECORD_KEEPER` is **dropped**; `DEPARTMENT_HEAD` is the only department-approver role.

Both are written into the plan (§1, §15 item 1, §17).

**Spec updated to match (12 Oct):** the spec's 3.1 now names the `SYSTEM_ADMIN` as the registration approver (not the department head), 3.3.7 / 12.5 are confirmed as removed (`mustChangePassword` and the admin-set-password route), and 2.1 / 2.2 / 3.2 / 3.4 / 11.1 / 14.1 carry the five-role set. The two documents no longer disagree.

---

**REPLY TO SEND — copy from here**

Yanet — that answers almost everything, thanks. Recorded as decided:

- Polling, 30 seconds, plus a refetch when the tab comes back into focus. SSE dropped.
- Consumables and expiring items: out of scope.
- Maintenance, calibration and incidents: deferred past phase 1.
- Disposal: approval ends at DISPOSED; the garage, auction and sale happen outside the system and stay second priority.
- Loan: in for phase 1, improved during review.
- Map: deferred; when we build it, it's a pin for where the user is plus the college map. No GPS on assets.
- Email: we keep it and present it as a security feature even if some mail lands in spam. The in-app status page is the fallback, exactly as the md says.
- Scan rule: staff see the details of their own items only, property officers see every item's details, and a department head can hold and claim items like any other user. That goes into the md.
- What we track: every non-consumable asset and anything that doesn't run out. So no value threshold — chairs, computers, projectors, tools, phones and library copies are in; pens, toner, paper and reagents are out.

Two things I still need pinned down:

1. **Account Admin.** You said we can remove it and give its work to the System Admin. If that's final, section 2.1, the invite chain in 3.2 and the assumed-defaults list all change — the System Admin would invite the heads, officers and auditors too. One line from you or Hayredin and I'll write it.
2. **Library books.** A title isn't a copy. Under "non-consumables", each physical copy gets its own record, number, condition and status — otherwise a count goes wrong. Confirm that's the intent.

**The short audit summary you asked for:**

*An audit is a dated, physical check of a fixed list of items. It produces two things: a signed report of what was really there, and a correction task for anything that wasn't.*

1. The auditor opens a **session** and picks the scope — one department, or the whole college.
2. The moment the session opens, the system **freezes the list** of items in scope and gives the session a number. Items registered or transferred after that moment belong to the next audit. (Today the list is worked out at the end, so an item moved during the audit quietly changes the result.)
3. The auditor walks the department with the mobile app and scans each item. Four outcomes: found, found but damaged, found in a different place than the register says, or missing.
4. Anything not scanned stays "not found yet" until the session is closed. The department then gets one last window (say 7 days) to produce it; if it doesn't, the item becomes LOST and the existing lost and liability workflow takes over.
5. The session produces the **audit report**: scope, the frozen list, counts for verified / damaged / missing / not-found, the reasons, the evidence photos, and the auditor's sign-off. It's a numbered document, not a screen.
6. Before sign-off only the auditor sees it. After sign-off the department head sees it and **responds**; the Property Officer acts on it. Nobody edits a finding.
7. Every finding becomes a task with an owner and a due date, closed only when the auditor checks the fix. Otherwise nothing changes after the audit day.
8. One field ties the audit to the ordinary reports: on every item, **last verified on / by**, written only by an audit. Reports then show "not verified since <date>", and the gap between the register and the last count is the number everyone actually wants.
9. A **handover audit** is the same session started when a department head changes: what's in the department, who signs for it, what's missing — before the old head is released. That's the control we're missing completely today.
10. Same machinery, four types: annual full count, spot check, compliance, handover.

Two small decisions for the team from that: how many days a department gets before "not found" becomes LOST, and who signs a college-wide audit (Office of Auditors alone, or together with the Property Officer).

**One thing I can't answer from here:** the Finance and Statutory block (MoF/FPPA report format, IFMIS reconciliation, depreciation, the Ethiopian fiscal year). It's one conversation with the college finance office — we can't guess a ministry format. I'm leaving it in the doc as open, owner: college finance office.

Everything else in the attached doc that you didn't challenge is recorded as agreed. Thanks — that's what I needed.

**End of reply.**

---

**ORIGINAL MESSAGE — ALREADY SENT, kept for reference**

Hey — read the change specification properly now. The role model, the account flow, the custody/claim handshake and the transfer/disposal chains are solid, I agree with the direction on almost all of it. Below are the seven things I could not find, plus a list of things I think are missing beyond those seven. Where the spec already covers it I've said so and moved on. Where it's a decision rather than a gap, I've marked it **DECIDE** so we can settle it in one call instead of going back and forth.

## 1. Reports — not covered, and it's the part the supervisor called out first

Section 10 only talks about *columns* (holder, status, roll-up, exclude VOIDED, CSV+PDF the same). That's not a reporting design. What's missing is: who generates which report, who reads it, for what period, who signs it off, and how a report is requested and delivered.

My proposal — one report engine, not one endpoint per role. Every report has four parts: **scope** (which items, resolved server-side by the same logic that resolves approvers — never trusted from the client), **period** (see the fiscal-year point in section 8 below), **template** (per audience), **permission check** (may this user see this scope at all). Then every report generation is itself logged: who, what scope, what period, when, and the file stays stored.

The catalogue I'd expect, by role:

| Role | Reports they can generate | Reports they can read |
| :-- | :-- | :-- |
| PROPERTY_OFFICER | full asset register; additions for a period; disposal register; transfer register; loss & liability register; stock-count variance; holdings by building; valuation/depreciation schedule; import batch report | everything below, plus college-wide |
| DEPARTMENT_HEAD | department holdings; items pending claim; requests pending their approval; department losses; items needing attention (condition/expired) | own department only |
| STAFF | my items; my requests and their stage; my claim status | own items only |
| AUDITOR | audit sessions, findings by department, excluded items, status of previous findings, custody history of a given item | own sessions + college-wide findings |
| ACCOUNT_ADMIN | account lifecycle: pending registrations, rejections, deactivations, invite status, failed email deliveries | account data only, no asset data |
| SYSTEM_ADMIN | system health: failed logins, errors, email delivery failures | system data only, no asset data |
| College / management | one-page summary: counts by category and department, additions, disposals, losses, total value | summary only |

**The flow per role should be explicit and the same shape everywhere:** request → generate from a **frozen snapshot** → review by the level above (where the report is official) → deliver (download + optional email) → stored with a serial number and the parameters used. Nothing generated twice should ever disagree with itself.

Two things this implies: a report is either **draft** (live numbers) or **official** (numbers locked to the moment it was generated, with a serial number), and the "screen that shows a list" is not the same thing as "a report" — a list is a live view, a report is a dated, reproducible artifact. Today's reports page seems to be a live list, which is why it reads as "totally not working".

## 2. Reports and audit — the link is one line today, it needs to be a contract

*Yanet asked for a short summary of how the audit should work: the plain-language version is in the reply block at the top of this doc.*

Right now the only relationship is 8.4: a MISSING audit result makes an item LOST, and 10.3 has a loss report. That's it. What's missing is the audit's own output and how the two artifacts feed each other.

**Proposal — the audit produces a report, and that report and the ordinary register report are different things that must reconcile:**

- An **Audit Session** produces an **Audit Report**: scope, the frozen list of in-scope items, the count of verified / missing / damaged / not-found, discrepancy reasons, evidence photos, and sign-off.
- The audit report is **point-in-time and frozen**. The register report is **period-based and live**. They are compared, never merged: the difference between "what the register says" and "what was physically found on date X" is the number everyone cares about.
- The single field that makes them integrate: every item carries **`last_verified_at` + `last_verified_by`**, written only by an audit. Reports show it; the maps/UI show "not verified since <date>"; the dashboard flags "unreconciled differences open".
- One audit engine with a **type**: `STOCK_TAKE` (annual physical count), `COMPLIANCE`, `SPOT_CHECK`, `HANDOVER` (when a department head changes — see item 3 in the list below; this one is missing entirely and it's the highest-value control we're not building).
- Findings must live past the session: each finding becomes a **corrective action** with an owner, a due date and a closing verification. Otherwise the audit is a one-day event that changes nothing.
- Independence rule to write down: before sign-off only the auditor sees the report; after sign-off the department head and Property Officer see it. The department **responds** to findings, it does not edit them. Also: whose audit report may a head read — the spec should say it explicitly.

## 3. Email — "choose a provider" is the whole plan today, and that hides a real blocker

Section 3.5 asks us to pick a provider and set SPF/DKIM. Nothing about how sending actually works, cost, or the one thing that will decide whether any of it works at all.

**The blocker first, because it decides everything:** to send mail that lands in an inbox we need **a domain we control and access to its DNS records**. If we can only send from a provider's shared test domain, mail to `@aau.edu.et` and government addresses will spam-folder or be rejected outright. So: does the college give us a subdomain (something like `pms.<college-domain>`) and DNS access? Nothing in the spec addresses this and it is not something code can fix later. **DECIDE.**

**How sending should work (all of this is small, but it must be one place):** an outbox table so a slow or failed send never blocks a request; retries with backoff; an idempotency key per message so a retry never double-sends; store the provider's message id and final status on every send; handle bounces and complaints into a suppression list so we stop hammering a dead address; per-address rate limiting; every template has a plain-text version; and a **dev/test mode** so local work never emails real staff. Plus an Account-Admin-visible "these emails failed to deliver" list — with self-registration the whole onboarding flow depends on mail arriving, and your 3.1.7 in-app fallback only helps if someone can see who never got the link.

**Focus on what we need:**

| | What they give us | Daily cap | Cost at our likely volume |
| :-- | :-- | :-- | :-- |
| Amazon SES | Cheapest at real scale, needs AWS setup | Sandbox until we request production access | ~$0.10 per 1,000 → ~$1/month |
| Brevo | Free 300/day forever, simple SMTP + API | 300/day (~9,000/month) | $0 |
| Mailgun | Free, 1 inbound route | 100/day | $0 |
| Mailtrap | Free, shared send+receive | 150/day | $0 |
| Postmark | Best-in-class deliverability | 100/month on free | $15/month |
| Resend | Best developer experience, modern API | 100/day (3,000/month) | $0, $35/month past that |
| SendGrid | Broad, well documented | free tier is limited | ~$35/month at 100k |

**My recommendation:** Brevo's free plan as the primary sender for year one — 300/day forever, no card, and the cap is above anything we'll hit. Keep Resend as the developer-friendly alternative but note its **100/day** ceiling: one bad registration day with 300 sign-ups would silently drop mail. Amazon SES is the cheapest if volume ever grows (about a dollar a month) but it starts in a **sandbox** and needs an approved production-access request, so it's not a day-one pick. Every option above is effectively **free at our volume**, so cost is not the deciding factor — **domain + deliverability + daily cap** are. And we do *not* need a notification-orchestration product for this; a provider plus an outbox table is the whole thing.

**Flows the spec is missing entirely:** change password while signed in (requires the current password, and should kill other sessions); resend verification; change email address with verification of the new one; a "security notice" email on new sign-in or password change; and a "reset completed" confirmation (you list the template but not the trigger). Also note 3.3.5 (`tokenVersion` increments on reset) is good, but the same rule should apply to password *change*, not only reset.

**One more thing on 3.1.6 and my own earlier comment:** I said we should email the username and password on confirmation — I was wrong and I was reading the old flow. With self-registration the person chooses their own password, so there is nothing for an admin to send, and emailing credentials is a bad idea regardless (mail is not a secure channel, and it would have to be re-sent anyway). Your rule "the email contains a status and a sign-in link only, never a credential" should stand.

## 4. Guest role — there is no guest, and the building list has no purpose as it stands

Short answer: **we should not have a guest role, and we should not publish a bare building list either.** Two different things are being mixed together here.

**(a) A "guest" is not a role at all.** An anonymous request can only ever be served by two things: a login page, or public data routes we deliberately open. There is no guest account, no guest token, no guest permission set to maintain or leak. So "removing the guest role" costs nothing — your Section 2.1 already did it. Correct decision, keep it.

**(b) The building list is the only thing that would need a guest *purpose*, and as written it has none.** Section 7.2 gives anonymous visitors name / type / description of buildings. The intended purpose is **wayfinding** — a new student, a visiting parent, an event guest, or someone who scanned a QR sticker and has no account, trying to physically find a place. That need is real. But a bare list of building names does not satisfy it: that *is* the useless "buildings with no use" screen we have now. Real wayfinding needs the map plus practical info (departments housed, photo, hours, entrance), which is the Tier 4 item. And the university already publishes campus and college information on aau.edu.et (the CNCS college page) — a second, poorer building list inside our app competes with it and adds nothing.

**Three options — pick one:**

- **A — Remove the public surface entirely.** Anonymous access = one login page. Drop 7.1–7.5 (except 7.4), drop the public building routes and the public `optionalAuthenticate` path. Smallest possible attack surface: no anonymous API at all, nothing to leak, least work, nothing to maintain. Cost: an unauthenticated QR scan lands on a plain login form that doesn't explain itself.
- **B — Keep an "about this system" landing page with no data (recommended now).** A static page: what this system is, who may use it (college staff), how to request an account, who to contact at the Property Office, plus a sign-in button. No API, no anonymous data endpoint, no guest anything. It exists for one real reason: we put a QR sticker on every asset and email links to people, so a stranger who lands there should see what this is and what to do. This is exactly the "landing page with something to see but no real engagement" you described.
- **C — A real public directory, only together with the map (Tier 4).** Building name, units housed, photo, opening hours, public/not, coordinates, "you are here" and a walking route, printable. Genuine value for visitors — but it is a wayfinding feature, not asset management, and it creates a permanent upkeep job (hours, photos, coordinates) that needs a named owner. Yanet's Leaflet + OpenStreetMap + geolocation + OSRM plan fits this option exactly.

**Recommendation:** land **B** now and treat **C** as a Tier 4 decision with a named owner. Until C is approved, drop the public building *data* routes (7.2, 7.3, and the building part of 7.5) — publishing buildings is harmless, but publishing them without the map is the useless version we already agree is the problem. Keep **7.4 exactly as written**: every tag, real or nonexistent, gets the same login page.

Bonus: with no anonymous API endpoints, there is no public rate-limiting, caching or PII question left on that path at all — a measurable cut in surface area.

**DECIDE:** A or B now (my vote B), and is C in scope at all — if yes, who owns keeping hours, photos and coordinates current?

## 5. Bulk import images — not mentioned anywhere, not even as a column

The import columns (6.2) have no image field, and the Item model (Section 11) has no photo at all. So the answer today is "there is no way to get item images in", and it needs a decision.

Three options, in order of how much I'd recommend them:

1. **No images in v1.** Honest and fastest. The register is still correct.
2. **Recommended:** an optional image column, one of two shapes:
   - `image_url` — each row points at an image already hosted somewhere (Drive/OneDrive/college site);
   - or `image_filename` + a ZIP uploaded alongside the CSV (e.g. `SN-12345.jpg`), matched on serial or tag.
   The server uploads each match to the Cloudinary account the backend already uses and stores the URL + public id. The dry-run must report unmatched filenames and two rows pointing at the same image. If an image fails, the **row still imports** — the photo is optional — but the failure is listed.
3. **Later:** per-item photo upload from the item page and from the mobile app, Property Officer only, including "replace photo".

Rules I'd write down: never base64 inside the CSV; cap per-image and per-archive size; validate type by content not extension; one primary image plus an optional gallery; generate a thumbnail for lists (never load full-size in a table); **images are evidence, so replacing one keeps the old one**; a before-disposal photo is required on disposal; and check the Cloudinary free-tier storage/transformations against a 10–20k image first import.

And a process question that's bigger than the feature: **how do those photos get taken?** Thousands of items means either photo-at-registration, or a photo station at stock-taking, or capture in the mobile app during the count. Import can only carry photos that already exist — the spec should say where they come from.

## 6. Items held by neither a person nor a department, and things that run out or expire

*Status after her reply: (b) consumables and the expiry half of (c) are **out of scope** — the register tracks non-consumables only. (a) is agreed and still needs the `Unit` change, and the library title-vs-copy point in (c) survives, because a book is not a consumable.*

The holder model handles the holder question — staff, department, or college. A Wi-Fi access point or a library book is held by a unit or by the college Property Office, so that part is answered. But three things under it are not:

**a. Not every unit is a department with a head.** Library, Student Services, Registrar, ICT, Health Centre, Cafeteria, Property Office, Office of Auditors. The spec has Department + Office of Auditors only, and 13.1 already admits that a department with no head has no approver — which today means **pending approvals just wait forever**. Fix: one `Unit` concept (a Department is a kind of Unit) with an **optional head**, a **fallback approver** (Property Officer), and an **acting head with an end date**. You will need the acting-head flag in reality — heads go on leave and to training. **This is a small model change that unblocks several workflows.**

**b. Consumables are not assets, and they are in the register nowhere.** A chair is a thing you hold, transfer, claim and one day dispose of. Chalk, toner, reagents and printer paper are **quantities you issue until they run out**. Those need a separate small stock model: name, unit of measure, quantity on hand, reorder level, issue/consume entries, opening balance. Otherwise we either register 4,000 individual screws as items — and every count, transfer and disposal screen breaks — or we put stock in a free-text field, which is worse. Consumables have no claim, no transfer, no disposal workflow; their only exit is consumption or write-off.

**c. Things that expire or finish.** Chemicals, reagents, medicines, food, and anything with a shelf life: add `expiry_date` (plus batch/lot for chemicals and medicines), an alert some days before expiry, and an "expired / written off" record with a reason. Same for **library books**: a title is not a copy. One Title record, N Copy records, each with its own accession number, condition and status — otherwise counting books either double-counts titles or loses individual copies, and neither total survives a real count.

**d. Also missing and in the same family:** an `item_class` that decides which fields and workflows apply — **fixed/installed** (an access point, no movement), **movable** (a laptop, can go missing, can be transferred), **intangible** (a software licence: no QR tag, no disposal, has an expiry). Then the one rule that kills most ambiguity: *if it has a serial, a location and a custodian it's an Item; if it's counted by quantity and consumed it's a Consumable; if it's a service or a licence it's an intangible record.* Plus: **heritage items** (never disposed, no depreciation), **donated/gift items** (donor, valuation basis), **leased/rented items** (the owner is external, there's a return date), and **items already condemned and awaiting disposal** (a real state in a university — off the floor, still on the books).

## 7. Location tracking and the map

The map itself is answered — deferred to after the core (7.6, 11.7, 13.8), and the Leaflet approach in the group chat is the right one: no API key, coordinates stored with the building, "you are here" from the browser, walking route via Leaflet Routing Machine. **What's not answered is tracking**, which is a different question from the map:

- Is `building / floor / room` only the **current** location, or do we keep a **history**? Recommendation: keep the fields for current location *and* write a **location-change event** into the same append-only custody log — so "where was this laptop in March" is answerable, which is exactly what a loss investigation needs.
- Add **`last_verified_location` + date/by** from audits. That's the field that makes the map and the reports honest, because "assigned room" and "actually there" are different facts and today we'd only have the first.
- **No GPS tracking of assets.** No hardware to do it, a privacy cost under the data-protection law, and zero benefit for desks and chairs. Only *buildings* get coordinates.
- Two practical things the chat plan doesn't cover: coordinates have to come from **someone walking the campus and capturing them** (a manual picker on a map is fine, but it's a task with an owner), and building coordinates need a **verified flag** so a guessed pin is never presented as authoritative.
- Production caution on routing: OSRM's public demo server has no SLA and rate limits — fine for a demo, not for real use. Use a keyed routing provider or self-host. Also check the tile server is reachable from the campus network; if it isn't, pre-cache tiles or ship a static fallback image.
- Keep the public map showing **buildings only** — no asset or room-with-asset data.

## Other things that aren't in the spec and I think should be

*Her blanket rule covers this list: anything she did not mention or challenge is agreed in principle. Agreement is not implementation — every item here still needs spec text. The one block she could not answer is Finance and statutory, which needs the college finance office as its owner.*

**Money and time — this is the biggest structural gap.**
1. **No depreciation, no revaluation.** 4.7.1 lets the Property Officer edit a `current value` field, but it is a hand-typed number with no acquisition date, no in-service date, no useful life, no method and no accumulated depreciation — so it cannot be audited or rolled up. Every financial report is impossible until this exists. Related: heritage items never depreciate, and a damaged item's value has to be adjustable with a reason.
2. **No fiscal year or period concept.** Ethiopian fiscal year is Hamle 1 → Sene 30, and month/end is Sene 30 — not 31 December. Reports to the ministry are period-based. There is no period in this spec, so every "report" would be a live list with today's numbers, which is exactly the complaint. Add: fiscal year and period, a **period lock** (once closed, numbers don't change), and closing/reopening with an audit trail.
3. **No reconciliation with the finance register / IFMIS.** The register and the finance system will disagree. Nothing in the spec lets us reconcile or explain differences.

**Control and integrity.**
4. **A handover audit when a department head changes is missing** — the highest-value control we're not building. Who hands over what, when, and who signs. The current design only deactivates and reverts custody, which is not the same as a witnessed handover.
5. **Multiple pending requests on one item** — the supervisor raised this and the spec still doesn't resolve it. Need a rule: one active transfer per item, later requests queue or are rejected with a reason, and a pending claim freezes transfers. Without it two people can be told they hold the same laptop.
6. **`condition` is editable by any custodian (4.7.2) and the allowed values are never defined.** As written, hiding damage is two clicks. Define a short scale (e.g. 5 levels with descriptions), and if the condition drops, require a note and allow a photo.
7. **No attachments on an item** — purchase invoice/receipt, warranty card, donation letter, disposal approval, photos. There's nowhere to keep the paper, which is the first thing an auditor asks for.
8. **No warranty, insurance, supplier or vendor info**, and no expiry alerts for them.
9. **Segregation of duties on disposal (13.5).** The Property Officer registers and also finalises disposal. It's documented as accepted, which is fair — but add a second signature above a value threshold (or auditor pre-check) so the exception is bounded by money, not by hope.
10. **Append-only logs are a policy, not a mechanism.** Nothing stops a bug or a well-meaning admin from updating or deleting a custody row. Decide DB-level protection: the app's DB role gets no UPDATE/DELETE on log tables, or hash-chained rows. Also decide retention — forever is a storage and privacy problem, not a plan.

**Security.**
11. **MFA for the privileged roles** (System Admin, Account Admin, Property Officer) — these three can create accounts, invite people and finalise disposals.
12. **Rate limiting covers login and reset (3.3.3) — nothing else.** Add explicit lockout after N failed logins, log/alert on failed logins, and apply limits to the public building endpoints and to bulk import.
13. **Sessions:** 13.7 admits a 1-day JWT with no refresh. Decide refresh tokens / shorter-lived access tokens / server-side revocation, then write the numbers down.
14. **Data-protection section is missing.** Names, staff IDs and custody history are personal data. The spec needs a lawful basis, a privacy notice, how someone requests access to or correction of their data, retention periods, breach-notification handling, and who is accountable. This is a legal obligation now, not a nice-to-have — and it changes what the public page and exports may contain.
15. **CSV injection** — a cell starting with `=`, `+`, `-` or `@` executes when opened in Excel. Sanitise on import and on export. Also validate uploaded file type/size, and make re-running the same import idempotent.

**Operations and the last mile.**
16. **No backup / restore / disaster recovery**, no restore test, no environments (dev / staging / production), no migration-in-release policy, no monitoring, error tracking, health checks or uptime target. None of this is a feature, but without it this isn't an operable system.
17. **No performance targets or scale plan.** Tens of thousands of items with pagination, search and indexes, plus a stated target (e.g. a list page under a second at 50k items) and a load test.
18. **Accessibility and language.** Keyboard navigation, contrast, labelled controls, screen-reader support — and **Amharic**, at least for the UI, categories and printed forms, plus Ethiopian-calendar dates on printed and exported documents. This is a university system, not an internal tool.
19. **Printable official forms:** gate pass, loan form, disposal request and approval, stock-count sheet, custody handover, QR label sheets — with signature lines, in both languages.
20. **Mobile inventory must work offline.** Basements and store rooms have no Wi-Fi. Scanning needs a local queue with sync-on-reconnect and a rule for conflicts. Also: how the app is distributed to staff and how we force an update.
21. **Notification delivery.** Polling refetch is fine by me, but add preferences (instant vs daily digest), failure handling, and the language of the notification text.
22. **Nobody is named as the production owner.** Hosting, database access, backups, on-call and incident response — who runs this after the semester ends? Worth one paragraph.
23. **QR tag lifecycle:** the tag belongs to the item, not the holder (so a transfer keeps the tag); how to reprint a lost sticker; and tags must **never** be reused after a void, or a new item inherits a dead item's history.
24. **Demo data policy:** how the demo seed is created, how it's reset, and a hard rule that real student/staff data never goes into a demo.

## Confirm these — the group chat asked for something the spec now does differently

*Status after her reply: all three are settled. Items 2 and 3 — the flat enum stands and there is no record keeper. Item 1 — the Account Admin is removed and its work moves to the System Admin, so the role set is five (confirmed 12 Oct).*

1. **Who creates Account Admins after the first one?** The chat says System Admin should create admins; the spec (3.2.2) has the **Account Admin** inviting other Account Admins, with the System Admin only seeding the first. One of these has to win, because it decides who holds the top of the chain.
2. **Two enums (one for admins, one for staff) for RBAC.** The spec keeps a single flat six-role enum plus department scope. Your suggestion is not in it. The flat enum works, but confirm it, because the permission layer is Tier 1 and changing it later means rewriting approvals.
3. **Department record keeper.** You asked whether one exists. The spec has no such role: the Property Officer creates items and generates tags, the holder then claims (4.3, 4.4). Confirm that this is the intent, so nobody builds a record-keeper role later.

## Supervisor review items still absent from the spec

*Yanet agrees with all of Nesredin's points, so these are in; only the inventory definition is answered elsewhere (non-consumables).*

- **Audit page usability:** filtering, grouping by department, sorting, and date-range selection. The spec's Section 8 changes audit *data* rules only; the page itself stays plain.
- **Requests page:** scoped to a time window (week / month / recent) with totals and history separated from the live list — today it dumps everything unfiltered.
- **QR scanner must be mobile-only.** 4.3.3 keeps scanning inside the authenticated staff app but says nothing about hiding it on desktop, where it is already useless.
- **Inventory definition:** what counts as stock and how items are added or removed — folded into question 6 above (quantities, consumables, spare parts).
- **Role dashboards / KPIs** (gap-analysis G3): counts, overdue items, audit variances, pending approvals at their age — the spec's reports are lists, not dashboards.

## Also missing across our other docs (research + gap analysis), not only the spec

**Lifecycle features we researched, with no mention in the spec:**
- **Loan / issue-and-return — IN for phase 1** (her reply: implement it, then improve it during review; asset-mgmt 7.2): borrower, purpose, due date, return condition, approver; overdue → reminder → escalation → incident; transfer and disposal blocked while on loan; plus a **gate pass** for off-campus movement. The spec has zero mentions of loan or borrow.
- **Maintenance, calibration, incidents — deferred past phase 1** (her reply) (asset-mgmt 9): preventive-maintenance schedules and work orders, calibration with certificate references and next-due dates (labs, health, engineering), warranty and insurance expiry alerts, and immutable damage/theft incident records.
- **Inventory as two regimes — consumables out, per-unit counting still to design** (asset-mgmt 8): consumables tracked by quantity (min/max, reorder level, store ledger where opening + receipts − issues = closing) versus fixed assets tracked per unit; counting as an annual full count plus cycle / ABC risk-based counting; variance → reason code + approval → shrinkage report; sign-off chain counter → verifier → reconciler.
- **Disposal destinations and proceeds — out for phase 1** (her reply: approval ends at DISPOSED, the garage and auction happen outside the system, tracking it adds overhead and is second priority) (asset-mgmt 7.3): reallocate internal → transfer to public body → sale/auction → write-off/scrap, with value thresholds, two or more approvers for material items, proceeds and gain/loss recorded, and never self-approvable. The spec accepts a single Property Officer sign-off (13.4) and records no proceeds.
- **Capitalisation threshold — answered (her reply):** the register tracks *every non-consumable asset and anything that does not run out*, so there is **no value threshold**. Pens, toner, paper and reagents are out; chairs, computers, projectors, tools, phones and library copies are in. *(The one case still worth writing down: a library title is not a copy, so each physical copy needs its own record.)* The earlier value-plus-useful-life note came from industry practice, not our docs, and is no longer needed.

**Finance and statutory — needs a different owner (she could not answer; the corporate nature of the statements isn't clear to her):**
- **MoF / FPPA report format** (roles plan 17.4): is a specific fixed-asset movement format required, or is an IFMIS-style export acceptable?
- **IFMIS / finance reconciliation export** (C7), plus a way to explain differences between the two systems.
- **Heritage assets** (C3, roles plan 17.6): in scope or not, with a flag that disables depreciation.
- **Revaluation and impairment, held-for-sale, book/carrying amount** (C2, C4, C5).

**Integrity and operations:**
- **Concurrency** (A7): two officers editing one item produces silent lost updates; needs optimistic locking.
- **Database-level uniqueness on serial/PIN and audit result rows** (A4, A5) — today only import duplicates are detected.
- **Delegated-authority thresholds and SLA/aging escalation** for pending approvals (D2, D7).
- **Monitoring, staging and production environments, health checks, uptime target, and pagination/search under load** (F, G).
- **Security depth:** IDOR/authorization tests on every read, secrets management, dependency scanning, security headers/CSRF/XSS, and `tokenVersion` bump on role change (E2, E7–E10).

**Confirm in writing:** the campus/college list and mapping (roles plan 17.1) — mostly settled by "one campus only" (13.3). Who approves accounts (roles plan 17.2) is already answered by 3.1/3.2, so no action needed there.

## Smaller comments on what's already there

*Her reply settles several of these; each bullet below says which.*

- **DECIDED — 9.2 (polling) beats SSE.** She chose polling: 30 seconds is fine, SSE consumes more computing power, and instant delivery only matters if we need millisecond response. The spec's 9.2 already matches.
- **Old 9.2 (polling) vs the group chat (SSE).** Both can't be the decision. Polling + refetch-on-focus is simpler and more robust on serverless; SSE across serverless functions is fragile and needs a stateful host. If we truly need instant, use a hosted realtime service. **DECIDE once**, then write it down.
- **13.1 (vacant department head)** — fix it rather than accepting it; see 6a above.
- **4.4.3 (14-day expiry) vs 6.8 (imported items exempt).** An unclaimed *imported* item is exactly the one that needs chasing. I'd revisit the exemption.
- **NEW from her reply — QR scan visibility.** A scan must show a STAFF member only their own items' details, a PROPERTY_OFFICER every item's details, and a DEPARTMENT_HEAD can hold and claim items like any other user. Write it into 4.1, 4.3 and the 2.2 permission matrix (the matrix today marks the officer as "n/a — holds college items" and never says what a scan reveals).
- **12 / migration.** Reset-and-reseed is the right call if no real data exists — but say that outright ("no production data exists yet") so nobody assumes a migration path.
- **3.1.8 (rejected applicants can reapply)** — good, but say how long rejection history and the rejected email/staff ID stay reserved, otherwise someone can't re-register with the same ID after a fixable mistake.

Once we settle the **DECIDE** items (email domain, public page scope, polling vs SSE) I can fold all of this into the spec as new sections rather than a list of questions.

**End of message.**
