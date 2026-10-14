# docs/archive/ — history, not specification

Every file here was moved out of `docs/` on 14 Oct 2026 because
[`../monolithic-system-design.md`](../monolithic-system-design.md) had superseded it,
or because it documented a decision or a revision that has since been replaced. The
active set is listed in [`../README.md`](../README.md).

Each file carries the same note at the top, with the one line that explains why it is
here. Nothing here is maintained, and where one of these files disagrees with the
source of truth, this file is the one that is out of date.

| File | Why it is archived |
| --- | --- |
| [`app-icon-prompt.md`](./app-icon-prompt.md) | Icon generation prompt. The icons were generated afterwards (`mobile/tool/generate_app_icons.py`, the committed `mobile/web/icons/Icon-*.png`), so its "nothing has been replaced yet" premise is no longer true. |
| [`asset-management-standards-and-research.md`](./asset-management-standards-and-research.md) | Background research dossier (international practice, Ethiopian law, university operations). The conclusions it argued for are already landed in the source of truth. |
| [`backend-handoff.md`](./backend-handoff.md) | Old API reference, replaced by the source of truth's section 12 wiring map. It also documents the public `/items` reads that section 10 removed. |
| [`Backend_Three_Phase_Plan (2).md`](./Backend_Three_Phase_Plan%20(2).md) | Historical three-phase delivery plan for a schedule that has since been reworked. |
| [`cncs-pms-registration-hierarchy-task-list.md`](./cncs-pms-registration-hierarchy-task-list.md) | Amended and superseded by `cncs-pms-account-approval-authority.md`, which the source of truth's section 5 builds from. |
| [`cncs_pms_revised_plan_v2.md`](./cncs_pms_revised_plan_v2.md) | Spec revision v2. Its decisions are folded into the source of truth. |
| [`frontend-aau-rebrand.md`](./frontend-aau-rebrand.md) | Record of where the AAU brand values came from; the values themselves are applied in code. |
| [`frontend-design-system.md`](./frontend-design-system.md) | Design-system proposal. Its own header says "nothing here is built", which the shipped frontend now contradicts. |
| [`frontend-handoff.md`](./frontend-handoff.md) | Phase-era handoff, replaced by the source of truth. |
| [`frontend-phase-1.md`](./frontend-phase-1.md) | Phase 1 completion record. |
| [`frontend-phase-2.md`](./frontend-phase-2.md) | Phase 2 completion record. |
| [`frontend-phase-3.md`](./frontend-phase-3.md) | Phase 3 completion record. |
| [`frontend-phases-completion-summary.md`](./frontend-phases-completion-summary.md) | Session summary written on `frontend/phase1-scaffold`, which is not the canonical branch. |
| [`frontend-plan.md`](./frontend-plan.md) | Draft frontend plan, replaced by the source of truth. |
| [`Frontend_Three_Phase_Plan.md`](./Frontend_Three_Phase_Plan.md) | Historical three-phase frontend schedule. |
| [`full-work-plan-and-roadmap.md`](./full-work-plan-and-roadmap.md) | Roadmap for the earlier phase plan; live tracking now happens in `project-task-checklist.md`. |
| [`gap-analysis-and-production-readiness.md`](./gap-analysis-and-production-readiness.md) | Gap analysis. Its gaps are now tracked as tasks in `project-task-checklist.md`. |
| [`our-build-plan.md`](./our-build-plan.md) | Plain-language build plan for the earlier scope. |
| [`phase-1.md`](./phase-1.md) | Backend phase 1 completion record. |
| [`phase-2.md`](./phase-2.md) | Backend phase 2 completion record. |
| [`phase-3.md`](./phase-3.md) | Backend phase 3 completion record. |
| [`presentation-guide.md`](./presentation-guide.md) | Presentation script written against an earlier revision. |
| [`property-hierarchy-and-roles-plan.md`](./property-hierarchy-and-roles-plan.md) | Pre-implementation roles and hierarchy design. The five-role model is final in the source of truth's section 1. |
| [`role-based-ui-backend-handoff.md`](./role-based-ui-backend-handoff.md) | Handoff for role-based UI work; the source of truth's section 13 restates the result. |
| [`role-based-ui-spec.md`](./role-based-ui-spec.md) | Nav and widget spec. The source of truth's section 13 restates its lists and supersedes them where they differ. |
| [`social-previews.md`](./social-previews.md) | Deployment detail for the crawler/social-preview function, but the premise it depends on (`GET /items/:tagId` is public) was removed by section 10's auth fix, so the preview path cannot work as documented. |
| [`spec-review-and-open-questions.md`](./spec-review-and-open-questions.md) | Review snapshot; the conflicts it raised were closed by the 12 Oct decisions, now in the source of truth. |
| [`supervisor-feedback.md`](./supervisor-feedback.md) | Supervisor's review input, folded into the five-role model. |
