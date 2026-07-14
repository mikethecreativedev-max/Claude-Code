import type { TaggableEntityType } from "@prisma/client";

import { scopedDb } from "@/server/db/scoped-client";
import type { SessionUser } from "@/server/auth/session";

/**
 * ─────────────────────────────────────────────────────────────────────
 * TAGGING INTEGRITY GAP — closed here (see prisma/schema.prisma header
 * comment and BUILD_CHECKLIST.md Phase 4).
 * ─────────────────────────────────────────────────────────────────────
 * RegClauseTag / CQCKeyQuestionTag / SixPillarTag are polymorphic
 * (entityType + entityId as plain strings, no DB-level FK) because Prisma
 * cannot express a FK against a variable target model. scopedDb() DOES
 * enforce that a tag row's own `orgId` matches the caller's org — but
 * nothing stops a bug (or malicious input) from inserting a tag with the
 * CALLER's orgId that nonetheless points its `entityId` at a RiskEntry or
 * Policy belonging to a DIFFERENT org. That's the actual gap: the tag row
 * itself passes tenant scoping, but the thing it references doesn't.
 *
 * This module owns only the entity types Phase 4b (Risk Register +
 * Policies) is responsible for. Audits/Incidents/Events/FeedbackComplaint
 * tagging belongs to the other Phase 4 agent's module — do not extend
 * this union here; that would require coordinating the merge.
 */
export type OwnedTaggableEntityType = Extract<TaggableEntityType, "RISK_ENTRY" | "POLICY">;

export class TaggedEntityNotFoundError extends Error {
  constructor(entityType: OwnedTaggableEntityType, entityId: string) {
    super(
      `${entityType} "${entityId}" does not exist or does not belong to the caller's organisation — refusing to create/read tag`
    );
    this.name = "TaggedEntityNotFoundError";
  }
}

/**
 * Looks up the tagged entity THROUGH scopedDb(orgId) — i.e. via the same
 * org-scoping machinery as every other query in this codebase — so the
 * only way this returns non-null is if the row genuinely belongs to
 * orgId. Shared by both the write-side guard and the read-side
 * double-check below.
 */
async function tagTargetExistsInOrg(
  orgId: string,
  entityType: OwnedTaggableEntityType,
  entityId: string
): Promise<boolean> {
  const db = scopedDb(orgId);
  const record =
    entityType === "RISK_ENTRY"
      ? await db.riskEntry.findUnique({ where: { id: entityId } })
      : await db.policy.findUnique({ where: { id: entityId } });
  return record !== null;
}

/**
 * WRITE-SIDE GUARD. Call before creating any RegClauseTag / CQCKeyQuestionTag
 * / SixPillarTag row. Throws if `entityId` doesn't resolve to a row owned
 * by `orgId` — this is what stops Org A from tagging Org B's RiskEntry or
 * Policy, since a spoofed/foreign entityId will simply not be found under
 * Org A's scope.
 */
export async function assertTaggableEntityBelongsToOrg(
  orgId: string,
  entityType: OwnedTaggableEntityType,
  entityId: string
): Promise<void> {
  const exists = await tagTargetExistsInOrg(orgId, entityType, entityId);
  if (!exists) {
    throw new TaggedEntityNotFoundError(entityType, entityId);
  }
}

/**
 * READ-SIDE DOUBLE-CHECK. Even if a mismatched tag row somehow made it
 * into the database (e.g. a bug elsewhere, or — as simulated in
 * tests/phase4b-risks-policies.test.ts — a direct rawPrisma insert that
 * bypasses this module entirely), the "show tags for record X" read path
 * must NEVER treat the mere existence of tag rows as proof that record X
 * belongs to the caller's org. Every read of tags for an entity MUST call
 * this first and refuse to return anything if it fails — do not just
 * trust the tag rows returned by scopedDb(orgId).regClauseTag.findMany(),
 * because that query only proves the TAG's own orgId matches, not that
 * its entityId does.
 */
export async function assertTaggableEntityVisibleToOrg(
  orgId: string,
  entityType: OwnedTaggableEntityType,
  entityId: string
): Promise<boolean> {
  return tagTargetExistsInOrg(orgId, entityType, entityId);
}

export type TaxonomyKind = "REG_CLAUSE" | "CQC_KEY_QUESTION" | "SIX_PILLAR";

export async function createTag(
  session: SessionUser,
  params: {
    entityType: OwnedTaggableEntityType;
    entityId: string;
    taxonomy: TaxonomyKind;
    taxonomyId: string;
  }
) {
  // The integrity check MUST happen before the insert, using the same
  // orgId the insert itself will use — never trust that entityId is
  // already known-good just because the caller is authenticated.
  await assertTaggableEntityBelongsToOrg(session.orgId, params.entityType, params.entityId);

  const db = scopedDb(session.orgId);
  // orgId is explicit in each data object below purely to satisfy Prisma's
  // generated UncheckedCreateInput type (a required scalar column) —
  // scopedDb's tenant-scope extension unconditionally overwrites this with
  // the caller's real session-derived orgId at runtime regardless of what
  // is passed here (see scoped-client.ts's `data: { ...data, orgId }`), so
  // this can never be used to spoof another org. The actual integrity
  // guard against a foreign entityId is assertTaggableEntityBelongsToOrg
  // above, not this field.
  switch (params.taxonomy) {
    case "REG_CLAUSE":
      return db.regClauseTag.create({
        data: {
          orgId: session.orgId,
          entityType: params.entityType,
          entityId: params.entityId,
          regSubClauseId: params.taxonomyId,
          taggedById: session.id,
        },
      });
    case "CQC_KEY_QUESTION":
      return db.cQCKeyQuestionTag.create({
        data: {
          orgId: session.orgId,
          entityType: params.entityType,
          entityId: params.entityId,
          cqcKeyQuestionId: params.taxonomyId,
          taggedById: session.id,
        },
      });
    case "SIX_PILLAR":
      return db.sixPillarTag.create({
        data: {
          orgId: session.orgId,
          entityType: params.entityType,
          entityId: params.entityId,
          sixPillarId: params.taxonomyId,
          taggedById: session.id,
        },
      });
  }
}

export async function getTagsForEntity(
  orgId: string,
  entityType: OwnedTaggableEntityType,
  entityId: string
) {
  // Read-side double-check — see assertTaggableEntityVisibleToOrg's
  // docstring. If the entity itself isn't visible to this org, return an
  // empty result regardless of what tag rows might otherwise match.
  const visible = await assertTaggableEntityVisibleToOrg(orgId, entityType, entityId);
  if (!visible) {
    return { regClauseTags: [], cqcKeyQuestionTags: [], sixPillarTags: [] };
  }

  const db = scopedDb(orgId);
  const [regClauseTags, cqcKeyQuestionTags, sixPillarTags] = await Promise.all([
    db.regClauseTag.findMany({
      where: { entityType, entityId },
      include: { regSubClause: true },
      orderBy: { taggedAt: "desc" },
    }),
    db.cQCKeyQuestionTag.findMany({
      where: { entityType, entityId },
      include: { cqcKeyQuestion: true },
      orderBy: { taggedAt: "desc" },
    }),
    db.sixPillarTag.findMany({
      where: { entityType, entityId },
      include: { sixPillar: true },
      orderBy: { taggedAt: "desc" },
    }),
  ]);

  return { regClauseTags, cqcKeyQuestionTags, sixPillarTags };
}
