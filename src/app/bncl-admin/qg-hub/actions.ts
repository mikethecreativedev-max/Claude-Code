"use server";

import { revalidatePath } from "next/cache";

import {
  createQGHubContent,
  deleteQGHubContent,
  publishQGHubContent,
  unpublishQGHubContent,
} from "@/server/bncl-admin/client";

export async function createQGHubContentAction(formData: FormData) {
  await createQGHubContent({
    title: formData.get("title"),
    category: formData.get("category"),
    contentType: formData.get("contentType"),
    body: formData.get("body") || undefined,
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
