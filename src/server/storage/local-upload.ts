import { mkdir, writeFile } from "fs/promises";
import path from "path";

/**
 * DEVIATION (documented in BUILD_CHECKLIST.md Phase 5): the real S3-
 * compatible object storage integration is Phase 4's territory (Attachment
 * uploads for Audits/Incidents/RiskEntries/Policies) and no S3_* env vars
 * are configured in this environment. Events attachments in Phase 5 need
 * *something* real to exercise (not just a metadata stub), so this module
 * writes to a local, gitignored `.uploads/` directory using the exact same
 * shape (`s3Key`, `fileName`, `mimeType`, `sizeBytes`) the Attachment model
 * expects. Swapping this for a real S3 client later is a drop-in change —
 * only this file needs to change, callers are unaffected.
 */

const UPLOAD_ROOT = path.join(process.cwd(), ".uploads");

export type StoredFileMetadata = {
  s3Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export async function saveLocalUpload(
  orgId: string,
  entityType: string,
  entityId: string,
  file: File
): Promise<StoredFileMetadata> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "upload.bin";
  const key = `${orgId}/${entityType}/${entityId}/${Date.now()}-${safeName}`;
  const fullPath = path.join(UPLOAD_ROOT, key);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, buffer);
  return {
    s3Key: key,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: buffer.length,
  };
}
