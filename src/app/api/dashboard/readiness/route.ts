import { NextResponse } from "next/server";

import { UnauthorizedError } from "@/server/auth/session";
import { ForbiddenError } from "@/server/rbac/permissions";
import { submitReadinessQuestionnaire } from "@/server/readiness/actions";

/**
 * Programmatic (curl/API-client) entry point for the same readiness
 * questionnaire submission the /dashboard/readiness form's server action
 * uses. Server actions are invoked over Next.js's own RPC protocol, which
 * makes them impractical to exercise directly from curl for smoke
 * testing — this route calls the exact same
 * `submitReadinessQuestionnaire()` function (auth -> org -> RBAC -> Zod
 * validation -> pure scoring -> scopedDb write), so there is no
 * parallel/duplicated business logic here, only HTTP status mapping.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await submitReadinessQuestionnaire(body);
    return NextResponse.json(result, { status: result.ok ? 201 : 400 });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    throw err;
  }
}
