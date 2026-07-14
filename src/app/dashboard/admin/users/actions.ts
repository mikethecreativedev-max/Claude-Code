"use server";

import { revalidatePath } from "next/cache";

import { changeUserRole, disableUser, reactivateUser } from "@/server/admin/users";

// Inviting a new user goes through the token-based flow in
// src/server/onboarding/invite.ts (POST /api/invites, rendered by
// <InviteForm> on this page) — this file only manages existing users.

export async function changeUserRoleAction(formData: FormData) {
  await changeUserRole({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  revalidatePath("/dashboard/admin/users");
}

export async function disableUserAction(formData: FormData) {
  await disableUser({ userId: formData.get("userId") });
  revalidatePath("/dashboard/admin/users");
}

export async function reactivateUserAction(formData: FormData) {
  await reactivateUser({ userId: formData.get("userId") });
  revalidatePath("/dashboard/admin/users");
}
