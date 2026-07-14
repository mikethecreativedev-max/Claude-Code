# BNCL Compliance Platform

Multi-tenant Governance & Compliance SaaS for UK independent healthcare
providers (aesthetic clinics, GP practices, dental practices, private
hospitals), built around CQC Regulation 17. Full concept and build spec:
`BNCL_Compliance_Platform_Master.md` (Sections 1–4).

## Status

**Phase 1 (Foundation) and Phase 2 (Onboarding and Dashboard) complete and
verified** — see `BUILD_CHECKLIST.md` for the full phase-by-phase plan and
real verification output (migrations from scratch, seed, the combined
30-test cross-tenant isolation + onboarding/dashboard suite, live RBAC nav
checks across three roles, and end-to-end curl smoke tests of sign-up,
setup wizard, invite/accept, and the dashboard). Phases 3–7 are not yet
built.

What exists: auth (Credentials + magic link), the scoped data-access layer,
sign-up (Organisation + Owner User + DataProcessingAgreement), the setup
wizard (org details, sites, registered activities), a role invite flow
(token-based accept), and a dashboard shell (live counts, a V1-placeholder
compliance score ring, a module-records donut chart, an AuditLogEntry-driven
activity feed, and a quick access panel) — on top of Phase 1's
RBAC permission checks, the BNCL super-admin module, base nav/layout, and
the automated tenant-isolation test suite and import-discipline check.

## Tech stack

- Next.js 14.2.x (App Router), TypeScript strict mode
- PostgreSQL + Prisma ORM
- NextAuth (Auth.js v4) — email/password (Credentials) + magic link (Email
  provider), JWT sessions with `orgId`/`role` claims
- Tailwind CSS (shadcn/ui not yet added — see BUILD_CHECKLIST.md Phase 1 notes)
- S3-compatible object storage (UK region) — not yet wired (Phase 4+)
- Stripe (Checkout + Customer Portal, webhook-driven tier changes) — not yet wired (Phase 7)
- Deployment: Vercel + managed Postgres (Neon/Supabase), UK/EU region — not yet configured

### Known tracked dependency advisories

`npm audit` flags two moderate-severity issues in transitive dependencies:
PostCSS (bundled inside Next.js's own tree) and `uuid` (bundled inside
`next-auth`). Both would require breaking major-version upgrades of Next.js
or next-auth to resolve, which would contradict this project's pinned stack
and risked destabilizing a freshly-verified foundation. Tracked for
resolution when either package ships a non-breaking fix.

## Architecture non-negotiables

See the header comments in `prisma/schema.prisma` for the full rationale.
Summary:

1. **Tenant isolation is enforced at the data layer, not the UI.** Every
   tenant-scoped table carries `orgId`. All reads/writes go through a single
   scoped data-access layer that injects `orgId` from the session. The only
   unscoped path is the BNCL super-admin module, isolated separately and
   gated on the `BNCL_ADMIN` role.
2. **Append-only for inspection-facing records.** Audits, Incidents, Risk
   entries, and Policies are versioned (`versionNumber` + `supersededById`),
   never overwritten. Every mutation also writes an immutable
   `AuditLogEntry` with before/after snapshots.
3. **Reg 17 / CQC / Six Pillar tagging is a shared taxonomy**, linked via
   join tables, never enum columns.
4. **RBAC per module**, checked server-side on every route handler and
   server action: auth check → org check → permission check, in that order.
5. **Tier gating is server-side**, driven by `Organisation.subscriptionTier`
   and Stripe webhooks.
6. **V2 (PatientRecord, Billing) is out of scope** and namespace-reserved
   only — no models, no migrations, no references from governance models.

## Known open item: "Events"

The **Events** module's semantics are intentionally undefined in the source
material — it is not yet confirmed whether it means (a) scheduled/logged
occurrences distinct from Incidents (inspection visits, safeguarding
referrals, significant events short of a full incident), or (b) a broader
catch-all that Incidents would sit inside. Until product/client confirmation
arrives, `Event` is built as a minimal generic log (Phase 5) and must not be
merged into or made a subtype of `Incident`, or vice versa.

## Compliance score (V1 placeholder)

The dashboard's compliance score ring shows a number computed by
`computeComplianceScore()` in `src/server/compliance/score.ts` — a pure
function, unit-tested in `tests/phase2-onboarding-dashboard.test.ts`.

- **Inputs**: plain non-negative counts per org — `totalAudits` /
  `overdueAudits`, `totalIncidents` / `openIncidents` (status `OPEN` or
  `INVESTIGATING`), `totalPolicies` / `policiesNeedingReview` (`reviewDate`
  in the past).
- **Formula**: a weighted blend of three health ratios, each clamped to
  `[0, 1]` and defaulting to `1` when the relevant module has zero rows
  (an org that hasn't started using a module isn't penalised for it):
  `score = round(100 * (0.40 * auditHealth + 0.35 * incidentHealth + 0.25 * policyHealth))`.
- **Output**: an integer in `[0, 100]`. Higher is better.

**This is explicitly a V1 placeholder**, not a validated regulatory scoring
methodology — it is not risk-weighted by incident severity, not aware of
CQC domain/Reg 17 breakdown, and not informed by inspection history. It
exists so the dashboard shows a real, data-driven number instead of a
hardcoded one, and is deliberately isolated as a single pure function with
one call site (`src/server/dashboard/data.ts`) so it is easy to find and
replace wholesale once a real methodology is defined.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in values. For local dev, at
   minimum set `DATABASE_URL` to a real Postgres instance and
   `NEXTAUTH_SECRET` to any random string. Magic-link email requires a real
   (or local test) SMTP server via the `EMAIL_SERVER_*` vars — without one,
   Credentials (email/password) login still works fine.
3. Run migrations against a fresh database:
   ```bash
   npm run db:migrate
   ```
4. Seed demo data (two orgs, one BNCL internal admin, full RBAC matrix, Reg
   17/CQC/Six Pillar taxonomy):
   ```bash
   npm run db:seed
   ```
   Seeded logins (see console output for the full list):
   - BNCL Admin: `admin@bncl-solutions.example` / `BnclAdmin1234!`
   - Org A (Greenfield) Owner: `owner@greenfield-demo.example` / `DemoOwner1234!`
   - Org B (Riverside) Owner: `owner@riverside-demo.example` / `DemoOwner1234!`
5. Start the dev server:
   ```bash
   npm run dev
   ```

### Running the tenant-isolation test suite

The suite runs against a real (separate, disposable) Postgres database —
point `DATABASE_URL` at a `_test` database, migrate and seed it the same
way, then:

```bash
npm test
```

### Other verification commands

```bash
npm run check:tenant-isolation-imports  # fails if any file imports the raw Prisma client outside the allowlist
npm run lint
npm run build
```
