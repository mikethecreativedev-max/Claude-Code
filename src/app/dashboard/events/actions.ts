"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createEvent,
  tagEvent,
  updateEvent,
  uploadEventAttachment,
} from "@/server/modules/events";
import { requireModulePermission } from "@/server/rbac/permissions";

export async function createEventAction(formData: FormData) {
  const session = await requireModulePermission("EVENTS", "edit");
  await createEvent(session, {
    siteId: String(formData.get("siteId") ?? ""),
    eventType: String(formData.get("eventType") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    dateTime: new Date(String(formData.get("dateTime") ?? "")),
    status: (String(formData.get("status") ?? "OPEN") as "OPEN" | "CLOSED") ?? "OPEN",
  });
  revalidatePath("/dashboard/events");
  redirect("/dashboard/events");
}

export async function updateEventAction(formData: FormData) {
  const session = await requireModulePermission("EVENTS", "edit");
  const id = String(formData.get("id") ?? "");
  await updateEvent(session, id, {
    eventType: String(formData.get("eventType") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    dateTime: new Date(String(formData.get("dateTime") ?? "")),
    status: String(formData.get("status") ?? "OPEN") as "OPEN" | "CLOSED",
  });
  revalidatePath("/dashboard/events");
  revalidatePath(`/dashboard/events/${id}`);
  redirect(`/dashboard/events/${id}`);
}

export async function tagEventAction(formData: FormData) {
  const session = await requireModulePermission("EVENTS", "edit");
  const eventId = String(formData.get("eventId") ?? "");
  await tagEvent(session, eventId, String(formData.get("regSubClauseId") ?? ""));
  revalidatePath(`/dashboard/events/${eventId}`);
}

export async function addEventAttachmentAction(formData: FormData) {
  const session = await requireModulePermission("EVENTS", "edit");
  const eventId = String(formData.get("eventId") ?? "");
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    await uploadEventAttachment(session, eventId, file);
  }
  revalidatePath(`/dashboard/events/${eventId}`);
}
