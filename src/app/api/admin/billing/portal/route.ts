import { NextResponse } from "next/server";

import { createPortalSessionForOrg, OwnerOnlyActionError } from "@/server/billing/checkout";
import { ForbiddenError } from "@/server/rbac/permissions";
import { UnauthorizedError } from "@/server/auth/session";

export async function POST() {
  try {
    const url = await createPortalSessionForOrg();
    return NextResponse.redirect(url, { status: 303 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError || err instanceof OwnerOnlyActionError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}
