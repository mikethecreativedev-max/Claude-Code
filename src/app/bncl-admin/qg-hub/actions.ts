"use server";

import { revalidatePath } from "next/cache";

import {
  createQGHubContent,
  deleteQGHubContent,
  publishQGHubContent,
  requireBnclAdmin,
  unpublishQGHubContent,
} from "@/server/bncl-admin/client";

export async function createQGHubContentAction(formData: FormData) {
  // createQGHubContent takes the session explicitly (see the header
  // comment in src/server/bncl-admin/client.ts) — fetch it here since a
  // server action has no session object in hand otherwise.
  const session = await requireBnclAdmin();
  await createQGHubContent(session, {
    title: String(formData.get("title") ?? ""),
    category: String(formData.get("category") ?? ""),
    contentType: formData.get("contentType") as "ARTICLE" | "LESSON",
    publishStatus: "DRAFT",
    body: (formData.get("body") as string) || undefined,
  });
  revalidatePath("/bncl-admin/qg-hub");
}

export async function publishQGHubContentAction(formData: FormData) {
  await publishQGHubContent(String(formData.get("id")));
  revalidatePath("/bncl-admin/qg-hub");
}

export async function unpublishQGHubContentAction(formData: FormData) {
  await unpublishQGHubContent(String(formData.get("id")));
  revalidatePath("/bncl-admin/qg-hub");
}

export async function deleteQGHubContentAction(formData: FormData) {
  await deleteQGHubContent(String(formData.get("id")));
  revalidatePath("/bncl-admin/qg-hub");
}
