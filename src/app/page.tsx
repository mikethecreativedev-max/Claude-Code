import { redirect } from "next/navigation";

import { requireAuth, UnauthorizedError } from "@/server/auth/session";

export default async function RootPage() {
  try {
    const session = await requireAuth();
    if (session.role === "BNCL_ADMIN") {
      redirect("/bncl-admin");
    }
    redirect("/dashboard");
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect("/login");
    }
    throw err;
  }
}
