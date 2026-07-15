"use server";

import { revalidatePath } from "next/cache";

import { createTrainingRecord } from "@/server/modules/training";
import { requireModulePermission } from "@/server/rbac/permissions";

export async function createTrainingRecordAction(formData: FormData) {
  const session = await requireModulePermission("TRAINING", "edit");
  const expiry = String(formData.get("expiryDate") ?? "");
  await createTrainingRecord(session, {
    siteId: String(formData.get("siteId") ?? ""),
    userId: String(formData.get("userId") ?? ""),
    courseName: String(formData.get("courseName") ?? ""),
    completionDate: new Date(String(formData.get("completionDate") ?? "")),
    expiryDate: expiry ? new Date(expiry) : undefined,
  });
  revalidatePath("/dashboard/training");
  revalidatePath("/dashboard/calendar");
}
