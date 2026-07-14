import { scopedDb } from "@/server/db/scoped-client";

/**
 * The entity types this phase (Audits + Incidents) owns and is therefore
 * responsible for closing the tagging-integrity gap for. Deliberately a
 * plain string-literal union (not TaggableEntityType/AttachableEntityType
 * directly) so this one check can be reused for both the tag tables
 * (RegClauseTag/CQCKeyQuestionTag/SixPillarTag, whose entityType column is
 * TaggableEntityType) and Attachment (whose entityType column is the
 * broader AttachableEntityType) without fighting TypeScript over two
 * differently-named Prisma enums that happen to share these two string
 * values.
 */
export type OwnedEntityType = "AUDIT" | "INCIDENT";

export class EntityNotOwnedError extends Error {
  constructor(entityType: OwnedEntityType, entityId: string) {
    super(
      `No ${entityType} with id "${entityId}" exists in the caller's organisation — refusing to tag/attach against it.`
    );
    this.name = "EntityNotOwnedError";
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TENANT-ISOLATION GAP THIS FUNCTION CLOSES
 * ═══════════════════════════════════════════════════════════════════════
 * See prisma/schema.prisma's header comment on RegClauseTag /
 * CQCKeyQuestionTag / SixPillarTag (and Attachment, same pattern): these
 * tables are polymorphic — `entityType` + `entityId` as plain strings, no
 * DB-level FK to the target row, because Prisma cannot express a FK
 * against a variable target model. The FK from e.g. RegClauseTag.orgId ->
 * Organisation only proves the ORG exists; it does NOT prove the tagged
 * Audit/Incident (entityId) actually belongs to that org. Nothing at the
 * database level stops Org A from inserting a tag row with
 * entityType=AUDIT, entityId=<Org B's audit id>, orgId=<Org A's id>.
 *
 * THE FIX HAS TWO HALVES — both are required, neither alone is sufficient:
 *
 * 1. WRITE-TIME (this function, called from src/server/audits/service.ts
 *    and src/server/incidents/service.ts before every tag/attachment
 *    insert): verify the target entityId exists AND belongs to the
 *    caller's orgId by querying it through scopedDb(orgId) — which is
 *    already tenant-scoped, so if entityId belongs to a different org the
 *    scoped findUnique returns null and we reject the write outright.
 *
 * 2. READ-TIME (see listAuditTags / listIncidentTags in the respective
 *    service files): write-time verification only guards inserts that go
 *    through THIS function. A bug elsewhere — a raw SQL fix, a future
 *    migration, a different code path that forgets to call this — could
 *    still insert a mismatched tag row directly. If a "show tags for
 *    audit X" read blindly trusted tag rows filtered by entityId=X
 *    without re-checking that X still belongs to session.orgId, a
 *    mismatched tag would leak cross-org information (confirming the
 *    existence of, and the regulatory-clause mapping for, another org's
 *    record). So every tag-listing read path calls verifyOwnedEntity
 *    again before returning any tag data, and returns empty rather than
 *    the tag rows if ownership doesn't check out — never trusting the tag
 *    row's own entityId/entityType as proof of anything.
 *
 * Tested in tests/phase4a-audits-incidents.test.ts:
 *   - write-time: Org A's tag-creation call is rejected when targeting
 *     Org B's Audit id (normal application path, through this function).
 *   - read-time: a mismatched tag is inserted directly via rawPrisma
 *     (bypassing this function entirely, simulating "a bug elsewhere"),
 *     and the read path is proven to still return nothing for it.
 */
export async function verifyOwnedEntity(
  orgId: string,
  entityType: OwnedEntityType,
  entityId: string
): Promise<boolean> {
  if (entityType === "AUDIT") {
    const audit = await scopedDb(orgId).audit.findUnique({ where: { id: entityId } });
    return audit !== null;
  }
  const incident = await scopedDb(orgId).incident.findUnique({ where: { id: entityId } });
  return incident !== null;
}

export async function assertOwnedEntity(
  orgId: string,
  entityType: OwnedEntityType,
  entityId: string
): Promise<void> {
  const ok = await verifyOwnedEntity(orgId, entityType, entityId);
  if (!ok) {
    throw new EntityNotOwnedError(entityType, entityId);
  }
}
