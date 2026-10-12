# Gap Analysis & Production-Readiness Blueprint

**Project:** CNCS Campus Property Management System
**Companion documents:** `docs/asset-management-standards-and-research.md` (rules & standards),
`docs/property-hierarchy-and-roles-plan.md` (roles & hierarchy)
**Goal:** by the **second presentation there is no downside, failure, mistake, or
unimplemented/misimplemented feature** a reviewer or examiner could name.

---

## 0. Purpose

The supervisor named 8 problem areas. Those are the **symptoms he could see in a demo**. This
document does the harder job: it derives the **full requirement set** from the standards dossier and
lists **everything that is missing, even where nobody mentioned it** — because the fastest way to fail
a second presentation is to be told about a flaw you never enumerated.

Each gap is given a **severity** so the team can triage:
- **S1 Critical** — a reviewer will call it a defect or a compliance failure.
- **S2 Major** — clearly expected of a "real" system; embarrassing to omit.
- **S3 Minor** — polish and professionalism.

---

## 1. Coverage of the supervisor's 8 confirmed points

| Supervisor point | Covered where | Status |
|---|---|---|
| 1 Roles & permissions (2 staff types; admin ≠ item registrar; admin approves accounts; map hierarchy) | `property-hierarchy-and-roles-plan.md` §6–§9 | Plan ready |
| 2 Public visibility / item classification | §3-H below + standards §6 | Design |
| 3 Optional map & building image | §4 (Could) | Design |
| 4 Transfer/disposal: required owner, current vs future, from→to, multiple requests | §3-C, §3-D | Design |
| 5 Request types role-based; time-windowed list + totals | §3-D | Design |
| 6 Remove desktop scanner; define inventory logic | §3-D, §3-B | Design |
| 7 Audit page: filter, group, sort, date-range | §3-G | Design |
| 8 Reports rebuilt by role × audience (campus / MoF) | §3-G | Design |

All eight are addressed. **Everything below is in addition to them** — the gaps nobody mentioned.

---

## 2. Method

1. Extract requirements from the standards dossier (`asset-management-standards-and-research.md`).
2. Compare against our current implementation (routes, schema, screens).
3. Record every divergence as a gap with severity, cause and fix.
4. Roll up into a feature catalogue, NFRs, acceptance tests and a roadmap.

---

## 3. Unmentioned gaps (things nobody told us but a real system needs)

### A. Data model & integrity — **S1**

| # | Gap | Why it matters | Fix |
|---|---|---|---|
| A1 | `Role` is a 2-value enum (`ADMIN`,`STAFF`) | Cannot express a real university; forces every later feature to fake it | 10-role model (roles plan §7) |
| A2 | No **org-unit hierarchy** (campus/college/department) | Permissions, reports and inventory cannot be scoped | Self-referencing `OrgUnit` tree |
| A3 | `Request.newOwnerId` is a **bare string with no foreign key** | Orphaned/dangling references; meaningless audit trail | Real relation + `NOT NULL` |
| A4 | `AuditItemResultRow` has **no unique constraint** | Duplicate/collapsed audit rows; audit unreliable | Natural-key uniqueness; append-only |
| A5 | No **uniqueness on asset identifier (PIN/serial)** | Duplicate assets; broken audits | DB unique constraints |
| A6 | No **soft delete / restore** and no referential-integrity rules | Accidental hard deletes destroy history | Soft delete + FK constraints |
| A7 | No **concurrency control** (two officers editing one record) | Lost updates on transfers/disposals | Optimistic locking (`version`/`updatedAt`) |
| A8 | No **asset relationships** (building→room→item; parent/child) | Cannot browse by building correctly or attach locations | Location hierarchy + relations |
| A9 | No **attachments/evidence** (photos, invoices, certificates) | No proof for audit | Attachment store with metadata |
| A10 | No **immutable change history** per asset | "Who changed the cost?" unanswerable | Revision/audit log per entity |

### B. Asset lifecycle — **S1/S2**

| # | Gap | Severity | Fix |
|---|---|---|---|
| B1 | Assets have **no status state machine** (only implicit) | S1 | Enforce lifecycle states (§5 of dossier) |
| B2 | **No loan / check-out** for assets | S2 | Loan entity with due dates and escalation |
| B3 | **No maintenance / repair work orders** | S2 | Work orders + history |
| B4 | **No calibration** tracking (lab/scientific equipment) | S2 (AAU-specific) | Calibration records + next-due alerts |
| B5 | **No condition rating** | S2 | 1–5 condition scale driving decisions |
| B6 | **No warranty / insurance** tracking | S3 | Fields + expiry alerts |
| B7 | **No incident** (damage/loss/theft) workflow | S1 | Incident record → investigation → write-off |
| B8 | **No gate pass / off-campus movement** | S3 | Movement permit tied to loan/repair |
| B9 | **No supplier/vendor** records | S3 | Vendor entity linked to assets |
| B10 | **No bulk import / export** | S1 | CSV import with validation; export |
| B11 | **No QR/barcode re-issue/mis-tag reconciliation** | S2 | Tag lifecycle + reconciliation report |
| B12 | **No location hierarchy** (campus→building→floor→room) | S1 | Location entity tree |

### C. Financial logic — **S1**

| # | Gap | Why it matters | Fix |
|---|---|---|---|
| C1 | Assets carry **no cost, useful life, or depreciation** | Cannot produce a MoF/IPSAS report; "reports totally suck" root cause | Financial fields + depreciation engine |
| C2 | **No revaluation / impairment** support | IPSAS requirement | Revaluation records |
| C3 | **No heritage-asset flag** | AAU has heritage assets with special rules | Classification flag disabling depreciation |
| C4 | **No book value / carrying amount** | Never reconciles with finance/IFMIS | Derived field + period close |
| C5 | **No held-for-sale state** (GASB 104) | Disposal transparency | Status + report category |
| C6 | **Disposal proceeds / gain-loss not recorded** | Incomplete financial trail | Fields on disposal |
| C7 | **No IFMIS reconciliation export** | Kenya/Ethiopia precedent: module must feed the finance system | Scheduled export |

### D. Workflow, approvals & policy — **S1/S2**

| # | Gap | Severity | Fix |
|---|---|---|---|
| D1 | **No maker–checker / separation of duties** | S1 | Require distinct initiator & approver |
| D2 | **No approval chains or delegated-authority thresholds** | S1 | Configurable approval by value/type |
| D3 | **No explicit request types** | S1 (supervisor #5) | Typed requests per role |
| D4 | **No transfer from→to semantics** | S1 (supervisor #4) | Explicit endpoints + approvals |
| D5 | **No multiple-request policy** | S1 (supervisor #4) | Queue + single-grant rule |
| D6 | **No notifications** (email/in-app) for approvals | S2 | Notification service + templates |
| D7 | **No SLA/escalation** for pending approvals | S3 | Aging + escalation rules |
| D8 | **No loan overdue handling** | S2 | Reminders → escalation → incident |
| D9 | **No configurable numbering scheme** | S3 | Admin-configurable code format |

### E. Security & privacy — **S1**

| # | Gap | Why it matters | Fix |
|---|---|---|---|
| E1 | **Public can see full item details** | Legal (Proc 1321/2024) + supervisor #2 | Server-side visibility enforcement |
| E2 | **No IDOR/authorization tests** (fetch another campus's record by id) | OWASP #1 | Scope checks on every read |
| E3 | **No rate limiting / brute-force protection** | Account compromise | Limits + lockout |
| E4 | **No MFA option** for privileged roles | Approver accounts are high value | TOTP MFA |
| E5 | **No personal-data handling policy** (retention, subject access) | Proc 1321/2024 | Data map + retention + SAR flow |
| E6 | **No breach/detection procedure** | Legal duty | Logging + alert + runbook |
| E7 | **No secrets management** discipline | Leak risk | Env/secret manager, rotation |
| E8 | **No dependency/vulnerability scanning** | Known CVEs | CI scanning |
| E9 | **No security headers / CSRF / XSS hardening** verified | Common exploits | ASVS checklist + tests |
| E10 | **No MFA/session hardening** on role change | Stale privilege | Bump `tokenVersion` on role change |

### F. Operations & reliability — **S1/S2**

| # | Gap | Severity | Fix |
|---|---|---|---|
| F1 | **No automated backups / tested restore** | S1 | Scheduled backups + restore drill |
| F2 | **No observability** (logs, metrics, error tracking, alerts) | S1 | Structured logging + monitoring |
| F3 | **No health checks** | S2 | `/healthz` liveness/readiness |
| F4 | **No CI/CD or migration discipline** in prod | S1 | Pipelines + versioned migrations |
| F5 | **No staging environment parity** | S2 | Staging env |
| F6 | **No load/performance testing** | S1 | Test at 10k–100k assets |
| F7 | **Migrations not automated on deploy** (already known) | S1 | `prisma migrate deploy` in release |
| F8 | **No runbooks / incident process** | S3 | Operational docs |
| F9 | **No data retention/archival policy** | S3 | Retention schedule + archival |

### G. UX, reporting & accessibility — **S1/S2**

| # | Gap | Severity | Fix |
|---|---|---|---|
| G1 | **Reports not role/audience aware** | S1 (supervisor #8) | Report matrix by role × audience |
| G2 | **Audit page too plain** | S1 (supervisor #7) | Filters, grouping, sort, date-range, export |
| G3 | **No dashboards/KPIs** | S2 | Role dashboards (counts, overdue, variances) |
| G4 | **No search/pagination at scale** | S1 | Indexed search + pagination |
| G5 | **No timeline windowing** on requests | S1 (supervisor #5) | Time-window filters |
| G6 | **No accessibility** (WCAG 2.2 AA) | S2 | Audit + remediation |
| G7 | **No empty/error/loading states** polished | S3 | Design pass |
| G8 | **No print/PDF of official forms** | S2 | Printable GOFAMM-style forms |

### H. Localization & institutional context — **S1**

| # | Gap | Why it matters | Fix |
|---|---|---|---|
| H1 | **Gregorian-only dates** | Users expect **Ethiopian calendar** | Store UTC, display Ethiopian |
| H2 | **Fiscal year not modelled** | Ethiopian FY = **Hamle 1 → Sene 30**; every MoF report depends on it | Fiscal-period engine |
| H3 | **No Amharic** UI/report support | Public institution users | i18n + Amharic strings |
| H4 | **No multi-campus data isolation** | AAU has ~13 campuses | Scope data by campus |
| H5 | **No IFMIS export format** | Reconciliation with MoF | Export mapping |

### I. Integration & extensibility — **S2/S3**

| # | Gap | Severity | Fix |
|---|---|---|---|
| I1 | **No API versioning** | S2 | `/v1` prefix |
| I2 | **No idempotency** on critical writes (double-submit transfer) | S2 | Idempotency keys |
| I3 | **No webhooks/outbound integrate** for IFMIS/email | S3 | Optional integrations |
| I4 | **No audit export in machine format** (CSV/JSON for OFAG) | S2 | Export service |

**Summary:** the supervisor named ~8 issues; this analysis lists **~60 gaps** across integrity,
lifecycle, finance, workflows, security, operations, UX, localization and integration. Roughly a
third are S1 and will decide whether the second presentation is judged "production ready".

---

## 4. Complete feature catalogue (MoSCoW)

**Must have (S1)** — required for a defensible demo:
- 10-role model + org-unit hierarchy + scoped permissions (server-enforced).
- Account **request → approval** flow; forced password change retained.
- Item registration restricted to property roles; **classification + server-side visibility**.
- **Lifecycle status machine**; location hierarchy; unique PIN constraint.
- Transfer (from→to, dept/individual, approvals), loan, disposal (approval + destination + proceeds).
- **Typed, role-based requests**; time-windowed list; multiple-request single-grant rule.
- **Financial fields + straight-line depreciation**; heritage flag; MoF-oriented reports.
- **Audit page** with filters/grouping/sort/date-range/export; append-only audit.
- **Backups, observability, migrations, health checks**; load-tested at scale.
- **Public visibility limited to category-level** (legal).
- **Ethiopian fiscal year** in all reporting; Ethiopian calendar display.
- **Reports rebuilt** by role × audience (dept/college/campus/university/MoF/FPPA/audit).

**Should have (S2)**:
- Maintenance work orders; calibration; condition; warranty/insurance.
- Incident (loss/damage) workflow; gate pass.
- Bulk import/export; QR re-issue reconciliation.
- Notifications + escalation; dashboards.
- MFA; rate limiting; dependency scanning.
- WCAG 2.2 AA; Amharic; printable official forms.

**Could have (S3)**:
- Real map scoped to campus (supervisor #3); building images.
- RFID; offline mobile scanning.
- IFMIS automated integration; API versioning/webhooks.

**Won't have (for now)** — explicitly out of scope, documented so it is not a "gap":
- Payroll integration; procurement bidding workflow; HR lifecycle.

---

## 5. Non-functional requirements (NFRs)

| Category | Requirement (measurable) |
|---|---|
| Performance | P95 API < 300 ms at 50k assets; list endpoints paginated ≤ 50 rows |
| Availability | ≥ 99.9% monthly; graceful degradation |
| Recovery | **RPO ≤ 24h, RTO ≤ 4h**; restore tested quarterly |
| Security | ASVS L2 aligned; no OWASP Top-10 findings in review |
| Privacy | Proc 1321/2024: minimisation, retention, subject access |
| Accessibility | WCAG 2.2 AA |
| i18n | Amharic + English; Ethiopian & Gregorian calendar display; Ethiopian FY |
| Auditability | 100% of state changes logged, append-only, exportable |
| Testability | ≥ 80% coverage on domain logic; E2E for critical flows |
| Maintainability | Versioned migrations; CI green gate; documented runbooks |

---

## 6. Production-readiness checklist (mapped to our app)

| # | Check | Current | Target |
|---|---|---|---|
| 1 | Automated DB backups + tested restore | ✗ | ✓ |
| 2 | `prisma migrate deploy` in release | ✗ | ✓ |
| 3 | Health/readiness endpoints | ✗ | ✓ |
| 4 | Structured logging + error tracking + alerts | partial | ✓ |
| 5 | Load test at scale; pagination/indexes | ✗ | ✓ |
| 6 | Secrets in a manager; rotated | partial | ✓ |
| 7 | Dependency & vulnerability scanning in CI | ✗ | ✓ |
| 8 | AuthZ tests incl. IDOR/scope | partial | ✓ |
| 9 | Rate limiting + lockout + MFA | ✗ | ✓ |
| 10 | Staging parity + rollback | ✗ | ✓ |
| 11 | Runbooks + incident process | ✗ | ✓ |
| 12 | Retention/archival policy | ✗ | ✓ |
| 13 | Accessibility pass | ✗ | ✓ |
| 14 | Ethiopian FY + calendar in reports | ✗ | ✓ |

---

## 7. Acceptance test matrix (so nothing "surprises" us)

Each row becomes an automated or manual test. If all pass, the reviewer finds no gap we know of.

| Area | Test | Expected |
|---|---|---|
| Roles | Instructor attempts to register an item | **Denied** (403), audited |
| Roles | Admin (`ACCOUNT_ADMIN`) attempts to register an item | **Denied** |
| Roles | Property officer registers an item | Allowed, PIN assigned, unique |
| Accounts | Staff requests account → admin approves | Account created, forced change on first login |
| Accounts | Staff requests → admin rejects | No account; reason recorded |
| Public | Anonymous fetches item details | **Category summary only**; no cost/custodian |
| Public | Anonymous fetches internal asset by id (IDOR) | Denied |
| Transfer | Officer transfers without approver ≠ initiator | Blocked (maker–checker) |
| Transfer | Transfer with missing from/to | Rejected (required fields) |
| Disposal | Disposal attempted without approval | Blocked; ≥2 approvers on material item |
| Requests | Two requests for one item | One granted; other waitlisted/rejected with reason |
| Requests | Requests list default view | Time-windowed, not "everything" |
| Inventory | Count variance recorded | Adjustment requires reason + approver; shrinkage report |
| Loan | Asset on loan | Transfer/disposal blocked until returned |
| Finance | Depreciation run | Straight-line; land/heritage excluded; period closed |
| Reports | Campus vs MoF report | Different form/fields; Ethiopian FY |
| Audit | Every approval/write | Append-only row; exportable; no duplicates |
| Security | Role change | Session revoked |
| Ops | Restore from backup | Data recovered within RTO |
| Scale | 50k-asset list | P95 < 300 ms |

---

## 8. Delivery roadmap (revised, gap-aware)

**Phase A — Model & integrity (blocks everything)**
Roles, `OrgUnit`, location hierarchy, PIN uniqueness, audit immutability, `ownerId` required, soft
delete, optimistic locking, migrations-in-release.

**Phase B — Accounts & security**
Account request/approval; server-side authorization everywhere; rate limiting + lockout + MFA;
secrets; IDOR/authz tests; privacy/retention.

**Phase C — Asset lifecycle & finance**
Status machine; classification & visibility; depreciation/revaluation/heritage; loan; maintenance;
calibration; incident; disposal destinations & proceeds; multiple-request policy.

**Phase D — Requests, inventory, store**
Typed requests + time windows; store ledger; cycle counting; reconciliation; shrinkage; sign-off chain.

**Phase E — Audit & reports**
Audit page (filter/group/sort/range/export); report matrix by role × audience; **Ethiopian FY**;
printable official forms; dashboards.

**Phase F — UX, localization, integrations**
Amharic; Ethiopian calendar; WCAG pass; bulk import/export; IFMIS export; building images; optional map.

**Phase G — Production hardening**
Backups + restore drill; observability + alerts; health checks; load tests; staging; CI/CD; runbooks;
DR exercise.

---

## 9. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Hierarchy mapping wrong | Everything scoped wrong | Confirm AAU tree before Phase A |
| Scope creep (60 gaps) | Nothing ships | MoSCoW: land all S1, then S2 |
| Financial rules misread | Reports wrong/invalid | Validate with a finance/audit advisor |
| Ethiopian calendar/FY bugs | Reports rejected | Isolated date/period module + tests |
| Privacy non-compliance | Legal exposure | Data map, minimisation, retention, SAR |
| Operational gaps (no backup) at demo | Data-loss story | Phase G before any "production" claim |
| Performance at scale | Demo slowdown | Load test in Phase G |

---

## 10. Second-presentation demo script (defensive)

To leave **no** downside, the demo should *show* the hard things, not just the happy path:

1. **Roles:** log in as instructor (cannot register) → as property officer (can) → as account admin
   (only account approval). *Shows supervisor #1, #2, #3.*
2. **Public privacy:** anonymous category view; attempt by id → denied. *Shows #2 (legal).*
3. **Hierarchy:** university → campus → college → department → item. *Shows #4.*
4. **Register → tag → QR** (mobile only; desktop has no scanner). *Shows #6.*
5. **Request (typed) → approval → store issue**, with time-windowed list and totals. *Shows #5, #4.*
6. **Transfer (from→to, dept vs individual) → two approvals → audit rows.** *Shows #4.*
7. **Disposal with approval, reason, destination, proceeds.** *Shows #4.*
8. **Loan with due date; overdue escalation.**
9. **Inventory count → variance → adjustment with reason → shrinkage report.** *Shows #6.*
10. **Financial:** depreciation run; heritage asset excluded. *Pre-empts "reports suck".*
11. **Audit page:** filter by department + date range + export (auditor role). *Shows #7.*
12. **Reports:** campus report vs **MoF/Ethiopian-FY** report side by side. *Shows #8.*
13. **Ops:** show CI green, backup + restore, monitoring dashboard. *Answers "is it real?"*

Every step maps to a supervisor point **and** to a gap we pre-empted.

---

## 11. Cross-references

- Rules, standards and legal basis: `docs/asset-management-standards-and-research.md`
- Roles, hierarchy and permission matrix: `docs/property-hierarchy-and-roles-plan.md`
- Supervisor's points in plain language: `docs/supervisor-feedback.md`

---

*This blueprint is the checklist that defines "done". Until the S1 items and the acceptance matrix
(§7) are green, the system should not be described as production ready.*
