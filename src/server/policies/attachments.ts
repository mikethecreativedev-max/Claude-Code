import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { scopedDb } from "@/server/db/scoped-client";
import type { SessionUser } from "@/server/auth/session";
import { writeAuditLog } from "@/server/domain/audit-log";
import { attachmentMetaSchema, MAX_ATTACHMENT_BYTES } from "@/server/policies/schema";

/**
 * V1 STUB: local-disk storage instead of a real S3-compatible bucket.
 * BUILD_CHECKLIST.md Phase 4 explicitly allows this for V1 ("you do not
 * need real S3 integration"). Files land under `.uploads/<orgId>/policy/
 * <policyId>/...` at the repo root (gitignored) and the `s3Key` column
 * stores that relative path so swapping in real S3 later only requires
 * changing this module's storage calls — the Attachment row shape and
 * every caller stays the same. Follow-up: replace with actual S3
 * PutObject + presigned GET, keeping `s3Key` as the object key.
 */
const UPLOAD_ROOT = path.resolve(process.cwd(), ".uploads");

export class AttachmentTargetNotFoundError extends Error {
  constructor(policyId: string) {
    super(`Policy "${policyId}" not found in the caller's organisation — refusing to attach file`);
    this.name = "AttachmentTargetNotFoundError";
  }
}

export async function uploadPolicyAttachment(
  session: SessionUser,
  policyId: string,
  file: { fileName: string; mimeType: string; buffer: Buffer }
) {
  const meta = attachmentMetaSchema.parse({
    fileName: file.fileName,
    mimeType: file.mimeType,
    sizeBytes: file.buffer.byteLength,
  });

  const db = scopedDb(session.orgId);

  // Verify the target Policy exists AND belongs to this org before ever
  // touching disk or the database — same discipline as the tag-integrity
  // guard: never trust a client-supplied id without an org-scoped lookup.
  const policy = await db.policy.findFirst({ where: { id: policyId } });
  if (!policy) {
    throw new AttachmentTargetNotFoundError(policyId);
  }

  const dir = path.join(UPLOAD_ROOT, session.orgId, "policy", policyId);
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
      entityType: "POLICY",
      entityId: policyId,
      s3Key,
      fileName: meta.fileName,
      mimeType: meta.mimeType,
      sizeBytes: meta.sizeBytes,
      uploadedById: session.id,
    },
  });

  await writeAuditLog(db, {
    entityType: "POLICY",
    entityId: policyId,
    userId: session.id,
    action: "UPDATE",
    beforeSnapshot: null,
    afterSnapshot: { attachmentUploaded: attachment.fileName, attachmentId: attachment.id },
  });

  return attachment;
}

/**
 * Treats the most-recently-uploaded Attachment for a policy (version) as
 * its "file_attachment", per prisma/schema.prisma's Policy model comment.
 * Re-verifies the Policy belongs to orgId first — same read-side
 * discipline as tag-integrity.ts's assertTaggableEntityVisibleToOrg,
 * applied here to Attachment instead of the taxonomy tags.
 */
export async function getCurrentPolicyAttachment(orgId: string, policyId: string) {
  const db = scopedDb(orgId);
  const policy = await db.policy.findFirst({ where: { id: policyId } });
  if (!policy) return null;

  return db.attachment.findFirst({
    where: { entityType: "POLICY", entityId: policyId },
    orderBy: { uploadedAt: "desc" },
  });
}

export { MAX_ATTACHMENT_BYTES };
