"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { acknowledgeNotice, createNotice } from "@/server/modules/notices";
import { requireModulePermission } from "@/server/rbac/permissions";

export async function createNoticeAction(formData: FormData) {
  const session = await requireModulePermission("NOTICES", "edit");
  const siteId = String(formData.get("siteId") ?? "");
  await createNotice(session, {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    noticeType: String(formData.get("noticeType") ?? "INTERNAL_ANNOUNCEMENT") as
      | "INTERNAL_ANNOUNCEMENT"
      | "REGULATORY_UPDATE"
      | "POLICY_CHANGE_ALERT",
    audience: String(formData.get("audience") ?? "ALL_STAFF") as
      | "ALL_STAFF"
      | "MANAGERS_ONLY"
      | "SPECIFIC_SITE",
    siteId: siteId || undefined,
    acknowledgementRequired: formData.get("acknowledgementRequired") === "on",
  });
  revalidatePath("/dashboard/notices");
  redirect("/dashboard/notices");
}

export async function acknowledgeNoticeAction(formData: FormData) {
  const session = await requireModulePermission("NOTICES", "view");
  const noticeId = String(formData.get("noticeId") ?? "");
  await acknowledgeNotice(session, noticeId);
  revalidatePath("/dashboard/notices");
  revalidatePath(`/dashboard/notices/${noticeId}`);
}
