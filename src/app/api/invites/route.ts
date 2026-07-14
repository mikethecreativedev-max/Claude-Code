import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { inviteUser, listOrgUsers, EmailAlreadyInUseError } from "@/server/onboarding/invite";
import { UnauthorizedError } from "@/server/auth/session";
import { ForbiddenError } from "@/server/rbac/permissions";

function handleError(err: unknown) {
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Validation failed", issues: err.flatten() }, { status: 400 });
  }
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof EmailAlreadyInUseError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  console.error("[invites] unexpected error", err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export async function GET() {
  try {
    const users = await listOrgUsers();
    return NextResponse.json({ users });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await inviteUser(body);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
