# BNCL Compliance Platform — Build Checklist

Source of truth: `BNCL_Compliance_Platform_Master.md`, Section 4 (Master Build Prompt).
Section 2 (Data Model & Page List v2) wins on any conflict with Sections 1/3.

## How this file works

- Every item below must be individually checked off **only after its acceptance
  criteria is verified**, never on the basis of "the code compiles" or "the code
  is written." Compiling is necessary, not sufficient.
- Re-read this file at the start of every phase, in full, before writing code.
- A phase is not complete until its **Phase Gate** (bottom of each phase) passes
  with shown, actual command output — not a description of expected output.
- `[ ]` = not done. `[x]` = done and verified. Nothing else is a valid state.

---

## Phase 0 — Pre-flight (this deliverable)

- [x] Read `BNCL_Compliance_Platform_Master.md` in full.
  - Acceptance: Sections 1–4 summarized correctly in this checklist and the schema below; the Events open item is carried forward, not resolved by invention.
- [x] Produce `BUILD_CHECKLIST.md` (this file).
- [x] Produce `prisma/schema.prisma` covering every entity in Section 2, including reference/taxonomy tables.
  - Acceptance: `npx prisma validate` exits 0. (Verified — see command output below.)
- [ ] **STOP. Get explicit user approval before writing any application code.**
  - This gate is mandatory per the build instructions. Do not begin Phase 1 implementation work until the user has reviewed the schema and this checklist and explicitly said to proceed.

### Phase 0 verification output

```
$ cd /workspace/claude-code && DATABASE_URL="postgresql://user:pass@localhost:5432/bncl?schema=public" npx prisma validate
Prisma schema loaded from prisma/schema.prisma
The schema at prisma/schema.prisma is valid 🚀
```

No database is provisioned yet, so `migrations run clean from scratch` and `seed works` are **not yet claimed** — those are Phase 1 gate items, not Phase 0.

---

## Phase 1 — Foundation

- [ ] Repo scaffold: Next.js 14+ App Router, TypeScript strict mode, Tailwind + shadcn/ui installed and configured.
  - Acceptance: `npm run build` succeeds with zero TypeScript errors; `tsconfig.json` has `"strict": true`.
- [ ] Prisma migration generated and applied from the schema in this repo.
  - Acceptance: `npx prisma migrate dev` runs clean against a fresh empty database with zero manual intervention. Command output pasted into this file under "Phase 1 verification output" before checking this box.
- [ ] Seed script created (`prisma/seed.ts`), seeding:
  - [ ] `RegulatorySubClause` — all Reg 17 sub-paragraphs (17(1) through 17(3), each lettered sub-paragraph as its own row).
  - [ ] `CQCKeyQuestion` — exactly 5 rows (Safe, Effective, Caring, Responsive, Well-led).
  - [ ] `SixPillar` — exactly 6 rows.
  - [ ] `RolePermission` — full view/edit/approve matrix for all 4 roles × all `ModuleName` values.
  - [ ] One reserved internal `Organisation` (`isInternal: true`) with one `BNCL_ADMIN` user.
  - [ ] Two demo client `Organisation` rows ("Org A", "Org B") — required for cross-tenant isolation testing, not optional/deferred to a later phase.
  - Acceptance: `npx prisma db seed` (or `npm run db:seed`) runs clean from an empty, migrated database and exits 0.
- [ ] Auth: NextAuth (Auth.js) configured with Credentials (email/password) and Email (magic link) providers, Prisma adapter, JWT session strategy with `orgId` and `role` claims embedded in the token.
  - Acceptance: manual login via both providers succeeds against the seeded demo org; JWT payload inspected and confirmed to contain `orgId` and `role`.
- [ ] Org / Site / User model wired end-to-end (not just schema — the signup-adjacent plumbing needed for auth to resolve a user to an org).
  - Acceptance: a logged-in session resolves to the correct `Organisation` and `Site[]` via the session, not via a client-supplied org id.
- [ ] **Scoped data-access layer** (`src/server/db/scoped-client.ts` or equivalent) that injects `orgId` from the session on every read/write to every tenant-scoped model.
  - Acceptance: a repo-wide grep confirms zero occurrences of direct `prisma.<tenantModel>.` calls outside this module and the BNCL super-admin module. This grep is added as an automated lint rule or CI check, not a one-time manual check.
- [ ] RBAC middleware: every route handler and server action performs, server-side, in this order: (1) auth check, (2) org check, (3) RBAC permission check via `RolePermission`.
  - Acceptance: a shared helper (e.g. `requireAuth()` / `requireModulePermission()`) exists and is demonstrably used by at least one real route in this phase (can be a stub route if no module UI exists yet) — not just documented as an intention.
- [ ] Tenant-scoping enforcement mechanism (Prisma middleware, or the scoped-client wrapper itself) that makes an unscoped query to a tenant table structurally difficult to write by accident.
  - Acceptance: a test exists that attempts to bypass scoping (e.g. calls the raw Prisma client against a tenant table without an org filter) and asserts it either fails a lint/type check or returns cross-tenant data in a way the test explicitly flags as a violation (i.e. the test is a canary, not a happy-path test).
- [ ] Base layout with nav structure matching the Section 2 page list (Compliance/Dashboard, Events, Risks, Audits, Notices, Scheduled tasks/Calendar, Documents/Policies) — nav items may be stubs/placeholders in Phase 1, but the structure and RBAC-based visibility must be real.
  - Acceptance: nav renders per-role (a Staff-role login sees a different nav than an Owner-role login), verified by rendering both.
- [ ] BNCL super-admin path isolated in its own module (`src/server/bncl-admin/**` or equivalent), requiring `BNCL_ADMIN` role explicitly, structurally separate from the scoped data-access layer.
  - Acceptance: code review confirms this module does not import or reuse the org-scoped client in a way that could leak org filtering into cross-org queries, and that it independently checks `role === 'BNCL_ADMIN'` before any query.
- [ ] **Cross-tenant isolation test suite** — the highest-priority item in this entire build.
  - Seed creates Org A and Org B (done above), each with at least one row in every tenant-scoped table reachable by Phase 1 (at minimum: User, Site).
  - [ ] Test: Org A's authenticated session cannot **read** any Org B row via any exposed query path.
  - [ ] Test: Org A's authenticated session cannot **edit** any Org B row (attempt returns 403/404, not a silent no-op).
  - [ ] Test: Org A's authenticated session cannot **delete** any Org B row.
  - [ ] Test: BNCL_ADMIN role **can** read across both orgs via the super-admin module only, and a non-BNCL_ADMIN role cannot reach that module even with a forged/guessed request.
  - Acceptance: all four tests pass. Full test runner output pasted into "Phase 1 verification output" below before checking any box in this section.

### Phase 1 verification output
*(to be filled in when Phase 1 is executed — do not pre-fill)*

### Phase 1 gate (ALL must be true, with pasted command output, before Phase 2 begins)
- [ ] `npx prisma migrate dev` — migrations run clean from an empty database.
- [ ] `npm run db:seed` — seed completes with zero errors.
- [ ] Cross-tenant isolation test suite — all tests pass (paste full output).
- [ ] All Phase 1 pages/routes render without error for at least one seeded user per role.

---

## Phase 2 — Onboarding and Dashboard

- [ ] Sign-up flow (creates Organisation + first Owner User + DPA acceptance record).
  - Acceptance: a brand-new signup produces a working login without any manual DB intervention, and a `DataProcessingAgreement` row is created at signup.
- [ ] Setup wizard: org details, site(s), registered activities, service type.
  - Acceptance: wizard output is persisted via the scoped data-access layer only; a fresh org completing the wizard has correct `Site` rows with `registeredActivities` populated.
- [ ] Role invite screen (invites a User with a role, status `INVITED` until accepted).
  - Acceptance: an invited user can complete signup and lands with the correct role and org — never able to choose or override their own org/role client-side.
- [ ] Main dashboard shell: live count badges, compliance score ring, stat tiles, donut chart, recent activity feed (driven by `AuditLogEntry`), quick access panel.
  - Acceptance: dashboard renders live counts sourced from real (seeded) data, not hardcoded placeholders; recent activity feed reflects actual `AuditLogEntry` rows for the logged-in user's org only (tie back to cross-tenant test: Org B's activity never appears for an Org A session).
- [ ] Compliance score placeholder formula documented in code and in README (explicitly marked as a V1 placeholder, easily replaceable).
  - Acceptance: formula is a pure function with a unit test, and its docstring/README entry states inputs, output range, and that it is provisional.

### Phase 2 gate
- [ ] Migrations clean from scratch (fresh DB, not reusing Phase 1's).
- [ ] Seed works.
- [ ] Cross-tenant isolation suite re-run and still passes (paste output).
- [ ] All Phase 2 pages render for at least one user per role.

---

## Phase 3 — Free Tier

- [ ] Q&G Hub: content list + detail pages, reading from `QGHubContent` (global, not tenant-scoped).
  - Acceptance: content is manageable only via the BNCL super-admin module; a non-BNCL_ADMIN cannot create/edit/publish content even via direct API call.
- [ ] Inspection Readiness Scorer: questionnaire → scored results by CQC domain.
  - Acceptance: submitting the questionnaire creates a `ReadinessScore` row scoped to the submitting user's org/site; scoring logic is a pure, tested function.
- [ ] Readiness history: score-over-time chart.
  - Acceptance: chart is populated from all `ReadinessScore` rows for the org ordered by `dateTaken`; an Org B session never sees Org A's history (tie back to cross-tenant test).
- [ ] Free-tier gating: paid modules are inaccessible (server-side, not just hidden nav) to `FREE` tier orgs.
  - Acceptance: a direct request to a paid-tier route/API from a FREE-tier session returns 403, verified by an automated test, not just observed by hiding the nav link.

### Phase 3 gate
- [ ] Migrations clean from scratch.
- [ ] Seed works.
- [ ] Cross-tenant isolation suite re-run and still passes (paste output).
- [ ] Tier-gating test (FREE org blocked from paid routes) passes (paste output).
- [ ] All Phase 3 pages render.

---

## Phase 4 — Core Governance Modules (paid)

For **each** of Audits, Incidents, Risk Register, Policies:

- [ ] List view (scoped to org/site, paginated).
- [ ] Create/edit flow that follows the append-only versioning pattern (new row + `supersededById`/`isCurrentVersion` flip, never an UPDATE of business fields) — verified by a test that edits a record twice and asserts three rows exist with a correct version chain, not just that the "current" view shows the latest values.
- [ ] Embedded follow-up/mitigation actions stored as the `Json` array field on the parent record — verified no separate table/module was created for these.
- [ ] Reg 17 / CQC tagging UI, writing to the polymorphic tag join tables, with the scoped data-access layer verifying `entityId` belongs to the caller's `orgId` before insert (this is the specific integrity gap called out in the schema comments — it must be closed here, not assumed).
- [ ] Attachments (upload to S3-compatible bucket, metadata row in `Attachment`).
- [ ] Every create/edit/delete/approve action writes an `AuditLogEntry` with real before/after JSON snapshots (verified by inspecting an actual row after a real mutation, not by code inspection alone).
- [ ] Risk Register matrix view (likelihood × impact grid), reading `riskRating` computed server-side.
  - Acceptance: attempting to submit a client-supplied `riskRating` that doesn't match `likelihood * impact` is ignored/overwritten server-side — verified by a test.
- [ ] Policy version history + review-date tracker UI.
- [ ] Cross-tenant isolation re-verified for all four modules: Org A cannot read/edit/delete Org B's Audits, Incidents, RiskEntries, or Policies (extend the Phase 1 suite, don't replace it).

### Phase 4 gate
- [ ] Migrations clean from scratch.
- [ ] Seed works (seed data now includes realistic Audits/Incidents/RiskEntries/Policies for both demo orgs, across both organisations, so the isolation tests have real data to fail against).
- [ ] Cross-tenant isolation suite, extended to cover all four modules, passes (paste full output).
- [ ] Versioning-chain test passes for all four modules (paste output).
- [ ] All Phase 4 pages render for at least one user per role.

---

## Phase 5 — Supporting Modules

- [ ] Feedback & Complaints: list/create/edit, outcome tracking.
- [ ] Staff Training: records, expiry tracking, status derivation (`VALID`/`EXPIRING_SOON`/`EXPIRED`) feeding into Calendar.
  - Acceptance: a training record within the "expiring soon" window (define and document the threshold, e.g. 30 days) produces a `CalendarTask`.
- [ ] Notices: post/view, audience targeting (`ALL_STAFF`/`MANAGERS_ONLY`/`SPECIFIC_SITE`), acknowledgement tracking via `NoticeAcknowledgement`.
  - Acceptance: a `SPECIFIC_SITE` notice is genuinely invisible to users at other sites in the *same* org (site-level scoping, not just org-level) — verified by test.
- [ ] Events: minimal generic log — list, create/edit with `eventType` as free-text-plus-suggestions, tagging, attachments, status.
  - Acceptance: Events is NOT merged into Incidents and Incidents is NOT a subtype of Events (verified by code review — separate models, separate routes, separate nav items). A code comment and a README section state the Events definition is pending product confirmation, per the source doc's open item — this must not be silently resolved by this phase.
- [ ] Unified Calendar: aggregates `CalendarTask` across audits, policy reviews, training expiries, events.
- [ ] Notifications: system-generated, distinct from Notices (verify no code path conflates the two models).
- [ ] Cross-tenant isolation re-verified for all Phase 5 modules.

### Phase 5 gate
- [ ] Migrations clean from scratch.
- [ ] Seed works.
- [ ] Cross-tenant isolation suite, extended to cover Phase 5 modules, passes (paste output).
- [ ] All Phase 5 pages render.

---

## Phase 6 — Evidence Pack Generator

- [ ] Date range + domain (CQC key question / Reg clause / Six Pillar) selection UI.
- [ ] Query layer that compiles all tagged evidence across every module for the selected org/site/date range/domain — must go through the scoped data-access layer like everything else.
- [ ] PDF export via server-side rendering, inspection-presentable (headings, dates, org/site identification, source module per item).
  - Acceptance: a generated pack for Org A, opened and inspected, contains zero Org B records — this is the single highest-value cross-tenant test in the whole product given this is the literal "hand this to a CQC inspector" output. Test explicitly asserts this, not just "renders."
- [ ] Evidence pack generation itself writes an `AuditLogEntry` (action `EXPORT`).

### Phase 6 gate
- [ ] Migrations clean from scratch.
- [ ] Seed works.
- [ ] Cross-tenant isolation suite passes, including the evidence-pack-specific leak test above (paste output).
- [ ] A real generated PDF is produced from seed data and visually reviewed.

---

## Phase 7 — Admin, Billing, Super-Admin

- [ ] User & role management UI (invite, change role, disable) — server-side RBAC re-checked on every action, not assumed from the UI having hidden the button.
- [ ] Site management (multi-site orgs).
- [ ] Stripe integration: Checkout, Customer Portal, webhook-driven `subscriptionTier`/`billingStatus` updates.
  - Acceptance: a test/simulated webhook event flips an org from FREE to PAID and the tier-gating tests from Phase 3 immediately reflect it (no cache/staleness bug) — verified live, not assumed.
  - Acceptance: webhook signature verification is enforced (a forged/unsigned webhook payload is rejected) — verified by test.
- [ ] Data protection centre: DPA status, org-scoped JSON data export endpoint, retention settings.
  - Acceptance: the export endpoint, called by an Org A session, contains only Org A data — this is a cross-tenant test, not just a feature demo.
- [ ] BNCL super-admin: cross-org overview (engagement/health signals per client), Q&G Hub content management.
  - Acceptance: re-verify (don't just assume from Phase 1) that a non-BNCL_ADMIN role gets 403 on every super-admin route, including with a manually crafted request.

### Phase 7 gate
- [ ] Migrations clean from scratch.
- [ ] Seed works.
- [ ] Full cross-tenant isolation suite (all modules, accumulated from every phase) passes (paste output).
- [ ] Stripe webhook simulation test passes (paste output).
- [ ] Data export cross-tenant test passes (paste output).
- [ ] All pages in the full Section 2 page list render for at least one user per role.

---

## Standing rules that apply to every phase (not one-time items)

- [ ] No raw `prisma.<tenantModel>` calls outside the scoped data-access layer and the BNCL super-admin module — checked every phase, not just Phase 1.
- [ ] Every route handler / server action: auth check → org check → RBAC check, server-side, in that order — checked every phase.
- [ ] Cross-tenant isolation tests must pass at the end of **every** phase, cumulative (not just the modules built in that phase).
- [ ] TypeScript strict, no `any` in domain code.
- [ ] Zod validation on every input boundary (forms and API).
- [ ] No PII in logs.
- [ ] README updated each phase: env vars, setup, architecture decisions, and the Events open item kept current.

## Known open item

**Events** semantics are intentionally undefined by the source document. Do not resolve this by inventing a definition. Phase 1 creates the `Event` table exactly as specified. Phase 5 builds it as a minimal generic log only. Every phase's README update must retain the note that this is pending product/client confirmation.
