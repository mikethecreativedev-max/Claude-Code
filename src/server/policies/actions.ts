"use server";

import { redirect } from "next/navigation";

import { requireModulePermission } from "@/server/rbac/permissions";
import { activatePolicy, createPolicy, editPolicy, voidPolicy } from "@/server/policies/service";
import { uploadPolicyAttachment } from "@/server/policies/attachments";
import { createTag, type OwnedTaggableEntityType, type TaxonomyKind } from "@/server/domain/tag-integrity";
import type { PolicyStatus } from "@prisma/client";

function parsePolicyFormData(formData: FormData) {
  return {
    siteId: formData.get("siteId"),
    title: formData.get("title"),
    reviewDate: formData.get("reviewDate"),
    status: formData.get("status") ?? "ACTIVE",
  };
}

export async function createPolicyAction(formData: FormData) {
  const session = await requireModulePermission("POLICIES", "edit");
  const created = await createPolicy(session, parsePolicyFormData(formData));
  redirect(`/dashboard/policies/${created.id}`);
}

export async function editPolicyAction(id: string, formData: FormData) {
  const session = await requireModulePermission("POLICIES", "edit");
  const updated = await editPolicy(session, id, parsePolicyFormData(formData));
  redirect(`/dashboard/policies/${updated.id}`);
}

export async function activatePolicyAction(id: string, formData: FormData) {
  const session = await requireModulePermission("POLICIES", "approve");
  const newStatus = formData.get("status") as PolicyStatus;
  const updated = await activatePolicy(session, id, newStatus);
  redirect(`/dashboard/policies/${updated.id}`);
}

export async function voidPolicyAction(id: string) {
  const session = await requireModulePermission("POLICIES", "edit");
  await voidPolicy(session, id);
  redirect("/dashboard/policies");
}

export async function tagPolicyAction(id: string, formData: FormData) {
  const session = await requireModulePermission("POLICIES", "edit");
  const taxonomy = formData.get("taxonomy") as TaxonomyKind;
  const taxonomyId = formData.get("taxonomyId") as string;
  const entityType: OwnedTaggableEntityType = "POLICY";
  await createTag(session, { entityType, entityId: id, taxonomy, taxonomyId });
  redirect(`/dashboard/policies/${id}`);
}

export async function uploadPolicyAttachmentAction(id: string, formData: FormData) {
  const session = await requireModulePermission("POLICIES", "edit");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/dashboard/policies/${id}`);
    return;
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadPolicyAttachment(session, id, {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    buffer,
  });
  redirect(`/dashboard/policies/${id}`);
}
