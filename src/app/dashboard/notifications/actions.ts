"use server";

import { revalidatePath } from "next/cache";

import { markNotificationRead, requireAuthenticatedUser } from "@/server/modules/notifications";

export async function markNotificationReadAction(formData: FormData) {
  const session = await requireAuthenticatedUser();
  const id = String(formData.get("id") ?? "");
  await markNotificationRead(session, id);
  revalidatePath("/dashboard/notifications");
}
