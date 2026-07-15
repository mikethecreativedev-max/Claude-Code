"use server";

import { redirect } from "next/navigation";

import { requireModulePermission } from "@/server/rbac/permissions";
import {
  approveRiskEntry,
  createRiskEntry,
  editRiskEntry,
  voidRiskEntry,
} from "@/server/risks/service";
import { uploadRiskEntryAttachment } from "@/server/risks/attachments";
import { createTag, type OwnedTaggableEntityType, type TaxonomyKind } from "@/server/domain/tag-integrity";
import type { RiskStatus } from "@prisma/client";

/**
 * Every action below follows the mandatory chain: requireModulePermission
 * (which internally does requireAuth then the RBAC check) -> the service
 * layer, which itself only ever touches data via scopedDb(session.orgId)
 * — never a client-supplied orgId. Approve-level actions require the
 * 'approve' permission level, not just 'edit', per BUILD_CHECKLIST.md.
 */

function parseMitigationActionsFromFormData(formData: FormData) {
  const descriptions = formData.getAll("mitigation_description") as string[];
  const ownerIds = formData.getAll("mitigation_ownerId") as string[];
  const dueDates = formData.getAll("mitigation_dueDate") as string[];
  const statuses = formData.getAll("mitigation_status") as string[];
  const completedDates = formData.getAll("mitigation_completedDate") as string[];

  const actions = [];
  for (let i = 0; i < descriptions.length; i++) {
    if (!descriptions[i]?.trim()) continue; // skip blank rows from the UI
    actions.push({
      description: descriptions[i],
      ownerId: ownerIds[i] ?? "",
      dueDate: dueDates[i] ?? "",
      status: statuses[i] ?? "OPEN",
      completedDate: completedDates[i]?.trim() ? completedDates[i] : null,
    });
  }
  return actions;
}

function parseRiskEntryFormData(formData: FormData) {
  return {
    siteId: formData.get("siteId"),
    title: formData.get("title"),
    description: formData.get("description"),
    likelihood: formData.get("likelihood"),
    impact: formData.get("impact"),
    // Deliberately forwarded even though the server will ignore it — this
    // is what lets tests/manual curl prove spoofing gets overwritten.
    riskRating: formData.get("riskRating") ?? undefined,
    ownerId: formData.get("ownerId"),
    reviewDate: formData.get("reviewDate"),
    status: formData.get("status") ?? "OPEN",
    mitigationActions: parseMitigationActionsFromFormData(formData),
  };
}

export async function createRiskEntryAction(formData: FormData) {
  const session = await requireModulePermission("RISK_REGISTER", "edit");
  const created = await createRiskEntry(session, parseRiskEntryFormData(formData));
  redirect(`/dashboard/risks/${created.id}`);
}

export async function editRiskEntryAction(id: string, formData: FormData) {
  const session = await requireModulePermission("RISK_REGISTER", "edit");
  const updated = await editRiskEntry(session, id, parseRiskEntryFormData(formData));
  redirect(`/dashboard/risks/${updated.id}`);
}

export async function approveRiskEntryAction(id: string, formData: FormData) {
  const session = await requireModulePermission("RISK_REGISTER", "approve");
  const newStatus = formData.get("status") as RiskStatus;
  const updated = await approveRiskEntry(session, id, newStatus);
  redirect(`/dashboard/risks/${updated.id}`);
}

export async function voidRiskEntryAction(id: string) {
  const session = await requireModulePermission("RISK_REGISTER", "edit");
  await voidRiskEntry(session, id);
  redirect("/dashboard/risks");
}

export async function tagRiskEntryAction(id: string, formData: FormData) {
  const session = await requireModulePermission("RISK_REGISTER", "edit");
  const taxonomy = formData.get("taxonomy") as TaxonomyKind;
  const taxonomyId = formData.get("taxonomyId") as string;
  const entityType: OwnedTaggableEntityType = "RISK_ENTRY";
  await createTag(session, { entityType, entityId: id, taxonomy, taxonomyId });
  redirect(`/dashboard/risks/${id}`);
}

export async function uploadRiskEntryAttachmentAction(id: string, formData: FormData) {
  const session = await requireModulePermission("RISK_REGISTER", "edit");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/dashboard/risks/${id}`);
    return;
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadRiskEntryAttachment(session, id, {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    buffer,
  });
  redirect(`/dashboard/risks/${id}`);
}
