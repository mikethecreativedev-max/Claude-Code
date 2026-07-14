"use server";

import { revalidatePath } from "next/cache";

import { inviteUser, changeUserRole, disableUser, reactivateUser } from "@/server/admin/users";

export async function inviteUserAction(formData: FormData) {
  await inviteUser({
    email: formData.get("email"),
    name: formData.get("name"),
    role: formData.get("role"),
  });
  revalidatePath("/dashboard/admin/users");
}

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
