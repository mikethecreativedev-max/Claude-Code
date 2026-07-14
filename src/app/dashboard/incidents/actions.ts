"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireModulePermission } from "@/server/rbac/permissions";
import { assertOwnedEntity } from "@/server/governance/tagging";
import { saveAttachmentFile, createAttachmentRecord } from "@/server/governance/attachments";
import {
  CreateIncidentSchema,
  EditIncidentSchema,
  CloseIncidentSchema,
  TagIncidentRegClauseSchema,
  TagIncidentCQCKeyQuestionSchema,
  TagIncidentSixPillarSchema,
} from "@/server/incidents/schemas";
import * as incidentService from "@/server/incidents/service";

// Every action below follows the mandatory chain: requireModulePermission
// (requireAuth -> RBAC; org check is implicit since orgId is taken only
// from the verified session) BEFORE any data is touched. closeIncidentAction
// requires the "approve" level per the hard rules ("an incident CLOSED
// after investigation" is an approve-level action, not a plain edit).

function parseFollowUpActions(raw: FormDataEntryValue | null): unknown {
  if (!raw) return [];
  try {
    return JSON.parse(String(raw));
  } catch {
    throw new Error("Malformed follow-up actions payload");
  }
}

export async function createIncidentAction(formData: FormData) {
  const session = await requireModulePermission("INCIDENTS", "edit");

  const input = CreateIncidentSchema.parse({
    siteId: formData.get("siteId"),
    dateTime: formData.get("dateTime"),
    description: formData.get("description"),
    anonymisationAcknowledged: formData.get("anonymisationAcknowledged") === "on",
    severityGrading: formData.get("severityGrading"),
    psirfClassification: formData.get("psirfClassification"),
    notifiableToCQC: formData.get("notifiableToCQC") === "on",
  });

  const created = await incidentService.createIncident(session, input);
  revalidatePath("/dashboard/incidents");
  redirect(`/dashboard/incidents/${created.id}`);
}

export async function editIncidentAction(formData: FormData) {
  const session = await requireModulePermission("INCIDENTS", "edit");

  const input = EditIncidentSchema.parse({
    id: formData.get("id"),
    dateTime: formData.get("dateTime"),
    description: formData.get("description"),
    severityGrading: formData.get("severityGrading"),
    psirfClassification: formData.get("psirfClassification"),
    notifiableToCQC: formData.get("notifiableToCQC") === "on",
    followUpActions: parseFollowUpActions(formData.get("followUpActions")),
  });

  const updated = await incidentService.editIncident(session, input);
  revalidatePath(`/dashboard/incidents/${input.id}`);
  revalidatePath("/dashboard/incidents");
  redirect(`/dashboard/incidents/${updated.id}`);
}

export async function startInvestigationAction(formData: FormData) {
  const session = await requireModulePermission("INCIDENTS", "edit");
  const id = String(formData.get("id"));
  const updated = await incidentService.startInvestigation(session, id);
  revalidatePath(`/dashboard/incidents/${id}`);
  revalidatePath("/dashboard/incidents");
  redirect(`/dashboard/incidents/${updated.id}`);
}

export async function closeIncidentAction(formData: FormData) {
  const session = await requireModulePermission("INCIDENTS", "approve");
  const input = CloseIncidentSchema.parse({ id: formData.get("id") });
  const updated = await incidentService.closeIncident(session, input);
  revalidatePath(`/dashboard/incidents/${input.id}`);
  revalidatePath("/dashboard/incidents");
  redirect(`/dashboard/incidents/${updated.id}`);
}

export async function voidIncidentAction(formData: FormData) {
  const session = await requireModulePermission("INCIDENTS", "edit");
  const id = String(formData.get("id"));
  await incidentService.voidIncident(session, id);
  revalidatePath("/dashboard/incidents");
  redirect("/dashboard/incidents");
}

export async function tagIncidentRegClauseAction(formData: FormData) {
  const session = await requireModulePermission("INCIDENTS", "edit");
  const input = TagIncidentRegClauseSchema.parse({
    incidentId: formData.get("incidentId"),
    regSubClauseId: formData.get("regSubClauseId"),
  });
  await incidentService.addIncidentRegClauseTag(session, input.incidentId, input.regSubClauseId);
  revalidatePath(`/dashboard/incidents/${input.incidentId}`);
}

export async function removeIncidentRegClauseTagAction(formData: FormData) {
  const session = await requireModulePermission("INCIDENTS", "edit");
  const tagId = String(formData.get("tagId"));
  const incidentId = String(formData.get("incidentId"));
  await incidentService.removeIncidentRegClauseTag(session, tagId);
  revalidatePath(`/dashboard/incidents/${incidentId}`);
}

export async function tagIncidentCQCKeyQuestionAction(formData: FormData) {
  const session = await requireModulePermission("INCIDENTS", "edit");
  const input = TagIncidentCQCKeyQuestionSchema.parse({
    incidentId: formData.get("incidentId"),
    cqcKeyQuestionId: formData.get("cqcKeyQuestionId"),
  });
  await incidentService.addIncidentCQCKeyQuestionTag(
    session,
    input.incidentId,
    input.cqcKeyQuestionId
  );
  revalidatePath(`/dashboard/incidents/${input.incidentId}`);
}

export async function removeIncidentCQCKeyQuestionTagAction(formData: FormData) {
  const session = await requireModulePermission("INCIDENTS", "edit");
  const tagId = String(formData.get("tagId"));
  const incidentId = String(formData.get("incidentId"));
  await incidentService.removeIncidentCQCKeyQuestionTag(session, tagId);
  revalidatePath(`/dashboard/incidents/${incidentId}`);
}

export async function tagIncidentSixPillarAction(formData: FormData) {
  const session = await requireModulePermission("INCIDENTS", "edit");
  const input = TagIncidentSixPillarSchema.parse({
    incidentId: formData.get("incidentId"),
    sixPillarId: formData.get("sixPillarId"),
  });
  await incidentService.addIncidentSixPillarTag(session, input.incidentId, input.sixPillarId);
  revalidatePath(`/dashboard/incidents/${input.incidentId}`);
}

export async function removeIncidentSixPillarTagAction(formData: FormData) {
  const session = await requireModulePermission("INCIDENTS", "edit");
  const tagId = String(formData.get("tagId"));
  const incidentId = String(formData.get("incidentId"));
  await incidentService.removeIncidentSixPillarTag(session, tagId);
  revalidatePath(`/dashboard/incidents/${incidentId}`);
}

export async function uploadIncidentAttachmentAction(formData: FormData) {
  const session = await requireModulePermission("INCIDENTS", "edit");
  const incidentId = String(formData.get("incidentId"));

  await assertOwnedEntity(session.orgId, "INCIDENT", incidentId);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("No file selected");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const { key } = await saveAttachmentFile(session.orgId, "INCIDENT", file.name, bytes);
  await createAttachmentRecord(session.orgId, {
    entityType: "INCIDENT",
    entityId: incidentId,
    s3Key: key,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: bytes.length,
    uploadedById: session.id,
  });

  revalidatePath(`/dashboard/incidents/${incidentId}`);
}
