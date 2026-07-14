import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { completeSetupWizard } from "@/server/onboarding/setup-wizard";
import { UnauthorizedError } from "@/server/auth/session";
import { ForbiddenError } from "@/server/rbac/permissions";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await completeSetupWizard(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed", issues: err.flatten() }, { status: 400 });
    }
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("[setup-wizard] unexpected error", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
