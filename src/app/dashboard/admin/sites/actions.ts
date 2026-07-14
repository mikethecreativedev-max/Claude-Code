"use server";

import { revalidatePath } from "next/cache";

import { createSite, updateSite } from "@/server/admin/sites";

export async function createSiteAction(formData: FormData) {
  const activities = String(formData.get("registeredActivities") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await createSite({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    registeredActivities: activities,
    cqcLocationId: formData.get("cqcLocationId") || undefined,
  });
  revalidatePath("/dashboard/admin/sites");
}

export async function updateSiteAction(formData: FormData) {
  await updateSite({
    siteId: formData.get("siteId"),
    name: formData.get("name") || undefined,
    address: formData.get("address") || undefined,
  });
  revalidatePath("/dashboard/admin/sites");
}
