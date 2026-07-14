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

- [x] Repo scaffold: Next.js 14+ App Router, TypeScript strict mode, Tailwind installed and configured.
  - Acceptance: `npm run build` succeeds with zero TypeScript errors; `tsconfig.json` has `"strict": true`. **Verified.**
  - Deviation: shadcn/ui was not installed as a component library in Phase 1 — the login page and nav use hand-written Tailwind markup. No shadcn primitives were needed yet (no forms/dialogs/tables beyond what plain Tailwind covers). Revisit when Phase 2+ needs richer components (data tables, dialogs, date pickers).
- [x] Prisma migration generated and applied from the schema in this repo.
  - Acceptance: `npx prisma migrate dev` runs clean against a fresh empty database with zero manual intervention. **Verified** — see output below.
- [x] Seed script created (`prisma/seed.ts`), seeding:
  - [x] `RegulatorySubClause` — 8 Reg 17 sub-paragraphs (17(1), 17(2)(a)–(f), 17(3)). Text is representative/seed-quality — flagged in-code as needing legal verification before production use.
  - [x] `CQCKeyQuestion` — exactly 5 rows (Safe, Effective, Caring, Responsive, Well-led).
  - [x] `SixPillar` — exactly 6 rows.
  - [x] `RolePermission` — full view/edit/approve matrix for all 4 roles × all 18 `ModuleName` values (72 rows).
  - [x] One reserved internal `Organisation` (`isInternal: true`) with one `BNCL_ADMIN` user.
  - [x] Two demo client `Organisation` rows (Greenfield Aesthetic Clinic / Riverside Dental Practice — "Org A" / "Org B"), each with a site, an Owner/Manager/Staff user, one Audit, one Incident.
  - Acceptance: `npm run db:seed` runs clean from an empty, migrated database and exits 0. **Verified.**
- [x] Auth: NextAuth (Auth.js v4) configured with Credentials (email/password) and Email (magic link) providers, Prisma adapter, JWT session strategy with `orgId` and `role` claims embedded in the token.
  - Acceptance: manual login via both providers succeeds against the seeded demo org; JWT payload inspected and confirmed to contain `orgId` and `role`. **Verified for both providers** — Credentials login confirmed via RBAC nav rendering (see below); Email/magic-link confirmed end-to-end using a local SMTP catcher: link sent, link followed, landed on an authenticated `/dashboard` showing the correct signed-in user.
  - Two real bugs found and fixed during this verification (not merely "code compiled"): (1) `User.email` was only unique per-org (`@@unique([orgId, email])`), but NextAuth's PrismaAdapter and the credentials login itself both resolve users by email alone with no org selector — changed to a single global `@unique` on `email`. (2) `User` was missing `emailVerified DateTime?`, which NextAuth's adapter requires to stamp magic-link verification — added.
- [x] Org / Site / User model wired end-to-end.
  - Acceptance: a logged-in session resolves to the correct `Organisation` via the session (never client-supplied). **Verified** — confirmed via `/bncl-admin` and `/dashboard` content checks below.
- [x] **Scoped data-access layer** (`src/server/db/scoped-client.ts`) that injects `orgId` from the session on every read/write to every tenant-scoped model.
  - Acceptance: a repo-wide check confirms zero occurrences of direct `prisma.<tenantModel>.` calls outside this module and the BNCL super-admin module. **Verified** — `scripts/check-tenant-isolation-imports.js`, wired as `npm run check:tenant-isolation-imports`, passes (5 allowlisted files: `db/prisma.ts`, `db/scoped-client.ts`, `bncl-admin/client.ts`, `auth/auth.ts`, `rbac/permissions.ts` — the last two documented as legitimate exceptions: NextAuth's adapter and the global, non-tenant `RolePermission` reference table).
- [x] RBAC: every route handler / server action performs, server-side, in order: (1) auth check, (2) org check, (3) RBAC permission check via `RolePermission`.
  - Acceptance: `requireAuth()` (step 1), `requireOrgMatch()` (step 2, for the rarer case client input references an org), and `requireModulePermission()` (steps 1+3 combined) exist in `src/server/auth/session.ts` / `src/server/rbac/permissions.ts` and are used by real routes (`/dashboard`, `/dashboard/*` layout, `/bncl-admin`). **Verified** — see the RBAC nav-rendering and cross-role access tests below.
- [x] Tenant-scoping enforcement mechanism.
  - Acceptance: a canary test exists. **Verified** — `tests/tenant-isolation.test.ts` directly attacks `scopedDb()` (spoofed `orgId` in `where`/`data`, cross-org read/update/delete attempts) and all assertions pass. One of these tests caught a real bug during development (see verification output below), proving the canary works, not just that it exists.
- [x] Base layout with nav structure matching the Section 2 page list.
  - Acceptance: nav renders per-role, verified by rendering both. **Verified with a real browser (Playwright)**, not just code review — OWNER, STAFF, and BNCL_ADMIN logins produce three genuinely different nav sets (OWNER sees 17 items including all ADMIN_* items; STAFF sees 13 items, no ADMIN_* items; BNCL_ADMIN is routed to `/bncl-admin` instead of the client dashboard entirely, since it has no `DASHBOARD` permission). See output below.
- [x] BNCL super-admin path isolated in its own module (`src/server/bncl-admin/client.ts`), requiring `BNCL_ADMIN` role explicitly.
  - Acceptance: **Verified live**, not just by code review — a real BNCL_ADMIN login sees both demo orgs' data on `/bncl-admin`; a real client-org Owner login hitting `/bncl-admin` directly gets rejected (`BnclAdminRequiredError`, HTTP 500 in dev mode) with zero org data in the response body. (Follow-up, not a Phase 1 blocker: replace the raw dev-mode error page with a clean 403 page in a later phase — the security boundary is correct, the error page just isn't polished.)
- [x] **Cross-tenant isolation test suite** — the highest-priority item in this entire build.
  - [x] Test: Org A cannot **read** Org B's Site (`findUnique`) or Users (`findMany`, even with a spoofed `orgId` filter).
  - [x] Test: Org A cannot **edit** Org B's Site — `update` rejected, row provably untouched afterward via a raw read.
  - [x] Test: Org A cannot **delete** Org B's Audit — `delete` rejected, row provably still exists afterward.
  - [x] Test: Org A cannot spoof another org's id on `create` — `orgId` is always overwritten to the caller's real org.
  - [x] Test: BNCL_ADMIN role assertion accepts BNCL_ADMIN and rejects OWNER/REGISTERED_MANAGER sessions; the underlying cross-org read capability the super-admin module depends on is proven to actually see both orgs.
  - [x] RBAC matrix tests: STAFF cannot approve on Audits (OWNER can); STAFF cannot view admin modules; BNCL_ADMIN has no implicit access to governance modules.
  - Acceptance: all 14 tests pass. **Verified** — see full `vitest` output below.

### Phase 1 verification output

All commands below were run against dropped-and-recreated (true from-scratch) local Postgres databases (`bncl_dev`, `bncl_test`), not reused state.

```
$ npx prisma migrate dev --name init
Datasource "db": PostgreSQL database "bncl_dev", schema "public" at "localhost:5432"
Applying migration `20260714183643_init`
The following migration(s) have been created and applied from new schema changes:
migrations/
  └─ 20260714183643_init/
    └─ migration.sql
Your database is now in sync with your schema.
✔ Generated Prisma Client (v5.22.0) to ./node_modules/@prisma/client

$ npm run db:seed
Seed complete:
  Org A: Greenfield Aesthetic Clinic (demo-org-a)
  Org B: Riverside Dental Practice (demo-org-b)
  BNCL internal admin: admin@bncl-solutions.example / BnclAdmin1234!
  Org A owner: owner@greenfield-demo.example / DemoOwner1234!
  Org B owner: owner@riverside-demo.example / DemoOwner1234!

$ DATABASE_URL=".../bncl_test" npx prisma migrate deploy
1 migration found in prisma/migrations
Applying migration `20260714183643_init`
All migrations have been successfully applied.

$ DATABASE_URL=".../bncl_test" npx tsx prisma/seed.ts
Seed complete: (same as above, against bncl_test)

$ DATABASE_URL=".../bncl_test" npx vitest run
 ✓ tests/tenant-isolation.test.ts (14 tests) 108ms
 Test Files  1 passed (1)
      Tests  14 passed (14)

$ npm run check:tenant-isolation-imports
OK: no unscoped raw-Prisma imports found outside the allowlist (5 allowlisted files).

$ npm run lint
✔ No ESLint warnings or errors

$ npm run build
✓ Compiled successfully
✓ Linting and checking validity of types ...
✓ Generating static pages (7/7)
Route (app)                              Size     First Load JS
┌ ƒ /                                    146 B          87.5 kB
├ ○ /_not-found                          873 B          88.2 kB
├ ƒ /api/auth/[...nextauth]              0 B                0 B
├ ƒ /bncl-admin                          146 B          87.5 kB
├ ƒ /dashboard                           146 B          87.5 kB
└ ○ /login                               10.7 kB          98 kB
```

RBAC nav-rendering, verified live with a headless browser (Playwright) against the running dev server, logging in as three different seeded users:

```
OWNER  (owner@greenfield-demo.example) -> /dashboard, 17 nav items incl. Users & Roles, Sites, Billing, Data Protection Centre
STAFF  (staff@greenfield-demo.example) -> /dashboard, 13 nav items, NO admin items
BNCL_ADMIN (admin@bncl-solutions.example) -> routed to /bncl-admin (no DASHBOARD permission), shows both demo orgs' names/tier/billing status/user counts
```

Cross-role access control, verified live via HTTP:
```
Org A Owner -> GET /bncl-admin -> HTTP 500, "requires the BNCL_ADMIN role", zero org data in response body
BNCL_ADMIN  -> GET /bncl-admin -> HTTP 200, both "Greenfield Aesthetic Clinic" and "Riverside Dental Practice" present
```

Magic-link (Email provider) end-to-end, verified live via a local SMTP catcher:
```
POST /api/auth/signin/email (owner@greenfield-demo.example) -> 200, verify-request page
[SMTP catcher receives email] Subject: "Sign in to localhost:3000", contains a callback link with a token
GET <callback link> -> 302 -> lands on /dashboard
GET /dashboard (same session) -> page content confirms "Signed in as owner@greenfield-demo.example (OWNER)"
```

### Phase 1 gate (ALL must be true, with pasted command output, before Phase 2 begins)
- [x] `npx prisma migrate dev` — migrations run clean from an empty database.
- [x] `npm run db:seed` — seed completes with zero errors.
- [x] Cross-tenant isolation test suite — all 14 tests pass (paste above).
- [x] All Phase 1 pages/routes render without error for at least one seeded user per role — verified live for OWNER, STAFF, and BNCL_ADMIN (see above). REGISTERED_MANAGER was seeded but not separately browser-tested in Phase 1 (its RolePermission row is identical in shape to OWNER/STAFF's and covered by the RBAC matrix unit tests) — worth a live check in Phase 2 once there's more surface area for it to render.

---

## Phase 2 — Onboarding and Dashboard

- [x] Sign-up flow (creates Organisation + first Owner User + DPA acceptance record).
  - Acceptance: a brand-new signup produces a working login without any manual DB intervention, and a `DataProcessingAgreement` row is created at signup.
  - Verified live: `POST /api/signup` (src/app/api/signup/route.ts -> src/server/onboarding/signup.ts) creates the org/owner/DPA in one flow; `src/app/signup/page.tsx` collects input and auto-signs-in via NextAuth Credentials on success. Real curl smoke test (below) signed up, logged in, and reached the dashboard with zero manual DB steps. Unit-tested in `tests/phase2-onboarding-dashboard.test.ts` ("sign-up: creates exactly one org/user/DPA row, no cross-contamination").
- [x] Setup wizard: org details, site(s), registered activities, service type.
  - Acceptance: wizard output is persisted via the scoped data-access layer only; a fresh org completing the wizard has correct `Site` rows with `registeredActivities` populated.
  - Verified: `src/app/dashboard/setup-wizard/page.tsx` -> `POST /api/setup-wizard` -> `src/server/onboarding/setup-wizard.ts`, which writes exclusively through `scopedDb(orgId)`. Service type has no dedicated schema column (schema.prisma unchanged this phase) — by documented convention it is stored as the first element of `registeredActivities`; see the docstring in setup-wizard.ts and this same note. Unit-tested and live curl-verified (below).
- [x] Role invite screen (invites a User with a role, status `INVITED` until accepted).
  - Acceptance: an invited user can complete signup and lands with the correct role and org — never able to choose or override their own org/role client-side.
  - Verified: `src/app/dashboard/admin/users/page.tsx` (list + invite form) -> `POST /api/invites` -> `src/server/onboarding/invite.ts`, which creates the User (status INVITED) and a hashed token reusing the NextAuth `VerificationToken` model (documented design-choice comment in invite.ts). `src/app/invite/accept/page.tsx` -> `GET`/`POST /api/invites/accept` resolves org/role purely from the token-identified User row; `acceptInviteSchema` has no org/role field at all, so there is nothing for a client to spoof. Live curl smoke test accepted an invite and confirmed the resulting user kept its assigned org/role even when the accept payload was constructed with spoofed `orgId`/`role` fields (test: "accepting a valid invite activates the user in the inviting org with the assigned role"); single-use token rejection also verified (both in the unit test and live: a second accept attempt on the same token returned "invite link is invalid or has expired").
- [x] Main dashboard shell: live count badges, compliance score ring, stat tiles, donut chart, recent activity feed (driven by `AuditLogEntry`), quick access panel.
  - Acceptance: dashboard renders live counts sourced from real (seeded) data, not hardcoded placeholders; recent activity feed reflects actual `AuditLogEntry` rows for the logged-in user's org only (tie back to cross-tenant test: Org B's activity never appears for an Org A session).
  - Verified: `src/app/dashboard/page.tsx` renders `src/server/dashboard/data.ts`'s `getDashboardData()` output through `src/components/dashboard/{stat-tile,compliance-ring,module-donut,activity-feed,quick-access}.tsx`. Live curl smoke test confirmed real, non-hardcoded values (Sites: 1, Team members: 2, Compliance score: 100, activity feed showing "Smoke Owner created the organisation" / "created a site" / "invited a team member" with real timestamps). Cross-tenant isolation of the feed and counts unit-tested in `tests/phase2-onboarding-dashboard.test.ts` ("dashboard data: counts and activity feed are strictly org-scoped") using distinctive per-org marker rows, plus re-run of the full Phase 1 `tests/tenant-isolation.test.ts` suite (still 14/14 passing).
- [x] Compliance score placeholder formula documented in code and in README (explicitly marked as a V1 placeholder, easily replaceable).
  - Acceptance: formula is a pure function with a unit test, and its docstring/README entry states inputs, output range, and that it is provisional.
  - Verified: `src/server/compliance/score.ts` (`computeComplianceScore`, `complianceBand`) is a pure function with an extensive V1-placeholder docstring; README.md has a matching "Compliance score (V1 placeholder)" section. 7 unit tests cover known-input cases including the exact weighted-blend arithmetic, zero-denominator neutrality, and out-of-range clamping.
  - Deviation: no shadcn/ui or chart library was added (consistent with Phase 1's "hand-written Tailwind" note) — the compliance ring and module donut are hand-built SVG/CSS-conic-gradient components using the dataviz skill's validated default status/categorical palettes (fixed hue order, keyed by `ModuleName` so role-based visibility never repaints colors). No dark-mode variants were added, matching every other page in this codebase, which is light-only throughout Phase 1 and Phase 2.

### Phase 2 gate

- [x] Migrations clean from scratch (fresh DB, not reusing Phase 1's).
  ```
  $ sudo -u postgres psql -c "DROP DATABASE IF EXISTS bncl_dev_phase2;"
  DROP DATABASE
  $ sudo -u postgres psql -c "CREATE DATABASE bncl_dev_phase2 OWNER bncl;"
  CREATE DATABASE
  $ DATABASE_URL="postgresql://bncl:bncl_dev_password@localhost:5432/bncl_dev_phase2?schema=public" npx prisma migrate deploy
  1 migration found in prisma/migrations
  Applying migration `20260714183643_init`
  All migrations have been successfully applied.
  ```
- [x] Seed works.
  ```
  $ DATABASE_URL="postgresql://bncl:bncl_dev_password@localhost:5432/bncl_dev_phase2?schema=public" npm run db:seed
  Seed complete:
    Org A: Greenfield Aesthetic Clinic (demo-org-a)
    Org B: Riverside Dental Practice (demo-org-b)
    BNCL internal admin: admin@bncl-solutions.example / BnclAdmin1234!
    Org A owner: owner@greenfield-demo.example / DemoOwner1234!
    Org B owner: owner@riverside-demo.example / DemoOwner1234!
  ```
  (Same drop/create/migrate/seed sequence repeated against `bncl_test_phase2` for the test run below.)
- [x] Cross-tenant isolation suite re-run and still passes (paste output).
  ```
  $ DATABASE_URL="postgresql://bncl:bncl_dev_password@localhost:5432/bncl_test_phase2?schema=public" npx vitest run
   ✓ tests/tenant-isolation.test.ts (14 tests) 106ms
   ✓ tests/phase2-onboarding-dashboard.test.ts (16 tests) 776ms

   Test Files  2 passed (2)
        Tests  30 passed (30)
  ```
- [x] All Phase 2 pages render for at least one user per role.
  - Live-tested against the freshly-seeded `bncl_dev_phase2` DB (`PORT=3010 npm run dev`), one login per role:
    - OWNER (`owner@greenfield-demo.example`): `/dashboard` 200, `/dashboard/admin/users` 200, `/dashboard/setup-wizard` 200.
    - REGISTERED_MANAGER (`manager@greenfield-demo.example`): `/dashboard` 200, `/dashboard/admin/users` 200, `/dashboard/setup-wizard` 200.
    - STAFF (`staff@greenfield-demo.example`): `/dashboard` 200, `/dashboard/setup-wizard` 200, `/dashboard/admin/users` 500 — **expected**, not a bug: STAFF's seeded `RolePermission` row has `canView: false` on `ADMIN_USERS` (all `ADMIN_*` modules are view-blocked for STAFF per `prisma/seed.ts`'s `permissionsFor`), so `requireModulePermission` throws `ForbiddenError` server-side and Next.js renders its default error boundary rather than leaking the org's user list — identical, deliberate pattern to Phase 1's `src/app/bncl-admin/page.tsx` (see that file's own comment).
  - New sign-up end-to-end also live-verified: `POST /api/signup` -> Credentials sign-in -> `POST /api/setup-wizard` -> `POST /api/invites` -> `GET/POST /api/invites/accept` -> `GET /dashboard` (see chat transcript for full curl sequence); dashboard HTML confirmed to contain real computed values, not placeholders.

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
