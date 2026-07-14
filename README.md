# BNCL Compliance Platform

Multi-tenant Governance & Compliance SaaS for UK independent healthcare
providers (aesthetic clinics, GP practices, dental practices, private
hospitals), built around CQC Regulation 17. Full concept and build spec:
`BNCL_Compliance_Platform_Master.md` (Sections 1–4).

## Status

**Phase 1 (Foundation) complete and verified.** **Phase 5 (Supporting
Modules) also complete and verified**, ahead of Phases 2–4 and 6–7 in this
worktree — see `BUILD_CHECKLIST.md` for the full phase-by-phase plan and
real verification output (migrations from scratch, seed, the combined
26-test tenant-isolation suite spanning Phase 1 + Phase 5 models, live RBAC
nav checks, an end-to-end magic-link login, and a live curl smoke test of
notice posting/acknowledgement and the unified calendar). Phases 2–4 and
6–7 are not yet built — the Phase 5 Calendar module reads whatever
`CalendarTask` rows exist without hard-depending on Phase 4 (Audits/Policy
reviews) having landed.

What exists: auth (Credentials + magic link), the scoped data-access layer,
RBAC permission checks, the BNCL super-admin module, base nav/layout, the
automated tenant-isolation test suite and import-discipline check, and the
six Phase 5 modules — Feedback & Complaints, Staff Training (with
expiry-derived status feeding the Calendar), Notices (with audience
targeting and acknowledgement tracking), Events (minimal generic log —
see "Known open item" below), a unified Calendar, and Notifications
(distinct from Notices).

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

**Phase 5 update:** the minimal generic log described above is now built —
`src/server/modules/events.ts`, `/api/events*`, `/dashboard/events*` — and
deliberately does not go beyond it: `eventType` is free text with UI
suggestions (`SUGGESTED_EVENT_TYPES`, not an enum), plus title, description,
date/time, status, Reg 17 tagging, and attachments (see the next paragraph).
This still does not resolve the open question above — it remains a generic
log, not a decision about which of (a)/(b) is correct, and `Incident`
(not built in this worktree — Phase 4) must still not be merged with it
when that phase lands.

Event attachments have a real file-upload path in this phase
(`src/server/storage/local-upload.ts`), writing to a local, gitignored
`.uploads/` directory, since no S3-compatible client is configured in this
environment and Events needed something real to exercise rather than a
metadata-only stub. The `/api/events/[id]/attachments` JSON route still
accepts pre-computed metadata directly (`s3Key`/`fileName`/etc.) for
programmatic callers; swapping `local-upload.ts` for a real S3 client later
is a drop-in change once Phase 4 configures one.

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
