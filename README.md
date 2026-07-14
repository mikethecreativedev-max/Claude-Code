# BNCL Compliance Platform

Multi-tenant Governance & Compliance SaaS for UK independent healthcare
providers (aesthetic clinics, GP practices, dental practices, private
hospitals), built around CQC Regulation 17. Full concept and build spec:
`BNCL_Compliance_Platform_Master.md` (Sections 1–4).

## Status

**Phase 0 (foundation planning) complete.** No application code exists yet —
this repo currently contains only:

- `BUILD_CHECKLIST.md` — the phase-by-phase build plan with acceptance
  criteria, derived from Section 4 of the master build document.
- `prisma/schema.prisma` — the full V1 data model.

Application code (Phase 1 onward) begins only after explicit sign-off on the
schema and checklist above, per the build process defined in this project's
governing instructions.

## Tech stack (planned, Phase 1+)

- Next.js 14+ (App Router), TypeScript strict mode
- PostgreSQL + Prisma ORM
- NextAuth (Auth.js) — email/password + magic link, JWT sessions with
  `orgId`/`role` claims
- Tailwind CSS + shadcn/ui
- S3-compatible object storage (UK region)
- Stripe (Checkout + Customer Portal, webhook-driven tier changes)
- Deployment: Vercel + managed Postgres (Neon/Supabase), UK/EU region

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

## Setup

Not yet applicable — no application scaffold exists. This section will be
filled in during Phase 1 (env vars, migration/seed commands, local dev
instructions).

## Validating the schema today

```bash
npm install
DATABASE_URL="postgresql://user:pass@localhost:5432/bncl?schema=public" npx prisma validate
```
