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
