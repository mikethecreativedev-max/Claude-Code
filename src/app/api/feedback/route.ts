import { NextResponse } from "next/server";

import {
  createFeedback,
  createFeedbackSchema,
  listFeedback,
  requireFeedbackViewSession,
} from "@/server/modules/feedback";
import { requireModulePermission } from "@/server/rbac/permissions";
import { toErrorResponse } from "@/server/http/error-response";

export async function GET() {
  try {
    const session = await requireFeedbackViewSession();
    const items = await listFeedback(session);
    return NextResponse.json({ items });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireModulePermission("FEEDBACK_COMPLAINTS", "edit");
    const body = await req.json();
    const input = createFeedbackSchema.parse(body);
    const created = await createFeedback(session, input);
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
