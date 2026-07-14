import { NextResponse } from "next/server";

import { exportOrgData } from "@/server/data-protection/dpa";
import { ForbiddenError } from "@/server/rbac/permissions";
import { UnauthorizedError } from "@/server/auth/session";

export async function GET() {
  try {
    const result = await exportOrgData();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
}
