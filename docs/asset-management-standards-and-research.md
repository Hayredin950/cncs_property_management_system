# Asset & Property Management — Standards, Systems and Logic (Research Dossier)

**Project:** CNCS Campus Property Management System
**Companion documents:** `docs/property-hierarchy-and-roles-plan.md` (target operating model),
`docs/gap-analysis-and-production-readiness.md` (gaps + build blueprint)
**Purpose:** establish the **rules, flows, policies, security and standards** a real public-university
property system must satisfy — drawn from international practice, Ethiopian law, and university
operations — so the app is correct rather than merely plausible.

---

## 0. How to read this document

Sections 1–3 are the evidence base (what exists in the world, in Ethiopia, and in universities).
Sections 4–10 are the **normative logic**: the rules and flows our system must encode.
Section 11 is the production-readiness standard. Section 12 is localization context that is easy to
miss and hard to fix later.

Every rule below is written so it can become a test case or a schema constraint.

---

## 1. Method

We triangulated **three layers** (as the supervisor directed: world → Ethiopia → AAU):

1. **Government systems worldwide** — what national public-property registries actually do.
2. **Standards bodies** — ISO, IPSAS, GASB, COSO, IIA, ISO/IEC 27001, OWASP.
3. **Ethiopian law and operating reality** — proclamations, directives, manuals, IFMIS.

Where a rule comes from a specific source it is cited. Where sources conflict (e.g. an older
directive vs. the 2024 proclamation), the **newest law wins**.

---

## 2. Comparative government property systems

### 2.1 United States — GSA
- **Personal Property Management System (PPMS)** — online platform for **reporting, searching and
  claiming excess** federal personal property. This is the "surplus / reallocation" flow: an agency
  declares property excess, others claim it before it is sold.
- **Federal Real Property Profile (FRPP)** — the authoritative **real-property inventory** database
  (buildings, land, leases) with a defined data dictionary.
- **GSA Auctions** — public disposal channel for excess property.
- **Lesson for us:** a mature system separates **three disposal destinations**: *reallocation to
  another internal unit* → *transfer/sale to another public body* → *public auction/write-off*.
  Our app currently has only a generic "disposal/transfer" — this must become an explicit state
  machine (§7).

### 2.2 Kenya — IFMIS asset & inventory module
Kenya rolled out the **IFMIS asset and inventory module** to counties explicitly to *"curb resource
misuse"* — i.e. the purpose of the module is **accountability and anti-misuse**, not bookkeeping
convenience. It links assets to the financial system.
- **Lesson:** the asset module must integrate with (or export cleanly to) the national financial
  system, and must support **audit as a first-class use case**.

### 2.3 Other national lessons (World Bank / CEF public asset-register guidance)
- An **asset register** must capture **technical, legal and financial** information — not just a
  description and a photo. "Technical" = specs/condition; "legal" = ownership/title/encumbrance;
  "financial" = cost, depreciation, book value.
- Registers fail most often from **incomplete initial data** and **no reconciliation discipline**.
- **Lesson:** we need a **data model that is complete from day one** (cost, life, condition, title)
  and a **reconciliation cadence**, not a one-time data entry.

### 2.4 Ethiopia — IFMIS
- Ethiopia's **IFMIS** (implemented by MoF) is the integrated public financial management system; AAU
  itself has run IFMIS go-live with MoF for its colleges.
- IFMIS includes **fixed-asset and property-administration** functionality (property administration
  control documentation exists for IFMIS).
- **Lesson:** our system must **not contradict IFMIS**. It should be *complementary* — richer
  physical/operational tracking (QR, requests, transfers, inspections) that **exports** data in a form
  that reconciles with IFMIS fixed-asset records.

---

## 3. Standards and frameworks to conform to

### 3.1 ISO 55000 family (asset management)
- **ISO 55000** — overview, terminology, principles.
- **ISO 55001** — the *requirements* for an asset management system (the auditable one).
- **ISO 55002** — guidance on applying 55001.
- **Seven requirement clauses (4–10):** Context · Leadership · Planning · Support · Operation ·
  Performance evaluation · Improvement. Central artefact: the **Strategic Asset Management Plan
  (SAMP)**.
- **What we adopt:** the *value* mindset (assets exist to deliver service, not to be counted),
  a defined **asset management policy**, **documented processes**, and **performance measurement**.
- **What it means concretely:** our reports must answer "is the asset base delivering value and
  controlled?" not just "how many items".

### 3.2 IPSAS 17 → IPSAS 45 (property, plant & equipment)
- Assets are recognised when future economic/service potential is probable and cost is measurable.
- Measurement: **cost model** or **revaluation model**; depreciation normally **straight-line** over
  useful life; **land and assets under construction are not depreciated**.
- **IPSAS 45** (2023) replaces IPSAS 17, adding **current operational value** measurement and
  **heritage asset** treatment.
- **Heritage assets** (AAU has many — Institute of Ethiopian Studies artefacts, manuscripts, art)
  follow special rules: may be exempt from depreciation and from some disclosures, but still need
  **register + safeguarding**.
- **What we adopt:** fields for **cost, residual value, useful life, depreciation method, accumulated
  depreciation, carrying amount, revaluation, impairment**; heritage flag disabling depreciation.

### 3.3 GASB 34 / 104 (comparative government accounting)
- Capital assets reported at historical cost, depreciated over useful life; **GASB 104** adds
  disclosure for **capital assets held for sale** and categories.
- **Lesson:** our **disposal/held-for-sale states must be distinguishable** in reports.

### 3.4 Internal control and audit frameworks
- **COSO Internal Control — Integrated Framework**: control environment, risk assessment, control
  activities, information & communication, monitoring. The basis for "why separation of duties".
- **IIA Global Internal Audit Standards**: internal audit must be **independent** and have
  **unrestricted access** to records — which is exactly our `AUDITOR` role design.
- **Ethiopian Directive No. 47/2016** (Federal Government Internal Auditors): independence of internal
  auditors in public bodies; OFAG (Proclamation 68/1997) is the external auditor.

### 3.5 Information security and privacy
- **ISO/IEC 27001:2022** — 93 Annex-A controls across Organizational, People, Physical and
  Technological categories. Directly relevant: access control, **logging (8.15)**, monitoring (8.16),
  secure authentication (8.5), information access restriction (8.3), data masking, backup.
- **OWASP ASVS** — verifiable application security requirements, including **V7 Logging & Auditing**
  and **V8 Data Protection** (sensitive data handling, no leakage in errors).
- **OWASP Top 10** — the realistic threat list we must not appear on (broken access control is #1,
  which is precisely the class of bug "public sees all items" represents).
- **NIST CSF** — identify/protect/detect/respond/recover, useful for structuring the ops plan.

### 3.6 Ethiopian data-protection law
- **Personal Data Protection Proclamation No. 1321/2024** — Ethiopia's first comprehensive privacy
  law: lawful processing/consent, data-subject rights, safeguards for **sensitive personal data**,
  conditions on **cross-border transfers**, and obligations on controllers/processors.
- **What it means for us:** every user is a data subject. The system must support **lawful basis,
  purpose limitation, retention limits, access/correction requests, and breach handling**. Public
  views must never expose personal data (custodian names, phone numbers, locations of security-
  sensitive assets). This strengthens supervisor point #5 into a **legal obligation**, not a
  preference.

---

## 4. The legal and regulatory stack (Ethiopia)

| Instrument | What it governs | Impact on the app |
|---|---|---|
| **Proclamation No. 1333/2024** — Federal Public Procurement & Property Administration | Current governing law for public-body property administration | registration, classification, transfer approval, disposal, reporting |
| **Proclamation No. 649/2009** (repealed) | Predecessor; concepts still referenced | historical context |
| **Property Administration Directive(s)** (e.g. 447/2013) | Operational property rules | ownership, issue/return, disposal procedure |
| **Government-Owned Fixed Asset Management Manual (GOFAMM, MoFED)** | Fixed-asset structure, forms, PIN | asset record fields, PIN, register forms |
| **FPPA Stock Management Manual** | Stock/consumable management; defines *Property Administration Officer* | stock vs fixed distinction, store issue/receive |
| **Proclamation No. 57/1996** — Federal Financial Administration | Financial administration frame | reconciliation with finance |
| **Internal Auditors Directive No. 47/2016; OFAG Proc. 68/1997** | Internal + external audit | `AUDITOR` role, evidence exports |
| **Higher Education Proclamation No. 1152/2019** | University governance (board, president, councils) | hierarchy mirroring |
| **Personal Data Protection Proclamation No. 1321/2024** | Personal data | privacy, retention, security |

**Non-negotiable legal behaviours** distilled:

1. Every fixed asset carries a **unique PIN** and appears in a **register**.
2. Property is **classified** (fixed / stock / heritage / land-building / intangible).
3. A named **Property Administration Officer** owns the register.
4. **Transfers to another public body require approval.**
5. **Disposal is regulated and approved**, never self-approved.
6. **Periodic inventory** with reconciliation and sign-off.
7. **Reporting upward** to MoF/FPPA; **audit access** for OFAG/internal audit.
8. **Personal data** handled lawfully, minimised, and protected.

---

## 5. Asset lifecycle logic (the core flows)

A real system tracks an asset through its **entire life**. Our current model effectively starts and
stops at "registered". The required lifecycle:

```
PLAN/REQUISITION ─▶ PROCURE/RECEIVE ─▶ REGISTER & TAG ─▶ CUSTODY ASSIGN
        │                                                        │
        ▼                                                        ▼
   (spec, budget)                                        IN USE / STORED
                                                                 │
      ┌───────────────┬───────────────┬───────────────┬─────────┴──────────┐
      ▼               ▼               ▼               ▼                    ▼
   LOAN           MAINTENANCE     CALIBRATION     TRANSFER             INSPECTION
   (time-boxed)   /REPAIR         (lab)           (dept/individual)    /AUDIT COUNT
      │               │               │               │                    │
      └───────────────┴───────────────┴───────────────┴────────────────────┘
                                     │
                                     ▼
                    REVALUE / IMPAIR / DEPRECIATE  (financial)
                                     │
                                     ▼
                DISPOSAL DECISION ─▶ REALLOCATE │ TRANSFER-OUT │ SALE/AUCTION │ WRITE-OFF
                                     │
                                     ▼
                       LOSS / THEFT / DAMAGE  (incident → write-off)
```

**Asset status state machine (must be enforced):**

`DRAFT → REGISTERED → ASSIGNED → IN_USE | IN_STORE | LOANED | UNDER_REPAIR | UNDER_CALIBRATION |
HELD_FOR_SALE → {TRANSFERRED_OUT | DISPOSED | WRITTEN_OFF}` and terminal `LOST | STOLEN`.

Rules:
- Transitions are **logged** with actor, time, reason.
- A `LOANED` asset cannot be transferred or disposed until returned.
- A terminal-status asset cannot change back except via an explicit, audited correction.

---

## 6. Classification, coding and valuation

**Classification (what it is):** `STOCK/CONSUMABLE` · `FIXED_ASSET` · `HERITAGE_CULTURAL` ·
`LAND_BUILDING` · `INTANGIBLE` (software/licences).

**Visibility (who sees it):** `PUBLIC_SUMMARY` · `INTERNAL` · `RESTRICTED` · `CONFIDENTIAL`.
Enforced **server-side**; public sees **category-level only**, never cost/custodian/location.

**Identification / coding:**
- One **globally unique PIN** per unit (GOFAMM PIN concept). Immutable once assigned.
- Human-readable code with segments, e.g. `AAU/<campus>/<college>/<dept>/<class>/<serial>`.
- QR/barcode rendered from a stable URL (already implemented via `PUBLIC_BASE_URL`).
- **Uniqueness must be a database constraint** — duplicates silently corrupt audits.

**Financial fields (from IPSAS):** acquisition cost, acquisition date, supplier, invoice ref,
residual value, useful life, depreciation method, accumulated depreciation, carrying amount,
revaluation history, impairment, heritage flag.

**Depreciation logic:** straight-line by default: `(cost − residual) / useful_life`, monthly;
**land, assets under construction, and heritage assets excluded**. A configurable **component method**
is optional. Depreciation is computed **per period**, never overwritten.

---

## 7. Transfer, loan and disposal policies

### 7.1 Transfer
- **Two explicit endpoints, both required:** `fromOrgUnit`+`fromOwner` and `toOrgUnit`+`toOwner`.
- **Two types:** `TO_DEPARTMENT` and `TO_INDIVIDUAL`.
- **Maker–checker:** the initiator cannot approve; a from-side and a to-side approval are required.
- **Owner semantics fixed:** `ownerId` at initiation = **current owner**; a separate field records the
  **future owner**. (Resolves supervisor point #8's ambiguity.)
- Inter-unit transfer to **another public body** requires the approval the law mandates.

### 7.2 Loan (missing from the current app)
- Time-boxed custody: `borrower`, `purpose`, `due_date`, `return_condition`, `approver`.
- Overdue → notification → escalation → incident if not returned.
- Disposal/transfer blocked while on loan.

### 7.3 Disposal
- Reasons: obsolete · unrepairable · damaged · surplus · **loss/theft** · end-of-life.
- Destinations mirror GSA: `REALLOCATE_INTERNAL` → `TRANSFER_PUBLIC_BODY` → `SALE/AUCTION` →
  `WRITE_OFF/SCRAP`.
- **Board/committee approval** (Property Survey Board concept) with **≥2 approvers** for material
  items; configurable **value thresholds** (e.g. below X → officer; above X → board).
- Proceeds and gain/loss recorded; **disposal is never self-approvable**.

### 7.4 Multiple pending requests (supervisor point #10)
- One item can be **granted to exactly one** requester at a time.
- Competing requests: `WAITLISTED` or `REJECTED(reason)`; policy = priority(department>individual) →
  earliest request → approver discretion, configurable per request type.

---

## 8. Inventory logic (supervisor point #14)

**Two regimes, from GOFAMM/Stock Manual:**

| Regime | Tracked by | Methods |
|---|---|---|
| **Stock/consumable** | Quantity | issue/receive, min/max, reorder level, store ledger |
| **Fixed asset** | Unit (PIN) | per-unit conditions, custody, depreciation |

**Counting:**
- **Full physical count** (annual/periodic) for the formal register; **cycle counting** for large
  estates (continuous partial counts) — this is the accepted practice for accuracy without a
  disruptive shutdown (GAO best-practice guidance).
- **Reconciliation:** system quantity vs counted quantity → **variance** → investigate → adjust with
  **reason code + approval** → **shrinkage/discrepancy report**.
- **Sign-off chain:** counter → verifier → reconciler (three different roles, per separation of duties).
- **ABC/risk-based counting:** high-value and high-risk assets counted more often.

**Store/issue logic:**
- Stock ledger: opening + receipts − issues = closing, always balanced.
- Issue note requires an approved request (ties §7's requests to §8's store).
- Return of unused stock re-enters the ledger.

---

## 9. Maintenance, calibration and incidents (usually forgotten)

- **Condition rating** (e.g. 1–5) drives maintenance and disposal decisions.
- **Preventive maintenance (PM) schedules** by manufacturer/usage; work orders with history.
- **Calibration** for measurement/lab equipment, with certificate refs and next-due dates — a
  compliance item for a university (health, engineering, science labs).
- **Warranty** and **insurance** tracking with expiry alerts.
- **Incident reporting:** damage, loss, theft → investigation → insurance claim or write-off;
  must be immutable and reportable to audit.
- **Gate pass / off-campus movement** for assets leaving campus (loan/repair), which real public
  institutions require.

---

## 10. Security, privacy and audit controls

**Access control**
- RBAC **plus scoping** (role × org-unit × campus): a campus officer sees only their campus.
- Least privilege; deny by default; **server-side** enforcement on every route.
- **Maker–checker** on all approvals; **segregation of duties** encoded in the permission matrix.

**Authentication/session**
- Strong password policy, lockout, optional **MFA** for admin/approver roles.
- Session revocation on role change (existing `tokenVersion` mechanism can be extended).
- No credentials or secrets in logs.

**Audit trail**
- **Append-only** log of every state change: actor, role, timestamp (UTC + local), before→after,
  reason, request id. The existing `AuditItemResultRow` lacks a uniqueness key — fix it and make rows
  immutable.
- Exportable **evidence packs** for OFAG/internal audit; exports themselves are logged.

**Privacy (Proclamation 1321/2024)**
- Data minimisation in public payloads; no personal data exposed publicly.
- Retention schedule; lawful basis; support data-subject access/correction.
- Breach-detection and notification procedure.

**Application security (OWASP ASVS/Top 10)**
- Broken access control (incl. **IDOR** — e.g. fetching another campus's item by guessing an id),
  injection, insecure deserialization, SSRF, security misconfiguration, vulnerable dependencies,
  insufficient logging, XSS, CSRF — each must be explicitly tested.
- Rate limiting and abuse protection on auth and public endpoints.

---

## 11. Production-readiness standard (non-functional)

A "complete" app is not only feature-complete; it must be **operable**. Standard areas (SRE
production-readiness practice):

| Area | Requirement |
|---|---|
| **Reliability** | Defined SLOs (e.g. 99.9% availability); graceful degradation; no single point of failure |
| **Data & recovery** | Automated **backups** + tested **restore**; defined **RPO/RTO**; point-in-time recovery |
| **Observability** | Structured logs, metrics, traces; **error tracking**; alerting on failures; health checks |
| **Security** | ASVS-aligned; secrets management; dependency scanning; least privilege; TLS everywhere |
| **Performance & capacity** | Load-tested at realistic scale (10k–100k assets); pagination; indexed queries |
| **Release & rollback** | CI/CD, versioned **DB migrations**, one-command rollback, staging parity |
| **Testing** | Unit + integration + E2E + accessibility + security tests in CI; migration tests |
| **Operations** | Runbooks, on-call, incident response, documented DR drill |

**Scale reality check:** a university has **tens of thousands** of assets and thousands of users.
The app must be designed for that from the start (indexes, pagination, bulk import, async jobs),
because retrofitting scale is expensive.

---

## 12. Localization and context (easy to miss, hard to fix)

- **Ethiopian calendar.** Ethiopia uses its own calendar (roughly 7–8 years behind the Gregorian).
  Users will enter and expect **Ethiopian dates**; the system must store UTC/Gregorian internally and
  **display Ethiopian dates**.
- **Ethiopian fiscal year** runs **Hamle 1 → Sene 30** (≈ 8 July → 7 July). All **reporting periods,
  inventory cycles and depreciation periods** must align to the **Ethiopian fiscal year**, not the
  Gregorian one. This single point will otherwise invalidate every "MoF report".
- **Amharic** language support (UI labels, reports, printed forms); RTL-safe layout not required but
  CJK/Ge'ez font rendering is.
- **IFMIS reconciliation** exports.
- **Accessibility**: WCAG 2.2 AA (keyboard, contrast, screen-reader labels) — a public institution
  obligation and a quality signal.

---

## 13. References

**Comparative systems**
- GSA — Personal Property Management System (PPMS): https://www.gsa.gov/tools-overview/personal-property-disposal-and-auctions-tools/personal-property-management-system
- GSA — Federal Real Property Profile (FRPP): https://www.gsa.gov/policy-regulations/policy/real-property-policy-division-overview/asset-management/federal-real-property-profile
- GSA — Asset management systems: https://www.gsa.gov/policy-regulations/policy/personal-property-policy/managing-personal-property/asset-management-systems
- Kenya — IFMIS asset & inventory module rollout: https://gaa.go.ke/asset-management-digitized-curb-resource-misuse
- World Bank / CEF — building a public-sector asset register: https://www.cef-see.org/21-acc02
- Ethiopia IFMIS: https://www.mofed.gov.et/programmes-projects/ifmis/

**Standards**
- ISO 55000:2024 / ISO 55001 (asset management): https://www.iso.org/standard/83053.html , https://www.iso.org/standard/55089.html
- IPSAS 45 (PP&E, replaces IPSAS 17): https://www.ipsasb.org/publications/ipsas-45-property-plant-and-equipment
- UN IPSAS PP&E chapter: https://www.un.org/ipsas/Chapter8.html
- GASB 104: https://gasb.org/page/pronouncement?pageId=/standards-and-guidance/pronouncements/summary-statement-no-104.html
- COSO Internal Control — Integrated Framework (IIA/COSO); IIA Global Internal Audit Standards: https://www.theiia.org/en/resources/knowledge-centers/public-sector/
- ISO/IEC 27001:2022 Annex A controls (incl. 8.15 logging, 8.16 monitoring): https://www.isms.online/iso-27001/annex-a-2022/5-15-access-control-2022/
- OWASP ASVS: https://owasp.org/projects/asvs ; OWASP Top 10: https://owasp.org/www-project-top-ten/
- NIST Cybersecurity Framework (identify/protect/detect/respond/recover)

**Ethiopian law**
- Proclamation No. 1333/2024 (Federal Public Procurement & Property Administration): https://www.ppa.gov.et/wp-content/uploads/2024/10/Procurement-and-property-proclamation-2024-.pdf
- Proclamation No. 649/2009 (repealed): https://policyvault.africa/policy/the-ethiopian-federal-government-procurement-and-property-administration-proclamation/
- FPPA Stock Management Manual: https://www.ppa.gov.et/wp-content/uploads/2024/09/Stock_Management_Manual_English.pdf
- GOFAMM manual (fixed assets): https://www.amharabofec.gov.et/media/documents/Manual_GOFAMM.pdf
- FPPA property documents: https://www.ppa.gov.et/document-category/property-docs/
- Personal Data Protection Proclamation No. 1321/2024: https://www.dlapiperdataprotection.com/index.html?t=law&c=ET
- Internal Auditors Directive No. 47/2016; OFAG Proc. 68/1997
- Higher Education Proclamation No. 1152/2019: https://justice.gov.et/en/law/higher-education-proclamation-no-1152-2019/

**Operations**
- Google SRE — Production Readiness Review: https://sre.google/sre-book/evolving-sre-engagement-model/
- GAO — Best practices for physical inventory: https://www.gao.gov/assets/gao-01-763g.pdf

---

*This dossier defines the rules. The companion blueprint
(`docs/gap-analysis-and-production-readiness.md`) turns them into a gap list, a feature catalogue,
and a production-readiness plan.*
