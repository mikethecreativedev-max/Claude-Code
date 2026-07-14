import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { UnauthorizedError, OrgMismatchError } from "@/server/auth/session";
import { ForbiddenError } from "@/server/rbac/permissions";

/**
 * Maps a thrown error from a route handler to an HTTP response. Every
 * Phase 5 API route funnels its catch block through this so the
 * auth -> org -> RBAC error types produce the right status codes
 * consistently (401 / 403 / 400 / 404), without leaking internals.
 */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof OrgMismatchError) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Validation failed", issues: err.issues }, { status: 400 });
  }
  if (err instanceof Error && /not found/i.test(err.message)) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
  if (err instanceof Error) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}
