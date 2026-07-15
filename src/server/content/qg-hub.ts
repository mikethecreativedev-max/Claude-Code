import { rawPrisma } from "@/server/db/prisma";
import type { SessionUser } from "@/server/auth/session";

/**
 * READ-ONLY client-facing access to Q&G Hub content.
 *
 * QGHubContent carries no `orgId` column (see prisma/schema.prisma) — it is
 * global reference content, identical for every tenant, and is therefore
 * NOT in scoped-client.ts's TENANT_MODELS set. Reading it via `rawPrisma`
 * directly here is the one narrow, documented exception to "all tenant
 * data access goes through scopedDb()" — it isn't tenant data at all. This
 * file is allowlisted in scripts/check-tenant-isolation-imports.js for
 * exactly this reason.
 *
 * This module is READ-ONLY by design and must stay that way: all
 * QGHubContent writes (create/update/publish) go exclusively through
 * src/server/bncl-admin/client.ts, which requires the BNCL_ADMIN role.
 * Non-admin viewers only ever see PUBLISHED content through the functions
 * below; a BNCL_ADMIN viewing this same client-facing surface can also see
 * DRAFT content (useful for previewing before publish).
 */

export async function listQGHubContentForViewer(session: SessionUser) {
  if (session.role === "BNCL_ADMIN") {
    return rawPrisma.qGHubContent.findMany({ orderBy: { updatedAt: "desc" } });
  }
  return rawPrisma.qGHubContent.findMany({
    where: { publishStatus: "PUBLISHED" },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getQGHubContentForViewer(session: SessionUser, id: string) {
  const content = await rawPrisma.qGHubContent.findUnique({ where: { id } });
  if (!content) return null;
  if (content.publishStatus !== "PUBLISHED" && session.role !== "BNCL_ADMIN") {
    // Deliberately indistinguishable from "not found" — a non-admin
    // guessing a draft content id must not learn it exists.
    return null;
  }
  return content;
}
