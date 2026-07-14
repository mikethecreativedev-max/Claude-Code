import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getInviteDetails, acceptInvite, InviteTokenInvalidError } from "@/server/onboarding/invite";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid") ?? "";
  const token = searchParams.get("token") ?? "";

  try {
    const details = await getInviteDetails(uid, token);
    return NextResponse.json(details);
  } catch (err) {
    if (err instanceof InviteTokenInvalidError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[invites/accept GET] unexpected error", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
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
    const result = await acceptInvite(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed", issues: err.flatten() }, { status: 400 });
    }
    if (err instanceof InviteTokenInvalidError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[invites/accept POST] unexpected error", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
