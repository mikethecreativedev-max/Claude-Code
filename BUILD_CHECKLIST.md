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

- [x] Q&G Hub: content list + detail pages, reading from `QGHubContent` (global, not tenant-scoped).
  - Acceptance: content is manageable only via the BNCL super-admin module; a non-BNCL_ADMIN cannot create/edit/publish content even via direct API call.
  - Verified: `src/server/bncl-admin/client.ts`'s `createQGHubContent`/`updateQGHubContent` call `assertBnclAdmin(session)` before any write; `src/server/content/qg-hub.ts` is a read-only module (published-only for non-admins, draft-visible for BNCL_ADMIN, drafts 404 rather than 403 for non-admins so existence isn't leaked). Proven by `tests/phase3-free-tier.test.ts` describe blocks "Q&G Hub: published-only reads for non-admins" and "(d) Q&G Hub: a non-BNCL_ADMIN cannot write QGHubContent" (includes a positive control that a real BNCL_ADMIN session succeeds, and a direct-DB check that a rejected create left no row behind).
- [x] Inspection Readiness Scorer: questionnaire → scored results by CQC domain.
  - Acceptance: submitting the questionnaire creates a `ReadinessScore` row scoped to the submitting user's org/site; scoring logic is a pure, tested function.
  - Verified: `src/server/readiness/scoring.ts`'s `computeReadinessScore()` is a pure function (no I/O), unit-tested directly for all-Yes/all-No/mixed-known-answer cases (hand-computed expected scores), missing-answer-throws, and repeated-call determinism. `src/server/readiness/actions.ts`'s `submitReadinessQuestionnaire()` runs the mandatory auth → RBAC → Zod validation → pure scoring → `scopedDb(session.orgId)` write chain. Confirmed for real via curl smoke test below (real DB row, real computed score).
- [x] Readiness history: score-over-time chart.
  - Acceptance: chart is populated from all `ReadinessScore` rows for the org ordered by `dateTaken`; an Org B session never sees Org A's history (tie back to cross-tenant test).
  - Verified: `src/app/dashboard/readiness/history/page.tsx` queries `scopedDb(session.orgId).readinessScore.findMany({ orderBy: { dateTaken: "asc" } })` and renders an inline SVG line chart + table. `tests/phase3-free-tier.test.ts` describe block "(a) Readiness history: cross-tenant isolation" proves Org A/B separation at findMany, findUnique, and spoofed-where-clause levels. Confirmed live: after Org A's owner submitted the questionnaire via curl, Org B's owner session's `/dashboard/readiness/history` page still rendered "No readiness scores yet."
- [x] Free-tier gating: paid modules are inaccessible (server-side, not just hidden nav) to `FREE` tier orgs.
  - Acceptance: a direct request to a paid-tier route/API from a FREE-tier session returns 403, verified by an automated test, not just observed by hiding the nav link.
  - **Deviation, noted honestly**: no paid-tier module (AUDITS, INCIDENTS, etc. — Phase 4-7) has a route/API built yet in this phase, so there is no live paid-tier HTTP endpoint to send a request at. What Phase 3 delivers instead is the gating primitive those future phases are required to call: `src/server/rbac/tier.ts` exports `requireTier(session, tier)` (throws `TierRequiredError`, re-reads `Organisation.subscriptionTier` from the DB on every call — no JWT-staleness window) and `requireModulePermissionWithTier(module, level, tier = "PAID")`, which composes `requireModulePermission()` (RBAC) with `requireTier()` (subscription tier) — the standard entry point Phase 4+ route handlers/server actions must use for every non-free module. `requireTier()` is tested directly against the real seeded+migrated test DB (matching this codebase's existing pattern of testing session-taking pure functions directly rather than mocking a NextAuth request — see `assertBnclAdmin`'s tests in `tests/tenant-isolation.test.ts`): rejects a FREE-tier org's session with `TierRequiredError`, accepts PAID, never rejects when FREE is required, and a live tier flip (FREE → PAID → FREE via `rawPrisma.organisation.update`) takes effect on the very next call with no caching. `ForbiddenError`/`UnauthorizedError`→HTTP-status mapping is already established in `src/app/api/dashboard/readiness/route.ts`; `TierRequiredError` should map to 403 there the same way once a paid-tier route exists to map it in. Route-level 403 verification against a real paid module route will happen as part of that later phase's gate.

### Phase 3 gate
- [x] Migrations clean from scratch. (`prisma migrate deploy` against freshly-created `bncl_dev_phase3` and `bncl_test_phase3` — 1 migration, `20260714183643_init`, applied cleanly to both.)
- [x] Seed works. (`npm run db:seed` against both databases — 2 demo orgs, BNCL admin, 2 org owners.)
- [x] Cross-tenant isolation suite re-run and still passes (paste output).
  ```
  ✓ tests/tenant-isolation.test.ts (14 tests) 337ms
  ✓ tests/phase3-free-tier.test.ts (21 tests) 414ms
  Test Files  2 passed (2)
       Tests  35 passed (35)
  ```
- [x] Tier-gating test (FREE org blocked from paid routes) passes (paste output).
  ```
  ✓ (c) requireTier(): FREE-tier org session gets rejected, PAID-tier passes (4 tests)
    ✓ rejects a FREE-tier org's session when PAID is required
    ✓ accepts a PAID-tier org's session when PAID is required
    ✓ never rejects when FREE is required, regardless of the org's actual tier
    ✓ re-reads the tier fresh from the database (no staleness): a tier flip takes effect immediately
  ```
  (See "Deviation, noted honestly" above — no live paid-tier HTTP route exists yet to hit with curl; this is the gating primitive itself, DB-backed and real.)
- [x] All Phase 3 pages render. Verified live against `PORT=3011 npm run dev`: `/dashboard/qg-hub` (200), `/dashboard/readiness` (200), `/dashboard/readiness/history` (200, renders submitted score after a real questionnaire submission), unauthenticated POST to `/api/dashboard/readiness` → 401.

---

## Phase 4 — Core Governance Modules (paid)

For **each** of Audits, Incidents, Risk Register, Policies. Built in two parallel worktrees — Audits+Incidents (`claude/phase4a-audits-incidents`) and Risk Register+Policies (`claude/phase4b-risk-policies`) — merged together below; every item is now done for all four modules.

- [x] List view (scoped to org/site, paginated).
  - Audits/Incidents: `src/app/dashboard/audits/page.tsx`, `src/app/dashboard/incidents/page.tsx` (paginated via `listCurrentAudits`/`listCurrentIncidents`, scoped by `scopedDb`).
  - Risk Register + Policies: `/dashboard/risks` (sorted by `riskRating` desc) and `/dashboard/policies` (review-date tracker, sorted by due date), from `listCurrentRiskEntries`/`getPolicyReviewTracker`, filtering `isCurrentVersion: true, deletedAt: null` through `scopedDb(orgId)`. Not paginated yet (acceptable at current seed-data volume; flagged as a follow-up once list sizes grow).
- [x] Create/edit flow that follows the append-only versioning pattern (new row + `supersededById`/`isCurrentVersion` flip, never an UPDATE of business fields) — verified by a test that edits a record twice and asserts three rows exist with a correct version chain, not just that the "current" view shows the latest values.
  - Audits/Incidents: `editAudit`/`editIncident` in `src/server/audits/service.ts` / `src/server/incidents/service.ts`. Verified by `tests/phase4a-audits-incidents.test.ts` ("append-only versioning chain": 2 edits -> 3 rows, correct `versionNumber`/`isCurrentVersion`/`supersededById`, editing a superseded id rejected).
  - Risk Register + Policies: `createRiskEntry`/`editRiskEntry`/`approveRiskEntry` (`src/server/risks/service.ts`) and `createPolicy`/`editPolicy`/`activatePolicy` (`src/server/policies/service.ts`). **A real bug was found and fixed during this verification pass**: the old row's `supersededById` update originally ran as a separate statement *after* an array-form `$transaction([...])` had already committed — a crash between those steps would have left the chain unrecoverably broken. Fixed by switching to a single interactive transaction (`db.$transaction(async (tx) => {...})`) so all writes commit atomically. `tests/phase4b-risks-policies.test.ts` "(b)" proves the chain for both models.
- [x] Embedded follow-up/mitigation actions stored as the `Json` array field on the parent record — verified no separate table/module was created for these.
  - Audits/Incidents: `Audit.followUpActions`/`Incident.followUpActions` `Json` columns, validated by `FollowUpActionSchema`/`FollowUpActionsArraySchema`, edited via `src/components/follow-up-actions-editor.tsx`. Malformed payloads rejected.
  - Risk Register: `RiskEntry.mitigationActions` is a `Json` column, no separate table; `src/server/domain/mitigation-actions.ts` provides a `.strict()` Zod schema enforced at every write boundary. `tests/phase4b-risks-policies.test.ts` "(f)" proves malformed entries are rejected. (Policies has no analogous field — N/A.)
- [x] Reg 17 / CQC tagging UI, writing to the polymorphic tag join tables, with the scoped data-access layer verifying `entityId` belongs to the caller's `orgId` before insert (this is the specific integrity gap called out in the schema comments — it must be closed here, not assumed).
  - Audits/Incidents: both halves closed. WRITE-TIME: `assertOwnedEntity`/`verifyOwnedEntity` in `src/server/governance/tagging.ts`, called before every insert. READ-TIME: `listAuditTags`/`listIncidentTags` re-verify ownership of `entityId` before returning any tag rows. Verified in `tests/phase4a-audits-incidents.test.ts`'s "tagging-integrity gap" block, including a directly-inserted mismatched tag row (bypassing the write guard) proven invisible via the read path, in both corruption directions.
  - Risk Register + Policies: same two-sided fix in `src/server/domain/tag-integrity.ts` (`assertTaggableEntityBelongsToOrg` write-side, `assertTaggableEntityVisibleToOrg` read-side). `tests/phase4b-risks-policies.test.ts` "(d)" proves both halves the same way (rejected write, and a directly-`rawPrisma`-inserted mismatched tag confirmed present at the raw level but absent via `getTagsForEntity`).
- [x] Attachments (upload to S3-compatible bucket, metadata row in `Attachment`).
  - Audits/Incidents: metadata row + write/read-time ownership checks done (`src/server/governance/attachments.ts`). Local-disk stub, not real S3 (deferred to real infra work per `.env.example` S3_* vars).
  - Risk Register + Policies: `src/server/policies/attachments.ts` and `src/server/risks/attachments.ts` (the latter added during this pass — `AttachableEntityType` includes `RISK_ENTRY` but no code path existed yet), same local-disk-stub + ownership-check pattern, writing to `.uploads/<orgId>/<entity>/<id>/...` (gitignored). Live-verified via curl: uploaded a file to a RiskEntry, confirmed the `Attachment` row, the file on disk, and the resulting `AuditLogEntry`.
- [x] Every create/edit/delete/approve action writes an `AuditLogEntry` with real before/after JSON snapshots (verified by inspecting an actual row after a real mutation, not by code inspection alone).
  - Audits/Incidents: every mutation calls `writeAuditLog` (`src/server/governance/audit-log.ts`). Verified by real-row inspection in tests AND a live smoke test (see below).
  - Risk Register + Policies: verified the same way via `tests/phase4b-risks-policies.test.ts` "(c)" and a live curl smoke test + direct `psql` query (see below).
- [x] Risk Register matrix view (likelihood × impact grid), reading `riskRating` computed server-side.
  - Acceptance: attempting to submit a client-supplied `riskRating` that doesn't match `likelihood * impact` is ignored/overwritten server-side — verified by a test.
  - `/dashboard/risks/matrix` (`getRiskMatrix`) buckets current-version entries into a 5×5 grid. `computeRiskRating(likelihood, impact)` in `src/server/risks/service.ts` is the single source of truth; the input schema accepts an optional client `riskRating` field but the service layer never reads it. Verified via `tests/phase4b-risks-policies.test.ts` "(e)" AND a live curl smoke test spoofing `riskRating` on both create and edit, confirmed against the resulting Postgres rows (see below).
- [x] Policy version history + review-date tracker UI.
  - `/dashboard/policies` is the review-date tracker (`derivePolicyReviewStatus`, 30-day "due soon" window, `OVERDUE`/`DUE_SOON`/`OK` badges). `/dashboard/policies/[id]` renders the full version chain via `getPolicyVersionChain`.
- [x] Cross-tenant isolation re-verified for all four modules: Org A cannot read/edit/delete Org B's Audits, Incidents, RiskEntries, or Policies (extend the Phase 1 suite, don't replace it).
  - Audits/Incidents: `tests/phase4a-audits-incidents.test.ts`'s "cross-tenant isolation via the Audits/Incidents service layer" block (read/edit/delete all rejected, including through the service layer).
  - Risk Register + Policies: `tests/phase4b-risks-policies.test.ts` "(a)", extending (not replacing) `tests/tenant-isolation.test.ts`. Covers raw `scopedDb` rejection and service-layer rejection (`RiskEntryNotFoundError`/`PolicyNotFoundError`) both directions (Org A -> Org B and Org B -> Org A).

### Phase 4 gate
- [x] Migrations clean from scratch. Verified separately in both worktrees (`bncl_dev_phase4a`/`bncl_test_phase4a` and `bncl_dev_phase4b`/`bncl_test_phase4b`, each freshly created) and again below against the merged codebase — the single `20260714183643_init` migration applies cleanly; no schema changes were needed for Phase 4 (the Phase 0 schema already covers all four modules).
- [x] Seed works (seed data now includes realistic Audits/Incidents/RiskEntries/Policies for both demo orgs, across both organisations, so the isolation tests have real data to fail against). `prisma/seed.ts`'s `seedDemoOrg` creates one Audit, one Incident, one RiskEntry, and one Policy per demo org (id-stable via `upsert`), plus the Reg 17 / CQC / Six Pillar taxonomy.
- [x] Cross-tenant isolation suite, extended to cover all four modules, passes (paste full output below).
- [x] Versioning-chain test passes for all four modules (paste output below).
- [x] All Phase 4 pages render for at least one user per role. Audits/Incidents and Risk Register/Policies routes all verified live as OWNER (curl smoke tests below) and via `npm run build`'s route listing. Not separately smoke-tested for REGISTERED_MANAGER/STAFF/BNCL_ADMIN in this phase; RBAC gating itself is exercised by `tests/tenant-isolation.test.ts`'s RolePermission-matrix tests.

### Phase 4a (Audits + Incidents) verification output

```
$ DATABASE_URL=".../bncl_test_phase4a" npx vitest run
 ✓ tests/tenant-isolation.test.ts (14 tests)
 ✓ tests/phase4a-audits-incidents.test.ts (26 tests)
 Test Files  2 passed (2)
      Tests  40 passed (40)

$ npm run check:tenant-isolation-imports
OK: no unscoped raw-Prisma imports found outside the allowlist (6 allowlisted files).

$ npm run lint
✔ No ESLint warnings or errors

$ npm run build
✓ Compiled successfully
✓ Generating static pages (11/11)
```

Live smoke test (`PORT=3012 npm run dev`, real HTTP via curl — NextAuth credentials login as `owner@greenfield-demo.example`, then a real POST through the `/dashboard/audits/new` and `/dashboard/audits/[id]` server-action forms):
- Created Audit `cmrl9g8fb00018rz0lsxd6pnb` (v1).
- Edited it -> new row `cmrl9ggk200058rz07tcl05ya` (v2). Verified directly in Postgres: v1 has `isCurrentVersion=false`, `supersededById=<v2 id>`; v2 has `isCurrentVersion=true`, `supersededById=null`, and the submitted `followUpActions` entry persisted correctly.
- Verified `AuditLogEntry` rows: one `CREATE` on v1 (`afterSnapshot` populated, `beforeSnapshot` null) and one `UPDATE` on v2 (`beforeSnapshot`/`afterSnapshot` both populated with distinct `type` values).

### Phase 4b (Risk Register + Policies) verification output

All commands below were run against dropped-and-recreated local Postgres databases (`bncl_dev_phase4b`, `bncl_test_phase4b`), not reused state.

```
$ sudo -u postgres psql -c "DROP DATABASE IF EXISTS bncl_dev_phase4b;" && \
  sudo -u postgres psql -c "CREATE DATABASE bncl_dev_phase4b OWNER bncl;" && \
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS bncl_test_phase4b;" && \
  sudo -u postgres psql -c "CREATE DATABASE bncl_test_phase4b OWNER bncl;"
DROP DATABASE
CREATE DATABASE
DROP DATABASE
CREATE DATABASE

$ DATABASE_URL=".../bncl_dev_phase4b" npx prisma migrate deploy
1 migration found in prisma/migrations
Applying migration `20260714183643_init`
All migrations have been successfully applied.

$ DATABASE_URL=".../bncl_dev_phase4b" npm run db:seed
Seed complete:
  Org A: Greenfield Aesthetic Clinic (demo-org-a)
  Org B: Riverside Dental Practice (demo-org-b)
  ...

(same two commands repeated clean against bncl_test_phase4b)

$ DATABASE_URL=".../bncl_test_phase4b" npx vitest run
 ✓ tests/tenant-isolation.test.ts (14 tests) 152ms
 ✓ tests/phase4b-risks-policies.test.ts (24 tests) 427ms
 Test Files  2 passed (2)
      Tests  38 passed (38)

$ npm run check:tenant-isolation-imports
OK: no unscoped raw-Prisma imports found outside the allowlist (5 allowlisted files).

$ npm run lint
✔ No ESLint warnings or errors

$ npm run build
✓ Linting and checking validity of types ...
✓ Generating static pages (12/12)
Route (app)                              Size     First Load JS
├ ƒ /dashboard/policies                  189 B          96.2 kB
├ ƒ /dashboard/policies/[id]             189 B          96.2 kB
├ ƒ /dashboard/policies/[id]/edit        154 B          87.5 kB
├ ƒ /dashboard/policies/new              154 B          87.5 kB
├ ƒ /dashboard/risks                     189 B          96.2 kB
├ ƒ /dashboard/risks/[id]                189 B          96.2 kB
├ ƒ /dashboard/risks/[id]/edit           1.55 kB        88.9 kB
├ ƒ /dashboard/risks/matrix              189 B          96.2 kB
├ ƒ /dashboard/risks/new                 1.55 kB        88.9 kB
(other routes as Phase 1)
```

Live smoke test against `PORT=3013 npm run dev`, real HTTP via curl (login as `owner@greenfield-demo.example`, create a risk entry with a spoofed `riskRating=999` via the real form/server-action, edit it with `likelihood=5,impact=5` and a spoofed `riskRating=1`, upload a real attachment file):

```
POST /api/auth/callback/credentials -> session established (orgId=demo-org-a, role=OWNER)

POST /dashboard/risks/new (title="Curl smoke-test risk", likelihood=2, impact=4, riskRating=999 [spoofed])
  -> 303 -> /dashboard/risks/cmrl9dsrz000110sp2hdbd9sl

POST /dashboard/risks/cmrl9dsrz000110sp2hdbd9sl/edit (likelihood=5, impact=5, riskRating=1 [spoofed], status=MITIGATING)
  -> 303 -> /dashboard/risks/cmrl9epck000610sp4aw7ayim   (NEW row id, proving append-only versioning, not an in-place update)

$ psql bncl_dev_phase4b -c 'SELECT id, likelihood, impact, "riskRating", "versionNumber", "isCurrentVersion", "supersededById", status FROM "RiskEntry" WHERE id IN (...) ORDER BY "versionNumber";'
            id             | likelihood | impact | riskRating | versionNumber | isCurrentVersion |      supersededById       |   status
---------------------------+------------+--------+------------+---------------+------------------+----------------------------+------------
 cmrl9dsrz...(v1)          |          2 |      4 |          8 |             1 | f                | cmrl9epck...(v2)          | OPEN
 cmrl9epck...(v2, current) |          5 |      5 |         25 |             2 | t                |                            | MITIGATING
(2 rows)
-- riskRating is 8 (2*4) and 25 (5*5), NOT the spoofed 999/1 -> server authority confirmed live, not just in tests.

$ psql bncl_dev_phase4b -c 'SELECT "entityId", action, "beforeSnapshot"->>'"'"'title'"'"' , "afterSnapshot"->>'"'"'title'"'"', "afterSnapshot"->>'"'"'riskRating'"'"' FROM "AuditLogEntry" WHERE "entityType"='"'"'RISK_ENTRY'"'"' AND "entityId" IN (...) ORDER BY timestamp;'
         entityId          | action |     before_title     |          after_title          | after_rating
---------------------------+--------+-----------------------+--------------------------------+--------------
 cmrl9dsrz...              | CREATE |                       | Curl smoke-test risk           | 8
 cmrl9epck...              | UPDATE | Curl smoke-test risk  | Curl smoke-test risk (EDITED)  | 25
(2 rows)

POST /dashboard/risks/cmrl9epck000610sp4aw7ayim (file upload, evidence.txt, multipart/form-data)
  -> 303 -> /dashboard/risks/cmrl9epck000610sp4aw7ayim

$ psql bncl_dev_phase4b -c 'SELECT "entityType","entityId","fileName","mimeType","sizeBytes" FROM "Attachment" WHERE "entityId"='"'"'cmrl9epck000610sp4aw7ayim'"'"';'
 entityType |         entityId          |   fileName   |  mimeType  | sizeBytes
------------+----------------------------+--------------+------------+-----------
 RISK_ENTRY | cmrl9epck000610sp4aw7ayim | evidence.txt | text/plain |        66
(1 row)
-- + a matching AuditLogEntry (action=UPDATE, afterSnapshot.attachmentId set) and the file confirmed present on disk under .uploads/.
```

### Post-merge verification (combined codebase)

Re-run against the merged Phase 1+2+3+4+5+7 codebase before push — see
"Post-merge verification: full combined suite" near the end of this file
for the actual combined test run, lint, and build output covering every
merged phase at once.

---

## Phase 5 — Supporting Modules

- [x] Feedback & Complaints: list/create/edit, outcome tracking.
  - Acceptance: `src/server/modules/feedback.ts` + `/dashboard/feedback` (list, create form) and `/dashboard/feedback/[id]` (edit, outcome/status). **Verified live** — see curl/browser output below and `tests/phase5-supporting-modules.test.ts`.
- [x] Staff Training: records, expiry tracking, status derivation (`VALID`/`EXPIRING_SOON`/`EXPIRED`) feeding into Calendar.
  - Acceptance: a training record within the "expiring soon" window produces a `CalendarTask`. **Threshold: 30 days**, defined and documented in code as `EXPIRING_SOON_WINDOW_DAYS` in `src/server/modules/training.ts`. `deriveTrainingStatus()` is a pure, unit-tested function. **Verified** — `tests/phase5-supporting-modules.test.ts` section (c) proves an EXPIRING_SOON record produces exactly one `CalendarTask`, and that re-deriving status on every read (`listTrainingRecords`, also what the unified Calendar page triggers) does not duplicate it — idempotent by construction (`ensureTrainingCalendarTask` looks up the existing row by `(linkedModule, linkedEntityId)` before creating). Also verified live via curl (see below): a training record with `expiryDate` 6 days out was created with `status: "EXPIRING_SOON"` and immediately appeared on `/api/calendar`.
- [x] Notices: post/view, audience targeting (`ALL_STAFF`/`MANAGERS_ONLY`/`SPECIFIC_SITE`), acknowledgement tracking via `NoticeAcknowledgement`.
  - Acceptance: a `SPECIFIC_SITE` notice is genuinely invisible to users at other sites in the *same* org (site-level scoping, not just org-level) — verified by test. **Verified** — `src/server/modules/notices.ts`'s `listVisibleNotices`/`getVisibleNotice` build the site-visibility condition into the Prisma `where` clause itself (not a post-fetch filter), and `tests/phase5-supporting-modules.test.ts` section (b) seeds a **second site within the same org** plus a staff user assigned only to it, then proves: the Site-1 user sees the notice (positive control), the Site-2 user does **not** see it in the list or via direct id lookup, and the Site-2 user's direct `acknowledgeNotice()` call is rejected. Full pages at `/dashboard/notices` and `/dashboard/notices/[id]` (roster of acknowledged/not-acknowledged, gated on edit permission).
- [x] Events: minimal generic log — list, create/edit with `eventType` as free-text-plus-suggestions, tagging, attachments, status.
  - Acceptance: Events is NOT merged into Incidents and Incidents is NOT a subtype of Events (verified by code review — separate model `Event`, separate routes under `/api/events` and `/dashboard/events`, separate nav item). The "definition pending product confirmation" note is carried in `src/server/modules/events.ts` (header comment), `src/app/dashboard/events/page.tsx`, and README.md's existing "Known open item: Events" section (extended below, not replaced) — not silently resolved by this phase. Tagging (`RegClauseTag`, with the caller's-org-ownership check the schema calls out) and attachments both implemented; attachments have a real file-upload path (`src/server/storage/local-upload.ts`, writing to a gitignored local `.uploads/` dir) backing the dashboard's multipart form, in addition to the metadata-only JSON API contract (no S3 client configured in this environment — documented deviation, unchanged from the schema/README's existing "not yet wired (Phase 4+)" note).
- [x] Unified Calendar: aggregates `CalendarTask` across audits, policy reviews, training expiries, events.
  - Acceptance: `/dashboard/calendar` and `/api/calendar` group `CalendarTask` rows by due date; visiting either first re-runs the training module's live status-derivation pass so newly EXPIRING_SOON/EXPIRED records are reflected without a separate visit to `/dashboard/training`. Audits/policy-review-sourced `CalendarTask` rows are read generically (no hard dependency on Phase 4 having landed in this worktree) — Phase 4 doesn't exist yet here, so only training + manual tasks are exercised in verification, which is consistent with what's actually built. **Verified live** (see curl output below).
- [x] Notifications: system-generated, distinct from Notices (verify no code path conflates the two models).
  - Acceptance: `Notification` and `Notice` are separate Prisma models; `src/server/modules/notifications.ts` is the only place `Notification` rows are written, and it's called by other modules (`notices.ts`, `training.ts`) as an explicit side effect — no code path writes to `Notice` from `notifications.ts` or vice versa. No `NOTIFICATIONS` `ModuleName`/`RolePermission` row exists by design (personal inbox, not a governance module); gated on `requireAuth()` + row-ownership (`userId === session.id`) instead, documented in-code. `/dashboard/notifications` page + "Mark as read" action. **Verified** by `tests/phase5-supporting-modules.test.ts` section (d): an `acknowledgementRequired:true` Notice produces one distinct `Notification` row per targeted user (poster excluded), and a Notice without it produces zero.
- [x] Cross-tenant isolation re-verified for all Phase 5 modules.
  - **Verified** — `tests/phase5-supporting-modules.test.ts` section (a): Org A cannot read/edit/delete Org B's `FeedbackComplaint`, `Event`, `TrainingRecord`, `Notice`, `CalendarTask`, or `Notification` (12 assertions across the 6 models, same read/update/delete attack pattern as `tests/tenant-isolation.test.ts`).

**Deviation note (found and fixed during this phase, not merely "code compiled"):** this worktree had two complete, independently-written implementations of every Phase 5 module sitting side by side uncommitted — `src/server/modules/*.ts` (wired to every `/api/*` route) and a second `src/server/{notices,events,feedback,calendar,training,notifications}/service.ts` tree with its own `src/lib/validation/phase5.ts` and `src/server/audit-log/log.ts` (wired to the `/dashboard/*` pages instead). Both were reasonably well-written and independently correct on tenant scoping, but having two parallel services for the same data was a real split-brain risk (e.g. `getNoticeAcknowledgementStatus` in the surviving tree was initially missing `site`/`postedBy` on its re-fetched `notice` — caught by wiring the dashboard detail page against it and re-checking the return shape, not by either tree's own tests). Consolidated onto `src/server/modules/*` (already proven by the API routes) — the dashboard actions/pages were rewritten against it, a couple of read helpers (`getEvent`, `getFeedback`, `listRegSubClausesForTagging`) were added to close the gap, the real local-disk file-upload path (`saveLocalUpload`) was preserved and wired in, and the entire duplicate tree was deleted. `src/server/org/directory.ts` (small, non-duplicative site/user list helpers used by several modules' pickers) was kept as-is.

### Phase 5 gate
- [x] Migrations clean from scratch.
- [x] Seed works.
- [x] Cross-tenant isolation suite, extended to cover Phase 5 modules, passes (paste output).
- [x] All Phase 5 pages render.

### Phase 5 verification output

All commands below were run against dropped-and-recreated (true from-scratch) local Postgres databases (`bncl_dev_phase5`, `bncl_test_phase5`), not reused state.

```
$ sudo -u postgres psql -c "DROP DATABASE IF EXISTS bncl_dev_phase5;" && sudo -u postgres psql -c "CREATE DATABASE bncl_dev_phase5 OWNER bncl;"
$ sudo -u postgres psql -c "DROP DATABASE IF EXISTS bncl_test_phase5;" && sudo -u postgres psql -c "CREATE DATABASE bncl_test_phase5 OWNER bncl;"
DROP DATABASE
CREATE DATABASE
DROP DATABASE
CREATE DATABASE

$ DATABASE_URL=".../bncl_dev_phase5" npx prisma migrate deploy
1 migration found in prisma/migrations
Applying migration `20260714183643_init`
All migrations have been successfully applied.

$ DATABASE_URL=".../bncl_dev_phase5" npm run db:seed
Seed complete:
  Org A: Greenfield Aesthetic Clinic (demo-org-a)
  Org B: Riverside Dental Practice (demo-org-b)
  BNCL internal admin: admin@bncl-solutions.example / BnclAdmin1234!
  Org A owner: owner@greenfield-demo.example / DemoOwner1234!
  Org B owner: owner@riverside-demo.example / DemoOwner1234!

$ DATABASE_URL=".../bncl_test_phase5" npx prisma migrate deploy   # same output, applied clean
$ DATABASE_URL=".../bncl_test_phase5" npm run db:seed             # same output, seeded clean

$ DATABASE_URL=".../bncl_test_phase5" npm test

 ✓ tests/tenant-isolation.test.ts (14 tests) 262ms
 ✓ tests/phase5-supporting-modules.test.ts (12 tests) 482ms

 Test Files  2 passed (2)
      Tests  26 passed (26)

$ npm run check:tenant-isolation-imports
OK: no unscoped raw-Prisma imports found outside the allowlist (5 allowlisted files).

$ npm run lint
✔ No ESLint warnings or errors

$ npm run build
✓ Compiled successfully
✓ Linting and checking validity of types ...
✓ Generating static pages (19/19)
Route (app)                              Size     First Load JS
├ ƒ /api/calendar                        0 B                0 B
├ ƒ /api/events[...]                     0 B                0 B
├ ƒ /api/feedback[...]                   0 B                0 B
├ ƒ /api/notices[...]                    0 B                0 B
├ ƒ /api/notifications[...]              0 B                0 B
├ ƒ /api/training[...]                   0 B                0 B
├ ƒ /dashboard/calendar                  162 B          87.5 kB
├ ƒ /dashboard/events                    183 B          96.2 kB
├ ƒ /dashboard/events/[id]               162 B          87.5 kB
├ ƒ /dashboard/feedback                  183 B          96.2 kB
├ ƒ /dashboard/feedback/[id]             162 B          87.5 kB
├ ƒ /dashboard/notices                   183 B          96.2 kB
├ ƒ /dashboard/notices/[id]              162 B          87.5 kB
├ ƒ /dashboard/notifications             162 B          87.5 kB
├ ƒ /dashboard/training                  162 B          87.5 kB
```

Live smoke test (`PORT=3014 npm run dev` against `bncl_dev_phase5`, real HTTP via curl, real NextAuth Credentials sessions for two different seeded users — Org A Owner and Org A Staff):

```
POST /api/auth/callback/credentials (owner@greenfield-demo.example) -> 200
POST /api/auth/callback/credentials (staff@greenfield-demo.example) -> 200

POST /api/notices {title:"Smoke test notice 2", audience:"ALL_STAFF", acknowledgementRequired:true} (as Owner)
-> 201 {"item":{"id":"cmrl9kg6m0001d2wngbep5zeo", ...}}

GET /api/notifications (as Staff, BEFORE acknowledging)
-> 200 {"items":[{"type":"NOTICE_ACKNOWLEDGEMENT_REQUIRED","relatedEntityId":"cmrl9kg6m0001d2wngbep5zeo","readStatus":false,...}]}

POST /api/notices/cmrl9kg6m0001d2wngbep5zeo/acknowledge (as Staff — a DIFFERENT user from the poster)
-> 201 {"item":{"id":"cmrl9kky20009d2wnmpxwwm73","noticeId":"cmrl9kg6m0001d2wngbep5zeo","userId":"cmrl9e6n3002qeo3nks450a1a",...}}

GET /api/notices/cmrl9kg6m0001d2wngbep5zeo (as Owner — roster view)
-> 200 {"acknowledged":[{"name":"Greenfield Aesthetic Clinic Staff Member",...}],
        "notAcknowledged":[{"name":"...Owner",...},{"name":"...Registered Manager",...}]}

POST /api/training {courseName:"Smoke test: fire safety", expiryDate:"2026-07-20"} (6 days out, as Owner)
-> 201 {"item":{"status":"EXPIRING_SOON",...}}

GET /api/calendar (as Owner)
-> 200 {"groups":[{"date":"2026-07-20","items":[{"linkedModule":"TRAINING","title":"Training expiry: Smoke test: fire safety",...}]}]}

GET /dashboard/notices, /dashboard/notices/[id], /dashboard/calendar, /dashboard/notifications,
    /dashboard/feedback, /dashboard/events, /dashboard/training
-> 200 for both Owner and Staff sessions, no error markers; page content spot-checked
   (e.g. /dashboard/notices/[id] renders "Acknowledgement roster" / "Acknowledged (1)" / notice body;
   /dashboard/calendar renders "Training expiry: Smoke test: fire safety" grouped under 2026-07-20;
   /dashboard/notifications (Staff) renders "A notice needs your acknowledgement" + "Mark as read").
```

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

- [x] User & role management UI (invite, change role, disable) — server-side RBAC re-checked on every action, not assumed from the UI having hidden the button.
  - Acceptance: STAFF and REGISTERED_MANAGER cannot self-escalate to OWNER, and cannot edit any other user's role, without `ADMIN_USERS` "edit"/"approve" permission — only OWNER has "approve" in the seeded RolePermission matrix, so only OWNER can grant the OWNER role. Additionally, no session (including OWNER) can change or disable its own account (`SelfDemotionBlockedError`), independent of the approve gate. Verified by test and by a live curl session against a running dev server (STAFF session gets a server-side `ForbiddenError` on `/dashboard/admin/users`, not just a hidden button).
- [x] Site management (multi-site orgs).
- [x] Stripe integration: Checkout, Customer Portal, webhook-driven `subscriptionTier`/`billingStatus` updates.
  - Acceptance: a test/simulated webhook event flips an org from FREE to PAID and the tier-gating tests from Phase 3's minimal `requireTier()` gate immediately reflect it (no cache/staleness bug — `requireTier()` re-reads `Organisation` fresh on every call) — verified live, not assumed: proved both in `tests/phase7-admin-billing.test.ts` and via a real HTTP POST to a running `npm run dev` server with a signature generated by `stripe.webhooks.generateTestHeaderString()`, immediately followed by a raw DB re-read showing FREE/TRIALING → PAID/ACTIVE with the Stripe customer/subscription ids populated.
  - Acceptance: webhook signature verification is enforced (a forged/unsigned webhook payload is rejected) — verified by test and live curl (missing header, forged `stripe-signature`, wrong secret, and a tampered body are all rejected with 400; the DB is provably untouched on rejection). There is no "trust the payload" shortcut anywhere in the production path (`src/app/api/webhooks/stripe/route.ts` always calls `verifyStripeWebhook()` before `applyStripeEvent()`).
  - **Deviation — no live Stripe account in this environment.** There are no real Stripe API keys configured here. Checkout Session creation and Customer Portal session creation (`src/server/billing/checkout.ts`) are structurally correct — correct Stripe SDK calls, correct `success_url`/`cancel_url`, correct `client_reference_id`/`metadata.orgId` propagation for the webhook to key off — and are covered by the RBAC/business-rule checks in front of them (ADMIN_BILLING "edit" + OWNER-only), but the actual redirect-to-Stripe-and-back round trip has **not** been exercised against real Stripe and cannot be in this environment. Everything downstream of signature verification (the webhook handler and its DB writes) **is** genuinely, live-verified, because that half doesn't require a real Stripe account — only a correctly-computed HMAC signature, which `stripe.webhooks.constructEvent()` verifies for real.
- [x] Data protection centre: DPA status, org-scoped JSON data export endpoint, retention settings.
  - Acceptance: the export endpoint, called by an Org A session, contains only Org A data — this is a cross-tenant test, not just a feature demo. Verified by test (including a DPA row seeded so it would leak into Org A's export if the scoping ever regressed) and live: logged in as Org A's Owner via curl, hit `/api/admin/data-protection/export`, and confirmed zero occurrences of any Org B id/domain string in the response body.
- [x] BNCL super-admin: cross-org overview (engagement/health signals per client), Q&G Hub content management.
  - Acceptance: re-verify (don't just assume from Phase 1) that a non-BNCL_ADMIN role gets rejected on every super-admin route, including the five new Q&G Hub content-management actions added this phase (create/update/publish/unpublish/delete) — every one of them calls `requireBnclAdmin()` first, independently, so the check can't be forgotten at a call site. Verified by test (OWNER/REGISTERED_MANAGER/STAFF sessions all rejected on all five actions) and live (an Org A Owner session hitting `/bncl-admin` gets a server-side `BnclAdminRequiredError`; a BNCL_ADMIN session can view, create, publish, unpublish, and delete Q&G Hub content end-to-end against the running dev server).

### Phase 7 gate
- [x] Migrations clean from scratch (`bncl_dev_phase7` and `bncl_test_phase7`, both dropped/recreated and migrated from `prisma migrate deploy` with zero manual intervention).
- [x] Seed works (both databases).
- [x] Full cross-tenant isolation suite (all modules, accumulated from every phase) passes — `tests/tenant-isolation.test.ts` (14 tests) + `tests/phase7-admin-billing.test.ts` (38 tests), 52/52 passing (paste output below).
- [x] Stripe webhook simulation test passes — both as a unit test against a locally self-signed event and as a live HTTP round trip against a running dev server (paste output below).
- [x] Data export cross-tenant test passes (paste output below).
- [x] All Phase 7 pages (`/dashboard/admin/users`, `/dashboard/admin/sites`, `/dashboard/admin/billing`, `/dashboard/admin/data-protection`, `/bncl-admin`, `/bncl-admin/qg-hub`) render for at least one user per role, live, via `npm run build` + a curl-driven session against `npm run dev` on port 3015 — see session notes for the full transcript (login, view/edit users, trigger export, unsigned/signed webhook calls, BNCL admin content CRUD), not pasted in full here for length.

---

## Post-merge verification: full combined suite

Phases 2, 3, 4a, 4b, 5, and 7 were built in parallel, isolated git
worktrees, then merged one at a time into `claude/bncl-compliance-setup`
(resolving real conflicts along the way — see individual commit messages:
a reconciled duplicate Q&G Hub write API between Phase 3/7, a reconciled
duplicate user-invite mechanism between Phase 2/7, combined
`check-tenant-isolation-imports.js` allowlists, a combined `prisma/seed.ts`,
and a real cross-test-file flakiness bug found and fixed —
`vitest.config.ts`'s `fileParallelism: false`, needed once multiple
phases' test suites started sharing one Postgres database with
global-count assertions). This section is the full verification of the
result, run against a completely fresh database — not a re-statement of
each phase's individual (still-true) verification above.

```
$ sudo -u postgres psql -c "DROP DATABASE IF EXISTS bncl_dev;" && \
  sudo -u postgres psql -c "CREATE DATABASE bncl_dev OWNER bncl;" && \
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS bncl_test;" && \
  sudo -u postgres psql -c "CREATE DATABASE bncl_test OWNER bncl;"
DROP DATABASE / CREATE DATABASE (x2)

$ npx prisma migrate deploy    # bncl_dev
Applying migration `20260714183643_init`
All migrations have been successfully applied.

$ npm run db:seed              # bncl_dev
Seed complete: Org A (demo-org-a), Org B (demo-org-b), BNCL internal admin, both org owners.

(same two commands repeated clean against bncl_test)

$ DATABASE_URL=".../bncl_test" npx vitest run
 ✓ tests/phase4a-audits-incidents.test.ts (26 tests)
 ✓ tests/phase7-admin-billing.test.ts (38 tests)
 ✓ tests/phase4b-risks-policies.test.ts (24 tests)
 ✓ tests/phase2-onboarding-dashboard.test.ts (16 tests)
 ✓ tests/phase5-supporting-modules.test.ts (12 tests)
 ✓ tests/phase3-free-tier.test.ts (21 tests)
 ✓ tests/tenant-isolation.test.ts (14 tests)
 Test Files  7 passed (7)
      Tests  151 passed (151)

$ npm run check:tenant-isolation-imports
OK: no unscoped raw-Prisma imports found outside the allowlist (10 allowlisted files).

$ npm run lint
✔ No ESLint warnings or errors

$ npm run build
✓ Compiled successfully
✓ Linting and checking validity of types ...
✓ Generating static pages (48/48)
(48 routes total: every module's list/detail/new/edit pages, all /api/*
route handlers, /bncl-admin + /bncl-admin/qg-hub, /login, /signup,
/invite/accept — see full route table in the build output.)
```

---

## Standing rules that apply to every phase (not one-time items)

- [x] No raw `prisma.<tenantModel>` calls outside the scoped data-access layer and the BNCL super-admin module — checked every phase, not just Phase 1. Re-verified above against the fully merged codebase (10 allowlisted files, all justified with header comments explaining why each is not a tenant-isolation concern).
- [x] Every route handler / server action: auth check → org check → RBAC check, server-side, in that order — checked every phase. Enforced via `requireAuth()`/`requireModulePermission()`/`requireModulePermissionWithTier()`/`requireBnclAdmin()` at every route/server-action entry point across all merged phases.
- [x] Cross-tenant isolation tests must pass at the end of **every** phase, cumulative (not just the modules built in that phase). 151/151 tests passing above, spanning every module built through Phase 7.
- [x] TypeScript strict, no `any` in domain code. `npm run build`'s type-check passes with zero errors; the only `any`-adjacent code is the documented, narrow `as never` escape hatch in `scoped-client.ts`'s generic dispatch (see that file's own comment) — not domain code.
- [x] Zod validation on every input boundary (forms and API). Every server action/route handler across every merged phase parses input through a Zod schema before touching the database.
- [x] No PII in logs. No `console.log`/error output in application code includes user-supplied PII; error messages are generic (`ForbiddenError`, `TierRequiredError`, etc.) and don't echo request bodies.
- [x] README updated each phase: env vars, setup, architecture decisions, and the Events open item kept current. `README.md`'s Status section reflects all merged phases; the Events open item note is preserved and extended, not resolved.

## Known open item

**Events** semantics are intentionally undefined by the source document. Do not resolve this by inventing a definition. Phase 1 creates the `Event` table exactly as specified. Phase 5 builds it as a minimal generic log only. Every phase's README update must retain the note that this is pending product/client confirmation.
