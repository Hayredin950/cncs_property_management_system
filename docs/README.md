# docs/ — the four files that are current

Everything in this folder is either one of the four files below or history. On
14 Oct 2026 the folder held 32 documents — three phase plans, two designs of the
same system, several "plan"/"handoff"/"roadmap" variants — and more than one of
them described behaviour the code had already moved past. Nobody could tell which
one to believe. They were read, classified and moved; nothing was deleted.

## The active set

| File | What it is | Authority |
| --- | --- | --- |
| [`monolithic-system-design.md`](./monolithic-system-design.md) | Roles, capabilities, data model, workflows, security requirements, the wiring map, and a definition of done. Built from the 14 Oct audit — verified `file:line` and live behaviour, not claims. | **The source of truth.** It supersedes every other document where they conflict, and it says so itself. |
| [`project-task-checklist.md`](./project-task-checklist.md) | Live tracking: what is done, what is broken, what has not been started, each `[x]` with the evidence that proved it. | **The source of truth for status.** Update this as work lands; it is the file §15 expects to be current at the end. |
| [`cncs-pms-account-approval-authority.md`](./cncs-pms-account-approval-authority.md) | Who authorises which account, the T1–T9 build tasks, and the 20-row live-verification table. | Active, but only as §5's detail. The design's §5 makes the account-approval decision final (finish the `AccountRequest` flow, retire the legacy one) — it is decided, and §5.2 still requires this file's 20 rows run live. |
| [`deployment.md`](./deployment.md) | The two Vercel projects, every environment variable, migration steps, and three deployment failures worth not rediscovering. | Operational runbook. Read it **with §11**: it documents the projects as configured, not which revision they build. Both projects build `main`, which is not the canonical branch yet — §11.0/§11.2 say what that costs. |

## The rules

1. **A document that is not in the table above is not current.** If you need one,
   it is in [`archive/`](./archive/).
2. **A filename referenced by an active doc but missing from this folder is in
   `archive/`.** Archived docs keep their original names, so the reference resolves
   one level down; those references have been rewritten to `archive/<name>` where
   they occur.
3. **Every archived file says so at the top**, with the one line explaining what
   superseded it. Read one for history, never as a specification.
4. **Nothing is deleted.** Archive and git history are the record; if a later
   decision needs something out of an archived doc, take it back into
   `monolithic-system-design.md` rather than reviving the file.

## What was archived, and why (summary)

- **Phase 1/2/3 records** (`phase-*.md`, `frontend-phase-*.md`) — completion notes
  for phases that have since been reworked; the work they describe is not what
  runs now.
- **Plan variants** (`Backend_Three_Phase_Plan (2).md`, `Frontend_Three_Phase_Plan.md`,
  `full-work-plan-and-roadmap.md`, `our-build-plan.md`, `cncs_pms_revised_plan_v2.md`,
  `frontend-plan.md`, `property-hierarchy-and-roles-plan.md`) — superseded
  schedules and specs whose surviving decisions are now stated in the design.
- **Handoffs and specs restated by the design** (`backend-handoff.md`,
  `frontend-handoff.md`, `role-based-ui-spec.md`, `role-based-ui-backend-handoff.md`,
  `frontend-design-system.md`) — the design's §12 and §13 restate them, and some of
  them document endpoints (`GET /items`, `GET /items/:tagId` as public) that §10
  deliberately removed.
- **Review and input records** (`spec-review-and-open-questions.md`,
  `supervisor-feedback.md`, `asset-management-standards-and-research.md`,
  `gap-analysis-and-production-readiness.md`) — the inputs behind decisions that
  are now final.
- **Superseded operational notes** (`social-previews.md`, `app-icon-prompt.md`) —
  see their headers: the first depends on an endpoint that is no longer public, the
  second on icons that have since been generated.

See [`archive/README.md`](./archive/README.md) for the per-file one-liner.
