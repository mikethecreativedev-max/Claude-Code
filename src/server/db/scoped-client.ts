import type { Prisma } from "@prisma/client";

import { rawPrisma } from "./prisma";

/**
 * The single scoped data-access layer. Every tenant-scoped read/write in
 * this codebase MUST go through `scopedDb(orgId)`. Nothing else may import
 * `rawPrisma` for these models — enforced by
 * scripts/check-tenant-isolation-imports.js (see BUILD_CHECKLIST.md Phase 1).
 *
 * How it works: a Prisma Client Extension intercepts every operation on
 * every model in TENANT_MODELS and injects `orgId` into the query — into
 * `where` for reads/updates/deletes, into `data` for creates — using the
 * orgId this function was called with, which callers derive from the
 * server session, never from client input.
 *
 * This is defense-in-depth, not the only layer: route handlers and server
 * actions must still do their own auth -> org -> RBAC checks before ever
 * calling this. See src/server/auth/session.ts and
 * src/server/rbac/permissions.ts.
 */

// Prisma model names (as they appear in schema.prisma) that carry orgId
// and must never be queried without a scope.
const TENANT_MODELS = new Set([
  "Site",
  "User",
  "Audit",
  "Incident",
  "Event",
  "RiskEntry",
  "Policy",
  "FeedbackComplaint",
  "Notice",
  "NoticeAcknowledgement",
  "ReadinessScore",
  "CalendarTask",
  "TrainingRecord",
  "AuditLogEntry",
  "Notification",
  "DataProcessingAgreement",
  "RegClauseTag",
  "CQCKeyQuestionTag",
  "SixPillarTag",
  "Attachment",
]);

// NoticeAcknowledgement doesn't carry orgId directly on its own row (it's
// scoped via its Notice relation) — excluded from automatic where/data
// injection but still routed through scopedDb() for consistency of import
// discipline. Same for UserSite.
const NO_DIRECT_ORG_ID = new Set(["NoticeAcknowledgement", "UserSite"]);

const WRITE_OPS_WITH_DATA = new Set(["create"]);
const WRITE_OPS_WITH_DATA_ARRAY = new Set(["createMany"]);
const OPS_WITH_WHERE = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

function injectWhereOrgId(args: Record<string, unknown>, orgId: string) {
  const where = (args.where as Record<string, unknown>) ?? {};
  return { ...args, where: { ...where, orgId } };
}

export function scopedDb(orgId: string) {
  if (!orgId || typeof orgId !== "string") {
    throw new Error("scopedDb() requires a non-empty orgId from the session");
  }

  return rawPrisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const typedArgs = (args ?? {}) as Record<string, unknown>;

          if (!model || !TENANT_MODELS.has(model)) {
            return query(typedArgs);
          }

          if (NO_DIRECT_ORG_ID.has(model)) {
            return query(typedArgs);
          }

          // Below this point, args are being reshaped generically across
          // every tenant model's create/update/where types, which Prisma's
          // extension typings can't express statically (query()'s inferred
          // parameter type is a narrow per-call-site union). The `as
          // never` casts are a deliberate, narrow escape hatch for this
          // one dynamic dispatch point — every other file in this codebase
          // must stay fully typed; this is the one place that trades
          // static typing for the runtime scoping guarantee the tests in
          // tests/tenant-isolation.test.ts verify.

          if (WRITE_OPS_WITH_DATA.has(operation)) {
            const data = (typedArgs.data as Record<string, unknown>) ?? {};
            return query({ ...typedArgs, data: { ...data, orgId } } as never);
          }

          if (WRITE_OPS_WITH_DATA_ARRAY.has(operation)) {
            const data = (typedArgs.data as Record<string, unknown>[]) ?? [];
            return query({
              ...typedArgs,
              data: data.map((row) => ({ ...row, orgId })),
            } as never);
          }

          if (operation === "upsert") {
            const create = (typedArgs.create as Record<string, unknown>) ?? {};
            const update = (typedArgs.update as Record<string, unknown>) ?? {};
            const where = (typedArgs.where as Record<string, unknown>) ?? {};
            return query({
              ...typedArgs,
              where: { ...where, orgId },
              create: { ...create, orgId },
              update,
            } as never);
          }

          if (OPS_WITH_WHERE.has(operation)) {
            return query(injectWhereOrgId(typedArgs, orgId) as never);
          }

          // Any operation not explicitly handled above (e.g. future Prisma
          // additions) is rejected rather than silently run unscoped.
          throw new Error(
            `scopedDb: operation "${operation}" on tenant model "${model}" is not ` +
              `handled by the tenant-scope extension. Add explicit handling in ` +
              `scoped-client.ts before using it — do not bypass this layer.`
          );
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scopedDb>;

/**
 * Narrow, session-scoped access to the calling org's OWN Organisation row.
 *
 * Organisation is deliberately NOT in TENANT_MODELS above: it has no
 * `orgId` column (its own `id` *is* the tenant id), so the generic
 * where/data-injection extension can't cover it — injecting `{ orgId }`
 * into a query against a model with no such column would either no-op or
 * throw, not scope anything. Rather than silently leaving Organisation
 * reads/writes unscoped, this function hardcodes `where: { id: orgId }` on
 * every call, so a caller can never target any Organisation row other than
 * its own, no matter what a caller passes in `data`. `orgId` must still
 * come from the verified session, exactly like scopedDb().
 */
export function scopedOrganisation(orgId: string) {
  if (!orgId || typeof orgId !== "string") {
    throw new Error("scopedOrganisation() requires a non-empty orgId from the session");
  }
  return {
    get: () => rawPrisma.organisation.findUnique({ where: { id: orgId } }),
    update: (data: Prisma.OrganisationUpdateInput) =>
      rawPrisma.organisation.update({ where: { id: orgId }, data }),
  };
}

/**
 * System-level (non-session) Organisation lookup by Stripe identifiers.
 * Used ONLY by the Stripe webhook handler (src/server/billing/webhook.ts).
 * A webhook request carries no user session — the caller's identity is the
 * verified Stripe signature, and the target org is whichever one Stripe
 * says the event belongs to. This is intentionally the only place besides
 * bncl-admin/client.ts that resolves an Organisation without a
 * session-derived orgId; it is narrow (Organisation only, matched only by
 * Stripe-controlled ids), not a general escape hatch.
 */
export async function findOrganisationByStripeId(params: {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}) {
  const clauses: Prisma.OrganisationWhereInput[] = [];
  if (params.stripeCustomerId) clauses.push({ stripeCustomerId: params.stripeCustomerId });
  if (params.stripeSubscriptionId) clauses.push({ stripeSubscriptionId: params.stripeSubscriptionId });
  if (clauses.length === 0) {
    throw new Error(
      "findOrganisationByStripeId requires a stripeCustomerId or stripeSubscriptionId"
    );
  }
  return rawPrisma.organisation.findFirst({ where: { OR: clauses } });
}

/**
 * System-level Organisation billing-field update by id, paired with
 * findOrganisationByStripeId() above. Only ever called from the verified
 * Stripe webhook path (src/server/billing/webhook.ts) with an id resolved
 * server-side — never with a client- or session-supplied id.
 */
export async function systemUpdateOrganisationBilling(
  organisationId: string,
  data: Pick<
    Prisma.OrganisationUpdateInput,
    "subscriptionTier" | "billingStatus" | "stripeCustomerId" | "stripeSubscriptionId"
  >
) {
  return rawPrisma.organisation.update({ where: { id: organisationId }, data });
}
