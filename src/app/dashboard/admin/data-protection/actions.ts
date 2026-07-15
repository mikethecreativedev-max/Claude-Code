"use server";

import { revalidatePath } from "next/cache";

import { updateRetentionPolicy } from "@/server/data-protection/dpa";

export async function updateRetentionAction(formData: FormData) {
  const raw = formData.get("retentionPolicyMonths");
  await updateRetentionPolicy({ retentionPolicyMonths: Number(raw) });
  revalidatePath("/dashboard/admin/data-protection");
}
