"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createFeedback, updateFeedback } from "@/server/modules/feedback";
import { requireModulePermission } from "@/server/rbac/permissions";

export async function createFeedbackAction(formData: FormData) {
  const session = await requireModulePermission("FEEDBACK_COMPLAINTS", "edit");
  const outcome = String(formData.get("outcome") ?? "");
  await createFeedback(session, {
    siteId: String(formData.get("siteId") ?? ""),
    source: String(formData.get("source") ?? "") as "PATIENT" | "STAFF",
    category: String(formData.get("category") ?? ""),
    description: String(formData.get("description") ?? ""),
    outcome: outcome || undefined,
  });
  revalidatePath("/dashboard/feedback");
  redirect("/dashboard/feedback");
}

export async function updateFeedbackAction(formData: FormData) {
  const session = await requireModulePermission("FEEDBACK_COMPLAINTS", "edit");
  const id = String(formData.get("id") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  await updateFeedback(session, id, {
    category: String(formData.get("category") ?? ""),
    description: String(formData.get("description") ?? ""),
    outcome: outcome || undefined,
    status: String(formData.get("status") ?? "OPEN") as
      | "OPEN"
      | "IN_PROGRESS"
      | "RESOLVED"
      | "CLOSED",
  });
  revalidatePath("/dashboard/feedback");
  revalidatePath(`/dashboard/feedback/${id}`);
  redirect("/dashboard/feedback");
}
