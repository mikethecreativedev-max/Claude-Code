"use server";

import { revalidatePath } from "next/cache";

import { createManualCalendarTask } from "@/server/modules/calendar";
import { requireModulePermission } from "@/server/rbac/permissions";

export async function createManualCalendarTaskAction(formData: FormData) {
  const session = await requireModulePermission("CALENDAR", "edit");
  const assignedToId = String(formData.get("assignedToId") ?? "");
  await createManualCalendarTask(session, {
    siteId: String(formData.get("siteId") ?? ""),
    title: String(formData.get("title") ?? ""),
    dueDate: new Date(String(formData.get("dueDate") ?? "")),
    assignedToId: assignedToId || undefined,
  });
  revalidatePath("/dashboard/calendar");
}
