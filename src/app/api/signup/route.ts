import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { signUpOrganisation, EmailAlreadyInUseError } from "@/server/onboarding/signup";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await signUpOrganisation(body);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed", issues: err.flatten() }, { status: 400 });
    }
    if (err instanceof EmailAlreadyInUseError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[signup] unexpected error", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
