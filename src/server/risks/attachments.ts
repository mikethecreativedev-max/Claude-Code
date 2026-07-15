import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { scopedDb } from "@/server/db/scoped-client";
import type { SessionUser } from "@/server/auth/session";
import { writeAuditLog } from "@/server/domain/audit-log";
import { attachmentMetaSchema, MAX_ATTACHMENT_BYTES } from "@/server/policies/schema";

/**
 * V1 STUB: local-disk storage instead of a real S3-compatible bucket, same
 * rationale/follow-up note as src/server/policies/attachments.ts (which
 * this module mirrors). `AttachableEntityType` includes RISK_ENTRY (see
 * prisma/schema.prisma), and BUILD_CHECKLIST.md Phase 4 requires
 * attachments "for each of Audits, Incidents, Risk Register, Policies" —
 * unlike Policy (one "current file" per version), a RiskEntry can
 * reasonably carry several pieces of supporting evidence (photos,
 * incident-review documents, etc.), so this lists ALL attachments for a
 * risk entry rather than treating only the most recent as canonical.
 */
const UPLOAD_ROOT = path.resolve(process.cwd(), ".uploads");

export class RiskAttachmentTargetNotFoundError extends Error {
  constructor(riskEntryId: string) {
    super(
      `RiskEntry "${riskEntryId}" not found in the caller's organisation — refusing to attach file`
    );
    this.name = "RiskAttachmentTargetNotFoundError";
  }
}

export async function uploadRiskEntryAttachment(
  session: SessionUser,
  riskEntryId: string,
  file: { fileName: string; mimeType: string; buffer: Buffer }
) {
  const meta = attachmentMetaSchema.parse({
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.buffer.byteLength,
  });

  const db = scopedDb(session.orgId);

  // Verify the target RiskEntry exists AND belongs to this org before ever
  // touching disk or the database — same discipline as the tag-integrity
  // guard and policies/attachments.ts: never trust a client-supplied id
  // without an org-scoped lookup.
  const risk = await db.riskEntry.findFirst({ where: { id: riskEntryId } });
  if (!risk) {
    throw new RiskAttachmentTargetNotFoundError(riskEntryId);
  }

  const dir = path.join(UPLOAD_ROOT, session.orgId, "risk-entry", riskEntryId);
  await mkdir(dir, { recursive: true });
  const storedName = `${Date.now()}-${randomUUID()}-${meta.fileName}`;
  const fullPath = path.join(dir, storedName);
  await writeFile(fullPath, file.buffer);

  const s3Key = path.relative(UPLOAD_ROOT, fullPath);

  const attachment = await db.attachment.create({
    data: {
      // orgId is explicit here purely to satisfy Prisma's generated
      // UncheckedCreateInput type (a required scalar column) — scopedDb's
      // tenant-scope extension unconditionally overwrites this with the
      // caller's real session-derived orgId at runtime regardless of what
      // is passed here, so this can never be used to spoof another org.
      orgId: session.orgId,
      entityType: "RISK_ENTRY",
      entityId: riskEntryId,
      s3Key,
      fileName: meta.fileName,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      uploadedById: session.id,
    },
  });

  await writeAuditLog(db, {
    entityType: "RISK_ENTRY",
    entityId: riskEntryId,
    userId: session.id,
    action: "UPDATE",
    beforeSnapshot: null,
    afterSnapshot: { attachmentUploaded: attachment.fileName, attachmentId: attachment.id },
  });

  return attachment;
}

/**
 * Re-verifies the RiskEntry belongs to orgId first — same read-side
 * discipline as tag-integrity.ts's assertTaggableEntityVisibleToOrg and
 * policies/attachments.ts's getCurrentPolicyAttachment, applied here to
 * Attachment for RiskEntry.
 */
export async function listRiskEntryAttachments(orgId: string, riskEntryId: string) {
  const db = scopedDb(orgId);
  const risk = await db.riskEntry.findFirst({ where: { id: riskEntryId } });
  if (!risk) return [];

  return db.attachment.findMany({
    where: { entityType: "RISK_ENTRY", entityId: riskEntryId },
    orderBy: { uploadedAt: "desc" },
  });
}

export { MAX_ATTACHMENT_BYTES };
