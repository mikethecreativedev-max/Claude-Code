"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireModulePermission } from "@/server/rbac/permissions";
import { assertOwnedEntity } from "@/server/governance/tagging";
import { saveAttachmentFile, createAttachmentRecord } from "@/server/governance/attachments";
import {
  CreateAuditSchema,
  EditAuditSchema,
  CompleteAuditSchema,
  VoidAuditSchema,
  TagAuditRegClauseSchema,
  TagAuditCQCKeyQuestionSchema,
} from "@/server/audits/schemas";
import * as auditService from "@/server/audits/service";

// Every action below follows the mandatory chain: requireModulePermission
// (which internally runs requireAuth -> RBAC; "org check" is implicit
// because orgId is taken only from the verified session, never client
// input) BEFORE any data is touched. Approve-level actions
// (completeAuditAction) require the "approve" level, not "edit".

function parseFollowUpActions(raw: FormDataEntryValue | null): unknown {
  if (!raw) return [];
  try {
    return JSON.parse(String(raw));
  } catch {
    throw new Error("Malformed follow-up actions payload");
  }
}

export async function createAuditAction(formData: FormData) {
  const session = await requireModulePermission("AUDITS", "edit");

  const input = CreateAuditSchema.parse({
    siteId: formData.get("siteId"),
    type: formData.get("type"),
    scheduledDate: formData.get("scheduledDate"),
    sixPillarId: formData.get("sixPillarId") || null,
  });

  const created = await auditService.createAudit(session, input);
  revalidatePath("/dashboard/audits");
  redirect(`/dashboard/audits/${created.id}`);
}

export async function editAuditAction(formData: FormData) {
  const session = await requireModulePermission("AUDITS", "edit");

  const input = EditAuditSchema.parse({
    id: formData.get("id"),
    type: formData.get("type"),
    scheduledDate: formData.get("scheduledDate"),
    sixPillarId: formData.get("sixPillarId") || null,
    resultScore: formData.get("resultScore") || null,
    followUpActions: parseFollowUpActions(formData.get("followUpActions")),
  });

  const updated = await auditService.editAudit(session, input);
  revalidatePath(`/dashboard/audits/${input.id}`);
  revalidatePath("/dashboard/audits");
  redirect(`/dashboard/audits/${updated.id}`);
}

export async function completeAuditAction(formData: FormData) {
  const session = await requireModulePermission("AUDITS", "approve");

  const input = CompleteAuditSchema.parse({
    id: formData.get("id"),
    resultScore: formData.get("resultScore") || null,
  });

  const updated = await auditService.completeAudit(session, input);
  revalidatePath(`/dashboard/audits/${input.id}`);
  revalidatePath("/dashboard/audits");
  redirect(`/dashboard/audits/${updated.id}`);
}

export async function voidAuditAction(formData: FormData) {
  const session = await requireModulePermission("AUDITS", "edit");
  const input = VoidAuditSchema.parse({ id: formData.get("id") });
  await auditService.voidAudit(session, input.id);
  revalidatePath("/dashboard/audits");
  redirect("/dashboard/audits");
}

export async function tagAuditRegClauseAction(formData: FormData) {
  const session = await requireModulePermission("AUDITS", "edit");
  const input = TagAuditRegClauseSchema.parse({
    auditId: formData.get("auditId"),
    regSubClauseId: formData.get("regSubClauseId"),
  });
  await auditService.addAuditRegClauseTag(session, input.auditId, input.regSubClauseId);
  revalidatePath(`/dashboard/audits/${input.auditId}`);
}

export async function removeAuditRegClauseTagAction(formData: FormData) {
  const session = await requireModulePermission("AUDITS", "edit");
  const tagId = String(formData.get("tagId"));
  const auditId = String(formData.get("auditId"));
  await auditService.removeAuditRegClauseTag(session, tagId);
  revalidatePath(`/dashboard/audits/${auditId}`);
}

export async function tagAuditCQCKeyQuestionAction(formData: FormData) {
  const session = await requireModulePermission("AUDITS", "edit");
  const input = TagAuditCQCKeyQuestionSchema.parse({
    auditId: formData.get("auditId"),
    cqcKeyQuestionId: formData.get("cqcKeyQuestionId"),
  });
  await auditService.addAuditCQCKeyQuestionTag(session, input.auditId, input.cqcKeyQuestionId);
  revalidatePath(`/dashboard/audits/${input.auditId}`);
}

export async function removeAuditCQCKeyQuestionTagAction(formData: FormData) {
  const session = await requireModulePermission("AUDITS", "edit");
  const tagId = String(formData.get("tagId"));
  const auditId = String(formData.get("auditId"));
  await auditService.removeAuditCQCKeyQuestionTag(session, tagId);
  revalidatePath(`/dashboard/audits/${auditId}`);
}

export async function uploadAuditAttachmentAction(formData: FormData) {
  const session = await requireModulePermission("AUDITS", "edit");
  const auditId = String(formData.get("auditId"));

  // Write-time ownership check — same integrity gap as tag rows (see
  // src/server/governance/tagging.ts): Attachment is polymorphic too, so
  // we must confirm auditId belongs to this org before ever writing an
  // Attachment row against it.
  await assertOwnedEntity(session.orgId, "AUDIT", auditId);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("No file selected");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const { key } = await saveAttachmentFile(session.orgId, "AUDIT", file.name, bytes);
  await createAttachmentRecord(session.orgId, {
    entityType: "AUDIT",
    entityId: auditId,
    s3Key: key,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: bytes.length,
    uploadedById: session.id,
  });

  revalidatePath(`/dashboard/audits/${auditId}`);
}
