import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import type { AttachableEntityType } from "@prisma/client";

import { scopedDb } from "@/server/db/scoped-client";

/**
 * V1 attachment storage: minimal local-disk stub, NOT real S3 integration.
 *
 * BUILD_CHECKLIST.md / the schema's Attachment model both describe an
 * S3-compatible bucket (see .env.example S3_* vars, wired for Phase 7
 * billing/infra work). For this phase, the important part is that the
 * Attachment row's data shape and org-scoping are correct — not the
 * storage backend. Real S3 wiring (presigned uploads, s3Key referencing an
 * actual object) is a follow-up; this writes the uploaded bytes to a
 * gitignored `./uploads/<orgId>/<entityType>/<random>-<fileName>` path on
 * local disk and stores that relative path in `s3Key`, so the data shape
 * (s3Key/fileName/mimeType/sizeBytes) matches what real S3 wiring will
 * populate later without a schema change.
 */
const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

export async function saveAttachmentFile(
  orgId: string,
  entityType: AttachableEntityType,
  fileName: string,
  bytes: Buffer
): Promise<{ key: string }> {
  const dir = path.join(UPLOAD_ROOT, orgId, entityType);
  await mkdir(dir, { recursive: true });
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${orgId}/${entityType}/${randomUUID()}-${safeName}`;
  await writeFile(path.join(UPLOAD_ROOT, key), bytes);
  return { key };
}

export async function createAttachmentRecord(
  orgId: string,
  params: {
    entityType: AttachableEntityType;
    entityId: string;
    s3Key: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedById: string;
  }
) {
  // orgId is included explicitly to satisfy Prisma's generated
  // AttachmentCreateInput type (orgId has no @default, so it's required in
  // the type) — scopedDb's create-time injection would overwrite it with
  // this exact value regardless (see src/server/db/scoped-client.ts).
  return scopedDb(orgId).attachment.create({ data: { ...params, orgId } });
}

export async function listAttachments(
  orgId: string,
  entityType: AttachableEntityType,
  entityId: string
) {
  return scopedDb(orgId).attachment.findMany({
    where: { entityType, entityId },
    orderBy: { uploadedAt: "desc" },
  });
}
