# docs/ — current files

On 20 Oct 2026 a full audit resolved all remaining conflicts between the active
docs and the code. The result is one unified document; it supersedes every other
file in this folder where they disagree.

## The active set

| File | What it is | Authority |
| --- | --- | --- |
| [`MASTER-TODO.md`](./MASTER-TODO.md) | **The work list.** Every phase, every task, with the evidence each one demands before it can be ticked — backend correctness, database reproducibility, realistic per-individual seed data, frontend↔backend contract tests, per-role UI/UX, responsive (mobile + desktop) checks, mobile parity, CI & deployment, and the role walkthroughs that decide whether the app is ready. | **Start here for work.** Read the KB first, then this. |
| [`KNOWLEDGE-BASE.md`](./KNOWLEDGE-BASE.md) | **The one document.** Roles, capability matrix, entity/DB schema, canonical state machines (with explicit rulings on former conflicts C1–C19), full API surface with wiring status, per-role navigation/UI, security and visibility rules, verified feature matrix, bug list, prioritised checkbox backlog, and definition of done. | **The source of truth.** Supersedes everything below where they conflict. |
| [`deployment.md`](./deployment.md) | The two Vercel projects, every environment variable, migration steps, and recorded deployment failures. | Operational runbook, referenced by KB §6. |
| [`monolithic-system-design.md`](./monolithic-system-design.md) | The 14 Oct audit the KB was built from — kept for the file:line audit trail. | Superseded wherever the KB rules on a conflict. |
| [`project-task-checklist.md`](./project-task-checklist.md) | The 14 Oct status audit; superseded by KB §14's backlog going forward. | Superseded by the KB backlog. |
| [`cncs-pms-account-approval-authority.md`](./cncs-pms-account-approval-authority.md) | The D1 authority decision and 20-row live-verification table. | Superseded by KB §3.2/§14; D1 ruling preserved verbatim. |
| [`workflow-completeness-spec.md`](./workflow-completeness-spec.md) | The INITIATE → APPROVE → CONFIRM handshake spec. | Superseded by KB §5's canonical state machines, which encode its rules plus rulings. |
| [`db-connection-resilience.md`](./db-connection-resilience.md) | Incident record for the for Neon TCP failure and its fix. | Incident history; fix already in code. |

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
   `KNOWLEDGE-BASE.md` rather than reviving the file.

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
